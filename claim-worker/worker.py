"""Poll claims with status in ('pending','sj_authorized') and process each by the operator
the user attested at filing time (claims.purchasing_operator):

  * skanetrafiken / NULL  -> fill the Skånetrafiken reklamation PDF, upload to the 'claims'
                             Storage bucket, mark 'generated' (the original path).
  * sj                    -> drive SJ's no-login web form headlessly (submit_sj). DRY-RUN by
                             default (screenshot for review, status 'awaiting_sj_authorization');
                             only LIVE-submits when SJ_SUBMIT_LIVE=true AND the claim is
                             user-authorized (status 'sj_authorized'). See submit_sj.py + §8.

Designed to run on a schedule (GitHub Actions). Uses the service-role key, so it bypasses RLS.
"""
import os
import sys
from datetime import datetime, timezone

from supabase import create_client

from fill_template import fill

URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "claims"
# Hard off-switch for any real SJ submission. Default OFF — even an authorized claim only
# dry-runs unless this is explicitly "true" in the environment (CLAUDE.md §8).
SJ_SUBMIT_LIVE = os.environ.get("SJ_SUBMIT_LIVE", "").lower() == "true"
# Same hard off-switch for Hallandstrafiken's web form (no BankID, so it CAN be submitted
# headlessly — which is exactly why the gate matters). Default OFF → dry-run only.
HLT_SUBMIT_LIVE = os.environ.get("HLT_SUBMIT_LIVE", "").lower() == "true"


def operator_of(claim: dict) -> str:
    # NULL purchasing_operator predates the multi-operator work → treat as skanetrafiken.
    return (claim.get("purchasing_operator") or "skanetrafiken").lower()


def load_profile(sb, claim: dict) -> dict:
    profile = (
        sb.table("profiles").select("*").eq("id", claim["user_id"]).single().execute().data
    )
    if not profile:
        raise RuntimeError("no profile row for user")
    return profile


def handle_skanetrafiken(sb, claim: dict) -> None:
    """Original path: fill + sign the reklamation PDF, upload, mark generated."""
    cid = claim["id"]
    profile = load_profile(sb, claim)

    # The form requires a signature. Prefer the path snapshotted on the claim (what the
    # user authorised at filing time); fall back to the current profile. Fail loudly
    # rather than produce an unsigned form.
    sig_path = claim.get("signature_path") or profile.get("signature_path")
    if not sig_path:
        raise RuntimeError("no signature on file — cannot produce a signed form")
    sig_bytes = sb.storage.from_("signatures").download(sig_path)

    pdf_bytes = fill(claim, profile, sig_bytes)
    path = f'{claim["user_id"]}/{cid}.pdf'
    sb.storage.from_(BUCKET).upload(
        path,
        pdf_bytes,
        {"content-type": "application/pdf", "upsert": "true"},
    )
    sb.table("claims").update(
        {
            "status": "generated",
            "pdf_path": path,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None,
        }
    ).eq("id", cid).execute()
    print(f"  {cid}: skanetrafiken -> generated {path}")


def handle_sj(sb, claim: dict) -> None:
    """SJ web-form path. Dry-run unless globally enabled AND this claim is user-authorized."""
    from submit_sj import submit_sj  # lazy: the PDF path never needs Playwright

    cid = claim["id"]
    profile = load_profile(sb, claim)
    live = SJ_SUBMIT_LIVE and claim.get("status") == "sj_authorized"

    result = submit_sj(claim, profile, live=live)

    # Stash the form screenshot in the private bucket for human review (the user's
    # pre-authorization look at what we'd submit / the post-submit confirmation). Store
    # its path in pdf_path so the frontend can show it (same column the PDF path uses).
    shot_path = None
    if result.get("screenshot"):
        shot_path = f'{claim["user_id"]}/{cid}-sj.png'
        sb.storage.from_(BUCKET).upload(
            shot_path,
            result["screenshot"],
            {"content-type": "image/png", "upsert": "true"},
        )

    if result.get("already_claimed"):
        # SJ reports a claim already exists for this booking (the /redan-ansokt/ page).
        sb.table("claims").update(
            {"status": "sj_already_claimed", "error_message": None, "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: sj -> already claimed at SJ")
    elif result.get("error"):
        # SJ rejected the inputs (e.g. no matching journey = wrong booking/email). Record
        # the user-facing message so the UI can prompt them to fix booking_reference/email.
        sb.table("claims").update(
            {"status": "error", "error_message": result.get("message") or result["error"],
             "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: sj -> {result['error']}")
    elif result.get("submitted"):
        sb.table("claims").update(
            {
                "status": "submitted",
                "external_reference": result.get("external_reference"),
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "error_message": None,
                "pdf_path": shot_path,
            }
        ).eq("id", cid).execute()
        print(f"  {cid}: sj -> submitted (ref {result.get('external_reference')})")
    else:
        # Dry-run: hold for the user to review the screenshot and authorize a real submit.
        sb.table("claims").update(
            {"status": "awaiting_sj_authorization", "error_message": None, "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: sj -> dry-run (awaiting authorization)")


def handle_hallandstrafiken(sb, claim: dict) -> None:
    """Hallandstrafiken web-form path (no BankID). Dry-run unless globally enabled AND
    this claim is user-authorized — same review→authorize gate as SJ (§8)."""
    from submit_hallandstrafiken import submit_hallandstrafiken  # lazy: PDF path needs no Playwright

    cid = claim["id"]
    profile = load_profile(sb, claim)
    live = HLT_SUBMIT_LIVE and claim.get("status") == "hlt_authorized"

    result = submit_hallandstrafiken(claim, profile, live=live)

    shot_path = None
    if result.get("screenshot"):
        shot_path = f'{claim["user_id"]}/{cid}-hlt.png'
        sb.storage.from_(BUCKET).upload(
            shot_path, result["screenshot"], {"content-type": "image/png", "upsert": "true"}
        )

    if result.get("error"):
        sb.table("claims").update(
            {"status": "error", "error_message": result.get("message") or result["error"],
             "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: hallandstrafiken -> {result['error']}")
    elif result.get("submitted"):
        sb.table("claims").update(
            {"status": "submitted", "external_reference": result.get("external_reference"),
             "submitted_at": datetime.now(timezone.utc).isoformat(),
             "error_message": None, "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: hallandstrafiken -> submitted (ref {result.get('external_reference')})")
    else:
        # Dry-run: hold for the user to review the screenshot and authorize a real submit.
        sb.table("claims").update(
            {"status": "awaiting_hlt_authorization", "error_message": None, "pdf_path": shot_path}
        ).eq("id", cid).execute()
        print(f"  {cid}: hallandstrafiken -> dry-run (awaiting authorization)")


HANDLERS = {
    "skanetrafiken": handle_skanetrafiken,
    # Öresundståg claims that reach the worker are Skåne/Köpenhamn-origin (non-Skåne origins
    # are routed to their län's own form in the frontend and never create a claims row). The
    # frontend already snapshots them as 'skanetrafiken'; this is a defensive alias.
    "oresundstag": handle_skanetrafiken,
    "sj": handle_sj,
    "hallandstrafiken": handle_hallandstrafiken,
}


def main() -> int:
    sb = create_client(URL, KEY)

    pending = (
        sb.table("claims")
        .select("*")
        .in_("status", ["pending", "sj_authorized", "hlt_authorized"])
        .execute()
        .data
    )
    print(f"Found {len(pending)} claim(s) to process.")

    failures = 0
    for claim in pending:
        cid = claim["id"]
        operator = operator_of(claim)
        handler = HANDLERS.get(operator)
        try:
            if handler is None:
                # A vendor we ingest/evaluate but can't file yet (snalltaget/other). The
                # frontend guardrail should block these from ever reaching 'pending'.
                raise RuntimeError(f"no claim handler for operator '{operator}'")
            handler(sb, claim)
        except Exception as e:  # one bad row must not wedge the batch
            failures += 1
            print(f"  {cid}: ERROR {e}", file=sys.stderr)
            sb.table("claims").update(
                {"status": "error", "error_message": str(e)[:500]}
            ).eq("id", cid).execute()

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

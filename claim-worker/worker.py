"""Poll claims with status='pending', fill a PDF for each, upload to the
'claims' Storage bucket, and mark the row generated. Designed to run on a
schedule (GitHub Actions). Uses the service-role key, so it bypasses RLS.
"""
import os
import sys
from datetime import datetime, timezone

from supabase import create_client

from fill_template import fill

URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "claims"


def main() -> int:
    sb = create_client(URL, KEY)

    pending = sb.table("claims").select("*").eq("status", "pending").execute().data
    print(f"Found {len(pending)} pending claim(s).")

    failures = 0
    for claim in pending:
        cid = claim["id"]
        try:
            profile = (
                sb.table("profiles").select("*").eq("id", claim["user_id"]).single().execute().data
            )
            if not profile:
                raise RuntimeError("no profile row for user")

            # The form requires a signature. Prefer the path snapshotted on the
            # claim (what the user authorised at filing time); fall back to the
            # current profile. Fail loudly rather than produce an unsigned form.
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
            print(f"  {cid}: generated -> {path}")

        except Exception as e:  # one bad row must not wedge the batch
            failures += 1
            print(f"  {cid}: ERROR {e}", file=sys.stderr)
            sb.table("claims").update(
                {"status": "error", "error_message": str(e)[:500]}
            ).eq("id", cid).execute()

    # Non-zero exit if anything failed, so the Actions run shows red.
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

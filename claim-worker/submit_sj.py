"""Headless submission of an SJ delay-compensation claim via SJ's no-login web form
(https://www.sj.se/ersattning-vid-forsening/).

SJ keys the form on the trip's booking/ticket number + an email OR phone — no BankID, so a
server-side headless browser can drive it (unlike Skånetrafiken, which we fill as a PDF).

Selectors below were VALIDATED against the live form on 2026-06-23 (spike_sj.py):
  Page 1  /ersattning-vid-forsening/            #orderOrTicketNumber, #orderSecurity,
                                                submit = button[type=submit] ("Hämta resa")
  branch  -> /valj-resa/        ("Välj resa")   one checkbox per trip + "Fortsätt"
          -> /redan-ansokt/     ("Redan ansökt") booking already claimed — dead end
  Page 3  /tillaggskostnader/   ("Egna utlägg")  optional extra costs; "Hoppa över" to skip
  Page 4+  payout / bank / confirm / final submit — NOT mapped yet (the remaining spike).

────────────────────────────────────────────────────────────────────────────
SAFETY (CLAUDE.md §8). This is the ONLY component that acts on an external site on a user's
behalf, and SJ false claims carry legal exposure. TWO gates must BOTH hold to submit:
  1. env SJ_SUBMIT_LIVE == "true"  — else DRY-RUN: drive to "Välj resa", screenshot, stop.
  2. per-claim authorization        — the worker only live-submits status == "sj_authorized".
Even in live mode this raises at the first unmapped page (payout/confirm), so we can never
half-submit a form we don't fully understand. Finish mapping pages 4+ before relying on live.
────────────────────────────────────────────────────────────────────────────
"""
from browser_utils import FormError, click_when_clear, dismiss_overlays

SJ_FORM_URL = "https://www.sj.se/ersattning-vid-forsening/"

# What the USER sees when SJ's form doesn't behave as mapped (claims.error_message is
# rendered in "Mina ärenden" and emailed by send-claim-outcome). The technical detail
# goes to FormError.detail and the CI log instead — before 2026-09-07 a raw Playwright
# trace went into this column, and out to the user.
SJ_UNEXPECTED = (
    "Vi kunde inte slutföra ansökan hos SJ automatiskt — SJ:s formulär betedde sig "
    "inte som väntat. Din ansökan är INTE inskickad. Du kan försöka igen från "
    "Mina ärenden, eller ansöka direkt på sj.se."
)


def _safe_screenshot(page) -> bytes | None:
    """Audit shot of whatever page we died on. Never let it mask the real error."""
    try:
        return page.screenshot(full_page=True)
    except Exception:
        return None


def _page_message(page, *, limit: int = 600) -> str | None:
    """Pull the visible heading/body text SJ shows on the current step so the exact words
    SJ presents (confirmation, "redan ansökt", a rejection) reach the user. Best-effort:
    prefer the first heading + a following paragraph, fall back to trimmed body text."""
    try:
        parts: list[str] = []
        for sel in ("h1", "h2"):
            loc = page.locator(sel)
            if loc.count() and loc.first.is_visible():
                t = loc.first.inner_text(timeout=2000).strip()
                if t:
                    parts.append(t)
                    break
        # First non-empty paragraph after the heading (the explanatory sentence).
        paras = page.locator("main p, [role=main] p, p")
        for i in range(min(paras.count(), 6)):
            t = paras.nth(i).inner_text(timeout=1500).strip()
            if t and t not in parts and len(t) > 10:
                parts.append(t)
                break
        msg = " — ".join(parts).strip()
        if not msg:
            msg = page.locator("body").inner_text(timeout=2000).strip()
        msg = " ".join(msg.split())  # collapse whitespace
        return msg[:limit] or None
    except Exception:
        return None


def submit_sj(claim: dict, profile: dict, *, live: bool) -> dict:
    """Drive SJ's web form for one claim.

    Returns {"submitted", "already_claimed", "screenshot", "external_reference"}.
    Dry-run (live=False): drive to "Välj resa", screenshot, stop (submitted=False).
    Raises RuntimeError on missing inputs, and FormError on anything the mapped flow
    doesn't recognise — carrying a Swedish user_message, the technical detail, and a
    screenshot of the page we died on (see browser_utils.FormError).
    """
    booking = (claim.get("booking_reference") or "").strip()
    # SJ matches on the email/phone used at PURCHASE. Prefer the per-claim value the user
    # entered in the pop-up (booking_email); fall back to the account profile.
    contact = (claim.get("booking_email") or profile.get("claim_email")
               or profile.get("claim_mobile") or "").strip()
    if not booking:
        raise RuntimeError("SJ claim has no booking_reference — cannot file")
    if not contact:
        raise RuntimeError("no email/phone for the claim — SJ's form requires one")

    from playwright.sync_api import sync_playwright  # lazy: PDF path never needs Playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="sv-SE")
        try:
            return _drive(page, claim, profile, booking, contact, live=live)
        except FormError as e:
            # click_when_clear already named the blocker; make sure the audit shot
            # of that page rides along too.
            if e.screenshot is None:
                e.screenshot = _safe_screenshot(page)
            if e.url is None:
                e.url = getattr(page, "url", None)
            raise
        except Exception as e:
            # Any other surprise (a page SJ has never shown us, a renamed field).
            # Screenshot it: reproducing an operator-side change after the fact is
            # what cost us the diagnosis on 2026-06-27 and again on 2026-09-04.
            raise FormError(SJ_UNEXPECTED, detail=f"{type(e).__name__}: {e}",
                            screenshot=_safe_screenshot(page),
                            url=getattr(page, "url", None)) from e
        finally:
            browser.close()


def _drive(page, claim: dict, profile: dict, booking: str, contact: str, *, live: bool) -> dict:
    """The mapped SJ flow itself. Split out of submit_sj() so every exit — including
    an unexpected one — passes through the screenshot/FormError wrapper above."""
    page.goto(SJ_FORM_URL, wait_until="networkidle", timeout=60000)

    # Consent / notice modals. This USED to look only for OneTrust-shaped
    # banners, which is why both SJ claims ever filed (2026-06-27, 2026-09-04)
    # died on the click below: SJ's is a MuiDialog, nothing matched, and the
    # dialog ate the click. allow_escape is safe here and only here — no field
    # has been filled yet (browser_utils.dismiss_overlays).
    cleared = dismiss_overlays(page, allow_escape=True)
    if cleared:
        print(f"  sj: dismissed overlay(s): {cleared}")

    # Page 1: booking/ticket number + email-or-phone, then "Hämta resa".
    page.fill("#orderOrTicketNumber", booking, timeout=8000)
    page.fill("#orderSecurity", contact, timeout=8000)
    click_when_clear(page, "button[type=submit]", timeout=15000,
                     user_message=SJ_UNEXPECTED)
    page.wait_for_load_state("networkidle", timeout=30000)

    url = page.url
    screenshot = page.screenshot(full_page=True)

    # Branch on the page SJ routed us to.
    if "/redan-ansokt/" in url:
        # Booking already has a claim — nothing to file. Surface SJ's own wording
        # ("Vi har redan fått din ansökan…"); fall back to it if the scrape misses.
        return {"submitted": False, "already_claimed": True, "error": None,
                "message": _page_message(page)
                or "Vi har redan fått din ansökan. Du har redan ansökt om ersättning "
                   "för den här resan. Vi har skickat en bekräftelse via e-post.",
                "screenshot": screenshot, "external_reference": None}
    if "/valj-resa/" not in url:
        # Still on page 1 -> SJ rejected the inputs. SJ's copy has varied — the
        # 2026-06-23 spike saw "Vi hittade ingen matchande resa"; SJ now shows
        # "Vi hittar inte din bokning. Det kan bero på att din resa ännu inte är
        # genomförd eller att du rest med ett annat tågbolag." Match either, and
        # ALWAYS return SJ's own visible text (never our paraphrase).
        body = ""
        try:
            body = page.locator("body").inner_text()
        except Exception:
            pass
        low = body.lower()
        if ("hittar inte din bokning" in low or "ingen matchande resa" in low
                or "hittade ingen" in low):
            return {"submitted": False, "already_claimed": False, "error": "no_match",
                    "message": _page_message(page)
                    or "SJ hittar inte bokningen för de uppgifter du angav.",
                    "screenshot": screenshot, "external_reference": None}
        # Some other interstitial SJ showed (e.g. "ej berättigad till ersättning").
        # Don't guess — return SJ's own visible text so it reaches the user verbatim.
        return {"submitted": False, "already_claimed": False, "error": "sj_rejected",
                "message": _page_message(page)
                or f"SJ kunde inte behandla ansökan ({url}).",
                "screenshot": screenshot, "external_reference": None}

    # Page 2 "Välj resa": dry-run stops here with the screenshot for review.
    if not live:
        return {"submitted": False, "already_claimed": False, "error": None,
                "message": None, "screenshot": screenshot, "external_reference": None}

    # ── LIVE submission path ───────────────────────────────────────────────
    boxes = page.locator("input[type=checkbox]")
    n = boxes.count()
    if n != 1:
        # >1 trip on the booking: we won't guess which one to claim. (TODO: match
        # the claim's journey by date/route once we parse the row text.)
        raise RuntimeError(f"expected exactly 1 selectable journey, found {n}")
    boxes.first.check(timeout=5000)
    click_when_clear(page, "button:has-text('Fortsätt')", timeout=10000,
                     user_message=SJ_UNEXPECTED)
    page.wait_for_load_state("networkidle", timeout=30000)

    # Page 3 "Egna utlägg": skip the optional extra-costs step.
    if "/tillaggskostnader/" in page.url:
        click_when_clear(page, "button:has-text('Hoppa över')", timeout=10000,
                         user_message=SJ_UNEXPECTED)
        page.wait_for_load_state("networkidle", timeout=30000)

    # Page 4 "Personuppgifter" (/kontaktinformation/): contact details + confirm.
    # SJ has NO bank/payout step — refund goes to the original payment method.
    if "/kontaktinformation/" not in page.url:
        raise RuntimeError(f"expected SJ personuppgifter page, got {page.url}")
    page.fill("#name", (profile.get("first_name") or "").strip(), timeout=8000)
    page.fill("#familyName", (profile.get("last_name") or "").strip(), timeout=8000)
    page.fill("#mobilePhoneNumber", (profile.get("claim_mobile") or "").strip(), timeout=8000)
    page.fill("#emailAddress",
              (claim.get("booking_email") or profile.get("claim_email") or "").strip(), timeout=8000)
    page.check("#confirmEnteredData", timeout=8000)

    # FINAL submit — files the claim with SJ. Reached only under both gates (§8).
    click_when_clear(page, "button:has-text('Slutför ansökan')", timeout=10000,
                     user_message=SJ_UNEXPECTED)
    page.wait_for_load_state("networkidle", timeout=30000)
    # The confirmation renders behind an async "Ett ögonblick…" spinner — wait for it
    # to clear before screenshotting, or the audit shot catches only the loader.
    try:
        page.wait_for_function(
            "!/ett \\u00f6gonblick/i.test(document.body.innerText)", timeout=20000
        )
    except Exception:
        pass
    page.wait_for_timeout(1500)
    confirm_shot = page.screenshot(full_page=True)

    # Best-effort case/reference id from the confirmation page. Verified on the first
    # real submission 2026-06-23 that "Slutför ansökan" succeeds; the exact reference
    # format is still UNCONFIRMED (that run screenshotted mid-load). The screenshot is
    # the audit fallback regardless of whether the regex matches.
    # SJ confirmation. Capture two things off the page:
    #  (a) external_reference = SJ's ärendenummer/case id. SJ shows "Ärendenummer:
    #      1-102194544357" (the serviceRequestId shape, confirmed via the public API
    #      2026-06-30). Prefer text after "Ärendenummer", else the 1-XXXXXXXX shape.
    #  (b) partial = "Din ansökan är delvis registrerad!" — the delay claim went through
    #      but receipts/merkostnader didn't ("Ett eller flera kvitton gick inte att
    #      registrera"). We surface that so the user isn't told a flat "done".
    ref = None
    partial = False
    try:
        import re as _re
        body = page.locator("body").inner_text(timeout=5000)
        partial = "delvis registrerad" in body.lower()
        m = _re.search(r"ärendenummer\s*[:\-]?\s*([0-9][0-9\-]{5,})", body, _re.I)
        if not m:
            m = _re.search(r"\b(\d-\d{8,})\b", body)  # SJ serviceRequestId shape
        ref = m.group(1) if m else None
    except Exception:
        pass
    # Capture SJ's confirmation wording ("Din ansökan är registrerad!" / "… delvis …")
    # so the user sees SJ's own done-message, not just our "Inskickad" badge.
    msg = _page_message(page) or (
        "Din ansökan är delvis registrerad hos SJ — kontrollera eventuella merkostnader."
        if partial else "Ansökan är inskickad till SJ.")
    return {"submitted": True, "already_claimed": False, "error": None,
            "partial": partial, "message": msg,
            "screenshot": confirm_shot, "external_reference": ref}

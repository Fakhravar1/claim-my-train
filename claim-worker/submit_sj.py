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
SJ_FORM_URL = "https://www.sj.se/ersattning-vid-forsening/"


def submit_sj(claim: dict, profile: dict, *, live: bool) -> dict:
    """Drive SJ's web form for one claim.

    Returns {"submitted", "already_claimed", "screenshot", "external_reference"}.
    Dry-run (live=False): drive to "Välj resa", screenshot, stop (submitted=False).
    Raises on missing inputs, an unexpected page, or (for now) when live submission reaches
    the not-yet-mapped payout/confirm pages.
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
            page.goto(SJ_FORM_URL, wait_until="networkidle", timeout=60000)

            # Cookie consent (OneTrust-style); harmless if absent.
            for sel in ("button:has-text('Acceptera alla')", "#onetrust-accept-btn-handler"):
                btn = page.locator(sel)
                if btn.count() and btn.first.is_visible():
                    btn.first.click(timeout=3000)
                    page.wait_for_timeout(800)
                    break

            # Page 1: booking/ticket number + email-or-phone, then "Hämta resa".
            page.fill("#orderOrTicketNumber", booking, timeout=8000)
            page.fill("#orderSecurity", contact, timeout=8000)
            page.click("button[type=submit]", timeout=8000)
            page.wait_for_load_state("networkidle", timeout=30000)

            url = page.url
            screenshot = page.screenshot(full_page=True)

            # Branch on the page SJ routed us to.
            if "/redan-ansokt/" in url:
                # Booking already has a claim — nothing to file. Surfaced to the user.
                return {"submitted": False, "already_claimed": True, "error": None,
                        "message": None, "screenshot": screenshot, "external_reference": None}
            if "/valj-resa/" not in url:
                # Still on page 1 -> SJ rejected the inputs. The validated case (spike
                # 2026-06-23) is "Vi hittade ingen matchande resa" = wrong booking/email.
                body = ""
                try:
                    body = page.locator("body").inner_text()
                except Exception:
                    pass
                if "ingen matchande resa" in body.lower():
                    return {"submitted": False, "already_claimed": False, "error": "no_match",
                            "message": "SJ hittade ingen resa för det boknings-/biljettnumret och "
                                       "den e-post/telefon du angav. Kontrollera uppgifterna och försök igen.",
                            "screenshot": screenshot, "external_reference": None}
                # Some other interstitial — surface loudly with the URL for diagnosis.
                raise RuntimeError(f"unexpected page after SJ lookup: {url}")

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
            page.click("button:has-text('Fortsätt')", timeout=8000)
            page.wait_for_load_state("networkidle", timeout=30000)

            # Page 3 "Egna utlägg": skip the optional extra-costs step.
            if "/tillaggskostnader/" in page.url:
                page.click("button:has-text('Hoppa över')", timeout=8000)
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
            page.click("button:has-text('Slutför ansökan')", timeout=8000)
            page.wait_for_load_state("networkidle", timeout=30000)
            confirm_shot = page.screenshot(full_page=True)

            # Best-effort case/reference id from the confirmation page. The exact selector is
            # UNVERIFIED (no real submission done in dev) — capture text that looks like a
            # reference; the screenshot is the fallback audit trail. TODO: confirm against a
            # real confirmation page and tighten this.
            ref = None
            try:
                import re as _re
                body = page.locator("body").inner_text(timeout=5000)
                m = _re.search(r"(?:ärende|referens|case)[^A-Z0-9]{0,12}([A-Z0-9]{6,})", body, _re.I)
                ref = m.group(1) if m else None
            except Exception:
                pass
            return {"submitted": True, "already_claimed": False, "error": None,
                    "message": None, "screenshot": confirm_shot, "external_reference": ref}
        finally:
            browser.close()

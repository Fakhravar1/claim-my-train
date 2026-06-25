"""Headless submission of a Kalmar länstrafik (KLT) resegaranti claim.

Same `respons` ASP.NET vendor as Hallandstrafiken (submit_hallandstrafiken), so the
mechanics are identical (no login/BankID/CAPTCHA, AutoPostBack selects, POSTs to
rgSave.aspx). Kept as its own file because the KLT form differs:
  https://respons.kalmarlanstrafik.se/internet/kltresegarantiv2.aspx
  * NO selComplaintWhere ("Var?") select.
  * PayMethod options are "Värdekod" / "Kontant ersättning" / "...utländsk bank"
    (no Mail/SMS split — so sms+email both map to "Värdekod").
  * selCardType label is "Biljett i app" (not "Hallandstrafikens app").
  * Captures planned arrival (txtToTime) + actual times (txtRealFromTime/ToTime),
    which we DO have from the journey snapshot.
  * PlannedTripWithLine ("Buss-/tåglinje *") is REQUIRED but we don't snapshot the
    line — documented gap (best-effort blank; blocks a clean LIVE submit until we
    add line_name to the claim payload).

Field map VALIDATED against the live form 2026-06-25 (browser recon, NOT submitted).

SAFETY (§8): identical two-gate model — DRY-RUN unless env KLT_SUBMIT_LIVE == "true"
AND the claim is status == "kalmar_authorized". Dry-run fills + screenshots for review.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

KLT_FORM_URL = "https://respons.kalmarlanstrafik.se/internet/kltresegarantiv2.aspx"
STHLM = ZoneInfo("Europe/Stockholm")

# KLT has no Mail/SMS voucher split — both map to the single "Värdekod".
PAY_LABEL = {"bank": "Kontant ersättning", "sms": "Värdekod", "email": "Värdekod"}
DELAY_PHRASE = {"20_39": "20–39 min", "40_59": "40–59 min", "60_119": "60–119 min", "120_plus": "över 2 timmar"}


def _parse_ts(s):
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(STHLM)


def _description(claim: dict, origin_dt) -> str:
    o = claim.get("origin_stop_name") or "okänd"
    d = claim.get("destination_stop_name") or "okänd"
    when = origin_dt.strftime("%Y-%m-%d %H:%M") if origin_dt else str(claim.get("trip_start_date") or "")
    delay = DELAY_PHRASE.get(claim.get("delay_bucket"), "försenad")
    if claim.get("delay_bucket") in DELAY_PHRASE:
        return f"Tåget {o}–{d} den {when} var försenat ({delay}). Jag ansöker om förseningsersättning."
    return f"Tåget {o}–{d} den {when} var inställt/försenat. Jag ansöker om förseningsersättning."


def submit_kalmar(claim: dict, profile: dict, *, live: bool) -> dict:
    """Drive KLT's resegaranti form for one claim.

    Returns {"submitted", "screenshot", "error", "message", "external_reference"}.
    Dry-run (live=False): fill everything we have, screenshot, stop before consent/submit.
    """
    origin_dt = _parse_ts(claim.get("origin_scheduled"))
    dest_sched_dt = _parse_ts(claim.get("destination_scheduled"))
    dest_actual_dt = _parse_ts(claim.get("destination_actual"))
    travel_date = (origin_dt.strftime("%Y-%m-%d") if origin_dt else str(claim.get("trip_start_date") or "")).strip()
    pay_label = PAY_LABEL.get(profile.get("payout_method") or "", "Värdekod")

    if not (profile.get("first_name") and profile.get("claim_email")):
        raise RuntimeError("profile missing name/email — cannot file Kalmar claim")

    from playwright.sync_api import sync_playwright  # lazy: the PDF path never needs Playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="sv-SE")
        try:
            # domcontentloaded (not networkidle): the respons pages keep connections open,
            # so networkidle can time out on the initial load (it did for HLT on CI).
            page.goto(KLT_FORM_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)

            for sel in ("button:has-text('Acceptera alla')", "button:has-text('Godkänn')",
                        "#onetrust-accept-btn-handler"):
                btn = page.locator(sel)
                if btn.count() and btn.first.is_visible():
                    btn.first.click(timeout=3000)
                    page.wait_for_timeout(600)
                    break

            def fill(css, value):
                value = (value or "").strip()
                if not value:
                    return
                loc = page.locator(css)
                if loc.count() and loc.first.is_visible():
                    loc.first.fill(value, timeout=8000)

            def choose(css, label):
                loc = page.locator(css)
                if loc.count():
                    loc.first.select_option(label=label, timeout=8000)
                    page.wait_for_load_state("networkidle", timeout=30000)  # AutoPostBack

            # --- AutoPostBack selects (KLT has no selComplaintWhere) ---
            choose("#selCardType", "Biljett i app")   # best-effort default (ticket gap)
            choose("#Comp_Check", "Biljettens pris")  # "Jag vill ha ersättning för" (required)
            choose("#PayMethod", pay_label)

            # --- Personal ---
            fill("#Forename", profile.get("first_name"))
            fill("#Surname", profile.get("last_name"))
            fill("#StreetAddress", profile.get("street_address"))
            fill("#ZipCode", profile.get("postal_code"))
            fill("#City", profile.get("city"))
            fill("#PhoneNumber", profile.get("claim_mobile"))
            fill("#EmailAddress", profile.get("claim_email"))

            # --- Journey (planned) ---
            fill("#Date1", travel_date)
            fill("#PlannedTripFromStop", claim.get("origin_stop_name"))
            fill("#PlannedTripToStop", claim.get("destination_stop_name"))
            fill("#txtFromTime", origin_dt.strftime("%H:%M") if origin_dt else "")
            fill("#txtToTime", dest_sched_dt.strftime("%H:%M") if dest_sched_dt else "")
            # #PlannedTripWithLine ("Buss-/tåglinje *") is required but we don't snapshot the
            # line — left blank (gap; blocks a clean LIVE submit until line_name is captured).
            fill("#Description", _description(claim, origin_dt))

            # --- Actual times (KLT-specific; we have the realised arrival) ---
            fill("#txtRealToTime", dest_actual_dt.strftime("%H:%M") if dest_actual_dt else "")

            # --- Ticket: the visible "Biljett ID" field's id varies by card type and only
            # renders after the selCardType postback, so fill it by its visible LABEL (robust
            # to the id), with the TravelWith* ids as a fallback. ---
            _ticket = (claim.get("booking_reference") or profile.get("claim_ticket_id") or "").strip()
            if _ticket:
                try:
                    lbl = page.get_by_label("Biljett ID", exact=False)
                    if lbl.count() and lbl.first.is_visible():
                        lbl.first.fill(_ticket, timeout=5000)
                except Exception:
                    pass
                for _t in ("#TravelWithAppID", "#TravelWithControlNumber", "#TravelWithCardTravelPassNumber"):
                    fill(_t, _ticket)

            # --- Payout (Kontant = Swedish bank) ---
            if profile.get("payout_method") == "bank":
                fill("#CompensationToClearingNumber", profile.get("clearing_number"))
                fill("#CompensationToAccountNumber", profile.get("account_number"))
                fill("#CompensationToSocialSecurityNumber", profile.get("claim_personnummer"))

            screenshot = page.screenshot(full_page=True)

            if not live:
                return {"submitted": False, "error": None, "message": None,
                        "screenshot": screenshot, "external_reference": None}

            # ── LIVE submission (both §8 gates held) ──────────────────────────────
            page.check("#delay-compensation-check", timeout=8000)     # consent (required)
            page.click("#btnSubmit", timeout=8000)
            page.wait_for_load_state("networkidle", timeout=30000)
            confirm_shot = page.screenshot(full_page=True)

            ref = None
            try:
                import re as _re
                body = page.locator("body").inner_text(timeout=5000)
                m = _re.search(r"(?:ärende|referens|diarie|nummer)[^A-Z0-9]{0,15}([A-Z0-9]{5,})", body, _re.I)
                ref = m.group(1) if m else None
            except Exception:
                pass
            return {"submitted": True, "error": None, "message": None,
                    "screenshot": confirm_shot, "external_reference": ref}
        finally:
            browser.close()

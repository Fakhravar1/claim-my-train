"""Headless submission of a Hallandstrafiken reklamation / delay-compensation claim.

The form is an embedded ASP.NET WebForms page (no login, no BankID, no CAPTCHA):
  https://respons.hlt.se/internet/HLTreklamationV2.aspx  (POSTs to rgSave.aspx)
so a server-side headless browser can fill AND submit it (unlike SL/Skånetrafiken,
which gate submission behind BankID and need the iOS Shortcut).

Field map VALIDATED against the live form 2026-06-24 (browser recon). Personal +
journey + clearing/account come from the profile + the claim's journey snapshot;
the few operator-specific bits we don't store are the documented gaps below.

AutoPostBack: selComplaintWhere / selCardType / PayMethod each trigger an ASP.NET
server postback that re-renders the page with the dependent fields shown. Playwright's
select_option fires that change, so we select → wait for load → fill the revealed
fields. (A plain JS `change` does NOT trigger the postback — that's why the bank
fields read hidden during recon.)

────────────────────────────────────────────────────────────────────────────
SAFETY (CLAUDE.md §8): TWO gates must BOTH hold to really submit:
  1. env HLT_SUBMIT_LIVE == "true"   — else DRY-RUN: fill, screenshot, stop (never
     ticks the consent box, never clicks Skicka).
  2. per-claim authorization          — only status == "hlt_authorized" submits.
DRY-RUN screenshots the filled form to the 'claims' bucket for the user to review
and authorize first, exactly like submit_sj.

KNOWN DATA GAPS (fine for dry-run; block a clean LIVE submit until resolved):
  * Ticket proof (selCardType + number) — operator-specific; we pass claim_ticket_id
    as a best-effort app id. A Hallandstrafiken filing pop-up should collect this.
  * txtBankName — required for "Kontant ersättning"; we don't store it (derivable from
    the clearing number via a bank lookup — TODO).
────────────────────────────────────────────────────────────────────────────
"""
from datetime import datetime
from zoneinfo import ZoneInfo

HLT_FORM_URL = "https://respons.hlt.se/internet/HLTreklamationV2.aspx"
STHLM = ZoneInfo("Europe/Stockholm")

# payout_method -> Hallandstrafiken PayMethod option label
PAY_LABEL = {"bank": "Kontant ersättning", "sms": "Värdekod SMS", "email": "Värdekod Mail"}
# delay_bucket -> human phrase for the free-text Händelsebeskrivning
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


def submit_hallandstrafiken(claim: dict, profile: dict, *, live: bool) -> dict:
    """Drive Hallandstrafiken's reklamation form for one claim.

    Returns {"submitted", "screenshot", "error", "message", "external_reference"}.
    Dry-run (live=False): fill everything we have, screenshot, stop before consent/submit.
    """
    origin_dt = _parse_ts(claim.get("origin_scheduled"))
    travel_date = (origin_dt.strftime("%Y-%m-%d") if origin_dt else str(claim.get("trip_start_date") or "")).strip()
    pay_label = PAY_LABEL.get(profile.get("payout_method") or "", "Värdekod Mail")

    if not (profile.get("first_name") and profile.get("claim_email")):
        raise RuntimeError("profile missing name/email — cannot file Hallandstrafiken claim")

    from playwright.sync_api import sync_playwright  # lazy: the PDF path never needs Playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="sv-SE")
        try:
            page.goto(HLT_FORM_URL, wait_until="networkidle", timeout=60000)

            # Cookie consent if the embedded page shows one (harmless if absent).
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
                    # AutoPostBack: the select re-renders the page server-side.
                    page.wait_for_load_state("networkidle", timeout=30000)

            # --- AutoPostBack selects first (each reloads + reveals dependent fields) ---
            choose("#selComplaintWhere", "Tåg")
            choose("#selCardType", "Hallandstrafikens app")   # best-effort default (see gaps)
            choose("#PayMethod", pay_label)

            # --- Personal (from the profile) ---
            fill("#Forename", profile.get("first_name"))
            fill("#Surname", profile.get("last_name"))
            fill("#StreetAddress", profile.get("street_address"))
            fill("#ZipCode", profile.get("postal_code"))
            fill("#City", profile.get("city"))
            fill("#PhoneNumber", profile.get("claim_mobile"))
            fill("#EmailAddress", profile.get("claim_email"))

            # --- Journey / incident (from the claim snapshot) ---
            fill("#Date1", travel_date)
            fill("#txtFromTime", origin_dt.strftime("%H:%M") if origin_dt else "")
            fill("#txtPlace", claim.get("origin_stop_name"))          # plats för händelse
            fill("#PlannedTripFromStop", claim.get("origin_stop_name"))
            fill("#PlannedTripToStop", claim.get("destination_stop_name"))
            fill("#Description", _description(claim, origin_dt))

            # --- Ticket: app-id/number the user entered in the filing pop-up
            # (claims.booking_reference), falling back to the generic profile ticket id. ---
            fill("#TravelWithAppID", claim.get("booking_reference") or profile.get("claim_ticket_id"))

            # --- Payout (Kontant = Swedish bank: clearing + account + personnummer) ---
            if profile.get("payout_method") == "bank":
                fill("#CompensationToClearingNumber", profile.get("clearing_number"))
                fill("#CompensationToAccountNumber", profile.get("account_number"))
                fill("#CompensationToSocialSecurityNumber", profile.get("claim_personnummer"))
                # #CompensationToBankName is required by HLT but not stored (gap).

            screenshot = page.screenshot(full_page=True)

            if not live:
                # Hold for human review: the screenshot shows exactly what we'd submit.
                return {"submitted": False, "error": None, "message": None,
                        "screenshot": screenshot, "external_reference": None}

            # ── LIVE submission (both §8 gates held) ──────────────────────────────
            page.check("#delay-compensation-check", timeout=8000)     # consent (required)
            page.click("input[type=submit]", timeout=8000)
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

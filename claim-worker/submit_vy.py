"""Headless submission of a Vy (Vy Tåg) förseningsersättning/reklamation claim.

Vy files on its own Azure-hosted reimbursement portal (NO login / BankID / CAPTCHA), so —
like SJ and Kalmar — we can fill AND submit server-side with Playwright:
  https://prod-reimbursement-swe-web.azurewebsites.net/complaint-ticket/vytag

The form is an Angular + **PrimeNG** 2-step wizard, field map VALIDATED against the live
form 2026-06-25 (browser recon, NOT submitted — §19 standing rule):
  STEP 1 "Bokningsuppgifter/Kontaktuppgifter": bookingNumber + name/surname/streetName/
         postalCode/city/email/phoneNumber (Land defaults to "Sverige"). → "Nästa".
  STEP 2: PrimeNG p-dropdowns
            passengerTypeOfTicket  [Förköpt resa | Ombord köp | Pendlarkort]
            typeOfBooking          [Enkel resa | Tur och retur]
            reason                 [Försening | Avbruten resa | Övrigt]
            typeOfAccount          [Bankkonto | Postgiro/Bankgiro | Utländsktkonto]
          + trainNumber, numberOfPassengers, p-calendar departureDate/arrivalDate (showtime,
            yy-mm-dd HH:mm), filterable station dropdowns (Avresestation/Ankomststation),
            customerStory free text, and (after Bankkonto) clearing + accountNumber.
          Two file inputs (Bifoga biljett/kvitton) are OPTIONAL (required=false) → skipped.
          → "Bekräfta" (final submit).

SAFETY (§8): same two-gate model as SJ/Kalmar — DRY-RUN unless env VY_SUBMIT_LIVE == "true"
AND the claim is status == "vy_authorized". Dry-run fills both steps + screenshots, never
clicks "Bekräfta".

STATION MATCHING (headless-only, with a fail-safe). The Avresestation/Ankomststation fields
are filtered dropdowns over Vy's OWN station list, which may name a stop differently than our
Trafikverket snapshot ("Göteborg C" vs "Göteborg Central"). We filter+pick the best option and
verify it's CLOSE ENOUGH (_close_enough). If either origin or destination can't be matched
confidently we ABORT with error="station_no_match" + a user-facing message (the claim goes to
status='error', shown in "Mina ärenden") rather than file a form with a wrong/blank station.

KNOWN GAPS (before LIVE): ticket type defaults "Förköpt resa" (real type not snapshotted);
bookingNumber = claims.booking_reference (user enters their Vy booking no. at filing).
"""
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

VY_FORM_URL = "https://prod-reimbursement-swe-web.azurewebsites.net/complaint-ticket/vytag"
STHLM = ZoneInfo("Europe/Stockholm")

# Words to drop when comparing a Trafikverket station name to a Vy dropdown option.
_STATION_NOISE = re.compile(r"\b(central|centralstation|station|resecentrum|stn|c)\b")


def _norm_station(s: str) -> str:
    """Normalise a station name for comparison: lowercase, strip accents/punctuation and the
    common 'C'/'Central'/'station' suffixes so 'Göteborg C' ≈ 'Göteborg Central'."""
    s = (s or "").lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = _STATION_NOISE.sub(" ", s)
    s = re.sub(r"[^0-9a-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _close_enough(query: str, option: str) -> bool:
    """True when a Vy dropdown option plausibly IS our station. Conservative: exact core,
    one a prefix of the other, or the shorter's tokens are a subset of the longer's."""
    q, o = _norm_station(query), _norm_station(option)
    if not q or not o:
        return False
    if q == o or q.startswith(o) or o.startswith(q):
        return True
    qs, os_ = set(q.split()), set(o.split())
    short, long = (qs, os_) if len(qs) <= len(os_) else (os_, qs)
    return bool(short) and short.issubset(long)


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
    if claim.get("was_cancelled"):
        return f"Tåget {o}–{d} den {when} var inställt. Jag ansöker om ersättning."
    return f"Tåget {o}–{d} den {when} var försenat. Jag ansöker om förseningsersättning."


def submit_vy(claim: dict, profile: dict, *, live: bool) -> dict:
    """Drive Vy's reimbursement form for one claim.

    Returns {"submitted", "screenshot", "error", "message", "external_reference"}.
    Dry-run (live=False): fill both steps, screenshot, stop before "Bekräfta".
    """
    origin_dt = _parse_ts(claim.get("origin_scheduled"))
    dest_actual_dt = _parse_ts(claim.get("destination_actual"))
    booking = (claim.get("booking_reference") or "").strip()

    if not booking:
        return {"submitted": False, "error": "no_booking", "screenshot": None,
                "message": "Vi behöver ditt Vy-bokningsnummer för att fylla i formuläret.",
                "external_reference": None}
    if not (profile.get("first_name") and profile.get("claim_email")):
        raise RuntimeError("profile missing name/email — cannot file Vy claim")

    from playwright.sync_api import sync_playwright  # lazy: the PDF path never needs Playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="sv-SE")
        try:
            page.goto(VY_FORM_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3500)  # Angular SPA render

            for sel in ("button:has-text('Acceptera')", "button:has-text('Godkänn')",
                        "button:has-text('Tillåt alla')", "#onetrust-accept-btn-handler"):
                b = page.locator(sel)
                if b.count() and b.first.is_visible():
                    b.first.click(timeout=3000)
                    page.wait_for_timeout(500)
                    break

            # All field helpers are BEST-EFFORT: a single finicky/optional field must never
            # wedge the whole claim. In dry-run this guarantees a review screenshot; in live
            # mode a genuinely-missing required field surfaces at "Bekräfta" (form validation).
            def fill_fcn(fcn, value):
                value = (value or "").strip()
                if not value:
                    return
                try:
                    loc = page.locator(f"[formcontrolname='{fcn}']")
                    if loc.count() and loc.first.is_visible():
                        loc.first.fill(value, timeout=5000)
                except Exception:
                    pass

            def pick_dropdown(fcn, want_label):
                """Select an option in a PrimeNG p-dropdown by visible label (exact)."""
                try:
                    dd = page.locator(f"p-dropdown[formcontrolname='{fcn}']")
                    if not dd.count():
                        return
                    dd.first.locator(".p-dropdown").first.click(timeout=5000)
                    page.wait_for_timeout(500)
                    opt = page.locator(".p-dropdown-item", has_text=want_label)
                    if opt.count():
                        opt.first.click(timeout=5000)
                    else:
                        page.keyboard.press("Escape")
                    page.wait_for_timeout(400)
                except Exception:
                    try:
                        page.keyboard.press("Escape")
                    except Exception:
                        pass

            def pick_station(placeholder, station_name):
                """Filterable PrimeNG station dropdown: open, type the core name into the filter,
                and pick the first option ONLY IF it's close enough to our station (_close_enough).
                Returns True on a confident match, False otherwise (no option, or too different) —
                the caller aborts the claim rather than file a wrong/blank station."""
                station_name = (station_name or "").strip()
                if not station_name:
                    return False
                try:
                    dd = page.locator(f"p-dropdown:has(input[placeholder='{placeholder}'])")
                    if not dd.count():
                        return False
                    dd.first.locator(".p-dropdown").first.click(timeout=5000)
                    page.wait_for_timeout(500)
                    filt = page.locator(".p-dropdown-filter")
                    if filt.count() and filt.last.is_visible():
                        filt.last.fill(_norm_station(station_name)[:20], timeout=4000)
                        page.wait_for_timeout(700)
                    opt = page.locator(".p-dropdown-item")
                    if not opt.count():
                        page.keyboard.press("Escape")
                        return False
                    option_text = (opt.first.inner_text(timeout=3000) or "").strip()
                    if _close_enough(station_name, option_text):
                        opt.first.click(timeout=5000)
                        page.wait_for_timeout(400)
                        return True
                    page.keyboard.press("Escape")  # leave it blank — caller will abort
                    page.wait_for_timeout(200)
                    return False
                except Exception:
                    try:
                        page.keyboard.press("Escape")
                    except Exception:
                        pass
                    return False

            def fill_calendar(fcn, dt):
                if not dt:
                    return
                # p-calendar showtime, dateformat yy-mm-dd -> "yyyy-mm-dd HH:mm". Type the value
                # key-by-key (PrimeNG updates its model on keyup, not on a programmatic .fill()),
                # then commit by clicking a neutral spot — NOT Escape, which reverts the input.
                try:
                    inp = page.locator(f"p-calendar[formcontrolname='{fcn}'] input")
                    if inp.count() and inp.first.is_visible():
                        inp.first.click(timeout=5000)
                        inp.first.fill("")
                        inp.first.press_sequentially(dt.strftime("%Y-%m-%d %H:%M"), delay=15, timeout=5000)
                        page.locator("h3, h2, label").first.click(timeout=3000)  # blur to commit
                        page.wait_for_timeout(300)
                except Exception:
                    pass

            # ── STEP 1 — booking + contact ────────────────────────────────────────
            fill_fcn("bookingNumber", booking)
            fill_fcn("name", profile.get("first_name"))
            fill_fcn("surname", profile.get("last_name"))
            fill_fcn("streetName", profile.get("street_address"))
            fill_fcn("postalCode", profile.get("postal_code"))
            fill_fcn("city", profile.get("city"))
            fill_fcn("email", profile.get("claim_email"))
            fill_fcn("phoneNumber", profile.get("claim_mobile"))
            page.wait_for_timeout(300)

            nxt = page.locator("button:has-text('Nästa')")
            nxt.first.click(timeout=8000)
            page.wait_for_timeout(2500)

            # ── STEP 2 — ticket info, journey, reason, free text, bank ────────────
            pick_dropdown("passengerTypeOfTicket", "Förköpt resa")  # default (real type unknown)
            pick_dropdown("typeOfBooking", "Enkel resa")            # one leg = single journey
            fill_fcn("trainNumber", claim.get("service_number"))
            fill_fcn("numberOfPassengers", "1")
            fill_calendar("departureDate", origin_dt)
            fill_calendar("arrivalDate", dest_actual_dt)
            origin_name = claim.get("origin_stop_name")
            dest_name = claim.get("destination_stop_name")
            origin_ok = pick_station("Avresestation", origin_name)
            dest_ok = pick_station("Ankomststation", dest_name)
            pick_dropdown("reason", "Avbruten resa" if claim.get("was_cancelled") else "Försening")
            fill_fcn("customerStory", _description(claim, origin_dt))

            if profile.get("payout_method") == "bank":
                pick_dropdown("typeOfAccount", "Bankkonto")
                # Vy's "Clearing" field takes digits only — strip the conventional "8327-9" dash.
                clearing = "".join(ch for ch in (profile.get("clearing_number") or "") if ch.isdigit())
                fill_fcn("clearing", clearing)
                fill_fcn("accountNumber", profile.get("account_number"))

            screenshot = page.screenshot(full_page=True)

            # Fail-safe: if either station couldn't be matched to Vy's own station list, ABORT
            # rather than file a form with a wrong/blank station. Surface a clear message so the
            # user can file directly with Vy. (Screenshot is kept for debugging context.)
            if not (origin_ok and dest_ok):
                unmatched = [n for n, ok in ((origin_name, origin_ok), (dest_name, dest_ok)) if not ok]
                stations = " och ".join(f'"{s}"' for s in unmatched if s) or "stationen"
                return {
                    "submitted": False, "error": "station_no_match", "screenshot": screenshot,
                    "message": (
                        f"Vi kunde inte matcha {stations} mot Vys stationslista, så vi avbröt för "
                        "säkerhets skull. Ansök direkt hos Vy: "
                        "https://prod-reimbursement-swe-web.azurewebsites.net/complaint-ticket/vytag"
                    ),
                    "external_reference": None,
                }

            if not live:
                return {"submitted": False, "error": None, "message": None,
                        "screenshot": screenshot, "external_reference": None}

            # ── LIVE submission (both §8 gates held) ──────────────────────────────
            page.locator("button:has-text('Bekräfta')").first.click(timeout=8000)
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

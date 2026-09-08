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
import os
import sys

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


# SJ's loader text. Matched case-insensitively; \u00f6 keeps the source ASCII-safe
# inside the JS predicates below.
_LOADER = "ett \\u00f6gonblick"

# The routes page 1 can hand us, and the phrases SJ renders when it answers WITHOUT
# navigating (wrong booking, already claimed, not eligible). One of these appearing is
# what "SJ has answered" means — the mere absence of a loader is not.
_RESULT_PATHS = "valj-resa|redan-ansokt|tillaggskostnader|kontaktinformation"
_RESULT_TEXT = (
    "hittar inte din bokning|ingen matchande resa|hittade ingen|"
    "redan f\\u00e5tt din ans\\u00f6kan|inte ber\\u00e4ttigad|registrerad"
)


def _wait_js(page, predicate: str, timeout: int) -> bool:
    """page.wait_for_function that can't lie and can't explode.

    Two traps, both hit for real on 2026-09-07:
      * An exception INSIDE the predicate aborts the wait instantly — it does not
        retry. `document.body.innerText` throws while the SPA is mid-navigation and
        body is momentarily null, which is why a 25 s wait returned in under a
        second and the claim was reported as a timeout it never actually spent.
      * A false return must mean "keep waiting", so every predicate here is
        null-safe and only ever returns true on a signal we recognise.
    """
    try:
        page.wait_for_function(predicate, timeout=timeout)
        return True
    except Exception:
        return False


def _await_page1_result(page, *, timeout: int = 45000) -> bool:
    """Wait until SJ has actually ANSWERED page 1 (booking lookup), not just stopped
    loading. SJ answers asynchronously behind an "Ett ögonblick…" loader while
    networkidle has already fired, so reading page.url or the body right after the
    click describes the SPINNER, not the verdict — on 2026-09-07 that loading text
    was recorded as SJ's answer on a real claim.

    False = we never saw a recognisable answer. That is NOT a verdict; the caller
    must report it as "could not read SJ's response", never as a rejection.
    """
    return _wait_js(
        page,
        """() => {
          const b = document.body; if (!b) return false;
          const t = b.innerText || "";
          if (/%s/i.test(t)) return false;                 // still loading
          const p = location.pathname || "";
          if (/%s/.test(p)) return true;                   // routed to a real step
          return /%s/i.test(t);                            // answered in place
        }""" % (_LOADER, _RESULT_PATHS, _RESULT_TEXT),
        timeout,
    )


def _await_no_loader(page, *, timeout: int = 20000) -> bool:
    """Wait for the loader to clear on a page we've already routed to (the
    confirmation). Weaker than _await_page1_result on purpose: here we only need the
    spinner gone before scraping the ärendenummer and taking the audit screenshot."""
    return _wait_js(
        page,
        """() => {
          const b = document.body; if (!b) return false;
          return !/%s/i.test(b.innerText || "");
        }""" % _LOADER,
        timeout,
    )


def _await_path(page, pattern: str, *, timeout: int = 30000) -> bool:
    """Wait for the SPA to ROUTE to a step we recognise.

    This replaces wait_for_load_state("networkidle") between steps. SJ's page keeps
    the network busy (analytics, polling, keep-alives), so networkidle can burn its
    entire budget on a page that is already rendered and interactive — on 2026-09-07
    that is exactly what killed a run standing on a fully-loaded
    /tillaggskostnader/. The app's own URL is the honest readiness signal.
    """
    return _wait_js(page, '() => /%s/.test(location.pathname || "")' % pattern, timeout)


def _quiet(page, *, timeout: int = 8000) -> None:
    """Best-effort 'let the network calm down'. NEVER load-bearing: see _await_path."""
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except Exception:
        pass


# Stop before SJ's final button and report what we filled, instead of submitting.
# Set by the workflow's sj_verify_only input; used to confirm a payout fill lands on
# the right fields BEFORE any money is routed anywhere.
VERIFY_ONLY = os.environ.get("SJ_PAYOUT_VERIFY_ONLY", "").lower() == "true"


def _fill_payout(page, profile: dict) -> None:
    """SJ's payout step, /kontouppgifter/ — "Hur vill du få ersättningen?"

    SJ offers SWISH or BANKKONTO, and the step is mandatory: there is no "pay it back
    the way I paid" option, contrary to what CLAUDE.md said until 2026-09-08. We take
    Swish because it is the only branch completable from data we already hold
    (claim_mobile + claim_personnummer); Bankkonto would mean storing bank details,
    which is a separate product and privacy decision.

    Targeted BY LABEL, never by id: this page's ids are React-generated (`_r_i_`) and
    change between builds.

    Refuses rather than guesses when either field is missing. A payout routed to a
    Swish account that isn't the claimant's sends their money to a stranger, so a
    blocked claim is strictly better than a filled-in guess.
    """
    mobile = (profile.get("claim_mobile") or "").strip()
    pnr = (profile.get("claim_personnummer") or "").strip()
    if not mobile or not pnr:
        raise FormError(
            "SJ kräver mobilnummer och personnummer för utbetalning via Swish. "
            "Fyll i dem under Inställningar och försök igen från Mina ärenden.",
            detail=f"payout: missing {'mobile ' if not mobile else ''}"
                   f"{'personnummer' if not pnr else ''}".strip(),
        )

    # Swish appears preselected, but never assume: if its fields aren't there, pick it.
    mob = page.get_by_label("Mobilnummer").first
    if not _visible_soon(mob):
        try:
            page.get_by_text("Swish", exact=True).first.click(timeout=5000)
        except Exception:
            pass
        mob = page.get_by_label("Mobilnummer").first

    # SJ validates this field as "10 eller 12 siffror" — DIGITS, no separator. We store
    # personnummer hyphenated (YYYYMMDD-XXXX), which SJ rejected outright on
    # 2026-09-08: "Kontrollera det svenska personnumret (10 eller 12 siffror)".
    pnr_digits = "".join(c for c in pnr if c.isdigit())
    if len(pnr_digits) not in (10, 12):
        raise FormError(
            "Personnumret i din profil har ett format SJ inte accepterar. Ange det som "
            "10 eller 12 siffror under Inställningar och försök igen.",
            detail=f"payout: personnummer has {len(pnr_digits)} digits, SJ wants 10 or 12",
        )
    # The mobile goes as stored: SJ accepted +46… on 2026-09-08 (its validation summary
    # read "Du behöver åtgärda 1 sak" and named only the personnummer).
    mob.fill(mobile, timeout=8000)
    page.get_by_label("Svenskt personnummer").first.fill(pnr_digits, timeout=8000)

    # Masked read-back: enough to prove the values landed in the right boxes, without
    # putting a personnummer or a full phone number in a CI log.
    try:
        got_m = mob.input_value(timeout=3000)
        got_p = page.get_by_label("Svenskt personnummer").first.input_value(timeout=3000)
        print(f"  sj: payout=swish mobile=…{got_m[-2:]} ({len(got_m)} chars) "
              f"pnr=…{got_p[-2:]} ({len(got_p)} chars, digits-only)", file=sys.stderr)
    except Exception:
        pass


def _visible_soon(locator, timeout: int = 4000) -> bool:
    try:
        locator.wait_for(state="visible", timeout=timeout)
        return True
    except Exception:
        return False


def _describe_controls(page, limit: int = 25) -> list[str]:
    """What choices is this page actually offering?

    Diagnostics for landing on a step the flow does not map. A body snippet tells you
    the heading; this tells you the OPTIONS — which is what decides whether a step can
    be automated at all, or is a decision that belongs to the user (SJ's payout step
    being the case in point).
    """
    try:
        return page.evaluate(
            """(limit) => {
              const out = [];
              const label = (el) => {
                if (el.id) {
                  const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
                  if (l && l.innerText) return l.innerText;
                }
                const w = el.closest('label');
                if (w && w.innerText) return w.innerText;
                return el.getAttribute('aria-label') || el.name || el.value || '';
              };
              const sel = 'input[type=radio], input[type=checkbox], select, button, [role=radio], [role=button]';
              for (const el of document.querySelectorAll(sel)) {
                if (!el.offsetWidth && !el.offsetHeight) continue;
                const tag = el.tagName.toLowerCase();
                const text = (tag === 'button' || el.getAttribute('role') === 'button')
                  ? el.innerText : label(el);
                const line = (tag + (el.type ? ':' + el.type : '') + ' | ' + (text || ''))
                  .replace(/\\s+/g, ' ').trim();
                if (line && !out.includes(line)) out.push(line);
                if (out.length >= limit) break;
              }
              return out;
            }""",
            limit,
        )
    except Exception:
        return []


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
    page.goto(SJ_FORM_URL, wait_until="domcontentloaded", timeout=60000)
    _quiet(page)
    # The field, not the network, is what "page 1 is ready" means.
    page.wait_for_selector("#orderOrTicketNumber", timeout=30000)

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
    _quiet(page)
    settled = _await_page1_result(page)
    page.wait_for_timeout(800)  # let the routed step paint before we read it

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
        if not settled:
            # The loader never cleared, so we have NO answer from SJ — say that,
            # rather than passing a loading state off as a rejection. Retryable:
            # re-filing from Mina ärenden just runs this again.
            return {"submitted": False, "already_claimed": False, "error": "sj_timeout",
                    "message": "SJ:s formulär svarade inte i tid. Din ansökan är INTE "
                               "inskickad — försök igen från Mina ärenden om en stund.",
                    "screenshot": screenshot, "external_reference": None}
        # Whatever SJ showed, put it in the CI log: the audit screenshot lives in a
        # private bucket, and a one-line body snippet is what actually gets read.
        try:
            import sys as _sys
            _body = " ".join((page.locator("body").inner_text(timeout=3000) or "").split())
            print(f"  sj: page-1 did not route (url={url}) body={_body[:300]!r}", file=_sys.stderr)
        except Exception:
            pass
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
    _await_path(page, "tillaggskostnader|kontaktinformation")
    _quiet(page)

    # Page 3 "Egna utlägg": skip the optional extra-costs step.
    if "/tillaggskostnader/" in page.url:
        click_when_clear(page, "button:has-text('Hoppa över')", timeout=10000,
                         user_message=SJ_UNEXPECTED)
        _await_path(page, "kontaktinformation")
        _quiet(page)

    # Page 4 "Personuppgifter" (/kontaktinformation/): contact details, then onward to
    # the payout step. NB both pages carry a button labelled "Slutför ansökan" — that
    # collision is what let the old code mistake "advanced a page" for "filed".
    if "/kontaktinformation/" not in page.url:
        raise RuntimeError(f"expected SJ personuppgifter page, got {page.url}")
    page.wait_for_selector("#name", timeout=20000)
    page.fill("#name", (profile.get("first_name") or "").strip(), timeout=8000)
    page.fill("#familyName", (profile.get("last_name") or "").strip(), timeout=8000)
    page.fill("#mobilePhoneNumber", (profile.get("claim_mobile") or "").strip(), timeout=8000)
    page.fill("#emailAddress",
              (claim.get("booking_email") or profile.get("claim_email") or "").strip(), timeout=8000)
    page.check("#confirmEnteredData", timeout=8000)

    click_when_clear(page, "button:has-text('Slutför ansökan')", timeout=10000,
                     user_message=SJ_UNEXPECTED)
    _quiet(page)

    # Page 5 "Kontouppgifter" (/kontouppgifter/): how SJ should pay. Mandatory.
    if _await_path(page, "kontouppgifter", timeout=20000):
        _fill_payout(page, profile)
        if VERIFY_ONLY:
            return {"submitted": False, "already_claimed": False, "error": "sj_verify_only",
                    "message": "Verifieringskörning: utbetalningsuppgifterna fylldes i, "
                               "men ansökan skickades INTE in.",
                    "screenshot": page.screenshot(full_page=True), "external_reference": None}
        # FINAL submit — THIS is the click that files the claim with SJ (§8).
        click_when_clear(page, "button:has-text('Slutför ansökan')", timeout=10000,
                         user_message=SJ_UNEXPECTED)
        _quiet(page)
    # The confirmation renders behind the same async loader — wait it out, or the
    # audit shot catches only the spinner (and the ärendenummer scrape finds nothing).
    _await_no_loader(page)
    page.wait_for_timeout(1500)
    confirm_shot = page.screenshot(full_page=True)

    # "Slutför ansökan" succeeded once, on 2026-06-23. That is NOT a guarantee it
    # files every time — see the registration check below. The screenshot is the
    # audit fallback either way.
    # SJ confirmation. Capture two things off the page:
    #  (a) external_reference = SJ's ärendenummer/case id. SJ shows "Ärendenummer:
    #      1-102194544357" (the serviceRequestId shape, confirmed via the public API
    #      2026-06-30). Prefer text after "Ärendenummer", else the 1-XXXXXXXX shape.
    #  (b) partial = "Din ansökan är delvis registrerad!" — the delay claim went through
    #      but receipts/merkostnader didn't ("Ett eller flera kvitton gick inte att
    #      registrera"). We surface that so the user isn't told a flat "done".
    ref = None
    partial = False
    body = ""
    try:
        body = page.locator("body").inner_text(timeout=5000)
    except Exception:
        pass

    # ── DO NOT report a submission we cannot see ────────────────────────────────
    # This function used to return submitted=True unconditionally after the click,
    # on the assumption that "Slutför ansökan" always files. On 2026-09-07 it did
    # not: SJ routed to a payout step ("Hur vill du få ersättningen?" / Swish) that
    # our map does not cover, and the claim was marked submitted + the user emailed
    # "inskickad" while SJ's own API still reported NO service request on the
    # booking. Telling someone their compensation claim is filed when it is not is
    # the worst failure this worker can produce — worse than any error — because
    # they stop chasing it and the 60-day deadline runs out.
    #
    # So success now requires SJ to SAY it registered. The reverse risk (SJ rewords
    # its confirmation and we under-report a real submission) is safe: re-filing
    # goes through sj-lookup / the /redan-ansokt/ branch, which both refuse a
    # booking SJ already holds a claim for.
    low = body.lower()
    registered = ("ansökan är registrerad" in low or "delvis registrerad" in low
                  or "ärendenummer" in low)
    if not registered:
        # Report the unmapped step in full to the CI log. The audit screenshot goes to a
        # private bucket, so without this the only way to learn what SJ asked for is to
        # reproduce the whole run — which is what made the payout step expensive to find.
        import sys as _sys
        print(f"  sj: UNMAPPED step url={page.url}", file=_sys.stderr)
        print(f"  sj: body={' '.join((body or '').split())[:1200]!r}", file=_sys.stderr)
        for c in _describe_controls(page):
            print(f"  sj: control | {c}", file=_sys.stderr)
        return {"submitted": False, "already_claimed": False, "error": "sj_incomplete",
                "message": "SJ:s formulär tog oss vidare till ett steg vi inte hanterar "
                           f"automatiskt ({_page_message(page) or page.url}). Din ansökan "
                           "är INTE inskickad — ansök direkt på sj.se med din bokning.",
                "screenshot": confirm_shot, "external_reference": None}

    try:
        import re as _re
        partial = "delvis registrerad" in low
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

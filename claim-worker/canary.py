"""canary.py — daily dry-run canary over the operator claim forms.

Drives each form in DRY-RUN (never submits, never authenticates BankID — CLAUDE.md §19)
and asserts the DOM still matches what our fill scripts / headless workers expect:

  sl_form            — SL gates on BankID at form START; assert the pre-BankID login
                       gate is reachable and mentions BankID (the fill script only ever
                       runs post-BankID on the user's phone, so the gate IS the boundary).
  skanetrafiken_form — the form is FULLY BankID-gated (verified 2026-07-02: entry
                       redirects to #/logga-in with BankID/Freja+/MitID buttons — the
                       earlier steg-1-is-public assumption no longer holds). Assert the
                       login gate renders; the steg-1 ids the fill script targets are
                       only reachable post-BankID on the user's own device.
  vasttrafik_form    — BankID at END: assert the from/to typeahead ids and the
                       label-detected "Dag" select that vasttrafik-fill-script targets.
  sj_form            — page 1 of SJ's no-login form: #orderOrTicketNumber +
                       #orderSecurity + a submit button that is actually CLICKABLE
                       and not covered by a modal (submit_sj.py's entry point).

Results POST to the report-claim-canary edge function (service-role bearer), which
handles breach/recovery emails + the claim_canary_state heartbeat.

CALIBRATION MODE: if SUPABASE_SERVICE_ROLE_KEY is unset, nothing is reported and no
alert can fire — results print to stdout and screenshots land in canary_out/.

Run:  ./venv/Scripts/python.exe canary.py          (calibration if no key in env)
CI:   .github/workflows/claim-canary.yml (daily), uploads canary_out/ as artifact.
"""

from __future__ import annotations

import json
import os
import re
import sys
import traceback
from pathlib import Path

from playwright.sync_api import Page, sync_playwright
from playwright.sync_api import TimeoutError as PWTimeout

from browser_utils import NOT_FOUND, blocking_overlay, dismiss_overlays, overlay_buttons

OUT_DIR = Path(__file__).parent / "canary_out"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_ROLE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
RUN_URL = os.environ.get("CANARY_RUN_URL", "")  # set by the workflow to the Actions run
CALIBRATION = not SERVICE_ROLE

SL_URL = "https://sl.se/kundservice/forseningsersattning/resan"
SKANE_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/"
VT_URL = "https://www.vasttrafik.se/kundservice/forseningsersattning/ansok-om-ersattning/"
SJ_URL = "https://www.sj.se/ersattning-vid-forsening/"  # submit_sj.py SJ_FORM_URL


def dismiss_cookies(pg: Page) -> list[str]:
    """Best-effort banner dismissal — never fail a check over a banner.

    Delegates to browser_utils so the canary clears EXACTLY what submit_sj clears.
    They used to differ (the canary tried five labels, submit_sj two), which is a
    large part of why the canary sailed through the overlay that was killing every
    SJ claim: the canary dismissed SJ's dialog, the worker never could.

    Returns what it dismissed, so a check can report it (see check_sj).
    """
    return dismiss_overlays(pg, allow_escape=True)


def visible_select_labels(pg: Page) -> list[str]:
    """Mirror vasttrafik-fill-script's selLabel(): label[for] or closest form-group label."""
    return pg.evaluate(
        """() => {
          const lab = (el) => {
            let t = "";
            if (el.id) { const l = document.querySelector('label[for="'+el.id+'"]'); if (l) t = l.innerText; }
            if (!t) { const fg = el.closest('[class*="form-group"], [class*="field"], fieldset');
                      if (fg) { const l2 = fg.querySelector('label, legend'); if (l2) t = l2.innerText; } }
            return (t || "").replace(/\\s+/g, " ").trim().toLowerCase();
          };
          return [...document.querySelectorAll("select")]
            .filter((s) => s.offsetWidth || s.offsetHeight)
            .map(lab);
        }"""
    )


def check_sl(pg: Page) -> str:
    """SL: BankID gate at form START. Pass = the pre-BankID gate renders and says so."""
    pg.goto(SL_URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(4000)
    dismiss_cookies(pg)
    pg.wait_for_timeout(1000)
    body = pg.locator("body").inner_text(timeout=10000).lower()
    if "förseningsersättning" not in body and "forseningsersattning" not in pg.url:
        raise AssertionError(f"unexpected page (url={pg.url})")
    if not any(k in body for k in ("bankid", "logga in", "legitimera")):
        raise AssertionError("no BankID/login gate found on entry — flow may have changed")
    return "BankID gate present at form start"


def check_skanetrafiken(pg: Page) -> str:
    """Skånetrafiken: assert the pre-BankID login gate (#/logga-in) renders."""
    pg.goto(SKANE_URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(5000)
    dismiss_cookies(pg)
    pg.wait_for_timeout(2000)
    body = pg.locator("body").inner_text(timeout=10000).lower()
    if "logga-in" not in pg.url and pg.locator("#experiencedDelay").count() > 0:
        # steg-1 became public again — the fill flow still works, but flag it so we
        # notice the flow changed (and can loosen this assertion deliberately).
        raise AssertionError("form no longer BankID-gated at entry — flow changed (steg-1 public)")
    if "bankid" not in body:
        raise AssertionError(f"no BankID login gate found (url={pg.url})")
    return "BankID login gate present at entry (#/logga-in)"


def check_vasttrafik(pg: Page) -> str:
    """Västtrafik: BankID at END; from/to typeahead ids + the 'Dag' select must exist."""
    pg.goto(VT_URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(5000)
    dismiss_cookies(pg)
    pg.wait_for_timeout(2000)
    required = [
        "delay-compensation-trip-leg-selector-from-to-selector-from",
        "delay-compensation-trip-leg-selector-from-to-selector-to",
    ]
    missing = [i for i in required if pg.locator(f"#{i}").count() == 0]
    if missing:
        raise AssertionError(f"typeahead ids missing: {missing} (url={pg.url})")
    labels = visible_select_labels(pg)
    if not any(lbl.startswith("dag") for lbl in labels):
        raise AssertionError(f"no visible select labelled 'Dag' (labels seen: {labels[:10]})")
    return f"typeahead ids + 'Dag' select present (selects: {[l for l in labels if l][:6]})"


def check_sj(pg: Page) -> str:
    """SJ page 1: booking + email fields + submit (submit_sj.py's entry point)."""
    pg.goto(SJ_URL, wait_until="domcontentloaded", timeout=60000)
    # "Page 1 is ready" means the field exists — the same definition, and the same
    # 30 s budget, that submit_sj._drive uses. A fixed 5.5 s sleep made the canary
    # STRICTER than the worker it guards: on 2026-09-12 it reported the ids missing
    # while a re-run four minutes later found them present, so the canary could
    # report drift that would never have failed a real claim. A canary must fail
    # where the worker fails, not sooner.
    try:
        pg.wait_for_selector("#orderOrTicketNumber", timeout=30000)
    except PWTimeout:
        raise AssertionError(
            f"#orderOrTicketNumber absent after 30 s — the wait submit_sj gives it "
            f"(url={pg.url}, overlay buttons: {overlay_buttons(pg)})"
        ) from None
    cleared = dismiss_cookies(pg)
    pg.wait_for_timeout(1500)
    missing = [
        i for i in ("orderOrTicketNumber", "orderSecurity") if pg.locator(f"#{i}").count() == 0
    ]
    if missing:
        raise AssertionError(f"page-1 ids missing: {missing} (url={pg.url})")
    if pg.locator("button[type=submit]").count() == 0:
        raise AssertionError("no submit button on page 1")
    # THE 2026-09-04 BLIND SPOT. Existence is not clickability: on 2026-06-27 and
    # again on 2026-09-04 this button existed, resolved, and was "visible, enabled
    # and stable" — while a MuiDialog on top of it ate the click and killed the
    # claim. This canary was green through all ten weeks of it. Hit-test the actual
    # click point, exactly as click_when_clear does before submitting.
    blocker = blocking_overlay(pg, "button[type=submit]")
    if blocker and blocker != NOT_FOUND:
        raise AssertionError(
            "page-1 submit button is covered — a headless click would time out "
            f"(after dismissing banners, elementFromPoint hits: {blocker}; "
            f"buttons we did not recognise: {overlay_buttons(pg)})"
        )
    # Report what we cleared even on the happy path. A PASS that says nothing
    # cannot distinguish "no consent dialog today" from "the dialog was there and
    # we dismissed it", and on 2026-09-12 that was exactly the question: two runs
    # failed on SJ's dialog and the next passed, which is a very different story
    # depending on whether the dialog was still present.
    how = f" (dismissed: {cleared})" if cleared else " (no overlay present)"
    return "page-1 booking/email fields + submit present and clickable" + how


CHECKS = {
    "sl_form": (check_sl, SL_URL),
    "skanetrafiken_form": (check_skanetrafiken, SKANE_URL),
    "vasttrafik_form": (check_vasttrafik, VT_URL),
    "sj_form": (check_sj, SJ_URL),
}


def report(results: list[dict]) -> None:
    import urllib.request

    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/report-claim-canary",
        data=json.dumps({"results": results, "run_url": RUN_URL}).encode(),
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        print("report-claim-canary:", resp.status, resp.read().decode()[:300])


def main() -> int:
    OUT_DIR.mkdir(exist_ok=True)
    results: list[dict] = []
    mode = "CALIBRATION (no reporting)" if CALIBRATION else "LIVE (reports + may alert)"
    print(f"canary mode: {mode}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for name, (fn, url) in CHECKS.items():
            pg = browser.new_page(locale="sv-SE", viewport={"width": 1280, "height": 1600})
            try:
                detail = fn(pg)
                results.append({"check_name": name, "ok": True, "detail": detail})
                print(f"  OK   {name}: {detail}")
            except Exception as e:
                detail = f"{e}" if isinstance(e, AssertionError) else f"{type(e).__name__}: {e}"
                results.append({"check_name": name, "ok": False, "detail": detail[:900]})
                print(f"  FAIL {name}: {detail}")
                if not isinstance(e, AssertionError):
                    traceback.print_exc()
            finally:
                try:
                    pg.screenshot(path=str(OUT_DIR / f"{name}.png"), full_page=True)
                except Exception:
                    pass
                pg.close()
        browser.close()

    if CALIBRATION:
        print("calibration mode — nothing reported; screenshots in", OUT_DIR)
    elif SUPABASE_URL:
        report(results)
    else:
        print("SUPABASE_URL missing — cannot report", file=sys.stderr)
        return 1
    # Non-zero on breach so the run goes RED. notify-claude-on-failure.yml watches
    # "claim canary" via workflow_run, but until 2026-09-07 the else-branch here also
    # returned 0, so the workflow could never fail and that wiring could never fire —
    # a breach was only ever an email. Calibration runs stay 0 (they report nothing).
    return 0 if CALIBRATION or all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())

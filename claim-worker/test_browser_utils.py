"""Regression test for browser_utils — the 2026-09-04 SJ overlay failure.

Builds a page shaped like SJ's page 1: a submit button with a MUI-style dialog laid
over it, whose accept button reads "Godkänn alla" — NOT "Acceptera alla", which was
the only label the old submit_sj knew. That one-word gap cost every SJ claim filed
between 2026-06-27 and 2026-09-04.

Asserts: (a) a bare page.click() reproduces the original timeout, (b)
blocking_overlay names the dialog, (c) click_when_clear dismisses it and clicks,
(d) an UNdismissable overlay fails fast with a description instead of a bare
timeout, (e) a genuinely missing element still behaves like plain Playwright, and
(f) dismissal never presses Escape once fields are filled.

Runs entirely on set_content — NO network, no operator site is touched (§19). Needs
only Chromium:  python test_browser_utils.py
Override the browser with PLAYWRIGHT_CHROMIUM=/path/to/chromium if Playwright's own
download isn't where it expects.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from browser_utils import (FormError, blocking_overlay, click_when_clear, dismiss_overlays,
                           overlay_actions, wait_until_clear, NOT_FOUND)

def page_html(dismissable: bool) -> str:
    accept = ('<button onclick="document.getElementById(\'dlg\').remove()">Godkänn alla</button>'
              if dismissable else '<span>Ingen knapp här</span>')
    return f"""<!doctype html><html lang="sv"><body>
      <form onsubmit="document.getElementById('done').textContent='CLICKED';return false">
        <input id="orderOrTicketNumber"><input id="orderSecurity">
        <button type="submit" class="MuiButtonBase-root">Hämta resa</button>
      </form>
      <div id="done"></div>
      <div id="dlg" role="presentation" class="MuiDialog-root MuiModal-root"
           style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999">
        <div class="MuiDialog-container MuiDialog-scrollBody"
             style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center">
          <div style="background:#fff;padding:24px">Vi använder kakor. {accept}</div>
        </div>
      </div></body></html>"""

fails = []
def check(name, cond, extra=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" — {extra}" if extra else ""))
    if not cond:
        fails.append(name)

with sync_playwright() as p:
    launch = {"headless": True}
    if os.environ.get("PLAYWRIGHT_CHROMIUM"):
        launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM"]
    browser = p.chromium.launch(**launch)
    pg = browser.new_page(locale="sv-SE")

    print("A. the old behaviour (bare page.click) on a dismissable dialog")
    pg.set_content(page_html(True))
    t0 = time.monotonic()
    try:
        pg.click("button[type=submit]", timeout=3000)
        check("bare click is blocked", False, "it clicked — the repro is wrong")
    except Exception as e:
        check("bare click times out, as on 2026-09-04",
              "Timeout" in type(e).__name__ or "Timeout" in str(e),
              f"{time.monotonic()-t0:.1f}s")
    check("blocking_overlay names the dialog",
          "MuiDialog" in (blocking_overlay(pg, "button[type=submit]") or ""),
          blocking_overlay(pg, "button[type=submit]"))

    print("B. the fix: dismiss + click")
    pg.set_content(page_html(True))
    pg.fill("#orderOrTicketNumber", "WRBYFG3K")   # fill works through the overlay
    check("fill succeeds through the overlay (why this hid)",
          pg.input_value("#orderOrTicketNumber") == "WRBYFG3K")
    click_when_clear(pg, "button[type=submit]", timeout=8000)
    check("click_when_clear submitted the form", pg.inner_text("#done") == "CLICKED")
    check("dialog is gone", pg.locator("#dlg").count() == 0)

    print("C. no overlay at all — must not regress the happy path")
    pg.set_content(page_html(True).replace('<div id="dlg"', '<div id="dlg" hidden'))
    check("no blocker reported", blocking_overlay(pg, "button[type=submit]") is None)
    click_when_clear(pg, "button[type=submit]", timeout=5000)
    check("clicked", pg.inner_text("#done") == "CLICKED")

    print("D. undismissable overlay — fail fast, and SAY WHAT")
    pg.set_content(page_html(False))
    t0 = time.monotonic()
    try:
        click_when_clear(pg, "button[type=submit]", timeout=4000, user_message="Svensk text till användaren.")
        check("raises FormError", False, "it clicked")
    except FormError as e:
        took = time.monotonic() - t0
        check("raises FormError", True, f"{took:.1f}s")
        check("user message is the Swedish sentence", e.user_message == "Svensk text till användaren.")
        check("detail names the blocker", "MuiDialog" in e.detail, e.detail[:120])
        check("does not run past its budget", took <= 6.0, f"{took:.1f}s")

    print("E. missing element still behaves like Playwright (auto-wait, not a false blocker)")
    pg.set_content("<body></body>")
    check("NOT_FOUND sentinel", blocking_overlay(pg, "button[type=submit]") == NOT_FOUND)
    try:
        click_when_clear(pg, "button[type=submit]", timeout=2500)
        check("still raises for a genuinely missing button", False)
    except FormError as e:
        check("still raises for a genuinely missing button", False, "wrong type: FormError")
    except Exception as e:
        check("still raises for a genuinely missing button", "Timeout" in str(e), type(e).__name__)

    print("F. Escape is not pressed after fields are filled (allow_escape default)")
    pg.set_content(page_html(False))
    pg.fill("#orderOrTicketNumber", "KEEPME")
    dismiss_overlays(pg)                     # default allow_escape=False
    check("field value survives dismissal", pg.input_value("#orderOrTicketNumber") == "KEEPME")

    print("G. overlay_actions names the controls and whether our labels match them")
    # G1 — the dismissable fixture: the inventory must find the accept button AND
    # say which known label caught it.
    pg.set_content(page_html(True))
    inv = overlay_actions(pg, "button[type=submit]")
    check("lists the accept button", "'Godkänn alla'" in inv, inv[:140])
    check("flags it as matched", "MATCHES" in inv, inv[:140])

    # G2 — THE 2026-10-12 SJ SHAPE: a consent dialog whose accept button carries a
    # label CONSENT_LABELS does not know. This is the case the old message could
    # not describe; the inventory must name the button and mark it unmatched, which
    # is what turns the alert into a one-line fix.
    pg.set_content(page_html(True).replace("Godkänn alla", "Tillat samtliga kakfiler"))
    inv = overlay_actions(pg, "button[type=submit]")
    check("names the unknown button", "Tillat samtliga kakfiler" in inv, inv[:160])
    check("marks it unmatched", "no label match" in inv and "MATCHES" not in inv, inv[:160])

    # G3 — consent inside an iframe: no page-level locator can ever reach the
    # button, so the inventory must say so rather than listing nothing.
    pg.set_content("""<!doctype html><html lang="sv"><body>
      <form><button type="submit">Hämta resa</button></form>
      <iframe src="about:blank" title="consent"
              style="position:fixed;inset:0;width:100%;height:100%;z-index:9999"></iframe>
      </body></html>""")
    inv = overlay_actions(pg, "button[type=submit]")
    check("reports an iframe'd consent UI", "IFRAME" in inv, inv[:140])

    # G4 — a dialog with no button at all (scroll-gated accept, or we matched a
    # wrapper): distinct from "unknown label", and needs a different fix.
    pg.set_content(page_html(False))
    inv = overlay_actions(pg, "button[type=submit]")
    check("reports a button-less overlay", "NO button" in inv, inv[:140])

    # G5 — never reports a blocker when there is none.
    pg.set_content(page_html(True).replace('<div id="dlg"', '<div id="dlg" hidden'))
    check("says nothing covers it when clear",
          "nothing covers it" in overlay_actions(pg, "button[type=submit]"))

    print("H. Escape must not short-circuit dismissal (the 2026-10-13 canary breach)")
    # A strict [role=dialog] that matches EARLY in the selector order and ignores
    # Escape (MUI disableEscapeKeyDown), plus the REAL banner further down the list
    # carrying a label we know. Escape used to be credited without being checked,
    # which burned all three rounds and never reached the banner — so the canary
    # (the only caller passing allow_escape=True) was WEAKER than the worker.
    esc_html = """<!doctype html><html lang="sv"><body>
      <form onsubmit="document.getElementById('done').textContent='CLICKED';return false">
        <button type="submit">Hämta resa</button></form>
      <div id="done"></div>
      <div id="shell" role="dialog" aria-label="wrapper" style="position:fixed;inset:0;z-index:9998">
        <p>Vi använder cookies</p></div>
      <div id="cookiebar" class="cookie-consent-root"
           style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4)">
        <div style="background:#fff;padding:20px">Vi använder cookies
          <button onclick="document.getElementById('cookiebar').remove();document.getElementById('shell').remove()">Godkänn alla</button>
        </div></div></body></html>"""
    for allow_escape in (True, False):
        pg.set_content(esc_html)
        got = dismiss_overlays(pg, allow_escape=allow_escape)
        clear = blocking_overlay(pg, "button[type=submit]") is None
        who = "canary (allow_escape=True)" if allow_escape else "worker (allow_escape=False)"
        check(f"reaches the real banner — {who}", clear, f"dismissed={got}")
    check("Escape is never credited blind",
          not any("Escape" in d for d in dismiss_overlays(pg, allow_escape=True)))

    print("I. wait_until_clear tolerates a LATE dialog but not a permanent one")
    # I1 — the 2026-10-12/13 false positive: consent renders ~1.2 s after we first
    # look. A single hit test calls that a breach; the worker's retry loop clears it.
    # NB set_content reuses the window, so a stray setTimeout outlives it and would
    # silently mutate the NEXT case's DOM. Exactly one timer here, and about:blank
    # between cases.
    late = page_html(True).replace('<div id="dlg"', '<div id="dlg" hidden') + """
      <script>setTimeout(() => document.getElementById('dlg').removeAttribute('hidden'), 1200);</script>"""
    pg.set_content(late)
    pg.wait_for_timeout(1500)                      # dialog is up now
    check("single hit test sees the late dialog (the false positive)",
          "MuiDialog" in (blocking_overlay(pg, "button[type=submit]") or ""))
    pg.goto("about:blank")
    pg.set_content(late)
    check("wait_until_clear rides it out",
          wait_until_clear(pg, "button[type=submit]", timeout=8000) is None)

    # I2 — a dialog that never goes away must STILL be reported: this is the
    # 2026-09 claim-killing case and the canary must not go blind to it.
    pg.goto("about:blank")
    pg.set_content(page_html(False))
    blocker = wait_until_clear(pg, "button[type=submit]", timeout=3000, allow_escape=True)
    check("a permanent overlay is still reported", "MuiDialog" in (blocker or ""), (blocker or "")[:90])

    browser.close()

print("\n" + ("ALL PASS" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)

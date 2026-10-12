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
                           wait_until_clickable, NOT_FOUND)

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

def late_dialog_html(delay_ms: int, dismissable: bool) -> str:
    """SJ's page 1, but the consent dialog paints only after `delay_ms`.

    This is the 2026-10-01 / 2026-10-12 false-positive shape: at the instant the old
    canary hit-tested (once, ~5.5 s after load) the dialog had not rendered yet on the
    good days and had on the bad ones — pure timing, no DOM change at SJ's end.
    """
    accept = ('<button onclick="document.getElementById(\'dlg\').remove()">Godkänn alla</button>'
              if dismissable else '<span>Ingen knapp här</span>')
    return f"""<!doctype html><html lang="sv"><body>
      <form onsubmit="document.getElementById('done').textContent='CLICKED';return false">
        <input id="orderOrTicketNumber"><input id="orderSecurity">
        <button type="submit" class="MuiButtonBase-root">Hämta resa</button>
      </form>
      <div id="done"></div>
      <script>
        setTimeout(() => {{
          const d = document.createElement('div');
          d.id = 'dlg'; d.setAttribute('role','presentation');
          d.className = 'MuiDialog-root MuiModal-root';
          d.style = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999';
          d.innerHTML = '<div class="MuiDialog-container">' +
            '<div class="MuiDialogContent-root" style="background:#fff;padding:24px">' +
            'Vi använder cookies {accept}</div></div>';
          document.body.appendChild(d);
        }}, {delay_ms});
      </script></body></html>"""


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

    print("G. the one-shot hit test was the bug (2026-10-01 / 2026-10-12)")
    # SJ's consent dialog paints asynchronously. The old canary dismissed once at
    # ~4 s and then hit-tested ONCE at ~5.5 s, so a dialog that landed in between
    # was reported as "a headless click would time out" — while submit_sj, which
    # retries dismissal for 15 s, would have cleared it and clicked. Hence green on
    # Oct 2-11 and byte-identical failures on Oct 1 and Oct 12, same css-1nbx5hx
    # hash, with nothing changed at SJ's end.
    pg.set_content(page_html(True))
    one_shot = blocking_overlay(pg, "button[type=submit]")
    check("one-shot hit test reports a blocker (the old canary's verdict)",
          bool(one_shot) and one_shot != NOT_FOUND, (one_shot or "")[:80])
    blocker = wait_until_clickable(pg, "button[type=submit]", timeout=15000)
    check("shared retry loop clears the very same dialog", blocker is None)
    check("and the dialog is actually gone, not just unobserved",
          pg.locator("#dlg").count() == 0)

    # THE SAFETY HALF: mirroring the worker must not be able to go wrongly green.
    # An undismissable dialog — the real 2026-09-04 incident — is still sitting
    # there at the deadline, so it is still reported.
    pg.set_content(page_html(False))
    t0 = time.monotonic()
    blocker = wait_until_clickable(pg, "button[type=submit]", timeout=5000)
    took = time.monotonic() - t0
    check("an UNdismissable dialog is still caught", bool(blocker) and blocker != NOT_FOUND,
          (blocker or "")[:80])
    check("spends its budget before giving up", took >= 4.0, f"{took:.1f}s")

    # Contract note: this helper answers "is the click point clear NOW (within the
    # budget)", it does NOT wait for a dialog that has yet to paint. A click issued
    # before the dialog lands genuinely succeeds, so answering "clear" is truthful.
    pg.set_content(late_dialog_html(1500, False))
    blocker = wait_until_clickable(pg, "button[type=submit]", timeout=15000)
    check("clear before the dialog paints is a truthful answer", blocker is None)

    # And click_when_clear rides the same loop end-to-end through a late dialog.
    pg.set_content(late_dialog_html(400, True))
    pg.wait_for_timeout(900)                 # let it paint, as it had on the bad days
    click_when_clear(pg, "button[type=submit]", timeout=15000)
    check("click_when_clear submits through it", pg.inner_text("#done") == "CLICKED")

    browser.close()

print("\n" + ("ALL PASS" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)

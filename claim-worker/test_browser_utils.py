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
from browser_utils import (FormError, blocking_overlay, click_when_clear,
                           dismiss_overlays, overlay_buttons, NOT_FOUND)

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


def sj_oct_html(label: str = "Spara och fortsätt") -> str:
    """SJ page 1 as of 2026-10-01: MuiDialogContent-root text with the buttons in a
    sibling MuiDialogActions-root, and Escape swallowed by the dialog."""
    return f"""<!doctype html><html lang="sv"><body>
      <form onsubmit="document.getElementById('done').textContent='CLICKED';return false">
        <input id="orderOrTicketNumber"><input id="orderSecurity">
        <button type="submit" class="MuiButtonBase-root">Hämta resa</button>
      </form>
      <div id="done"></div>
      <div id="dlg" role="presentation" class="MuiDialog-root MuiModal-root"
           style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999">
        <div class="MuiPaper-root MuiDialog-paper"
             style="position:fixed;inset:0;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;background:#fff">
          <div class="MuiDialogContent-root css-1nbx5hx">Vi använder cookies.
            Vissa cookies är nödvändiga för att sj.se ska fungera.</div>
          <div class="MuiDialogActions-root">
            <button onclick="document.getElementById('dlg').remove()">{label}</button>
            <button>Hantera val</button>
          </div>
        </div>
      </div>
      <script>document.addEventListener('keydown',
        e => {{ if (e.key === 'Escape') e.preventDefault(); }});</script>
      </body></html>"""

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

    print("G. SJ's 2026-10-01 consent-dialog drift: unknown label must not be reported as dismissed")
    # SJ swapped its consent component: "Vi använder kakor" -> "Vi använder cookies",
    # MuiDialog-container -> MuiDialogContent-root, and the accept button's label left
    # CONSENT_LABELS. The dialog also swallows Escape (disableEscapeKeyDown), which the
    # old code reported as a successful dismissal three rounds running — a dismissal log
    # that lied, and no hint as to which label to add.
    pg.set_content(sj_oct_html())
    got = dismiss_overlays(pg, allow_escape=True)
    check("unknown label is NOT claimed as dismissed", got == [], f"reported: {got}")
    blocker = blocking_overlay(pg, "button[type=submit]")
    check("still correctly seen as blocked", bool(blocker) and blocker != NOT_FOUND)
    seen = overlay_buttons(pg, "button[type=submit]")
    check("names the accept button we failed to match",
          any("Spara och fortsätt" in b for b in seen), f"{seen}")
    try:
        click_when_clear(pg, "button[type=submit]", timeout=3000)
        check("click_when_clear fails fast", False, "it clicked")
    except FormError as e:
        check("click_when_clear fails fast", True)
        check("detail carries the candidate labels", "buttons in that overlay" in e.detail,
              e.detail[-90:])

    print("H. a KNOWN label still dismisses in the same new structure (no regression)")
    pg.set_content(sj_oct_html(label="Godkänn alla"))
    got = dismiss_overlays(pg, allow_escape=True)
    check("dismissed via the known label", got and "Godkänn alla" in got[0], f"{got}")
    check("overlay is actually gone", blocking_overlay(pg, "button[type=submit]") in (None, NOT_FOUND))

    browser.close()

print("\n" + ("ALL PASS" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)

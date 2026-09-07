"""Regression test for submit_sj's page-1 wait — the 2026-09-07 loader race.

Once the overlay fix let the click through, a real claim (train 539, 2026-09-02)
came back marked error with SJ's "verdict" recorded as "Ett ögonblick…" — SJ's
LOADER text. Two distinct bugs behind that:

  1. SJ answers page 1 asynchronously; networkidle fires while the loader is still
     up, so page.url and the body describe the spinner, not the answer.
  2. The first fix waited on `document.body.innerText`, which THROWS while the SPA
     is mid-navigation and body is momentarily null. An exception inside a
     wait_for_function predicate aborts the wait instantly rather than retrying —
     so a 25 s wait returned in under a second and reported a timeout it never
     spent. Case C below is that exact scenario.

Offline: set_content only, no operator site is touched (CLAUDE.md §19).
  python test_sj_waits.py        (PLAYWRIGHT_CHROMIUM=… to point at a browser)
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright

from submit_sj import _await_no_loader, _await_page1_result
fails = []
def check(name, cond, extra=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" — {extra}" if extra else ""))
    if not cond: fails.append(name)

LOADER = "<body><div>Ett ögonblick…</div></body>"

with sync_playwright() as p:
    launch = {"headless": True}
    if os.environ.get("PLAYWRIGHT_CHROMIUM"):
        launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM"]
    b = p.chromium.launch(**launch)
    pg = b.new_page(locale="sv-SE")

    # A. loader that resolves into an in-place answer
    pg.set_content(LOADER)
    pg.evaluate("setTimeout(() => { document.body.innerHTML = '<h1>Vi hittar inte din bokning. Det kan bero på…</h1>'; }, 2000)")
    t0 = time.monotonic()
    check("waits for the in-place answer", _await_page1_result(pg, timeout=15000), f"{time.monotonic()-t0:.1f}s")

    # B. loader that never resolves -> False, and SPENDS the budget (the 2026-09-07 bug
    #    was returning False in <1s because the predicate threw)
    pg.set_content(LOADER)
    t0 = time.monotonic(); ok = _await_page1_result(pg, timeout=4000); took = time.monotonic()-t0
    check("stuck loader returns False", ok is False)
    check("and actually waits the budget", took >= 3.5, f"{took:.1f}s")

    # C. body momentarily null must not abort the wait (the real failure mode)
    pg.set_content(LOADER)
    pg.evaluate("""
      setTimeout(() => { document.documentElement.removeChild(document.body); }, 300);
      setTimeout(() => { const b = document.createElement('body');
                         b.innerHTML = '<h1>Vi har redan fått din ansökan</h1>';
                         document.documentElement.appendChild(b); }, 1200);
    """)
    t0 = time.monotonic()
    check("survives a null body mid-navigation", _await_page1_result(pg, timeout=15000), f"{time.monotonic()-t0:.1f}s")

    # D. page 1 still showing its own form is NOT an answer
    pg.set_content("<body><h1>Ersättning vid försening</h1><input id='orderOrTicketNumber'><button type='submit'>Hämta resa</button></body>")
    t0 = time.monotonic(); ok = _await_page1_result(pg, timeout=3000)
    check("un-answered page 1 is not mistaken for an answer", ok is False, f"{time.monotonic()-t0:.1f}s")

    # E. the weaker confirmation wait
    pg.set_content(LOADER)
    pg.evaluate("setTimeout(() => { document.body.innerHTML = '<h1>Din ansökan är registrerad!</h1>'; }, 1000)")
    check("confirmation loader clears", _await_no_loader(pg, timeout=8000))
    b.close()

print("\n" + ("ALL PASS" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)

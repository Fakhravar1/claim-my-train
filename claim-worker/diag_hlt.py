"""Diagnostic: capture what a GitHub runner actually SEES when it hits respons.hlt.se.

The form loads instantly from a Swedish residential IP but the goto times out from GitHub's
runner. This navigates with a short timeout and screenshots whatever chromium renders (the
error / block state) + prints the HTTP status, to characterize the block (network timeout vs
403 vs WAF challenge). Compares against Kalmar's host, which is NOT blocked, as a control.
"""
import os
from playwright.sync_api import sync_playwright

TARGETS = {
    "hlt": "https://respons.hlt.se/internet/HLTreklamationV2.aspx",
    "kalmar": "https://respons.kalmarlanstrafik.se/internet/kltresegarantiv2.aspx",  # control
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spike_out")


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        for name, url in TARGETS.items():
            page = b.new_page(locale="sv-SE")
            print(f"== {name}: {url} ==")
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=20000)
                print(f"   status={resp.status if resp else None} final_url={page.url}")
            except Exception as e:
                print(f"   goto error: {type(e).__name__}: {str(e)[:120]}")
            # Halt any hung navigation so the screenshot doesn't also time out — a blocked host
            # leaves the page loading forever (full_page waits for stability and would hang).
            try:
                page.evaluate("window.stop()")
            except Exception:
                pass
            path = os.path.join(OUT, f"diag-{name}.png")
            try:
                shot = page.screenshot(full_page=False, animations="disabled", timeout=12000)
                with open(path, "wb") as f:
                    f.write(shot)
                print(f"   screenshot -> {path} ({len(shot)} bytes)")
            except Exception as e:
                print(f"   screenshot failed: {type(e).__name__}: {str(e)[:80]}")
            page.close()
        b.close()


if __name__ == "__main__":
    main()

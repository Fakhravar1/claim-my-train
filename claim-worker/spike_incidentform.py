"""Throwaway recon for the Värmlandstrafik delay form (incidentform.azurewebsites.net/delay/).
Dumps the field structure + BankID status so we can write submit_varmlandstrafik.py.
NO submission (§19). Run: ./venv/Scripts/python.exe spike_incidentform.py
"""
from playwright.sync_api import sync_playwright

URL = "https://incidentform.azurewebsites.net/delay/"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(locale="sv-SE")
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(4000)  # SPA render
    # click through the intro "Ansök här!" to reach the actual form
    try:
        btn = pg.locator("button:has-text('Ansök'), a:has-text('Ansök')")
        if btn.count():
            btn.first.click(timeout=8000)
            pg.wait_for_timeout(3500)
    except Exception as e:
        print("click err", e)
    print("URL  :", pg.url)
    print("TITLE:", pg.title())
    body = pg.locator("body").inner_text(timeout=8000)
    low = body.lower()
    print("BANKID_MENTION:", "bankid" in low or "legitimera" in low or "logga in" in low)
    # dump form controls
    for tag in ("input", "select", "textarea"):
        for el in pg.locator(tag).all():
            try:
                if not el.is_visible():
                    continue
                attrs = el.evaluate(
                    "e => ({name:e.getAttribute('name'),fcn:e.getAttribute('formcontrolname'),"
                    "id:e.id,ph:e.getAttribute('placeholder'),type:e.getAttribute('type'),"
                    "lbl:e.getAttribute('aria-label')})"
                )
                print(f"  {tag}: {attrs}")
            except Exception:
                pass
    # dropdowns (PrimeNG / mat-select / custom)
    for sel in ("p-dropdown", "mat-select", "[role=combobox]", "select"):
        c = pg.locator(sel).count()
        if c:
            print(f"  DROPDOWN {sel}: count={c}")
    # buttons
    print("BUTTONS:", [t.strip() for t in pg.locator("button").all_inner_texts() if t.strip()][:15])
    print("BODY_HEAD:", body[:600].replace("\n", " | "))
    pg.screenshot(path="recon_varmland.png", full_page=True)
    b.close()
print("done -> recon_varmland.png")

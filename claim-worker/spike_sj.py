"""THROWAWAY selector spike for SJ's delay-compensation form. Drives page 1 -> page 2
(Välj resa) with a real booking, screenshots + dumps form structure at each step, and
STOPS before any submit. Not part of the worker; safe to delete after mapping selectors.

Usage:
  venv/Scripts/python.exe spike_sj.py WRBYFG3K arian_kungen@hotmail.com
"""
import sys
import os
from playwright.sync_api import sync_playwright

URL = "https://www.sj.se/ersattning-vid-forsening/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spike_out")
os.makedirs(OUT, exist_ok=True)


def dump(page, tag):
    page.screenshot(path=os.path.join(OUT, f"{tag}.png"), full_page=True)
    print(f"\n===== {tag} | url={page.url} | title={page.title()!r} =====")
    inputs = page.eval_on_selector_all(
        "input,textarea,select",
        """els => els.map(e => ({
            tag: e.tagName, type: e.type, name: e.name, id: e.id,
            placeholder: e.placeholder,
            aria: e.getAttribute('aria-label'),
            label: (e.labels && e.labels[0] && e.labels[0].innerText) || null,
            visible: !!(e.offsetWidth || e.offsetHeight)
        }))""",
    )
    print("  INPUTS:")
    for i in inputs:
        if i["visible"]:
            print("   ", {k: v for k, v in i.items() if v not in (None, "", False)})
    buttons = page.eval_on_selector_all(
        "button,a[role=button],[type=submit]",
        "els => els.map(e => ({t: (e.innerText||'').trim().slice(0,40), id: e.id, vis: !!(e.offsetWidth||e.offsetHeight)}))",
    )
    print("  BUTTONS:", [b["t"] for b in buttons if b["vis"] and b["t"]])
    # Error / validation text (role=alert, aria-live, common error classes).
    errs = page.eval_on_selector_all(
        "[role=alert],[aria-live],[class*=error i],[class*=Error],[class*=feedback i],[class*=validation i]",
        "els => [...new Set(els.map(e => (e.innerText||'').trim()).filter(t => t && t.length < 200))]",
    )
    if errs:
        print("  ERRORS/ALERTS:", errs)


def main():
    booking, contact = sys.argv[1], sys.argv[2]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale="sv-SE", user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        dump(page, "01_landing")

        # Cookie consent (best-effort, several common patterns).
        for sel in [
            "button:has-text('Acceptera alla')", "button:has-text('Godkänn alla')",
            "button:has-text('Acceptera')", "#onetrust-accept-btn-handler",
            "button:has-text('Tillåt alla')",
        ]:
            try:
                btn = page.locator(sel)
                if btn.count() and btn.first.is_visible():
                    btn.first.click(timeout=3000)
                    print(f"  clicked cookie: {sel}")
                    page.wait_for_timeout(1000)
                    break
            except Exception as e:
                print(f"  cookie sel {sel} failed: {e}")
        dump(page, "02_after_cookies")

        # Fill page 1: booking/ticket no. + email/phone (label heuristics).
        try:
            page.get_by_label("Boknings", exact=False).first.fill(booking, timeout=8000)
        except Exception as e:
            print(f"  booking fill by label failed: {e}")
        try:
            page.get_by_label("post", exact=False).first.fill(contact, timeout=8000)
        except Exception as e:
            print(f"  contact fill by label failed: {e}")
        dump(page, "03_filled")

        # Advance to page 2 (Välj resa). Do NOT go further.
        for sel in ["button:has-text('Fortsätt')", "button:has-text('Nästa')",
                    "button:has-text('Sök')", "button[type=submit]"]:
            try:
                btn = page.locator(sel)
                if btn.count() and btn.first.is_visible():
                    btn.first.click(timeout=5000)
                    print(f"  clicked advance: {sel}")
                    break
            except Exception as e:
                print(f"  advance sel {sel} failed: {e}")
        page.wait_for_timeout(4000)
        dump(page, "04_page2")

        # Page 2 -> 3: tick the journey checkbox, then Fortsätt. SAFETY: never click a
        # button that looks like a FINAL submit ("Skicka"/"Ansök"/"Skicka in").
        try:
            cb = page.locator("input[type=checkbox]")
            if cb.count() and cb.first.is_visible():
                cb.first.check(timeout=5000)
                print("  checked journey checkbox")
                page.wait_for_timeout(500)
        except Exception as e:
            print(f"  checkbox failed: {e}")
        # Walk forward through Egna utlägg -> payout -> confirm, screenshotting each page.
        # SAFETY: only click advance/skip buttons; NEVER a final-submit button. If the only
        # forward button looks like a submit, stop and screenshot (do not file a real claim).
        ADVANCE = ["Hoppa över", "Fortsätt", "Nästa", "Gå vidare"]  # forward only (NOT "Välj resa" = back)
        BACK = ["välj resa", "tillbaka", "biljettnummer", "logga in", "hjälp", "svenska", "hoppa till"]
        FINAL = ["skicka", "ansök", "bekräfta", "slutför", "godkänn och"]  # lowercase substrings
        for tag in ("05_page3", "06_page4", "07_page5", "08_page6"):
            # Inspect visible buttons; pick a non-final advance/skip; flag any final-submit.
            btns = page.eval_on_selector_all(
                "button",
                "els=>els.filter(e=>e.offsetWidth||e.offsetHeight).map(e=>({t:(e.innerText||'').trim(),dis:e.disabled}))",
            )
            labels = [b["t"] for b in btns if b["t"]]
            finals = [t for t in labels if any(f in t.lower() for f in FINAL)]
            if finals:
                print(f"  REACHED FINAL-SUBMIT page at {tag}: buttons={finals} — STOPPING, not clicking.")
                dump(page, tag)
                break
            target = next((t for t in labels
                            if any(t.lower().startswith(a.lower()) for a in ADVANCE)
                            and not any(b in t.lower() for b in BACK)), None)
            if not target:
                print(f"  no non-final advance button at {tag}: {labels} — stopping.")
                dump(page, tag)
                break
            try:
                page.get_by_role("button", name=target, exact=True).first.click(timeout=6000)
                print(f"  advanced via {target!r}")
            except Exception as e:
                print(f"  click {target!r} failed: {e}")
                dump(page, tag)
                break
            page.wait_for_timeout(3500)
            dump(page, tag)
        browser.close()


if __name__ == "__main__":
    main()

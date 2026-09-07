"""Shared Playwright helpers for driving the operator claim forms.

WHY THIS MODULE EXISTS — the 2026-06-27 / 2026-09-04 SJ failure.

Two SJ claims (the only two ever filed) died with the identical error on page 1's
"Hämta resa":

    Page.click: Timeout 8000ms exceeded.
      - locator resolved to <button type="submit">Hämta resa</button>
      - element is visible, enabled and stable
      - <div class="MuiDialog-container …"> … subtree intercepts pointer events

The selector was never wrong — the button resolved fine. A modal dialog sat on top
of it and swallowed the click for the full 8 s. submit_sj only knew how to dismiss
OneTrust-shaped banners ("Acceptera alla", #onetrust-accept-btn-handler); SJ's is
a MUI dialog, so nothing matched.

Three lessons are baked into this module:

  1. page.fill() does NOT hit-test, so an overlay is invisible right up until the
     first click. Every field filled cleanly; only the click failed. Never take a
     successful fill as evidence the page is interactive.
  2. "the element exists" is not "the element is clickable". canary.py asserted
     existence only, and stayed green through ten weeks of a 100 %-failing SJ path.
     blocking_overlay() is the assertion that would have caught it.
  3. When a click IS blocked, say what blocked it. A 900-character Playwright
     trace in claims.error_message told us nothing and went out to the user in the
     outcome email; FormError carries a Swedish user message and the technical
     detail separately.

Deliberately imports nothing from playwright — the page object is duck-typed — so
worker.py's PDF path can import FormError without paying for a browser dependency.
"""

from __future__ import annotations

import time

# Consent buttons we can hit by id/attribute wherever they sit on the page. These
# are unambiguous enough not to need an overlay to scope them.
ACCEPT_SELECTORS = (
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button[data-testid='accept-all-cookies']",
    "button[data-testid='accept-all']",
)

# Text on a consent/notice button, most-specific first. "Godkänn"/"Acceptera" are
# substrings, so they also catch "Godkänn alla cookies" etc. ONLY ever matched INSIDE
# a visible overlay (see _dismiss_once) — an unscoped "OK" would happily click
# something in the form itself.
CONSENT_LABELS = (
    "Godkänn alla",
    "Acceptera alla",
    "Tillåt alla",
    "Accept all",
    "Godkänn",
    "Acceptera",
    "Jag förstår",
    "Jag godkänner",
)

# Generic dismissals, used ONLY inside a strict dialog container (below). Too weak to
# scope by text alone: plenty of forms have their own "OK".
GENERIC_LABELS = ("Stäng", "Close", "OK")

# Strict: this IS a modal. Generic labels and Escape are allowed in here.
DIALOG_SELECTORS = (
    "[role='dialog']",
    "[role='alertdialog']",
    "[class*='MuiDialog']",
    "#onetrust-banner-sdk",
    "#CybotCookiebotDialog",
)

# Loose: probably a consent banner. Consent labels only — never the generic ones,
# because these selectors can match a large wrapper rather than the banner itself.
BANNER_SELECTORS = (
    "[id*='cookie' i]",
    "[id*='consent' i]",
    "[class*='cookie' i]",
    "[class*='consent' i]",
)

OVERLAY_SELECTORS = DIALOG_SELECTORS + BANNER_SELECTORS


class FormError(RuntimeError):
    """A form-driving failure that separates what the USER is told from what WE need.

    claims.error_message is shown in "Mina ärenden" and emailed by send-claim-outcome,
    so it must be a sentence in Swedish, not a stack trace. `detail` carries the
    technical text for the CI log, and `screenshot` is the audit shot of whatever page
    we were actually looking at when it went wrong.
    """

    def __init__(self, user_message: str, *, detail: str = "",
                 screenshot: bytes | None = None, url: str | None = None):
        super().__init__(detail or user_message)
        self.user_message = user_message
        self.detail = detail or user_message
        self.screenshot = screenshot
        self.url = url


def _visible(loc) -> bool:
    """is_visible() on a detached/odd locator can throw — never let that fail a run."""
    try:
        return loc.count() > 0 and loc.first.is_visible()
    except Exception:
        return False


def _dismiss_once(page, timeout: int, allow_escape: bool) -> str | None:
    """Dismiss ONE overlay. Returns a description of what was dismissed, or None."""
    for sel in ACCEPT_SELECTORS:
        loc = page.locator(sel)
        if _visible(loc):
            try:
                loc.first.click(timeout=timeout)
                return sel
            except Exception:
                pass

    for osel in OVERLAY_SELECTORS:
        overlay = page.locator(osel)
        if not _visible(overlay):
            continue
        box = overlay.first
        strict = osel in DIALOG_SELECTORS
        labels = CONSENT_LABELS + (GENERIC_LABELS if strict else ())
        for label in labels:
            btn = box.locator(
                f"button:has-text('{label}'), [role='button']:has-text('{label}')"
            )
            if _visible(btn):
                try:
                    btn.first.click(timeout=timeout)
                    return f"{osel} » '{label}'"
                except Exception:
                    continue
        if strict:
            close = box.locator(
                "[aria-label*='stäng' i], [aria-label*='close' i], "
                "button[title*='stäng' i], button[title*='close' i]"
            )
            if _visible(close):
                try:
                    close.first.click(timeout=timeout)
                    return f"{osel} » close button"
                except Exception:
                    pass
            if allow_escape:
                # Last resort, and ONLY on a freshly loaded page: Escape reverts the
                # value of some framework inputs (PrimeNG's calendar does exactly
                # this, see submit_vy.py), so it must never run after we've filled
                # fields. Hence allow_escape defaults to False.
                try:
                    page.keyboard.press("Escape")
                    return f"{osel} » Escape"
                except Exception:
                    pass
        # Nothing here worked — try the next container rather than giving up; the
        # first thing matching an overlay selector isn't always the real banner.
    return None


def dismiss_overlays(page, *, rounds: int = 3, timeout: int = 2500,
                     allow_escape: bool = False) -> list[str]:
    """Best-effort: clear consent/notice modals stacked over the page.

    Never raises — a banner we can't dismiss must not fail the run here; the
    click-time hit test is what turns it into an actionable error.
    """
    dismissed: list[str] = []
    for _ in range(rounds):
        what = _dismiss_once(page, timeout, allow_escape)
        if not what:
            break
        dismissed.append(what)
        try:
            page.wait_for_timeout(500)
        except Exception:
            break
    return dismissed


# Returned by the hit test when the selector matched nothing. Distinguished from a
# real overlay so callers can let Playwright's own auto-waiting handle it.
NOT_FOUND = "__not_found__"


def blocking_overlay(page, selector: str) -> str | None:
    """What, if anything, covers `selector`'s click point? None = clickable.

    This is the assertion the canary was missing: document.elementFromPoint at the
    element's centre tells us whether a click would actually land on it, which
    "does the element exist" cannot.
    """
    try:
        loc = page.locator(selector)
        if loc.count() == 0:
            return NOT_FOUND
        loc.first.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        return NOT_FOUND
    try:
        return page.evaluate(
            """(sel) => {
              const el = document.querySelector(sel);
              if (!el) return "__not_found__";
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return "__not_found__";
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              if (!top || top === el || el.contains(top) || top.contains(el)) return null;
              const dlg = top.closest("[role=dialog], [class*=Dialog], [class*=modal], [class*=Modal]") || top;
              const cls = (typeof dlg.className === "string" ? dlg.className : "").slice(0, 120);
              const txt = (dlg.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 200);
              return `<${dlg.tagName.toLowerCase()} class="${cls}"> ${txt}`;
            }""",
            selector,
        )
    except Exception:
        return None  # can't hit-test (navigating, CSP) — let the click try anyway


def click_when_clear(page, selector: str, *, timeout: int = 8000,
                     user_message: str | None = None) -> None:
    """Click `selector`, clearing overlays first and naming one we can't clear.

    Replaces a bare page.click(): on the 2026-09-04 failure that spent its whole
    8 s budget retrying a click into a dialog and then reported only a timeout.
    Here the same situation dismisses the dialog if it's dismissible, and otherwise
    fails immediately with the dialog's tag, class and text.
    """
    deadline = time.monotonic() + timeout / 1000.0
    dismiss_overlays(page)
    blocker = blocking_overlay(page, selector)
    while blocker and blocker != NOT_FOUND and time.monotonic() < deadline:
        page.wait_for_timeout(250)
        dismiss_overlays(page)
        blocker = blocking_overlay(page, selector)

    if blocker and blocker != NOT_FOUND:
        raise FormError(
            user_message or "Formuläret gick inte att fylla i automatiskt just nu.",
            detail=f"click on {selector} blocked by overlay: {blocker}",
            url=getattr(page, "url", None),
        )

    remaining = max(int((deadline - time.monotonic()) * 1000), 2000)
    page.click(selector, timeout=remaining)

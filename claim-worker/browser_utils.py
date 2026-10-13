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


def _gone(overlay) -> bool:
    """Has this overlay stopped covering the page? Visibility, not presence —
    consent frameworks routinely leave the container in the DOM and just hide it."""
    return not _visible(overlay)


def _click_and_confirm(page, target, overlay, timeout: int) -> bool:
    """Click `target` and confirm `overlay` actually went away.

    Returns False when the click landed but changed nothing, so the caller keeps
    looking instead of reporting a dismissal that never happened. Clicking a second
    consent control afterwards is harmless; believing a stale success is not — that
    belief is what burned all three rounds in the 2026-10-13 canary run.
    """
    try:
        target.click(timeout=timeout)
    except Exception:
        return False
    for _ in range(3):
        if _gone(overlay):
            return True
        try:
            page.wait_for_timeout(200)
        except Exception:
            break
    return _gone(overlay)


def _dismiss_once(page, timeout: int, allow_escape: bool) -> str | None:
    """Dismiss ONE overlay. Returns a description of what was dismissed, or None.

    Every branch CONFIRMS the overlay is gone before claiming it (see
    _click_and_confirm), and Escape is a genuine last resort — tried only after
    every container has been offered a real control, and only credited if the
    overlay actually disappears.

    WHY (the 2026-10-13 canary breach): Escape used to be tried inside the
    container loop and returned immediately, crediting itself without checking.
    A MUI dialog with disableEscapeKeyDown ignores Escape, so a strict [role=dialog]
    matching EARLY in the selector order consumed every round and the real consent
    banner further down the list was never reached. Because only the canary passes
    allow_escape=True, the canary was strictly WEAKER at dismissal than the worker
    it is supposed to mirror — the same canary/worker divergence this module was
    written to remove, pointing the other way. Verified both directions in
    test_browser_utils.py (case H).
    """
    for sel in ACCEPT_SELECTORS:
        loc = page.locator(sel)
        if _visible(loc) and _click_and_confirm(page, loc.first, loc, timeout):
            return sel

    escapable = []  # strict dialogs that offered us no working control
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
            if _visible(btn) and _click_and_confirm(page, btn.first, overlay, timeout):
                return f"{osel} » '{label}'"
        if strict:
            close = box.locator(
                "[aria-label*='stäng' i], [aria-label*='close' i], "
                "button[title*='stäng' i], button[title*='close' i]"
            )
            if _visible(close) and _click_and_confirm(page, close.first, overlay, timeout):
                return f"{osel} » close button"
            escapable.append((osel, overlay))
        # Nothing here worked — try the next container rather than giving up; the
        # first thing matching an overlay selector isn't always the real banner.

    if allow_escape:
        # Last resort, and ONLY on a freshly loaded page: Escape reverts the value
        # of some framework inputs (PrimeNG's calendar does exactly this, see
        # submit_vy.py), so it must never run after we've filled fields. Hence
        # allow_escape defaults to False.
        for osel, overlay in escapable:
            try:
                page.keyboard.press("Escape")
            except Exception:
                continue
            if _gone(overlay):
                return f"{osel} » Escape"
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


def wait_until_clear(page, selector: str, *, timeout: int = 8000,
                     allow_escape: bool = False) -> str | None:
    """Dismiss and re-hit-test until `selector` is clickable or the budget expires.

    Returns None when nothing covers it, NOT_FOUND when the selector isn't there,
    or a description of the blocker that outlasted the budget.

    THE CANARY MUST USE THIS, NOT A BARE blocking_overlay(). On 2026-10-12/13 the
    sj_form check hit-tested exactly ONCE, ~1.5 s after dismissal, and reported a
    breach — while the worker, which dismisses and retries for a full 8 s here,
    would have sailed through the same late-rendering consent dialog. Two daily
    failures and then a pass minutes later, with no code change, is that race.
    A single hit test cannot tell "a dialog arrived a moment late" from "a dialog
    we can never clear", and only the second one kills a claim.
    """
    deadline = time.monotonic() + timeout / 1000.0
    dismiss_overlays(page, allow_escape=allow_escape)
    blocker = blocking_overlay(page, selector)
    while blocker and blocker != NOT_FOUND and time.monotonic() < deadline:
        try:
            page.wait_for_timeout(250)
        except Exception:
            break
        dismiss_overlays(page, allow_escape=allow_escape)
        blocker = blocking_overlay(page, selector)
    return blocker


def click_when_clear(page, selector: str, *, timeout: int = 8000,
                     user_message: str | None = None) -> None:
    """Click `selector`, clearing overlays first and naming one we can't clear.

    Replaces a bare page.click(): on the 2026-09-04 failure that spent its whole
    8 s budget retrying a click into a dialog and then reported only a timeout.
    Here the same situation dismisses the dialog if it's dismissible, and otherwise
    fails immediately with the dialog's tag, class and text.

    The waiting is wait_until_clear()'s, so the canary asserts clickability through
    the exact code path the worker clicks through — the divergence that let the
    canary stay green through ten weeks of a 100 %-failing SJ path in 2026-09, and
    then cry breach over a survivable race in 2026-10, is structural now, not a
    matter of keeping two call sites in step.
    """
    deadline = time.monotonic() + timeout / 1000.0
    blocker = wait_until_clear(page, selector, timeout=timeout)

    if blocker and blocker != NOT_FOUND:
        raise FormError(
            user_message or "Formuläret gick inte att fylla i automatiskt just nu.",
            detail=f"click on {selector} blocked by overlay: {blocker}",
            url=getattr(page, "url", None),
        )

    remaining = max(int((deadline - time.monotonic()) * 1000), 2000)
    page.click(selector, timeout=remaining)


def overlay_actions(page, selector: str, *, limit: int = 12) -> str:
    """Read-only: name the dismissal controls inside whatever covers `selector`.

    DIAGNOSTICS ONLY — changes no behaviour, clicks nothing, and is never called by
    the submit path. It exists because of the 2026-10-12 SJ breach: the canary
    correctly reported "submit button is covered" and quoted the dialog's BODY TEXT
    ("Vi använder cookies …"), which does not name a single button — so there was no
    way to tell from the alert whether CONSENT_LABELS had simply gone stale, or the
    consent UI had moved somewhere page-level locators cannot reach at all. A
    breach that cannot be acted on without someone re-driving the live form by hand
    wastes the very lead time the canary buys.

    Returns a one-line summary: the dialog container, each candidate control (text,
    aria-label, data-testid) and — the actionable bit — whether CONSENT_LABELS /
    GENERIC_LABELS would have matched it. Distinguishes three causes that look
    identical in the old message:
      * a label we don't know yet  -> controls listed, none marked MATCHES
      * consent moved into an iframe / shadow DOM -> reported as such
      * a dialog with no button at all (scroll-gated, or we matched a wrapper)
    """
    try:
        info = page.evaluate(
            """(sel) => {
              const el = document.querySelector(sel);
              if (!el) return {kind: "no_target"};
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return {kind: "no_target"};
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              if (!top || top === el || el.contains(top) || top.contains(el)) return {kind: "clear"};
              if (top.tagName === "IFRAME")
                return {kind: "iframe", src: (top.getAttribute("src") || "").slice(0, 160)};
              const box = top.closest("[role=dialog],[role=alertdialog],[class*=Dialog],[class*=modal],[class*=Modal]") || top;
              const controls = [];
              const push = (n, shadow) => {
                const rect = n.getBoundingClientRect();
                controls.push({
                  tag: n.tagName.toLowerCase(),
                  text: (n.innerText || n.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60),
                  aria: n.getAttribute("aria-label"),
                  testid: n.getAttribute("data-testid"),
                  id: n.id || null,
                  visible: !!(rect.width && rect.height),
                  shadow: !!shadow,
                });
              };
              const walk = (root, shadow) => {
                for (const n of root.querySelectorAll(
                  "button,[role=button],a[href],input[type=button],input[type=submit]"
                )) push(n, shadow);
                for (const n of root.querySelectorAll("*")) if (n.shadowRoot) walk(n.shadowRoot, true);
              };
              walk(box, false);
              const cls = typeof box.className === "string" ? box.className : "";
              return {
                kind: "dialog",
                container: `<${box.tagName.toLowerCase()} class="${cls.slice(0, 100)}">`,
                controls,
              };
            }""",
            selector,
        )
    except Exception as exc:  # never let a diagnostic break the caller
        return f"(overlay inventory unavailable: {type(exc).__name__})"

    kind = (info or {}).get("kind")
    if kind == "clear":
        return "(nothing covers it now)"
    if kind == "no_target":
        return "(target not found)"
    if kind == "iframe":
        return (f"consent UI is in an IFRAME (src={info.get('src')!r}) — page-level "
                "locators cannot reach its buttons; dismissal needs a frame_locator")
    if kind != "dialog":
        return "(overlay inventory unavailable)"

    known = CONSENT_LABELS + GENERIC_LABELS
    controls = info.get("controls") or []
    if not controls:
        return (f"{info.get('container')} contains NO button/role=button at all — "
                "either the accept control is scroll-gated inside it, or we matched "
                "a wrapper rather than the banner")

    parts = []
    for c in controls[:limit]:
        # Mirror Playwright's :has-text() — case-insensitive substring.
        hay = " ".join(filter(None, (c.get("text"), c.get("aria")))).lower()
        hit = next((lbl for lbl in known if lbl.lower() in hay), None)
        bits = [c.get("tag") or "?", repr(c.get("text") or "")]
        if c.get("aria"):
            bits.append(f"aria={c['aria']!r}")
        if c.get("testid"):
            bits.append(f"testid={c['testid']!r}")
        if c.get("shadow"):
            bits.append("in-shadow-root")
        if not c.get("visible"):
            bits.append("hidden")
        bits.append(f"MATCHES {hit!r}" if hit else "no label match")
        parts.append(" ".join(bits))
    more = f" (+{len(controls) - limit} more)" if len(controls) > limit else ""
    return f"{info.get('container')} offers: " + "; ".join(parts) + more

// sl-fill-script — serves the Qvitta SL autofill script.
//
// The iOS "Qvitta" Shortcut GETs this script and runs it on SL's claim page
// (sl.se/kundservice/forseningsersattning/*). Serving it server-side means we
// fix SL selector drift by redeploying THIS function — the user's Shortcut
// never changes. verify_jwt=false: it is PUBLIC and contains selector logic
// ONLY, no secrets. The PII payload (journey, email, bank) is passed in by the
// Shortcut as `window.__QVITTA__` and NEVER touches this server.
//
// HARD RULES (CLAUDE.md §8 — applies to modes/operators and to this bot path):
//   1. FILL ONLY. The script never clicks a submit / "Fortsätt" / "Skicka in"
//      button. The user reviews every step and submits behind BankID himself.
//   2. NO network calls from the injected script. It only reads window.__QVITTA__
//      and sets fields.
//
// SL is a React SPA wizard across routes /resan -> /ersattning -> /biljett ->
// /personuppgifter -> /utbetalning -> /skicka. We fill the deterministic fields
// we know; /biljett (ticket app-id / card number — per-trip data we don't have)
// and /personuppgifter (BankID pre-fills it) are left to the user.

const VERSION = "sl-fill-2 (2026-07-01, payload-version gate)";

// The injected script deliberately uses NO template literals / ${} so it can
// live inside this outer template literal without escaping headaches.
const SCRIPT = `
(function () {
  "use strict";
  var P = window.__QVITTA__ || {};
  var log = function (m) { try { console.log("[Qvitta] " + m); } catch (e) {} };

  // Payload-contract version gate: the app stamps v:1 in the deep-link payload
  // (ShortcutClaimModal). If a future payload bumps v, an OLD script fetched from
  // a cached/stale deploy must fail LOUDLY instead of half-filling the form with
  // fields that moved. Bump SUPPORTED_V in lockstep with the payload's v.
  // (NB no backticks in comments here - we are INSIDE a template literal.)
  var SUPPORTED_V = 1;
  if (P.v != null && P.v !== SUPPORTED_V) {
    try {
      alert("Qvitta-genvagen och appen har olika versioner - oppna qvitta.nu/genvag och installera om genvagen, sa fylls formularet i korrekt.");
    } catch (e) {}
    log("payload v=" + P.v + " unsupported (script v=" + SUPPORTED_V + ") - aborting fill");
    return;
  }

  // React-safe value setter: go through the native setter so React's tracked
  // value updates and onChange fires (plain el.value = x does NOT).
  function setValue(el, value) {
    if (!el) return false;
    var proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function byId(id) { return document.getElementById(id); }
  function fillById(id, value) {
    if (value == null || value === "") return false;
    var el = byId(id);
    if (!el) return false;
    if (el.value === String(value)) return false; // already correct
    return setValue(el, value);
  }
  function clickRadio(id) {
    var el = byId(id);
    if (el && !el.checked) { el.click(); return true; }
    return false;
  }

  // Typeahead: set the value, then poll for the async dropdown and click the
  // option that matches the station name. Best-effort + heavily logged so the
  // device test can reveal SL's real option DOM if these selectors miss.
  function driveTypeahead(inputId, name) {
    if (!name) return;
    var el = byId(inputId);
    if (!el || el.getAttribute("data-qv") === name) return;
    setValue(el, name);
    el.setAttribute("data-qv", name);
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var opts = document.querySelectorAll(
        '[role="option"], [role="listbox"] li, ul[role="listbox"] li, [class*="suggestion"], [class*="option"]'
      );
      var picked = null, want = name.toLowerCase();
      for (var i = 0; i < opts.length; i++) {
        var t = (opts[i].textContent || "").trim().toLowerCase();
        if (t.indexOf(want) === 0) { picked = opts[i]; break; }
      }
      if (!picked && opts.length) picked = opts[0];
      if (picked) {
        picked.click();
        clearInterval(iv);
        log("typeahead " + inputId + " -> " + (picked.textContent || "").trim());
      } else if (tries > 25) {
        clearInterval(iv);
        log("typeahead " + inputId + ": no options found (fill manually)");
      }
    }, 120);
  }

  // delay minutes -> SL's /ersattning bucket radio id
  function delayBucketId(min) {
    if (min == null) return null;
    if (min < 20) return "time-range-1";  // <20 (not eligible, but map anyway)
    if (min < 40) return "time-range-2";  // 20-39
    if (min < 60) return "time-range-3";  // 40-59
    return "time-range-4";                 // 60+
  }

  var banner;
  function note(msg) {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;" +
        "padding:10px 14px;border-radius:10px;background:#0E8C7E;color:#fff;" +
        "font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)";
      document.body.appendChild(banner);
    }
    banner.textContent = msg;
  }

  function fillStep() {
    var path = location.pathname, n = 0;
    if (path.indexOf("/resan") >= 0) {
      // First-login email gate: only if the field is present AND empty.
      var em = byId("email");
      if (em && !em.value && P.email) { setValue(em, P.email); n++; }
      driveTypeahead("journey-planner-typeahead-origin-input", P.origin);
      driveTypeahead("journey-planner-typeahead-destination-input", P.destination);
      if (fillById("journey-planner-form-date", P.date)) n++;
      if (fillById("journey-planner-form-time", P.time)) n++;
      if (clickRadio("late-departure")) n++;   // incident = Försening
      if (clickRadio("no-radio")) n++;         // missed-connection = Nej (default)
    } else if (path.indexOf("/ersattning") >= 0) {
      if (clickRadio("with-sl-radio")) n++;    // Med SL (default)
      var b = delayBucketId(P.delayMinutes);
      if (b && clickRadio(b)) n++;
    } else if (path.indexOf("/utbetalning") >= 0) {
      if (fillById("clearing-number", P.clearing)) n++;
      if (fillById("account-number", P.account)) n++;
    }
    // /biljett and /personuppgifter: intentionally left to the user.
    if (n > 0) note("Qvitta fyllde i " + n + " falt - kontrollera och fortsatt sjalv.");
    return n;
  }

  // Fill the current step now. Also keep watching for SPA step changes IF this
  // execution context survives the Shortcut action (it may not — harmless if
  // not; then the user re-runs the Shortcut per step and each run fills that
  // step). We NEVER advance steps ourselves.
  fillStep();
  var last = location.pathname;
  setInterval(function () {
    if (location.pathname !== last) { last = location.pathname; setTimeout(fillStep, 400); }
    else { fillStep(); } // re-attempt async-rendered fields on the same step
  }, 700);
  log("sl-fill loaded");
})();
`;

Deno.serve(() =>
  new Response(SCRIPT, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-qvitta-fill-version": VERSION,
    },
  })
);

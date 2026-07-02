// skanetrafiken-fill-script — serves the Qvitta Skånetrafiken autofill script.
//
// Same contract as sl-fill-script: the "Qvitta" iOS Shortcut GETs this and runs
// it on Skånetrafiken's BankID claim form. verify_jwt=false: PUBLIC, selector
// logic only, no secrets. The PII payload is passed in via window.__QVITTA__ by
// the Shortcut and never touches this server.
//
// HARD RULES (CLAUDE.md §8):
//   1. FILL ONLY. Never click "Sök resa"/"Fortsätt"/"Skicka in", never tick the
//      terms/truthfulness attestations, never pick the trip radio. The user does
//      all of that — picking the wrong trip would be a false claim.
//   2. NO network calls from the injected script.
//
// Skånetrafiken is a 3-step React SPA on HASH routes (#/steg-1|2|3):
//   steg-1: delay + from/to typeahead + date + time + (user: Sök resa → pick trip) + ticket type
//   steg-2: costType (prisavdrag) + compensationType (voucher|swedishBank); swedishBank
//           uses the BankID-prefilled personnummer (NO account entry — unlike SL)
//   steg-3: email + mobil + (user: tick attestations + Skicka in)

const VERSION = "skane-fill-2 (2026-07-02, payload-version gate)";

const SCRIPT = `
(function () {
  "use strict";
  var P = window.__QVITTA__ || {};
  var log = function (m) { try { console.log("[Qvitta] " + m); } catch (e) {} };

  // Payload-contract version gate (same as sl-fill-2): abort LOUDLY on a version
  // mismatch instead of half-filling a moved form. Bump SUPPORTED_V in lockstep with
  // the payload's v. (NB no backticks in comments here - inside a template literal.)
  var SUPPORTED_V = 1;
  if (P.v != null && P.v !== SUPPORTED_V) {
    try {
      alert("Qvitta-genvagen och appen har olika versioner - oppna qvitta.nu/genvag och installera om genvagen, sa fylls formularet i korrekt.");
    } catch (e) {}
    log("payload v=" + P.v + " unsupported (script v=" + SUPPORTED_V + ") - aborting fill");
    return;
  }

  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function setInput(el, value) {
    if (!el || value == null || value === "" || el.value === String(value)) return false;
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, String(value)); fire(el); return true;
  }
  // React-controlled <select> reverts a plain value set — also pin selectedIndex.
  function setSelect(el, value) {
    if (!el || value == null || value === "" || el.value === String(value)) return false;
    var s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    s.call(el, String(value));
    for (var i = 0; i < el.options.length; i++) { if (el.options[i].value === String(value)) { el.selectedIndex = i; break; } }
    fire(el); return true;
  }
  function byId(id) { return document.getElementById(id); }
  function clickRadio(id) { var el = byId(id); if (el && !el.checked) { el.click(); return true; } return false; }

  // Typeahead: type, then click the matching st-autocomplete suggestion. Skånetrafiken
  // wires the listbox via aria-controls; options are li[role=option] ("Malmö C Hållplats").
  function driveTypeahead(inputId, name) {
    if (!name) return;
    var el = byId(inputId); if (!el || el.getAttribute("data-qv") === name) return;
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, name); fire(el); el.setAttribute("data-qv", name);
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var listId = el.getAttribute("aria-controls");
      var list = listId ? byId(listId) : null;
      var opts = list ? [].slice.call(list.querySelectorAll('li[role="option"], [role="option"]')) : [];
      var want = name.toLowerCase(), picked = null;
      for (var i = 0; i < opts.length; i++) {
        var t = (opts[i].textContent || "").trim().toLowerCase();
        if (t.indexOf(want) === 0) { picked = opts[i]; break; }
      }
      if (!picked && opts.length) picked = opts[0];
      if (picked) { picked.click(); clearInterval(iv); log("typeahead " + inputId + " -> " + (picked.textContent || "").trim()); }
      else if (tries > 25) { clearInterval(iv); log("typeahead " + inputId + ": no options (fill manually)"); }
    }, 120);
  }

  function delayValue(min) {
    if (min == null) return null;
    if (min >= 120) return "120"; if (min >= 60) return "60"; if (min >= 40) return "40"; return "20";
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

  function step1() {
    var n = 0;
    if (setSelect(byId("experiencedDelay"), delayValue(P.delayMinutes))) n++;
    driveTypeahead("fromDestinationAutocompleteCombobox", P.origin);
    driveTypeahead("toDestinationAutocompleteCombobox", P.destination);
    if (setInput(byId("journeyDatePicker"), P.date)) n++;
    if (P.time) {
      if (setSelect(byId("hoursSelect"), P.time.slice(0, 2))) n++;
      if (setSelect(byId("minutesSelect"), P.time.slice(3, 5))) n++;
    }
    // Ticket type (required). Default to the broadest (app / card / paper); the user
    // can change it. Only set when still empty so we don't fight a user choice.
    var tsel = document.querySelector('select[id^="ticketGroups"]');
    if (tsel && !tsel.value && setSelect(tsel, "appPaperTapnrideTicket")) n++;
    return n;
  }
  function step2() {
    var n = 0;
    if (setSelect(byId("costType"), "priceReduction")) n++;     // prisavdrag (default)
    var ct = P.payoutMethod === "bank" ? "swedishBank" : "voucher";
    if (setSelect(byId("compensationType"), ct)) n++;
    if (ct === "voucher") {
      if (P.payoutMethod === "email") { if (clickRadio("voucherTypeEmail")) n++; }
      else { if (clickRadio("voucherTypeMobile")) n++; }
    } else {
      // swedishBank: socialSecurityNumber is normally BankID-prefilled — fill as a fallback
      // only when it's empty, so we never clobber the authenticated value.
      var ssn = byId("socialSecurityNumber");
      if (ssn && !ssn.value && P.personnummer && setInput(ssn, P.personnummer)) n++;
    }
    return n;
  }
  function step3() {
    var n = 0;
    if (setInput(byId("email"), P.email)) n++;
    if (setInput(byId("mobilePhoneNumber"), P.mobile)) n++;
    // NEVER tick acceptPolicy / acceptTruthfulness — legal attestations are the user's.
    return n;
  }

  function run() {
    var h = location.hash || "", n = 0;
    if (h.indexOf("steg-1") >= 0) n = step1();
    else if (h.indexOf("steg-2") >= 0) n = step2();
    else if (h.indexOf("steg-3") >= 0) n = step3();
    if (n > 0) note("Qvitta fyllde i " + n + " falt - granska, valj din resa och skicka in sjalv.");
    return n;
  }

  run();
  var last = location.hash;
  setInterval(function () {
    if (location.hash !== last) { last = location.hash; setTimeout(run, 400); }
    else { run(); }
  }, 700);
  log("skanetrafiken-fill loaded");
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

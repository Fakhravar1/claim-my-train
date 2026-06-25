// vasttrafik-fill-script — serves the Qvitta Västtrafik autofill script.
//
// Same contract as the other fill scripts: the "Qvitta" iOS Shortcut GETs this and runs it
// on Västtrafik's claim form. verify_jwt=false (PUBLIC, selector logic only, no secrets);
// the PII payload arrives via window.__QVITTA__ from the Shortcut and never touches us.
//
// Västtrafik's form (React SPA, https://www.vasttrafik.se/kundservice/forseningsersattning/
// ansok-om-ersattning/) puts BankID at the END, so — like SL/Skånetrafiken — we fill
// client-side and the user does BankID + submit themselves. FILL ONLY, no submit (§8).
//
// SCOPE (first version): the journey from/to typeaheads (stable ids, the hardest-to-type
// part) + a best-effort planned departure date/time. The form ALSO has actual-arrival
// time + comments + personal + payout whose selects carry DYNAMIC numeric-suffix ids
// (date-select-10/14, hour-select-12/16, …) and split into planned/actual sections — those
// are left to the user and to the device-test refinement pass (this script is server-side,
// so tightening selectors is one redeploy, no Shortcut change).

const VERSION = "vasttrafik-fill-1 (2026-06-25)";

const SCRIPT = `
(function () {
  "use strict";
  var P = window.__QVITTA__ || {};
  var log = function (m) { try { console.log("[Qvitta] " + m); } catch (e) {} };

  function fire(el){ el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); }
  function nativeSet(el, value){
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, String(value)); fire(el);
  }
  function byId(id){ return document.getElementById(id); }

  // Västtrafik autocomplete: type the name, then click the matching suggestion.
  // Options are li[role=option].autocomplete-result with text "Hållplats<StopName>", so
  // we match on the station's first word (our "Göteborg C" vs their "Göteborg Central").
  function driveTypeahead(inputId, name) {
    if (!name) return;
    var el = byId(inputId); if (!el || el.getAttribute("data-qv") === name) return;
    nativeSet(el, name); el.setAttribute("data-qv", name);
    var firstWord = name.split(/[\\s,]/)[0].toLowerCase();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var opts = [].slice.call(document.querySelectorAll('li[role="option"].autocomplete-result, li[role="option"]'));
      var picked = null;
      for (var i = 0; i < opts.length; i++) {
        var t = (opts[i].textContent || "").toLowerCase();
        if (t.indexOf(firstWord) >= 0) { picked = opts[i]; break; }
      }
      if (!picked && opts.length) picked = opts[0];
      if (picked) { picked.click(); clearInterval(iv); log("typeahead " + inputId + " -> " + (picked.textContent || "").trim()); }
      else if (tries > 25) { clearInterval(iv); log("typeahead " + inputId + ": no options (fill manually)"); }
    }, 130);
  }

  // Best-effort: the FIRST <select> whose label starts "Dag" = planned departure date.
  // Its options are Swedish long dates ("Onsdag 24 juni 2026"); match by our journey date.
  function setPlannedDate(dateIso) {
    if (!dateIso) return false;
    var want;
    try {
      want = new Date(dateIso + "T00:00:00").toLocaleDateString("sv-SE",
        { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return false; }
    var sels = [].slice.call(document.querySelectorAll("select"));
    for (var i = 0; i < sels.length; i++) {
      var lab = (sels[i].getAttribute("aria-label") || "").toLowerCase();
      if (lab.indexOf("dag") !== 0 && lab.indexOf("dag") < 0) continue;
      for (var j = 0; j < sels[i].options.length; j++) {
        if (sels[i].options[j].text.trim().toLowerCase() === want.toLowerCase()) {
          sels[i].selectedIndex = j; fire(sels[i]); return true;
        }
      }
    }
    return false;
  }

  // Best-effort: the first time input = planned departure time.
  function setPlannedTime(hhmm) {
    if (!hhmm) return false;
    var t = document.querySelector('input[type="time"]');
    if (!t) return false;
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(t, hhmm); fire(t); return true;
  }

  var banner;
  function note(msg){ if(!banner){ banner=document.createElement("div");
    banner.style.cssText="position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;padding:10px 14px;border-radius:10px;background:#0E8C7E;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)";
    document.body.appendChild(banner);} banner.textContent=msg; }

  function run() {
    var n = 0;
    driveTypeahead("delay-compensation-trip-leg-selector-from-to-selector-from", P.origin);
    driveTypeahead("delay-compensation-trip-leg-selector-from-to-selector-to", P.destination);
    if (setPlannedDate(P.date)) n++;
    if (setPlannedTime(P.time)) n++;
    note("Qvitta fyllde i resan - komplettera ankomsttid och uppgifter, gör BankID och skicka in sjalv.");
    return n;
  }

  run();
  // Re-attempt while the SPA settles / across any in-page step changes.
  setInterval(run, 900);
  log("vasttrafik-fill loaded");
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

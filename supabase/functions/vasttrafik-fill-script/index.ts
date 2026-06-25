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

  // The date/time selects have NO aria-label and DYNAMIC numeric-suffix ids (validated
  // 2026-06-25), so target by the label-via-structure (label[for] or the closest
  // form-group's label/legend text).
  function selLabel(el) {
    var t = "";
    if (el.id) { var l = document.querySelector('label[for="' + el.id + '"]'); if (l) t = l.innerText; }
    if (!t) { var fg = el.closest('[class*="form-group"], [class*="field"], fieldset');
              if (fg) { var l2 = fg.querySelector("label, legend"); if (l2) t = l2.innerText; } }
    return (t || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }
  function findSelect(kw) {
    var ss = document.querySelectorAll("select");
    for (var i = 0; i < ss.length; i++) {
      if ((ss[i].offsetWidth || ss[i].offsetHeight) && selLabel(ss[i]).indexOf(kw) === 0) return ss[i];
    }
    return null;
  }
  function pickOption(sel, matches) {
    if (!sel) return false;
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      if (matches(o.value, o.text.trim())) { sel.selectedIndex = i; fire(sel); return true; }
    }
    return false;
  }

  // Planned departure: "Dag" select carries a yyyy-mm-dd VALUE (cleanest match); "Timme"/
  // "Minut" options are 2-digit text ("08","00") with unpadded values ("8","0").
  function setPlannedDate(dateIso) {
    return pickOption(findSelect("dag"), function (v) { return v === dateIso; });
  }
  function setPlannedTime(hhmm) {
    if (!hhmm) return 0;
    var hh = hhmm.slice(0, 2), mm = hhmm.slice(3, 5), n = 0;
    if (pickOption(findSelect("timme"), function (v, t) { return t === hh || v === String(parseInt(hh, 10)); })) n++;
    if (pickOption(findSelect("minut"), function (v, t) { return t === mm || v === String(parseInt(mm, 10)); })) n++;
    return n;
  }

  var banner;
  function note(msg){ if(!banner){ banner=document.createElement("div");
    banner.style.cssText="position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;padding:10px 14px;border-radius:10px;background:#0E8C7E;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)";
    document.body.appendChild(banner);} banner.textContent=msg; }

  function run() {
    var n = 0;
    driveTypeahead("delay-compensation-trip-leg-selector-from-to-selector-from", P.origin);
    driveTypeahead("delay-compensation-trip-leg-selector-from-to-selector-to", P.destination);
    // Only touch the date/time while section ① ("Så här var det tänkt…") is active. Section
    // ② ("Så här blev det") reuses the SAME Dag/Timme/Minut labels for the ACTUAL arrival, so
    // once the user has picked a departure (section ① collapses, the from field disappears) we
    // must NOT keep filling — that would overwrite the actual-arrival time with the planned one.
    var fromEl = byId("delay-compensation-trip-leg-selector-from-to-selector-from");
    var section1Active = fromEl && (fromEl.offsetWidth || fromEl.offsetHeight);
    if (section1Active) {
      if (setPlannedDate(P.date)) n++;
      n += setPlannedTime(P.time);
    }
    // Section ③ "Kontaktuppgifter" — a single personnummer field. Fill it when it appears
    // (after Nästa steg); the user then just does BankID. Only set when empty.
    var pnr = byId("contact-information-personal-identity-number") ||
              document.querySelector('[id*="personal-identity-number"]');
    if (pnr && !pnr.value && P.personnummer) { nativeSet(pnr, P.personnummer); n++; }
    note("Qvitta fyllde i resan - tryck Sök resa, välj din avgång, komplettera 'Så här blev det', gör BankID och skicka in sjalv.");
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

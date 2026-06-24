# The "Qvitta" iOS Shortcut (operator-agnostic autofill)

One Shortcut handles every BankID-gated operator (SL, Skånetrafiken, …). It's a
small **state machine** with two run-contexts:

- **Run 1 — from Qvitta** (deep link `shortcuts://run-shortcut?name=Qvitta&input=text&text=<JSON>`):
  the input is the trip JSON. Save it, then open the operator's form (the JSON's `url`).
- **Run 2 — from the Safari share sheet** (on the form, after BankID): read the saved
  JSON, fetch the operator's fill script (the JSON's `script`), run it on the page.

**Payload-driven:** the JSON carries `url` (where to open) and `script` (which fill
script to fetch). So adding an operator needs **no Shortcut change** — just a new edge
function + a website config row.

Name it exactly `Qvitta`; enable it in the Safari share sheet.

## Build steps (Shortcuts app → New Shortcut)

1. **Get Safari web pages and URLs from Share Sheet** — "If there's no input": **Continue**
2. **Text** → insert **Shortcut Input** (coerces the input to text)
3. **If** — `Text` **contains** `"op":"`  ← matches any operator (was `"op":"sl"`)

   **(Run 1 — inside the If)**
   4. **Save File** — `Shortcut Input` → iCloud Drive, Ask Where to Save **OFF**, path
      `Shortcuts/qvitta.json`, Overwrite **ON**
   5. **Get Dictionary from Input** ← input: `Shortcut Input`
   6. **Get Dictionary Value** — Get **Value** for `url` from the dictionary
   7. **Open URLs** ← that **Dictionary Value**

   **Otherwise** (Run 2)
   8. **Get File** — iCloud Drive, Show Document Picker **OFF**, path `Shortcuts/qvitta.json`
      → rename the output variable **SavedTrip**
   9. **Get Dictionary from Input** ← input: `SavedTrip`
   10. **Get Dictionary Value** — Get **Value** for `script` → rename output **ScriptURL**
   11. **Get Contents of URL** ← `ScriptURL` → rename output **FillScript**
   12. **Run JavaScript on Web Page** — page input: **Shortcut Input** (the Safari page),
       script:
       ```js
       window.__QVITTA__ = SavedTrip;   // insert SavedTrip
       FillScript                        // insert FillScript on its own line
       completion();
       ```
   13. **End If**

14. Shortcut settings: **Show in Share Sheet ON**, accepted types **URLs**.

## How you use it (per claim)

1. On qvitta.nu (iPhone), open a delay → **Ansök** → **Öppna [operator] via Qvitta**.
2. Log in with **BankID**.
3. On the form, **Share menu → Qvitta**. Fields fill; a green banner appears.
4. If a later step doesn't auto-fill, run **Share → Qvitta** again on that step.
5. **Review, pick your trip if asked, and submit yourself.** Qvitta never submits.

## Per-operator notes

- **SL** (`sl-fill-script`): 6-step wizard. Fills journey/date/time/reason/delay/Med SL,
  and bank clearing+account if you saved them in Settings. Ticket page is manual.
- **Skånetrafiken** (`skanetrafiken-fill-script`): 3 steps. Fills delay + from/to + date +
  time + ticket type (steg-1), payout choice (steg-2), email + mobil (steg-3). You pick
  the specific trip ("Sök resa") and tick the attestations. `swedishBank` needs no account
  (it pays to the account on your personnummer, which BankID prefills).

## Known fragile bit

The from/to **typeahead**: the script types the station name and clicks the matching
suggestion. If it misses on the device test, type it yourself and tell the dev — the
selector is fixed **server-side** in the fill script, no Shortcut change needed.

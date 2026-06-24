# The "Qvitta" iOS Shortcut (SL autofill)

How to build the iOS Shortcut that the SL claim flow hands off to. It's a small
**state machine** with two run-contexts:

- **Run 1 — from Qvitta** (deep link `shortcuts://run-shortcut?name=Qvitta&input=<JSON>`):
  the input is the trip JSON. Save it to a file, open SL in Safari.
- **Run 2 — from the Safari share sheet** (on the SL form, after BankID): the input
  is the Safari page. Read the saved JSON, fetch our fill script, run it on the page.

The shortcut **must be named exactly `Qvitta`** (the deep link targets that name) and
**must be enabled in the Safari share sheet**.

## Server endpoint it calls (Run 2)

```
GET https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/sl-fill-script
```

Returns the autofill JS (versioned server-side, so SL selector fixes never need a
Shortcut rebuild). It reads `window.__QVITTA__` and fills SL's form. Fill-only — it
never submits.

## Build steps (Shortcuts app → New Shortcut)

1. **If** — Condition: `Shortcut Input` **contains** `"op":"sl"`

   **(Run 1 branch — inside the If)**
   2. **Save File**
      - File: `Shortcut Input`
      - Service: iCloud Drive · Ask Where to Save: **OFF**
      - Destination path: `Shortcuts/qvitta-sl.json`
      - Overwrite If File Exists: **ON**
   3. **Open URLs**
      - URL: `https://sl.se/kundservice/forseningsersattning/resan`
      - (opens in Safari)

   **Otherwise** (Run 2 branch)
   4. **Get File**
      - Service: iCloud Drive · Show Document Picker: **OFF**
      - Path: `Shortcuts/qvitta-sl.json`  → output is the saved JSON text
      - (rename this magic variable to **SavedTrip** for clarity)
   5. **Get Contents of URL**
      - URL: `https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/sl-fill-script`
      - Method: GET
      - (rename output to **FillScript**)
   6. **Run JavaScript on Web Page**
      - (this action automatically takes the Safari page from the share sheet)
      - Script (insert the two variables where shown):
        ```js
        window.__QVITTA__ = SavedTrip;   // ← insert the SavedTrip variable here
        FillScript                        // ← insert the FillScript variable on its own line
        completion();
        ```
      - i.e. type `window.__QVITTA__ = `, insert **SavedTrip**, type `;` newline,
        insert **FillScript**, newline, type `completion();`
   7. **End If**

2. Shortcut settings (the ⓘ / details panel):
   - **Show in Share Sheet: ON**
   - Accepted types: **URLs** (and Safari web pages). Turn the rest off if you like.

## How you use it (per claim)

1. On qvitta.nu (iPhone), open an SL delay → **Ansök** → **Öppna SL via Qvitta**.
   (First run only: iOS asks permission to run the shortcut / open the URL — allow.)
2. Log in with **BankID** on SL.
3. When SL's form shows, open the **Share menu → Qvitta**. Fields fill; a green
   "Qvitta fyllde i …" banner appears.
4. If a later wizard step doesn't auto-fill, run **Share → Qvitta** again on that
   step. (Whether one run covers all steps depends on whether iOS keeps our page
   script alive across SL's in-page navigation — re-running is the safe fallback.)
5. **Review every field and submit yourself.** Qvitta never submits for you.

## What it fills vs. leaves to you

- **Fills:** journey (from/to via the search field, date, time), reason = Försening,
  missed-connection = Nej, delay band (from the detected delay), Med SL, and — if you
  saved bank details in Settings — the payout clearing/account.
- **You do:** the ticket page (`/biljett` — your SL-app id / card number; we don't
  have it), the BankID login, and the final submit.

## Known fragile bit

The **from/to search field** is a typeahead — the script types the station name and
clicks the matching suggestion. If origin/destination don't fill on the first device
test, just type them yourself, and tell the dev: the selector is fixed **server-side**
in `sl-fill-script` (no Shortcut change needed).

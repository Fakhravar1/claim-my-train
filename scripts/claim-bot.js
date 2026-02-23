// Local claim autofill bot (MVP).
// Usage:
//   npm run claim-bot
// Then the app can call POST http://127.0.0.1:8787/claim

import http from "node:http";
import { chromium } from "playwright";

const HOST = process.env.CLAIM_BOT_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.CLAIM_BOT_PORT || 8787);
const HEADLESS = process.env.CLAIM_BOT_HEADLESS !== "false";
const STOP_BEFORE_SUBMIT = process.env.CLAIM_BOT_STOP_BEFORE_SUBMIT !== "false";
const ACTION_DELAY_MS = Number(process.env.CLAIM_BOT_ACTION_DELAY_MS || "500");
const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";
const API_KEY = process.env.CLAIM_BOT_API_KEY || "";
const DUMMY_PERSONNUMMER = process.env.CLAIM_AUTOFILL_TEST_PERSONNUMMER || "19700901-3975";
const DUMMY_EMAIL = process.env.CLAIM_AUTOFILL_TEST_EMAIL || "test@example.com";

const json = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const settle = async (page) => {
  if (ACTION_DELAY_MS > 0) {
    await page.waitForTimeout(ACTION_DELAY_MS);
  }
};

const tryFillFirst = async (page, selectors, value) => {
  if (!value) return false;
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    const isEditable = await loc.isEditable().catch(() => false);
    if (!isEditable) continue;
    try {
      await loc.fill(String(value));
      await settle(page);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
};

const tryFillByLabel = async (page, labels, value) => {
  if (!value) return false;
  for (const label of labels) {
    const loc = page.getByLabel(label, { exact: false }).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    const isEditable = await loc.isEditable().catch(() => false);
    if (!isEditable) continue;
    try {
      await loc.fill(String(value));
      await settle(page);
      return true;
    } catch {
      // try next label
    }
  }
  return false;
};

const clickFirstVisible = async (page, selectors) => {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    try {
      await loc.click({ timeout: 2000 });
      await settle(page);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
};

const textVisible = async (page, regex) => {
  const loc = page.getByText(regex).first();
  if ((await loc.count()) === 0) return false;
  return await loc.isVisible().catch(() => false);
};

const normalizeStationName = (value) => {
  if (!value) return value;
  const trimmed = String(value).trim();
  const map = new Map([
    ["Malmö Centralstation", "Malmö C"],
    ["Malmö C", "Malmö C"],
    // Force Swedish spelling to improve dropdown match stability in this form.
    ["København H", "Köpenhamn H"],
    ["Kobenhavn H", "Köpenhamn H"],
    ["Köpenhamn H", "Köpenhamn H"],
    ["Köbenhavn H", "Köpenhamn H"],
  ]);
  return map.get(trimmed) ?? trimmed;
};

const ensureAppTicketSection = async (page) => {
  await clickFirstVisible(page, [
    "text=Appbiljett Skånetrafiken",
    "label:has-text('Appbiljett Skånetrafiken')",
  ]);
  await page.waitForTimeout(400);
};

const pad2 = (value) => String(value ?? "").padStart(2, "0");

const splitTime = (timeValue) => {
  const parts = String(timeValue ?? "").split(":");
  return {
    hh: pad2(parts[0] ?? "00"),
    mm: pad2(parts[1] ?? "00"),
  };
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeStationForCompare = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[øö]/g, "o")
    .replace(/[æä]/g, "a")
    .replace(/[å]/g, "a")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]/g, "");
const getPrimaryTextLine = (value) => String(value ?? "").split("\n")[0]?.trim() ?? "";

const dismissCookieBanner = async (page) => {
  const dismissed = await clickFirstVisible(page, [
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDecline",
    "#CybotCookiebotDialogBodyButtonDecline",
    "button:has-text('Avböj')",
    "button:has-text('Avboj')",
    "button:has-text('Neka')",
    "button:has-text('Endast nödvändiga')",
    "button:has-text('Endast nodvandiga')",
  ]);
  if (dismissed) {
    await settle(page);
  }
};

const selectTravelDate = async (page, isoDate) => {
  if (!isoDate) return false;

  const asDate = new Date(`${isoDate}T00:00:00`);
  const svLabel = Number.isNaN(asDate.getTime())
    ? null
    : new Intl.DateTimeFormat("sv-SE", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
        .format(asDate)
        .replace(".", "")
        .toLowerCase();

  // Prefer selecting by value (usually YYYY-MM-DD in this form),
  // then fall back to matching the rendered Swedish label.
  const candidates = page.locator("select").filter({ hasText: /mån|tis|ons|tor|fre|lör|sön/i });
  const selectCount = await candidates.count();
  for (let i = 0; i < selectCount; i += 1) {
    const select = candidates.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;

    try {
      await select.selectOption(isoDate);
      return true;
    } catch {
      // ignore and try label-based fallback below
    }

    if (svLabel) {
      try {
        const options = await select.locator("option").allTextContents();
        const match = options.find((opt) => opt.toLowerCase().replace(".", "").includes(svLabel));
        if (match) {
          await select.selectOption({ label: match.trim() });
          return true;
        }
      } catch {
        // continue scanning
      }
    }
  }

  return false;
};

const fillStep2SearchForm = async (page, payload) => {
  const fromStation = normalizeStationName(payload.from);
  const toStation = normalizeStationName(payload.to);
  const { hh, mm } = splitTime(payload.departureTime);
  const expectedFrom = normalizeStationForCompare(fromStation);
  const expectedTo = normalizeStationForCompare(toStation);
  const expectedDepartureTime = String(payload.departureTime ?? "").trim();
  const expectedLine = String(payload.line ?? "").trim();
  const expectedDepartureToken = `${hh}:${mm}`;
  console.log(`[claim-bot][step2] start expected=${expectedDepartureToken} from='${fromStation}' to='${toStation}'`);

  const fillAndSelectAutocomplete = async (input, value, fieldName) => {
    if (!(await input.isVisible().catch(() => false))) return;
    const expected = normalizeStationForCompare(value);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await dismissCookieBanner(page);
      await input.focus().catch(() => {});
      await input.fill(String(value));
      await page.waitForTimeout(Math.max(350, ACTION_DELAY_MS));

      // Prefer exact option selection from this field's own listbox.
      let selectedFromList = false;
      const stopTypeRegex = /hållplats|hallplats|station|stn/i;
      const listboxId = await input.getAttribute("aria-controls").catch(() => null);
      const scopedOptions = listboxId
        ? page.locator(
            `#${listboxId}[role='listbox'] [role='option'], #${listboxId}[role='listbox'] li, #${listboxId} [role='option'], #${listboxId} li`
          )
        : page.locator("[role='listbox']:visible [role='option'], [role='listbox']:visible li");
      const candidates = [];
      const collectCandidates = async (options) => {
        const optionCount = await options.count();
        for (let i = 0; i < optionCount; i += 1) {
          const option = options.nth(i);
          if (!(await option.isVisible().catch(() => false))) continue;
          const optionText = await option.textContent().catch(() => "");
          const optionPrimary = normalizeStationForCompare(getPrimaryTextLine(optionText));
          const optionFull = normalizeStationForCompare(optionText);
          const primaryRaw = getPrimaryTextLine(optionText);
          const isVariantDestination =
            /\(/.test(primaryRaw) ||
            /metro|bussterminal|airport|flygplats|stn/i.test(primaryRaw);
          const isExact = optionPrimary === expected || optionFull === expected;
          const isStopType = stopTypeRegex.test(String(optionText ?? ""));
          if (!isExact && !isStopType) continue;
          // For "Till", only allow exact first-line station match to avoid drift.
          const allowPrefix = fieldName !== "To";
          const isPrefix = allowPrefix && optionPrimary.startsWith(expected);
          if (!isExact && !isPrefix) continue;
          if (fieldName === "To" && isVariantDestination) continue;
          candidates.push({
            option,
            optionPrimary,
            score: isExact ? 0 : 1,
            length: optionPrimary.length,
          });
        }
      };

      // Wait briefly for this field's options to appear after typing.
      for (let waitTick = 0; waitTick < 4; waitTick += 1) {
        if ((await scopedOptions.count()) > 0) break;
        await page.waitForTimeout(120);
      }

      // Deterministic fix for destination autocomplete:
      // for "Till", click the first suggestion in the scoped listbox.
      if (fieldName === "To") {
        const firstScoped = scopedOptions.first();
        if (
          (await firstScoped.count()) > 0 &&
          (await firstScoped.isVisible().catch(() => false))
        ) {
          await firstScoped.click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(Math.max(200, ACTION_DELAY_MS));
          const afterFirstClick = normalizeStationForCompare(await input.inputValue().catch(() => ""));
          if (afterFirstClick === expected) {
            return;
          }
        }
      }

      await collectCandidates(scopedOptions);
      candidates.sort((a, b) => (a.score - b.score) || (a.length - b.length));
      if (candidates.length > 0) {
        for (const candidate of candidates) {
          try {
            await candidate.option.click({ timeout: 1500 });
            selectedFromList = true;
            break;
          } catch {
            // try next candidate
          }
        }
      }
      if (!selectedFromList && fieldName !== "To") {
        // As a last attempt, use keyboard but still require strict post-verification.
        await input.press("ArrowDown").catch(() => {});
        await input.press("Enter").catch(() => {});
      }

      await page.waitForTimeout(Math.max(250, ACTION_DELAY_MS));
      const currentValue = await input.inputValue().catch(() => "");
      const normalizedCurrent = normalizeStationForCompare(currentValue);
      if (normalizedCurrent === expected) {
        return;
      }
    }

    const finalValue = await input.inputValue().catch(() => "");
    throw new Error(
      `${fieldName} station mismatch after selection. Expected '${value}', got '${finalValue}'.`
    );
  };

  // Step 2 has two identical placeholders; fill first as From and second as To.
  const stationInputs = page.locator("input[placeholder*='Hållplats'], input[placeholder*='hallplats']");
  const stationCount = await stationInputs.count();
  if (stationCount >= 2) {
    const fromInput = stationInputs.nth(0);
    const toInput = stationInputs.nth(1);
    const currentFrom = normalizeStationForCompare(await fromInput.inputValue().catch(() => ""));
    const currentTo = normalizeStationForCompare(await toInput.inputValue().catch(() => ""));

    if (currentFrom !== expectedFrom) {
      await fillAndSelectAutocomplete(fromInput, fromStation, "From");
      await fromInput.press("Tab").catch(() => {});
      await page.waitForTimeout(Math.max(150, ACTION_DELAY_MS));
    }

    if (currentTo !== expectedTo) {
      await fillAndSelectAutocomplete(toInput, toStation, "To");
    }
  }

  // Date field in step 2 must match requested travel date.
  const dateInput = page.locator(
    "input[type='date'], input[name*='datum' i], input[aria-label*='datum' i]"
  ).first();
  if ((await dateInput.count()) > 0 && (await dateInput.isVisible().catch(() => false))) {
    await dateInput.fill(payload.departureDate).catch(() => {});
    await dateInput.press("Tab").catch(() => {});
    await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
    const dateValue = await dateInput.inputValue().catch(() => "");
    if (!String(dateValue).startsWith(payload.departureDate)) {
      throw new Error(
        `Date mismatch in step 2. Expected '${payload.departureDate}', got '${dateValue}'.`
      );
    }
  }

  const selectOptionWithFallback = async (select, target) => {
    const asNumber = String(Number(target));
    const attempts = [
      () => select.selectOption(target),
      () => select.selectOption(asNumber),
      () => select.selectOption({ value: target }),
      () => select.selectOption({ value: asNumber }),
      () => select.selectOption({ label: target }),
      () => select.selectOption({ label: asNumber }),
    ];
    for (const run of attempts) {
      try {
        await run();
        return true;
      } catch {
        // continue trying alternate option formats
      }
    }
    return false;
  };

  const chooseDropdownValue = async (trigger, target) => {
    await trigger.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(Math.max(150, ACTION_DELAY_MS));
    const exact = page.locator("[role='option'], li").filter({
      hasText: new RegExp(`^\\s*0?${escapeRegExp(String(Number(target)))}\\s*$`),
    }).first();
    if ((await exact.count()) > 0 && (await exact.isVisible().catch(() => false))) {
      await exact.click({ timeout: 1500 }).catch(() => {});
      return true;
    }
    await trigger.press("Home").catch(() => {});
    for (let i = 0; i < Number(target); i += 1) {
      await trigger.press("ArrowDown").catch(() => {});
    }
    await trigger.press("Enter").catch(() => {});
    return true;
  };

  const verifySelectValue = async (select, expected) => {
    const value = await select.inputValue().catch(() => "");
    const selectedText = await select.locator("option:checked").first().textContent().catch(() => "");
    return value === expected || value === String(Number(expected)) ||
      String(selectedText).trim() === expected || String(selectedText).trim() === String(Number(expected));
  };

  const ensureStep2JourneySelected = async () => {
    const logSelect = (msg) => console.log(`[claim-bot][step2-select] ${msg}`);
    const hasSelectedJourney = async () => {
      const checkedNative = page
        .locator("input.st-radio-button__input[type='radio'][name='journey']:checked")
        .first();
      if ((await checkedNative.count()) > 0) return true;
      const checkedAria = page
        .locator(".st-search-rgol-result [role='radio'][aria-checked='true']")
        .first();
      if ((await checkedAria.count()) > 0) return true;
      return false;
    };

    if (await hasSelectedJourney()) {
      logSelect("already selected before action");
      return true;
    }

    const forceSelectJourneyByTime = async () => {
      const timeToken = expectedDepartureToken || expectedDepartureTime;
      if (!timeToken) return false;
      const selected = await page.evaluate((rawToken) => {
        const tokenMatch = String(rawToken ?? "").match(/\d{1,2}:\d{2}/);
        const timeToken = tokenMatch ? tokenMatch[0] : String(rawToken ?? "");
        const normalize = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
        const labels = Array.from(document.querySelectorAll("label[for^='journey-']"));
        const targetLabel = labels.find((label) => normalize(label.textContent).includes(timeToken));
        if (!targetLabel) return false;
        const id = targetLabel.getAttribute("for");
        if (!id) return false;
        const input = document.getElementById(id);
        if (!(input instanceof HTMLInputElement)) return false;
        if (input.type !== "radio") return false;

        // Trigger same path as user click.
        targetLabel.click();
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return input.checked;
      }, String(timeToken).trim());
      return Boolean(selected);
    };

    if (await forceSelectJourneyByTime()) {
      await page.waitForTimeout(120);
      if (await hasSelectedJourney()) {
        logSelect("selected via forceSelectJourneyByTime");
        return true;
      }
    }

    const scoreText = (rawText) => {
      const text = normalizeStationForCompare(rawText);
      let score = 0;
      if (expectedDepartureTime && text.includes(normalizeStationForCompare(expectedDepartureTime))) score += 6;
      if (text.includes(expectedFrom)) score += 3;
      if (text.includes(expectedTo)) score += 3;
      if (expectedLine && text.includes(normalizeStationForCompare(expectedLine))) score += 1;
      return score;
    };

    // Primary strategy from inspect:
    // radio input has class `st-radio-button__input` and label is `label[for='journey-x']`.
    const journeyInputs = page.locator("input.st-radio-button__input[type='radio'][name='journey']");
    const inputCount = await journeyInputs.count();
    logSelect(`journey input count: ${inputCount}`);
    const scoredInputs = [];
    for (let i = 0; i < inputCount; i += 1) {
      const input = journeyInputs.nth(i);
      const id = await input.getAttribute("id").catch(() => null);
      if (!id) continue;
      const label = page.locator(`label[for='${id}']`).first();
      if (!(await label.count())) continue;
      if (!(await label.isVisible().catch(() => false))) continue;
      const text = await label.textContent().catch(() => "");
      const score = scoreText(text);
      if (score <= 0) continue;
      scoredInputs.push({ input, label, score });
    }
    scoredInputs.sort((a, b) => b.score - a.score);
    logSelect(`scored input candidates: ${scoredInputs.length}`);
    for (const item of scoredInputs) {
      await item.label.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
      if (await item.input.isChecked().catch(() => false)) {
        logSelect("selected via label click");
        return true;
      }
      await item.input.check({ force: true }).catch(() => {});
      await page.waitForTimeout(Math.max(80, ACTION_DELAY_MS));
      if (await item.input.isChecked().catch(() => false)) {
        logSelect("selected via forced input.check()");
        return true;
      }
    }
    if (await hasSelectedJourney()) {
      logSelect("selected after input strategy");
      return true;
    }

    // Use the exact route structure from inspect.
    const routes = page.locator(".st-search-rgol-result__route");
    const routeCount = await routes.count();
    logSelect(`route container count: ${routeCount}`);
    const candidates = [];
    for (let i = 0; i < routeCount; i += 1) {
      const route = routes.nth(i);
      if (!(await route.isVisible().catch(() => false))) continue;
      const text = await route.textContent().catch(() => "");
      const score = scoreText(text);
      if (score <= 0) continue;
      candidates.push({ route, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    logSelect(`route candidates: ${candidates.length}`);

    for (const candidate of candidates) {
      const route = candidate.route;
      const radioButtonRoot = route.locator("div.st-radio-button").first();
      const radioWrap = route.locator(".st-radio-button__radio-wrapper").first();
      const radioLabel = route.locator("label.st-radio-button__label, label[for^='journey-']").first();
      const routeTime = route.locator(".st-search-rgol-result__route__time, .st-rgol-journey").first();

      // The click listener is attached on div.st-radio-button in this UI.
      if ((await radioButtonRoot.count()) > 0 && (await radioButtonRoot.isVisible().catch(() => false))) {
        await radioButtonRoot.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
        if (await hasSelectedJourney()) {
          logSelect("selected via div.st-radio-button click");
          return true;
        }
      }
      if ((await radioWrap.count()) > 0 && (await radioWrap.isVisible().catch(() => false))) {
        await radioWrap.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
        if (await hasSelectedJourney()) {
          logSelect("selected via .st-radio-button__radio-wrapper click");
          return true;
        }
      }
      if ((await radioLabel.count()) > 0 && (await radioLabel.isVisible().catch(() => false))) {
        await radioLabel.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
        if (await hasSelectedJourney()) {
          logSelect("selected via label click (route strategy)");
          return true;
        }
      }
      if ((await routeTime.count()) > 0 && (await routeTime.isVisible().catch(() => false))) {
        await routeTime.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
        if (await hasSelectedJourney()) {
          logSelect("selected via route time click");
          return true;
        }
      }
      await route.click({ timeout: 1200 }).catch(() => {});
      await page.waitForTimeout(Math.max(100, ACTION_DELAY_MS));
      if (await hasSelectedJourney()) {
        logSelect("selected via route container click");
        return true;
      }
    }

    logSelect("selection failed after all strategies");
    return false;
  };

  const hourSelectByLabel = page.locator("xpath=//*[contains(normalize-space(.), 'Timmar')]/following::*[self::select or @role='combobox' or self::button][1]").first();
  const minuteSelectByLabel = page.locator("xpath=//*[contains(normalize-space(.), 'Minuter')]/following::*[self::select or @role='combobox' or self::button][1]").first();
  const hourSelect = hourSelectByLabel;
  const minuteSelect = minuteSelectByLabel;

  if ((await hourSelect.count()) > 0 && (await hourSelect.isVisible().catch(() => false))) {
    const hourTag = await hourSelect.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    if (hourTag === "select") {
      await selectOptionWithFallback(hourSelect, hh);
      if (!(await verifySelectValue(hourSelect, hh))) {
        throw new Error(`Hour mismatch in step 2. Expected '${hh}'.`);
      }
    } else {
      await chooseDropdownValue(hourSelect, hh);
    }
  }
  if ((await minuteSelect.count()) > 0 && (await minuteSelect.isVisible().catch(() => false))) {
    const minuteTag = await minuteSelect.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    if (minuteTag === "select") {
      await selectOptionWithFallback(minuteSelect, mm);
      if (!(await verifySelectValue(minuteSelect, mm))) {
        throw new Error(`Minute mismatch in step 2. Expected '${mm}'.`);
      }
    } else {
      await chooseDropdownValue(minuteSelect, mm);
    }
  }

  // Trigger search only once per step-2 state. If results are already shown, avoid re-trigger loop.
  const hasSearchResults = await textVisible(page, /välj resa|valj resa|träffar|traffar|resor/i);
  if (!hasSearchResults) {
    await clickFirstVisible(page, [
      "button:has-text('Sök resa')",
      "button:has-text('Sok resa')",
    ]);
    // Results render asynchronously after search; wait before selecting radio.
    await page.waitForTimeout(Math.max(1000, ACTION_DELAY_MS));
    await page
      .waitForSelector(".st-search-rgol-result__route, label[for^='journey-'], input[name='journey']", {
        timeout: 4000,
      })
      .catch(() => {});
  }
  console.log(`[claim-bot][step2] results visible=${await textVisible(page, /välj resa|valj resa|träffar|traffar|resor/i)}`);

  // Step 2 requires one journey option to enable "continue".
  const journeySelected = await ensureStep2JourneySelected();
  console.log(`[claim-bot][step2] journey selected=${journeySelected}`);
};

const ensureStep6ConsentsChecked = async (page) => {
  const consentPatterns = [
    /jag godkänner att mina personuppgifter behandlas av skånetrafiken/i,
    /jag har läst villkoren och accepterar dem/i,
    /jag intygar att de uppgifter jag angivit är sanningsenliga/i,
  ];

  await page.waitForSelector("label.st-checkbox", { timeout: 5000 }).catch(() => {});

  for (const pattern of consentPatterns) {
    const label = page.locator("label.st-checkbox").filter({ hasText: pattern }).first();
    if ((await label.count()) === 0) continue;
    await label.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await label.isVisible().catch(() => false))) continue;

    const input = label.locator("input.st-checkbox__input[type='checkbox']").first();
    const checkmark = label.locator(".st-checkbox__checkmark").first();
    const isAlreadyChecked = async () =>
      (await input.isChecked().catch(() => false)) ||
      ((await label.getAttribute("aria-checked").catch(() => "false")) === "true");

    if (await isAlreadyChecked()) continue;

    // Retry click paths because this UI can be timing-sensitive.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await label.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(Math.max(120, ACTION_DELAY_MS));
      if (await isAlreadyChecked()) break;

      if ((await checkmark.count()) > 0 && (await checkmark.isVisible().catch(() => false))) {
        await checkmark.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(Math.max(120, ACTION_DELAY_MS));
        if (await isAlreadyChecked()) break;
      }

      await input.check({ force: true }).catch(() => {});
      await page.waitForTimeout(Math.max(120, ACTION_DELAY_MS));
      if (await isAlreadyChecked()) break;
    }

    // Final fallback at DOM level.
    if (!(await isAlreadyChecked())) {
      const handle = await label.elementHandle();
      if (handle) {
        await page.evaluate((node) => {
          if (!(node instanceof HTMLLabelElement)) return;
          const inp = node.querySelector("input.st-checkbox__input[type='checkbox']");
          if (!(inp instanceof HTMLInputElement)) return;
          node.click();
          inp.checked = true;
          node.setAttribute("aria-checked", "true");
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }, handle).catch(() => {});
      }
      await page.waitForTimeout(Math.max(120, ACTION_DELAY_MS));
    }
  }
};

const fillKnownStepFields = async (page, payload) => {
  const fromStation = normalizeStationName(payload.from);
  const toStation = normalizeStationName(payload.to);

  await tryFillByLabel(
    page,
    ["Från hållplats", "Från station", "Startstation", "Var började resan"],
    fromStation
  );
  await tryFillByLabel(
    page,
    ["Till hållplats", "Till station", "Destination", "Vart skulle du resa"],
    toStation
  );
  await tryFillByLabel(page, ["Linje", "Tågnummer"], payload.line);
  await tryFillByLabel(
    page,
    ["Avgångstid", "Tid för avgång", "När skulle du resa", "Planerad avgångstid"],
    payload.departureTime
  );
  await tryFillByLabel(
    page,
    ["Ankomsttid", "Tid för ankomst", "Planerad ankomsttid", "Faktisk ankomsttid"],
    payload.actualArrivalTime ?? payload.scheduledArrivalTime
  );
  await tryFillByLabel(page, ["BiljettID", "Biljettid"], payload.ticketId);
  await tryFillByLabel(page, ["Mobilnummer", "Telefonnummer"], payload.mobileNumber);

  // Step 2: detect via stable elements, not only heading text.
  const step2ElementCount = await page.locator(
    "input[placeholder*='Hållplats'], input[placeholder*='hallplats'], .st-search-rgol-result, input[name='journey']"
  ).count();
  if (step2ElementCount > 0 || (await textVisible(page, /sök den resa som blev försenad|sok den resa som blev forsenad/i))) {
    await fillStep2SearchForm(page, payload);
  }

  // Step 3 (Kostnader): choose Prisavdrag option.
  const onCostsStep =
    (await textVisible(page, /steg\s*3/i)) ||
    (await textVisible(page, /kostnader/i)) ||
    (await textVisible(page, /prisavdrag/i));
  if (onCostsStep) {
    await clickFirstVisible(page, [
      "label:has-text('Prisavdrag')",
      "button:has-text('Prisavdrag')",
      "[role='radio']:has-text('Prisavdrag')",
      "text=Prisavdrag",
    ]);
    await page.waitForTimeout(250);
  }

  // Step 4+ (person details): fill dummy personnummer and email.
  await tryFillByLabel(
    page,
    ["Personnummer", "Personnummer (12 siffror)", "Personnummer (10 siffror)"],
    DUMMY_PERSONNUMMER
  );
  await tryFillByLabel(
    page,
    ["E-post", "Epost", "E-postadress", "Email"],
    DUMMY_EMAIL
  );
  await tryFillFirst(page, [
    "input[name*='personnummer' i]",
    "input[aria-label*='personnummer' i]",
    "input[placeholder*='personnummer' i]",
  ], DUMMY_PERSONNUMMER);
  await tryFillFirst(page, [
    "input[type='email']",
    "input[name*='email' i]",
    "input[name*='epost' i]",
    "input[aria-label*='e-post' i]",
    "input[placeholder*='e-post' i]",
  ], DUMMY_EMAIL);

  // Step after personal details: choose Värdekod payout option.
  const onPayoutStep =
    (await textVisible(page, /värdekod|vardekod/i)) ||
    (await textVisible(page, /kontant utbetalning/i)) ||
    (await textVisible(page, /svensk bank/i));
  if (onPayoutStep) {
    const pickedValueCode = await clickFirstVisible(page, [
      "label:has-text('Värdekod')",
      "button:has-text('Värdekod')",
      "[role='radio']:has-text('Värdekod')",
      "text=Värdekod",
    ]);
    if (!pickedValueCode) {
      // Fallback: set underlying radio/checkbox input for Värdekod option.
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("label"));
        const targetLabel = labels.find((l) => /värdekod|vardekod/i.test(l.textContent || ""));
        if (!targetLabel) return;
        targetLabel.click();
        const forId = targetLabel.getAttribute("for");
        if (!forId) return;
        const input = document.getElementById(forId);
        if (!(input instanceof HTMLInputElement)) return;
        input.checked = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }

  // Step 6 (summary): check all visible, enabled checkboxes (consents), but do not submit.
  const onFinalSummaryPage =
    ((await textVisible(page, /ansökan om ersättning\s*-\s*steg\s*6|ansokan om ersattning\s*-\s*steg\s*6/i)) ||
      (await textVisible(page, /steg\s*6\s*av\s*6/i))) &&
    (await textVisible(page, /kontrollera dina uppgifter/i));
  if (onFinalSummaryPage) {
    await ensureStep6ConsentsChecked(page);
  }
};

const runClaimFlow = async (payload) => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(CLAIM_START_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.waitForTimeout(1200);
    await dismissCookieBanner(page);
    await ensureAppTicketSection(page);
    await selectTravelDate(page, payload.departureDate);

    // Best-effort field filling on step 1.
    await tryFillFirst(page, [
      "input[type='date']",
      "input[name*='datum' i]",
      "input[aria-label*='datum' i]",
    ], payload.departureDate);

    await tryFillFirst(page, [
      "input[name*='mobil' i]",
      "input[aria-label*='mobil' i]",
      "input[placeholder*='mobil' i]",
    ], payload.mobileNumber);

    await tryFillFirst(page, [
      "input[name*='biljett' i]",
      "input[aria-label*='biljett' i]",
      "input[placeholder*='biljett' i]",
    ], payload.ticketId);

    // Step progression: attempt to move from step 1 to summary.
    let reachedSummary = false;
    const isOnFinalSummary = async () => {
      const step6Header = await textVisible(page, /ansökan om ersättning\s*-\s*steg\s*6|ansokan om ersattning\s*-\s*steg\s*6/i);
      const step6Of6 = await textVisible(page, /steg\s*6\s*av\s*6/i);
      const reviewHeading = await textVisible(page, /kontrollera dina uppgifter/i);
      return (step6Header || step6Of6) && reviewHeading;
    };
    for (let i = 0; i < 6; i += 1) {
      await fillKnownStepFields(page, payload);
      const onSummary = await isOnFinalSummary();
      if (onSummary) {
        reachedSummary = true;
        break;
      }

      // Deterministic step-5 to step-6 transition: if exact button exists, click it directly.
      const step6Button = page.locator("button:has-text('Fortsätt till steg 6, Summering')").first();
      if ((await step6Button.count()) > 0 && (await step6Button.isVisible().catch(() => false))) {
        await step6Button.scrollIntoViewIfNeeded().catch(() => {});
        const canClick = await step6Button.isEnabled().catch(() => true);
        if (canClick) {
          await step6Button.click({ timeout: 2500 }).catch(async () => {
            await step6Button.click({ force: true, timeout: 2500 }).catch(() => {});
          });
          await page.waitForTimeout(Math.max(1400, ACTION_DELAY_MS));
          if (await isOnFinalSummary()) {
            reachedSummary = true;
            break;
          }
          continue;
        }
      }

      const movedForward = await clickFirstVisible(page, [
        "button:has-text('Fortsätt till steg')",
        "button:has-text('Fortsätt')",
        "button:has-text('Nästa')",
      ]);
      if (!movedForward) break;
      await page.waitForTimeout(Math.max(1400, ACTION_DELAY_MS));
    }

    if (reachedSummary && !STOP_BEFORE_SUBMIT) {
      await ensureStep6ConsentsChecked(page);
      const submitClicked = await clickFirstVisible(page, [
        "button:has-text('Skicka')",
        "button:has-text('Bekräfta')",
        "button:has-text('Slutför')",
      ]);
      if (!submitClicked) {
        return {
          success: false,
          message: "Reached summary page but could not find submit button.",
        };
      }
      await page.waitForTimeout(1200);
    }

    if (HEADLESS) {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      return {
        success: reachedSummary || !STOP_BEFORE_SUBMIT,
        message: reachedSummary
          ? STOP_BEFORE_SUBMIT
            ? "Reached final summary page (dry run, submit skipped)."
            : "Reached final summary page and submitted."
          : "Autofill completed partially in headless mode.",
      };
    }

    if (reachedSummary) {
      await ensureStep6ConsentsChecked(page);
      return {
        success: true,
        message: STOP_BEFORE_SUBMIT
          ? "Reached final summary page. Review and submit manually."
          : "Reached final summary page and submitted.",
      };
    }

    return {
      success: false,
      message: "Could not reach final summary page automatically. Continue manually from the opened page.",
    };
  } catch (error) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return { success: false, message: error instanceof Error ? error.message : "Unknown bot error" };
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/claim") {
    if (API_KEY) {
      const authHeader = req.headers.authorization || "";
      const expected = `Bearer ${API_KEY}`;
      if (authHeader !== expected) {
        return json(res, 401, { success: false, message: "Unauthorized" });
      }
    }

    try {
      const payload = await readBody(req);
      const result = await runClaimFlow(payload);
      return json(res, result.success ? 200 : 500, result);
    } catch (error) {
      return json(res, 500, {
        success: false,
        message: error instanceof Error ? error.message : "Invalid request",
      });
    }
  }

  return json(res, 404, { success: false, message: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Claim bot running at http://${HOST}:${PORT}`);
});

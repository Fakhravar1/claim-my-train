// Local claim autofill bot (MVP).
// Usage:
//   npm run claim-bot
// Then the app can call POST http://127.0.0.1:8787/claim

import http from "node:http";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 8787;
const CLAIM_START_URL = "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan/";

const json = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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

const tryFillFirst = async (page, selectors, value) => {
  if (!value) return false;
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    await loc.fill(String(value));
    return true;
  }
  return false;
};

const runClaimFlow = async (payload) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(CLAIM_START_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await page.waitForTimeout(1200);

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

    return { success: true, message: "Claim page opened. Verify fields before submit." };
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

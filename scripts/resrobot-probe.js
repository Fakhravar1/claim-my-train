// Quick ResRobot probe runner.
// Usage:
//   set RESROBOT_API_KEY=...   (PowerShell/Command Prompt)
//   node scripts/resrobot-probe.js
//
// Writes a summary to notebooks/testing/resrobot-probe-output.json
// and prints a short summary to stdout. No API key is written to disk.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_KEY = process.env.RESROBOT_API_KEY;
if (!API_KEY) {
  console.error("Missing RESROBOT_API_KEY env var");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outPath = path.resolve(__dirname, "../notebooks/testing/resrobot-probe-output.json");

const base = "https://api.resrobot.se/v2.1";
const ids = {
  malmoC: "740000003",
  malmoHyllie: "740001586",
  lundC: "740000002",
};

const now = new Date();
const plus60 = new Date(now.getTime() + 60 * 60000);

const fmtDate = (d) => d.toISOString().slice(0, 10);
const fmtTime = (d) => d.toTimeString().slice(0, 5);

const endpoints = [
  {
    label: "departureBoard Malmö C (now)",
    url: `${base}/departureBoard?id=${ids.malmoC}&accessId=${API_KEY}&format=json&maxJourneys=50`,
    path: ["Departure"],
  },
  {
    label: "departureBoard Malmö Hyllie (now)",
    url: `${base}/departureBoard?id=${ids.malmoHyllie}&accessId=${API_KEY}&format=json&maxJourneys=50`,
    path: ["Departure"],
  },
  {
    label: "departureBoard Malmö C (+60 min)",
    url: `${base}/departureBoard?id=${ids.malmoC}&date=${fmtDate(plus60)}&time=${fmtTime(plus60)}&accessId=${API_KEY}&format=json&maxJourneys=50`,
    path: ["Departure"],
  },
  {
    label: "departureBoard Malmö C (direction Hyllie)",
    url: `${base}/departureBoard?id=${ids.malmoC}&direction=${ids.malmoHyllie}&accessId=${API_KEY}&format=json&maxJourneys=50`,
    path: ["Departure"],
  },
  {
    label: "arrivalBoard Malmö Hyllie",
    url: `${base}/arrivalBoard?id=${ids.malmoHyllie}&accessId=${API_KEY}&format=json&maxJourneys=50`,
    path: ["Arrival"],
  },
  {
    label: "trip Malmö C → Malmö Hyllie",
    url: `${base}/trip?originId=${ids.malmoC}&destId=${ids.malmoHyllie}&accessId=${API_KEY}&format=json`,
    path: ["Trip"],
  },
  {
    label: "trip Malmö C → Lund C",
    url: `${base}/trip?originId=${ids.malmoC}&destId=${ids.lundC}&accessId=${API_KEY}&format=json`,
    path: ["Trip"],
  },
  {
    label: "location.name search 'Malmö'",
    url: `${base}/location.name?input=${encodeURIComponent("Malmö")}&stationsonly=1&maxNo=20&accessId=${API_KEY}&format=json`,
    path: ["StopLocation"],
  },
  {
    label: "location.nearbystops Malmö C (coords)",
    url: `${base}/location.nearbystops?originCoordLat=55.609948&originCoordLong=13.00073&maxNo=20&accessId=${API_KEY}&format=json`,
    path: ["StopLocation"],
  },
];

const pickPath = (data, pathArr) => {
  let cur = data;
  for (const key of pathArr) {
    if (cur && typeof cur === "object" && key in cur) {
      cur = cur[key];
    } else {
      return undefined;
    }
  }
  return cur;
};

const fetchJson = async (label, url) => {
  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(url);
    status = res.status;
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { label, status, ms: Date.now() - started, error: "Non-JSON response", body: text.slice(0, 500) };
    }
    return { label, status, ms: Date.now() - started, data: json };
  } catch (err) {
    return { label, status, ms: Date.now() - started, error: err?.message || String(err) };
  }
};

const summarizeItems = (arr) => {
  if (!Array.isArray(arr)) return { count: 0 };
  const first = arr.slice(0, 3).map((item) => {
    if (item?.name) return item.name;
    if (item?.StopLocation?.name) return item.StopLocation.name;
    if (item?.direction) return `${item.name || ""} → ${item.direction}`.trim();
    return JSON.stringify(item).slice(0, 80);
  });
  return { count: arr.length, sample: first };
};

const main = async () => {
  const results = [];
  for (const ep of endpoints) {
    const res = await fetchJson(ep.label, ep.url);
    let items;
    if (res.data) {
      items = pickPath(res.data, ep.path) ?? res.data[ep.path.at(-1)] ?? [];
    }
    const summary = summarizeItems(items);
    results.push({
      label: ep.label,
      status: res.status,
      ms: res.ms,
      count: summary.count,
      sample: summary.sample,
      error: res.error,
    });
  }

  const output = {
    runAt: new Date().toISOString(),
    results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log("ResRobot probe complete:");
  for (const r of results) {
    const base = `${r.label} -> status ${r.status || "?"} in ${r.ms}ms`;
    if (r.error) {
      console.log(`${base}; error: ${r.error}`);
    } else {
      console.log(`${base}; count=${r.count}; sample=${(r.sample || []).join(" | ")}`);
    }
  }
  console.log(`\nFull output written to ${outPath}`);
};

main();




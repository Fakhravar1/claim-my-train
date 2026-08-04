# Sellpy arbitrage crawler — handover

**Status:** design phase, no code written yet.
**Date:** 2026-08-04
**Why this file exists:** the design conversation happened in a remote Claude Code session
whose egress policy blocks `sellpy.se`, so nothing could be fetched or tested against the
live site. Continue on a laptop with real network access.

> ⚠️ This project has **nothing to do with claim-my-train**. It lives on this branch only
> because that is where the session was scoped. It should get its own repo before any real
> code lands.

---

## 1. The idea

Buy underpriced second-hand clothing on Sellpy, warehouse it personally, relist it on
**Sellpy Circle** at a markup. Automate the discovery of what to buy, since Sellpy's
catalogue is far too large to browse manually.

Personal-use project, one operator, one account.

---

## 2. Verified facts about Sellpy

Researched and confirmed 2026-08-04. These numbers drive everything downstream.

| Fact | Value | Source |
|---|---|---|
| **Circle seller share** | **80%** of sale value | [Vad är Sellpy Circle?](https://intercom.help/sellpy/sv/articles/3177498-vad-ar-sellpy-circle) |
| Circle listing fee | none | same |
| Circle eligibility | only items **you previously bought on Sellpy** | same |
| Circle logistics | **you keep and ship the item**; Sellpy books shipping, sends a QR code; ship within **5 days** of sale | [Hur skickar jag en såld Circle-vara?](https://intercom.help/sellpy/sv/articles/3177574-hur-skickar-jag-en-sald-sellpy-circle-vara) |
| Circle listing flow | re-upload the ad from your profile, reusing Sellpy's existing item data; you set the price and update condition/photos | [Hur säljer jag en vara med Circle?](https://intercom.help/sellpy/sv/articles/3177610-hur-saljer-jag-ett-tidigare-kop-med-sellpy-circle) |
| Normal consignment share (for contrast) | 60% up to 500 kr, 70% above | [Nyheter24](https://nyheter24.se/nyheter/ekonomi/privatekonomi/1255337-salja-second-hand-sa-mycket-av-dina-pengar-tar-sidorna) |
| Price ladder | seller controls ~first 2 weeks; **auto-discounting from ~week 3**; floor **30 kr**; after ~90 days donated or recycled | [Hur prissätts mina varor?](https://intercom.help/sellpy/en/articles/1219089-how-are-my-items-priced) |
| Favourites | Sellpy notifies on **price drops** for favourited items, and on **new arrivals** for followed brands | [App Store listing](https://apps.apple.com/se/app/sellpy-k%C3%B6p-s%C3%A4lj-second-hand/id1594599102) |
| Favourite counts | shown publicly on listings as social proof | [Zarko Lindkvist](https://zarko.se/topp-20-e-handlare-del-2-favoritmarkering-av-produkter/) |

**Circle's 20% take rate vs. 30–40% for normal consignment is the structural gift.** The
whole business is built on it.

### Not yet verified — check these first
- Do **Circle listings** follow the same auto-discount ladder, or does the seller keep price control?
- Is there a cap on how many items one account can list via Circle?
- Can you re-Circle an item bought *from* someone else's Circle listing (i.e. can inventory cycle)?
- Who pays shipping — buyer, or deducted from the 80%?
- Any Circle-specific condition/quality gate at listing time?

---

## 3. The thesis

**Not** "find undervalued items." It is:

> You absorb forced-liquidation inventory from sellers on a hard 90-day deadline, and you
> have no deadline. You own a shelf; they own a countdown.

The dominant, automatable source of mispricing is **seasonality**. Sellpy's intake is driven
by closet clear-outs, which are themselves seasonal — winter coats flood in during spring
cleaning, get listed in April, decay all summer, hit the 30 kr floor in July, and get
recycled. Not because they're bad. Because they were listed in the wrong month.

Buy the coat at its floor in June, relist at the top of a fresh ladder in September. Storage
cost ≈ 0 because the shelf already exists.

### The key reframe: you never need absolute valuation

You do not need to know what an Acne tee is worth. You need to know **what it's worth in
November versus what it costs in June.** That's a ratio, and all the hard item-specific
unknowns cancel out of a ratio. Everything the trade requires is relative.

### Break-even math

```
profit = s · 0.8 · S − P        s = sell-through, S = your sale price, P = your buy price

for +40% on deployed capital:   S = 1.75 · P / s

  s = 1.0  →  S = 1.75 × P
  s = 0.6  →  S = 2.9  × P
  s = 0.4  →  S = 4.4  × P
```

**Sell-through is the binding constraint, not valuation.** Every unsold item is a 100% loss
plus shelf space plus handling time. This is why the buy has to be deep in the decay tail.

### The buy rule

```
clearing_ratio[brand, category, month] = median(clearing_price / landing_price)

est_clearing(item, target_month) = landing_price × clearing_ratio[brand, cat, target_month]

BUY IF:  0.8 × est_clearing(item, target_month) × p(sell)  >  price_now + costs
```

Every input comes from observations the system collects itself. No image search anywhere in it.

---

## 4. Decisions and rejected approaches

Recorded so they don't get re-proposed. Some of these were argued out over several rounds.

### Settled

| Decision | Reasoning |
|---|---|
| **Seasonality is the primary edge** | Mechanical, automatable, no judgment required. Explains why warehousing is the business. |
| **Relative valuation only** | Ratios cancel item-specific unknowns; absolute valuation is unnecessary and much harder. |
| **Use Sellpy's own notifications** as the event stream | Brand-follow = discovery, favourite = enrol in price-drop alerts, price-drop emails = the price time-series, sold/gone = terminal event. Free, sanctioned, zero infra. |
| **Log the landing price** as a feature | It's an *ask*, not a transaction — systematically too high (that's what the decay ladder proves). But Sellpy's algorithm prices consignment items **consistently**, so the bias cancels in ratios. Good relative signal, bad absolute one. |
| **Crawler as primary intake, email as supplement** | Leaning this way, not final. Emails only cover items you already favourited → cold start of a full season before the system can trade. A crawler gets the whole catalogue immediately. |
| **No auto-buy for now** | Real money, no undo. Ranked shortlist + manual click captures ~95% of the value. Revisit later, maybe never. |
| **Mass-favouriting is fine** | Ban risk was over-stated earlier and withdrawn — you're the revenue side. Real risk is *rate*: pace it (~100/day, not 5000/hour). |

### Rejected

- **Google reverse image search / Lens as the valuation engine.** No official API; Cloud Vision
  Web Detection is the nearest legitimate thing and returns pages, not prices. Sellpy's photos
  are their own studio shots so exact matches are near-zero; visually-similar returns "a black
  wool coat," which prices nothing. And it returns *asks*, not sales. Also: the brand is already
  in the listing — identification was never the bottleneck, price data is.
- **"Find badly-described listings" as the primary strategy.** Proposed and rejected: needs
  human judgment, doesn't automate, doesn't scale. May survive as a secondary signal via a
  vision model reading *Sellpy's own photos* for tags/model names on high-variance brands
  (e.g. Acne spans a 300 kr tee and a 3000 kr piece), but it is not the strategy.
- **Browser-driven Lens lookups as a pipeline stage.** Seconds per item × thousands of items.
  Fine as a manual assist on a 10-item daily shortlist at the *end* of the funnel; not at the top.

### Open risk to test

**Does favouriting affect the price decay?** Sellpy shows favourite counts publicly as social
proof. If likes feed the discount algorithm or seller behaviour at all, mass-favouriting the
items you want cheap is self-defeating — you'd prop up your own buy prices. Cheap test: favourite
half a matched set, leave the other half, compare decay slopes over a few weeks. **Worth knowing
before favouriting thousands of items.**

---

## 5. Immediate next step — site reconnaissance

None of this could be run remotely. It settles crawler feasibility and should be first.

```bash
# a) Is there bot protection, and whose?
curl -sI 'https://www.sellpy.se/item/WZuo5jbEVe' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' \
  | grep -iE 'http/|server:|cf-ray|cf-cache|x-vercel|set-cookie'

# b) Is item data server-rendered, or an empty JS shell?
curl -s 'https://www.sellpy.se/item/WZuo5jbEVe' -H 'User-Agent: Mozilla/5.0 ...' \
  | grep -oE '__NEXT_DATA__|__NUXT__|application/ld\+json|"price"|"brand"' | sort -u
```

Interpreting the result:

- **`cf-ray` present** → Cloudflare. Plain `requests`/`curl` will 403 regardless of user-agent;
  you need real browser automation (Playwright — already familiar from `claim-worker/submit_sj.py`).
- **`__NEXT_DATA__` or `application/ld+json` present** → jackpot. The full item payload sits in
  one JSON blob in the HTML. Crawling becomes trivial and robust to layout changes.
- **Neither, empty `<div id="root">`** → pure client-side SPA. Skip the HTML, go for the JSON API.

Then, regardless of outcome: open Sellpy in Chrome, **DevTools → Network → Fetch/XHR**, browse a
brand search, and capture the actual API calls — endpoint, query shape, auth header, page size.
That is the real ingestion surface and it will carry fields the UI never renders (intake date,
ladder position, discount schedule, original price estimate).

**Two hints:**
- The **mobile app's API is usually the softer target** — native apps can't do browser
  challenges, so they typically get a plain bearer-token JSON API with much lighter protection.
  Proxy the app (mitmproxy) to capture it.
- Run the crawler from a **Swedish residential IP**. Precedent: `respons.hlt.se` geo-blocked
  GitHub's US Azure runners on the other project. Here it's likely load-bearing, not just tidy.

---

## 6. Proposed v1 data model

Collection layer only. Valuable regardless of which strategy wins, and nothing in it depends
on solving valuation first.

```
items                 sellpy_id (PK), brand, category, size, condition,
                      landing_price, listed_at, photo_urls, raw_json

price_observations    item_id, price, observed_at
                      ← from price-drop emails + crawler snapshots

outcomes              item_id, terminal_event ('sold' | 'floor' | 'vanished'),
                      final_price, at
                      ← an item disappearing ABOVE the 30 kr floor ≈ sold at that price

inventory             item_id, cost, bought_at, target_relist_month,
                      status, relisted_at, sold_price
```

Analytics on top — clearing ratios by brand × category × month, sell-through, seasonal spread —
is a natural dbt mart.

**Phase 1 is collection only.** No valuation, no buying. It has to run for weeks before it can
say anything useful, which is exactly why it should start first.

---

## 7. Stack

Reuse the claim-my-train infrastructure wholesale — it happens to fit almost perfectly:

- **Supabase Postgres** — snapshot store
- **Raspberry Pi (`qvitta-pi`)** — crawler host; Swedish residential IP, unbilled, already running a self-hosted GH Actions runner
- **pg_cron** — scheduling
- **Resend** — the daily shortlist email
- **dbt** — clearing-ratio and seasonality marts
- **Playwright** — if bot protection requires a real browser (pattern already established in `claim-worker/`)

Separate Supabase project, separate repo.

---

## 8. Risks and obligations

- **ToS.** Crawling and automation very likely breach Sellpy's terms. Practical risk is low at
  modest rates for personal use, but the downside isn't "the scraper breaks" — it's losing the
  account you need for Circle. One account, slow, unglamorous.
- **Tax.** Systematic buy-to-resell in Sweden is **näringsverksamhet**, not tax-free sale of
  personal property. Look into **VMB** (vinstmarginalbeskattning) for second-hand goods. Settle
  this before scaling, not after.
- **Dead stock is the real risk**, not margin. See the sell-through math in §3.

---

## 9. Open questions to answer before building

1. **Which brands/categories?** Sets volume and cold-start length. A 200 kr-buy strategy needs
   volume and ruthless automation; a 1500 kr-buy strategy needs precision and tolerates manual
   work per item. The latter fits a one-person operation far better.
2. **Capital willing to sit on a shelf?** Determines how aggressive the buy rule can be.
3. **Crawler-primary or email-primary intake?** Leaning crawler (cold start), unresolved.
4. Everything in §2 "not yet verified" and the favourite/decay test in §4.

---

## 10. Suggested first session on the laptop

1. Run the §5 recon commands; paste the output to Claude.
2. Capture one item payload and one search-results payload from DevTools; paste those too.
3. From those, Claude can write the real schema instead of the §6 sketch.
4. Then build Phase 1: crawler + snapshot DB. Observe only.

Before writing a line of code, though — **do 5–10 round trips by hand.** Buy tail items,
relist them on Circle, record what actually sells and at what price. It's the only way to find
out whether the thesis is real, and it answers most of §2's unverified questions for free.

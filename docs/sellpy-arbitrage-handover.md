# Sellpy arbitrage crawler — handover

**Status:** design phase, no code written yet. **Site recon DONE 2026-08-04** (§5).
**Date:** 2026-08-04 (created), updated 2026-08-04 after laptop recon.
**Why this file exists:** the design conversation happened in a remote Claude Code session
whose egress policy blocks `sellpy.se`, so nothing could be fetched or tested against the
live site. That recon has since been run from a laptop — §5 now holds results, not commands.

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

### Resolved 2026-08-04 (operator knowledge)

| Question | Answer | Consequence |
|---|---|---|
| Do Circle listings auto-discount? | **No.** The seller keeps price control indefinitely. | **This is the thesis, confirmed structurally.** Consignment sellers are on a ladder and a clock; you are on neither. "You own a shelf; they own a countdown" is not a metaphor — it's the mechanism. |
| Who pays shipping? | **Sellpy pays it, out of the 20% cut.** | The 80% is genuinely net. The §3 break-even math stands unchanged. |

### Still not verified — check these first
- **Does the ~90-day donate/recycle expiry still apply to Circle listings?** No auto-discount is
  established; whether there is still a hard end-of-life is not. If there is, you have a countdown
  after all — quieter, but it changes the hold strategy. **Highest-value open question in this file.**
- Is there a cap on how many items one account can list via Circle?
- Can you re-Circle an item bought *from* someone else's Circle listing (i.e. can inventory cycle)?
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
| **Crawler as primary intake, email as supplement** | **SETTLED 2026-08-04 by the §5 recon.** Emails only cover items you already favourited → cold start of a full season before the system can trade. The API turned out to be unprotected, structured and cheap to poll, so the crawler's cost collapsed and the argument is one-sided. Emails stay as a supplementary event stream, not the backbone. |
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

## 5. Site reconnaissance — RESULTS (run 2026-08-04)

Probe item: `https://www.sellpy.se/item/WZuo5jbEVe` (Nike practice jersey, 280 SEK, 19 favourites).

### Bot protection: none

Plain `curl` with a desktop UA returns **HTTP 200**. Server is **Netlify**; no `cf-ray`, no
Cloudflare, no challenge, no rate-limit headers. **Playwright is not required** — the
`claim-worker/submit_sj.py` pattern is available but unnecessary. Nothing geo-blocked a Swedish
consumer connection; the Pi's residential IP is prudence, not necessity.

`robots.txt` allows `/item/*`. Disallowed: `/sale/*`, `/claims/*`, `/order/*`, `/my-circle-item/*`,
`/store/*/*/search*`. **Note that search paths are explicitly disallowed** — see §8.

### HTML: an empty shell

6,210 bytes. `<div id="app"></div>`, no `__NEXT_DATA__`, no `__NUXT__`, no `ld+json`.
Pure client-side SPA. **HTML scraping is a dead end** — which is the good branch, because it forces
the API, which is far richer.

### The backend, from the JS bundle

`market/index.D6vW3AL3.bundle.js` (~1 MB) exposes the whole stack:

| Layer | Endpoint | Notes |
|---|---|---|
| **Parse Server** | `https://sellpy-parse-prod.herokuapp.com/parse` | Primary object store. Browser SDK keys (`applicationId`, `javascriptKey`) are in the bundle in plain text — they are public-by-design client keys, not leaked secrets. |
| **GraphQL** | `https://sellpy-parse-prod.herokuapp.com/graphql` | Same host. Responds unauthenticated. **Introspection is disabled.** Serves `getTypesenseClientConfig`. |
| **Typesense** | config fetched via the GraphQL query above | The search index. **This is where price lives.** |
| Firebase functions | `europe-west1-sellpy-1098.cloudfunctions.net` | Not investigated |
| Sanity CMS | `ilmr7lwv.apicdn.sanity.io` | Editorial content, irrelevant |
| Images | `sellpy-parse-prod-files.s3.amazonaws.com` | Studio ("photoRobot") shots |

### Parse class `Item` is world-readable — but only by objectId

```bash
curl -s -X POST "https://sellpy-parse-prod.herokuapp.com/parse/classes/Item/<objectId>" \
  -H 'Content-Type: application/json' \
  -d '{"_method":"GET","_ApplicationId":"<appId>","_JavaScriptKey":"<jsKey>","_ClientVersion":"js4.3.1"}'
```

Returns the full 45-field record, unauthenticated. **`ItemCategory` and `ItemType` are readable
too** (full taxonomy in ~10 languages; `ItemType.freq` = lifetime corpus count for that type —
639,195 for "Träningströja"). **`ItemBrand` is permission-denied.**

**Critical constraint:** a Parse `find` (`where`) query returns `{"results":[]}` for any constraint
other than `objectId`. Broad enumeration through Parse is blocked by class-level permissions.
**So: discovery must come from the search index; Parse is enrichment-by-id only.** There is also no
item sitemap (the sitemap index covers only static/stores/categories/blog/campaign/types).

### What the Item record actually contains

Far more than the UI renders. Real values from the probe item:

| Field | Value | Why it matters |
|---|---|---|
| **`sellabilityEstimate`** | `{score: 0.792187095, isReliable: true, cutoff: 0.44, version: "3-mla"}` | **Sellpy's own per-item ML sell-probability, exposed.** See §5.1. |
| **`putOnShelfAt`** | `2026-06-16T13:43:29Z` | Exact ladder t₀ → precise days-on-shelf, not inferred |
| `assortedAt` / `photographedAt` / `dateProcessed` / `createdAt` | all dated | Full intake pipeline; `assortedAt` (2026-05-18) precedes listing by a month |
| `metadata` | `{size, color[], material[], brand, demography, pattern, countryOfOrigin, type, condition, productCode, sleeveLength}` | Fully structured. Duplicated into `metadata_en/de/da/fi/fr/nl/pl/cs/…` |
| `materialCompositions` | `[{name: "Base fabric", composition: [{material: "Polyester", percent: "100"}]}]` | Structured fibre content |
| `itemStatus` / `processingStatus` | `utlagd` / `described` | Terminal-event detection without scraping |
| `shelfId`, `site`, `productionSite` | `K-1-42-121-C-4`, `K` | Warehouse internals |
| `weight` | `0.17` (kg) | Shipping cost modelling |
| `itemAbTestFraction` | `0.4775…` | Stable per-item A/B bucket — items in different buckets may be priced differently. Worth controlling for. |
| pointers | `itemBrand`, `itemCategory`, `itemType`, `bag`, `container`, `user` | Taxonomy joins |
| `images` | 4 URLs | ~394 B of URL; store the path prefix, not the URLs |

**Price is NOT in the Item object.** It comes from Typesense.

### 5.1 The `sellabilityEstimate` field — read this before designing the buy rule

`{"score": 0.792187095, "isReliable": true, "cutoff": 0.44, "version": "3-mla"}`

What is **certain**: those are the values, on an item that is listed (`itemStatus: "utlagd"`),
whose score sits well above its cutoff.

What is **inferred** (label it as such; not yet verified):

- **`score`** = Sellpy's modelled probability that the item sells. They have the ground truth to
  train this — millions of listed items and their outcomes — so it is almost certainly a
  well-calibrated in-house model, not a heuristic.
- **`cutoff`** = the **accept/reject decision threshold applied at assortment time**. Sellpy does
  not list everything sellers post in; items below the bar are rejected (donated/recycled/returned)
  because listing costs them photography, storage and handling. `score ≥ cutoff` → list it. The
  timeline supports this: `assortedAt` 2026-05-18 → `putOnShelfAt` 2026-06-16.
- **`isReliable`** = whether the model had enough signal for this brand/category to trust the
  score. When false, presumably a fallback rule decides.
- **`version: "3-mla"`** = model version. **Scores and cutoffs are only comparable within a
  version.** Any ratio you learn must be keyed by version, or a silent model rollout will corrupt
  your history. Treat this like an SCD-2 problem.

**Why the cutoff being per-item is interesting.** It is stored *on the item*, not as a global
constant — which implies it can vary. Plausibly by category, or by warehouse capacity / season
(raise the bar when full). If it does vary, then **cutoff is itself a leading indicator**: a rising
cutoff in a category means Sellpy is getting pickier there, which means supply glut, which is
exactly when the buy side is cheap. That would be a free macro signal on the supply of your
own inventory. Unverified — needs a sample across categories and time.

**Why this matters more than anything else in this file.** §3 establishes that **sell-through is
the binding constraint** and the hardest term in the buy rule. Sellpy computes `p(sell)` per item
and hands it over for free, along with their own accept threshold. If their score predicts *your*
Circle sell-through, the hard term in the buy rule is solved on day one.

**Tests to run** (all cheap, all need only a sample of item ids):
1. Does `cutoff` vary by category / over time / by model version?
2. Does any listed item sit below its own cutoff? (Would falsify the accept-threshold reading.)
3. **Does `score` correlate with your realised sell-through?** The one that actually matters.
   Answerable only after the §10 manual round trips.

### Remaining recon (not done)

- **Capture the Typesense search call.** DevTools → Network → Fetch/XHR while browsing a brand
  search. Config comes from the GraphQL `getTypesenseClientConfig` query; the search key is a
  scoped, client-side, search-only key. Need: collection name, schema, facet fields, page size,
  and **whether price history / discount schedule is indexed** or only current price.
- **Check the mobile app API** (mitmproxy). Usually a softer, more generous surface — though with
  no bot protection on web, this is now a low priority.
- Verify whether `sellabilityEstimate` is present on *all* items or only recent ones.

---

## 6. v1 data model — written against the real API

Collection layer only. Nothing here depends on solving valuation first.

```
items                sellpy_id (PK, char(10))
                     brand_id, category_id, type_id      ← FK to small dims, NOT text
                     size, color, material, pattern, demography, condition, country_of_origin
                     product_code, weight_g
                     sellability_score real, sellability_cutoff real,
                     sellability_reliable bool, sellability_version text
                     ab_test_fraction real
                     assorted_at, photographed_at, put_on_shelf_at, date_processed  (timestamptz)
                     image_prefix                        ← the S3 path stem, NOT 4 full URLs
                     first_seen_at, last_seen_at

dim_brand /          id (smallint PK), name
dim_category /       + for category: parent_id, level, is_leaf   ← the taxonomy is a real tree
dim_type                                                            (Kläder > Sport > Överdelar)

price_observations   item_id, price int, observed_at
                     ← APPEND ONLY ON CHANGE. See the storage math below — this is the whole ballgame.

outcomes             item_id, terminal_event ('sold'|'floor'|'vanished'), final_price, at
                     ← an item disappearing ABOVE the 30 kr floor ≈ sold at that price.
                       `itemStatus` may make this observable directly — verify.

inventory            item_id, cost, bought_at, target_relist_month,
                     status, relisted_at, sold_price, circle_listing_id
```

Notes forced by the recon:
- **Do not store `raw_json`.** The API returns 6,805 B per item, of which 3,044 B is the same
  metadata repeated in ~10 languages. Locale-stripped it is 3,761 B; the genuinely useful subset
  is **1,337 B**. Typed columns are ~260 B. Keeping raw JSON costs 5–10× for zero analytic gain.
- **Normalise brand/category/type to dims.** Sellpy's own taxonomy is already a tree with stable
  objectIds, and `ItemCategory`/`ItemType` are readable — mirror it once, join by smallint.
  This is a straight conformed-dimension play (Kimball ch. 2): a handful of dim rows against
  hundreds of thousands of fact rows.
- **Key sellability by `version`.** A model rollout changes score semantics (§5.1).
- Analytics on top — clearing ratios by brand × category × month, sell-through, seasonal spread —
  is a natural dbt mart, same layering as claim-my-train.

### 6.1 Storage — how many items fit in Supabase's 500 MB free tier

Measured payloads and realistic Postgres row costs (heap + index overhead included):

| Per-item component | Bytes |
|---|---|
| `items` typed row, heap | ~260 |
| `items` indexes (PK + 2 secondary) | ~95 |
| one `price_observations` row (heap + index) | ~90 |
| one `outcomes` row | ~90 |
| *(if kept)* locale-stripped JSON, TOAST-compressed | ~1,400 |
| *(if kept)* full raw JSON, TOAST-compressed | ~2,500 |

Assume a ~90-day observable life per item. Then:

| Strategy | Per item | @500 MB | @400 MB usable |
|---|---|---|---|
| **Typed + price-on-change** (~12 ladder steps) | **1.5 kB** | **~330,000** | **~260,000** |
| Typed + locale-stripped JSON + on-change | 2.6 kB | ~190,000 | ~154,000 |
| Typed + **daily** price snapshot (90 rows) | 8.5 kB | ~59,000 | ~47,000 |
| Full raw JSON + daily snapshot | 10.6 kB | ~47,000 | ~38,000 |

Use **400 MB as the usable figure**, not 500. The claim-my-train project measured 2–3 MB/day of
btree bloat on high-churn tables and reclaimed **107 MB in a single REINDEX** — budget headroom
for bloat, WAL and system catalogs, and schedule a `REINDEX` job (`reindex-churn-tables-bimonthly`
is the precedent).

**Two conclusions.**

1. **Snapshot on change, never on schedule.** It is worth ~5.5× more items than daily snapshots —
   a bigger lever than every other storage decision combined. The price ladder is a step function;
   storing 90 identical readings to capture 12 steps is pure waste. (Same instinct as
   `raw_departures` → `fct_departures`: dedup collapses ~10× at the staging boundary.)
2. **The ceiling is a red herring, because you don't need to keep observations.** Once an item
   hits its terminal event, the only thing analytics needs is one thin fact row —
   `(brand_id, category_id, listed_month, cleared_month, landing_price, clearing_price,
   days_to_clear, sellability_score, sold)` ≈ **~75 B with index**. Roll cleared items into that
   and drop their observation trail:

   > **~400 MB / 75 B ≈ 5.3 million cleared items.**

   So the right question is not "how many items fit" but "how long do I keep the raw observation
   trail" — and the answer is "until the item clears, plus a margin." That is exactly the
   claim-my-train §13 pattern: a **short raw buffer** (live items, full fidelity), a **durable thin
   fact** (cleared items, aggregate grain). The clearing-ratio mart is the asset; the observation
   table is disposable substrate.

**Practical sizing:** at ~260k concurrently-tracked live items you are nowhere near constrained by
Sellpy's catalogue being larger than that — you are constrained by §9 question 1, *which brands and
categories are you actually trading*. Storage does not force scoping; scoping is a strategy
decision that happens to also solve storage.

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
- ~~**Playwright**~~ — **not needed.** No bot protection (§5); plain HTTP against the JSON API is enough.

Separate Supabase project, separate repo.

---

## 8. Risks and obligations

- **ToS.** Crawling and automation very likely breach Sellpy's terms. Practical risk is low at
  modest rates for personal use, but the downside isn't "the scraper breaks" — it's losing the
  account you need for Circle. One account, slow, unglamorous.
- **The absence of bot protection is not permission.** §5 found no Cloudflare and a world-readable
  Parse class — that is a statement about what is *possible*, not what is *allowed*. Two specifics
  worth being clear-eyed about: (a) `robots.txt` **explicitly disallows the search paths**
  (`/store/*/*/search*`), which is the closest thing to a stated wish about automated catalogue
  traversal; (b) the Parse/Typesense keys are public-by-design browser keys, but using them outside
  a browser is still undocumented-API use. None of this is a technical blocker; all of it argues
  the same operational posture — **low rate, one account, no distributed crawling, no
  redistribution of the data.** Treat request rate as the risk variable, and keep it boring.
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
3. ~~Crawler-primary or email-primary intake?~~ **Resolved: crawler.** See §4.
4. Everything still in §2 "not yet verified" — above all **whether the 90-day expiry applies to
   Circle listings** — plus the favourite/decay test in §4 and the sellability tests in §5.1.
5. **How many items do you want tracked concurrently?** §6.1 puts the free-tier ceiling around
   260k live items on the sane storage strategy, and effectively unlimited once cleared items are
   rolled into the thin fact. So this is a strategy question (question 1), not a storage one.

---

## 10. Next session

§5 recon is done and §6 is now written against the real schema. What's left, in order:

1. **Do 5–10 round trips by hand. Before any code.** Buy tail items, relist on Circle, record what
   sells and at what price. It is the only way to find out whether the thesis is real, it answers
   most of §2's remaining unverified questions for free, and — now that §5.1 exists — it is the
   only way to test whether Sellpy's `sellability score` predicts *your* sell-through. That single
   correlation is worth more than the entire crawler.
   *(The original version of this file listed "build the crawler" as step 4 and the manual round
   trips as an afterthought. That was the wrong order and is now corrected.)*
2. **Capture the Typesense search call** from DevTools (§5, "Remaining recon"). That completes the
   ingestion picture — it is the only missing piece, since Parse can't enumerate.
3. **Then Phase 1: collection only.** Search index → item ids → Parse enrichment → Supabase.
   Observe, snapshot on change, no valuation, no buying.
4. Give it its own repo and Supabase project before step 3. It does not belong on a claim-my-train
   branch.

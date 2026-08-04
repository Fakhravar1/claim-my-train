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
  *Weak, ambiguous evidence (n=1):* one Circle listing ran **89 days** before selling and one
  consignment item was on the shelf **126 days** total — but only **78 of those days** as a live
  `MarketOffer`, with a 48-day gap between `putOnShelfAt` and the first offer. So the 90-day
  window may be counted from first offer, not from shelving, and nothing here rules the rule in or
  out. Resolvable directly from `MarketOffer` history at scale (§5.2).
- Is there a cap on how many items one account can list via Circle?
- Can you re-Circle an item bought *from* someone else's Circle listing (i.e. can inventory cycle)?
- Any Circle-specific condition/quality gate at listing time?

---

## 3. The thesis

> ⚠️ **Epistemic status of this whole section: THEORY.** Nothing below is established. The only
> trade data in existence is **three round trips** (§3.5), all of which sold, all hand-picked, with
> no visibility into the denominator. Three observations cannot distinguish between the competing
> explanations sketched here — they can only suggest which ones are worth testing first. Treat
> every claim in §3 as a hypothesis with an attached test, not as a finding.

The core structural claim — the one thing that is closer to fact than theory, because it follows
from Sellpy's published terms rather than from data:

> Consignment sellers operate under a price ladder and an end-of-life; Circle sellers set their own
> price and (as far as we know) do not auto-discount. **You own a shelf; they own a countdown.**

That asymmetry is real. What is *not* established is which mispricing it lets you harvest, or how
often, or at what sell-through.

### Theory A — seasonality (the original hypothesis)

Sellpy's intake is driven by closet clear-outs, which are seasonal — winter coats flood in during
spring cleaning, get listed in April, decay all summer, hit the floor in July, get recycled. Not
because they're bad; because they were listed in the wrong month. Buy the coat at its floor in
June, relist at the top of a fresh ladder in September. Storage cost ≈ 0.

**Status:** consistent with one of the three trades (the COS coat: bought 20 Aug, relisted 18 Oct,
sold 12 Nov — the best trade of the three). **One consistent observation is not evidence of a
seasonal effect** — that item also fits Theory B, and the two are confounded in every trade we have.

**Test:** requires the clearing-ratio table by (brand, category, month) across many items. Now
buildable retroactively from `MarketOffer` history (§5.2) rather than requiring months of polling.

### Theory B — mispricing at listing (raised 2026-08-04 by the §3.5 data)

An alternative reading of the same three trades: the edge is not in the *decay tail* but in the
**opening ask**. A long ladder means Sellpy's algorithm priced the item roughly right and the
market haggled it down — you buy a correctly-valued item at a modest discount, for a thin margin.
A *short* ladder at an absurdly low opening price means the algorithm was wrong, and that error is
the whole spread.

If true, this inverts the original buy rule, because `landing_price` cannot anchor the valuation
when `landing_price` is the thing that is wrong.

**Status:** the three trades are ordered exactly as Theory B predicts and exactly opposite to the
"buy deep in the tail" instruction (§3.5). That is suggestive and nothing more — n=3, hand-picked,
and Theory A explains at least one of them equally well.

**Candidate screen if it holds:** `sellabilityEstimate.score` high (Sellpy's own model says it
sells) **AND** opening ask low against the brand/category/condition norm. Both inputs are free from
the API. The contradiction between the two is the signal; neither number alone is (the highest-
scoring item of the three was the worst trade).

### Theory C — warehouse dwell as a clearance marker

`assortedAt` → `putOnShelfAt` gap may identify items relisted at clearance prices regardless of
worth. In the three trades the gaps were 2 days, 11 days, and **440 days**, and the 440-day item
was the best trade. **n=1 on the interesting end.** Cheap to test, free from the API, and it would
be a mechanical screen if real.

Theories B and C may be the same effect seen twice — a long-dwell item might just *be* an item with
a low opening ask. Not separable at n=3.

### The reframe that survives all three: you never need absolute valuation

You do not need to know what an Acne tee is worth. You need to know **what it's worth in November
versus what it costs in June** — or, under Theory B, what it's worth versus what Sellpy opened it
at. Both are ratios, and item-specific unknowns cancel out of a ratio.

This holds regardless of which theory wins, which is why it is the safest thing in this section.

### Break-even math

```
profit = s · k · S − P     s = sell-through, S = sale price, P = buy price, k = share you keep
```

**`k` is a lever, and two things move it** (both operator-supplied 2026-08-04, neither yet verified
in the data):

| Route | What you keep | Effective Sellpy fee |
|---|---|---|
| Circle payout taken as **cash** | 0.800 | 20.0% |
| Cash payout, next buy funded by **Amex** (1.35% cashback) | 0.811 | 18.9% |
| Circle payout taken as **Sellpy credit (+5%)** | **0.840** | **16.0%** |

Taking the payout as **Sellpy credit is worth ~3.6 pp more per cycle than cash + Amex cashback**,
and the two do not stack on the same krona — credit funds the next purchase directly, so no card is
involved and no cashback accrues. The rule that falls out: **recycle proceeds as credit; use Amex
only for fresh capital injected from outside.** The +5% is not a rounding error — it cuts Sellpy's
commission by a fifth, from 20% to 16%.

Caveat before relying on it: confirm whether the +5% credit conversion has a cap, an expiry, or any
restriction on what it can buy. An illiquid +5% is worth less than a liquid +1.35%.

Break-even at `k = 0.84`, by gross multiple `m = S/P`:

```
   m      s to break even     s for +40% on capital
  1.4          0.85                  1.19  (impossible)
  2.0          0.60                  0.83
  3.0          0.40                  0.56
  4.0          0.30                  0.42
  5.0          0.24                  0.33
  6.0          0.20                  0.28
```

**This table is the most decision-useful thing in the file.** It says the required sell-through
collapses as the multiple rises — at 5× you can be wrong three times out of four and still break
even, while at 1.4× you need 85% and can never reach +40% at any sell-through. It is also the
cleanest statement of why the §3.5 Carhartt trade (m = 1.43) was structurally bad and not just
unlucky.

**Sell-through is the binding constraint, not valuation.** Every unsold item is a 100% loss plus
shelf space plus handling time. **`s` is currently unknown and unestimated** — the three trades in
§3.5 all sold, but they were selected *because* they sold, so they say nothing about `s`. Until the
buy-count denominator exists, every projected return in this file is unfounded.

### The buy rule — provisional, and now suspect

The original formulation:

```
clearing_ratio[brand, category, month] = median(clearing_price / landing_price)
est_clearing(item, target_month)       = landing_price × clearing_ratio[brand, cat, target_month]
BUY IF:  0.8 × est_clearing(item, target_month) × p(sell)  >  price_now + costs
```

**Known weakness under Theory B:** it anchors on `landing_price`. If the opening ask is itself the
error being harvested, this multiplies a ratio onto a wrong base. A Theory-B rule would instead
estimate the item's value independently — e.g. the median realised clearing price for
(brand, category, condition, size band) — and define edge as `est_value / current_ask`.

Do not commit to either form yet. Both are computable from the same collected data (§6), so the
collection layer can be built without resolving this, and the rule chosen once there is enough
history to test A against B.

No image search appears in any version of it.

---

## 3.5 The entire evidence base: three round trips (2026-08-04)

**Read the caveats before the numbers.** This is the whole dataset. It is not a sample in any
statistical sense.

- **n = 3.**
- **All three sold. They were chosen because they sold.** Survivorship is total. Items bought and
  still sitting unsold are not represented, and dead stock is the stated primary risk (§8).
- **The denominator is unknown.** How many buys produced these three sales has not been recorded.
  Without it, sell-through `s` — the binding constraint — cannot be estimated at all.
- **Two of the three were relisted on the same day** (2025-10-18), so they are one batch under one
  set of autumn conditions, not two independent observations.
- Condition may be doing unattributed work: the weak trade was graded **"Acceptabelt"** (lowest),
  the two strong ones **"Bra"**. Cannot be separated from the other explanations at this n.

The mechanics below (prices, dates, the 0.8 share) are **verified from the API**, not recalled.
The *interpretation* is theory.

| | Carhartt WIP jacket | Ambika maxi dress | COS wool/cashmere coat |
|---|---|---|---|
| Condition | Acceptabelt | Bra | Bra |
| `sellabilityEstimate.score` | 0.9295 | 0.7327 | 0.8990 |
| `assortedAt` → `putOnShelfAt` | 2 d | 11 d | **440 d** |
| Sellpy **opening** ask | 1070 kr | 170 kr | **55 kr** |
| Ladder | 8 rungs / 78 d | 4 rungs / 42 d | 2 rungs / 13 d |
| **Bought at** | 420 (last rung) | 120 (last rung) | 50 |
| Held before relisting | 307 d | 161 d | 59 d |
| Circle ask | 800 → **cut to 600** | 600, no cut | 250, no cut |
| Days on Circle | 89 | 48 | **25** |
| Sold at | 600 | 600 | 250 |
| Net to seller (×0.8) | 480 | 480 | 200 |
| **Profit** | **+60 (+14%)** | **+360 (+300%)** | **+150 (+300%)** |
| Round trip | 395 d | 209 d | **84 d** |
| **Profit per krona-day** | 0.00036 | 0.0144 (40×) | **0.0357 (99×)** |

Aggregate: 590 kr deployed → 1,160 kr net → **+570 kr (+97%)**, over overlapping holds of 3–13
months. Annualised figures are deliberately omitted — with n=3 and no denominator they would be
meaningless.

**Confirmed mechanics (facts, not theory):**
- `p2pValueShare: {version: 1, customerShare: 0.8}` on the Circle listings — the 80% share is in
  the data.
- **Circle payouts lag the sale by 21–24 days; consignment payouts are same-day.** Measured on all
  six records: for the three items *bought* (Sellpy holds the stock) `paidAt` equals the last
  offer's `endedAt` exactly; for the three *Circle* sales it lags 24 / 21 / 22 days — presumably
  the shipping + return window, since on Circle you ship it yourself. Your capital is locked ~3
  weeks past the sale on every Circle trade. Cash-flow only, not margin.
- Circle listings are the same Parse class `Item`; a price change creates a new `MarketOffer` row,
  so your own relist history is queryable the same way as Sellpy's ladders.
- One Circle listing was **manually discounted** (800 → 600). Consistent with "no auto-discount" —
  the seller changed it.

**What the numbers appear to say — all of it theory:**
1. Capital efficiency varies by ~100× across three trades. If that spread is real and not noise,
   it dominates every other consideration, and **absolute buy price is the variable to watch.**
2. The trade the original §3 recommended (deep decay tail, Carhartt) was the worst of the three;
   the two short-ladder buys were the best. Hence Theory B.
3. Measured against Sellpy's own opening ask, the sale prices were 0.56× / 3.5× / 4.5×. The two
   profitable trades were the two where Sellpy opened low.
4. The highest `sellability score` produced the worst trade — so score alone is not a buy signal,
   and may even be inversely related to edge (a high score plausibly means correctly priced, which
   means no mispricing to harvest).

**The single most valuable next data point is not another winning trade — it is the buy count.**
Three wins tell you the upside exists. They tell you nothing about whether it pays.

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

### 5.2 `MarketOffer` — price history, and the discovery surface (found 2026-08-04)

**This is the most consequential finding in the file, and unlike §3 it is verified rather than
theorised.**

Price does not live on `Item`. It lives in Parse class **`MarketOffer`**, one row per price step:

```json
{"objectId":"…","item":{"__type":"Pointer","className":"Item","objectId":"…"},
 "pricing":{"amount":420,"currency":"SEK"},"region":"SE",
 "first":false,"latest":true,"createdAt":"…","endedAt":{"iso":"…"}}
```

Three properties, all confirmed against real items:

1. **It is the complete ladder, retroactively.** Querying by item pointer returns every historical
   price step with `createdAt`/`endedAt` — the full decay curve of an item that sold months ago.
   Filter `region: "SE"` or you get every market Sellpy operates in interleaved (a single step
   returned 11 rows across currencies).
2. **`first` / `latest` flags** give the opening ask and the clearing price directly, without
   reconstructing the sequence.
3. **It is enumerable without an item pointer.** `{"region":"SE","latest":true}` returns live
   offers for arbitrary items — unlike class `Item`, which only serves reads by `objectId`. So
   `MarketOffer` is *both* the discovery mechanism and the price history; `Item` is enrichment by
   id on top of it.

**Consequences:**

- **The "run for weeks before it says anything" premise is wrong.** Clearing ratios, ladder shapes,
  and time-to-clear can be computed from history that already exists. Phase 1 stops being a waiting
  game and becomes a backfill.
- **Typesense may not be needed at all.** It was assumed to be the only enumeration path; it isn't.
  Still worth capturing (facets, brand/category filters, and it is the *sanctioned* surface — see
  §8), but it is no longer load-bearing.
- **§6's `price_observations` table changes character** — it is a backfill target first and a
  polling target second. Poll only to catch *new* items and to close the gap since the last pull.
- Both sides of a trade are observable: your own Circle relist history is `MarketOffer` rows too.

⚠️ **Rate discipline matters more now, not less.** A retroactive full-history pull is exactly the
kind of traffic that gets noticed, and §8's real risk is the account, not the scraper. Backfill
slowly and narrowly — scope to the brands/categories you actually intend to trade (§9 q1) before
pulling anything at volume.

### Remaining recon (not done)

- **Capture the Typesense search call.** DevTools → Network → Fetch/XHR while browsing a brand
  search. Config comes from the GraphQL `getTypesenseClientConfig` query; the search key is a
  scoped, client-side, search-only key. Now optional rather than blocking (§5.2), but it carries
  facets and is the sanctioned path.
- **Establish how far back `MarketOffer` history actually goes**, and whether old rows are pruned.
  The oldest observed so far is Dec 2024, but nothing has been sampled deliberately.
- **Check the mobile app API** (mitmproxy). Low priority — no bot protection on web.
- Verify whether `sellabilityEstimate` is present on *all* items or only recent ones. Observed
  `version: "3"` on 2024–25 items and `"3-mla"` on a 2026 item, so the model has already rolled
  at least once — confirming the §5.1 warning that scores must be keyed by version.
- Check whether `traderaCategoryId` means items are cross-listed on Tradera. Two of the three
  traded items carry one. If Sellpy dual-lists, Tradera is a second, independent price signal —
  and possibly a second exit.

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

price_observations   item_id, price int, currency, region,
                     started_at, ended_at, is_first, is_latest, offer_id
                     ← MIRRORS `MarketOffer` (§5.2). NOT a polling artefact: each row is a real
                       price step Sellpy already recorded, backfillable retroactively. Filter
                       region='SE'. Naming it "observations" is now a slight misnomer — these are
                       Sellpy's own ladder rows, not our samples. Poll only for new/changed items.

outcomes             item_id, terminal_event ('sold'|'floor'|'vanished'), final_price, at
                     ← largely derivable rather than inferred: `itemStatus='betald'` marks a sale,
                       the `latest` MarketOffer's amount is the clearing price, and its `endedAt`
                       is the sale date. `paidAt` is the SELLER PAYOUT and runs 21–24 days later
                       (observed, n=3) — do not use it as the sale date.

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

0. **Recover the denominator.** Go back through the Sellpy purchase history and count every item
   bought with intent to resell, including the ones still unsold. Three wins are already recorded
   (§3.5); what is missing is how many buys produced them. **Sell-through is the binding constraint
   (§3), it is currently unestimated, and no amount of crawler work substitutes for this number.**
   It costs an hour and it is the single highest-value action available.
1. **Keep doing round trips by hand, and record every one — including the failures.** Deliberately
   buy across the space the theories disagree about: some deep-tail items (Theory A/original), some
   low-opening-ask items (Theory B), some long-dwell items (Theory C). Three trades cannot separate
   them; a dozen chosen adversarially might.
   *(The original version of this file listed "build the crawler" as step 4 and the manual round
   trips as an afterthought. That was the wrong order and is now corrected.)*
2. **Backfill `MarketOffer` history for a narrow, chosen slice** (§5.2) — one or two brands and
   categories, slowly. This is now possible retroactively, so the clearing-ratio table can exist
   before the crawler does. It is also the cheapest way to test Theories A/B/C at a scale three
   trades can't reach.
3. **Then Phase 1: collection only.** `MarketOffer` enumeration → item ids → `Item` enrichment →
   Supabase. Observe, no valuation, no buying.
4. Give it its own repo and Supabase project before step 3. It does not belong on a claim-my-train
   branch.

**Guiding principle for the next phase:** everything in §3 is theory and everything in §5 is
verified mechanism. Spend effort on the cheapest experiments that convert §3 entries into §5
entries, and resist building infrastructure that assumes any one theory is correct — the collection
layer in §6 is deliberately theory-neutral, and it should stay that way.

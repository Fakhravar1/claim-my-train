## 1. Unify desktop card layout with mobile (`src/themes/daylight/daylight.css`)

Currently `.row` on desktop (≥721px) is a 4‑column grid `72px 1fr auto auto` — time / route / status / action all on one line. Mobile (≤720px) uses the nicer stacked layout: **top** = time (left) + delay tag (right); **middle** = Från station ← arrow → Till station (right‑anchored); **bottom** = date · operator (left) + claim button + bell (right).

Change: promote the mobile layout to be the **default** and drop the desktop‑only 4‑column override.

- Remove the `@media(min-width:721px){ .cmt-daylight .row{grid-template-columns:72px 1fr auto auto;} }` rule (around line 384).
- Make `.row` a flex‑column card at all widths (already the mobile shape).
- On desktop, keep it visually tighter: larger horizontal padding, bigger station text (`clamp(1rem,1.4vw,1.25rem)`), arrow sized ~18px, action row right‑aligned, claim button auto‑width (not full‑width — the mobile `.btn{width:100%}` rule only fires ≤720px, so no change needed).
- Keep `.row__route` as `grid-template-columns: 1fr auto 1fr` so **Till** stays pinned right and the arrow stays centered (as it now does on mobile).

No changes to `Board.tsx` markup — the row already emits `row__time / row__route / row__line / row__status / row__action` in the order the mobile grid expects.

## 2. Remove the board caption (`src/components/daylight/Board.tsx`)

Delete the `else` branch that renders `<p className="board__cap">Välj <b>från</b> och <b>till</b>…</p>` (the station‑scoped `board__cap--station` variant stays — it's only shown when a station deep‑link is active). Optionally also drop the now‑unused `.board__cap` rule; leaving it is harmless.

## 3. Add nav buttons for the other sitemap pages (`src/components/daylight/shell.tsx`)

The nav today has only **FAQ** and **Så funkar det**. Add sibling `nav__cta` links to the main indexable content routes that already exist in the sitemap and as routes in `App.tsx`:

- **Ersättningsguide** → `/ersattning`
- **Förseningsstatistik** → `/forseningar`

Placed left of FAQ, same `nav__cta` style. This keeps the bar to 4 chips + auth button, which still fits on one mobile line at the current sizes (verified against the recent mobile‑tightening pass). Footer already links to `/integritet`, `/genvag`, Kontakt — leaving those footer‑only avoids nav overflow.

## Files touched
- `src/themes/daylight/daylight.css` — unify row layout across breakpoints; drop the desktop 4‑column override; small desktop polish (padding / station font‑size / arrow size).
- `src/components/daylight/Board.tsx` — remove the default board caption.
- `src/components/daylight/shell.tsx` — two new nav links.

No business logic or data changes.
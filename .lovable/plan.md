## Changes

### 1. Brand logo + larger nav text (`src/components/daylight/shell.tsx`)
- Replace the current `<span class="brand__mark" />` dot with a small SVG "Q" mark — a teal circle outline with a tail, sized ~28px, accent color matching the Daylight theme (`#0E8C7E`).
- Bump the `.brand` text size (currently small). Add a CSS override scoped under `.cmt-daylight .brand` in `src/themes/daylight/daylight.css` to increase font-size (~1.25rem), weight, and align the SVG vertically with the wordmark.

### 2. "Så funkar det" nav button (`src/components/daylight/shell.tsx`)
- The nav already has an anchor `<a href="#how">Så funkar det</a>` — the `ValueProps` section already has `id="how"`. Verify it works; if scroll isn't smooth, add `scroll-behavior: smooth` on `html` within the daylight scope, or convert to a click handler doing `scrollIntoView({behavior:"smooth"})`.
- Likely the user wants this as a more visible **button** rather than a plain link. Restyle the existing `#how` link as a button (`btn btn--quiet` style) so it reads as a CTA, while keeping the anchor jump.

### 3. Mobile horizontal scroll + clearer From/To (`src/themes/daylight/daylight.css`, possibly `Board.tsx`)
- Root cause of horizontal scroll on phone is almost certainly the `.board__controls` grid or `.row` flex laying out wider than the viewport. Fix by:
  - Adding `overflow-x: hidden` on `.cmt-daylight` body wrapper as a safety net.
  - Making `.board__controls` stack vertically (`grid-template-columns: 1fr`) below ~640px so Från/Till/Datum each take full width.
  - Making `.row` wrap (`flex-wrap: wrap`) on mobile and reducing min-widths; ensure `.row__stations` allows text to wrap instead of forcing overflow.
- Clearer From/To on mobile: in `StationField` (label + select), ensure labels "Från"/"Till" sit above full-width inputs with strong visual separation, and add a subtle arrow/divider between them on mobile so the direction reads naturally.

## Files touched
- `src/components/daylight/shell.tsx` — new Q logo SVG, restyle "Så funkar det" as a button.
- `src/themes/daylight/daylight.css` — larger brand text, mobile stack for `.board__controls`, fix row overflow, From/To clarity, smooth-scroll.
- (Possibly) `src/components/daylight/Board.tsx` — minor markup tweak if needed for mobile From→To layout.

No business logic / data changes.

## Question before building
For the Q logo — do you want (a) a simple geometric Q mark in the teal accent color matching the existing minimal aesthetic, or (b) something more distinctive (e.g. Q drawn as a train circle with a tail like a rail)?
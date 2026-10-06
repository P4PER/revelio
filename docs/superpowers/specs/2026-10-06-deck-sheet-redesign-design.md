# Deck sheet redesign - Design

**Date:** 2026-10-06
**Status:** draft, awaiting review
**Workspaces:** `core` (contract, layout, geometry, labels), `sheet` (painter, logo asset);
`web` and `bot` change only through `pickSheetEntries`
**Builds on:** `2026-10-04-deck-sheet-render-service-design.md` (the service, its contract
and its pixel budget, none of which this changes in kind)
**Mock:** "B - Hero banner" in the design study artifact
(https://claude.ai/artifact/UAtRLsnokstgQ1BbhKz4tR), drawn from real card art against
the local stack

## Problem

The sheet `@revelio/sheet` paints today (980 px wide) is a single column of bands, one per
card type, and wastes most of its height:

- **One band per type, whatever its size.** A lone Great Hall gets a full-width band of its
  own, header and all.
- **Rows are always portrait-tall.** Every row is `cardHeight` (185) high, so a row of
  landscape creatures (132 high) leaves 53 px of empty space under each one.
- **An empty heading.** "Main deck (76)" is a section with no cards, followed directly by
  "Creatures (28)".
- **No identity.** The deck is one line of gold text. The starting character is just
  another card band at the top, and the sheet carries no brand mark.
- **Quantity is small.** A 14 px gold disc hangs below each card, and every copy looks the
  same as one copy.

On the sample deck (Hagrid's Menagerie: 76 main, 8 sideboard, 26 distinct cards) the
sheet is 980 x 2209, 8.7 Mpx at 2x. Discord previews scale it to a sliver.

## Goals

- A banner that makes each deck recognisable: the starting character's art crop, the
  character card itself, the deck name, and the deck's makeup by type.
- A wider sheet (1440 px) that fits more cards per row: nine portrait or seven landscape
  instead of six or four.
- No wasted height: small type groups pack side by side, and each row is only as tall as
  the tallest card in it.
- Quantity readable at a glance, including in a downscaled Discord preview.
- The real Revelio logo in the bottom-right corner.

## Non-goals

- **Caching.** Section 5 of the render service spec still governs; nothing here changes
  the evidence it asks for.
- **A layout switch.** One design, not a choice of designs per request.
- **Larger art crops.** The crop ingest bakes is 520 x 325 (see section 4); that stays.
- **Lesson icons, cost curve, legality marks.** Possible later additions to the banner, not
  part of this change.
- **The web deck builder's own `DeckSheet` component** (`web/src/components/deck/deck-sheet.tsx`)
  is a drawer in the builder UI that happens to share the name. It is not the painted sheet
  and does not change.

## Design

### 1. The contract: one new optional field

`DeckSheetEntryInput` gains:

```ts
artCropVersion: z.number().int().nonnegative().max(SHEET_FIELD_LIMITS.imageVersion)
  .nullable().default(null)
```

- **Same bound as `imageVersion`.** It is the same kind of value: a file mtime in unix
  seconds, written by ingest.
- **Optional on the wire.** `.default(null)` keeps today's callers valid, which is what
  lets the service deploy before web and the bot (see Deployment).
- **Read only on the character entry.** The painter ignores it on every other zone.
  `pickSheetEntries` sends it as `null` on non-character entries, rather than leaving it
  out, so the request shape stays uniform.
- **Callers need no new query.** `DeckSheetEntry` adds `'artCropVersion'` to its `Pick`, and
  `DeckCardView` already carries the field: `getDeck` and `getCardViews` fill it from
  `cards.art_crop_version`. Web's `/api/deck-sheet` route and the bot's
  `requestDeckSheet` both pass views through `pickSheetEntries`, so neither needs changes
  of its own. Web's OG image (`lib/server/deck-og.ts`) already draws the same crop from
  the same field.
- **The body cap grows by the field.** `MAX_ENTRY_BYTES` in `sheet/src/server.ts` adds
  `'"artCropVersion":'` plus ten digits per entry, just as it already budgets
  `imageVersion`. The server test that pins `MAX_BODY_BYTES` against a maximal request
  covers it.

The URL is built with `artCropKey(cardId, artCropVersion)` from `core/src/images.ts` and
goes through `containedImageUrl` like every other key. The `cardId` allowlist already
covers it.

### 2. Layout model (`core/src/deck-sheet.ts`)

`layoutDeckSheet` stops returning a flat list of sections and returns the sheet's three
parts:

```ts
type DeckSheetBanner = {
  name: string              // the deck name, no "(Classic)" suffix any more
  eyebrow: string           // "Classic · 76 cards" / "Klassisch · 76 Karten"
  character: { card: DeckSheetCard; label: string; artCropVersion: number | null } | null
  makeup: { key: string; label: string; count: number; color: string }[]  // main zone only
}
type DeckSheetGroup = { key: string; title: string; count: number; color: string; cards: DeckSheetCard[] }
type DeckSheetZone = { title: string; count: number; groups: DeckSheetGroup[] }
type DeckSheetLayout = { banner: DeckSheetBanner; zones: DeckSheetZone[] }
```

- **The character lives only in the banner.** It is not a group, appears in no zone, and
  is not counted in any total: the zone counts and the makeup bar cover the main deck
  only, as the deck builder does.
- **Zones: main, then sideboard,** each only when it has cards. The main zone holds its
  type groups in today's order (`groupMainEntries`, with Lessons last). The sideboard is
  one group with no title of its own; the zone header labels it.
- **The makeup bar** has one segment per main-zone group, in the same order, sized by
  quantity. Each group's colour comes from `DECK_SHEET_COLORS.group`, a fixed map: Lessons
  gold (`#E8B23A`) and the rest indigo/parchment tints from the brand guide, so the
  colours are the same on every sheet.
- **Text is composed here, not in the painter.** The painter only places strings it is
  given, as today.

### 3. Geometry (`computeSheetGeometry`)

All values are CSS pixels; the painter multiplies by the scale, as today.

| | Value | Note |
|---|---|---|
| Sheet width | 1440 | was 980 |
| Side padding | 40 | content width 1360 |
| Banner height | 320 | full bleed, no side padding |
| Card, portrait | 112 x 157 | 5:7, as today, smaller |
| Card, landscape | 157 x 112 | |
| Gap between cards | 16 horizontal, 20 vertical | vertical leaves room for the chip overhang |
| Gap between groups | 36 horizontal, 24 vertical | |
| Group label | 22 high, then 10 to the cards | |
| Zone header | 44 high, including its rule | |
| Footer band | 72 | reserved for the logo, no cards in it |

**Packing.** Groups flow left to right in their order, as inline blocks:

1. A group's natural width is the width of its cards in one row.
2. If that fits in what is left of the current line, the group is placed there. Otherwise
   it starts a new line.
3. A group wider than the content width takes the line on its own and wraps its cards
   inside it.
4. A line is as tall as its tallest group.

Packing is greedy and keeps the order; it never reorders groups to fill a gap. The order is
information (Lessons last), so it outranks a few pixels.

**Row height.** A row of cards inside a group is as tall as its tallest card, and cards
sit on the row's bottom edge. A row of only landscape cards is 112 high, not 157.

**What it gives.** The sample deck at 1440 is about 1190 tall, against 2209 today.

### 4. The banner

Drawn in this z-order:

1. **Art.** The character's art crop is fetched with the card art, under the same budget
   and timeout. It is resized with `fit: cover` to 880 x 320, right-aligned, focused at
   30% from the top as in the mock.
2. **Fades.** An SVG overlay draws two `linearGradient`s: midnight left to transparent
   (0% solid, 22% at 0.85, 60% at 0.15, 100% clear) and midnight bottom to transparent
   over the lower 40%. librsvg renders both. This is the same chrome-SVG path the panel
   and swatches use today.
3. **Character card.** 224 x 160 at (40, 40), the landscape card face, with a 2 px gold
   ring and a soft shadow (a blurred midnight rect under it, via `feGaussianBlur`).
4. **Text.** Starts at x 290, or at 40 when there is no character. Three lines:
   - the eyebrow, 12 px uppercase gold
   - the deck name, 44 px parchment, ellipsised by `fitText` to the text column (560 px
     with a card, 1000 without)
   - "Starting character {name}", 15 px
5. **Makeup bar.** 10 px tall, from x 40 to 1400, 30 px above the banner's bottom edge.
   Segments sit 2 px apart and the ends are rounded. A legend line below it gives each
   group's swatch, label and count. Nine groups at about 150 px each fit in 1360, and
   nothing in the dataset has more.

**Fallbacks.** The banner keeps its height and layout in every case, so geometry never
branches on what was fetched:

| Case | Art area | Card slot |
|---|---|---|
| Character with a crop | crop + fades | card |
| Character, no crop, or crop fetch failed | radial gold glow (`#E8B23A` at 18% fading to midnight), right half | card |
| Character card art failed | as above | the placeholder box with the name, as for any card today |
| No character | radial gold glow | omitted; text moves to x 40 |

A failed crop counts toward `dropped` the same way a failed card image does, so the log
line keeps reading true.

**Resolution.** The crop is 520 x 325. At 2x the art area is 1760 x 640, so the crop is
upscaled about 3.4x. Most of it sits under the fades, and the mock reads well at 1x, but a
sharp edge will look soft at 2x. Default: draw it as is, and check it in verification.
If it looks pixelated rather than soft, apply `blur(1.2)` after the resize so the
softness looks deliberate. Baking larger crops at ingest is out of scope: the card scans
themselves are about 745 px wide, so a crop of the art region cannot get much bigger.

### 5. Cards, quantity and copies

- **Stacked copies.** For quantity 2, one card outline sits behind the face, offset 5 px
  right and 5 px up. For 3 or more there is a second outline at 10 px. Each outline is a
  midnight rect with a 1 px `#2E2A50` stroke, drawn in the chrome SVG before the art, so
  the face covers all of it but the offset edges. A 10 px offset fits inside the 16 px
  card gap and the 10 px space above each row.
- **Quantity chip.** A ×N pill at the card's bottom-right corner, overhanging it by 6 px
  right and 8 px down. Midnight fill, 2 px gold border, gold text: "×" at 11 px, then the
  count at 14 px bold. It is 26 px tall, and its width follows the count, up to 999.
  `renderText` draws the text and the pill grows to fit it. This replaces the centred
  gold disc.
- **Group label.** The type in uppercase with 0.14em tracking, muted, followed by the count
  in gold. The Lessons label uses light gold (`#F6D58B`) instead of muted.
- **Zone header.** "MAIN DECK 76" / "SIDEBOARD 8" in parchment, with the count in gold
  and a 1 px rule that fades out to the right.
- **Placeholders** for a card without art keep today's behaviour: the box with the name
  centred in it.

### 6. Logo

- **Asset.** `sheet/src/revelio-logo.svg` is a byte copy of `logos/revelio-logo-dark.svg`.
  The wordmark is already paths, so it needs no font. `sheet/build.mjs` copies it next to
  the bundle, alongside `Poppins-SemiBold.ttf` and `fonts.conf`, and the Dockerfile's
  build-stage boot check is unchanged.
- **Why a copy.** The sheet image's build context is `app/`, which cannot reach the repo
  root's `logos/`.
- **Drift test.** A test in `sheet/test` reads both files and fails if they differ, so a
  logo update cannot silently miss the sheet.
- **Placement.** Rendered by sharp at 34 px tall times the scale, right-aligned 40 px from
  the edge and vertically centred in the footer band. No domain text beside it.

### 7. Labels

`core/src/messages/{en,de}.json`, `deckSheet` scope:

| Key | en | de |
|---|---|---|
| `mainDeck` | Main deck | Hauptdeck (unchanged) |
| `sideboard` | Sideboard | Sideboard (unchanged) |
| `cards` | cards | Karten (new) |
| `startingCharacter` | Starting character | Startcharakter (new) |
| `character` | removed: nothing paints a "Character" section any more | |

The eyebrow is `${formatLabel} · ${count} ${cards}`. Joining the parts with a separator
avoids having to inflect the format name ("Klassisch-Deck"). The type labels come from
`deckGroups`, unchanged. `labels.test.ts` keeps both catalogs at parity.

### 8. Pixel budget

Nothing in the budget changes, only its inputs:

- **Discord** (`maxBytes` 9 MB, budget 5.6 Mpx): the sample sheet's 1440 x 1190 is 6.9 Mpx
  at 2x, so it renders at about 1.81x.
- **Full art or thumbs:** `usesFullArt` compares `cardWidth * s * 1.5` with the 300 px
  thumb. With `cardWidth` 112 the switch to thumbs happens below scale 1.79. Sheets at or
  near that scale sit right on the line. Either source is correct there; this is noted so
  a test that pins the art source per scale is updated deliberately, not by accident.
- **Browser download** (no `maxBytes`, 12 Mpx cap): 2880 px wide at 2x, so up to 2083
  layout px tall before the scale drops.

`MAX_SHEET_PIXELS`, the PNG/WebP fallback and the 768Mi pod limit are untouched.

## Testing

TDD, red first, in the workspace that owns the behaviour.

- **`core/test/deck-sheet.test.ts`**
  - The layout puts the character in the banner and in no zone.
  - Zone counts and makeup counts exclude the character and the sideboard.
  - Makeup order matches `groupMainEntries`.
  - Eyebrow text for both locales.
  - There is no zone for an empty main or sideboard.
- **Geometry**
  - Packing places two small groups on one line and starts a new line when the next
    group does not fit.
  - An oversize group wraps internally.
  - A landscape-only row is 112 tall.
  - The banner is always 320 tall.
  - The footer is reserved.
  - Width is 1440.
- **Contract**
  - `artCropVersion` defaults to null when absent, and accepts a ten-digit version.
  - It rejects negative values and values past the bound.
  - `pickSheetEntries` carries it from the views.
- **`sheet/test/render.test.ts`** (existing image-host fixture)
  - A render with a crop fetches `cards/art-crop/...`.
  - A render without a character requests no crop and still returns 200.
  - A failed crop increments `dropped`.
  - The logo is drawn: the expected pixels in the footer corner are not background.
- **`sheet/test/server.test.ts`**: `MAX_BODY_BYTES` still holds a maximal request that
  includes the new field.
- **Logo drift test** as in section 6.
- **By eye:** render the sample deck from the local stack through `POST /render`, and a
  deck with no character. Compare both with mock B, and check the crop at 2x against the
  resolution note in section 4.

## Deployment

- **No migration, no ingest run, no new env var.** `art_crop_version` is already populated
  (99 characters locally) and already served from the bucket.
- **Either order is safe; `sheet` first is preferred.** A new service with old callers
  draws the glow fallback, because no crop version is sent (`.default(null)`). An old
  service with new callers ignores the field, because `DeckSheetEntryInput` is a plain
  `z.object`, which strips unknown keys rather than rejecting them. Deploying the service
  first means the banner shows art from the first new caller onwards.
- The service's own image needs a rebuild for the logo asset. `docker compose up --build
  sheet` locally.

## Rejected alternatives

- **A: tidy grid alone.** It fixes the wasted height but leaves the deck without an
  identity. B contains A as its body, so A's work is not lost.
- **C: stacked columns.** The most compact, but it hides almost all card art, and the art
  is the reason to post a picture instead of a list.
- **Listing the character in the grid as well.** It is not part of the 76, and a third
  appearance (card face, name line, grid) costs a row and says nothing new.
- **"revelio.cards" text beside the logo.** Dropped on review: the logo alone.

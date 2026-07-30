# Deck PNG export — image sheet with quantity badges

**Date:** 2026-07-30
**Status:** Approved (design)

## Summary

Replace the text-only deck PNG export with an **image sheet**: each card is drawn as
its full-card thumbnail with the copy count shown as a corner badge, instead of a
`"2x Card Name (SET)"` text line. Grouping, title, and section headers are kept; only
the per-card rendering changes from a text line to a thumbnail + badge.

The export remains a client-side Canvas render producing a PNG `Blob` (no external
image/PDF library — the app CSP forbids one). The download flow in
`deck-export-menu.tsx` is unchanged.

## Motivation

The current sheet (`app/web/src/lib/deck-png.ts`) is a text list. A visual sheet showing
the actual card art with quantities is far more useful as a shareable artifact — you can
see the deck at a glance rather than read names.

## Scope

**In scope**
- Render each card as its full-card thumbnail in a grid, grouped under the existing
  sections (Character / Main deck / lesson groups / Sideboard).
- A gold circular quantity badge in the bottom-right corner of every thumbnail.
- Client-side image loading via `crossOrigin="anonymous"` (CORS already enabled on the
  image host — see below).
- Placeholder tile fallback for cards with no image or a failed load.
- Refactor `layoutDeckLines` into a pure layout/geometry model and unit-test it.

**Out of scope**
- Art-crop images (baked for characters only; full thumbnail is used for all cards).
- Card names on the sheet (dropped — the badge replaces the text line entirely).
- Localization of the sheet (stays English-only, like today — it is a shareable
  artifact, not a UI surface).
- Any change to the Text/JSON exports or the download/menu UI.

## Image loading & CORS (resolved)

Drawing a cross-origin image onto a `<canvas>` and calling `toBlob()` requires the image
response to carry CORS headers, or the canvas is tainted and `toBlob()` throws
`SecurityError`. The site (`revelio.cards`) and the image host are different origins, so
this matters.

Verified against the live image host (MinIO): a thumbnail request with
`Origin: https://revelio.cards` returns:

```
access-control-allow-origin: https://revelio.cards
vary: Origin
content-type: image/webp
```

CORS is already enabled and scoped to the site origin. Therefore:

- **No proxy route is needed.** Images load client-side with `crossOrigin="anonymous"`.
- **Prod** (`revelio.cards`) matches the allow-origin → untainted canvas.
- **Local dev** loads from local MinIO (`localhost:9000`), whose CORS default is `*` →
  also untainted.

## Design

### Data available

`DeckCardView` (`app/core/src/domain.ts`) already carries everything needed per card:
`cardId`, `quantity`, `imageVersion`, `orientation`, `setCode`, `zone`, `isLesson`,
`lesson`. Thumbnail URL is built with existing core helpers:

```ts
imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL, thumbKey(cardId, imageVersion))
```

`thumbKey(id, version)` (no lang args) yields the default-language key, which matches the
English-only nature of the sheet.

### Layout model (pure, testable)

Refactor `layoutDeckLines` into a layout function that produces a geometry model instead
of text lines. The grouping logic (character, main, lesson/item buckets, sideboard) and
section counts are preserved exactly from the current implementation.

Proposed shape:

```ts
type DeckPngCard = {
  cardId: string
  quantity: number
  imageVersion: number | null
  orientation: string | null
  name: string        // fallback text for the placeholder tile
}
type DeckPngSection = {
  title: string       // e.g. "Main deck (40)", "Charms (12)", "Sideboard (10)"
  color: string       // swatch color (unchanged palette)
  cards: DeckPngCard[]
}
type DeckPngLayout = {
  title: string
  sections: DeckPngSection[]
}
```

A separate geometry step computes, for a given canvas width:
- thumbnails per row (fixed thumbnail width + gap),
- each card's `(x, y)` cell position within its section,
- each section's height (header + wrapped rows of thumbnails),
- total canvas height (title + sections + padding).

Keeping grouping and geometry as pure functions makes them unit-testable without a
canvas; the canvas draw consumes their output.

### Rendering (`renderDeckPng`, browser-only)

1. Build the layout model from `(deck, entries)`.
2. Preload all thumbnails: for each card with an `imageVersion`, create an
   `HTMLImageElement`, set `crossOrigin = 'anonymous'` **before** `src`, and await
   `load`/`error`. Loads run concurrently (`Promise.all`), each with a timeout; a
   failed/absent image resolves to a "no image" marker rather than rejecting.
3. Compute geometry for the fixed sheet width, derive canvas height.
4. Draw, in order: background frame (unchanged), title (unchanged), and for each section:
   the swatch + section header (unchanged), then the card grid.
5. Per card cell:
   - **Thumbnail:** draw the loaded image into the cell. Portrait cards (5:7) fill the
     cell directly. Horizontal cards (`orientation === 'horizontal'`) are rotated 90° to
     display upright (landscape), matching `CardImage`'s upright behavior, centered in the
     cell.
   - **Placeholder** (no image / failed load): draw a muted rounded rectangle with the
     card name truncated to fit, so the export never aborts on one bad image.
   - **Quantity badge:** a filled gold circle in the bottom-right corner, sized a bit
     larger than a minimal badge, with the count centered in a dark, bold numeral. Drawn
     on every card (including quantity 1).
6. `canvas.toBlob(...)` → PNG `Blob` (unchanged return contract).

### Constants

Reuse the existing palette (`GOLD`, `BG`, `CARD_BG`, `BORDER`, `PARCHMENT`, lesson
colors). Add thumbnail sizing constants (thumbnail width, gap, badge radius, badge font).
Exact pixel values are an implementation detail for the plan.

### Error handling

- A single image failing to load never fails the export — it renders as a placeholder
  tile.
- If the whole render throws (e.g. no canvas context), the existing `try/catch` in
  `exportPng()` surfaces `t('export.pngError')` — unchanged.

## Testing

- **Unit (pure):** grouping/counts and geometry. Given sample `entries`, assert section
  titles, counts, per-card cell positions, rows-per-section, and total canvas height.
  Covers character-only, multi-lesson main deck wrapping to multiple rows, and sideboard.
- **Canvas draw:** remains browser-only and thin (untested, as today — the current file
  has no canvas test). The pure layer carries the logic worth testing.
- Full suite (`npm test`) and `npm run typecheck` must pass. New badge/thumbnail text
  requires no new i18n strings (sheet is English-only).

## Files

- `app/web/src/lib/deck-png.ts` — layout model refactor + image-based canvas render.
- `app/web/src/lib/__tests__/deck-png.test.ts` — **migrate** the existing tests, which
  assert the old `section.lines: string[]` shape, to the new `section.cards` model, and
  add geometry coverage.
- `app/web/src/components/deck-export-menu.tsx` — no change expected (calls
  `renderDeckPng(state, entries)` as today).

# Rotate Horizontal Cards — Design

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Problem

Many Harry Potter TCG cards are physically **landscape** ("horizontal") cards. Every card
image in the dataset — horizontal and vertical alike — is stored as a **portrait 745×1040
`.webp`**, so a horizontal card's artwork is rotated 90° to fit that portrait canvas. As a
result, horizontal cards currently render **sideways** everywhere they appear (search grid,
set pages, deck builder, deck view, card detail): the viewer has to tilt their head to read
them. In the dataset there are **604 horizontal** cards vs **431 vertical**, so this affects
the majority of the collection.

## Goal

- In every card **list/grid**, let the user rotate a horizontal card upright via a
  hover-revealed button, shown as a floating preview above the grid.
- On the single-card **detail page**, show horizontal cards **upright by default**.
- Vertical cards are unaffected everywhere.

## Key facts (established during brainstorming)

- Rotation is a **lossless CSS transform** (`transform: rotate(90deg)`) — the stored pixels
  are identical whether displayed portrait or landscape. No new image assets are needed.
- The `orientation` field (`"horizontal"` | `"vertical"`) **already exists** end-to-end in
  the data model — DB (`db/src/schema.ts`), domain `CardDetailDTO` (`core/src/domain.ts`),
  ingest, and card-data pipeline (`card-data/transform_hpjson.py`) — **except** it is not
  carried into the Meilisearch document. List/grid components render from `SearchDocument`,
  so they currently cannot tell which cards are horizontal.
- The single-card detail page already receives `orientation` via `CardDetailDTO`.
- `DeckArt` / deck hero art is a **separate, already-solved path** (baked `art-crop` assets)
  and is explicitly out of scope.

## Approach

CSS-transform rotation + a one-time search reindex. Rejected alternatives: baking upright
landscape image variants at ingest (heavy pipeline + storage + full re-ingest for something
a lossless transform already does); and a minimal "hover button links to detail page" (does
not deliver the requested in-list rotate/preview).

## Design

### 1. Data plumbing — carry `orientation` into search

Add `orientation` to the search document so list tiles know which cards are horizontal.

- `search/src/documents.ts`:
  - Add `orientation: 'horizontal' | 'vertical'` (nullable-tolerant) to the `SearchDocument`
    type.
  - Add it to `CardIndexData`.
  - Populate it in `buildCardDocument`.
- Re-index Meilisearch (ingest reindex) so existing documents gain the field.
- No DB or domain change is required for the detail page (it already has `orientation` via
  `CardDetailDTO`). Add `orientation` to base `CardDTO` **only** if a list surface needs it
  from a source other than the search document.

### 2. Shared presentational component — `CardImage`

Introduce one small client component that owns the card-face `next/image` markup, replacing
the duplication currently spread across `card-tile.tsx`, `card-detail.tsx`,
`deck-card-browser.tsx`, and `deck-gallery.tsx`.

- Props: image key/lang/base inputs, `orientation`, and an `upright` flag.
- Behavior:
  - Default (`upright` falsy, or `orientation !== 'horizontal'`): render the normal
    **portrait** tile (existing `aspect-[5/7]` / `aspect-[63/88]` behavior preserved per
    call site).
  - `upright` **and** `orientation === 'horizontal'`: render the image rotated 90° inside a
    **landscape** frame (`aspect-[7/5]`), scaled to fit.
- Rotation direction (clockwise vs counter-clockwise) is verified visually against a real
  horizontal card during implementation; all horizontal cards use the same direction.

### 3. Lists — hover rotate button + upright overlay

For **horizontal cards only**, list tiles gain a small rotate button revealed on hover
(positioned in a corner). Requirements:

- The button **stops click propagation** so it never triggers the tile's own action
  (navigate to detail, or add-to-deck in the deck builder).
- Clicking opens a lightweight **overlay preview** (Radix Popover or Dialog) showing the
  card **upright and enlarged**, floating above the grid. The tile underneath is untouched
  and the grid **never reflows**.
- The overlay dismisses on outside-click and Esc. Rotation state is **ephemeral** — it
  closes on navigation and is not persisted.
- Vertical cards show **no** rotate button.

Applied to all list surfaces:

- Search grid — `card-grid.tsx` → `card-tile.tsx`
- Set page grid — same `CardGrid`
- Deck builder card browser — `deck-card-browser.tsx`
- Deck view gallery — `deck-gallery.tsx`

To keep this DRY, the hover-button + overlay is provided by a shared piece (e.g. a wrapper
around the image area) rather than re-implemented at each call site.

### 4. Detail page — upright only

`card-detail.tsx` renders horizontal cards upright via `CardImage upright`, in a landscape
frame; no toggle. The deck-builder `CardDetailSheet` reuses `card-detail.tsx`, so it inherits
the same behavior. Vertical cards are unchanged.

### 5. Out of scope

- `DeckArt` / deck hero art (already handled via baked `art-crop`).
- Persistence of rotation state.
- Any change to vertical-card rendering.

## Testing

- `CardImage`: renders the rotated/landscape markup **only** when `upright` and
  `orientation === 'horizontal'`; renders the normal portrait markup otherwise (including
  `upright` on a vertical card).
- List tile: the rotate button is present for a horizontal card and **absent** for a vertical
  card; clicking the button does **not** trigger the tile's navigate/add action; the overlay
  opens and dismisses (outside-click / Esc).
- `buildCardDocument` includes `orientation` in its output.

## Affected files (indicative)

- `app/search/src/documents.ts` — `SearchDocument`, `CardIndexData`, `buildCardDocument`
- `app/web/src/components/card-image.tsx` — **new** shared component
- `app/web/src/components/card-tile.tsx` — use `CardImage`, add hover-rotate + overlay
- `app/web/src/components/card-detail.tsx` — use `CardImage upright`
- `app/web/src/components/deck-card-browser.tsx` — use `CardImage`, add hover-rotate + overlay
- `app/web/src/components/deck-gallery.tsx` — use `CardImage`, add hover-rotate + overlay
- possibly a shared hover-rotate/overlay component (e.g. `rotated-card-preview.tsx`)
- `app/core/src/domain.ts` — only if base `CardDTO` needs `orientation`
- Re-index step (ingest) after the search-document change

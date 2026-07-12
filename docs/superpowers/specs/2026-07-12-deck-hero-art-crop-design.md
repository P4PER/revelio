# Deck Hero Art Crop (ingest-time character crop)

**Date:** 2026-07-12
**Status:** Approved design
**Area:** `card-data` image pipeline · `@revelio/core` · `@revelio/ingest` · `@revelio/web`

## Problem

The Discover decks grid renders each `DeckHeroCard` by loading the **full
745×1040 card image** (`imageKey`) and cropping to the character's face with a
CSS `rotate(90deg)` + `translate` transform in `DeckArt`. On a grid of 12–30
hero tiles that means downloading 12–30 full-resolution cards and discarding
~80% of each — the single biggest drag on that page's LCP.

We bake the crop once, at image-pipeline time, and serve a small pre-framed
asset instead.

## Goals

- Serve `DeckHeroCard` a small, correctly-framed, upright character crop rather
  than a full card.
- Keep the framing logic out of the browser (no per-tile CSS transform).
- Change nothing about the secondary `DeckDiscoverRow` list view.

## Non-goals

- Cropping non-Wizard/Witch card types. See Scope.
- Per-language crops. `DeckArt` already renders the default-language (en) image;
  crops are default-language only. (YAGNI.)
- Changing `DeckDiscoverRow`. It keeps the current full-image CSS crop into its
  56px square — it is not the bandwidth hot path.

## Scope

- **Wizard/Witch characters only** — 91 cards. Filter: `types` includes
  `Character` **and** `subTypes` includes `Wizard` or `Witch`. (Of 109 total
  Character cards, 18 are non-Wizard/Witch — e.g. Filch, a Squib — and are
  excluded.)
- **`DeckHeroCard` only** consumes the baked crop.

## Key finding: orientation is uniform

Every Character card is a **landscape card scanned into a portrait canvas** (the
name banner runs vertically up the left edge; `orientation: horizontal` in the
dataset for all 109). Rotating the source **90° clockwise** stands every card
upright with a readable title — verified across Harry, Hermione, Snape,
Dumbledore, Filch, and a 20-card montage. There is **no per-card variation**, so
a single rotation + single crop box works for all 91.

## Architecture & data flow

Mirrors the existing thumbnail pipeline at every layer.

### 1. `card-data/accio_images.py --download` (Pillow)

In `_process_one`, for cards matching the Wizard/Witch filter, emit a third
output alongside the full card and thumb:

```
assets/cards/art-crop/<id>.webp
```

Recipe on the 745×1040 source:

1. **Rotate 90° clockwise** — `img.transpose(Image.ROTATE_270)` → a 1040×745
   landscape image, upright, title readable.
2. **Crop** the character-art diamond: box `(470, 175, 990, 500)`
   (left, upper, right, lower) → a 520×325 region, exactly 16:10.
3. **Save** WebP `quality=85, method=6` (same settings as thumbs). The box is
   already 520px wide, so there is no resampling/upscaling.

Generation is idempotent: skip when the target file already exists (matches the
existing full/thumb skip logic). The card-type/subtype filter needs the card's
`types`/`subTypes`, which `_process_one` already has access to via the card
object `c`.

### 2. `@revelio/core/images.ts`

Add, mirroring `thumbKey`:

```ts
export function artCropKey(id: string): string {
  return `cards/art-crop/${id}.webp`
}
```

Default-language only — no `lang`/`defaultLang` parameters.

### 3. `@revelio/ingest/upload-images.ts`

Extend `collectUploads` to walk `resolve(cardsDir, 'art-crop')` (via the
existing `readdirSafe`, so a missing dir is a no-op) and push uploads keyed by
`artCropKey(c.id)`. Diff-by-key-existence skip and bounded concurrency are
inherited unchanged.

### 4. `@revelio/web` — `DeckArt`

Add a `crop?: boolean` prop (default `false`):

- `crop === true` → `src = imageUrl(imageBase, artCropKey(cardId))`, rendered as
  a plain `object-cover` image (no rotate/translate transform). `DeckHeroCard`
  passes `crop`.
- `crop === false` (default) → **unchanged** current behavior: full-image
  `imageKey` + the rotate/translate `cqw` transform. `DeckDiscoverRow` is
  untouched.

The lesson-gradient fallback and the `errored` state are shared by both
branches.

`DeckHeroCard` call site gains the single prop:

```tsx
<DeckArt crop cardId={deck.starterCardId} lessons={deck.lessons}
         imageBase={imageBase} alt={deck.name} className="h-full w-full" />
```

## Crop geometry (final)

- Source: 745×1040 portrait scan of a landscape card.
- Rotate 90° CW → 1040×745 upright landscape.
- Crop box `(470, 175, 990, 500)` → 520×325, 16:10 ("Box C": frames the
  character-art diamond with a little surrounding context; chosen over the
  tighter Box A in review).
- The 16:10 crop matches `DeckHeroCard`'s `aspect-[16/10]` container, so
  `object-cover` shows the whole crop with no trimming; `object-position`
  remains available for fine nudging.

## Verification

- **`@revelio/core`**: unit test for `artCropKey`.
- **`@revelio/ingest`**: extend the `collectUploads` test — an `art-crop/` file
  produces an upload keyed by `artCropKey`.
- **`@revelio/web`**: update the `DeckArt` test — `crop` renders an `img` whose
  `src` is the art-crop URL with no rotate transform; the default branch and the
  gradient fallback remain covered.
- **Visual**: the framing was validated during design against Harry, Hermione,
  Snape, Dumbledore, and Filch (rotated + Box C). Re-check with the Playwright
  card harness after wiring `DeckHeroCard`.

## Idempotency & rollout

- Pillow skips existing files; upload skips existing keys. A one-off
  `accio_images.py --download` re-run backfills the 91 crops and re-uploads only
  those; nothing else changes.
- Until crops exist in the bucket, a `crop` `DeckArt` with a missing asset falls
  through its `onError` to the lesson gradient — safe partial-deploy behavior.
  (Every deck's starter is a Character; the 18 non-Wizard/Witch starters would
  fall back to the gradient. If that is undesirable, widen the filter to all
  Character cards later — the recipe is identical, only the filter changes.)

## Risks

- **Non-Wizard/Witch starters** (e.g. a Squib/Creature-less deck whose starter
  is one of the 18 excluded Characters) show the lesson-gradient fallback in the
  hero tile rather than art. Accepted for now; trivially widened by relaxing the
  subtype filter.
- **Two code paths in `DeckArt`**: the `crop` prop keeps the legacy rotate path
  alive for the row. Acceptable — the row explicitly stays unchanged, and both
  paths share the fallback logic.

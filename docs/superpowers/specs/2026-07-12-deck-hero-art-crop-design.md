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

- Serve `DeckHeroCard` a small, correctly-framed character crop rather than a
  full card.
- Keep framing cheap to iterate (no per-tweak re-ingest of the full dataset).
- Change nothing about the secondary `DeckDiscoverRow` list view.

## Non-goals

- Cropping non-character card types. The rotate-to-upright + face-zoom recipe is
  meaningless for them, and only a deck's starter card (always a Character) is
  ever rendered by `DeckArt`.
- Per-language crops. `DeckArt` already renders the default-language (en) image;
  crops are default-language only. (YAGNI.)
- Changing `DeckDiscoverRow`. It keeps the current full-image CSS crop into its
  56px square — it is not the bandwidth hot path.

## Scope

- **Character cards only** — 109 of 1035 cards. Confirmed all 109 are
  `orientation: horizontal` (landscape art stored sideways in the portrait
  canvas), so the 90° rotation is uniformly valid with no per-card branching.
- **`DeckHeroCard` only** consumes the baked crop.

## Architecture & data flow

Mirrors the existing thumbnail pipeline at every layer.

### 1. `card-data/accio_images.py --download` (Pillow)

In `_process_one`, for cards whose `types` include `Character`, emit a third
output alongside the full card and thumb:

```
assets/cards/art-crop/<id>.webp
```

Recipe on the 745×1040 source:

1. **Crop** the character-art band. Box (left, upper, right, lower) derived by
   reversing the known-good `DeckArt` CSS transform (see "Crop geometry"):
   approximately `(195, 52, 520, 572)` → a 325×520 portrait region. Widen by a
   small safety margin (~6% each edge) so `object-position` can still nudge.
2. **Rotate 90° clockwise** to stand the art upright
   (`transpose(ROTATE_270)` / `rotate(-90, expand=True)`), yielding a landscape
   ~16:10 region.
3. **Resize** to ~500px wide, save WebP `quality=85, method=6` (same settings as
   thumbs).

Generation is idempotent: skip when the target file already exists (matches the
existing full/thumb skip logic).

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
  a plain `object-cover` image with a per-container `object-position` (no rotate
  transform). `DeckHeroCard` passes `crop`.
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

## Crop geometry (derivation)

Reversing the current `DeckArt` transform (`img` at `143.3cqw × 200.0cqw`,
`transformOrigin 0 0`, `translate(110cqw, -37.5cqw) rotate(90deg)`) against a
16:10 container (`x ∈ [0,100]cqw`, `y ∈ [0,62.5]cqw`) maps the visible window
back to source pixels:

- source-x ∈ [195, 520] (325px)
- source-y ∈ [52, 572] (520px)

Rotating that 325×520 region 90° CW gives 520×325 → exactly 16:10, matching the
hero container. These numbers are the starting point; final values are
confirmed by visual check (below), not asserted blind.

## Verification

- **`@revelio/core`**: unit test for `artCropKey`.
- **`@revelio/ingest`**: extend the `collectUploads` test — an `art-crop/` file
  produces an upload keyed by `artCropKey`.
- **`@revelio/web`**: update the `DeckArt` test — `crop` renders an `img` whose
  `src` is the art-crop URL and no rotate transform; the default branch and the
  gradient fallback remain covered.
- **Visual**: reuse the existing Playwright card-crop harness to eyeball a real
  baked crop framed in the hero tile; adjust the crop box / margin if the face
  is mis-anchored.

## Idempotency & rollout

- Pillow skips existing files; upload skips existing keys. A one-off
  `accio_images.py --download` re-run backfills the 109 crops and re-uploads
  only those; nothing else changes.
- Until crops exist in the bucket, a `crop` `DeckArt` with a missing asset falls
  through its `onError` to the lesson gradient — safe partial-deploy behavior.

## Risks

- **Crop box accuracy**: the derived box assumes the current CSS framing is
  correct for all 109 characters. The Playwright visual check gates this; a
  single global box (plus the object-position margin) is expected to suffice
  since the source layout is uniform.
- **Two code paths in `DeckArt`**: the `crop` prop keeps the legacy rotate path
  alive for the row. Acceptable — the row explicitly stays unchanged, and both
  paths share the fallback logic.

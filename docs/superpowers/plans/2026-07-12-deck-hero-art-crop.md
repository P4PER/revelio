# Deck Hero Art Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `DeckHeroCard` a small, pre-cropped, upright character image baked at image-pipeline time, instead of downloading the full 745×1040 card and CSS-cropping it in the browser.

**Architecture:** The `card-data` Pillow pipeline bakes `assets/cards/art-crop/<id>.webp` for Wizard/Witch characters (rotate 90° CW → crop the character diamond to 16:10). `@revelio/core` gains an `artCropKey` helper; `@revelio/ingest` uploads the new directory; `@revelio/web`'s `DeckArt` gains a `crop` prop that loads the baked asset with plain `object-cover`, used only by `DeckHeroCard`. `DeckDiscoverRow` is untouched.

**Tech Stack:** Python 3 + Pillow 12 (card-data); TypeScript + Vitest (core, ingest); Next.js 16 / React 19 + Vitest + Testing Library (web).

## Global Constraints

- **Scope filter (exact):** a card gets a crop iff `types` includes `"Character"` **and** `subTypes` includes `"Wizard"` or `"Witch"` (91 cards). Everything else is excluded.
- **Crop recipe (exact):** rotate the source 90° clockwise (`Image.transpose(Image.ROTATE_270)`), then crop the rotated (1040×745) image with box fractions `(470/1040, 175/745, 990/1040, 500/745)`, then resize to exactly **520×325** (16:10). Save WebP `quality=85, method=6`.
- **Object key (exact):** `cards/art-crop/<id>.webp`. Default-language (en) only — no language suffix.
- **Idempotency:** never overwrite an existing crop file or re-upload an existing key.
- **Do not modify `DeckDiscoverRow`** or `DeckArt`'s existing default (non-crop) rendering path.
- All app commands run from `app/`. Conventional Commits for messages.

---

### Task 1: `artCropKey` helper in `@revelio/core`

**Files:**
- Modify: `app/core/src/images.ts` (add function after `thumbKey`)
- Test: `app/core/test/images.test.ts` (extend the "builds object keys" test)

**Interfaces:**
- Consumes: nothing.
- Produces: `artCropKey(id: string): string` → `cards/art-crop/${id}.webp`. Re-exported via `app/core/src/index.ts` (already does `export * from './images'`).

- [ ] **Step 1: Add the failing assertion**

In `app/core/test/images.test.ts`, update the import line and the first test:

```ts
import { imageKey, thumbKey, symbolKey, imageUrl, artCropKey } from '../src/images.js'
```

Add inside the `it('builds object keys', ...)` body:

```ts
    expect(artCropKey('bs-1-dean-thomas')).toBe('cards/art-crop/bs-1-dean-thomas.webp')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/core -- images`
Expected: FAIL — `artCropKey is not a function` (or an import/type error).

- [ ] **Step 3: Implement `artCropKey`**

In `app/core/src/images.ts`, add after the `thumbKey` function:

```ts
// Deck-hero art crop: a pre-cropped, upright character image baked at ingest time.
// Default-language only (no lang suffix) — the deck hero always shows the en art.
export function artCropKey(id: string): string {
  return `cards/art-crop/${id}.webp`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @revelio/core -- images`
Expected: PASS (all assertions in `images.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add app/core/src/images.ts app/core/test/images.test.ts
git commit -m "feat(core): add artCropKey image-key helper"
```

---

### Task 2: Bake art crops in the `card-data` pipeline

**Files:**
- Modify: `card-data/accio_images.py` (add constants + `is_wizard_witch` + `crop_art` + `generate_art_crops`; call from `main`)
- Test: `card-data/test_art_crop.py` (new standalone assert script — no pytest in this repo)

**Interfaces:**
- Consumes: nothing (reads local `assets/cards/<id>.webp` files already produced by `--download`).
- Produces: `assets/cards/art-crop/<id>.webp` (520×325) for each Wizard/Witch character. Python functions: `is_wizard_witch(c) -> bool`, `crop_art(im) -> PIL.Image`, `generate_art_crops(cards) -> (made:int, skipped:int)`.

- [ ] **Step 1: Write the failing test script**

Create `card-data/test_art_crop.py`:

```python
"""Standalone tests for the art-crop pipeline. Run: python3 test_art_crop.py"""
import os, tempfile
from PIL import Image
import accio_images as A


def test_is_wizard_witch():
    assert A.is_wizard_witch({"types": ["Character"], "subTypes": ["Wizard", "Unique"]})
    assert A.is_wizard_witch({"types": ["Character"], "subTypes": ["Witch"]})
    assert not A.is_wizard_witch({"types": ["Character"], "subTypes": ["Unique"]})  # Filch (Squib)
    assert not A.is_wizard_witch({"types": ["Spell"], "subTypes": ["Wizard"]})      # wrong type
    print("is_wizard_witch OK")


def test_crop_art_dims():
    out = A.crop_art(Image.new("RGB", (745, 1040), (10, 20, 30)))
    assert out.size == (520, 325), out.size
    print("crop_art OK", out.size)


def test_generate_art_crops_idempotent():
    d = tempfile.mkdtemp()
    A.ASSETS = d  # redirect the module's asset root at the temp dir
    os.makedirs(os.path.join(d, "cards"))
    Image.new("RGB", (745, 1040), (1, 2, 3)).save(os.path.join(d, "cards", "x-1.webp"), "WEBP")
    cards = [
        {"id": "x-1", "types": ["Character"], "subTypes": ["Wizard"]},
        {"id": "y-2", "types": ["Spell"], "subTypes": []},          # excluded
        {"id": "z-3", "types": ["Character"], "subTypes": ["Unique"]},  # excluded
    ]
    assert A.generate_art_crops(cards) == (1, 0)
    assert os.path.exists(os.path.join(d, "cards", "art-crop", "x-1.webp"))
    assert A.generate_art_crops(cards) == (0, 1)  # second run skips the existing crop
    print("generate_art_crops OK")


if __name__ == "__main__":
    test_is_wizard_witch()
    test_crop_art_dims()
    test_generate_art_crops_idempotent()
    print("ALL PASS")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd card-data && python3 test_art_crop.py`
Expected: FAIL — `AttributeError: module 'accio_images' has no attribute 'is_wizard_witch'`.

- [ ] **Step 3: Add constants**

In `card-data/accio_images.py`, immediately after the line `WEBP_FULL_Q, WEBP_THUMB_Q, WEBP_METHOD = 100, 85, 6`, add:

```python
# Deck-hero art crop (Wizard/Witch characters only). The source is a landscape card
# scanned into a portrait canvas, so rotate 90 CW to stand it upright, then crop the
# character-art diamond to 16:10. Box is expressed as fractions of the rotated
# (1040x745) image so it survives any uniform source-resolution change.
ART_CROP_W, ART_CROP_H = 520, 325
ART_BOX_FRAC = (470 / 1040, 175 / 745, 990 / 1040, 500 / 745)
```

- [ ] **Step 4: Add the functions**

In `card-data/accio_images.py`, add these three functions just above `def main():`:

```python
def is_wizard_witch(c):
    """True for Character cards whose subtypes include Wizard or Witch."""
    return "Character" in c.get("types", []) and any(
        s in ("Wizard", "Witch") for s in c.get("subTypes", []))


def crop_art(im):
    """Rotate the full card 90 CW and crop the character-art diamond to 520x325 (16:10)."""
    from PIL import Image
    r = im.convert("RGB").transpose(Image.ROTATE_270)  # 90 clockwise -> upright landscape
    w, h = r.size
    l, u, ri, lo = ART_BOX_FRAC
    box = (round(l * w), round(u * h), round(ri * w), round(lo * h))
    return r.crop(box).resize((ART_CROP_W, ART_CROP_H), Image.LANCZOS)


def generate_art_crops(cards):
    """Bake art-crop/<id>.webp for Wizard/Witch characters from the local full images.
    Idempotent: skips crops that already exist. Returns (made, skipped)."""
    try:
        from PIL import Image
    except ImportError:
        return (0, 0)
    out_dir = os.path.join(ASSETS, "cards", "art-crop")
    os.makedirs(out_dir, exist_ok=True)
    made = skipped = 0
    for c in cards:
        if not is_wizard_witch(c):
            continue
        src = os.path.join(ASSETS, "cards", f"{c['id']}.webp")
        dst = os.path.join(out_dir, f"{c['id']}.webp")
        if not os.path.exists(src):
            continue
        if os.path.exists(dst):
            skipped += 1
            continue
        crop_art(Image.open(src)).save(dst, "WEBP", quality=WEBP_THUMB_Q, method=WEBP_METHOD)
        made += 1
    return (made, skipped)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd card-data && python3 test_art_crop.py`
Expected: prints `is_wizard_witch OK`, `crop_art OK (520, 325)`, `generate_art_crops OK`, `ALL PASS`.

- [ ] **Step 6: Wire into `main()`**

In `card-data/accio_images.py`, in `main()`, replace this block:

```python
    if DOWNLOAD:
        download_symbols()
```

with:

```python
    if DOWNLOAD:
        download_symbols()
        made, skipped = generate_art_crops(cards)
        print(f"art crops: {made} made, {skipped} skipped")
```

- [ ] **Step 7: Backfill the crops locally and eyeball one**

Run: `cd card-data && python3 -c "import json, accio_images as A; from PIL import Image; print(A.generate_art_crops(json.load(open('dist/cards.json'))))"`
Expected: `(91, 0)` on a fresh run (or `(0, 91)` if already present). Then verify a file exists and is 520×325:

Run: `cd card-data && python3 -c "from PIL import Image; print(Image.open('assets/cards/art-crop/bs-8-harry-potter.webp').size)"`
Expected: `(520, 325)`. Open the file in an image viewer and confirm Harry is upright and centered.

- [ ] **Step 8: Commit**

```bash
git add card-data/accio_images.py card-data/test_art_crop.py
git commit -m "feat(card-data): bake wizard/witch hero art crops"
```

Note: the generated `assets/cards/art-crop/*.webp` files are local build artifacts — commit them only if this repo commits the other `assets/cards/*.webp` (check `git status`; match the existing convention for `assets/`).

---

### Task 3: Upload the `art-crop/` directory in `@revelio/ingest`

**Files:**
- Modify: `app/ingest/src/upload-images.ts` (extend `collectUploads`)
- Test: `app/ingest/test/upload-images.test.ts` (add an art-crop fixture + assertions)

**Interfaces:**
- Consumes: `artCropKey` from `@revelio/core` (Task 1).
- Produces: `uploadAssets` also uploads `cards/art-crop/<id>.webp` objects. Requires Docker/MinIO (this is a live-S3 test; runs in CI's **test** job).

- [ ] **Step 1: Extend the test fixtures and expectations**

In `app/ingest/test/upload-images.test.ts`:

Add the import at the top (with the other imports):

```ts
import { artCropKey } from '@revelio/core'
```

In `beforeAll`, after the `writeFile(join(assetsDir, 'cards', 'thumb', 'bs-1-x.webp'), ...)` line, add:

```ts
  await mkdir(join(assetsDir, 'cards', 'art-crop'), { recursive: true })
  await writeFile(join(assetsDir, 'cards', 'art-crop', 'bs-1-x.webp'), Buffer.from('CROPDATA'))
```

Update the first test's expected counts and add a key check. Replace:

```ts
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 3, skipped: 0 })
```

with:

```ts
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 4, skipped: 0 })
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: artCropKey('bs-1-x') }))).resolves.toBeTruthy()
```

In the "skips objects that already exist" test, update:

```ts
    expect(res).toEqual({ uploaded: 0, skipped: 3 })
```

to:

```ts
    expect(res).toEqual({ uploaded: 0, skipped: 4 })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @revelio/ingest -- upload-images`
Expected: FAIL — `uploaded: 3` received vs `4` expected (the art-crop file is not collected yet). Requires MinIO up (`docker compose up -d minio` from `app/`, or CI).

- [ ] **Step 3: Collect the art-crop directory**

In `app/ingest/src/upload-images.ts`, inside `collectUploads`, after the `thumbDir` loop (the block that pushes `thumbKey` uploads) and before the `symbolsDir` block, add:

```ts
  const artCropDir = resolve(cardsDir, 'art-crop')
  for (const f of await readdirSafe(artCropDir)) {
    const c = classify(f)
    if (c) uploads.push({ file: join(artCropDir, f), key: artCropKey(c.id), contentType: c.contentType })
  }
```

Add `artCropKey` to the existing import from `@revelio/core` at the top of the file (it currently imports `imageKey, thumbKey, symbolKey`):

```ts
import { imageKey, thumbKey, symbolKey, artCropKey } from '@revelio/core'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/ingest -- upload-images`
Expected: PASS (uploads 4, skips 4 on re-run, art-crop key present and publicly readable).

- [ ] **Step 5: Commit**

```bash
git add app/ingest/src/upload-images.ts app/ingest/test/upload-images.test.ts
git commit -m "feat(ingest): upload art-crop images to S3"
```

---

### Task 4: `crop` prop on `DeckArt`

**Files:**
- Modify: `app/web/src/components/deck-art.tsx`
- Test: `app/web/src/components/__tests__/deck-art.test.tsx` (add a crop-mode test)

**Interfaces:**
- Consumes: `artCropKey` from `@revelio/core` (Task 1); `imageUrl`, `imageKey` already imported.
- Produces: `DeckArt` accepts `crop?: boolean` (default `false`). When `true`, renders `<img src={imageUrl(imageBase, artCropKey(cardId))}>` as plain `object-cover` (no rotate/translate transform). Default path is unchanged.

- [ ] **Step 1: Write the failing test**

In `app/web/src/components/__tests__/deck-art.test.tsx`, add this test inside the `describe('DeckArt', ...)` block:

```ts
  it('renders the baked art-crop image (no transform) when crop is set', () => {
    const { container } = render(<DeckArt crop cardId="c-1" lessons={['charms']} imageBase="https://img.test" alt="Deck" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://img.test/cards/art-crop/c-1.webp')
    expect(img).toHaveClass('object-cover')
    expect(img?.getAttribute('style') ?? '').not.toContain('rotate')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- deck-art`
Expected: FAIL — `crop` is not a prop; `src` is still `.../cards/c-1.webp`.

- [ ] **Step 3: Implement the `crop` branch**

In `app/web/src/components/deck-art.tsx`:

Update the import to add `artCropKey`:

```ts
import { imageKey, imageUrl, artCropKey, LESSONS } from '@revelio/core'
```

Add `crop` to the prop type and destructuring. Change the signature block:

```tsx
export function DeckArt({
  cardId, lessons, imageBase, alt, className, crop = false,
}: {
  cardId: string | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
  crop?: boolean
}) {
```

Replace the `<img ...>` element (the whole rotated-transform `<img>` currently inside `showImage ? (...)`) with a conditional. The `showImage ? (` branch becomes:

```tsx
      {showImage ? (
        crop ? (
          // Pre-cropped, upright character art baked at ingest time (Wizard/Witch
          // characters). The asset is already 16:10, so just cover the container.
          <img
            src={imageUrl(imageBase, artCropKey(cardId as string))}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center' }}
            onError={() => setErrored(true)}
          />
        ) : (
          // Character (starter) cards are landscape cards stored sideways in a
          // portrait canvas. We rotate 90° clockwise to stand them upright and
          // zoom onto the character's face (upper-right of the corrected card).
          <img
            src={imageUrl(imageBase, imageKey(cardId as string))}
            alt={alt}
            className="absolute left-0 top-0 max-w-none object-cover"
            style={{
              width: '143.3cqw',
              height: '200.0cqw',
              transformOrigin: '0 0',
              transform: 'translate(110.0cqw, -37.5cqw) rotate(90deg)',
            }}
            onError={() => setErrored(true)}
          />
        )
      ) : (
        <div data-slot="deck-art-fallback" className="absolute inset-0" style={{ background: lessonGradient(lessons) }} />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- deck-art`
Expected: PASS — both the existing default-path test and the new crop-path test.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/deck-art.tsx app/web/src/components/__tests__/deck-art.test.tsx
git commit -m "feat(web): add crop mode to DeckArt for baked hero art"
```

---

### Task 5: Use the crop in `DeckHeroCard` and verify in-app

**Files:**
- Modify: `app/web/src/components/deck-hero-card.tsx` (pass `crop` to `DeckArt`)
- Test: `app/web/src/components/__tests__/deck-hero-card.test.tsx` (assert the hero img uses the art-crop URL)

**Interfaces:**
- Consumes: `DeckArt`'s `crop` prop (Task 4).
- Produces: hero tiles render the baked art-crop asset.

- [ ] **Step 1: Add the failing assertion**

In `app/web/src/components/__tests__/deck-hero-card.test.tsx`, add this test inside the `describe('DeckHeroCard', ...)` block:

```ts
  it('renders the baked art-crop for the starter card', () => {
    const { container } = renderCard()
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://img.test/cards/art-crop/c-1.webp')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- deck-hero-card`
Expected: FAIL — `src` is still `https://img.test/cards/c-1.webp` (default DeckArt path).

- [ ] **Step 3: Pass the `crop` prop**

In `app/web/src/components/deck-hero-card.tsx`, add `crop` to the `DeckArt` usage (line ~19):

```tsx
        <DeckArt crop cardId={deck.starterCardId} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="h-full w-full" />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- deck-hero-card`
Expected: PASS (both the existing content test and the new art-crop test).

- [ ] **Step 5: Full web check**

Run: `npm test -w web && npm run typecheck && npm run lint -w web`
Expected: all green.

- [ ] **Step 6: Visual verification in the real app**

With local infra up (`docker compose up -d` from `app/`, crops uploaded to MinIO via a prior `npm run … ingest` or by running `uploadAssets` against the backfilled `assets/`), run `npm run dev -w web` and open `/en/decks`. Confirm the hero tiles show upright, correctly-framed character art (compare against the design preview). If any framing looks off, the crop box lives in one place — `ART_BOX_FRAC` in `card-data/accio_images.py` (Task 2) — adjust, re-run the backfill, re-upload.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/deck-hero-card.tsx app/web/src/components/__tests__/deck-hero-card.test.tsx
git commit -m "feat(web): render baked art crop in DeckHeroCard"
```

---

## Self-Review Notes

- **Spec coverage:** scope filter → Task 2 `is_wizard_witch`; crop recipe → Task 2 `crop_art`/`ART_BOX_FRAC`; object key → Task 1 `artCropKey`; upload → Task 3; DeckArt `crop` prop → Task 4; DeckHeroCard wiring → Task 5; DeckDiscoverRow untouched → not modified in any task; idempotency → Task 2 (`generate_art_crops` skip) + Task 3 (existing diff-by-key); en-only → Task 1 (no lang param). All covered.
- **Type consistency:** `artCropKey(id: string): string` defined in Task 1, consumed identically in Tasks 3, 4. `crop?: boolean` defined in Task 4, consumed in Task 5. `generate_art_crops(cards) -> (int, int)` defined and called consistently in Task 2.
- **Non-Wizard/Witch starters** (18 Character cards) intentionally have no crop; `DeckArt`'s `onError` falls back to the lesson gradient — accepted per spec.

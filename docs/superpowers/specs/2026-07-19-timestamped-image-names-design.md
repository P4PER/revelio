# Timestamped image names for cache-busting

**Date:** 2026-07-19
**Status:** Approved — ready for implementation plan

## Problem

Every stored image (card art, thumbnail, deck art-crop, set symbol) is keyed
purely by its identifier, e.g. `cards/bs-1-dean-thomas.webp`,
`symbols/{code}.webp`. When an editor re-uploads a card image or an admin
re-uploads a set symbol, the object is **overwritten in place** — the URL never
changes, so browsers and the `portkey.revelio.cards` proxy keep serving the
stale copy. There is no cache-busting mechanism.

Separately, three database columns hold upstream provenance that is never used
for storage and should be removed:

- `card_localizations.image_file` — the source scan filename, e.g. `DeanThomas.png`.
- `card_localizations.image_url` — a source URL, effectively always null / unused.
- `sets.symbol` — an upstream logo URL, e.g. `https://harrypottertcg.com/images/logoAAH.png`.

Object keys are **already named by id** (the asset files in
`card-data/assets/cards/` are named `{cardId}.webp`, and the web resolves images
via `imageKey(card.id, …)`). No rename is required — only versioning.

## Goals

- Give every stored image a **version segment** in its object key so a changed
  image gets a genuinely distinct URL that busts any cache.
- Serve all versioned images with `Cache-Control: public, max-age=31536000, immutable`.
- Drop the three provenance columns; the new version columns take over the only
  functional job the old columns did (the "does an image exist?" signal).
- Keep ingest **idempotent**: re-running it with unchanged assets must not churn
  object keys.

## Non-goals / out of scope

- No CDN/proxy configuration changes (distinct paths bust on any cache).
- No new UI.
- No change to card ids or asset filenames.
- Backfill of images that only exist as editor uploads outside `card-data` — at
  this pre-launch stage there are none in production; re-uploading is the
  recovery path if any exist.

## Key format

`version` is epoch **seconds** (an integer). It becomes a **required** parameter
on the key helpers in `core/src/images.ts`, so `tsc --noEmit` (the CI gate)
flags any call site that fails to supply one.

```
cards/{id}.{v}.webp                 cards/{id}.{lang}.{v}.webp
cards/thumb/{id}.{v}.webp           cards/thumb/{id}.{lang}.{v}.webp
cards/art-crop/{id}.{v}.webp
symbols/{code}.{v}.webp
```

Full image and thumbnail are uploaded together and **share one version**.

## Schema changes

Net effect is a **swap**, not an addition. One append-only Drizzle migration
(edit `db/src/schema.ts`, then `npm run generate` from `app/db`; do **not** touch
the frozen `0000` baseline):

| Drop | Add |
|---|---|
| `card_localizations.image_file` | `card_localizations.image_version` (`integer`, nullable) |
| `card_localizations.image_url` | — |
| `sets.symbol` | `sets.symbol_version` (`integer`, nullable) |
| — | `cards.art_crop_version` (`integer`, nullable) |

**Existence semantics:** a non-null version means "this image exists."
- `image_version != null` → card has an image for that language.
- `symbol_version != null` → set has a symbol.
- `art_crop_version != null` → card has a baked art-crop.

## Version semantics

- **Editor / admin uploads** (`uploadCardImage`, `uploadSetSymbol`): version =
  current time in epoch seconds (`Math.floor(Date.now() / 1000)`). This is the
  literal upload timestamp.
- **Ingest-baked images** (card full, thumb, art-crop, seeded symbols): version =
  the **source asset file's mtime** in epoch seconds (`statSync(file).mtimeMs`).
  A real timestamp, and deterministic per file state — so re-running ingest with
  unchanged assets produces the same key and `objectExists` still skips it,
  preserving idempotency.

## Data flow

Each render site builds an image URL from its data source, so the relevant
version must reach it through that source.

| Image | Version stored on | Reaches renderer via |
|---|---|---|
| Card full + thumb (per lang) | `card_localizations.image_version` | Meili doc `imageVersion` (for the effective `imageLang`) **and** card DTO localizations |
| Art-crop (default lang) | `cards.art_crop_version` | card DTO / deck card data (DB) |
| Set symbol | `sets.symbol_version` | set DTO (DB) |

### Meilisearch document (`search/src/documents.ts`)

- `SearchDocument` gains `imageVersion: number | null` (stored only, **not**
  filterable/sortable → `CARD_INDEX_SETTINGS` unchanged).
- `LocalizationFields` swaps `imageFile` → `imageVersion: number | null`.
- `buildCardDocument`: `effectiveImageLang` predicate becomes
  `(l) => d.localizations[l]?.imageVersion != null`; after picking `imageLang`,
  set `imageVersion = imageLang ? d.localizations[imageLang].imageVersion : null`.
- `reindexCard` unchanged in shape; a reindex is required to populate the new
  field on existing docs.

### DB DTOs (`db/src/queries.ts`, `core/src/domain.ts`)

- Card localization DTO: drop `imageFile`/`imageUrl`, add `imageVersion`.
- `getCardIndexData` localizations: swap `imageFile` → `imageVersion`.
- Set DTO: drop `symbol`, add `symbolVersion`.
- Card DTO / card rows exposed to deck rendering: add `artCropVersion`.
- `setLocalizationImage(db, cardId, lang, imageVersion | null)` writes the
  version (null on removal) instead of a filename.
- Add `setSetSymbolVersion(db, code, symbolVersion | null)` (replaces the write
  side of `setSymbolFile`).

## Write paths (web server actions)

- `web/src/lib/image-actions.ts` `uploadCardImage`:
  1. Read the card's current `image_version` for that lang.
  2. If present, **delete** the old `imageKey`/`thumbKey` objects (no orphans).
  3. Compute `v = now (epoch s)`, write full + thumb under versioned keys with
     `Cache-Control: public, max-age=31536000, immutable`.
  4. `setLocalizationImage(db, cardId, lang, v)`, reindex, revalidate.
  - `removeCardImage`: delete the versioned objects (using the stored version),
    then `setLocalizationImage(…, null)`.
- `web/src/lib/set-actions.ts` `uploadSetSymbol` / `removeSetSymbol`: same
  read-old-version → delete-old → write-new(-with-cache-header) → persist flow,
  against `symbolKey`.
- `web/src/lib/s3.ts` `putObject` gains an optional `cacheControl` argument
  passed through to `PutObjectCommand`.

## Ingest

- `ingest/src/upload-images.ts` `collectUploads`: `statSync` each asset file for
  its mtime, derive `v = floor(mtimeMs/1000)`, build versioned keys for cards,
  thumbs, art-crop, and symbols. Upload with the immutable `Cache-Control`
  header. `objectExists` diffing is unchanged (unchanged mtime → same key → skip).
- `ingest/src/load-cards.ts`: stop writing `imageFile`/`imageUrl`; write
  `image_version` per localization (from the corresponding asset file's mtime,
  or null when the card has no asset for that lang).
- `ingest/src/load-sets.ts`: stop writing `symbol`; write `symbol_version` (from
  the symbol asset's mtime, or null).
- `cards.art_crop_version`: set from the art-crop asset's mtime (null when no
  crop was baked for that card).
- `ingest/src/build-documents.ts`: swap `imageFile` → `imageVersion` in the
  localization shape it assembles for the search index.

Ingest must derive DB versions and S3 object versions from the **same** mtime so
the stored version always matches the uploaded object's key.

## Render sites (all must pass the version)

- `card-detail.tsx`, `card/[id]/page.tsx` (OG image), `card/[id]/edit/page.tsx`:
  `effectiveImageLang` predicate → `imageVersion != null`; pass
  `imageVersion` into `imageKey(id, lang, defaultLang, v)`.
- `card-tile.tsx`, `deck-card-browser.tsx`, `collection-cards.ts` (Meili-driven
  thumbs): use `hit.imageVersion` with `thumbKey`.
- `deck-gallery.tsx`, `deck-art.tsx` (art-crop / default-lang thumb): use the
  card's `artCropVersion` (art-crop) or `imageVersion` (thumb) from deck card
  data. `deck-art` keeps its `onError` fallback for cards without a crop.
- `set-symbol.tsx` and its callers (collection-sidebar, filter-sheet,
  admin-sets-table, set-card, set-symbol-uploader): existence check becomes
  `symbolVersion != null`; pass `symbolVersion` into `symbolKey(code, v)`.

## Migration & backfill (rollout)

1. Ship the schema migration (drop 3 columns, add 3 version columns) + code.
2. **Re-run ingest** against the deployed services: it re-uploads every asset
   under a versioned key (mtime-derived), writes the version columns, and
   reindexes Meilisearch — populating `imageVersion` on all documents.
3. Purge the old unversioned objects from MinIO (`cards/*.webp` without a
   version segment, `symbols/*.webp`). One-time cleanup; optional but tidy.

Because `NEXT_PUBLIC_IMAGE_BASE_URL` is build-time only and unaffected, no
rebuild is needed for the base URL; the web image just needs the new code +
reindex.

## Testing

- `core`: `imageKey`/`thumbKey`/`artCropKey`/`symbolKey` produce the versioned
  key shape (with and without lang).
- `search`: `buildCardDocument` sets `imageVersion` for the effective lang and
  `null` when no localization has an image; `effectiveImageLang` uses the
  version predicate.
- `db`: `setLocalizationImage` upserts `image_version`; the new
  `setSetSymbolVersion` writes/clears `symbol_version`; DTO shapes reflect the
  dropped/added columns.
- `web` (existing service-backed tests): `uploadCardImage` deletes the prior
  version's objects and writes new versioned objects with the immutable
  `Cache-Control`; `removeCardImage` deletes by stored version; same for
  `uploadSetSymbol`.
- `npm run verify -w @revelio/db` passes (schema matches generated migration).

## Files touched (summary)

- `app/core/src/images.ts`, `app/core/src/domain.ts`
- `app/search/src/documents.ts`
- `app/db/src/schema.ts` (+ generated `drizzle/NNNN_*.sql`), `app/db/src/queries.ts`
- `app/ingest/src/{upload-images,load-cards,load-sets,build-documents}.ts`
- `app/web/src/lib/{image-actions,set-actions,s3}.ts`
- `app/web/src/components/{card-detail,card-tile,deck-card-browser,deck-gallery,deck-art,set-symbol,set-symbol-uploader,collection-sidebar,filter-sheet,admin-sets-table,set-card}.tsx`
- `app/web/src/lib/collection-cards.ts`
- `app/web/src/app/[locale]/card/[id]/page.tsx`, `.../edit/page.tsx`

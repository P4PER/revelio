# Edit Card Images — Per-Language Upload (Plan 4b-5) — Design

> Fifth and final editing slice of **Plan 4b (Authoring + Auth)**. Builds on the editor-gated `/card/[id]/edit` page and the `@revelio/core` image helpers / `@revelio/search` document. Images become genuinely per-language; editors upload a localized image for a card.

## Goal

Let editors upload (and remove) a card image for a specific language, processed to WebP (full + thumbnail), stored in S3/MinIO, with the card re-indexed. Where a language has no image of its own, the card falls back to the default language's image (today's behaviour), so nothing regresses and no existing image is re-seeded.

## Verified facts

- Display is currently **per-card-id**: detail uses `imageUrl(base, imageKey(card.id))` = `{base}/cards/{id}.webp`; the tile uses `thumbKey(hit.id)` gated by `hit.imageFile`. `image_file` (per localization) is only a "has image" flag; the bytes are shared per card id.
- `image_file`/`image_url` are per-language columns on `card_localizations`; in the data only the default language (en) is populated, other languages are null.
- `defaultLanguage` is available in `CardDetailDTO`, in `CardIndexData`, and on the `cards` row. `buildCardDocument(d, lang)` already has all localizations + `defaultLanguage`.
- Images are WebP end-to-end (a prior commit). `sharp` is **not** yet a dependency. Compose does **not** publish MinIO to the host (only internal `minio:9000`).

## Key scheme (no re-seed)

Make the image helpers language-aware, keeping the default-language image at its existing key so nothing must be re-uploaded:

- `imageKey(id, lang, defaultLang)` → `cards/{id}.webp` when `lang === defaultLang`, else `cards/{id}.{lang}.webp`.
- `thumbKey(id, lang, defaultLang)` → `cards/thumb/{id}.webp` / `cards/thumb/{id}.{lang}.webp`.
- `symbolKey` unchanged. Callers (card-detail, card-tile, OG image route) are updated to pass `lang` + `defaultLang`.

## Display with fallback (detail, tile, OG)

Effective image for (card, locale L), default language D:
- if `localizations[L].imageFile` → key for L;
- else if `localizations[D].imageFile` → key for D (the shared default image);
- else none (placeholder / no image).

- **Detail** computes this in the component from the DTO (`card.localizations`, `card.defaultLanguage`).
- **Tile** reads the search document, which now carries the **resolved** language. `buildCardDocument` computes `imageLang = localizations[lang]?.imageFile ? lang : (localizations[defaultLanguage]?.imageFile ? defaultLanguage : null)`. The doc's `imageFile` field is **replaced by `imageLang: string | null`**, and the doc carries `defaultLanguage`; the tile renders `hit.imageLang ? imageUrl(base, thumbKey(hit.id, hit.imageLang, hit.defaultLanguage)) : null`. **The search index is rebuilt** (document shape change).

## Upload (immediate, editor-only)

A server action `uploadCardImage(formData)`:
- `await requireRole('editor')`; read `file` (File), `cardId`, `lang`.
- Validate: MIME `image/*`, size ≤ 5 MB; else `{ ok:false, error }`.
- **Process with `sharp`**: full image → WebP (preserve alpha, high quality) at `imageKey(id, lang, defaultLang)`; a 300px-wide thumbnail → WebP at `thumbKey(id, lang, defaultLang)`.
- `PutObject` both to S3 (via a web-side write client).
- Set `image_file` for `(cardId, lang)` to the uploaded filename (non-null = "this language has an image") via `setLocalizationImage(db, cardId, lang, file)`.
- **Re-index** the card in every language (the effective `imageLang` changed); `revalidatePath('/card/{id}')` + the edit path. Return `{ ok:true }` / `{ ok:false, error }`.

A `removeCardImage(cardId, lang)` action deletes that language's key + thumb, sets `image_file(lang) = null`, re-indexes → the language falls back to the default. (Removing the default language's image removes the shared image for all fallbacks — a valid, destructive action.)

**S3 write client:** a web server-only lib `@/lib/s3` mirroring `app/ingest/src/upload-images.ts` (`S3Client` + `PutObjectCommand` / `DeleteObjectCommand`). New server env: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`.

## Data

- `setLocalizationImage(db, cardId, lang, imageFile: string | null)` in `@revelio/db` — upserts just the localization's `image_file` (with `origin:'user'`, `updatedAt`), leaving name/text/etc. untouched. (A card with no localization row for that language is unexpected on the edit page; the fn upserts by `(cardId, lang)` and sets a placeholder name only if inserting — but in practice the row exists.)

## UI (bordered "Bild — {lang}" section — chosen)

On the edit page, a bordered section titled `Bild — {language}`: the current effective image preview on the left; a file picker + "Hochladen/Ersetzen" + "Entfernen" on the right; an "ⓘ nutzt aktuell das {default}-Bild" hint when the active language has no own image (falling back). Immediate upload (its own action, separate from the unified text Save, because it is binary). Editor-gated (the page already is). Localized `edit` messages.

## Infra prerequisite

- Compose publishes MinIO on the host (`ports: ["127.0.0.1:9000:9000"]`) so the host-run web can write in dev. The web gets the S3 write env (dev `.env.local`: `S3_ENDPOINT=http://localhost:9000`, minioadmin creds, bucket `card-images`).

## Error handling

- Reject non-images and oversize files with a toast (no write). S3/sharp failures → `{ ok:false }` + error toast (nothing half-written is user-visible; a failed thumbnail leaves the previous state). Re-index failure is non-fatal (warning toast), consistent with the localization save.

## Testing

- `imageKey`/`thumbKey` language-aware (unit: default→shared key, other→suffixed key).
- `buildCardDocument` resolves `imageLang` with fallback (unit: lang has image → lang; only default has → default; none → null).
- `setLocalizationImage` sets only `image_file` (db integration).
- `uploadCardImage`: gated (non-editor rejected); validates type/size; processes + `PutObject` to **testminio** (integration) at the right keys; sets `image_file`; re-indexes. `removeCardImage` deletes + nulls + re-indexes.
- Detail component fallback (renders the locale image, or the default-language image when the locale has none).

## Scope / decomposition

Large but cohesive. Implemented as one plan with separable tasks: (1) language-aware `imageKey`/`thumbKey` + callers; (2) detail/tile/OG fallback; (3) search doc `imageLang` + rebuild; (4) S3 write client + env + Compose MinIO host port; (5) `setLocalizationImage` + `uploadCardImage`/`removeCardImage` (sharp); (6) the bordered image UI.

- **OUT:** bulk/multi-image per card; cropping/editing; drag-and-drop (a plain file picker for now); CDN/caching config (Plan 5).

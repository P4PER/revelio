# Admin Sets CRUD (+ `_localizations` naming) — Design

> **Status: LOCKED (brainstormed 2026-07-06).** Ready for `superpowers:writing-plans`.
> **Spec 2 of 2** in the "editable, admin-managed reference data" track. It reuses
> the editor-gated `/admin` shell built in Spec 1 (merged PR #4) and completes
> that track. Also folds in a small naming-consistency rename agreed during
> brainstorming.

## Summary

Give **sets** full admin CRUD — create, edit, and delete-if-empty — with
localized names, a symbol image upload, and the existing metadata
(`releaseDate`, `isOfficial`). Set names are localized via a new
`set_localizations` table (the `card_localizations` pattern), and the search
index stops denormalizing `setName` so set edits never require a reindex. As a
consistency pass, the two per-language tables that don't follow the
`_localizations` convention are renamed.

## Context & principle

Sets are a **core entity** (schema `--- core tables ---`, alongside `cards`),
not frozen vocabulary. Per the track's dividing line — frozen vocabulary → i18n
catalog; **data-driven / admin-created → the DB** — sets' editable data lives in
the DB with an admin surface. Because sets are a core entity like cards, their
per-language content uses the **`card_localizations` convention** (`_localizations`
table with a base-column fallback), not the `sub_type_localizations` vocabulary
shape.

## Scope

**In scope**

- Rename `sub_type_translations` → `sub_type_localizations` and
  `card_ruling_texts` → `card_ruling_localizations` (tables + Drizzle export
  consts; columns and file/function names unchanged).
- `set_localizations(set_code, lang, name)` table + locale-aware set-name read path.
- Set symbol upload/remove (S3, reusing the `image-actions` pattern).
- Admin CRUD: create a set, edit a set (fields + localized names + symbol),
  delete a set **only when it has 0 cards**.
- Drop `setName` from the search document; resolve set names at render.

**Out of scope**

- Cascade-deleting a set with cards (blocked, not offered).
- Editing `cardCount` (derived from cards, read-only) or renaming a set `code`
  (primary key, create-only).
- Localizing any set field other than `name`.

## Verified current-state facts

- `sets`: `code` (pk), `name` (flat), `releaseDate`, `isOfficial`, `cardCount`,
  `symbol`, `editable` mixin. Cards FK `set_code → sets.code`.
- `symbol` is a **presence flag whose value is unused for the URL** — `SetSymbol`
  builds the URL from `symbolKey(code)` = `symbols/<code>.webp` and renders a
  single-colour silhouette (CSS mask); `set-card`/`filter-drawer` only test
  `set.symbol` truthiness. This mirrors `card_localizations.imageFile`, which
  stores `file.name` for a stable-keyed image.
- Set names render via `SetDTO.name` in: home, `/sets`, `/sets/[code]`,
  `filter-drawer`, `search` results, and card detail (`set`). Read via
  `listSets(db)` / `getSetByCode(db, code)` (both currently locale-unaware).
- The Meilisearch document **stores `setName`** (`search/src/documents.ts`), used
  for **display** in results (`setCode` is the filterable field; `setName` is not
  searchable). `search/page.tsx` already loads `listSets`.
- The upload/S3 primitives to reuse: `image-actions.ts` (requireRole → validate →
  `sharp`→webp → `putObject`/`deleteObject` → DB → `revalidatePath`), `lib/s3.ts`
  (`getS3`/`putObject`/`deleteObject`), `symbolKey(code)` in `@revelio/core`.
- The `/admin` shell (editor-gated layout + index) and the `saveSubType…` action
  pattern from Spec 1 (PR #4) are ready to extend.

## Design

### 0. Rename to the `_localizations` convention (first step)

Rename the two non-conforming per-language tables so **all** per-language tables
end in `_localizations`:

- `sub_type_translations` → `sub_type_localizations` (const `subTypeTranslations`
  → `subTypeLocalizations`).
- `card_ruling_texts` → `card_ruling_localizations` (const `cardRulingTexts` →
  `cardRulingLocalizations`).

Columns (`label`, `text`, …) and file/function names are unchanged (the
`_localizations` convention is about the table name; `card_localizations` already
has many columns, so there is no single "value column" rule).

**Migration risk:** `drizzle-kit generate` may render a rename as DROP + CREATE
(data loss). The plan must confirm the generated migration is a real
`ALTER TABLE … RENAME TO …`; if drizzle-kit can't produce a clean rename
non-interactively, hand-write the rename SQL and reconcile the snapshot so
`npm run verify` passes. All existing suites must stay green after the rename.

### 1. Schema: `set_localizations`

```
set_localizations
  set_code  text → sets.code (FK, on delete cascade)
  lang      text
  name      text  notNull
  PK (set_code, lang)
```

`sets.name` stays the canonical default/fallback (the create field). No `editable`
mixin (consistent with `sub_type_localizations`). Exact parallel to
`cards` / `card_localizations`: base column + per-language row with fallback.

### 2. Localized set-name read path

Display queries become locale-aware: `listSets(db, locale)` and
`getSetByCode(db, code, locale)` join `set_localizations` and return
`name = loc[locale] ?? sets.name`; consumers keep using `set.name` (now
localized). An admin query returns **all** localizations per set for editing.
Set names embedded elsewhere (card detail's `set`, the search page's set map)
resolve through the same fallback for the request locale.

### 3. Symbol upload (S3, reusing `image-actions`)

- `uploadSetSymbol(formData)` — `requireRole('editor')`, validate an image
  (type + size cap), `sharp` → webp **preserving alpha** (the image is used as a
  CSS mask), `putObject(symbolKey(code), …)`, set `sets.symbol = file.name`
  (presence flag + original filename, mirroring `imageFile`), then
  `revalidatePath` the set surfaces.
- `removeSetSymbol(code)` — `deleteObject(symbolKey(code))`, set `sets.symbol = null`.
- **Known, accepted limitation:** the S3 key is stable (`symbols/<code>.webp`),
  so a re-upload can briefly show a cached old symbol — identical to today's
  card-image behaviour. No cache-busting now (YAGNI).

### 4. Search: drop `setName` from the index (no reindex on set edits)

Remove `setName` from the search document so a set-name change never staleness-
breaks the index:

- Drop `setName` from `search/src/documents.ts` (`SearchDocument`,
  `CardIndexData`, `buildSearchDocument`), from `ingest/src/build-documents.ts`,
  and from `db/src/queries.ts` `getCardIndexData`. `setCode` stays (the
  filterable field).
- The search results UI resolves the set name at render from a `code → name` map
  built from `listSets(locale)` — which `search/page.tsx` already loads. Pass the
  map (or resolved names) into the results component.
- Result: editing a set (name or a localization) requires **no reindex** —
  consistent with Spec 1's "ids in the index, names at render" principle. Old
  documents carrying a stale `setName` are simply ignored and cleaned on the next
  ingest.

### 5. Server actions (`set-actions.ts`)

All `'use server'`, `requireRole('editor')`, zod-validated, `revalidatePath` the
affected surfaces. Return `{ ok: true } | { ok: false; error }`.

- `createSetAction` — `code` (unique, immutable, non-empty), `name`,
  `releaseDate?`, `isOfficial`, optional per-locale names. Rejects a duplicate
  `code` (`error: 'exists'`).
- `updateSetAction` — `name`, per-locale names (`set_localizations` upsert; blank
  deletes), `releaseDate`, `isOfficial`.
- `deleteSetAction` — allowed **only when `cardCount === 0`**, else
  `{ ok: false, error: 'has-cards' }`; on success also removes the symbol object
  and cascades `set_localizations`.
- `cardCount` is read-only (derived from cards).

### 6. Admin UI (route-based, mirroring `card/[id]/edit`)

Sets have several fields plus an image upload, so an inline grid (Spec 1's
sub-type style) is too cramped — use focused form pages:

- `/[locale]/admin/sets` — list (name, code, release date, official, cardCount,
  symbol thumb) + "New set" + edit links. Add a "Sets" entry to the `/admin`
  index.
- `/[locale]/admin/sets/new` — create form.
- `/[locale]/admin/sets/[code]/edit` — edit fields + per-locale names + symbol
  upload/remove + a "Delete" action gated on `cardCount === 0`.

All under the editor-gated `/admin` layout from Spec 1.

## Testing

- **Rename**: every existing suite green after the rename; `npm run verify` /
  `check` pass; the generated migration is a rename, not drop+create.
- **`set_localizations`** DB fns (Testcontainers): localized read with
  `sets.name` fallback; admin all-locales read; upsert + blank-deletes; FK cascade.
- **Actions**: editor gate; create rejects duplicate/empty code; delete blocked
  when `cardCount > 0` and allowed at 0 (also drops symbol + localizations).
- **Symbol upload**: S3 put/delete + `sharp` webp (alpha preserved); `symbol`
  set to the filename / cleared.
- **Search**: `getCardIndexData`/`buildDocuments` no longer emit `setName`; the
  results UI shows the localized set name from the map; no reindex is triggered
  by a set edit.
- **Admin forms**: create/edit render and submit; delete-if-empty guard visible.

## Next step

`superpowers:writing-plans` for the phased implementation plan (rename first,
then schema/read-path, symbol upload, search-doc change, actions, admin UI).

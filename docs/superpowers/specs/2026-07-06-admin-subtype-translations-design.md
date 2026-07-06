# Admin Section + Sub-type Translations — Design

> **Status: LOCKED (brainstormed 2026-07-06).** Ready for `superpowers:writing-plans`.
> This is **Spec 1 of 2** in the "editable, admin-managed translations for
> data-driven reference data" track (the deferred follow-up to the
> attribute-labels-i18n refactor, PR #3). It establishes the shared **admin
> section shell** and applies it to the smaller case first: **sub-type
> translations**. **Spec 2 — Sets CRUD** (create/edit sets, symbol upload, name
> i18n) reuses this admin shell and is designed separately afterward.

## Summary

`sub_types` are a **data-driven** vocabulary — they self-extend from card data
(`load-attributes.ts`) and therefore cannot live in the static next-intl catalog
that holds the frozen vocabularies (types/lessons/rarities/finishes/legalities).
Today they render via `humanize(slug)` (`death_eater` → "Death Eater") with no
real translations. This feature gives sub-types **DB-stored, admin-editable
per-locale translations**, rendered with a `humanize()` fallback, and introduces
the first **editor-gated admin section** to manage them.

## Motivation & principle

The attribute-labels refactor drew the line: **frozen curated vocabulary →
next-intl catalog; data-driven / admin-created data → the DB.** Sub-types are the
data-driven case. The card data carries **no** per-language sub-type strings
(`DistLocalization` has `name`/`text`/`flavorText` only), so translations must be
**human-authored** through an admin surface — the DB is their correct home.

An admin list of all sub-types also solves discovery: after a new set is
ingested, new sub-types appear in the list automatically (untranslated cells are
blank), so nothing has to be manually hunted.

## Verified current-state facts

- `sub_types` is a `code`-only table (PK `code`); seeded as codes by
  `ingest/src/load-attributes.ts` (`codeRows`).
- Sub-types render only in `web/src/components/card-detail.tsx` via a local
  `humanize()` (line 15) over `card.subTypes` (codes). No other consumer.
- The Meilisearch document stores `subTypes: string[]` (codes) as a
  `filterableAttribute`; **no labels are indexed** → translating a sub-type needs
  **no reindex**.
- Roles are `user(0) < editor(1) < admin(2)`; `requireRole('editor' | 'admin')`
  throws `Forbidden` below the threshold. Write actions follow the
  `*-actions.ts` pattern (`'use server'` + `requireRole` + zod + a `@revelio/db`
  fn + `revalidate*`), e.g. `rulings-actions.ts`.
- Per-language data uses **normalized tables** already: `card_ruling_texts`
  = `(ruling_id, lang) → text`, `card_localizations` = `(card_id, lang) → …`.
- There is **no admin section** yet; every edit surface lives under
  `/[locale]/card/[id]/edit`. `site-header.tsx` is an async server component with
  a nav; it does not currently read the session.

## Scope

**In scope**

- A normalized `sub_type_translations` table + migration.
- `@revelio/db` read/write query fns for sub-type translations.
- An **editor-gated admin section shell** (`/[locale]/admin`) + a role-gated
  "Admin" nav link — designed to host future reference-data editors (Sets).
- A sub-types admin page listing every sub-type with per-locale label inputs and
  one Save, wired to a `sub-type-actions.ts` server action.
- Card-detail read path: resolve sub-type labels from the DB (cached), fall back
  to `humanize()`. Extract `humanize` to a shared helper.

**Out of scope** (Spec 2 or later)

- **Sets** CRUD / creation / symbol upload / set-name i18n.
- Creating or deleting sub-types (they are data-derived; only their translations
  are editable).
- Localizing the *code* itself or renaming codes.

## Design

### 1. Storage — `sub_type_translations` (normalized)

```
sub_type_translations
  sub_type_code  text  → sub_types.code  (FK, on delete cascade)
  lang           text
  label          text  notNull
  PK (sub_type_code, lang)
```

Chosen over a `labels` jsonb on `sub_types` for consistency with the existing
per-language tables (`card_ruling_texts`, `card_localizations`), FK integrity,
and simple per-locale querying. Migration `0003` (incremental, append-only).

### 2. `@revelio/db` query fns

- `getSubTypeLabels(db, lang): Promise<Record<string, string>>` — all
  `(code → label)` for one language.
- `listSubTypesWithTranslations(db): Promise<{ code: string; labels: Record<string, string> }[]>`
  — every sub-type code (from `sub_types`) with its translations across locales,
  for the admin page; codes with no translations return `labels: {}`.
- `saveSubTypeTranslations(db, rows: { code: string; lang: string; label: string }[])`
  — upsert on `(sub_type_code, lang)`; an **empty** label deletes that row.

### 3. Admin section shell

- **Route** `/[locale]/admin` — a server component gated by
  `requireRole('editor')` (in the segment's layout so all children inherit it).
  The index lists manageable reference data; for Spec 1 that is a single link to
  "Sub-types". Sets will be added as a sibling entry by Spec 2.
- **Nav** — `site-header.tsx` gains an "Admin" link rendered only when the
  server-side session role is ≥ editor (never emitted for anon/user). Uses the
  locale-aware `Link` and a new `nav.admin` message key.

### 4. Sub-types admin page + write path

- **Page** `/[locale]/admin/sub-types` — a client form seeded by
  `listSubTypesWithTranslations`, showing every sub-type (sorted by code) with an
  input per routing locale (`en`, `de`); untranslated inputs are blank. One Save.
- **Action** `web/src/lib/sub-type-actions.ts` →
  `saveSubTypeTranslationsAction(input)`: `'use server'`,
  `requireRole('editor')`, zod-validated (`lang` restricted to `routing.locales`),
  calls `saveSubTypeTranslations`, then `revalidateTag('sub-type-labels')`.
  Returns `{ ok: true } | { ok: false; error }` like `rulings-actions.ts`.

### 5. Read path + fallback

- A cached loader `getSubTypeLabelMap(locale)` (`web/src/lib/subtype-labels.ts`)
  wraps `getSubTypeLabels` with `unstable_cache` tagged `sub-type-labels`
  (translations change rarely; the save action revalidates the tag).
- `card-detail.tsx` awaits the map and renders `map[code] ?? humanize(code)`, so
  the chain is **DB translation for the locale → `humanize(slug)`**. `humanize` is
  extracted to a shared helper (`web/src/lib/humanize.ts`) so the fallback is
  defined once; new/untranslated sub-types render humanized — never broken.

### 6. Reindex, ingest — unchanged

- **No Meilisearch reindex** (codes indexed, labels render-time).
- **Ingest unchanged**: `load-attributes.ts` keeps seeding sub-type *codes* only;
  the translations table starts empty and is admin-authored. New sub-types from a
  later ingest surface in the admin list automatically.

## Testing

- `@revelio/db` (Testcontainers): `getSubTypeLabels`, `listSubTypesWithTranslations`
  (incl. an untranslated code → `{}`), and `saveSubTypeTranslations` (upsert +
  empty-string-deletes + FK to `sub_types`).
- Action: rejects below `editor`, validates `lang`, and deletes on empty label.
- Read path: `map[code] ?? humanize(code)` — translated hit, humanized miss.
- Admin page: renders a row for every sub-type, pre-filling existing translations.

## Follow-up — Spec 2: Sets management (full CRUD)

Reuses this admin shell. Adds: set-name i18n (a `set_translations` table, same
shape), create/edit forms, symbol image upload via the existing S3/`image-actions`
path, and full CRUD — its own brainstorming pass.

## Next step

`superpowers:writing-plans` for the implementation plan.

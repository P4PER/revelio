# Attribute Labels via i18n; Reference Tables Store Codes Only — Design

> **Status: LOCKED (brainstormed 2026-07-06).** Supersedes the earlier
> "Editable Attributes (DB as source of truth)" proposal at this path. The
> brainstorming pass **inverted that premise**: for a frozen vocabulary, labels
> do **not** belong in the DB. This document is ready for `superpowers:writing-plans`.

## Summary

Attribute metadata is currently authored in **three** places (code constants,
a bespoke static label JSON, and a dead DB `labels` column). This design
collapses that to **one authority per concern**, following the i18n best practice
for a fixed vocabulary:

- **Codes, order, colour** → `app/core/src/attributes.ts` (unchanged as the
  authoritative option list; keeps the literal-union types).
- **Labels / translations** → the standard **next-intl** message catalog.
- **DB reference tables** → **codes only** (plus a `sort_order` column on the
  two tables with an inherent rank — `rarities`, `finishes`). They exist purely as
  foreign-key integrity anchors for `cards`.

No admin editor and no Meilisearch reindex are involved. This is a
consolidation/cleanup refactor, not a new feature.

## Motivation

The lesson-cost work surfaced that attribute metadata lives in three places:

- **Code constants** — `app/core/src/attributes.ts` (`TYPES`, `LESSONS` with
  `color`, `RARITIES`, `FINISHES`, `LEGALITIES`), each entry carrying a
  redundant `sortOrder` field.
- **Static label JSON** — `app/web/src/i18n/attribute-labels/{en,de}.json`, read
  by `attrLabel()` via a slugify-matched lookup (the live label path).
- **DB `labels` jsonb** — seeded into the reference tables by
  `ingest/src/load-attributes.ts`, but **read by nobody**. The web app never
  issues a `select … from <reference table>`.

### Why labels belong in i18n, not the DB (the key decision)

For a **frozen, controlled vocabulary** — the 2001 HP-TCG types/lessons/
rarities/finishes/legalities never change — best practice is:

- The **code** is the stable machine key. That is what the DB stores, what a
  card references (FK), and what Meilisearch filters on. Language-independent.
- The **label** is a presentation concern. Translations belong in the i18n
  message catalog (here: next-intl), giving one translation workflow, git-
  versioned strings, standard tooling, and no DB round-trip.

Putting enum translations in the DB only pays off when **non-developers must
edit them at runtime without a deploy**. That does not apply here: a new
language already requires editing the frontend message files, so vocabulary
labels ride along in the same catalog. Runtime admin editing of a fixed enum is
over-engineering.

**The dividing line (also governs the Sets follow-up):** frozen vocabulary →
i18n catalog; **data-driven / admin-created** data (Sets, `sub_types`) → the DB,
because new entries appear without a deploy and cannot live in a static catalog.

## Verified current-state facts

- Filters (`web/src/components/filter-drawer.tsx`, `quick-filters.tsx`) iterate
  the constant **arrays** (`TYPES.map`, `options: LESSONS`, …). Display order is
  the **array order**; the `sortOrder` **field is never read** for ordering.
- Meilisearch documents (`search/src/documents.ts`) store attribute **codes**
  only (`lesson`, `rarity`, `types[]`, …) as `filterableAttributes`. No labels
  are indexed → editing a label needs **no reindex**.
- The DB `labels` jsonb and `sort_order` columns on the reference tables are
  populated by ingest but read by no runtime code path.
- `attrLabel()` covers `types | lessons | rarities | finishes`; **legalities**
  currently renders via `humanize()`; **sub_types** is not curated in code and
  self-extends from card data (`load-attributes.ts`).
- `core/src/domain.ts` `AttributeTermDTO` (`{code,label,sortOrder}`) is an
  aspirational facet DTO that no code path returns or consumes.

## Scope

**In scope**

- Move attribute labels into the next-intl catalog; delete the bespoke
  `attribute-labels/{en,de}.json` and its slugify lookup.
- Drop the dead `labels` jsonb from all six reference tables.
- Drop `sort_order` from `types`, `lessons`, `legalities`, `sub_types`; keep it
  only on `rarities` and `finishes` (the vocabularies with an inherent rank).
  `types`/`lessons` are unordered sets whose display order lives in the
  `attributes.ts` array position, and nothing reads their `sort_order` from the DB.
- Drop the `editable` mixin (`created_at`/`updated_at`/`origin`) from the six
  reference tables (never-edited seed data).
- Remove the now-redundant `sortOrder` field from the `attributes.ts` constants
  and their zod schemas; array position becomes the single ordering authority.

**Out of scope**

- Any admin edit surface for attributes; runtime editing.
- Making `sub_types` labels editable/localized (stays data-driven / humanized).
- Renaming attribute codes (primary-key changes).
- **Sets** — editable/creatable sets are a **separate follow-up spec** (see
  below).

## Design

### 1. `core/src/attributes.ts` — drop the `sortOrder` field

Order becomes the array position; `color` stays on lessons; the `ATTRIBUTES`
map and all call sites (`TYPES.map(t => t.code)`, `options: LESSONS`) are
unchanged.

```ts
export type AttributeMeta = { code: string }
export type LessonMeta = AttributeMeta & { color: string }

export const TYPES: AttributeMeta[] = [
  { code: 'character' }, { code: 'creature' }, { code: 'spell' }, { code: 'item' },
  { code: 'lesson' }, { code: 'adventure' }, { code: 'location' }, { code: 'event' },
  { code: 'match' },
]
export const LESSONS: LessonMeta[] = [
  { code: 'care_of_magical_creatures', color: '#836444' },
  { code: 'charms', color: '#0069A9' },
  { code: 'potions', color: '#00A661' },
  { code: 'transfiguration', color: '#BC3E4D' },
  { code: 'quidditch', color: '#E2AE37' },
]
// RARITIES, FINISHES, LEGALITIES: { code } only, in deliberate order.
```

### 2. `core/src/schemas.ts` + `domain.ts`

- `attributeMetaSchema`: drop `sortOrder`, keep `code` (`lessonMetaSchema` keeps
  `+ color`).
- `AttributeTermDTO`: verified unused — remove it (or, if a consumer is found
  during implementation, trim it to `{ code, label }`).

### 3. DB schema + migrations

Target columns for the reference tables:

| Table | `code` (pk) | `sort_order` | ~~`labels`~~ | ~~`editable` mixin~~ |
|---|:--:|:--:|:--:|:--:|
| `rarities`, `finishes` | ✅ | ✅ | drop | drop |
| `types`, `lessons`, `legalities`, `sub_types` | ✅ | — | drop | drop |

`cards`, `sets`, `card_rulings`, `card_localizations` **keep** the `editable`
mixin — they are genuinely editable.

Follow `docs/MIGRATIONS.md`: edit `db/src/schema.ts`, run `npm run generate`
from `app/db`, review the generated `drizzle/NNNN_*.sql` (an incremental,
append-only `ALTER TABLE … DROP COLUMN` set), and commit the schema edit +
migration together. Never regenerate `0000`. `npm run verify` (CI) must pass.

### 4. `ingest/src/load-attributes.ts`

- Seed **`code` only** for `types`, `lessons`, `legalities`, `sub_types`.
- Seed **`code` + `sort_order`** for `rarities` and `finishes`, deriving
  `sort_order` from the **array position** in `attributes.ts`.
- Stop seeding `labels` and the mixin fields.

### 5. Labels via next-intl

- Add attribute labels to the standard next-intl message catalog under a stable
  namespace keyed by **code**, e.g. `attributes.lessons.charms`,
  `attributes.rarities.rare`, including **legalities** (retiring the `humanize()`
  special case).
- Rework `web/src/lib/attribute-labels.ts` to resolve from that catalog while
  **preserving the plain `attrLabel(scope, code, locale)` signature**. This
  matters because the call sites span **both** client components
  (`filter-drawer.tsx`, `quick-filters.tsx` — `'use client'`) **and** server
  components (`card-detail.tsx`, `active-filters.tsx`), and all pass `locale`
  explicitly. A server-only API (`getTranslations`) or the client hook
  (`useTranslations`) would break half of them, so `attrLabel` stays a plain
  function — the plan chooses the resolution mechanism (a direct keyed lookup
  into the statically-imported message files is the low-churn option that keeps
  it callable from either environment). Delete the bespoke
  `attribute-labels/{en,de}.json` files and the slugify-matched lookup.
- `sub_types` are **not** added to the catalog (data-driven); they keep their
  current humanized rendering.

### 6. Read path — unchanged

Filter components keep reading option lists and order from the `attributes.ts`
arrays. No DB read is introduced for the vocabulary, so no caching/revalidation
work is needed.

### 7. Reindex — none

Meilisearch stores codes; labels are render-time only. Label changes never touch
the index.

## Testing

- `attrLabel` resolves `en`/`de` for each in-scope scope, falls back to the code
  for an unknown key, and now resolves `legalities`.
- `attributeMetaSchema`/`lessonMetaSchema` still validate the trimmed constants.
- `load-attributes` seeds `code` for all tables and `sort_order` (from array
  position) only for `rarities`/`finishes`; no `labels`/mixin writes.
- A grep-level guard/assertion that no runtime code references the dropped
  columns; `npm run typecheck` and `npm run verify -w @revelio/db` pass.
- Existing Postgres-backed tests (Testcontainers) cover the migration applying
  cleanly.

## Follow-up: Spec 2 — editable / creatable Sets (separate track)

Distinct problem and distinct best-practice answer. Sets are **data-driven and
admin-created** (new sets appear without a deploy), and today they have only a
flat `name` (no i18n) and **no admin CRUD** at all. Because they are not frozen,
their names/labels **legitimately live in the DB**. That spec will cover: a
`labels`/i18n migration for set names, admin CRUD server actions
(`set-actions.ts`), and set-symbol handling through the existing S3/`image-actions`
path. It is intentionally not part of this cleanup.

## Resolution of the original proposal's open questions

1. **Scope of editability** → none at runtime; labels move to i18n, codes stay in
   the DB.
2. **Read path & caching** → unchanged; no DB read for vocabulary, so no caching.
3. **What stays in code** → codes, order (array position), and colour stay in
   `attributes.ts`; icons stay in `public/`.
4. **Authority vs re-ingest** → moot; ingest seeds codes (+ `sort_order`) only
   and never owns labels.
5. **Type safety** → preserved; constants keep the literal-union types, no codegen.
6. **Reindex on edit** → none; Meili stores codes.
7. **Permissions** → not applicable; no write surface.
8. **Migration** → drop `labels` (all six), `sort_order`
   (types/lessons/legalities/sub_types), and the `editable` mixin (all six);
   incremental append-only migration.

## Next step

`superpowers:writing-plans` to produce the phased implementation plan.

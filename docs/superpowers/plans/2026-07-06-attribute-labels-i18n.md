# Attribute Labels via i18n; Reference Tables Store Codes Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the triple-authored attribute metadata to one authority per concern — codes/order/colour in `attributes.ts`, labels in the next-intl catalog, and reference tables holding codes only.

**Architecture:** A cleanup refactor across four workspaces. Ingest stops seeding labels/provenance and derives `sort_order` from array position; the DB reference tables drop the dead `labels`/`editable`/extra `sort_order` columns; the core constants drop the redundant `sortOrder` field; the web app moves attribute labels into the standard next-intl message catalog and resolves them through a rewritten `attrLabel`. No admin editor and no Meilisearch reindex are involved (Meili filters on codes; labels are render-time only).

**Tech Stack:** TypeScript, npm workspaces, Drizzle ORM + Postgres (migrations via drizzle-kit), next-intl (Next.js App Router), Vitest, Testcontainers.

## Global Constraints

- All app commands run from `app/` (npm workspaces root). CI uses `working-directory: app`.
- **Conventional Commits** for every commit message.
- Migrations are **incremental and append-only**: edit `db/src/schema.ts`, then `npm run generate` from `app/db`. **Never** regenerate `0000` or delete `drizzle/`. `npm run verify -w @revelio/db` (CI-enforced) must pass — it fails if the schema drifted from migrations. The next migration file is `db/drizzle/0002_*.sql` (`0001` already dropped `lessons.color`).
- Postgres-backed tests use **Testcontainers** (Docker must be running).
- Routing locales are exactly `['en', 'de']`; the message-catalog default is `en`.
- Reference tables that lose the `editable` mixin: `types`, `sub_types`, `lessons`, `rarities`, `finishes`, `legalities`. Tables that **keep** it: `cards`, `sets`, `card_rulings`, `card_localizations`.

## File Structure

**Task 1 — Ingest (`@revelio/ingest`)**
- Modify: `app/ingest/src/load-attributes.ts` — seed codes only; `sort_order` from array index for the four ordered tables; drop the `labels` param.
- Modify: `app/ingest/src/main.ts` — stop calling `loadLabels`; call `loadAttributes(db, cards)`.
- Modify: `app/ingest/test/load-attributes.test.ts` — drop label/`sort_order`-on-sub_types assertions; update calls.

**Task 2 — DB schema (`@revelio/db`)**
- Modify: `app/db/src/schema.ts` — trim the six reference tables.
- Create: `app/db/drizzle/0002_*.sql` — generated migration (name auto-assigned).

**Task 3 — Core (`@revelio/core`)**
- Modify: `app/core/src/attributes.ts` — remove the `sortOrder` field.
- Modify: `app/core/src/schemas.ts` — `attributeMetaSchema` drops `sortOrder`.
- Modify: `app/core/src/domain.ts` — remove the unused `AttributeTermDTO`.

**Task 4 — Web (`@revelio/web`)**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` — add the `attributes` namespace.
- Modify: `app/web/src/lib/attribute-labels.ts` — resolve from the catalog; add `legalities`.
- Create: `app/web/src/lib/__tests__/attribute-labels.test.ts`.
- Modify: `app/web/src/components/filter-drawer.tsx`, `active-filters.tsx`, `card-detail.tsx` — route `legality` labels through `attrLabel`.
- Delete: `app/web/src/i18n/attribute-labels/en.json`, `app/web/src/i18n/attribute-labels/de.json`.

---

### Task 1: Ingest seeds codes only; `sort_order` from array position

**Files:**
- Modify: `app/ingest/src/load-attributes.ts`
- Modify: `app/ingest/src/main.ts`
- Test: `app/ingest/test/load-attributes.test.ts`

**Interfaces:**
- Consumes: `ATTRIBUTES` and `slugify` from `@revelio/core`; the Drizzle tables `types, subTypes, lessons, rarities, finishes, legalities` from `@revelio/db`.
- Produces: `loadAttributes(db: DB, cards: DistCard[]): Promise<void>` (the `labels` parameter is removed). Seeds `{ code, sortOrder }` for `types/lessons/rarities/finishes` (1-based array index; `999` when uncurated) and `{ code }` for `legalities/sub_types`.

Note: this task leaves the DB columns in place (Task 2 drops them). The reference-table columns `labels`, `created_at`, `updated_at`, `origin`, and `sort_order` all have NOT NULL defaults, so inserts that omit them succeed and stay green.

- [ ] **Step 1: Update the ingest test to the codes-only contract**

Replace the whole body of `app/ingest/test/load-attributes.test.ts` with:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { types, subTypes, lessons } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { loadAttributes } from '../src/load-attributes.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { cards } = await loadDist(fixtureDir)
  await loadAttributes(ctx.db, cards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadAttributes', () => {
  it('derives distinct types from the cards', async () => {
    const rows = await ctx.db.select().from(types)
    expect(rows.map((r) => r.code).sort()).toEqual(['character', 'creature', 'match'])
  })

  it('derives sub_types (incl. from cards)', async () => {
    const rows = await ctx.db.select().from(subTypes)
    expect(rows.map((r) => r.code).sort()).toEqual(['gryffindor', 'wizard'])
  })

  it('applies curated order (array position) to a lesson from provides', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'charms'))
    expect(rows).toHaveLength(1) // Charms comes from Flobberworm.provides
    expect(rows[0].sortOrder).toBe(2) // charms is the 2nd entry in LESSONS
  })

  it('is additive on re-run', async () => {
    const { cards } = await loadDist(fixtureDir)
    await loadAttributes(ctx.db, cards)
    const rows = await ctx.db.select().from(types)
    expect(rows).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -w @revelio/ingest -- load-attributes`
Expected: FAIL — `loadAttributes` still requires 3 args / the ordered-row logic not yet applied (TypeScript or assertion error).

- [ ] **Step 3: Rewrite `load-attributes.ts`**

Replace the whole file `app/ingest/src/load-attributes.ts` with:

```ts
import type { DB } from '@revelio/db'
import { types, subTypes, lessons, rarities, finishes, legalities } from '@revelio/db'
import { ATTRIBUTES, slugify } from '@revelio/core'
import type { DistCard } from './types.js'

type Provide = { lesson?: string | null }

function distinctAttributes(cards: DistCard[]) {
  const acc = {
    types: new Set<string>(),
    subTypes: new Set<string>(),
    lessons: new Set<string>(),
    rarities: new Set<string>(),
    finishes: new Set<string>(),
    legalities: new Set<string>(),
  }
  for (const c of cards) {
    c.types.forEach((x) => acc.types.add(slugify(x)))
    c.subTypes.forEach((x) => acc.subTypes.add(slugify(x)))
    if (c.lesson) acc.lessons.add(slugify(c.lesson))
    if (c.rarity) acc.rarities.add(slugify(c.rarity))
    if (c.finish) acc.finishes.add(slugify(c.finish))
    if (c.legality) acc.legalities.add(slugify(c.legality))
    for (const p of Array.isArray(c.provides) ? (c.provides as Provide[]) : []) {
      if (p?.lesson) acc.lessons.add(slugify(p.lesson))
    }
  }
  return acc
}

// Ordered vocab: sort_order is the 1-based position in the curated attributes.ts
// array (999 when a derived code is not curated there).
function orderedRows(codes: Set<string>, cfg: readonly { code: string }[]) {
  return [...codes].map((code) => {
    const idx = cfg.findIndex((e) => e.code === code)
    return { code, sortOrder: idx === -1 ? 999 : idx + 1 }
  })
}

// Code-only vocab: no sort_order column.
function codeRows(codes: Set<string>) {
  return [...codes].map((code) => ({ code }))
}

export async function loadAttributes(db: DB, cards: DistCard[]): Promise<void> {
  const d = distinctAttributes(cards)

  const typeRows = orderedRows(d.types, ATTRIBUTES.types)
  if (typeRows.length) await db.insert(types).values(typeRows).onConflictDoNothing()

  const rarityRows = orderedRows(d.rarities, ATTRIBUTES.rarities)
  if (rarityRows.length) await db.insert(rarities).values(rarityRows).onConflictDoNothing()

  const finishRows = orderedRows(d.finishes, ATTRIBUTES.finishes)
  if (finishRows.length) await db.insert(finishes).values(finishRows).onConflictDoNothing()

  const lessonRows = orderedRows(d.lessons, ATTRIBUTES.lessons)
  if (lessonRows.length) await db.insert(lessons).values(lessonRows).onConflictDoNothing()

  const legalityRows = codeRows(d.legalities)
  if (legalityRows.length) await db.insert(legalities).values(legalityRows).onConflictDoNothing()

  const subTypeRows = codeRows(d.subTypes)
  if (subTypeRows.length) await db.insert(subTypes).values(subTypeRows).onConflictDoNothing()
}
```

- [ ] **Step 4: Drop the `loadLabels` wiring in `main.ts`**

In `app/ingest/src/main.ts`:
- Delete the line `import { loadLabels } from './load-labels.js'`.
- Delete the line `const labels = await loadLabels(opts.i18nDir)`.
- Change `await loadAttributes(db, cards, labels)` to `await loadAttributes(db, cards)`.

(Leave the `i18nDir` option/env in place — it is now unused by the attribute path but harmless, and `load-labels.ts` stays for potential reuse by the future Sets spec.)

- [ ] **Step 5: Run the ingest tests to confirm they pass**

Run: `npm test -w @revelio/ingest -- load-attributes`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck the ingest workspace**

Run: `npm run typecheck -w @revelio/ingest`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/ingest/src/load-attributes.ts app/ingest/src/main.ts app/ingest/test/load-attributes.test.ts
git commit -m "refactor(ingest): seed attribute codes only, sort_order from array position"
```

---

### Task 2: Drop dead columns from the reference tables

**Files:**
- Modify: `app/db/src/schema.ts:13-53` (the six reference-table definitions)
- Create: `app/db/drizzle/0002_*.sql` (generated)

**Interfaces:**
- Produces: reference tables with columns — `types/lessons/rarities/finishes`: `{ code (pk), sortOrder }`; `legalities/sub_types`: `{ code (pk) }`. No `labels`, no `editable` mixin.

- [ ] **Step 1: Trim the reference-table definitions in `schema.ts`**

Replace the `// --- reference (vocabulary) tables ---` block (the six `pgTable` definitions for `types`, `subTypes`, `lessons`, `rarities`, `finishes`, `legalities`) in `app/db/src/schema.ts` with:

```ts
// --- reference (vocabulary) tables ---
// Codes are FK anchors for cards. Labels live in the next-intl message catalog
// (app/web/messages/*.json), never here. sort_order is only kept where display
// order is deliberate (array position in app/core/src/attributes.ts).
export const types = pgTable('types', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const subTypes = pgTable('sub_types', {
  code: text('code').primaryKey(),
})

export const lessons = pgTable('lessons', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const rarities = pgTable('rarities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const finishes = pgTable('finishes', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const legalities = pgTable('legalities', {
  code: text('code').primaryKey(),
})
```

Leave the `editable` mixin definition and the `jsonb`/`timestamp` imports in place — they are still used by `cards`, `sets`, `card_rulings`, and `card_localizations`.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate` (from `app/`; alias for `generate -w @revelio/db`)
Expected: a new file `app/db/drizzle/0002_*.sql` is created containing `ALTER TABLE … DROP COLUMN` statements — `labels`, `created_at`, `updated_at`, `origin` on all six tables, plus `sort_order` on `sub_types` and `legalities`.

- [ ] **Step 3: Review the generated SQL**

Run: `cat app/db/drizzle/0002_*.sql`
Confirm: only the expected `DROP COLUMN`s appear (no `DROP TABLE`, no touching of `types/lessons/rarities/finishes.sort_order`, no changes to `cards`/`sets`/`card_rulings`/`card_localizations`). Do **not** edit `0000` or `0001`.

- [ ] **Step 4: Verify schema/migration consistency**

Run: `npm run check -w @revelio/db && npm run verify -w @revelio/db`
Expected: both pass (journal consistent; schema matches migrations — no drift).

- [ ] **Step 5: Confirm the ingest integration still applies the migration and seeds**

Run: `npm test -w @revelio/ingest -- load-attributes`
Expected: PASS — `withMigratedDb` applies `0000`+`0001`+`0002` and the codes-only seed succeeds.

- [ ] **Step 6: Typecheck the whole app**

Run: `npm run typecheck`
Expected: no errors (no code references the dropped columns).

- [ ] **Step 7: Commit**

```bash
git add app/db/src/schema.ts app/db/drizzle/
git commit -m "refactor(db): reference tables store codes only; drop labels/editable/extra sort_order"
```

---

### Task 3: Remove the redundant `sortOrder` field from core

**Files:**
- Modify: `app/core/src/attributes.ts`
- Modify: `app/core/src/schemas.ts`
- Modify: `app/core/src/domain.ts`
- Test: `app/core/test/attributes.test.ts` (should pass unchanged)

**Interfaces:**
- Produces: `AttributeMeta = { code: string }`, `LessonMeta = AttributeMeta & { color: string }`; `attributeMetaSchema = z.object({ code })`; `lessonMetaSchema` unchanged shape (`+ color`). `AttributeTermDTO` removed. Array order in the exported constants is the sole ordering authority (consumed by ingest via `findIndex`).

- [ ] **Step 1: Drop `sortOrder` from `attributes.ts`**

Replace the whole file `app/core/src/attributes.ts` with:

```ts
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export type AttributeMeta = { code: string }
export type LessonMeta = AttributeMeta & { color: string }

// Display order is the array position; keep these in the intended order.
export const TYPES: AttributeMeta[] = [
  { code: 'character' }, { code: 'creature' }, { code: 'spell' }, { code: 'item' },
  { code: 'lesson' }, { code: 'adventure' }, { code: 'location' }, { code: 'event' },
  { code: 'match' },
]

// Mirrors the printed colour of each lesson symbol (see app/web/public/lessons/*.svg)
// so lesson-tinted UI stays consistent with the icons.
export const LESSONS: LessonMeta[] = [
  { code: 'care_of_magical_creatures', color: '#836444' },
  { code: 'charms', color: '#0069A9' },
  { code: 'potions', color: '#00A661' },
  { code: 'transfiguration', color: '#BC3E4D' },
  { code: 'quidditch', color: '#E2AE37' },
]

export const RARITIES: AttributeMeta[] = [
  { code: 'common' }, { code: 'uncommon' }, { code: 'rare' }, { code: 'lesson' },
]

export const FINISHES: AttributeMeta[] = [
  { code: 'normal' }, { code: 'foil' }, { code: 'holo' },
]

export const LEGALITIES: AttributeMeta[] = [
  { code: 'legal' }, { code: 'restricted' }, { code: 'banned' }, { code: 'unknown' },
]

// sub_types is intentionally not curated here — it self-extends from card data.
export const ATTRIBUTES = {
  types: TYPES,
  lessons: LESSONS,
  rarities: RARITIES,
  finishes: FINISHES,
  legalities: LEGALITIES,
} as const
```

- [ ] **Step 2: Drop `sortOrder` from `attributeMetaSchema`**

In `app/core/src/schemas.ts`, change `attributeMetaSchema` to:

```ts
export const attributeMetaSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
})
```

Leave `lessonMetaSchema = attributeMetaSchema.extend({ color: … })` unchanged.

- [ ] **Step 3: Remove the unused `AttributeTermDTO`**

In `app/core/src/domain.ts`, delete the `AttributeTermDTO` type and its doc comment:

```ts
// An attribute term as the API returns it for facets/filters: the DB code plus the
// i18n-resolved display label for the request language.
export type AttributeTermDTO = {
  code: string
  label: string
  sortOrder: number
}
```

- [ ] **Step 4: Run the core tests**

Run: `npm test -w @revelio/core -- attributes`
Expected: PASS — `lessonMetaSchema` validates `{code,color}`, `attributeMetaSchema` validates `{code}`, counts and `slugify` unchanged.

- [ ] **Step 5: Typecheck the whole app**

Run: `npm run typecheck`
Expected: no errors — ingest reads order via `findIndex`, no code reads `.sortOrder` off the constants or `AttributeTermDTO`.

- [ ] **Step 6: Commit**

```bash
git add app/core/src/attributes.ts app/core/src/schemas.ts app/core/src/domain.ts
git commit -m "refactor(core): drop redundant sortOrder field; array order is authority"
```

---

### Task 4: Move attribute labels into the next-intl catalog

**Files:**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Modify: `app/web/src/lib/attribute-labels.ts`
- Create: `app/web/src/lib/__tests__/attribute-labels.test.ts`
- Modify: `app/web/src/components/filter-drawer.tsx`, `app/web/src/components/active-filters.tsx`, `app/web/src/components/card-detail.tsx`
- Delete: `app/web/src/i18n/attribute-labels/en.json`, `app/web/src/i18n/attribute-labels/de.json`

**Interfaces:**
- Consumes: the `attributes` namespace in `messages/{en,de}.json`, keyed by code.
- Produces: `attrLabel(scope: 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities', code: string, locale: string): string` — resolves the catalog label, falling back to `en`, then to the raw `code`.

- [ ] **Step 1: Add the `attributes` namespace to the English catalog**

In `app/web/messages/en.json`, add this top-level key (keep the surrounding JSON valid — comma after the preceding block):

```json
"attributes": {
  "types": {
    "character": "Character", "creature": "Creature", "spell": "Spell", "item": "Item",
    "lesson": "Lesson", "adventure": "Adventure", "location": "Location", "event": "Event",
    "match": "Match"
  },
  "lessons": {
    "care_of_magical_creatures": "Care of Magical Creatures", "charms": "Charms",
    "potions": "Potions", "transfiguration": "Transfiguration", "quidditch": "Quidditch"
  },
  "rarities": { "common": "Common", "uncommon": "Uncommon", "rare": "Rare", "lesson": "Lesson" },
  "finishes": { "normal": "Normal", "foil": "Foil", "holo": "Holo Portrait" },
  "legalities": { "legal": "Legal", "restricted": "Restricted", "banned": "Banned", "unknown": "Unknown" }
}
```

- [ ] **Step 2: Add the `attributes` namespace to the German catalog**

In `app/web/messages/de.json`, add:

```json
"attributes": {
  "types": {
    "character": "Charakter", "creature": "Kreatur", "spell": "Zauber", "item": "Gegenstand",
    "lesson": "Lektion", "adventure": "Abenteuer", "location": "Ort", "event": "Ereignis",
    "match": "Spiel"
  },
  "lessons": {
    "care_of_magical_creatures": "Pflege magischer Geschöpfe", "charms": "Zauberkunst",
    "potions": "Zaubertränke", "transfiguration": "Verwandlung", "quidditch": "Quidditch"
  },
  "rarities": { "common": "Häufig", "uncommon": "Ungewöhnlich", "rare": "Selten", "lesson": "Lektion" },
  "finishes": { "normal": "Normal", "foil": "Folie", "holo": "Holo-Porträt" },
  "legalities": { "legal": "Legal", "restricted": "Eingeschränkt", "banned": "Verboten", "unknown": "Unbekannt" }
}
```

- [ ] **Step 3: Write the failing `attrLabel` test**

Create `app/web/src/lib/__tests__/attribute-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { attrLabel } from '../attribute-labels'

describe('attrLabel', () => {
  it('resolves English labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'en')).toBe('Charms')
    expect(attrLabel('rarities', 'rare', 'en')).toBe('Rare')
  })

  it('resolves German labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'de')).toBe('Zauberkunst')
    expect(attrLabel('types', 'creature', 'de')).toBe('Kreatur')
  })

  it('resolves legalities (formerly humanized)', () => {
    expect(attrLabel('legalities', 'banned', 'en')).toBe('Banned')
    expect(attrLabel('legalities', 'banned', 'de')).toBe('Verboten')
  })

  it('falls back to English for an unknown locale', () => {
    expect(attrLabel('finishes', 'foil', 'fr')).toBe('Foil')
  })

  it('falls back to the code for an unknown key', () => {
    expect(attrLabel('lessons', 'nope', 'en')).toBe('nope')
  })
})
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `npm test -w web -- attribute-labels`
Expected: FAIL — `attrLabel('legalities', …)` is a type error / old lookup returns the code.

- [ ] **Step 5: Rewrite `attribute-labels.ts` to resolve from the catalog**

Replace the whole file `app/web/src/lib/attribute-labels.ts` with:

```ts
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

type LabelScope = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'
type Catalog = { attributes?: Record<string, Record<string, string>> }
const MESSAGES: Record<string, Catalog> = { en: en as Catalog, de: de as Catalog }

// Attribute labels live in the next-intl message catalog, keyed by code. Kept as a
// plain function (not the useTranslations hook) so it works in both server and
// client components, which pass `locale` explicitly.
export function attrLabel(scope: LabelScope, code: string, locale: string): string {
  const catalog = MESSAGES[locale] ?? MESSAGES.en
  return catalog.attributes?.[scope]?.[code] ?? code
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npm test -w web -- attribute-labels`
Expected: PASS (5 tests).

- [ ] **Step 7: Route `legality` labels through `attrLabel` in `filter-drawer.tsx`**

In `app/web/src/components/filter-drawer.tsx`:
- Change the legality row to use the catalog:

```ts
    { param: 'legality', titleKey: 'legality', options: LEGALITIES, label: (c) => attrLabel('legalities', c, locale) },
```

- The local `const humanize = …` (around line 24) is now unused. Confirm with `grep -n humanize app/web/src/components/filter-drawer.tsx` — if the only remaining hit is the definition, delete that line.

- [ ] **Step 8: Route `legality` labels through `attrLabel` in `active-filters.tsx`**

In `app/web/src/components/active-filters.tsx`:
- Widen the `multi` scope type and give `legality` a scope:

```ts
  const multi: { param: string; scope?: 'rarities' | 'finishes' | 'legalities' }[] = [
    { param: 'rarity', scope: 'rarities' },
    { param: 'finish', scope: 'finishes' },
    { param: 'legality', scope: 'legalities' },
  ]
```

- The `: humanize(v)` branch is now dead (every entry has a scope). Simplify the label line to:

```ts
      const label = scope ? attrLabel(scope, v, locale) : v
```

- The local `const humanize = …` is now unused. Confirm with `grep -n humanize app/web/src/components/active-filters.tsx` — if only the definition remains, delete that line.

- [ ] **Step 9: Localize the raw legality in `card-detail.tsx`**

In `app/web/src/components/card-detail.tsx`, change the legality display (around line 156) from the raw code to the catalog label:

```tsx
              <dd>{attrLabel('legalities', card.legality, locale)}</dd>
```

Leave the `humanize` helper in this file — it is still used for `card.subTypes` (around line 96).

- [ ] **Step 10: Delete the bespoke attribute-label JSON**

```bash
git rm app/web/src/i18n/attribute-labels/en.json app/web/src/i18n/attribute-labels/de.json
```

- [ ] **Step 11: Verify nothing else imports the deleted files**

Run: `grep -rn "attribute-labels/" app/web/src --include='*.ts' --include='*.tsx'`
Expected: no matches (the rewritten `attribute-labels.ts` no longer imports them).

- [ ] **Step 12: Run the web suite, typecheck, and lint**

Run: `npm test -w web && npm run typecheck -w web && npm run lint -w web`
Expected: tests PASS, no type errors, no new lint errors (no unused `humanize`).

- [ ] **Step 13: Commit**

```bash
git add app/web/messages app/web/src/lib/attribute-labels.ts app/web/src/lib/__tests__/attribute-labels.test.ts \
  app/web/src/components/filter-drawer.tsx app/web/src/components/active-filters.tsx app/web/src/components/card-detail.tsx \
  app/web/src/i18n/attribute-labels
git commit -m "refactor(web): resolve attribute labels from the next-intl catalog"
```

---

### Task 5: Full-suite green + verify

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run (from `app/`, with Docker running): `npm test`
Expected: all workspace suites PASS.

- [ ] **Step 2: Run typecheck and db verify across the repo**

Run: `npm run typecheck && npm run verify -w @revelio/db && npm run check -w @revelio/db`
Expected: all pass.

- [ ] **Step 3: Confirm the triple-authoring is gone**

Run: `grep -rn "attribute-labels" app/web/src ; grep -rn "labels:" app/ingest/src/load-attributes.ts`
Expected: no matches — labels now live only in `app/web/messages/*.json`.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-05-editable-attributes-design.md`):
- §1 `attributes.ts` drop `sortOrder`, colour stays → Task 3 Step 1.
- §2 `schemas.ts`/`domain.ts` (drop `sortOrder`, remove `AttributeTermDTO`) → Task 3 Steps 2–3.
- §3 DB matrix (drop `labels` ×6, `editable` ×6, `sort_order` on legalities/sub_types; keep on the other four) + migration → Task 2.
- §4 ingest seeds codes + `sort_order` from array position → Task 1.
- §5 labels via next-intl (incl. legalities; retire `humanize`; `attrLabel` keeps plain signature; delete bespoke JSON) → Task 4.
- §6 read path unchanged → filters still read `attributes.ts` arrays; no DB read added (no task needed).
- §7 no reindex → nothing touches Meili (no task needed).
- Testing bullets → Task 1 (ingest), Task 3 (core), Task 4 (attrLabel), Task 5 (full suite + verify).

**Placeholder scan:** No TBD/TODO; every code step shows full content; commands have expected output.

**Type consistency:** `loadAttributes(db, cards)` (2 args) used identically in Task 1 impl, `main.ts`, and test. `attrLabel(scope, code, locale)` with the widened `LabelScope` union used consistently in Task 4 impl, test, and all three call sites. `AttributeMeta = { code }` matches `orderedRows(codes, cfg: readonly { code: string }[])` in Task 1. `sortOrder` kept only on `types/lessons/rarities/finishes` in both `schema.ts` (Task 2) and the ingest `orderedRows` vs `codeRows` split (Task 1).

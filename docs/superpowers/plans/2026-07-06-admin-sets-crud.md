# Admin Sets CRUD (+ `_localizations` naming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sets full admin CRUD (create, edit, delete-if-empty) with localized names and a symbol upload, store set names in a new `set_localizations` table, stop denormalizing `setName` into the search index, and rename the two non-conforming per-language tables to the `_localizations` convention.

**Architecture:** Sets are a core entity, so their per-language names use the `card_localizations` pattern — a `set_localizations(set_code, lang, name)` table with `sets.name` as the fallback. Read queries become locale-aware and resolve names via the fallback; the search document drops `setName` so set edits never require a reindex. Admin surfaces are route-based form pages under the existing editor-gated `/admin` shell, and symbol upload reuses the `image-actions` S3 pattern.

**Tech Stack:** Next.js 16 (App Router, React 19) + next-intl, Drizzle ORM over Postgres, Meilisearch, S3/MinIO + `sharp`, Better Auth, Zod, shadcn/Radix/Tailwind v4, Vitest (+ Testcontainers for Postgres, MinIO for S3).

## Global Constraints

- All app commands run from `app/` (the npm workspaces root). There is no root `package.json`.
- Workspace dependency direction is strict: `core ← {search, db} ← {ingest, web}`. Never import "upward".
- Migrations are **incremental and append-only**. Never `rm` or regenerate `drizzle/0000`. Edit `db/src/schema.ts`, then produce the next `drizzle/NNNN_*.sql`. `npm run verify` (CI-enforced) fails if `schema.ts` drifted from the migrations.
- Two server-only Meilisearch keys; the master key is never used at runtime. Server Actions are `'use server'` and must never leak secrets to the client.
- Postgres-backed tests use the `withMigratedDb()` Testcontainers helper in `app/ingest/test/helpers.ts`. They live under `app/ingest/test/` (the `@revelio/db` workspace has no test dir of its own). S3 tests use MinIO via `app/ingest/test/s3-helpers.ts`.
- `NEXT_PUBLIC_*` env vars are inlined at build time.
- Conventional Commits. All prose/docs in English. Documentation filenames UPPERCASE.
- Locales come from `app/web/i18n/routing.ts`: `['en', 'de']`, default `en`, `localePrefix: 'as-needed'`.
- Editor gate: `requireRole('editor')` (in `@/lib/session`) throws for non-editors; page-level gate uses `hasRequiredRole(session?.user?.role, 'editor')` then `notFound()`.

---

## File Structure

**Renamed (Task 1):**
- `db/src/schema.ts` — `subTypeTranslations`→`subTypeLocalizations` (table `sub_type_translations`→`sub_type_localizations`); `cardRulingTexts`→`cardRulingLocalizations` (table `card_ruling_texts`→`card_ruling_localizations`).
- Ripple: `db/src/queries.ts`, `db/src/index.ts`, `ingest/src/load-attributes.ts`, `ingest/src/load-cards.ts`, and their tests.
- `db/drizzle/0004_rename_localizations.sql` + `db/drizzle/meta/0004_snapshot.json` + `db/drizzle/meta/_journal.json` (hand-authored rename).

**New DB layer (Tasks 2–3, 6):**
- `db/src/schema.ts` — add `setLocalizations` table.
- `db/drizzle/0005_*.sql` — additive `CREATE TABLE set_localizations` (generated).
- `db/src/queries.ts` — locale-aware `listSets`/`getSetByCode`/`getCardById`; new `getSetForEdit`, `createSet`, `updateSet`, `deleteSet`, `setSymbolFile`; types `SetForEdit`, `SetWriteInput`.
- `db/src/index.ts` — export the above.
- Tests: `ingest/test/set-localizations.test.ts` (read path), `ingest/test/set-write.test.ts` (CRUD).

**Search (Task 5):**
- `search/src/documents.ts`, `ingest/src/build-documents.ts`, `db/src/queries.ts` — drop `setName`. Update fixtures across `search/test`, `ingest/test`, `web` tests.

**Web read-path wiring (Task 4):**
- `web/src/app/[locale]/sets/page.tsx`, `sets/[code]/page.tsx`, `search/page.tsx`, `page.tsx` (home), `card/[id]/page.tsx`.

**Web actions (Tasks 7–8):**
- `web/src/lib/set-actions.ts` — `uploadSetSymbol`, `removeSetSymbol`, `createSetAction`, `updateSetAction`, `deleteSetAction`.
- Tests: `web/src/lib/__tests__/set-actions.test.ts`.

**Web admin UI (Tasks 9–11):**
- `web/src/components/set-form.tsx` (create + edit fields), `web/src/components/set-symbol-uploader.tsx`, `web/src/components/delete-set-button.tsx`.
- `web/src/app/[locale]/admin/sets/page.tsx`, `admin/sets/new/page.tsx`, `admin/sets/[code]/edit/page.tsx`.
- `web/src/app/[locale]/admin/page.tsx` — add "Sets" entry.
- `web/messages/en.json`, `web/messages/de.json` — `admin.sets.*` keys.
- Tests: `web/src/components/__tests__/set-form.test.tsx`, `set-symbol-uploader.test.tsx`, `delete-set-button.test.tsx`.

---

## Task 1: Rename the two per-language tables to `_localizations`

Rename `sub_type_translations`→`sub_type_localizations` and `card_ruling_texts`→`card_ruling_localizations` (table names + Drizzle export consts). Columns, function names (`saveSubTypeTranslations`, `getSubTypeLabels`, `saveRulings`, …), and file names stay unchanged. The migration is hand-authored (drizzle-kit would prompt interactively on a rename); the `0004` snapshot is derived deterministically from `0003` so `npm run verify` sees no drift.

**Files:**
- Modify: `db/src/schema.ts:43-49` (subTypeTranslations), `db/src/schema.ts:111-117` (cardRulingTexts)
- Modify: `db/src/queries.ts` (lines 4, 42-43, 213-217, 236, 244, 261-268)
- Modify: `db/src/index.ts:4-5`
- Modify: `ingest/src/load-attributes.ts:2,76`, `ingest/src/load-cards.ts:2,76`
- Modify (tests): `ingest/test/queries.test.ts:31`, `ingest/test/load-cards.test.ts:3,87`, `ingest/test/rulings.test.ts:3,24,32,47,61`
- Create: `db/drizzle/0004_rename_localizations.sql`
- Create: `db/drizzle/meta/0004_snapshot.json`
- Modify: `db/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: exported consts `subTypeLocalizations` (was `subTypeTranslations`) and `cardRulingLocalizations` (was `cardRulingTexts`) from `@revelio/db`. All later tasks import the new names.

- [ ] **Step 1: Rename the consts + table names in `schema.ts`**

In `db/src/schema.ts`, change the sub-type table (lines 43-49):

```ts
export const subTypeLocalizations = pgTable('sub_type_localizations', {
  subTypeCode: text('sub_type_code').notNull().references(() => subTypes.code, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  label: text('label').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.subTypeCode, t.lang] }),
}))
```

And the ruling-texts table (lines 111-117):

```ts
export const cardRulingLocalizations = pgTable('card_ruling_localizations', {
  rulingId: text('ruling_id').notNull().references(() => cardRulings.id, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  text: text('text').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.rulingId, t.lang] }),
}))
```

- [ ] **Step 2: Update all const references (queries, index, ingest, tests)**

Run this global rename across the two workspaces (from `app/`):

```bash
grep -rl "subTypeTranslations" db/src ingest/src ingest/test | xargs sed -i '' 's/subTypeTranslations/subTypeLocalizations/g'
grep -rl "cardRulingTexts" db/src ingest/src ingest/test | xargs sed -i '' 's/cardRulingTexts/cardRulingLocalizations/g'
```

Verify no stale references remain:

```bash
grep -rn "subTypeTranslations\b\|cardRulingTexts\b" db ingest web search core --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: no output. (Function names like `saveSubTypeTranslations` contain `SubTypeTranslations` but NOT the standalone const token `subTypeTranslations`, so `\b`-anchored search confirms only the const was touched. If `sed` also rewrote a function name, restore it — only the const identifiers change.)

After sed, confirm function names are intact:

```bash
grep -rn "saveSubTypeTranslations\|saveSubTypeTranslationsAction" db web --include="*.ts" | grep -v node_modules | head
```

Expected: the `saveSubTypeTranslations` DB fn and `saveSubTypeTranslationsAction` still exist (names unchanged).

- [ ] **Step 3: Hand-author the rename migration SQL**

Create `db/drizzle/0004_rename_localizations.sql`:

```sql
ALTER TABLE "sub_type_translations" RENAME TO "sub_type_localizations";--> statement-breakpoint
ALTER TABLE "sub_type_localizations" RENAME CONSTRAINT "sub_type_translations_sub_type_code_lang_pk" TO "sub_type_localizations_sub_type_code_lang_pk";--> statement-breakpoint
ALTER TABLE "sub_type_localizations" RENAME CONSTRAINT "sub_type_translations_sub_type_code_sub_types_code_fk" TO "sub_type_localizations_sub_type_code_sub_types_code_fk";--> statement-breakpoint
ALTER TABLE "card_ruling_texts" RENAME TO "card_ruling_localizations";--> statement-breakpoint
ALTER TABLE "card_ruling_localizations" RENAME CONSTRAINT "card_ruling_texts_ruling_id_lang_pk" TO "card_ruling_localizations_ruling_id_lang_pk";--> statement-breakpoint
ALTER TABLE "card_ruling_localizations" RENAME CONSTRAINT "card_ruling_texts_ruling_id_card_rulings_id_fk" TO "card_ruling_localizations_ruling_id_card_rulings_id_fk";
```

(The constraint renames keep the live DB's constraint names aligned with the `0004` snapshot — Postgres does not rename constraints on `ALTER TABLE ... RENAME TO`.)

- [ ] **Step 4: Derive the `0004` snapshot deterministically from `0003`**

The renamed schema is identical to `0003` except the two table names (and the constraint names, which embed those table names). Derive `0004_snapshot.json` by string-replacing the two table names in the `0003` snapshot and relinking `id`/`prevId`. From `app/db`:

```bash
python3 - <<'PY'
import json
s = json.load(open('drizzle/meta/0003_snapshot.json'))
txt = json.dumps(s)
txt = txt.replace('sub_type_translations', 'sub_type_localizations')
txt = txt.replace('card_ruling_texts', 'card_ruling_localizations')
s = json.loads(txt)
s['prevId'] = s['id']
s['id'] = '00000000-0000-0000-0000-000000000004'
json.dump(s, open('drizzle/meta/0004_snapshot.json', 'w'), indent='\t')
open('drizzle/meta/0004_snapshot.json', 'a').write('')
PY
```

(The replacements only match the exact table-name substrings; `sub_types` and `card_rulings` do not contain `sub_type_translations`/`card_ruling_texts`, so they are untouched. `id` value is arbitrary — drizzle only chains via `prevId`.)

- [ ] **Step 5: Append the journal entry for `0004`**

Add a fourth entry to the `entries` array in `db/drizzle/meta/_journal.json` (after the `0003_normal_thena` entry):

```json
    {
      "idx": 4,
      "version": "7",
      "when": 1783430000000,
      "tag": "0004_rename_localizations",
      "breakpoints": true
    }
```

- [ ] **Step 6: Verify migration consistency (offline)**

Run from `app`:

```bash
npm run check -w @revelio/db && npm run verify -w @revelio/db
```

Expected: `check` reports the journal/snapshots are consistent; `verify` prints `✓ migrations are in sync with schema.ts` (drizzle-kit generate diffs `schema.ts` against the `0004` snapshot and finds no changes, so it writes nothing). If `verify` fails claiming drift, the `0004` snapshot doesn't match what drizzle derives — re-check that Step 4's replacements produced the new constraint names.

- [ ] **Step 7: Run typecheck + the DB-backed suites (fresh migrated DB proves the rename applies)**

Run from `app` (Docker must be running for Testcontainers):

```bash
npm run typecheck
npm test -w @revelio/ingest -- subtype-translations rulings queries load-cards
```

Expected: PASS. `withMigratedDb()` runs `0000`→`0004` on a fresh database, so a passing `subtype-translations.test.ts` proves `sub_type_localizations` exists and the `saveSubTypeTranslations` fn writes to it via the renamed const.

- [ ] **Step 8: Commit**

```bash
git add db ingest
git commit -m "refactor(db): rename per-language tables to the _localizations convention"
```

---

## Task 2: Add the `set_localizations` schema + migration

**Files:**
- Modify: `db/src/schema.ts` (add `setLocalizations` after `sets`)
- Modify: `db/src/index.ts` (export `setLocalizations`)
- Create: `db/drizzle/0005_*.sql` (generated)
- Create: `db/drizzle/meta/0005_snapshot.json` (generated)
- Modify: `db/drizzle/meta/_journal.json` (generated)

**Interfaces:**
- Produces: `setLocalizations` table const, columns `setCode` (`set_code` → `sets.code`, FK on delete cascade), `lang`, `name` (notNull), composite PK `(set_code, lang)`.

- [ ] **Step 1: Add the table to `schema.ts`**

In `db/src/schema.ts`, immediately after the `sets` table definition (after line 60), add:

```ts
export const setLocalizations = pgTable('set_localizations', {
  setCode: text('set_code').notNull().references(() => sets.code, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  name: text('name').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.setCode, t.lang] }),
}))
```

- [ ] **Step 2: Export it from `index.ts`**

In `db/src/index.ts`, add `setLocalizations` to the schema re-export block (the same `export { … } from './schema'` list that already exports `sets`, `cardLocalizations`, etc.).

- [ ] **Step 3: Generate the migration**

Run from `app/db`:

```bash
npm run generate
```

Expected: creates `drizzle/0005_<name>.sql` containing `CREATE TABLE "set_localizations" (...)` plus the FK `ADD CONSTRAINT`, updates `meta/_journal.json` and adds `meta/0005_snapshot.json`. This is a purely additive table (no rename), so drizzle-kit runs non-interactively.

- [ ] **Step 4: Review the generated SQL**

Read `db/drizzle/0005_*.sql`. Confirm it is a `CREATE TABLE "set_localizations"` with columns `set_code`, `lang`, `name` (all `text NOT NULL`), a composite PK, and a FK to `public.sets("code")` with `ON DELETE cascade`. Confirm it does NOT touch any other table.

- [ ] **Step 5: Verify + typecheck**

```bash
cd .. && npm run verify -w @revelio/db && npm run check -w @revelio/db && npm run typecheck
```

Expected: verify prints in-sync; check passes; typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add db
git commit -m "feat(db): add set_localizations table"
```

---

## Task 3: Locale-aware set read path + admin read query

**Files:**
- Modify: `db/src/queries.ts` (imports, `toSetDTO`, `listSets`, `getSetByCode`, `getCardById`; add `getSetForEdit` + `SetForEdit` type)
- Modify: `db/src/index.ts` (export `getSetForEdit`, type `SetForEdit`)
- Test: `ingest/test/set-localizations.test.ts`

**Interfaces:**
- Consumes: `setLocalizations` from Task 2.
- Produces:
  - `listSets(db: DB, locale?: string): Promise<SetDTO[]>` — when `locale` given, `name = loc[locale] ?? sets.name`.
  - `getSetByCode(db: DB, code: string, locale?: string): Promise<SetDTO | null>` — same fallback.
  - `getCardById(db: DB, id: string, locale?: string): Promise<CardDetailDTO | null>` — `set.name` resolved for `locale`.
  - `getSetForEdit(db: DB, code: string): Promise<SetForEdit | null>` where `type SetForEdit = { code: string; name: string; releaseDate: string | null; isOfficial: boolean; cardCount: number; symbol: string | null; localizations: Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

Create `ingest/test/set-localizations.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, setLocalizations, listSets, getSetByCode, getSetForEdit } from '@revelio/db'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values([
    { code: 'BS', name: 'Base', releaseDate: '2001-08-01', isOfficial: true, cardCount: 3 },
    { code: 'QC', name: 'Quidditch Cup', releaseDate: '2001-11-01', isOfficial: true, cardCount: 0 },
  ])
  await ctx.db.insert(setLocalizations).values([
    { setCode: 'BS', lang: 'de', name: 'Grundset' },
  ])
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('locale-aware set reads', () => {
  it('listSets without a locale returns the base name', async () => {
    const rows = await listSets(ctx.db)
    expect(rows.find((s) => s.code === 'BS')?.name).toBe('Base')
  })

  it('listSets(locale) applies the localization, falling back to base', async () => {
    const rows = await listSets(ctx.db, 'de')
    expect(rows.find((s) => s.code === 'BS')?.name).toBe('Grundset')   // localized
    expect(rows.find((s) => s.code === 'QC')?.name).toBe('Quidditch Cup') // fallback
  })

  it('getSetByCode(locale) applies the localization', async () => {
    expect((await getSetByCode(ctx.db, 'BS', 'de'))?.name).toBe('Grundset')
    expect((await getSetByCode(ctx.db, 'BS', 'en'))?.name).toBe('Base') // no en row -> fallback
    expect((await getSetByCode(ctx.db, 'BS'))?.name).toBe('Base')
  })

  it('getSetForEdit returns all localizations keyed by lang', async () => {
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ code: 'BS', name: 'Base', cardCount: 3, localizations: { de: 'Grundset' } })
    expect(await getSetForEdit(ctx.db, 'NOPE')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -w @revelio/ingest -- set-localizations
```

Expected: FAIL — `getSetForEdit` is not exported / `listSets` ignores the second arg.

- [ ] **Step 3: Implement the query changes**

In `db/src/queries.ts`, add `setLocalizations` to the schema import on line 4 and ensure `and` is imported (it already is, line 1).

Change `toSetDTO` (lines 10-19) to accept an optional name override:

```ts
function toSetDTO(row: SetRow, name: string = row.name): SetDTO {
  return {
    code: row.code,
    name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
  }
}
```

Replace `listSets` and `getSetByCode` (lines 21-29):

```ts
export async function listSets(db: DB, locale?: string): Promise<SetDTO[]> {
  const rows = await db.select().from(sets).orderBy(asc(sets.releaseDate), asc(sets.code))
  if (!locale) return rows.map((r) => toSetDTO(r))
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.lang, locale))
  const nameByCode = new Map(locs.map((l) => [l.setCode, l.name]))
  return rows.map((r) => toSetDTO(r, nameByCode.get(r.code) ?? r.name))
}

export async function getSetByCode(db: DB, code: string, locale?: string): Promise<SetDTO | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  if (!row) return null
  if (!locale) return toSetDTO(row)
  const [loc] = await db
    .select()
    .from(setLocalizations)
    .where(and(eq(setLocalizations.setCode, code), eq(setLocalizations.lang, locale)))
    .limit(1)
  return toSetDTO(row, loc?.name ?? row.name)
}
```

In `getCardById` (lines 31-88), change the signature to `export async function getCardById(db: DB, id: string, locale?: string)` and, after the `setRow` fetch (line 34), resolve the localized set name; then use it in the returned `set`:

```ts
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  let setName = setRow?.name
  if (locale && setRow) {
    const [loc] = await db
      .select()
      .from(setLocalizations)
      .where(and(eq(setLocalizations.setCode, card.setCode), eq(setLocalizations.lang, locale)))
      .limit(1)
    setName = loc?.name ?? setRow.name
  }
```

and change the final `set: toSetDTO(setRow),` (line 86) to `set: toSetDTO(setRow, setName),`.

Add the admin read + its type (place near the other set queries):

```ts
export type SetForEdit = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
  localizations: Record<string, string>
}

export async function getSetForEdit(db: DB, code: string): Promise<SetForEdit | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  if (!row) return null
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.setCode, code))
  return {
    code: row.code,
    name: row.name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
    localizations: Object.fromEntries(locs.map((l) => [l.lang, l.name])),
  }
}
```

- [ ] **Step 4: Export the new API**

In `db/src/index.ts`, add `getSetForEdit` to the `export { … } from './queries'` list, and add `export type { SetForEdit } from './queries'`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -w @revelio/ingest -- set-localizations
```

Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. (`getCardById`'s new optional param is backward-compatible; existing callers still compile.)

- [ ] **Step 7: Commit**

```bash
git add db
git commit -m "feat(db): locale-aware set reads + getSetForEdit"
```

---

## Task 4: Wire the request locale into web set reads

**Files:**
- Modify: `web/src/app/[locale]/sets/page.tsx:44`
- Modify: `web/src/app/[locale]/sets/[code]/page.tsx:23,36`
- Modify: `web/src/app/[locale]/search/page.tsx:39`
- Modify: `web/src/app/[locale]/page.tsx:95`
- Modify: `web/src/app/[locale]/card/[id]/page.tsx:20` (and its two call sites)

**Interfaces:**
- Consumes: `listSets(db, locale)`, `getSetByCode(db, code, locale)`, `getCardById(db, id, locale)` from Task 3.

- [ ] **Step 1: Pass `locale` in the sets pages**

In `web/src/app/[locale]/sets/page.tsx`, change line 44 to:

```ts
  const sets = await listSets(getDb(), locale)
```

In `web/src/app/[locale]/sets/[code]/page.tsx`, both `getSetByCode(getDb(), code)` calls (in `generateMetadata` line 23 and the page line 36) become `getSetByCode(getDb(), code, locale)` (the `locale` is already destructured from `params` in both).

- [ ] **Step 2: Pass `locale` in search + home**

In `web/src/app/[locale]/search/page.tsx`, change line 39 to `const sets = await listSets(getDb(), locale)`.

In `web/src/app/[locale]/page.tsx`, change line 95 to `const sets = await listSets(getDb(), locale)` (confirm `locale` is in scope; it is destructured from `params`).

- [ ] **Step 3: Pass `locale` into the cached card loader**

In `web/src/app/[locale]/card/[id]/page.tsx`, change the memoized loader (line 20) to take `locale`:

```ts
const loadCard = cache((id: string, locale: string) => getCardById(getDb(), id, locale))
```

Update both call sites to pass `locale`: in `generateMetadata` change `await loadCard(id)` to `await loadCard(id, locale)`, and in `CardPage` change `await loadCard(id)` to `await loadCard(id, locale)`. (`locale` is already destructured from `params` in both functions. React's `cache` keys on all args, so metadata + page still share one round-trip.)

- [ ] **Step 4: Typecheck + lint + run the affected web tests**

```bash
npm run typecheck
npm run lint -w web
npm test -w web -- home card-detail set-card
```

Expected: PASS. (`card-detail.tsx` renders `card.set.name`, now localized; its test passes a fixed `set` object and is unaffected.)

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): render set names in the request locale"
```

---

## Task 5: Drop `setName` from the search index

Remove `setName` from the search document and every producer, so a set-name edit never staleness-breaks the index. `setCode` (the filter) and `isOfficial` stay. Nothing renders `setName` today (result tiles show `hit.name`; filter set names come from `listSets`), so this is a pure removal plus fixture cleanup.

**Files:**
- Modify: `search/src/documents.ts` (`SearchDocument`, `CardIndexData`, `buildCardDocument`)
- Modify: `ingest/src/build-documents.ts` (drop the `setName` field)
- Modify: `db/src/queries.ts:162` (drop `setName` in `getCardIndexData`)
- Modify (fixtures/assertions): `search/test/search.test.ts:12-14`, `ingest/test/build-card-document.test.ts:5,35`, `ingest/test/build-documents.test.ts:53`, `ingest/test/localization-write.test.ts:38`, `ingest/test/reindex-card.test.ts:10`, `web/src/components/__tests__/card-grid.test.tsx:10`, `web/src/lib/__tests__/search-client.test.ts:14-15`

**Interfaces:**
- Produces: `SearchDocument` and `CardIndexData` no longer have a `setName` field.

- [ ] **Step 1: Remove `setName` from the document module**

In `search/src/documents.ts`: delete `setName: string` from `SearchDocument` (line 7), delete `setName: string` from `CardIndexData` (line 50), and delete the `setName: d.setName,` line from `buildCardDocument`'s returned object (line 70).

- [ ] **Step 2: Remove `setName` from the producers**

In `ingest/src/build-documents.ts`, delete the `setName: set?.name ?? c.setCode,` line from the `dataByCard` object literal. (`set` is still used for `isOfficial`, so keep the `setByCode.get(c.setCode)` lookup.)

In `db/src/queries.ts`, delete line 162 `setName: setRow?.name ?? card.setCode,` from `getCardIndexData`'s returned object. (`setRow` is still used for `isOfficial` on the next line.)

- [ ] **Step 3: Run typecheck to surface every stale fixture**

```bash
npm run typecheck
```

Expected: FAIL — TS errors at each test fixture that still lists `setName` (excess property) or asserts `.setName`. Use these to drive the fixture edits.

- [ ] **Step 4: Delete `setName` from all fixtures and assertions**

Remove the `setName: '…'` key from these fixtures: `search/test/search.test.ts` (3 objects, lines 12-14), `ingest/test/build-card-document.test.ts` (lines 5 and 35), `ingest/test/reindex-card.test.ts` (line 10), `web/src/components/__tests__/card-grid.test.tsx` (line 10), `web/src/lib/__tests__/search-client.test.ts` (lines 14-15).

Delete these assertions entirely: `ingest/test/build-documents.test.ts:53` (`expect(snitch.setName).toBe('Quidditch Cup')`) and `ingest/test/localization-write.test.ts:38` (`expect(data?.setName).toBe('Xen')`).

- [ ] **Step 5: Re-run typecheck + the touched suites**

```bash
npm run typecheck
npm test -w @revelio/search
npm test -w @revelio/ingest -- build-card-document build-documents reindex-card localization-write
npm test -w web -- card-grid search-client
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add search ingest db web
git commit -m "refactor(search): drop denormalized setName from the index"
```

---

## Task 6: Set write queries (create / update / delete / symbol)

**Files:**
- Modify: `db/src/queries.ts` (add `SetWriteInput` type + `createSet`, `updateSet`, `deleteSet`, `setSymbolFile`)
- Modify: `db/src/index.ts` (export the four fns + `SetWriteInput`)
- Test: `ingest/test/set-write.test.ts`

**Interfaces:**
- Consumes: `sets`, `setLocalizations`, `getSetForEdit` from earlier tasks.
- Produces:
  - `type SetWriteInput = { name: string; releaseDate: string | null; isOfficial: boolean; localizations: Record<string, string> }` (a blank/absent localization name means "no row for that lang").
  - `createSet(db: DB, code: string, input: SetWriteInput): Promise<void>` (origin `'user'`; inserts non-blank localizations).
  - `updateSet(db: DB, code: string, input: SetWriteInput): Promise<void>` (updates fields; upserts non-blank / deletes blank localizations).
  - `deleteSet(db: DB, code: string): Promise<void>` (deletes the row; FK cascade removes `set_localizations`).
  - `setSymbolFile(db: DB, code: string, symbol: string | null): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `ingest/test/set-write.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, setLocalizations, createSet, updateSet, deleteSet, setSymbolFile, getSetForEdit } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => { ctx = await withMigratedDb() }, 120_000)
afterAll(async () => { await ctx.stop() })

describe('set write queries', () => {
  it('createSet inserts the set (origin user) and its non-blank localizations', async () => {
    await createSet(ctx.db, 'BS', {
      name: 'Base', releaseDate: '2001-08-01', isOfficial: true,
      localizations: { de: 'Grundset', en: '  ' }, // blank en is skipped
    })
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ code: 'BS', name: 'Base', isOfficial: true, localizations: { de: 'Grundset' } })
    const [row] = await ctx.db.select().from(sets).where(eq(sets.code, 'BS'))
    expect(row.origin).toBe('user')
  })

  it('updateSet changes fields, upserts a localization, and deletes a blanked one', async () => {
    await updateSet(ctx.db, 'BS', {
      name: 'Base Set', releaseDate: '2001-09-01', isOfficial: false,
      localizations: { de: '', fr: 'Base FR' }, // de blank -> delete, fr new -> insert
    })
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ name: 'Base Set', isOfficial: false, localizations: { fr: 'Base FR' } })
    expect('de' in (s!.localizations)).toBe(false)
  })

  it('setSymbolFile sets and clears the symbol', async () => {
    await setSymbolFile(ctx.db, 'BS', 'logo.png')
    expect((await getSetForEdit(ctx.db, 'BS'))?.symbol).toBe('logo.png')
    await setSymbolFile(ctx.db, 'BS', null)
    expect((await getSetForEdit(ctx.db, 'BS'))?.symbol).toBeNull()
  })

  it('deleteSet removes the set and cascades its localizations', async () => {
    await deleteSet(ctx.db, 'BS')
    expect(await getSetForEdit(ctx.db, 'BS')).toBeNull()
    const locs = await ctx.db.select().from(setLocalizations).where(eq(setLocalizations.setCode, 'BS'))
    expect(locs).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -w @revelio/ingest -- set-write
```

Expected: FAIL — `createSet` etc. not exported.

- [ ] **Step 3: Implement the write queries**

In `db/src/queries.ts` (near the other set queries), add:

```ts
export type SetWriteInput = {
  name: string
  releaseDate: string | null
  isOfficial: boolean
  localizations: Record<string, string>
}

export async function createSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(sets).values({
      code,
      name: input.name,
      releaseDate: input.releaseDate,
      isOfficial: input.isOfficial,
      origin: 'user',
    })
    const rows = Object.entries(input.localizations)
      .filter(([, name]) => name.trim() !== '')
      .map(([lang, name]) => ({ setCode: code, lang, name }))
    if (rows.length) await tx.insert(setLocalizations).values(rows)
  })
}

export async function updateSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(sets)
      .set({
        name: input.name,
        releaseDate: input.releaseDate,
        isOfficial: input.isOfficial,
        origin: 'user',
        updatedAt: now,
      })
      .where(eq(sets.code, code))
    for (const [lang, name] of Object.entries(input.localizations)) {
      if (name.trim() === '') {
        await tx
          .delete(setLocalizations)
          .where(and(eq(setLocalizations.setCode, code), eq(setLocalizations.lang, lang)))
      } else {
        await tx
          .insert(setLocalizations)
          .values({ setCode: code, lang, name })
          .onConflictDoUpdate({
            target: [setLocalizations.setCode, setLocalizations.lang],
            set: { name },
          })
      }
    }
  })
}

export async function deleteSet(db: DB, code: string): Promise<void> {
  await db.delete(sets).where(eq(sets.code, code))
}

export async function setSymbolFile(db: DB, code: string, symbol: string | null): Promise<void> {
  await db.update(sets).set({ symbol, updatedAt: new Date() }).where(eq(sets.code, code))
}
```

- [ ] **Step 4: Export the new API**

In `db/src/index.ts`, add `createSet, updateSet, deleteSet, setSymbolFile` to the `export { … } from './queries'` list and `SetWriteInput` to the `export type { … } from './queries'` list.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -w @revelio/ingest -- set-write
```

Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
cd .. && npm run typecheck
git add db
git commit -m "feat(db): set write queries (create/update/delete/symbol)"
```

---

## Task 7: Symbol upload/remove server actions

**Files:**
- Create: `web/src/lib/set-actions.ts`
- Test: `web/src/lib/__tests__/set-actions.test.ts`

**Interfaces:**
- Consumes: `getSetByCode`, `setSymbolFile` from `@revelio/db`; `getS3`/`putObject`/`deleteObject` from `@/lib/s3`; `symbolKey` from `@revelio/core`; `requireRole` from `@/lib/session`.
- Produces:
  - `type SetActionResult = { ok: true } | { ok: false; error: string }`
  - `uploadSetSymbol(formData: FormData): Promise<SetActionResult>` — expects fields `code`, `file`.
  - `removeSetSymbol(code: string): Promise<SetActionResult>`.
  - `revalidateSetSurfaces(code: string)` (module-internal helper, reused by Task 8).

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/__tests__/set-actions.test.ts` (mirrors `image-actions.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  getSetByCode: vi.fn(async () => ({ code: 'BS', cardCount: 0 })),
  setSymbolFile: vi.fn(async () => {}),
  put: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getSetByCode: m.getSetByCode, setSymbolFile: m.setSymbolFile,
  createSet: vi.fn(), updateSet: vi.fn(), deleteSet: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({ getS3: () => ({}), putObject: m.put, deleteObject: m.del }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('sharp', () => ({
  default: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('x') }) }),
}))

import { uploadSetSymbol, removeSetSymbol } from '../set-actions'

function form(file: File | null, code = 'BS') {
  const fd = new FormData()
  if (file) fd.append('file', file)
  fd.append('code', code)
  return fd
}

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getSetByCode.mockResolvedValue({ code: 'BS', cardCount: 0 })
})

describe('uploadSetSymbol', () => {
  it('rejects a non-image file', async () => {
    const res = await uploadSetSymbol(form(new File(['x'], 'a.txt', { type: 'text/plain' })))
    expect(res).toEqual({ ok: false, error: 'type' })
    expect(m.put).not.toHaveBeenCalled()
  })

  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await uploadSetSymbol(form(new File(['x'], 'a.png', { type: 'image/png' }))).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.put).not.toHaveBeenCalled()
  })

  it('writes the symbol to symbols/<code>.webp and stores the filename', async () => {
    const res = await uploadSetSymbol(form(new File(['x'], 'logo.png', { type: 'image/png' })))
    expect(res).toEqual({ ok: true })
    expect(m.put).toHaveBeenCalledTimes(1)
    expect(m.put.mock.calls[0][1]).toBe('symbols/BS.webp')
    expect(m.setSymbolFile).toHaveBeenCalledWith({}, 'BS', 'logo.png')
  })
})

describe('removeSetSymbol', () => {
  it('deletes the object and nulls the symbol', async () => {
    const res = await removeSetSymbol('BS')
    expect(res).toEqual({ ok: true })
    expect(m.del.mock.calls[0][1]).toBe('symbols/BS.webp')
    expect(m.setSymbolFile).toHaveBeenCalledWith({}, 'BS', null)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -w web -- set-actions
```

Expected: FAIL — `../set-actions` does not exist.

- [ ] **Step 3: Implement the symbol actions**

Create `web/src/lib/set-actions.ts`:

```ts
'use server'
import sharp from 'sharp'
import { revalidatePath } from 'next/cache'
import { symbolKey } from '@revelio/core'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSetByCode, setSymbolFile } from '@revelio/db'
import { getS3, putObject, deleteObject } from '@/lib/s3'

export type SetActionResult = { ok: true } | { ok: false; error: string }

const MAX_BYTES = 5 * 1024 * 1024

function revalidateSetSurfaces(code: string) {
  revalidatePath('/')
  revalidatePath('/sets')
  revalidatePath(`/sets/${code}`)
  revalidatePath('/search')
  revalidatePath('/admin/sets')
  revalidatePath(`/admin/sets/${code}/edit`)
}

export async function uploadSetSymbol(formData: FormData): Promise<SetActionResult> {
  await requireRole('editor')
  const code = String(formData.get('code') ?? '')
  const file = formData.get('file')
  if (!code || !(file instanceof File)) return { ok: false, error: 'invalid' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'type' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'size' }

  const db = getDb()
  if (!(await getSetByCode(db, code))) return { ok: false, error: 'invalid' }

  const input = Buffer.from(await file.arrayBuffer())
  // No flatten: the symbol is rendered as a CSS mask, so its alpha channel must survive.
  const webp = await sharp(input).webp({ quality: 90 }).toBuffer()
  await putObject(getS3(), symbolKey(code), webp, 'image/webp')
  await setSymbolFile(db, code, file.name)

  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function removeSetSymbol(code: string): Promise<SetActionResult> {
  await requireRole('editor')
  if (!code) return { ok: false, error: 'invalid' }
  const db = getDb()
  await deleteObject(getS3(), symbolKey(code))
  await setSymbolFile(db, code, null)
  revalidateSetSurfaces(code)
  return { ok: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -w web -- set-actions
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): set symbol upload/remove actions"
```

---

## Task 8: Create / update / delete server actions

**Files:**
- Modify: `web/src/lib/set-actions.ts` (add the three CRUD actions)
- Modify: `web/src/lib/__tests__/set-actions.test.ts` (add CRUD cases)

**Interfaces:**
- Consumes: `createSet`, `updateSet`, `deleteSet`, `getSetByCode` from `@revelio/db`; `SetActionResult` + `revalidateSetSurfaces` from Task 7; `routing` from `@/../i18n/routing`.
- Produces:
  - `createSetAction(input: unknown): Promise<SetActionResult>` — validates `{ code, name, releaseDate, isOfficial, localizations }`; `error: 'exists'` on duplicate code, `error: 'invalid'` on bad shape.
  - `updateSetAction(code: string, input: unknown): Promise<SetActionResult>`.
  - `deleteSetAction(code: string): Promise<SetActionResult>` — `error: 'has-cards'` when `cardCount > 0`; on success deletes the symbol object too.

**Known limitation (accepted, per spec scope):** editing a set's `isOfficial` does not reindex, so search's `isOfficial` filter reflects the change only after the next ingest. The spec's no-reindex guarantee is scoped to set name/localizations; do not add a reindex here.

- [ ] **Step 1: Add failing CRUD tests**

Extend `web/src/lib/__tests__/set-actions.test.ts`. Add these mocks to the existing `m` hoisted object and `@revelio/db` mock — replace the `createSet: vi.fn(), updateSet: vi.fn(), deleteSet: vi.fn()` placeholders so they are addressable:

```ts
// in the vi.hoisted(...) object add:
  createSet: vi.fn(async () => {}),
  updateSet: vi.fn(async () => {}),
  deleteSet: vi.fn(async () => {}),
```

and change the `@revelio/db` mock to:

```ts
vi.mock('@revelio/db', () => ({
  getSetByCode: m.getSetByCode, setSymbolFile: m.setSymbolFile,
  createSet: m.createSet, updateSet: m.updateSet, deleteSet: m.deleteSet,
}))
```

Add to the imports line: `import { uploadSetSymbol, removeSetSymbol, createSetAction, updateSetAction, deleteSetAction } from '../set-actions'`.

Then add these describe blocks:

```ts
const valid = { code: 'NEW', name: 'New Set', releaseDate: '2002-01-01', isOfficial: true, localizations: { de: 'Neu' } }

describe('createSetAction', () => {
  it('rejects an invalid shape', async () => {
    const res = await createSetAction({ code: '', name: '' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.createSet).not.toHaveBeenCalled()
  })

  it('rejects a duplicate code', async () => {
    m.getSetByCode.mockResolvedValueOnce({ code: 'NEW', cardCount: 0 })
    const res = await createSetAction(valid)
    expect(res).toEqual({ ok: false, error: 'exists' })
    expect(m.createSet).not.toHaveBeenCalled()
  })

  it('creates when the code is free', async () => {
    m.getSetByCode.mockResolvedValueOnce(null)
    const res = await createSetAction(valid)
    expect(res).toEqual({ ok: true })
    expect(m.createSet).toHaveBeenCalledWith({}, 'NEW', {
      name: 'New Set', releaseDate: '2002-01-01', isOfficial: true, localizations: { de: 'Neu' },
    })
  })
})

describe('updateSetAction', () => {
  it('updates an existing set', async () => {
    m.getSetByCode.mockResolvedValueOnce({ code: 'BS', cardCount: 3 })
    const res = await updateSetAction('BS', { name: 'Base', releaseDate: '', isOfficial: false, localizations: {} })
    expect(res).toEqual({ ok: true })
    expect(m.updateSet).toHaveBeenCalledWith({}, 'BS', {
      name: 'Base', releaseDate: null, isOfficial: false, localizations: {},
    })
  })
})

describe('deleteSetAction', () => {
  it('blocks deletion when the set has cards', async () => {
    m.getSetByCode.mockResolvedValueOnce({ code: 'BS', cardCount: 3 })
    const res = await deleteSetAction('BS')
    expect(res).toEqual({ ok: false, error: 'has-cards' })
    expect(m.deleteSet).not.toHaveBeenCalled()
  })

  it('deletes an empty set and removes its symbol object', async () => {
    m.getSetByCode.mockResolvedValueOnce({ code: 'BS', cardCount: 0 })
    const res = await deleteSetAction('BS')
    expect(res).toEqual({ ok: true })
    expect(m.del.mock.calls[0][1]).toBe('symbols/BS.webp')
    expect(m.deleteSet).toHaveBeenCalledWith({}, 'BS')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- set-actions
```

Expected: FAIL — `createSetAction` etc. not exported.

- [ ] **Step 3: Implement the CRUD actions**

In `web/src/lib/set-actions.ts`, add imports for `z`, `createSet`, `updateSet`, `deleteSet`, `symbolKey` (already imported), and `deleteObject` (already imported). At the top, after the existing imports, add:

```ts
import { z } from 'zod'
import { createSet, updateSet, deleteSet } from '@revelio/db'
```

(Extend the existing `@revelio/db` import line rather than duplicating it.)

Add the schemas + actions:

```ts
const writeSchema = z.object({
  name: z.string().trim().min(1),
  releaseDate: z.string(),
  isOfficial: z.boolean(),
  localizations: z.record(z.string(), z.string()),
})
const createSchema = writeSchema.extend({ code: z.string().trim().min(1) })

export async function createSetAction(input: unknown): Promise<SetActionResult> {
  await requireRole('editor')
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { code, name, releaseDate, isOfficial, localizations } = parsed.data
  const db = getDb()
  if (await getSetByCode(db, code)) return { ok: false, error: 'exists' }
  await createSet(db, code, { name, releaseDate: releaseDate.trim() || null, isOfficial, localizations })
  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function updateSetAction(code: string, input: unknown): Promise<SetActionResult> {
  await requireRole('editor')
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { name, releaseDate, isOfficial, localizations } = parsed.data
  const db = getDb()
  if (!(await getSetByCode(db, code))) return { ok: false, error: 'invalid' }
  await updateSet(db, code, { name, releaseDate: releaseDate.trim() || null, isOfficial, localizations })
  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function deleteSetAction(code: string): Promise<SetActionResult> {
  await requireRole('editor')
  const db = getDb()
  const set = await getSetByCode(db, code)
  if (!set) return { ok: false, error: 'invalid' }
  if (set.cardCount > 0) return { ok: false, error: 'has-cards' }
  await deleteObject(getS3(), symbolKey(code))
  await deleteSet(db, code)
  revalidateSetSurfaces(code)
  return { ok: true }
}
```

- [ ] **Step 4: Run the full action test file**

```bash
npm test -w web -- set-actions
```

Expected: PASS (all symbol + CRUD cases).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
npm run typecheck
npm run lint -w web
git add web
git commit -m "feat(web): set create/update/delete actions"
```

---

## Task 9: Admin messages + the SetForm component (create + edit fields)

**Files:**
- Modify: `web/messages/en.json` (add `admin.sets`)
- Modify: `web/messages/de.json` (add `admin.sets`)
- Create: `web/src/components/set-form.tsx`
- Test: `web/src/components/__tests__/set-form.test.tsx`

**Interfaces:**
- Consumes: `createSetAction`, `updateSetAction` from `@/lib/set-actions`; `useRouter` from `@/../i18n/navigation`; `useTranslations` from `next-intl`.
- Produces: `SetForm` component:

```ts
type SetFormInitial = {
  code: string
  name: string
  releaseDate: string   // '' or 'YYYY-MM-DD'
  isOfficial: boolean
  localizations: Record<string, string>
}
function SetForm(props: { mode: 'create' | 'edit'; locales: string[]; initial: SetFormInitial }): JSX.Element
```

- [ ] **Step 1: Add the message keys**

In `web/messages/en.json`, inside the `"admin"` object (after `"clearSearch"`), add a nested `sets` object (add a comma after `"clearSearch": "Clear search"`):

```json
    "sets": {
      "title": "Sets",
      "desc": "Create and edit card sets.",
      "new": "New set",
      "name": "Name",
      "code": "Code",
      "releaseDate": "Release date",
      "official": "Official",
      "cardCount": "Cards",
      "symbol": "Symbol",
      "localizedNames": "Localized names",
      "create": "Create",
      "save": "Save",
      "created": "Set created",
      "updated": "Saved",
      "delete": "Delete set",
      "deleted": "Set deleted",
      "deleteBlocked": "A set with cards cannot be deleted.",
      "codeExists": "A set with this code already exists.",
      "back": "Back to sets",
      "uploadSymbol": "Change symbol",
      "removeSymbol": "Remove symbol",
      "symbolUpdated": "Symbol updated",
      "symbolRemoved": "Symbol removed",
      "noSymbol": "No symbol",
      "saveError": "Could not save"
    }
```

In `web/messages/de.json`, inside the `"admin"` object, add the German equivalent:

```json
    "sets": {
      "title": "Sets",
      "desc": "Kartensets erstellen und bearbeiten.",
      "new": "Neues Set",
      "name": "Name",
      "code": "Code",
      "releaseDate": "Erscheinungsdatum",
      "official": "Offiziell",
      "cardCount": "Karten",
      "symbol": "Symbol",
      "localizedNames": "Lokalisierte Namen",
      "create": "Erstellen",
      "save": "Speichern",
      "created": "Set erstellt",
      "updated": "Gespeichert",
      "delete": "Set löschen",
      "deleted": "Set gelöscht",
      "deleteBlocked": "Ein Set mit Karten kann nicht gelöscht werden.",
      "codeExists": "Ein Set mit diesem Code existiert bereits.",
      "back": "Zurück zu den Sets",
      "uploadSymbol": "Symbol ändern",
      "removeSymbol": "Symbol entfernen",
      "symbolUpdated": "Symbol aktualisiert",
      "symbolRemoved": "Symbol entfernt",
      "noSymbol": "Kein Symbol",
      "saveError": "Speichern fehlgeschlagen"
    }
```

- [ ] **Step 2: Write the failing test**

Create `web/src/components/__tests__/set-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SetForm } from '../set-form'

const push = vi.fn()
const refresh = vi.fn()
const create = vi.fn(async () => ({ ok: true }))
const update = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  createSetAction: (...a: unknown[]) => create(...a),
  updateSetAction: (...a: unknown[]) => update(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

function renderForm(mode: 'create' | 'edit', initial = {
  code: '', name: '', releaseDate: '', isOfficial: false, localizations: {} as Record<string, string>,
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetForm mode={mode} locales={['en', 'de']} initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { push.mockReset(); refresh.mockReset(); create.mockClear(); update.mockClear() })

describe('SetForm', () => {
  it('create mode submits code + fields and redirects to the list', async () => {
    renderForm('create')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Set' } })
    fireEvent.change(screen.getByLabelText('DE'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      code: 'NEW', name: 'New Set', releaseDate: '', isOfficial: false, localizations: { en: '', de: 'Neu' },
    }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/sets'))
  })

  it('edit mode disables the code field and calls updateSetAction with the code', async () => {
    renderForm('edit', { code: 'BS', name: 'Base', releaseDate: '2001-08-01', isOfficial: true, localizations: { de: 'Grundset' } })
    expect(screen.getByLabelText('Code')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Base Set' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('BS', expect.objectContaining({ name: 'Base Set' })))
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test -w web -- set-form
```

Expected: FAIL — `../set-form` does not exist.

- [ ] **Step 4: Implement `SetForm`**

Create `web/src/components/set-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { createSetAction, updateSetAction } from '@/lib/set-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export type SetFormInitial = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

export function SetForm({
  mode,
  locales,
  initial,
}: {
  mode: 'create' | 'edit'
  locales: string[]
  initial: SetFormInitial
}) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [releaseDate, setReleaseDate] = useState(initial.releaseDate)
  const [isOfficial, setIsOfficial] = useState(initial.isOfficial)
  const [locNames, setLocNames] = useState<Record<string, string>>(
    () => Object.fromEntries(locales.map((l) => [l, initial.localizations[l] ?? ''])),
  )
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const payload = { name, releaseDate, isOfficial, localizations: locNames }
    const res =
      mode === 'create'
        ? await createSetAction({ code, ...payload })
        : await updateSetAction(code, payload)
    setBusy(false)
    if (res.ok) {
      toast.success(t(mode === 'create' ? 'created' : 'updated'))
      if (mode === 'create') router.push('/admin/sets')
      else router.refresh()
    } else {
      toast.error(res.error === 'exists' ? t('codeExists') : t('saveError'))
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="set-code">{t('code')}</Label>
        <Input
          id="set-code"
          value={code}
          disabled={mode === 'edit'}
          onChange={(e) => setCode(e.target.value)}
          aria-label={t('code')}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="set-name">{t('name')}</Label>
        <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('name')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="set-date">{t('releaseDate')}</Label>
        <Input
          id="set-date"
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          aria-label={t('releaseDate')}
        />
      </div>
      <label className="flex items-center gap-2">
        <Checkbox checked={isOfficial} onCheckedChange={(v) => setIsOfficial(v === true)} />
        <span className="text-sm">{t('official')}</span>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('localizedNames')}</legend>
        {locales.map((l) => (
          <div key={l} className="space-y-1.5">
            <Label htmlFor={`loc-${l}`}>{l.toUpperCase()}</Label>
            <Input
              id={`loc-${l}`}
              value={locNames[l] ?? ''}
              onChange={(e) => setLocNames((v) => ({ ...v, [l]: e.target.value }))}
              aria-label={l.toUpperCase()}
            />
          </div>
        ))}
      </fieldset>

      <Button onClick={submit} disabled={busy}>
        {t(mode === 'create' ? 'create' : 'save')}
      </Button>
    </div>
  )
}
```

(The `code` field is editable in create mode and disabled in edit mode — a disabled input still exposes its label to `getByLabelText`, so the test's `.toBeDisabled()` assertion works. The submit button reads `create` or `save` from `admin.sets`.)

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -w web -- set-form
```

Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint + commit**

```bash
npm run typecheck
npm run lint -w web
git add web
git commit -m "feat(web): SetForm component + admin.sets messages"
```

---

## Task 10: SetSymbolUploader + DeleteSetButton components

**Files:**
- Create: `web/src/components/set-symbol-uploader.tsx`
- Create: `web/src/components/delete-set-button.tsx`
- Test: `web/src/components/__tests__/set-symbol-uploader.test.tsx`
- Test: `web/src/components/__tests__/delete-set-button.test.tsx`

**Interfaces:**
- Consumes: `uploadSetSymbol`, `removeSetSymbol`, `deleteSetAction` from `@/lib/set-actions`; `SetSymbol` from `@/components/set-symbol`; `useRouter` from `@/../i18n/navigation`.
- Produces:
  - `SetSymbolUploader(props: { code: string; hasSymbol: boolean; imageBase: string })`.
  - `DeleteSetButton(props: { code: string; cardCount: number })` — disabled with a hint when `cardCount > 0`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/__tests__/set-symbol-uploader.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SetSymbolUploader } from '../set-symbol-uploader'

const refresh = vi.fn()
const upload = vi.fn(async () => ({ ok: true }))
const remove = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  uploadSetSymbol: (...a: unknown[]) => upload(...a),
  removeSetSymbol: (...a: unknown[]) => remove(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh }) }))

function renderIt(hasSymbol = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetSymbolUploader code="BS" hasSymbol={hasSymbol} imageBase="http://img" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { refresh.mockReset(); upload.mockClear(); remove.mockClear() })

describe('SetSymbolUploader', () => {
  it('uploads a chosen file with the set code', async () => {
    renderIt(false)
    const input = screen.getByLabelText('Change symbol') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const fd = upload.mock.calls[0][0] as FormData
    expect(fd.get('code')).toBe('BS')
    expect((fd.get('file') as File).name).toBe('logo.png')
  })

  it('shows remove only when a symbol exists', async () => {
    const { rerender } = renderIt(false)
    expect(screen.queryByRole('button', { name: 'Remove symbol' })).toBeNull()
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <SetSymbolUploader code="BS" hasSymbol imageBase="http://img" />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove symbol' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('BS'))
  })
})
```

Create `web/src/components/__tests__/delete-set-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeleteSetButton } from '../delete-set-button'

const push = vi.fn()
const del = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({ deleteSetAction: (...a: unknown[]) => del(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))

function renderIt(cardCount: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeleteSetButton code="BS" cardCount={cardCount} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { push.mockReset(); del.mockClear() })

describe('DeleteSetButton', () => {
  it('is disabled and hints when the set has cards', () => {
    renderIt(3)
    expect(screen.getByRole('button', { name: 'Delete set' })).toBeDisabled()
    expect(screen.getByText('A set with cards cannot be deleted.')).toBeInTheDocument()
  })

  it('deletes an empty set and redirects to the list', async () => {
    renderIt(0)
    fireEvent.click(screen.getByRole('button', { name: 'Delete set' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('BS'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/sets'))
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -w web -- set-symbol-uploader delete-set-button
```

Expected: FAIL — both components missing.

- [ ] **Step 3: Implement `SetSymbolUploader`**

Create `web/src/components/set-symbol-uploader.tsx` (a trimmed adaptation of `image-uploader.tsx` — no thumbnail, no fallback, no reindex):

```tsx
'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ImagePlus, Trash2, Loader2 } from 'lucide-react'
import { useRouter } from '@/../i18n/navigation'
import { uploadSetSymbol, removeSetSymbol } from '@/lib/set-actions'
import { SetSymbol } from '@/components/set-symbol'
import { cn } from '@/lib/utils'

export function SetSymbolUploader({
  code,
  hasSymbol,
  imageBase,
}: {
  code: string
  hasSymbol: boolean
  imageBase: string
}) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function doUpload(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('code', code)
      fd.append('file', file)
      const res = await uploadSetSymbol(fd)
      if (!res.ok) return toast.error(t('saveError'))
      toast.success(t('symbolUpdated'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    setBusy(true)
    try {
      const res = await removeSetSymbol(code)
      if (!res.ok) return toast.error(t('saveError'))
      toast.success(t('symbolRemoved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={t('uploadSymbol')}
        aria-busy={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={cn(
          'group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {hasSymbol && imageBase ? (
          <SetSymbol code={code} base={imageBase} className="h-12 w-12 text-foreground/80" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{t('noSymbol')}</span>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ImagePlus className="size-5" />
        </div>
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={t('uploadSymbol')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doUpload(f)
          e.target.value = ''
        }}
      />

      {hasSymbol ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          {t('removeSymbol')}
        </button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Implement `DeleteSetButton`**

Create `web/src/components/delete-set-button.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { useRouter } from '@/../i18n/navigation'
import { deleteSetAction } from '@/lib/set-actions'
import { Button } from '@/components/ui/button'

export function DeleteSetButton({ code, cardCount }: { code: string; cardCount: number }) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const blocked = cardCount > 0

  async function onDelete() {
    setBusy(true)
    const res = await deleteSetAction(code)
    setBusy(false)
    if (res.ok) {
      toast.success(t('deleted'))
      router.push('/admin/sets')
    } else {
      toast.error(res.error === 'has-cards' ? t('deleteBlocked') : t('saveError'))
    }
  }

  return (
    <div className="space-y-1.5">
      <Button variant="destructive" onClick={onDelete} disabled={busy || blocked} className="gap-1.5">
        <Trash2 className="size-4" />
        {t('delete')}
      </Button>
      {blocked ? <p className="text-xs text-muted-foreground">{t('deleteBlocked')}</p> : null}
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -w web -- set-symbol-uploader delete-set-button
```

Expected: PASS.

- [ ] **Step 6: Typecheck + lint + commit**

```bash
npm run typecheck
npm run lint -w web
git add web
git commit -m "feat(web): set symbol uploader + delete-if-empty button"
```

---

## Task 11: Admin sets pages + index link

**Files:**
- Create: `web/src/app/[locale]/admin/sets/page.tsx` (list)
- Create: `web/src/app/[locale]/admin/sets/new/page.tsx` (create)
- Create: `web/src/app/[locale]/admin/sets/[code]/edit/page.tsx` (edit)
- Modify: `web/src/app/[locale]/admin/page.tsx` (add the "Sets" entry)

**Interfaces:**
- Consumes: `listSets`, `getSetForEdit` from `@revelio/db`; `SetForm`, `SetSymbolUploader`, `DeleteSetButton` components; `routing` from `@/../i18n/routing`; `SetSymbol` from `@/components/set-symbol`.

- [ ] **Step 1: Add the "Sets" card to the admin index**

In `web/src/app/[locale]/admin/page.tsx`, after the existing sub-types `<Link>`, add a second card (wrap both links in a `space-y-3` container if not already):

```tsx
      <Link
        href="/admin/sets"
        className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
      >
        <div className="font-medium">{t('sets.title')}</div>
        <div className="text-sm text-muted-foreground">{t('sets.desc')}</div>
      </Link>
```

Ensure the two links are siblings inside a `<div className="space-y-3">…</div>` so they stack.

- [ ] **Step 2: Create the list page**

Create `web/src/app/[locale]/admin/sets/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { SetSymbol } from '@/components/set-symbol'
import { formatReleaseMonth } from '@/lib/set-sort'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function AdminSetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin.sets')
  const sets = await listSets(getDb(), locale)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('desc')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/sets/new" className="gap-1.5">
            <Plus className="size-4" />
            {t('new')}
          </Link>
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {sets.map((s) => (
          <li key={s.code}>
            <Link href={`/admin/sets/${s.code}/edit`} className="flex items-center gap-4 p-3 transition-colors hover:bg-muted/50">
              <span className="flex h-8 w-8 items-center justify-center">
                {s.symbol && IMAGE_BASE ? (
                  <SetSymbol code={s.code} base={IMAGE_BASE} className="h-6 w-6 text-foreground/80" />
                ) : (
                  <span className="text-xs text-muted-foreground">{s.code}</span>
                )}
              </span>
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
              <span className="w-24 text-right text-sm text-muted-foreground">{formatReleaseMonth(s.releaseDate)}</span>
              <span className="w-14 text-right text-sm text-muted-foreground">{s.cardCount}</span>
              <span className="w-16 text-right text-xs text-muted-foreground">{s.isOfficial ? t('official') : 'Fan'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Create the "new set" page**

Create `web/src/app/[locale]/admin/sets/new/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { SetForm } from '@/components/set-form'

export const dynamic = 'force-dynamic'

export default async function NewSetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin.sets')
  return (
    <div>
      <Link
        href="/admin/sets"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('back')}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('new')}</h1>
      <SetForm
        mode="create"
        locales={[...routing.locales]}
        initial={{ code: '', name: '', releaseDate: '', isOfficial: false, localizations: {} }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create the edit page**

Create `web/src/app/[locale]/admin/sets/[code]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getDb } from '@/lib/db'
import { getSetForEdit } from '@revelio/db'
import { SetForm } from '@/components/set-form'
import { SetSymbolUploader } from '@/components/set-symbol-uploader'
import { DeleteSetButton } from '@/components/delete-set-button'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function EditSetPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetForEdit(getDb(), code)
  if (!set) notFound()
  const t = await getTranslations('admin.sets')

  return (
    <div>
      <Link
        href="/admin/sets"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('back')}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{set.name}</h1>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <SetForm
          mode="edit"
          locales={[...routing.locales]}
          initial={{
            code: set.code,
            name: set.name,
            releaseDate: set.releaseDate ?? '',
            isOfficial: set.isOfficial,
            localizations: set.localizations,
          }}
        />
        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('symbol')}</p>
            <SetSymbolUploader code={set.code} hasSymbol={!!set.symbol} imageBase={IMAGE_BASE} />
          </div>
          <DeleteSetButton code={set.code} cardCount={set.cardCount} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify (typecheck, lint, build, full web suite)**

Server pages that hit the DB aren't unit-tested here (consistent with `admin/sub-types/page.tsx`); their client pieces are covered by Tasks 9–10. Verify the pages compile and render in the build:

```bash
npm run typecheck
npm run lint -w web
npm test -w web
npm run build -w web
```

Expected: typecheck/lint clean; all web tests PASS; `next build` succeeds. (`build` needs the env vars from `app/.env` / `.env.example` — `NEXT_PUBLIC_*`, DB/Meili/S3 hosts.)

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): admin sets list/new/edit pages"
```

---

## Task 12: Full-suite verification + finish

**Files:** none (verification only).

- [ ] **Step 1: Run the whole gate as CI does**

From `app`:

```bash
npm run check -w @revelio/db
npm run verify -w @revelio/db
npm run lint -w web
npm run typecheck
npm test
npm run build -w web
```

Expected: every command passes. `npm test` needs Docker (Postgres via Testcontainers) + MinIO (`TEST_S3_*`) + Meilisearch (`TEST_MEILI_*`) as described in `CLAUDE.md`.

- [ ] **Step 2: Manual smoke (optional but recommended)**

With local infra up (`docker compose up`, migrations via `docker compose run --rm migrate`), sign in as an editor and exercise `/admin/sets`: create a set, add a German name, upload a symbol, confirm `/sets` shows the localized name in `de` and the symbol, then delete an empty set and confirm a set with cards shows the disabled delete with the hint.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR (this track is "Spec 2 of 2"; the PR completes the editable reference-data work).

---

## Self-Review

**Spec coverage:**
- Rename `sub_type_translations`/`card_ruling_texts` → `_localizations` (tables + consts, files/functions unchanged; migration is a real rename, verify green) → **Task 1**.
- `set_localizations(set_code, lang, name)` table + FK cascade → **Task 2**.
- Locale-aware `listSets`/`getSetByCode`/`getCardById` with `sets.name` fallback + admin all-locales read → **Task 3**; web wiring (card detail, search set map, sets pages, home) → **Task 4**.
- Drop `setName` from `SearchDocument`/`CardIndexData`/`buildCardDocument`/`build-documents`/`getCardIndexData`; `setCode` stays; no reindex on set edit → **Task 5** (+ Task 8 makes set actions reindex-free).
- Symbol upload/remove (S3, `sharp`→webp alpha-preserved, `symbolKey`, `symbol=file.name`) → **Tasks 6–7**.
- `createSetAction` (dup/empty code rejected), `updateSetAction` (upsert/blank-delete localizations), `deleteSetAction` (blocked unless `cardCount===0`, drops symbol + cascades) → **Tasks 6, 8**.
- Route-based admin UI: list + new + edit under the editor-gated `/admin`; "Sets" added to the admin index → **Tasks 9–11**.
- Out of scope respected: no cascade-delete of non-empty sets, no `cardCount`/`code` editing, only `name` localized.
- Testing matrix (rename green + verify; `set_localizations` DB fns; actions incl. gate/dup/delete-guard; symbol put/delete; search no longer emits `setName`; admin forms render/submit) → covered across Tasks 1, 3, 5, 6, 7, 8, 9, 10.

**Type consistency:** `SetWriteInput` (Task 6) is consumed identically by `createSet`/`updateSet` and by `createSetAction`/`updateSetAction` (Task 8). `SetForEdit` (Task 3) shapes the edit page's `initial` (Task 11). `SetActionResult` and `revalidateSetSurfaces` defined in Task 7 are reused in Task 8. `getCardById`'s new optional `locale` (Task 3) is backward-compatible with the `image-actions.ts` callers that omit it. `SetForm` prop `initial.releaseDate` is always a string (`set.releaseDate ?? ''`), matching the `type="date"` input.

**Note on `isOfficial` search staleness:** flagged as an accepted limitation in Task 8 — editing `isOfficial` won't update the search filter until the next ingest. This matches the spec's scope (the no-reindex guarantee covers set name/localizations); do not add a reindex.

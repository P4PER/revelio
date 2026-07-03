# Edit Translations (Plan 4b-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors/admins edit a card's text localizations (name/text/flavor/status) per language on a dedicated `/card/[id]/edit` page, writing back to Postgres with provenance and re-indexing that card in Meilisearch.

**Architecture:** A pure `buildCardDocument(data, lang)` + `reindexCard(client, data)` in `@revelio/search` (no DB import — stays decoupled). `@revelio/db` gains `upsertLocalization` (upsert on `(cardId,lang)` with `origin:'user'`+`updated_at`) and `getCardIndexData` (returns the `CardIndexData` the doc builder needs). A gated Next server action `updateLocalization` validates (Zod), upserts, then attempts a non-fatal reindex with a scoped write key. UI: an editor-only Edit button on the detail page and the edit page + form.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle/postgres-js, Meilisearch, Zod, next-intl, Vitest.

## Global Constraints

- Editable fields ONLY: `name`, `text`, `flavorText`, `status`. `status ∈ {machine, official}`. Languages: `en`, `de` (routing locales).
- Write-back is an **upsert** on `card_localizations (cardId, lang)` setting `origin:'user'` + `updated_at=now`; creates the row if the language is missing.
- **Meili write uses a scoped `MEILI_WRITE_KEY`** (server-only, never `NEXT_PUBLIC_`), NOT the master key. Public search keeps `MEILI_SEARCH_KEY`.
- **Reindex is non-fatal:** Postgres is authoritative — upsert first, then attempt reindex; on failure return `{ ok: true, warning: 'reindex-failed' }`, never lose the edit.
- Authorization via the existing `requireRole('editor')` / `hasRequiredRole` (admins pass). Edit UI hidden below editor.
- `@revelio/search` must NOT import `@revelio/db` (one-way `db → search` type import only; no cycle).
- Env quirk: `~/.npm` is root-owned → prefix installs with `NPM_CONFIG_CACHE=/private/tmp/claude-502/-Users-timon-wegener-Desktop-revelio-cards/5736844e-b47b-4a0f-87aa-027e73f7d8a9/scratchpad/npm-cache`. Containers up: Postgres `localhost:55432` (`revelio-testpg`), Meili `localhost:7700` key `masterKey` (`revelio-testmeili`).
- Test commands: web → `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run`; db/search/ingest → `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run`.
- English identifiers; Conventional Commits.

## File Structure

```
app/search/src/documents.ts   # + CardIndexData type, buildCardDocument(data,lang), reindexCard(client,data)
app/ingest/src/build-documents.ts  # refactor to assemble CardIndexData + call buildCardDocument
app/db/src/queries.ts         # + upsertLocalization, getCardIndexData
app/db/src/index.ts           # export the two new queries
app/db/package.json           # + "@revelio/search" dep (type-only import)
app/web/src/lib/reindex.ts    # getWriteClient() (reads MEILI_WRITE_KEY)
app/web/src/lib/localization-actions.ts  # 'use server' updateLocalization
app/web/src/app/[locale]/card/[id]/edit/page.tsx   # editor-gated edit page
app/web/src/components/localization-form.tsx        # client form
app/web/src/components/card-detail.tsx  # + editor-only Edit button (canEdit prop)
app/web/src/app/[locale]/card/[id]/page.tsx  # compute canEdit, pass to CardDetail
app/web/messages/{en,de}.json # + "edit" namespace
app/{,web}/.env.example       # + MEILI_WRITE_KEY
tests: app/ingest/test/*.test.ts (search+db), app/web/src/**/__tests__/*.test.tsx (web)
```

---

### Task 1: `CardIndexData` + `buildCardDocument` + `reindexCard` in `@revelio/search`; refactor ingest

**Files:**
- Modify: `app/search/src/documents.ts`
- Modify: `app/ingest/src/build-documents.ts`
- Test: `app/ingest/test/build-card-document.test.ts`, `app/ingest/test/reindex-card.test.ts`

**Interfaces:**
- Produces: `CardIndexData` (type), `buildCardDocument(data: CardIndexData, lang: string): SearchDocument`, `reindexCard(client: MeiliSearch, data: CardIndexData): Promise<void>` — all from `@revelio/search`.

- [ ] **Step 1: Write the failing unit test for `buildCardDocument`**

`app/ingest/test/build-card-document.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCardDocument, type CardIndexData } from '@revelio/search'

const base: CardIndexData = {
  id: 'x-1', setCode: 'X', setName: 'Xen', number: '1', name: 'Fallback',
  lesson: 'creatures', lessonColor: '#123456', rarity: 'common', finish: null,
  legality: null, cost: 2, isOfficial: true, types: ['spell'], subTypes: [],
  defaultLanguage: 'en',
  localizations: {
    en: { name: 'Wizard Crackers', text: 'Reveal the top card.', flavorText: 'Bang!', imageFile: 'x-1.png' },
  },
}

describe('buildCardDocument', () => {
  it('uses the localization for the requested language', () => {
    const doc = buildCardDocument(base, 'en')
    expect(doc.name).toBe('Wizard Crackers')
    expect(doc.text).toBe('Reveal the top card.')
    expect(doc.lessonColor).toBe('#123456')
    expect(doc.isOfficial).toBe(true)
  })
  it('falls back to the default language when the requested one is missing', () => {
    const doc = buildCardDocument(base, 'de')
    expect(doc.name).toBe('Wizard Crackers') // en is default
  })
  it('nulls lessonColor when there is no lesson', () => {
    const doc = buildCardDocument({ ...base, lesson: null }, 'en')
    expect(doc.lessonColor).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`buildCardDocument`/`CardIndexData` not exported)

Run: `cd app/ingest && npx vitest run build-card-document`
Expected: FAIL (no such export).

- [ ] **Step 3: Add the type + functions to `app/search/src/documents.ts`**

Append (the file already imports `Settings` and exports `SearchDocument`, `cardsIndex`, `CARD_INDEX_SETTINGS`). Add a `MeiliSearch` type import at the top and the following at the end:
```ts
import type { MeiliSearch } from 'meilisearch'

export type LocalizationFields = {
  name: string
  text: string | null
  flavorText: string | null
  imageFile: string | null
}

// Everything needed to build a card's search documents across languages.
export type CardIndexData = {
  id: string
  setCode: string
  setName: string
  number: string
  name: string // card-level fallback name
  lesson: string | null
  lessonColor: string | null
  rarity: string | null
  finish: string | null
  legality: string | null
  cost: number | null
  isOfficial: boolean
  types: string[]
  subTypes: string[]
  defaultLanguage: string
  localizations: Record<string, LocalizationFields>
}

export function buildCardDocument(d: CardIndexData, lang: string): SearchDocument {
  const loc = d.localizations[lang] ?? d.localizations[d.defaultLanguage]
  return {
    id: d.id,
    setCode: d.setCode,
    setName: d.setName,
    number: d.number,
    name: loc?.name ?? d.name,
    text: loc?.text ?? null,
    flavorText: loc?.flavorText ?? null,
    types: d.types,
    subTypes: d.subTypes,
    lesson: d.lesson,
    lessonColor: d.lesson ? (d.lessonColor ?? null) : null,
    rarity: d.rarity,
    finish: d.finish,
    legality: d.legality,
    cost: d.cost,
    isOfficial: d.isOfficial,
    imageFile: loc?.imageFile ?? null,
  }
}

// Re-index one card's document into each language index it has a localization for.
// Waits for each task so callers observe a consistent index.
export async function reindexCard(client: MeiliSearch, data: CardIndexData): Promise<void> {
  for (const lang of Object.keys(data.localizations)) {
    const index = client.index(cardsIndex(lang))
    const s = await index.updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await index.addDocuments([buildCardDocument(data, lang)], { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }
}
```

- [ ] **Step 4: Run the unit test — expect PASS**

Run: `cd app/ingest && npx vitest run build-card-document` → 3 passed.

- [ ] **Step 5: Refactor `build-documents.ts` to use `buildCardDocument` (DRY)**

Replace the `out` construction at the end of `buildDocuments` (keep everything above it — the queries and the `locByCard`/`typesByCard`/`subTypesByCard`/`lessonColor`/`setByCode` maps). Import `buildCardDocument` + `CardIndexData`:
```ts
import type { SearchDocument, CardIndexData } from '@revelio/search'
import { buildCardDocument } from '@revelio/search'
```
Then:
```ts
  const langs = [...languages]
  const dataByCard: CardIndexData[] = allCards.map((c) => {
    const perCard = locByCard.get(c.id)
    const set = setByCode.get(c.setCode)
    const localizations: Record<string, { name: string; text: string | null; flavorText: string | null; imageFile: string | null }> = {}
    if (perCard) {
      for (const [lang, loc] of perCard) {
        localizations[lang] = { name: loc.name, text: loc.text, flavorText: loc.flavorText, imageFile: loc.imageFile }
      }
    }
    return {
      id: c.id,
      setCode: c.setCode,
      setName: set?.name ?? c.setCode,
      number: c.number,
      name: c.name,
      lesson: c.lesson,
      lessonColor: c.lesson ? (lessonColor.get(c.lesson) ?? null) : null,
      rarity: c.rarity,
      finish: c.finish,
      legality: c.legality,
      cost: c.cost,
      isOfficial: set?.isOfficial ?? false,
      types: typesByCard.get(c.id) ?? [],
      subTypes: subTypesByCard.get(c.id) ?? [],
      defaultLanguage: c.defaultLanguage,
      localizations,
    }
  })

  const out: Record<string, SearchDocument[]> = {}
  for (const lang of langs) {
    out[lang] = dataByCard.map((d) => buildCardDocument(d, lang))
  }
  return out
```

- [ ] **Step 6: Write the `reindexCard` integration test**

`app/ingest/test/reindex-card.test.ts` — index a card doc under a throwaway language (`zz`, isolated from other tests' `en`/`de` indices) and confirm search finds it:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createMeiliClient, reindexCard, cardsIndex, type CardIndexData } from '@revelio/search'

const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', setName: 'ZZ Set', number: '1', name: 'Card',
  lesson: null, lessonColor: null, rarity: null, finish: null, legality: null, cost: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: 'zz',
  localizations: { zz: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageFile: null } },
}

afterAll(async () => {
  const del = await client.index(cardsIndex('zz')).delete()
  await client.waitForTask(del.taskUid)
})

describe('reindexCard', () => {
  it('indexes the card so it is searchable in its language index', async () => {
    await reindexCard(client, data)
    const res = await client.index(cardsIndex('zz')).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })
})
```

- [ ] **Step 7: Run search tests + the existing build-documents regression test**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run build-card-document reindex-card build-documents`
Expected: all pass (build-documents unchanged behavior).

- [ ] **Step 8: Commit**

```bash
git add app/search/src/documents.ts app/ingest/src/build-documents.ts app/ingest/test/build-card-document.test.ts app/ingest/test/reindex-card.test.ts
git commit -m "feat(search): CardIndexData + buildCardDocument + reindexCard; ingest reuses the builder"
```

---

### Task 2: `upsertLocalization` + `getCardIndexData` in `@revelio/db`

**Files:**
- Modify: `app/db/src/queries.ts`, `app/db/src/index.ts`, `app/db/package.json`
- Test: `app/ingest/test/localization-write.test.ts`

**Interfaces:**
- Consumes: `CardIndexData` (type) from `@revelio/search`.
- Produces: `upsertLocalization(db, { cardId, lang, name, text, flavorText, status }): Promise<void>`; `getCardIndexData(db, cardId): Promise<CardIndexData | null>`.

- [ ] **Step 1: Add the `@revelio/search` dependency to `app/db/package.json`**

Under `"dependencies"`, add `"@revelio/search": "*"` (type-only import; no runtime cycle since search never imports db). Then from `app/`: `NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm install`.

- [ ] **Step 2: Write the failing integration test**

`app/ingest/test/localization-write.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, cards, cardLocalizations, upsertLocalization, getCardIndexData } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values({ code: 'X', name: 'Xen', isOfficial: true })
  await ctx.db.insert(cards).values({ id: 'x-1', setCode: 'X', number: '1', name: 'Card', defaultLanguage: 'en' })
  await ctx.db.insert(cardLocalizations).values({ cardId: 'x-1', lang: 'en', name: 'Old Name', status: 'official' })
}, 60_000)
afterAll(async () => { await ctx.stop() })

describe('upsertLocalization', () => {
  it('updates an existing localization and stamps origin=user + updatedAt', async () => {
    await upsertLocalization(ctx.db, { cardId: 'x-1', lang: 'en', name: 'New Name', text: 'body', flavorText: null, status: 'official' })
    const [row] = await ctx.db.select().from(cardLocalizations).where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cardLocalizations as any).cardId ? undefined : undefined,
    )
    const rows = await ctx.db.select().from(cardLocalizations)
    const en = rows.find((r) => r.cardId === 'x-1' && r.lang === 'en')!
    expect(en.name).toBe('New Name')
    expect(en.text).toBe('body')
    expect(en.origin).toBe('user')
    expect(en.updatedAt).toBeInstanceOf(Date)
  })

  it('creates a localization for a missing language', async () => {
    await upsertLocalization(ctx.db, { cardId: 'x-1', lang: 'de', name: 'Deutscher Name', text: null, flavorText: null, status: 'machine' })
    const rows = await ctx.db.select().from(cardLocalizations)
    const de = rows.find((r) => r.cardId === 'x-1' && r.lang === 'de')
    expect(de?.name).toBe('Deutscher Name')
    expect(de?.origin).toBe('user')
  })
})

describe('getCardIndexData', () => {
  it('returns the card data shaped for the document builder', async () => {
    const data = await getCardIndexData(ctx.db, 'x-1')
    expect(data?.id).toBe('x-1')
    expect(data?.setName).toBe('Xen')
    expect(data?.isOfficial).toBe(true)
    expect(data?.localizations.en.name).toBe('New Name')
    expect(data?.localizations.de.name).toBe('Deutscher Name')
  })
  it('returns null for an unknown card', async () => {
    expect(await getCardIndexData(ctx.db, 'nope')).toBeNull()
  })
})
```
(Delete the stray `const [row]` line if the linter dislikes it — the meaningful assertions read from `rows`. Keep the four `expect`s.)

- [ ] **Step 3: Run it — expect FAIL** (functions not exported)

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run localization-write`
Expected: FAIL.

- [ ] **Step 4: Implement the two queries in `app/db/src/queries.ts`**

The file already imports `{ eq, asc, sql }` from `drizzle-orm` and the tables. Add `lessons` to the table imports if not present (it is used by `getCardIndexData`). Append:
```ts
import type { CardIndexData } from '@revelio/search'

export async function upsertLocalization(
  db: DB,
  input: { cardId: string; lang: string; name: string; text: string | null; flavorText: string | null; status: string | null },
): Promise<void> {
  const now = new Date()
  await db
    .insert(cardLocalizations)
    .values({
      cardId: input.cardId,
      lang: input.lang,
      name: input.name,
      text: input.text,
      flavorText: input.flavorText,
      status: input.status,
      origin: 'user',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: {
        name: input.name,
        text: input.text,
        flavorText: input.flavorText,
        status: input.status,
        origin: 'user',
        updatedAt: now,
      },
    })
}

export async function getCardIndexData(db: DB, cardId: string): Promise<CardIndexData | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!card) return null
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  const [locRows, typeRows, subTypeRows] = await Promise.all([
    db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, cardId)),
    db.select().from(cardTypes).where(eq(cardTypes.cardId, cardId)),
    db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, cardId)),
  ])
  let lessonColor: string | null = null
  if (card.lesson) {
    const [l] = await db.select().from(lessons).where(eq(lessons.code, card.lesson)).limit(1)
    lessonColor = l?.color ?? null
  }
  const localizations: CardIndexData['localizations'] = {}
  for (const l of locRows) {
    localizations[l.lang] = { name: l.name, text: l.text, flavorText: l.flavorText, imageFile: l.imageFile }
  }
  return {
    id: card.id,
    setCode: card.setCode,
    setName: setRow?.name ?? card.setCode,
    number: card.number,
    name: card.name,
    lesson: card.lesson,
    lessonColor,
    rarity: card.rarity,
    finish: card.finish,
    legality: card.legality,
    cost: card.cost,
    isOfficial: setRow?.isOfficial ?? false,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    defaultLanguage: card.defaultLanguage,
    localizations,
  }
}
```
Ensure `lessons` is imported in `queries.ts` (add to the existing `@revelio/db` schema imports if missing).

- [ ] **Step 5: Export from `app/db/src/index.ts`**

Change the queries export line to include the two new functions:
```ts
export { getCardById, listSets, getSetByCode, getRandomCardId, upsertLocalization, getCardIndexData } from './queries'
```

- [ ] **Step 6: Run the test — expect PASS**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run localization-write`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/db/package.json app/package-lock.json app/ingest/test/localization-write.test.ts
git commit -m "feat(db): upsertLocalization (origin=user) + getCardIndexData"
```

---

### Task 3: `getWriteClient` (scoped write key) + `MEILI_WRITE_KEY` env

**Files:**
- Create: `app/web/src/lib/reindex.ts`
- Modify: `app/web/.env.example`, `app/.env.example`
- Test: `app/web/src/lib/__tests__/reindex.test.ts`

**Interfaces:**
- Produces: `getWriteClient(): MeiliSearch` (reads `MEILI_HOST` + `MEILI_WRITE_KEY`).

- [ ] **Step 1: Write the failing test**

`app/web/src/lib/__tests__/reindex.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { getWriteClient } from '../reindex'

const saved = { host: process.env.MEILI_HOST, key: process.env.MEILI_WRITE_KEY }
afterEach(() => {
  process.env.MEILI_HOST = saved.host
  process.env.MEILI_WRITE_KEY = saved.key
})

describe('getWriteClient', () => {
  it('throws when MEILI_WRITE_KEY is missing', () => {
    process.env.MEILI_HOST = 'http://localhost:7700'
    delete process.env.MEILI_WRITE_KEY
    expect(() => getWriteClient()).toThrow(/MEILI_WRITE_KEY/)
  })
  it('builds a client when host + write key are set', () => {
    process.env.MEILI_HOST = 'http://localhost:7700'
    process.env.MEILI_WRITE_KEY = 'scoped-write-key'
    expect(getWriteClient()).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`../reindex` missing)

Run: `cd app/web && npx vitest run reindex`
Expected: FAIL.

- [ ] **Step 3: Implement `app/web/src/lib/reindex.ts`**

```ts
import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient } from '@revelio/search'

// A Meilisearch client authenticated with the SCOPED write key (documents.add
// /update on the card indexes only) — never the master key, never sent to the
// browser (no NEXT_PUBLIC_ prefix).
export function getWriteClient(): MeiliSearch {
  const host = process.env.MEILI_HOST
  if (!host) throw new Error('MEILI_HOST is required')
  const key = process.env.MEILI_WRITE_KEY
  if (!key) throw new Error('MEILI_WRITE_KEY is required')
  return createMeiliClient(host, key)
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd app/web && npx vitest run reindex` → 2 passed.

- [ ] **Step 5: Document the env in both `.env.example` files**

Append to `app/web/.env.example` and `app/.env.example` (below the existing Meili vars):
```
# Scoped Meilisearch write key for editor saves (server-only; NOT the master key).
# Create it once from the master key, limited to documents.add/documents.update on the cards_* indexes:
#   curl -sX POST "$MEILI_HOST/keys" -H "Authorization: Bearer $MEILI_MASTER_KEY" -H 'Content-Type: application/json' \
#     -d '{"description":"web write","actions":["documents.add","documents.update"],"indexes":["cards-*"],"expiresAt":null}'
MEILI_WRITE_KEY=change-me-scoped-write-key
```

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/reindex.ts app/web/src/lib/__tests__/reindex.test.ts app/web/.env.example app/.env.example
git commit -m "feat(web): scoped Meili write client (MEILI_WRITE_KEY) for editor saves"
```

---

### Task 4: `updateLocalization` server action (gated, validated, non-fatal reindex)

**Files:**
- Create: `app/web/src/lib/localization-actions.ts`
- Test: `app/web/src/lib/__tests__/localization-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/session`), `getDb` (`@/lib/db`), `upsertLocalization` + `getCardIndexData` (`@revelio/db`), `getWriteClient` (`@/lib/reindex`), `reindexCard` (`@revelio/search`).
- Produces: `updateLocalization(input: unknown): Promise<SaveResult>` where `SaveResult = { ok: true; warning?: string } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test (mock the boundaries)**

`app/web/src/lib/__tests__/localization-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireRole = vi.fn(async () => ({ user: { role: 'editor' } }))
const upsertLocalization = vi.fn(async () => {})
const getCardIndexData = vi.fn(async () => ({ id: 'x-1', localizations: { en: {} } }))
const reindexCard = vi.fn(async () => {})
const revalidatePath = vi.fn()

vi.mock('@/lib/session', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/reindex', () => ({ getWriteClient: () => ({}) }))
vi.mock('@revelio/db', () => ({
  upsertLocalization: (...a: unknown[]) => upsertLocalization(...a),
  getCardIndexData: (...a: unknown[]) => getCardIndexData(...a),
}))
vi.mock('@revelio/search', () => ({ reindexCard: (...a: unknown[]) => reindexCard(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { updateLocalization } from '../localization-actions'

const valid = { cardId: 'x-1', lang: 'de', name: 'Neuer Name', text: 'Rumpf', flavorText: '', status: 'official' }

beforeEach(() => {
  requireRole.mockClear(); upsertLocalization.mockClear(); getCardIndexData.mockClear()
  reindexCard.mockClear(); revalidatePath.mockClear()
  requireRole.mockResolvedValue({ user: { role: 'editor' } })
})

describe('updateLocalization', () => {
  it('rejects a non-editor before writing', async () => {
    requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    await expect(updateLocalization(valid)).rejects.toThrow('Forbidden')
    expect(upsertLocalization).not.toHaveBeenCalled()
  })

  it('returns an error and does not write on invalid input', async () => {
    const res = await updateLocalization({ ...valid, name: '' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(upsertLocalization).not.toHaveBeenCalled()
  })

  it('upserts (empty strings -> null), reindexes, revalidates, returns ok', async () => {
    const res = await updateLocalization(valid)
    expect(upsertLocalization).toHaveBeenCalledWith(expect.anything(), {
      cardId: 'x-1', lang: 'de', name: 'Neuer Name', text: 'Rumpf', flavorText: null, status: 'official',
    })
    expect(reindexCard).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/card/x-1')
    expect(res).toEqual({ ok: true })
  })

  it('keeps the save when reindex fails (non-fatal warning)', async () => {
    reindexCard.mockRejectedValueOnce(new Error('meili down'))
    const res = await updateLocalization(valid)
    expect(upsertLocalization).toHaveBeenCalled()
    expect(res).toEqual({ ok: true, warning: 'reindex-failed' })
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`../localization-actions` missing)

Run: `cd app/web && npx vitest run localization-actions`
Expected: FAIL.

- [ ] **Step 3: Implement `app/web/src/lib/localization-actions.ts`**

```ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertLocalization, getCardIndexData } from '@revelio/db'
import { getWriteClient } from '@/lib/reindex'
import { reindexCard } from '@revelio/search'

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(['en', 'de']),
  name: z.string().trim().min(1),
  text: z.string(),
  flavorText: z.string(),
  status: z.enum(['machine', 'official']),
})

export type SaveResult = { ok: true; warning?: string } | { ok: false; error: string }

export async function updateLocalization(input: unknown): Promise<SaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, name, text, flavorText, status } = parsed.data

  const db = getDb()
  await upsertLocalization(db, {
    cardId,
    lang,
    name,
    text: text.trim() || null,
    flavorText: flavorText.trim() || null,
    status,
  })

  let warning: string | undefined
  try {
    const data = await getCardIndexData(db, cardId)
    if (data) await reindexCard(getWriteClient(), data)
  } catch {
    warning = 'reindex-failed'
  }

  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}
```
If `zod` is not yet a dependency of `@revelio/web`, install it: from `app/`, `NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm install zod -w @revelio/web`.

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd app/web && npx vitest run localization-actions` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/localization-actions.ts app/web/src/lib/__tests__/localization-actions.test.ts app/web/package.json app/package-lock.json
git commit -m "feat(web): updateLocalization server action (editor-gated, validated, non-fatal reindex)"
```

---

### Task 5: Editor-only Edit button on the detail page

**Files:**
- Modify: `app/web/src/app/[locale]/card/[id]/page.tsx`, `app/web/src/components/card-detail.tsx`
- Modify: `app/web/messages/{en,de}.json`
- Test: `app/web/src/components/__tests__/card-detail-edit.test.tsx`

**Interfaces:**
- Consumes: `getSession` (`@/lib/session`), `hasRequiredRole` (`@/lib/roles`), next-intl `Link`.
- Produces: `CardDetail` gains a `canEdit?: boolean` prop rendering an Edit link to `/card/[id]/edit`.

- [ ] **Step 1: Write the failing test**

`app/web/src/components/__tests__/card-detail-edit.test.tsx` — verify the Edit link renders only when `canEdit`. Mock next-intl navigation + translations minimally and pass a tiny card. Because `CardDetail` is large, this test focuses only on the Edit link:
```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { CardDetail } from '../card-detail'
import en from '@/../messages/en.json'

const card = {
  id: 'x-1', setCode: 'X', number: '1', name: 'Card', types: [], subTypes: [],
  lesson: null, cost: null, rarity: null, finish: null, legality: null, artist: [],
  health: null, damagePerTurn: null, orientation: null, defaultLanguage: 'en',
  localizations: { en: { lang: 'en', name: 'Card', status: 'official', source: null, text: null, flavorText: null, imageFile: null, imageUrl: null } },
  rulings: [],
  set: { code: 'X', name: 'Xen', releaseDate: null, isOfficial: true, symbol: null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

function renderDetail(canEdit: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CardDetail card={card} locale="en" imageBase="" canEdit={canEdit} />
    </NextIntlClientProvider>,
  )
}

describe('CardDetail edit link', () => {
  it('shows an Edit link for editors', () => {
    renderDetail(true)
    expect(screen.getByRole('link', { name: en.edit.button })).toHaveAttribute('href', '/card/x-1/edit')
  })
  it('hides the Edit link otherwise', () => {
    renderDetail(false)
    expect(screen.queryByRole('link', { name: en.edit.button })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Add the `edit` namespace to messages**

`app/web/messages/en.json` add `"edit"`:
```json
"edit": { "button": "Edit", "title": "Edit card", "language": "Language", "addLanguage": "Add a language", "name": "Name", "text": "Text", "flavor": "Flavor text", "status": "Status", "statusMachine": "Machine", "statusOfficial": "Official", "save": "Save", "saved": "Saved.", "invalid": "Please fill in the name.", "reindexWarning": "Saved, but search re-indexing failed; it will catch up later." }
```
`app/web/messages/de.json` add the German `"edit"`:
```json
"edit": { "button": "Bearbeiten", "title": "Karte bearbeiten", "language": "Sprache", "addLanguage": "Sprache hinzufügen", "name": "Name", "text": "Text", "flavor": "Flavor-Text", "status": "Status", "statusMachine": "Maschinell", "statusOfficial": "Offiziell", "save": "Speichern", "saved": "Gespeichert.", "invalid": "Bitte den Namen ausfüllen.", "reindexWarning": "Gespeichert, aber die Suchindizierung ist fehlgeschlagen; sie wird später nachgezogen." }
```

- [ ] **Step 3: Run the test — expect FAIL** (`CardDetail` has no `canEdit` / no link yet)

Run: `cd app/web && npx vitest run card-detail-edit`
Expected: FAIL.

- [ ] **Step 4: Add `canEdit` + the Edit link to `CardDetail`**

Read `app/web/src/components/card-detail.tsx`. Add `canEdit` to the props type and import `Link` from `@/../i18n/navigation` and `useTranslations` from `next-intl` (or reuse if already imported). Add, in the card's header/title area (top of the rendered card, near the name), a translated Edit link shown only when `canEdit`:
```tsx
import { Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
// ...
export function CardDetail({
  card, locale, imageBase, canEdit = false,
}: { card: CardDetailDTO; locale: string; imageBase: string; canEdit?: boolean }) {
  const tEdit = useTranslations('edit')
  // ... existing body ...
  // near the top of the returned JSX:
  {canEdit && (
    <Link
      href={`/card/${card.id}/edit`}
      className="text-sm text-muted-foreground underline hover:text-foreground"
    >
      {tEdit('button')}
    </Link>
  )}
}
```
(Match the component's existing prop-typing style; place the link where it reads naturally in the header.)

- [ ] **Step 5: Compute `canEdit` in the detail page and pass it**

In `app/web/src/app/[locale]/card/[id]/page.tsx`, add imports and compute the flag before rendering:
```ts
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
```
In `CardPage`, after loading the card:
```ts
  const session = await getSession()
  const canEdit = hasRequiredRole(session?.user?.role, 'editor')
  return <CardDetail card={card} locale={locale} imageBase={IMAGE_BASE} canEdit={canEdit} />
```

- [ ] **Step 6: Run test + build**

Run: `cd app/web && npx vitest run card-detail-edit` → 2 passed. Then `npx next build` → "Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add "app/web/src/app/[locale]/card/[id]/page.tsx" app/web/src/components/card-detail.tsx app/web/messages "app/web/src/components/__tests__/card-detail-edit.test.tsx"
git commit -m "feat(web): editor-only Edit button on the card detail page"
```

---

### Task 6: Edit page + localization form

**Files:**
- Create: `app/web/src/app/[locale]/card/[id]/edit/page.tsx`, `app/web/src/components/localization-form.tsx`
- Test: `app/web/src/components/__tests__/localization-form.test.tsx`

**Interfaces:**
- Consumes: `getCardById` (`@revelio/db`), `getSession` + `hasRequiredRole`, `updateLocalization` (`@/lib/localization-actions`), shadcn `Input`/`Button`/`Select`, next-intl.

- [ ] **Step 1: Write the failing form test**

`app/web/src/components/__tests__/localization-form.test.tsx` — a client form seeded with a localization; empty name shows the invalid message and does NOT call the action; a valid save calls `updateLocalization` with the field values:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/localization-actions', () => ({ updateLocalization: (...a: unknown[]) => updateLocalization(...a) }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { LocalizationForm } from '../localization-form'
import en from '@/../messages/en.json'

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalizationForm
        cardId="x-1"
        lang="de"
        initial={{ name: 'Alt', text: 'Rumpf', flavorText: '', status: 'machine' }}
      />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => updateLocalization.mockClear())

describe('LocalizationForm', () => {
  it('blocks an empty name and does not call the action', async () => {
    renderForm()
    await userEvent.clear(screen.getByLabelText(en.edit.name))
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(await screen.findByText(en.edit.invalid)).toBeInTheDocument()
    expect(updateLocalization).not.toHaveBeenCalled()
  })

  it('submits the edited fields', async () => {
    renderForm()
    const name = screen.getByLabelText(en.edit.name)
    await userEvent.clear(name)
    await userEvent.type(name, 'Neuer Name')
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'x-1', lang: 'de', name: 'Neuer Name', status: 'machine' }),
    )
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`../localization-form` missing)

Run: `cd app/web && npx vitest run localization-form`
Expected: FAIL.

- [ ] **Step 3: Implement `app/web/src/components/localization-form.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { updateLocalization } from '@/lib/localization-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

type Initial = { name: string; text: string; flavorText: string; status: 'machine' | 'official' }

export function LocalizationForm({ cardId, lang, initial }: { cardId: string; lang: string; initial: Initial }) {
  const t = useTranslations('edit')
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [text, setText] = useState(initial.text)
  const [flavorText, setFlavor] = useState(initial.flavorText)
  const [status, setStatus] = useState<'machine' | 'official'>(initial.status)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (!name.trim()) return setMessage(t('invalid'))
    setBusy(true)
    const res = await updateLocalization({ cardId, lang, name, text, flavorText, status })
    setBusy(false)
    if (!res.ok) return setMessage(t('invalid'))
    setMessage(res.warning ? t('reindexWarning') : t('saved'))
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('text')}</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('flavor')}</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={flavorText}
          onChange={(e) => setFlavor(e.target.value)}
        />
      </label>
      <div className="space-y-1">
        <span className="text-sm font-medium">{t('status')}</span>
        <Select value={status} onValueChange={(v) => setStatus(v as 'machine' | 'official')}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="machine">{t('statusMachine')}</SelectItem>
            <SelectItem value="official">{t('statusOfficial')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={busy}>{t('save')}</Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  )
}
```
Note: the `<Input>` gets an accessible name via the wrapping `<label>` text, which `getByLabelText` matches.

- [ ] **Step 4: Run the form test — expect PASS**

Run: `cd app/web && npx vitest run localization-form` → 2 passed.

- [ ] **Step 5: Implement the edit page `app/web/src/app/[locale]/card/[id]/edit/page.tsx`**

Server component: gate with `getSession` + `hasRequiredRole` → `notFound()`; load the card; pick the language from `?lang=` (default UI locale); seed the form; render a language switcher (existing langs + the missing routing locales as "add"). `export const dynamic = 'force-dynamic'` (session-dependent).
```tsx
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getDb } from '@/lib/db'
import { getCardById } from '@revelio/db'
import { LocalizationForm } from '@/components/localization-form'

export const dynamic = 'force-dynamic'

export default async function EditCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()

  const card = await getCardById(getDb(), id)
  if (!card) notFound()
  const t = await getTranslations('edit')

  const sp = await searchParams
  const lang = sp.lang && routing.locales.includes(sp.lang as (typeof routing.locales)[number]) ? sp.lang : locale
  const loc = card.localizations[lang]
  const initial = {
    name: loc?.name ?? '',
    text: loc?.text ?? '',
    flavorText: loc?.flavorText ?? '',
    status: (loc?.status === 'official' ? 'official' : 'machine') as 'machine' | 'official',
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-primary">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{card.name} · {id}</p>
      <nav className="mb-6 flex gap-2 text-sm">
        <span className="text-muted-foreground">{t('language')}:</span>
        {routing.locales.map((l) => (
          <Link
            key={l}
            href={`/card/${id}/edit?lang=${l}`}
            className={l === lang ? 'font-semibold underline' : 'text-muted-foreground underline'}
          >
            {l.toUpperCase()}
            {!card.localizations[l] ? ` (${t('addLanguage')})` : ''}
          </Link>
        ))}
      </nav>
      <LocalizationForm cardId={id} lang={lang} initial={initial} />
    </main>
  )
}
```

- [ ] **Step 6: Full web suite + build**

Run: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run` → all green.
Run: `cd app/web && npx next build` → "Compiled successfully"; `/[locale]/card/[id]/edit` present in the route list.

- [ ] **Step 7: Commit**

```bash
git add "app/web/src/app/[locale]/card/[id]/edit" app/web/src/components/localization-form.tsx "app/web/src/components/__tests__/localization-form.test.tsx"
git commit -m "feat(web): editor localization edit page + form (per language, add-language, non-fatal reindex)"
```

---

## Self-Review

**Spec coverage:**
- Editable fields name/text/flavor/status, status select → Task 4 schema + Task 6 form ✓
- Dedicated `/card/[id]/edit`, editor-gated → Task 6 (getSession + hasRequiredRole → notFound) ✓
- One language + switcher + add-language → Task 6 page (lang switcher shows "(Add a language)" for missing locales; upsert inserts) ✓
- Upsert with `origin:'user'` + `updated_at` → Task 2 ✓
- Per-card reindex, non-fatal → Task 1 (reindexCard) + Task 4 (try/catch → warning) ✓
- Scoped `MEILI_WRITE_KEY`, server-only, not master → Task 3 + env docs ✓
- Shared `buildCardDocument` (DRY across ingest + web) → Task 1 ✓
- Editor-only Edit button → Task 5 ✓
- Zod validation, errors surfaced → Task 4 (server) + Task 6 (form empty-name guard) ✓
- `@revelio/search` does not import `@revelio/db` → Task 1 (reindexCard takes data, not db); db imports the type one-way → Task 2 ✓
- Tests: upsert provenance/insert, buildCardDocument, reindexCard vs Meili, action authz/validation/non-fatal, edit-button visibility, form validation → Tasks 1,2,4,5,6 ✓
- Deferred items (rulings, adventure/match, images, audit, concurrency, promote-UI) → not built ✓

**Placeholder scan:** No TBD/TODO. Every code + test step is complete. The one intentional stray line in Task 2's test (`const [row]`) has an inline instruction to delete it; the real assertions read from `rows`.

**Type consistency:** `CardIndexData` shape identical across Task 1 (definition), Task 2 (`getCardIndexData` return), Task 4 (consumer). `SaveResult` union used in Task 4 + consumed by Task 6's form. `buildCardDocument(data, lang)` / `reindexCard(client, data)` signatures match between Task 1 and Tasks 2/4. `hasRequiredRole(role, 'editor')` matches the 4b-1 helper. `updateLocalization(input)` shape (`{cardId, lang, name, text, flavorText, status}`) identical in Tasks 4 + 6.

## Notes for later slices
Per the spec's deferred list: rulings editing, `adventure`/`match` jsonb, image upload, audit history, optimistic concurrency (this slice is last-write-wins), and the promote-user admin UI are each their own later slice.

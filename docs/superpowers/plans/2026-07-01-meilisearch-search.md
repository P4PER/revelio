# Meilisearch Search Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-text + faceted search over the cards: a driver-free `@revelio/search` package (Meili client, per-language index settings, typed `searchCards()`) plus an indexer in `@revelio/ingest` that builds per-language Meilisearch indexes from Postgres.

**Architecture:** `@revelio/search` holds everything the web needs (Meili client, index settings, document type, `searchCards()`) with no DB driver. The indexer lives in `@revelio/ingest` (which has `@revelio/db`): it reads cards + localizations + attributes from Postgres, builds one document set per language, and pushes to Meili. Meili runs as a standalone image (dev: a compose service); indexing runs inside the existing `ingest` one-shot after the Postgres load.

**Tech Stack:** Node 20, TypeScript (ESM), `meilisearch` (JS client), Meilisearch v1.x, Drizzle (existing), Vitest, Docker.

## Global Constraints

- Node **20+**, TypeScript, ESM (`"type": "module"`) everywhere.
- Config is **env-driven only — no hardcoded hosts**: `MEILI_HOST`, `MEILI_MASTER_KEY` (indexer/seed). Tests use `TEST_MEILI_HOST` (default `http://localhost:7700`) + `TEST_MEILI_KEY` (default `masterKey`).
- `@revelio/search` is **driver-free** — its only runtime dependency is `meilisearch` (NO `postgres`, `drizzle-orm`, or `@revelio/db`).
- **One Meilisearch index per language** present in `card_localizations`, named `cards-<lang>` (e.g. `cards-en`, `cards-de`).
- Indexing is **derived from Postgres** (the source of truth), never from `dist/`. The same indexer re-indexes after edits later.
- All prose, comments, identifiers, commit messages in **English**; commits follow **Conventional Commits**.
- Integration tests need a real Postgres and a real Meilisearch. Testcontainers is unreliable in this sandbox (per-start image re-pull) — use long-running containers + env: Postgres at `TEST_DATABASE_URL` (`postgres://revelio:revelio@localhost:55432/revelio`), Meili at `TEST_MEILI_HOST`/`TEST_MEILI_KEY`. Each test uses a unique index name for isolation.
- New code lives under `app/`.

## Test infrastructure (controller sets this up before execution)

```bash
# Postgres (already running from Plan 1): revelio-testpg on :55432
# Meilisearch:
docker run -d --name revelio-testmeili -e MEILI_MASTER_KEY=masterKey -e MEILI_NO_ANALYTICS=true \
  -p 7700:7700 getmeili/meilisearch:v1.10
export TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio"
export TEST_MEILI_HOST="http://localhost:7700"
export TEST_MEILI_KEY="masterKey"
```

## File Structure

```
app/
  package.json                     # workspaces += "search"
  search/                          # @revelio/search (driver-free)
    package.json                   # dep: meilisearch
    tsconfig.json
    src/
      client.ts                    # createMeiliClient(host, apiKey)
      documents.ts                 # SearchDocument type, cardsIndex(lang), CARD_INDEX_SETTINGS
      search.ts                    # CardFilters, buildFilter(), searchCards()
      index.ts                     # barrel
    test/
      helpers.ts                   # test client + unique index name
      documents.test.ts            # pure: index name + settings
      search.test.ts               # integration: search/typo/filter/sort vs Meili
  ingest/
    package.json                   # dep: @revelio/search
    Dockerfile                     # COPY search (Task 6)
    src/
      build-documents.ts           # buildDocuments(db): Postgres -> per-language docs
      index-cards.ts               # indexCards(db, client): build + push per language
      main.ts                      # runIngest indexes when MEILI_HOST is set
    test/
      build-documents.test.ts      # Postgres -> docs
      index-cards.test.ts          # Postgres -> Meili -> searchCards
  docker-compose.yml               # meilisearch service (Task 6)
  docker-compose.override.yml
```

---

### Task 1: `@revelio/search` package — client, document type, settings

**Files:**
- Modify: `app/package.json` (add `search` to `workspaces`)
- Create: `app/search/package.json`, `app/search/tsconfig.json`
- Create: `app/search/src/client.ts`, `app/search/src/documents.ts`, `app/search/src/index.ts`
- Test: `app/search/test/documents.test.ts`

**Interfaces:**
- Produces (from `@revelio/search`):
  - `createMeiliClient(host: string, apiKey: string): MeiliSearch`
  - `type SearchDocument = { id: string; setCode: string; setName: string; number: string; name: string; text: string | null; flavorText: string | null; types: string[]; subTypes: string[]; lesson: string | null; lessonColor: string | null; rarity: string | null; finish: string | null; legality: string | null; cost: number | null; isOfficial: boolean; imageFile: string | null }`
  - `cardsIndex(lang: string): string` → `cards-${lang}`
  - `CARD_INDEX_SETTINGS` (Meili settings object)

- [ ] **Step 1: Add `search` to the workspace**

Edit `app/package.json` `workspaces` to `["core", "db", "ingest", "search"]`.

- [ ] **Step 2: Create the package files**

`app/search/package.json`:
```json
{
  "name": "@revelio/search",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "meilisearch": "^0.45.0" }
}
```

`app/search/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Write the client**

`app/search/src/client.ts`:
```ts
import { MeiliSearch } from 'meilisearch'

export function createMeiliClient(host: string, apiKey: string): MeiliSearch {
  return new MeiliSearch({ host, apiKey })
}
```

- [ ] **Step 4: Write the document type + index config**

`app/search/src/documents.ts`:
```ts
import type { Settings } from 'meilisearch'

export type SearchDocument = {
  id: string
  setCode: string
  setName: string
  number: string
  name: string
  text: string | null
  flavorText: string | null
  types: string[]
  subTypes: string[]
  lesson: string | null
  lessonColor: string | null
  rarity: string | null
  finish: string | null
  legality: string | null
  cost: number | null
  isOfficial: boolean
  imageFile: string | null
}

export function cardsIndex(lang: string): string {
  return `cards-${lang}`
}

// name is first in searchableAttributes so name matches outrank text/flavor matches.
export const CARD_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['name', 'text', 'flavorText'],
  filterableAttributes: [
    'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality', 'cost', 'isOfficial',
  ],
  sortableAttributes: ['number', 'name', 'cost'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true },
}
```

- [ ] **Step 5: Write the barrel**

`app/search/src/index.ts`:
```ts
export * from './client.js'
export * from './documents.js'
export * from './search.js'
```
(`search.js` is added in Task 2; the export is declared now so the barrel is stable. If your tooling errors on the missing module before Task 2, create an empty `app/search/src/search.ts` with `export {}` now and fill it in Task 2.)

- [ ] **Step 6: Write the failing test**

`app/search/test/documents.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS } from '../src/documents.js'

describe('search documents config', () => {
  it('names the per-language index', () => {
    expect(cardsIndex('en')).toBe('cards-en')
    expect(cardsIndex('de')).toBe('cards-de')
  })

  it('exposes the required facets as filterable', () => {
    for (const f of ['setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality', 'cost', 'isOfficial']) {
      expect(CARD_INDEX_SETTINGS.filterableAttributes).toContain(f)
    }
  })

  it('searches name/text/flavor with name first', () => {
    expect(CARD_INDEX_SETTINGS.searchableAttributes?.[0]).toBe('name')
    expect(CARD_INDEX_SETTINGS.searchableAttributes).toEqual(['name', 'text', 'flavorText'])
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd app && npm install && cd search && npx vitest run`
Expected: FAIL — `Cannot find module '../src/documents.js'` (until Step 4 files exist / `search.ts` stub exists).

- [ ] **Step 8: Run test to verify it passes**

Run: `cd app/search && npx vitest run`
Expected: PASS (3 tests). No Meili needed — this is pure config.

- [ ] **Step 9: Commit**

```bash
git add app/package.json app/search
git commit -m "feat: add @revelio/search package with client and index config"
```

---

### Task 2: `searchCards()` + filter builder (integration vs Meilisearch)

**Files:**
- Create: `app/search/src/search.ts` (replaces the Task 1 stub)
- Create: `app/search/test/helpers.ts`
- Test: `app/search/test/search.test.ts`

**Interfaces:**
- Consumes: `SearchDocument`, `cardsIndex`, `CARD_INDEX_SETTINGS`, `createMeiliClient`.
- Produces:
  - `type CardFilters = { setCode?: string[]; types?: string[]; subTypes?: string[]; lesson?: string[]; rarity?: string[]; finish?: string[]; legality?: string[]; isOfficial?: boolean }`
  - `buildFilter(f: CardFilters): string[]`
  - `type SearchOptions = { filters?: CardFilters; sort?: string[]; page?: number; hitsPerPage?: number }`
  - `type SearchResult = { hits: SearchDocument[]; total: number; page: number; hitsPerPage: number }`
  - `searchCards(client: MeiliSearch, lang: string, query: string, opts?: SearchOptions): Promise<SearchResult>`
  - test helpers `testMeiliClient()`, `uniqueLang()`

- [ ] **Step 1: Write the test helper**

`app/search/test/helpers.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { createMeiliClient } from '../src/client.js'

export function testMeiliClient() {
  const host = process.env.TEST_MEILI_HOST ?? 'http://localhost:7700'
  const apiKey = process.env.TEST_MEILI_KEY ?? 'masterKey'
  return createMeiliClient(host, apiKey)
}

// A unique "lang" so cardsIndex() yields a fresh, isolated index per test.
export function uniqueLang(): string {
  return `test${randomUUID().replace(/-/g, '')}`
}
```

- [ ] **Step 2: Write the failing test**

`app/search/test/search.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS } from '../src/documents.js'
import type { SearchDocument } from '../src/documents.js'
import { searchCards, buildFilter } from '../src/search.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const uid = cardsIndex(lang)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', setName: 'Base', number: '1', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: ['wizard', 'gryffindor'], lesson: null, lessonColor: null, rarity: 'rare', finish: 'normal', legality: 'legal', cost: null, isOfficial: true, imageFile: 'HarryPotter.png' },
  { id: 'b', setCode: 'BS', setName: 'Base', number: '2', name: 'Flobberworm', text: 'A dull creature', flavorText: null, types: ['creature'], subTypes: [], lesson: null, lessonColor: null, rarity: 'common', finish: 'normal', legality: 'legal', cost: 2, isOfficial: true, imageFile: null },
  { id: 'c', setCode: 'QC', setName: 'Quidditch Cup', number: '1', name: 'The Snitch', text: 'Golden', flavorText: null, types: ['match'], subTypes: [], lesson: null, lessonColor: null, rarity: 'uncommon', finish: 'normal', legality: 'legal', cost: null, isOfficial: false, imageFile: null },
]

beforeAll(async () => {
  const s = await client.index(uid).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(uid).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(uid) })

describe('searchCards', () => {
  it('full-text matches on name', async () => {
    const r = await searchCards(client, lang, 'harry')
    expect(r.hits.map((h) => h.id)).toContain('a')
  })

  it('tolerates a typo', async () => {
    const r = await searchCards(client, lang, 'flobberwrom')
    expect(r.hits.map((h) => h.id)).toContain('b')
  })

  it('filters by a facet (array value)', async () => {
    const r = await searchCards(client, lang, '', { filters: { types: ['creature'] } })
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('filters by isOfficial boolean', async () => {
    const r = await searchCards(client, lang, '', { filters: { isOfficial: false } })
    expect(r.hits.map((h) => h.id)).toEqual(['c'])
  })

  it('builds an AND-of-facets filter array', () => {
    expect(buildFilter({ types: ['character'], rarity: ['rare'] })).toEqual([
      '(types = "character")',
      '(rarity = "rare")',
    ])
    expect(buildFilter({ isOfficial: true })).toEqual(['isOfficial = true'])
    expect(buildFilter({})).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app/search && TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run search`
Expected: FAIL — `Cannot find module '../src/search.js'` (or the stub exports nothing).

- [ ] **Step 4: Write the implementation**

`app/search/src/search.ts`:
```ts
import type { MeiliSearch } from 'meilisearch'
import { cardsIndex, type SearchDocument } from './documents.js'

export type CardFilters = {
  setCode?: string[]
  types?: string[]
  subTypes?: string[]
  lesson?: string[]
  rarity?: string[]
  finish?: string[]
  legality?: string[]
  isOfficial?: boolean
}

export type SearchOptions = {
  filters?: CardFilters
  sort?: string[]
  page?: number
  hitsPerPage?: number
}

export type SearchResult = {
  hits: SearchDocument[]
  total: number
  page: number
  hitsPerPage: number
}

const ARRAY_FACETS: (keyof CardFilters)[] = [
  'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality',
]

// Each returned string is AND-ed by Meilisearch; values within a facet are OR-ed.
export function buildFilter(f: CardFilters): string[] {
  const clauses: string[] = []
  for (const key of ARRAY_FACETS) {
    const values = f[key] as string[] | undefined
    if (values && values.length) {
      clauses.push(`(${values.map((v) => `${key} = ${JSON.stringify(v)}`).join(' OR ')})`)
    }
  }
  if (f.isOfficial !== undefined) clauses.push(`isOfficial = ${f.isOfficial}`)
  return clauses
}

export async function searchCards(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const page = opts.page ?? 1
  const hitsPerPage = opts.hitsPerPage ?? 20
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit: hitsPerPage,
    offset: (page - 1) * hitsPerPage,
  })
  return {
    hits: res.hits as SearchDocument[],
    total: res.estimatedTotalHits ?? res.hits.length,
    page,
    hitsPerPage,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/search && TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run search`
Expected: PASS (5 tests). (Meili's typo tolerance resolves `flobberwrom` → Flobberworm.)

- [ ] **Step 6: Commit**

```bash
git add app/search/src/search.ts app/search/test/helpers.ts app/search/test/search.test.ts
git commit -m "feat: add searchCards and facet filter builder"
```

---

### Task 3: Indexer — build documents from Postgres

**Files:**
- Modify: `app/ingest/package.json` (add `@revelio/search` dependency)
- Create: `app/ingest/src/build-documents.ts`
- Test: `app/ingest/test/build-documents.test.ts`

**Interfaces:**
- Consumes: `@revelio/db` (`cards`, `sets`, `cardLocalizations`, `cardTypes`, `cardSubTypes`, `lessons`, `DB`), `@revelio/search` (`SearchDocument`).
- Produces: `buildDocuments(db: DB): Promise<Record<string, SearchDocument[]>>` — a map of language → documents. Localization for a language falls back to the card's `defaultLanguage`.

- [ ] **Step 1: Add the search dependency**

Edit `app/ingest/package.json` `dependencies` to include `"@revelio/search": "*"`.

- [ ] **Step 2: Write the failing test**

`app/ingest/test/build-documents.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadSets } from '../src/load-sets.js'
import { loadAttributes } from '../src/load-attributes.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { loadLabels } from '../src/load-labels.js'
import { buildDocuments } from '../src/build-documents.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(here, 'fixtures/dataset')
const i18nDir = resolve(here, 'fixtures/i18n')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let byLang: Record<string, Awaited<ReturnType<typeof buildDocuments>>[string]>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadAttributes(ctx.db, cards, await loadLabels(i18nDir))
  await loadCards(ctx.db, cards)
  byLang = await buildDocuments(ctx.db)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('buildDocuments', () => {
  it('produces one document set per language', () => {
    expect(Object.keys(byLang).sort()).toEqual(['de', 'en'])
    expect(byLang.en).toHaveLength(3)
  })

  it('resolves the localization for the language', () => {
    const deanDe = byLang.de.find((d) => d.id === 'bs-1-dean-thomas')!
    expect(deanDe.name).toBe('Dean Thomas')
    expect(deanDe.text).toBe('Ziehe 3 Karten.')
  })

  it('falls back to defaultLanguage when a localization is missing', () => {
    // qc-1-the-snitch has only en; its de doc should fall back to en text
    const snitchDe = byLang.de.find((d) => d.id === 'qc-1-the-snitch')!
    expect(snitchDe.name).toBe('The Snitch')
  })

  it('includes types/subTypes from the junctions and the lesson color', () => {
    const flob = byLang.en.find((d) => d.id === 'bs-2-flobberworm')!
    expect(flob.types).toEqual(['creature'])
    const dean = byLang.en.find((d) => d.id === 'bs-1-dean-thomas')!
    expect(dean.subTypes.sort()).toEqual(['gryffindor', 'wizard'])
  })

  it('carries set metadata (name + isOfficial)', () => {
    const snitch = byLang.en.find((d) => d.id === 'qc-1-the-snitch')!
    expect(snitch.setName).toBe('Quidditch Cup')
    expect(snitch.isOfficial).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm install && cd ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run build-documents`
Expected: FAIL — `Cannot find module '../src/build-documents.js'`.

- [ ] **Step 4: Write the implementation**

`app/ingest/src/build-documents.ts`:
```ts
import type { DB } from '@revelio/db'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, lessons } from '@revelio/db'
import type { SearchDocument } from '@revelio/search'

function groupValues<T>(rows: T[], key: (r: T) => string, val: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k) ?? []
    list.push(val(r))
    m.set(k, list)
  }
  return m
}

export async function buildDocuments(db: DB): Promise<Record<string, SearchDocument[]>> {
  const [allCards, allSets, allLocs, typeLinks, subTypeLinks, allLessons] = await Promise.all([
    db.select().from(cards),
    db.select().from(sets),
    db.select().from(cardLocalizations),
    db.select().from(cardTypes),
    db.select().from(cardSubTypes),
    db.select().from(lessons),
  ])

  const setByCode = new Map(allSets.map((s) => [s.code, s]))
  const lessonColor = new Map(allLessons.map((l) => [l.code, l.color]))
  const typesByCard = groupValues(typeLinks, (t) => t.cardId, (t) => t.typeCode)
  const subTypesByCard = groupValues(subTypeLinks, (t) => t.cardId, (t) => t.subTypeCode)

  // cardId -> lang -> localization row
  const locByCard = new Map<string, Map<string, (typeof allLocs)[number]>>()
  const languages = new Set<string>()
  for (const loc of allLocs) {
    languages.add(loc.lang)
    const perCard = locByCard.get(loc.cardId) ?? new Map()
    perCard.set(loc.lang, loc)
    locByCard.set(loc.cardId, perCard)
  }

  const out: Record<string, SearchDocument[]> = {}
  for (const lang of languages) {
    out[lang] = allCards.map((c) => {
      const perCard = locByCard.get(c.id)
      const loc = perCard?.get(lang) ?? perCard?.get(c.defaultLanguage)
      const set = setByCode.get(c.setCode)
      return {
        id: c.id,
        setCode: c.setCode,
        setName: set?.name ?? c.setCode,
        number: c.number,
        name: loc?.name ?? c.name,
        text: loc?.text ?? null,
        flavorText: loc?.flavorText ?? null,
        types: typesByCard.get(c.id) ?? [],
        subTypes: subTypesByCard.get(c.id) ?? [],
        lesson: c.lesson,
        lessonColor: c.lesson ? (lessonColor.get(c.lesson) ?? null) : null,
        rarity: c.rarity,
        finish: c.finish,
        legality: c.legality,
        cost: c.cost,
        isOfficial: set?.isOfficial ?? false,
        imageFile: loc?.imageFile ?? null,
      }
    })
  }
  return out
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run build-documents`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add app/ingest/package.json app/ingest/src/build-documents.ts app/ingest/test/build-documents.test.ts
git commit -m "feat: build per-language search documents from Postgres"
```

---

### Task 4: Indexer — push documents to Meilisearch

**Files:**
- Create: `app/ingest/src/index-cards.ts`
- Test: `app/ingest/test/index-cards.test.ts`

**Interfaces:**
- Consumes: `buildDocuments`, `@revelio/search` (`cardsIndex`, `CARD_INDEX_SETTINGS`, `searchCards`), `MeiliSearch` client, `DB`.
- Produces: `indexCards(db: DB, client: MeiliSearch): Promise<string[]>` — (re)builds each language index (settings + documents), returns the list of languages indexed.

- [ ] **Step 1: Write the failing test**

`app/ingest/test/index-cards.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { searchCards, cardsIndex, createMeiliClient } from '@revelio/search'
import { loadSets } from '../src/load-sets.js'
import { loadAttributes } from '../src/load-attributes.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { loadLabels } from '../src/load-labels.js'
import { indexCards } from '../src/index-cards.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(here, 'fixtures/dataset')
const i18nDir = resolve(here, 'fixtures/i18n')

const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let langs: string[]
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadAttributes(ctx.db, cards, await loadLabels(i18nDir))
  await loadCards(ctx.db, cards)
  langs = await indexCards(ctx.db, client)
}, 120_000)
afterAll(async () => {
  for (const lang of langs) await client.deleteIndex(cardsIndex(lang)).catch(() => {})
  await ctx.stop()
})

describe('indexCards', () => {
  it('indexes every language', () => {
    expect(langs.sort()).toEqual(['de', 'en'])
  })

  it('makes cards searchable in the en index', async () => {
    const r = await searchCards(client, 'en', 'dean')
    expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  })

  it('returns the localized name in the de index', async () => {
    const r = await searchCards(client, 'de', 'ziehe')
    expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  })

  it('supports facet filtering after indexing', async () => {
    const r = await searchCards(client, 'en', '', { filters: { types: ['creature'] } })
    expect(r.hits.map((h) => h.id)).toEqual(['bs-2-flobberworm'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run index-cards`
Expected: FAIL — `Cannot find module '../src/index-cards.js'`.

- [ ] **Step 3: Write the implementation**

`app/ingest/src/index-cards.ts`:
```ts
import type { MeiliSearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import { cardsIndex, CARD_INDEX_SETTINGS } from '@revelio/search'
import { buildDocuments } from './build-documents.js'

export async function indexCards(db: DB, client: MeiliSearch): Promise<string[]> {
  const byLang = await buildDocuments(db)
  const langs = Object.keys(byLang)
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    // updateSettings auto-creates the index if it does not exist.
    const s = await index.updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await index.addDocuments(byLang[lang], { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }
  return langs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run index-cards`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/ingest/src/index-cards.ts app/ingest/test/index-cards.test.ts
git commit -m "feat: index per-language cards into Meilisearch"
```

---

### Task 5: Wire indexing into the seed entrypoint

**Files:**
- Modify: `app/ingest/src/main.ts`
- Modify: `app/ingest/test/main.test.ts`

**Interfaces:**
- Consumes: `indexCards`, `createMeiliClient` (from `@revelio/search`).
- Produces: `runIngest` gains optional `meiliHost?` / `meiliKey?`; when `meiliHost` is set it indexes after `loadCards`. CLI reads `MEILI_HOST` / `MEILI_MASTER_KEY` and indexes when `MEILI_HOST` is present (so the seed still works with no search configured).

- [ ] **Step 1: Update the test**

Add to `app/ingest/test/main.test.ts` a test that runs the seed with Meili configured and confirms search works. Replace the file's `runIngest` option objects to include the meili env, and add:
```ts
import { searchCards, cardsIndex, createMeiliClient } from '@revelio/search'

const meiliHost = process.env.TEST_MEILI_HOST ?? 'http://localhost:7700'
const meiliKey = process.env.TEST_MEILI_KEY ?? 'masterKey'
const meili = createMeiliClient(meiliHost, meiliKey)

// ... existing beforeAll/tests, but pass meiliHost/meiliKey into runIngest:
//   await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir, meiliHost, meiliKey })

it('makes the seeded cards searchable', async () => {
  await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir, meiliHost, meiliKey })
  const r = await searchCards(meili, 'en', 'dean')
  expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  await meili.deleteIndex(cardsIndex('en')).catch(() => {})
  await meili.deleteIndex(cardsIndex('de')).catch(() => {})
})
```
Note: because this test indexes into the shared `cards-en`/`cards-de` names (not a unique lang), run it in isolation or ensure it cleans up (the `deleteIndex` calls above). Keep the existing count/no-op tests unchanged except for threading `meiliHost`/`meiliKey` — passing them is harmless for those.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run main`
Expected: FAIL — `runIngest` doesn't accept `meiliHost` / doesn't index yet.

- [ ] **Step 3: Update the implementation**

`app/ingest/src/main.ts`:
```ts
import { createClient, runMigrations } from '@revelio/db'
import { createMeiliClient } from '@revelio/search'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadAttributes } from './load-attributes.js'
import { loadCards } from './load-cards.js'
import { loadLabels } from './load-labels.js'
import { indexCards } from './index-cards.js'

export async function runIngest(opts: {
  databaseUrl: string
  dataDir: string
  i18nDir: string
  meiliHost?: string
  meiliKey?: string
}): Promise<{ sets: number; cards: number }> {
  const { db, sql } = createClient(opts.databaseUrl)
  try {
    await runMigrations(db)
    const { sets, cards } = await loadDist(opts.dataDir)
    const labels = await loadLabels(opts.i18nDir)
    await loadSets(db, sets)
    await loadAttributes(db, cards, labels)
    await loadCards(db, cards)
    if (opts.meiliHost) {
      const meili = createMeiliClient(opts.meiliHost, opts.meiliKey ?? '')
      await indexCards(db, meili)
    }
    return { sets: sets.length, cards: cards.length }
  } finally {
    await sql.end()
  }
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  const dataDir = process.env.DATA_DIR ?? '/data'
  const i18nDir = process.env.I18N_DIR ?? '/i18n'
  const meiliHost = process.env.MEILI_HOST
  const meiliKey = process.env.MEILI_MASTER_KEY
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  runIngest({ databaseUrl, dataDir, i18nDir, meiliHost, meiliKey })
    .then((r) => {
      const search = meiliHost ? ' + search indexed' : ''
      console.log(`seed complete: ${r.sets} sets, ${r.cards} cards imported (additive)${search}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run main`
Expected: PASS.

- [ ] **Step 5: Run the whole ingest + search + core suites**

Run:
```bash
cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run && \
cd ../search && TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" npx vitest run && \
cd ../core && npx vitest run
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/src/main.ts app/ingest/test/main.test.ts
git commit -m "feat: index into Meilisearch during the seed when MEILI_HOST is set"
```

---

### Task 6: Meilisearch service + Dockerfile + real-data verification

**Files:**
- Modify: `app/ingest/Dockerfile` (COPY the `search` package)
- Modify: `app/docker-compose.yml` (add `meilisearch` service + ingest `MEILI_*` env)
- Modify: `app/docker-compose.override.yml` (nothing required, but confirm ingest still builds)

**Interfaces:**
- Consumes: `runIngest` CLI (reads `MEILI_HOST` / `MEILI_MASTER_KEY`).
- Produces: a dev `meilisearch` service and an ingest image that includes `@revelio/search`, indexing the real dataset.

- [ ] **Step 1: Update the ingest Dockerfile to include the search package**

`app/ingest/Dockerfile` — add the `search` manifest + source alongside `core`/`db` (both the manifest COPY before `npm install` and the source COPY after):
```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
RUN npm install

COPY tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY ingest ./ingest

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
CMD ["npx", "tsx", "ingest/src/main.ts"]
```

- [ ] **Step 2: Add the meilisearch service + wire ingest env**

`app/docker-compose.yml` — add the service and the `MEILI_*` env on `ingest`:
```yaml
  meilisearch:
    image: getmeili/meilisearch:v1.10
    environment:
      MEILI_MASTER_KEY: masterKey
      MEILI_NO_ANALYTICS: "true"
    volumes:
      - meili:/meili_data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--spider", "http://localhost:7700/health"]
      interval: 5s
      timeout: 5s
      retries: 10
```
Add to the `ingest` service's `environment:` block:
```yaml
      MEILI_HOST: http://meilisearch:7700
      MEILI_MASTER_KEY: masterKey
```
Add `meilisearch` to the `ingest` `depends_on` with `condition: service_healthy`, and add `meili: {}` to the `volumes:` block.

- [ ] **Step 3: Build and run the seed against the real dataset**

Run:
```bash
cd app && docker compose build ingest
docker compose up -d postgres meilisearch
docker compose run --rm -T ingest
```
Expected: logs `seed complete: 14 sets, 1035 cards imported (additive) + search indexed` and exits 0.

- [ ] **Step 4: Verify search works on the real index**

Run:
```bash
curl -s -X POST 'http://localhost:7700/indexes/cards-en/search' \
  -H 'Authorization: Bearer masterKey' -H 'Content-Type: application/json' \
  --data '{"q":"harry","limit":3}' | head -c 600
echo
curl -s -X POST 'http://localhost:7700/indexes/cards-en/search' \
  -H 'Authorization: Bearer masterKey' -H 'Content-Type: application/json' \
  --data '{"q":"","filter":"types = \"creature\"","limit":1}' | head -c 300
```
Expected: the first returns hits whose `name` contains "Harry"; the second returns a creature card (facet filter works). Also confirm `cards-de` exists:
```bash
curl -s 'http://localhost:7700/indexes' -H 'Authorization: Bearer masterKey' | tr ',' '\n' | grep cards-
```
Expected: both `cards-en` and `cards-de`.

- [ ] **Step 5: Tear down**

Run: `cd app && docker compose down -v`
Expected: containers + volumes removed.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/Dockerfile app/docker-compose.yml
git commit -m "feat: add meilisearch service and index the real dataset in the seed"
```

---

## Self-Review

**Spec coverage (Search section of the design):**
- Driver-free `@revelio/search` (Meili client, index settings, doc type, `searchCards()`) → Tasks 1, 2 ✓
- Indexer in `@revelio/ingest` reading from Postgres → Tasks 3, 4 ✓
- One index per language present in `card_localizations` (`cards-<lang>`) → Tasks 3, 4 ✓
- Document fields (searchable/filterable/sortable/display) → Task 1 (settings) + Task 3 (fields) ✓
- Localization resolution with `defaultLanguage` fallback → Task 3 ✓
- Index build runs inside the `ingest` one-shot when `MEILI_HOST` set → Task 5 ✓
- Meili as standalone image (dev compose service) → Task 6 ✓
- Tested `searchCards()` (full-text, typo, facet) → Tasks 2, 4 ✓
- Search-only key for the web → deferred to Plan 4/5 (web) ✓
- Steady-state re-index on in-app writes → deferred to Plan 4 (authoring) ✓

**Placeholder scan:** No TBD/TODO. The `search.ts` stub note in Task 1 Step 5 is an explicit, bounded instruction (create it empty, fill in Task 2), not a placeholder in shipped code. `masterKey` is a dev/test key; prod uses env (`MEILI_MASTER_KEY`) and the web will use a search-only key (Plan 4/5).

**Type consistency:** `SearchDocument` (Task 1) is produced by `buildDocuments` (Task 3) and returned by `searchCards` (Task 2); fields match. `cardsIndex`/`CARD_INDEX_SETTINGS` (Task 1) used by `searchCards` (Task 2) and `indexCards` (Task 4). `indexCards(db, client)` (Task 4) called by `runIngest` (Task 5). `buildDocuments(db)` return type `Record<string, SearchDocument[]>` consistent across Tasks 3–4.

## Notes for later plans

- **Plan 4 (web + authoring):** the web imports `@revelio/search` (`searchCards`) with a **search-only** Meili key; in-app edits call `indexCards` (or a per-card variant) to re-index; a `localizedAttributes`/synonyms pass can improve per-language relevance.
- **Plan 5 (CI/prod):** Meili runs as a standalone image or pre-deployed; the `revelio-ingest` image already indexes when `MEILI_HOST` is set; provision a search-only API key; back up the Meili volume or treat it as rebuildable from Postgres (`indexCards`).

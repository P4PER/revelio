# Name-First Search Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every card whose **name** matches the query rank above every card that
only matches in `text` or `flavorText`, so searching `Harry Potter` stops returning
name hits, then flavor hits, then name hits again.

**Architecture:** Meilisearch's `words` rule outranks the configured `rankingRules`, so
this cannot be fixed in `CARD_INDEX_SETTINGS`. Instead, a read that ranks by relevance
(non-empty query, no explicit sort) goes out as a **federated multi-search**: a
`name`-only query weighted 10 alongside the unrestricted one. Meilisearch merges them by
weighted score and keeps each document's best, which lifts the whole name group above the
whole text/flavor group while leaving ranking inside each group alone. One private helper
in `app/search/src/search.ts` serves both the paged read and the id window, so a result
grid and the card page's prev/next walk cannot disagree about the order.

**Tech Stack:** TypeScript, Meilisearch 1.10 (`meilisearch` JS client 0.45), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-name-first-search-ranking-design.md`

**Branch:** `fix/name-first-search-ranking` (already created off `main`).

## Global Constraints

- **Never run `npm test` from `app/`.** `ingest/test/main.test.ts` deletes the `cards-en`
  and `cards-de` indexes from the dev Meilisearch. Run per workspace:
  `npm test -w @revelio/search`, `npm test -w web`, `npm test -w @revelio/bot`.
- **`node`/`npm` are not on the default PATH** - prefix with `/usr/local/bin`, and `gh`
  and `gpg` with `/opt/homebrew/bin`.
- `app/search/test/*.test.ts` and `web/src/lib/server/__tests__/search-client.test.ts`
  need a live Meilisearch. They read `TEST_MEILI_HOST` / `TEST_MEILI_KEY`, defaulting to
  `http://localhost:7700` with `masterKey`. `docker compose up` from `app/` provides it.
  Each creates and deletes its own randomly named index and never touches `cards-*`.
- **Meilisearch floor is 1.10.** Federated multi-search does not exist below it.
  `docker-compose.yml` and `.github/workflows/ci.yml` both pin
  `getmeili/meilisearch:v1.10`.
- **Do not touch `CARD_INDEX_SETTINGS`.** Nothing here needs an ingest run, a reindex or
  a migration. Its `rankingRules` stay `['words', 'typo', 'proximity', 'attribute',
  'sort', 'exactness']` - the spec records why reordering them does nothing.
- **Web test files are not typechecked** (`tsconfig.typecheck.json` excludes them), so a
  wrong fixture shape will not fail `npm run typecheck`.
- Types: `type` aliases only, never `interface`. Type-only imports use `import type` or
  the inline `type` form. Declaration order within a file: types -> constants ->
  unexported helpers -> exported functions.
- Code comments are ASCII only - no em-dashes, no unicode arrows.
- Commits are Conventional Commits, `type(scope): subject`, imperative, lower case, no
  trailing period, no tool attribution. Signing needs
  `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

---

### Task 1: Teach every Meilisearch stub about federated reads

Every fake Meilisearch in the tree implements `index().search` and nothing else. The
moment Task 2 lands, each one throws `client.multiSearch is not a function` on any
non-empty query. Doing this first keeps every commit green.

Each stub gains a `multiSearch` that **delegates to the same `search` mock**, passing the
unrestricted sub-query (the last one) and folding the federated window back in. That
keeps call counts and every existing `toHaveBeenCalledWith` assertion true whichever
transport the read used, so this task changes no assertions at all.

**Files:**
- Modify: `app/search/src/__tests__/search.test.ts:11-20` (the `fakeClient` factory)
- Modify: `app/bot/test/cards.test.ts:9-22` (`stubMeili`)
- Modify: `app/bot/test/suggest.test.ts:9-14` (`stubMeili`)
- Modify: `app/bot/test/commands.test.ts:22-30, 138, 144-151, 179-185` (three stub
  sites plus one inline)
- Modify: `app/web/src/lib/__tests__/card-neighbors.test.ts:12-21` (`fakeClient`)

**Interfaces:**
- Consumes: nothing new.
- Produces: every stub client in the tree answers
  `multiSearch({ federation: { offset, limit }, queries: [...] })` with
  `{ hits, estimatedTotalHits }`, having recorded the read in the same place a plain
  `search` would.

- [ ] **Step 1: Confirm the suites are green before touching them**

Run, from `app/`:

```bash
/usr/local/bin/npm test -w @revelio/search && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm test -w web
```

Expected: all three PASS. Note the test counts - Task 2 must not lose any.

- [ ] **Step 2: Add `multiSearch` to the search package's `fakeClient`**

In `app/search/src/__tests__/search.test.ts`, replace the `fakeClient` factory with:

```ts
// Minimal fake Meili client that records the search options it was called with.
// A relevance read goes out as a federated multi-search rather than an index search,
// so the stub answers both and records them the same way: the window from `federation`
// merged onto the unrestricted sub-query. `queries` is kept as well, for the
// assertions that are about the federation itself.
function fakeClient(captured: Record<string, unknown>, hits: { id: string }[] = []) {
  const result = { hits, estimatedTotalHits: hits.length }
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        Object.assign(captured, opts, { federated: false })
        return result
      },
    }),
    multiSearch: async (req: {
      federation: Record<string, unknown>
      queries: Record<string, unknown>[]
    }) => {
      const unrestricted = req.queries[req.queries.length - 1]
      Object.assign(captured, unrestricted, req.federation, {
        federated: true, queries: req.queries,
      })
      return {
        // Meilisearch stamps its merge bookkeeping onto every federated hit; the
        // read under test has to strip it before the hits reach a caller.
        hits: hits.map((h) => ({ ...h, _federation: { indexUid: 'x', queriesPosition: 0, weightedRankingScore: 1 } })),
        estimatedTotalHits: hits.length,
      }
    },
  } as never
}
```

- [ ] **Step 3: Run the search package tests**

Run: `/usr/local/bin/npm test -w @revelio/search`
Expected: PASS, same count as Step 1. Nothing calls `multiSearch` yet.

- [ ] **Step 4: Add `multiSearch` to `app/bot/test/cards.test.ts`**

Replace the body of `stubMeili` with:

```ts
function stubMeili(hits: unknown[], estimatedTotalHits: number) {
  const search = vi.fn().mockImplementation(
    async (_query: string, opts: { attributesToRetrieve?: string[] } = {}) => {
      const keep = opts.attributesToRetrieve
      if (!keep) return { hits, estimatedTotalHits }
      const projected = hits.map((hit) => Object.fromEntries(
        Object.entries(hit as Record<string, unknown>).filter(([key]) => keep.includes(key)),
      ))
      return { hits: projected, estimatedTotalHits }
    },
  )
  const index = vi.fn().mockReturnValue({ search })
  const multiSearch = vi.fn().mockImplementation(federatedToSearch(search))
  return { client: { index, multiSearch } as unknown as MeiliSearch, index, search, multiSearch }
}
```

and add this helper above it, right under the existing comment block:

```ts
// A relevance read leaves as a federated multi-search: a name-only query weighted
// against the unrestricted one. The stub cannot rank, so it runs only the unrestricted
// query - the one a federated read draws its full hit list from - through the same
// `search` mock, with the federated window folded back in. Assertions below therefore
// read the same call whichever transport the read used.
function federatedToSearch(search: ReturnType<typeof vi.fn>) {
  return async (req: {
    federation: Record<string, unknown>
    queries: Record<string, unknown>[]
  }) => {
    const { indexUid: _indexUid, q, federationOptions: _opts, ...rest } =
      req.queries[req.queries.length - 1] as Record<string, unknown> & { q: string }
    return search(q, { ...rest, ...req.federation })
  }
}
```

- [ ] **Step 5: Add `multiSearch` to `app/bot/test/suggest.test.ts`**

Add the same `federatedToSearch` helper (copy it verbatim from Step 4 - the two files
do not share a module) and extend `stubMeili`:

```ts
function stubMeili(hits: unknown[]) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: hits.length })
  const getDocument = vi.fn()
  const index = vi.fn().mockReturnValue({ search, getDocument })
  const multiSearch = vi.fn().mockImplementation(federatedToSearch(search))
  return { client: { index, multiSearch } as unknown as MeiliSearch, index, search, getDocument }
}
```

- [ ] **Step 6: Add `multiSearch` to the three stub sites in `app/bot/test/commands.test.ts`**

Add the same `federatedToSearch` helper verbatim, then a single factory the three sites
share, directly below it:

```ts
// Both transports over one `search` mock - see federatedToSearch.
function fakeMeili(search: ReturnType<typeof vi.fn>) {
  return { index: () => ({ search }), multiSearch: federatedToSearch(search) }
}
```

Then rewrite the three sites to use it:

```ts
function fakeDeps(hits: unknown[], total: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: total })
  return {
    meili: fakeMeili(search),
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}
```

```ts
function fastPathDeps(search: unknown) {
  return {
    meili: fakeMeili(search as ReturnType<typeof vi.fn>),
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}
```

In the `'answers with an empty list rather than throwing when Meilisearch fails'` test,
the inline stub becomes:

```ts
    const deps = { meili: fakeMeili(vi.fn().mockRejectedValue(new Error('down'))) }
```

In the `'/search set filter'` test, the inline `deps` object becomes:

```ts
    const deps = {
      meili: fakeMeili(search),
      db: {},
      sets: { name: vi.fn(), all: vi.fn() },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
```

- [ ] **Step 7: Run the bot tests**

Run: `/usr/local/bin/npm test -w @revelio/bot`
Expected: PASS, same count as Step 1. In particular
`expect(search).toHaveBeenCalledTimes(2)` in `/card id fast path` still holds - the
delegate runs exactly one `search` per read.

- [ ] **Step 8: Add `multiSearch` to `app/web/src/lib/__tests__/card-neighbors.test.ts`**

Replace the `fakeClient` factory with:

```ts
// Fake client that records every search it was asked to run. A neighbour walk with a
// query federates, so the stub answers `multiSearch` too and records the same shape:
// the federated window merged onto the unrestricted sub-query.
function fakeClient(calls: Record<string, unknown>[], hits: { id: string }[] = []) {
  const result = { hits, estimatedTotalHits: hits.length }
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        calls.push(opts)
        return result
      },
    }),
    multiSearch: async (req: {
      federation: Record<string, unknown>
      queries: Record<string, unknown>[]
    }) => {
      const { indexUid: _indexUid, q: _q, federationOptions: _opts, ...rest } =
        req.queries[req.queries.length - 1]
      calls.push({ ...rest, ...req.federation })
      return result
    },
  } as unknown as MeiliSearch
}
```

The `'degrades to no neighbors when the search fails'` test builds its own `down` client
inline; give it a throwing `multiSearch` as well:

```ts
    const down = {
      index: () => ({ search: async () => { throw new Error('meilisearch is down') } }),
      multiSearch: async () => { throw new Error('meilisearch is down') },
    } as unknown as MeiliSearch
```

- [ ] **Step 9: Run the web tests**

Run: `/usr/local/bin/npm test -w web`
Expected: PASS, same count as Step 1.

- [ ] **Step 10: Lint and typecheck**

Run, from `app/`:

```bash
/usr/local/bin/npm run lint && /usr/local/bin/npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 11: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/search/src/__tests__/search.test.ts app/bot/test/cards.test.ts \
  app/bot/test/suggest.test.ts app/bot/test/commands.test.ts \
  app/web/src/lib/__tests__/card-neighbors.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "test: teach the meilisearch stubs about federated reads"
```

---

### Task 2: Rank name matches above text and flavor matches

**Files:**
- Modify: `app/search/src/search.ts` (imports, new types/constant/helpers, `pagedSearch`,
  `searchCardIds`)
- Test: `app/search/test/search.test.ts` (live Meilisearch - the ranking itself)
- Test: `app/search/src/__tests__/search.test.ts` (fake client - the request shape)
- Modify: `CLAUDE.md` (the `@revelio/search` bullet)

**Interfaces:**
- Consumes: `cardsIndex` and `buildFilter`, both already in scope in `search.ts`.
- Produces (all private to `app/search/src/search.ts`; no exported signature changes):
  - `const NAME_MATCH_WEIGHT = 10`
  - `type ReadParams = { filter: string[]; sort?: string[]; attributesToRetrieve?: string[] }`
  - `type HitWindow = { hits: unknown[]; total: number }`
  - `function ranksByRelevance(query: string, sort?: string[]): boolean`
  - `function stripFederation(hit: Record<string, unknown>): Record<string, unknown>`
  - `function readWindow(client: MeiliSearch, lang: string, query: string, params: ReadParams, window: { offset: number; limit: number }): Promise<HitWindow>`
  - `searchCards`, `searchCardFields`, `searchCardSummaries`, `searchCardSuggestions` and
    `searchCardIds` keep their current signatures and return types exactly.

- [ ] **Step 1: Write the failing ranking test**

Append to `app/search/test/search.test.ts`. It builds its own index, the way the
`'sorting by card number'` describe above it already does:

```ts
describe('name matches rank above text and flavor matches', () => {
  const rankLang = uniqueLang()
  const rankUid = cardsIndex(rankLang)
  // 'exact' matches both query terms in its name. 'partial' matches one, also in the
  // name. 'flavor' matches both, but only in flavor text. Meilisearch's `words` rule
  // ranks 'flavor' above 'partial' on its own, which is the bug: a name search comes
  // back as name hit, flavor hit, name hit.
  const rankDocs: SearchDocument[] = [
    { id: 'exact', setCode: 'BS', number: '1', numberSort: '0:000001', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
    { id: 'partial', setCode: 'BS', number: '2', numberSort: '0:000002', name: 'Harry Hunting', text: 'Chase him down', flavorText: null, types: ['adventure'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
    { id: 'flavor', setCode: 'BS', number: '3', numberSort: '0:000003', name: 'Meeting on the Train', text: 'Draw a card', flavorText: 'Harry Potter sat down opposite Ron.', types: ['adventure'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
  ]

  beforeAll(async () => {
    const s = await client.index(rankUid).updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await client.index(rankUid).addDocuments(rankDocs, { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }, 60_000)
  afterAll(async () => { await client.deleteIndex(rankUid) })

  it('puts a partial name match above a whole-query flavor match', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })

  it('keeps the whole-query name match at the top of the name group', async () => {
    const r = await searchCards(client, rankLang, 'harry')
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })

  it('reports the same total as an unfederated read of the same query', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.total).toBe(3)
  })

  it('reads the same order through the id window the neighbour walk uses', async () => {
    const r = await searchCardIds(client, rankLang, 'harry potter', { offset: 0, limit: 3 })
    expect(r.ids).toEqual(['exact', 'partial', 'flavor'])
  })

  it('pages the merged list, rather than restarting it per group', async () => {
    const r = await searchCards(client, rankLang, 'harry potter', { page: 2, hitsPerPage: 2 })
    expect(r.hits.map((h) => h.id)).toEqual(['flavor'])
  })

  it('hands back hits without meilisearch merge bookkeeping on them', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.hits[0]).not.toHaveProperty('_federation')
  })

  it('leaves an explicit sort in charge of the order', async () => {
    const r = await searchCards(client, rankLang, 'harry potter', { sort: ['name:asc'] })
    // Not the name group first: with a sort the read is not federated at all, so this
    // is plain Meilisearch, where `sort` sits below `words` in the ranking rules and
    // only breaks ties inside a matched-term bucket.
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'flavor', 'partial'])
  })

  it('leaves a browse read in card-number order', async () => {
    const r = await searchCards(client, rankLang, '', { sort: ['numberSort:asc'] })
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })
})
```

`searchCardIds` is not imported by that file yet - extend the existing import:

```ts
import { searchCards, searchCardIds, buildFilter } from '../src/search.js'
```

- [ ] **Step 2: Run it and watch it fail**

Run, from `app/`: `/usr/local/bin/npm test -w @revelio/search -- search.test.ts -t "name matches rank above"`
Expected: FAIL. `'puts a partial name match above a whole-query flavor match'` returns
`['exact', 'flavor', 'partial']`. The last two tests (explicit sort, browse read) should
already PASS - they pin behaviour that must survive.

If the whole file errors instead, Meilisearch is not running: `docker compose up -d` from
`app/`.

- [ ] **Step 3: Write the failing request-shape tests**

Append to `app/search/src/__tests__/search.test.ts`:

```ts
describe('relevance reads', () => {
  it('federates a name-restricted query so name matches outrank text matches', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { page: 2, hitsPerPage: 24 })
    expect(captured.federated).toBe(true)
    const queries = captured.queries as Record<string, unknown>[]
    expect(queries).toHaveLength(2)
    expect(queries[0]).toMatchObject({
      indexUid: 'cards-en', q: 'harry', attributesToSearchOn: ['name'],
      federationOptions: { weight: 10 },
    })
    expect(queries[1]).toMatchObject({ indexUid: 'cards-en', q: 'harry' })
    expect(queries[1].attributesToSearchOn).toBeUndefined()
    expect((queries[1].federationOptions as { weight: number }).weight).toBe(1)
  })

  it('reads its window through the federation, not the sub-queries', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { page: 2, hitsPerPage: 24 })
    expect(captured.offset).toBe(24)
    expect(captured.limit).toBe(24)
  })

  it('applies the caller filters to both sub-queries', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { filters: { types: ['creature'] } })
    const queries = captured.queries as { filter: string[] }[]
    expect(queries[0].filter).toEqual(['(types = "creature")'])
    expect(queries[1].filter).toEqual(['(types = "creature")'])
  })

  it('projects both sub-queries, so a federated hit is no wider than a plain one', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardFields(fakeClient(captured), 'en', 'harry', ['id', 'name'])
    const queries = captured.queries as { attributesToRetrieve: string[] }[]
    expect(queries[0].attributesToRetrieve).toEqual(['id', 'name'])
    expect(queries[1].attributesToRetrieve).toEqual(['id', 'name'])
  })

  it('strips the merge bookkeeping meilisearch stamps on a federated hit', async () => {
    const res = await searchCards(fakeClient({}, [{ id: 'a' }]), 'en', 'harry')
    expect(res.hits[0]).not.toHaveProperty('_federation')
    expect(res.hits[0]).toMatchObject({ id: 'a' })
  })

  it('federates the id window too, so neighbours walk the order the grid showed', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardIds(fakeClient(captured), 'en', 'harry', { offset: 3, limit: 3 })
    expect(captured.federated).toBe(true)
    expect(captured.offset).toBe(3)
    const queries = captured.queries as { attributesToRetrieve: string[] }[]
    expect(queries[0].attributesToRetrieve).toEqual(['id'])
  })

  it('leaves an explicit sort unfederated, so the sort is not overruled', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { sort: ['name:asc'] })
    expect(captured.federated).toBe(false)
  })

  it('leaves a browse read unfederated, where both sub-queries would tie', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', {})
    expect(captured.federated).toBe(false)
  })

  it('treats a whitespace-only query as a browse read', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '   ', {})
    expect(captured.federated).toBe(false)
  })
})
```

`searchCardIds` and `searchCardFields` are already imported at the top of that file.

- [ ] **Step 4: Run them and watch them fail**

Run: `/usr/local/bin/npm test -w @revelio/search -- __tests__/search.test.ts -t "relevance reads"`
Expected: FAIL - `captured.federated` is `false` for every case, because nothing
federates yet. The last two (`explicit sort`, `browse read`) PASS already.

- [ ] **Step 5: Extend the imports in `app/search/src/search.ts`**

```ts
import type { FederatedMultiSearchParams, MeiliSearch, SearchResponse } from 'meilisearch'
import { cardsIndex, type SearchDocument } from './documents'
```

- [ ] **Step 6: Add the types**

Append to the type block at the top of the file, after `CardSummaryResult`:

```ts
// What a read asks of one index, minus the window it reads. Shared by the plain read
// and by each federated sub-query, which must be identical in everything but the
// attributes they search.
type ReadParams = {
  filter: string[]
  sort?: string[]
  attributesToRetrieve?: string[]
}

// One window of hits, however the read had to be run.
type HitWindow = { hits: unknown[]; total: number }
```

- [ ] **Step 7: Add the constant**

Next to `SUMMARY_FIELDS` and `ARRAY_FACETS`:

```ts
// Meilisearch ranks a document that matched every query term above one that matched
// fewer, whatever rankingRules says: the term-dropping happens while the query graph is
// resolved, above the rules. So "Harry Potter" puts every card whose flavor text holds
// both words above "Harry Hunting", whose name holds one, and a name search reads as
// name hits, then flavor hits, then name hits again.
//
// Federating a name-restricted query against the unrestricted one fixes what the rules
// cannot express. Meilisearch merges the two by rankingScore * weight and keeps each
// document's best, so weighting the name query lifts every name match above every text
// or flavor match, while ranking inside each group stays Meilisearch's own. Scores are
// bounded by 1, which is what makes 10 a separation rather than a lucky margin.
const NAME_MATCH_WEIGHT = 10
```

- [ ] **Step 8: Add the three helpers above `pagedSearch`**

```ts
// Relevance decides the order only when there is something to rank and the caller has
// not asked for an explicit one. An explicit sort must outrank the name-first grouping,
// and an empty query matches every document in both sub-queries at the same score,
// which would replace the sort order with an arbitrary one.
function ranksByRelevance(query: string, sort?: string[]): boolean {
  return query.trim() !== '' && !sort?.length
}

// A federated hit carries Meilisearch's merge bookkeeping. Drop it: a projected hit is
// typed as exactly the fields its caller asked for, and this is not one of them.
function stripFederation(hit: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...hit }
  delete rest._federation
  return rest
}

// The one Meilisearch read in this module. Both the paged read and the raw id window go
// through it, so a result grid and the card page's prev/next walk cannot end up ordering
// the same result set differently.
async function readWindow(
  client: MeiliSearch,
  lang: string,
  query: string,
  params: ReadParams,
  window: { offset: number; limit: number },
): Promise<HitWindow> {
  const indexUid = cardsIndex(lang)
  if (!ranksByRelevance(query, params.sort)) {
    const res = await client.index(indexUid).search(query, { ...params, ...window })
    return { hits: res.hits, total: res.estimatedTotalHits ?? 0 }
  }
  const federated: FederatedMultiSearchParams = {
    federation: window,
    queries: [
      {
        indexUid, q: query, ...params,
        attributesToSearchOn: ['name'],
        federationOptions: { weight: NAME_MATCH_WEIGHT },
      },
      { indexUid, q: query, ...params, federationOptions: { weight: 1 } },
    ],
  }
  // The client's two multiSearch overloads resolve to the non-federated one for any
  // argument that also satisfies MultiSearchParams, which a federated request does, so
  // the federated response type has to be named here or `hits` does not exist on it.
  const res = (await client.multiSearch(federated)) as unknown as SearchResponse
  return {
    hits: res.hits.map((hit) => stripFederation(hit as Record<string, unknown>)),
    total: res.estimatedTotalHits ?? 0,
  }
}
```

- [ ] **Step 9: Route `pagedSearch` through it**

Replace the body of `pagedSearch` (the signature and its comment stay as they are):

```ts
async function pagedSearch(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions,
  attributesToRetrieve?: readonly string[],
): Promise<{ hits: unknown[]; total: number; page: number; hitsPerPage: number }> {
  const page = opts.page ?? 1
  const hitsPerPage = opts.hitsPerPage ?? 20
  const res = await readWindow(
    client, lang, query,
    {
      filter: buildFilter(opts.filters ?? {}),
      sort: opts.sort,
      // Copied: the Meilisearch client types want a mutable array, and a caller's
      // `as const` tuple must not be handed to a library that could sort it in place.
      ...(attributesToRetrieve ? { attributesToRetrieve: [...attributesToRetrieve] } : {}),
    },
    { offset: (page - 1) * hitsPerPage, limit: hitsPerPage },
  )
  return { ...res, page, hitsPerPage }
}
```

- [ ] **Step 10: Route `searchCardIds` through it**

```ts
export async function searchCardIds(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: IdWindowOptions,
): Promise<{ ids: string[]; total: number }> {
  const res = await readWindow(
    client, lang, query,
    { filter: buildFilter(opts.filters ?? {}), sort: opts.sort, attributesToRetrieve: ['id'] },
    { offset: opts.offset, limit: opts.limit },
  )
  return { ids: (res.hits as { id: string }[]).map((h) => h.id), total: res.total }
}
```

- [ ] **Step 11: Run both search suites**

Run: `/usr/local/bin/npm test -w @revelio/search`
Expected: PASS, including every test from Steps 1 and 3.

- [ ] **Step 12: Prove the ranking test bites**

Temporarily set `NAME_MATCH_WEIGHT` to `1` and re-run
`/usr/local/bin/npm test -w @revelio/search -- search.test.ts -t "name matches rank above"`.
Expected: FAIL on `'puts a partial name match above a whole-query flavor match'`. Restore
`10` and confirm it passes again. A live test that passes either way is worthless, and
this one is the whole point of the change.

- [ ] **Step 13: Run the downstream suites**

Run, from `app/`:

```bash
/usr/local/bin/npm test -w web && /usr/local/bin/npm test -w @revelio/bot
```

Expected: PASS, both at the counts noted in Task 1 Step 1. `web`'s live
`search-client.test.ts` is the guard on `_federation` stripping: its
`'returns exactly the projected fields and nothing else'` case fails if
`stripFederation` was missed.

- [ ] **Step 14: Document it in CLAUDE.md**

In the `### Architecture` list, replace the `@revelio/search` bullet with:

```markdown
- **`@revelio/search`** (`search/`) — Meilisearch client + document shape + query builder. `createMeiliClient(host, key)` is the single client factory; `documents.ts` defines the indexed card document; `search.ts` builds queries/filters. A read that ranks by **relevance** (non-empty query, no explicit sort) goes out as a **federated multi-search** — a `name`-only query weighted 10 against the unrestricted one — so every name match ranks above every text/flavor match. `rankingRules` cannot express that: Meilisearch's `words` rule is applied above them, so a flavor-text hit on the whole query would otherwise outrank a name hit on part of it. This needs Meilisearch **>= 1.10** and is a query-time change only — `CARD_INDEX_SETTINGS` is untouched, so it needs no reindex.
```

- [ ] **Step 15: Lint and typecheck**

Run, from `app/`:

```bash
/usr/local/bin/npm run lint && /usr/local/bin/npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 16: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/search/src/search.ts app/search/src/__tests__/search.test.ts \
  app/search/test/search.test.ts CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(search): rank name matches above text and flavor matches"
```

---

### Task 3: Verify against the real index and open the PR

**Files:**
- Modify: `docs/superpowers/plans/2026-09-11-name-first-search-ranking.md` (tick the boxes)

**Interfaces:**
- Consumes: a built `web` and the dev Meilisearch holding `cards-en`.
- Produces: a PR against `main`.

- [ ] **Step 1: Check the real result list, not just the fixtures**

The fixtures prove three documents order correctly. This proves it on the 1098-card
`cards-en` index the bug was reported against, by issuing the same federated request
the code now builds. From `app/`, with `docker compose up` running:

```bash
curl -s http://localhost:7700/multi-search -H "Authorization: Bearer masterKey" \
  -H 'Content-Type: application/json' -d '{
  "federation": {"offset": 0, "limit": 25},
  "queries": [
    {"indexUid":"cards-en","q":"Harry Potter","filter":[],"attributesToRetrieve":["name","text","flavorText"],"attributesToSearchOn":["name"],"federationOptions":{"weight":10}},
    {"indexUid":"cards-en","q":"Harry Potter","filter":[],"attributesToRetrieve":["name","text","flavorText"],"federationOptions":{"weight":1}}
  ]}' | python3 -c '
import json, sys
for i, h in enumerate(json.load(sys.stdin)["hits"], 1):
    fields = (("name", h["name"]), ("text", h.get("text")), ("flavor", h.get("flavorText")))
    where = ",".join(label for label, value in fields if "harry" in (value or "").lower())
    print(str(i).rjust(3), "|", (where or "-").ljust(16), "|", h["name"])'
```

Expected: an unbroken run of rows whose match includes `name`, `Harry Potter` first,
and only then the rows that matched in `text`/`flavor` alone. No `name` row below a
flavor-only row. If `cards-en` is missing, run the ingest job first.

- [ ] **Step 2: Check it in the browser**

Run `/usr/local/bin/npm run dev -w web` and open
`http://localhost:3000/en/search?q=Harry+Potter`. Confirm the cards with Harry in the
name come first. Then switch the sort to **Name** and confirm the alphabetical order is
not disturbed by the grouping, and clear the query to confirm browse is still in card
number order.

- [ ] **Step 3: Tick this plan's boxes**

Mark every completed step `- [x]` in this file, and commit:

```bash
git add docs/superpowers/plans/2026-09-11-name-first-search-ranking.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(plans): mark the name-first ranking plan done"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/name-first-search-ranking
/opt/homebrew/bin/gh pr create --title "fix(search): rank name matches above text and flavor matches" --body "$(cat <<'BODY'
Searching `Harry Potter` returned name matches, then flavor-text matches, then name
matches again. Meilisearch's `words` rule outranks `rankingRules`, so a card whose
flavor text holds both query terms beat a card whose name holds one, and no index
setting could express otherwise. Relevance reads now go out as a federated
multi-search instead: a `name`-only query weighted 10 against the unrestricted one.

## What changed

- `@revelio/search` federates a relevance read (non-empty query, no explicit sort) and
  merges by weighted score, lifting the whole name group above the whole text/flavor
  group. Ranking inside each group is unchanged, so the exact name match stays first.
- An explicit sort and an empty query deliberately do not federate: both were measured
  to break the requested order (see the spec).
- `searchCardIds` federates too, so the card page's prev/next walk steps through the
  order the grid displayed.
- Every Meilisearch stub in the tree learned `multiSearch`, in its own commit, so no
  commit leaves a workspace red.

## Verification

- `npm test -w @revelio/search` - N tests, including a live-Meilisearch case that a
  weight of 1 makes fail (checked by mutation).
- `npm test -w web` - N tests.
- `npm test -w @revelio/bot` - N tests.
- `npm run typecheck`, `npm run lint` - clean.
- By hand against the 1098-card dev index: `q=Harry Potter` returns an unbroken run of
  name matches before the first flavor match; sort=Name and an empty query are
  unchanged.

## Deployment

None. `CARD_INDEX_SETTINGS` is untouched, so no ingest run and no reindex. The only
requirement is Meilisearch **>= 1.10** for federated multi-search - compose and CI both
pin `v1.10`, so confirm the deployed instance is not older.

## Notes for review

Spec: `docs/superpowers/specs/2026-09-11-name-first-search-ranking-design.md`.
Plan: `docs/superpowers/plans/2026-09-11-name-first-search-ranking.md`.
BODY
)"
```

Replace each `N` with the real count from the run. Never write a number that was not
observed.

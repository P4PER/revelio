# Narrow Web Search Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the web app fetching whole card documents for grids that render six or
seven fields, without ever letting a renderer read a field its query did not ask for.

**Architecture:** Add one generic projected read to `@revelio/search`
(`searchCardFields`), whose return type is `Pick<SearchDocument, K>` derived from the
field tuple the caller passes. `web` declares one `const` tuple per surface in
`src/lib/search-projections.ts` and derives its hit type from that same tuple, so the
query and the type cannot drift. Surfaces move over one at a time; `searchCards` (whole
documents) stays for the paths that genuinely need every field.

**Tech Stack:** TypeScript, Meilisearch JS client, Next.js 16 App Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-search-projections-design.md`

**Branch:** `perf/narrow-search-projections` (already carries the two bot commits this
follows up on: `perf(bot): fetch only the fields /search renders` and `fix(bot): keep
/card's free-text lookup on whole documents`).

## Global Constraints

- **Never run `npm test` from `app/`.** `ingest/test/main.test.ts` deletes the `cards-en`
  and `cards-de` indexes from the dev Meilisearch. Run per workspace: `npm test -w web`,
  `npm test -w @revelio/search`, `npm test -w @revelio/bot`.
- `web/src/lib/server/__tests__/search-client.test.ts` needs a live Meilisearch. It reads
  `TEST_MEILI_HOST` / `TEST_MEILI_KEY` and defaults to `http://localhost:7700` with
  `masterKey`. `docker compose up` from `app/` provides it. It creates and deletes its own
  randomly-named index, so it does not touch `cards-*`.
- **Web test files are not typechecked** (`tsconfig.typecheck.json` excludes them). A test
  fixture with the wrong shape will not fail `npm run typecheck` - the assertions in this
  plan are written to catch shape errors at runtime instead.
- Types: `type` aliases only, never `interface`. Type-only imports use `import type` or the
  inline `type` form. Declaration order within a file: types -> constants -> unexported
  helpers -> exported functions.
- Code comments are ASCII only - no em-dashes, no unicode arrows.
- Commits are Conventional Commits, `type(scope): subject`, imperative, lower case, no
  trailing period, no tool attribution.
- Do not touch `CARD_INDEX_SETTINGS`. Nothing in this plan needs an ingest run or a
  migration.

---

### Task 1: A generic projected read in `@revelio/search`

**Files:**
- Modify: `app/search/src/search.ts`
- Test: `app/search/src/__tests__/search.test.ts`

**Interfaces:**
- Consumes: `pagedSearch` (private, already in the file), `SearchDocument`, `SearchOptions`,
  `SearchResult`.
- Produces:
  - `type CardProjection<K extends keyof SearchDocument> = Omit<SearchResult, 'hits'> & { hits: Pick<SearchDocument, K>[] }`
  - `searchCardFields<K extends keyof SearchDocument>(client: MeiliSearch, lang: string, query: string, fields: readonly K[], opts?: SearchOptions): Promise<CardProjection<K>>`
  - `SUMMARY_FIELDS` stays private; `CardSummaryHit`, `CardSummaryResult`,
    `searchCardSummaries` and `searchCardSuggestions` keep their current public signatures.

- [x] **Step 1: Write the failing tests**

Append to `app/search/src/__tests__/search.test.ts`:

```ts
describe('searchCardFields', () => {
  it('asks for exactly the fields it was given, on the requested page', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardFields(
      fakeClient(captured), 'en', '', ['id', 'name', 'orientation'], { page: 2, hitsPerPage: 12 },
    )
    expect(captured.attributesToRetrieve).toEqual(['id', 'name', 'orientation'])
    expect(captured.offset).toBe(12)
    expect(captured.limit).toBe(12)
  })

  it('copies the tuple instead of handing the caller\'s array to the client', async () => {
    const captured: Record<string, unknown> = {}
    const fields = ['id', 'name'] as const
    await searchCardFields(fakeClient(captured), 'en', '', fields)
    expect(captured.attributesToRetrieve).not.toBe(fields)
    expect(captured.attributesToRetrieve).toEqual(['id', 'name'])
  })
})
```

Add the import to the existing import block at the top of the file:

```ts
import {
  searchCardFields,
  searchCardIds,
  searchCardSuggestions,
  searchCardSummaries,
  searchCards,
} from '../search'
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @revelio/search`
Expected: FAIL, `TypeError: searchCardFields is not a function` (2 failures; the other 30
tests still pass).

- [x] **Step 3: Implement**

In `app/search/src/search.ts`, replace the `CardSummaryHit` / `CardSummaryResult` /
`SUMMARY_ATTRIBUTES` block with:

```ts
// A summary row: identity plus the few fields a one-line label needs, shared by
// autocomplete and by list views that render nothing else. Deliberately not a
// SearchDocument - restricting attributesToRetrieve means the hits are not whole
// documents, and typing them as such would be a lie.
export type CardSummaryHit = Pick<SearchDocument, (typeof SUMMARY_FIELDS)[number]>

export type SearchResult = {
  hits: SearchDocument[]
  total: number
  page: number
  hitsPerPage: number
}

// A paged read of a chosen subset of each document. The type follows the tuple the
// caller passed, so a renderer cannot read a field the query did not ask for without
// failing to compile.
export type CardProjection<K extends keyof SearchDocument> =
  Omit<SearchResult, 'hits'> & { hits: Pick<SearchDocument, K>[] }

export type CardSummaryResult = CardProjection<(typeof SUMMARY_FIELDS)[number]>

const SUMMARY_FIELDS = ['id', 'name', 'setCode', 'number'] as const
```

Note `SUMMARY_FIELDS` is declared after the types that reference it. That is deliberate
and required by the declaration-order convention; `const` tuples are fine in type
position ahead of their declaration because the reference is type-only.

Change the private helper's parameter to accept a readonly tuple and copy it:

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
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit: hitsPerPage,
    offset: (page - 1) * hitsPerPage,
    // Copied: the Meilisearch client types want a mutable array, and a caller's
    // `as const` tuple must not be handed to a library that could sort it in place.
    ...(attributesToRetrieve ? { attributesToRetrieve: [...attributesToRetrieve] } : {}),
  })
  return { hits: res.hits, total: res.estimatedTotalHits ?? 0, page, hitsPerPage }
}
```

Replace the body of `searchCardSummaries` and add `searchCardFields` immediately above it:

```ts
// The one place a projected read is built. Callers pass a tuple declared `as const`,
// which both goes to Meilisearch as attributesToRetrieve and fixes the hit type.
export async function searchCardFields<K extends keyof SearchDocument>(
  client: MeiliSearch,
  lang: string,
  query: string,
  fields: readonly K[],
  opts: SearchOptions = {},
): Promise<CardProjection<K>> {
  const res = await pagedSearch(client, lang, query, opts, fields as readonly string[])
  return { ...res, hits: res.hits as Pick<SearchDocument, K>[] }
}

// A paged result list that renders "name (set #number)" per row wants the same
// slice as autocomplete, not whole documents: a page of 10 otherwise ships ten
// cards' rules text, flavor text and all 24 indexed fields to render three.
export async function searchCardSummaries(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<CardSummaryResult> {
  return searchCardFields(client, lang, query, SUMMARY_FIELDS, opts)
}
```

In `searchCardSuggestions`, replace `attributesToRetrieve: SUMMARY_ATTRIBUTES` with
`attributesToRetrieve: [...SUMMARY_FIELDS]`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @revelio/search`
Expected: PASS, 32 tests. The pre-existing `searchCardSummaries` and
`searchCardSuggestions` tests must still pass unchanged - they are the proof the wrappers
did not change behaviour.

Run: `npm test -w @revelio/bot`
Expected: PASS, 127 tests. The bot consumes `searchCardSummaries`; nothing there changes.

Run: `npm run typecheck` and `npm run lint`
Expected: both exit 0.

- [x] **Step 5: Commit**

```bash
git add app/search/src/search.ts app/search/src/__tests__/search.test.ts
git commit -m "refactor(search): build every projected read from one field tuple"
```

---

### Task 2: Web projections module and the tile grids

Covers `/search`, `/sets/[code]` and both collection grids - everything that renders
through `CardTile` or `toCollectionCards`. The deck browser is Task 3, and keeps using
the untouched `runSearch` until then.

**Files:**
- Create: `app/web/src/lib/search-projections.ts`
- Modify: `app/web/src/lib/server/search-client.ts` (add `runSearchFields`, leave
  `runSearch` alone)
- Modify: `app/web/src/components/card/card-tile.tsx`, `app/web/src/components/card/card-grid.tsx`
- Modify: `app/web/src/lib/collection-cards.ts`
- Modify: `app/web/src/app/[locale]/search/page.tsx`, `app/web/src/app/[locale]/sets/[code]/page.tsx`
- Modify: `app/web/src/lib/server/collection-page-data.ts`
- Test: `app/web/src/lib/server/__tests__/search-client.test.ts`

**Interfaces:**
- Consumes: `searchCardFields`, `CardProjection` (Task 1).
- Produces:
  - `CARD_TILE_FIELDS` / `type CardTileHit`
  - `COLLECTION_TILE_FIELDS` / `type CollectionTileHit`
  - `runSearchFields<K>(client, lang, state, fields, overrides?): Promise<CardProjection<K>>`

- [x] **Step 1: Write the failing test**

The existing fixtures in `app/web/src/lib/server/__tests__/search-client.test.ts` omit
`imageVersion` and `orientation`, and Meilisearch only returns keys a document actually
has - so add them first, or the key-set assertion is meaningless. Replace the two `docs`
entries with:

```ts
const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', number: '1', name: 'Harry Potter', text: null, flavorText: null, types: ['character'], subTypes: [], lesson: null, rarity: 'rare', finishes: ['normal'], legality: 'legal', cost: null, isOfficial: true, imageLang: 'en', imageVersion: 1, defaultLanguage: 'en', orientation: 'vertical' },
  { id: 'b', setCode: 'BS', number: '2', name: 'Flobberworm', text: null, flavorText: null, types: ['creature'], subTypes: [], lesson: null, rarity: 'common', finishes: ['normal'], legality: 'legal', cost: 2, isOfficial: false, imageLang: null, imageVersion: null, defaultLanguage: 'en', orientation: null },
]
```

Then append:

```ts
describe('runSearchFields', () => {
  it('returns exactly the projected fields and nothing else', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits).toHaveLength(1)
    expect(Object.keys(r.hits[0]).sort()).toEqual([...CARD_TILE_FIELDS].sort())
  })

  it('drops the heavy fields the tile never reads', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits[0]).not.toHaveProperty('text')
    expect(r.hits[0]).not.toHaveProperty('flavorText')
  })

  it('still applies the url filters', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('type=creature')), CARD_TILE_FIELDS,
    )
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })
})
```

Add to the imports at the top of that file:

```ts
import { runSearch, runSearchFields } from '../search-client'
import { CARD_TILE_FIELDS } from '@/lib/search-projections'
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- src/lib/server/__tests__/search-client.test.ts`
Expected: FAIL - the module `@/lib/search-projections` does not resolve.

If instead every test in the file fails with a connection error, Meilisearch is not
running: `docker compose up -d meilisearch` from `app/`, then re-run.

- [x] **Step 3: Create the projections module**

Create `app/web/src/lib/search-projections.ts`:

```ts
import type { SearchDocument } from '@revelio/search'

// One tuple per surface, and the hit type derived from that same tuple. The tuple is
// what goes to Meilisearch as attributesToRetrieve, so a renderer that reads a field
// the query did not ask for fails to compile rather than reading undefined at runtime.
// This module is isomorphic on purpose - the deck browser is a client component and
// needs DeckBrowseHit, so it cannot live under lib/server.

// CardTile: the thumbnail (or the name as a fallback), the caption, and the link.
export const CARD_TILE_FIELDS = [
  'id', 'name', 'imageLang', 'imageVersion', 'defaultLanguage', 'orientation',
] as const

// The collection tiles add the finish badges on top of the plain tile.
export const COLLECTION_TILE_FIELDS = [...CARD_TILE_FIELDS, 'finishes'] as const

export type CardTileHit = Pick<SearchDocument, (typeof CARD_TILE_FIELDS)[number]>

export type CollectionTileHit = Pick<SearchDocument, (typeof COLLECTION_TILE_FIELDS)[number]>
```

Task 3 adds the deck browser's tuple to this module. It is deliberately not written here:
a tuple with no consumer cannot be checked against one.

- [x] **Step 4: Add `runSearchFields`**

In `app/web/src/lib/server/search-client.ts`, extend the import and append the function
below the existing `runSearch` (leave `runSearch` exactly as it is - Task 3 removes it):

```ts
import {
  createMeiliClient,
  searchCardFields,
  searchCards,
  type CardProjection,
  type SearchDocument,
  type SearchResult,
} from '@revelio/search'
```

```ts
// Same read as runSearch, but only the fields the calling surface renders. `fields` is
// required rather than optional: an omitted projection is exactly the mistake this is
// here to prevent.
export async function runSearchFields<K extends keyof SearchDocument>(
  client: MeiliSearch,
  lang: string,
  state: SearchState,
  fields: readonly K[],
  overrides?: { hitsPerPage?: number },
): Promise<CardProjection<K>> {
  const { query, options } = toSearchOptions(state)
  return searchCardFields(client, lang, query, fields, { ...options, ...overrides })
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -w web -- src/lib/server/__tests__/search-client.test.ts`
Expected: PASS, 6 tests (3 existing `runSearch` + 3 new).

- [x] **Step 6: Narrow the tile components**

In `app/web/src/components/card/card-tile.tsx`, swap the type import and the prop:

```ts
import type { CardTileHit } from '@/lib/search-projections'
```

```ts
  hit: CardTileHit
```

In `app/web/src/components/card/card-grid.tsx`, the same:

```ts
import type { CardTileHit } from '@/lib/search-projections'
```

```ts
  hits: CardTileHit[]
```

In `app/web/src/lib/collection-cards.ts`:

```ts
import type { CollectionTileHit } from '@/lib/search-projections'
```

```ts
export function toCollectionCards(hits: CollectionTileHit[], base: string): CollectionCard[] {
```

- [x] **Step 7: Point the three surfaces at the projections**

`app/web/src/app/[locale]/search/page.tsx` - replace the `runSearch` call:

```ts
  const results = await runSearchFields(getSearchClient(), locale, state, CARD_TILE_FIELDS)
```

and fix the import to `import { getSearchClient, runSearchFields } from '@/lib/server/search-client'`,
adding `import { CARD_TILE_FIELDS } from '@/lib/search-projections'`.

`app/web/src/app/[locale]/sets/[code]/page.tsx` - same treatment:

```ts
  const results = await runSearchFields(
    getSearchClient(), locale, state, CARD_TILE_FIELDS, { hitsPerPage: FULL_SET_LIMIT },
  )
```

`app/web/src/lib/server/collection-page-data.ts` - both reads feed `toCollectionCards`,
so both take `COLLECTION_TILE_FIELDS`. The set read:

```ts
  const setRes = tab === 'sets' && selectedSet
    ? await runSearchFields(client, locale, parseSearchParams(new URLSearchParams({ set: selectedSet, sort: 'number' })), COLLECTION_TILE_FIELDS, { hitsPerPage: FULL_SET_LIMIT })
    : { hits: [], total: 0, page: 1, hitsPerPage: FULL_SET_LIMIT }
```

and the browse read, which calls `searchCards` directly because it applies ownership
filters:

```ts
  const browseRes = tab === 'browse'
    ? await searchCardFields(client, locale, query, COLLECTION_TILE_FIELDS, applyOwnership({ ...options, hitsPerPage: BROWSE_PAGE_SIZE }, parseOwnership(sp), ownedIds, dupeIds))
    : { hits: [], total: 0, page: 1, hitsPerPage: BROWSE_PAGE_SIZE }
```

Update that file's imports: `searchCards` becomes `searchCardFields` from
`@revelio/search`, `runSearch` becomes `runSearchFields`, and add
`import { COLLECTION_TILE_FIELDS } from '@/lib/search-projections'`.

- [x] **Step 8: Fix the component test fixtures**

`app/web/src/components/card/__tests__/card-tile.test.tsx` and `card-grid.test.tsx` build
whole `SearchDocument` fixtures. They are not typechecked, so they will not fail the
build, but leaving them wide hides exactly the bug this change is guarding against: a
component that still reads a dropped field would keep passing. Narrow both to the
projected shape.

In `card-tile.test.tsx`:

```ts
import type { CardTileHit } from '@/lib/search-projections'

const base: CardTileHit = {
  id: 'bs-1', name: 'Dean Thomas', imageLang: 'en', imageVersion: 1,
  defaultLanguage: 'en', orientation: 'horizontal',
}
```

and change the `wrap` signature to `(hit: CardTileHit) =>`.

In `card-grid.test.tsx`:

```ts
import type { CardTileHit } from '@/lib/search-projections'

const hit = (id: string, name: string): CardTileHit => ({
  id, name, imageLang: 'en', imageVersion: 1, defaultLanguage: 'en', orientation: null,
})
```

- [x] **Step 9: Verify the whole workspace**

Run: `npm test -w web`
Expected: PASS, 923 tests or more (the 3 new ones bring it to 926).

Run: `npm run typecheck`
Expected: exit 0. If `CardGrid` or `toCollectionCards` has another caller that still
passes whole documents, it surfaces here - a `SearchDocument` is assignable to a
`CardTileHit`, so widening is fine; the error would be the other direction and means a
surface was missed in Step 7.

Run: `npm run lint`
Expected: exit 0.

- [x] **Step 10: Commit**

```bash
git add app/web/src/lib/search-projections.ts app/web/src/lib/server/search-client.ts \
  app/web/src/components/card/card-tile.tsx app/web/src/components/card/card-grid.tsx \
  app/web/src/lib/collection-cards.ts app/web/src/lib/server/collection-page-data.ts \
  "app/web/src/app/[locale]/search/page.tsx" "app/web/src/app/[locale]/sets/[code]/page.tsx" \
  app/web/src/lib/server/__tests__/search-client.test.ts \
  app/web/src/components/card/__tests__/card-tile.test.tsx \
  app/web/src/components/card/__tests__/card-grid.test.tsx
git commit -m "perf(web): fetch only the fields the card grids render"
```

---

### Task 3: The deck card browser

The only surface whose hits cross into the browser, so the only one where this saves
users bandwidth rather than server-to-server traffic.

**Files:**
- Modify: `app/web/src/lib/actions/deck-actions.ts:128`
- Modify: `app/web/src/components/deck/deck-card-browser.tsx`
- Test: `app/web/src/components/deck/__tests__/deck-card-browser.test.tsx` (if it exists;
  check with `ls app/web/src/components/deck/__tests__/`)

**Interfaces:**
- Consumes: `runSearchFields`, `CardProjection` (Task 2), and the projections module Task 2
  created.
- Produces: `DECK_BROWSE_FIELDS` / `type DeckBrowseHit` in
  `app/web/src/lib/search-projections.ts`; `searchDeckCards` now resolves to
  `CardProjection<(typeof DECK_BROWSE_FIELDS)[number]>`.

- [x] **Step 1: Write the failing test**

Add to `app/web/src/lib/server/__tests__/search-client.test.ts` - the deck projection has
to be asserted against a real Meilisearch for the same reason the tile one is:

```ts
it('keeps every field the deck browser builds a card view from', async () => {
  const r = await runSearchFields(
    client, lang, parseSearchParams(new URLSearchParams('q=harry')), DECK_BROWSE_FIELDS,
  )
  // toAddView reads all of these; a missing one is a blank tile or a throw.
  for (const key of ['id', 'name', 'setCode', 'number', 'types', 'subTypes', 'legality', 'isOfficial']) {
    expect(r.hits[0]).toHaveProperty(key)
  }
  expect(r.hits[0]).not.toHaveProperty('text')
})
```

Import `DECK_BROWSE_FIELDS` alongside `CARD_TILE_FIELDS`.

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- src/lib/server/__tests__/search-client.test.ts`
Expected: FAIL - `DECK_BROWSE_FIELDS` is not exported from `@/lib/search-projections`.

- [x] **Step 3: Add the deck browser's tuple**

Append to `app/web/src/lib/search-projections.ts`, keeping the file's order of constants
before types:

```ts
// The deck browser renders a tile and builds a DeckCardView from the hit, so it needs
// almost everything: only text, flavorText, rarity and numberSort are unused.
export const DECK_BROWSE_FIELDS = [
  'id', 'name', 'setCode', 'number', 'cost', 'damage', 'types', 'subTypes', 'lesson',
  'legality', 'isOfficial', 'orientation', 'imageLang', 'imageVersion',
  'defaultLanguage', 'artCropVersion',
] as const
```

and, with the other types:

```ts
export type DeckBrowseHit = Pick<SearchDocument, (typeof DECK_BROWSE_FIELDS)[number]>
```

Re-run `npm test -w web -- src/lib/server/__tests__/search-client.test.ts`.
Expected: PASS.

- [x] **Step 4: Narrow the action and the browser**

In `app/web/src/lib/actions/deck-actions.ts`, replace the `runSearch` call:

```ts
  return runSearchFields(getSearchClient(), locale, state, DECK_BROWSE_FIELDS, { hitsPerPage: DECK_BROWSE_PAGE_SIZE })
```

and update its imports: `runSearch` becomes `runSearchFields`, plus
`import { DECK_BROWSE_FIELDS } from '@/lib/search-projections'`.

In `app/web/src/components/deck/deck-card-browser.tsx`:

```ts
import type { CardProjection } from '@revelio/search'
import { DECK_BROWSE_FIELDS, type DeckBrowseHit } from '@/lib/search-projections'

type DeckBrowseResult = CardProjection<(typeof DECK_BROWSE_FIELDS)[number]>
```

```ts
const EMPTY_RESULT: DeckBrowseResult = { hits: [], total: 0, page: 1, hitsPerPage: DECK_BROWSE_PAGE_SIZE }
```

```ts
function toAddView(hit: DeckBrowseHit): Omit<DeckCardView, 'zone' | 'quantity'> {
```

Then drop the now-unused `SearchDocument` / `SearchResult` imports and change the
component's `result` state type to `DeckBrowseResult`. Grep the file for `SearchResult`
to catch every occurrence.

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test -w web`
Expected: PASS. This is the real gate for the task - `toAddView` reads sixteen fields, so
a tuple missing one shows up as a failing deck-browser or deck-model test, or as a
typecheck error in the next step.

Run: `npm run typecheck`
Expected: exit 0. A field `toAddView` reads that is absent from `DECK_BROWSE_FIELDS` is a
compile error here. That is the whole point of deriving the type from the tuple - fix it
by adding the field to the tuple, never by widening the type.

Run: `npm run lint`
Expected: exit 0.

- [x] **Step 6: Check the client payload actually shrank**

Run: `npm run build -w web && npm run start -w web` (or `npm run dev -w web`), open a deck
in the browser, type in the card browser's search box, and read the `searchDeckCards`
action response in the network panel. It must no longer contain any card's rules text.

If a build is inconvenient, the cheaper proof is the assertion in Step 1: no `text` key
comes back from Meilisearch, so no `text` can reach the browser.

- [x] **Step 7: Commit**

```bash
git add app/web/src/lib/actions/deck-actions.ts \
  app/web/src/lib/search-projections.ts \
  app/web/src/components/deck/deck-card-browser.tsx \
  app/web/src/lib/server/__tests__/search-client.test.ts
git commit -m "perf(deck): stop shipping card rules text to the deck browser"
```

---

### Task 4: Retire the un-projected `runSearch`

After Task 3 nothing calls `runSearch`. Leaving it is an open invitation to add a fifth
surface that fetches whole documents by accident.

**Files:**
- Modify: `app/web/src/lib/server/search-client.ts`
- Test: `app/web/src/lib/server/__tests__/search-client.test.ts`

**Interfaces:**
- Produces: `runSearch` with the Task 2 `runSearchFields` signature; `runSearchFields` is gone.

- [x] **Step 1: Confirm there are no callers left**

Run: `grep -rn "runSearch(" app/web/src --include="*.ts" --include="*.tsx"`
Expected: only the three assertions in `search-client.test.ts` that still exercise the old
function. If any application code appears, that surface was missed - go back and give it a
projection rather than keeping `runSearch` alive for it.

- [x] **Step 2: Delete `runSearch` and rename its replacement**

In `app/web/src/lib/server/search-client.ts`, delete the `runSearch` function and rename
`runSearchFields` to `runSearch`. Drop the now-unused `searchCards` and `SearchResult`
imports.

- [x] **Step 3: Update the test file**

In `search-client.test.ts`, delete the three original `describe('runSearch')` tests that
called it without a projection (their filter coverage is already carried by the
`runSearchFields` tests from Task 2, which assert the same filters). Rename
`runSearchFields` to `runSearch` throughout, and rename the `describe` block to
`runSearch`.

- [x] **Step 4: Verify**

Run: `npm test -w web`
Expected: PASS.

Run: `npm run typecheck` and `npm run lint`
Expected: both exit 0.

Run: `npm run build -w web`
Expected: a successful `next build`. This is the one command that compiles the App Router
pages the way CI's **build** job does; the projections touch four pages, so it is worth
running once at the end even though `typecheck` has already passed.

- [x] **Step 5: Commit**

```bash
git add app/web/src/lib/server/search-client.ts \
  app/web/src/lib/server/__tests__/search-client.test.ts
git commit -m "refactor(web): make a field projection mandatory on every search read"
```

---

## Wrap-up

- [x] Update this plan's checkboxes as tasks complete.
- [ ] Open the PR. Title: `perf: fetch only the fields each search surface renders`.
      Body opens with prose, then `## What changed` (the bot commits and the four web
      surfaces), `## Verification` (one bullet per command actually run, with its real
      result), and `## Notes for review` pointing at
      `docs/superpowers/specs/2026-09-11-search-projections-design.md` and the
      `findOneCard` incident that motivated deriving types from tuples.
- [x] No `## Deployment` section is needed: no env var, no migration, and
      `CARD_INDEX_SETTINGS` is untouched, so no ingest run.

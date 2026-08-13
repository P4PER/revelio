# Card-to-card Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user move to the previous/next card from the card detail page using arrow keys (desktop), horizontal swipe (mobile), and chevron buttons overlaid on the card image (revealed on hover/focus), following the search result set when they arrived from search and the card's own set order otherwise.

**Architecture:** All navigation reduces to one server helper, `getCardNeighbors`, that returns `{ prev, next }` neighbor links. Two sources feed it: a **search-context window** (the card link carries the search params plus the hit's absolute index `i`; the detail page re-runs the same search as a 3-wide `offset/limit` window) and a **set-order fallback** (a Meili query scoped to the card's set, sorted by `numberSort`). A client component `CardNav` wraps the card image and layers on keys, swipe, and a one-time first-visit hint.

**Tech Stack:** Next.js 16 App Router (React 19, server components), next-intl navigation, Meilisearch (`@revelio/search`), shadcn `Button`/`Kbd`, `lucide-react` icons, Tailwind v4, Vitest + Testing Library.

## Global Constraints

- All app commands run from `app/`. Tests: `npm test -w web`, `npm test -w @revelio/search`. Typecheck: `npm run typecheck`.
- Conventional Commits. Never commit to `main` — work happens on branch `feat/card-to-card-navigation` (already checked out).
- No Claude/Claude Code attribution in commits.
- Commit signing + toolchain are not on the default PATH: use `git -c gpg.program=/opt/homebrew/bin/gpg commit …`; prefix node/npm with `/usr/local/bin` if `npm` is not found.
- Localize every user-facing string via `messages/en.json` + `messages/de.json` — never hardcode.
- Meili integration tests read `TEST_MEILI_HOST` / `TEST_MEILI_KEY` (default `http://localhost:7700` / `masterKey`); they need a live Meilisearch (CI `test` job provides one; locally `docker compose up`).
- Card images already use `numberSort` as a sortable attribute in `CARD_INDEX_SETTINGS` — no index-settings change, no ingest run, no DB migration is required by this feature.

---

## File Structure

- `app/search/src/search.ts` — **modify**: add an optional raw `window { offset, limit }` to `SearchOptions`.
- `app/search/src/__tests__/search.test.ts` — **create**: pure unit test for the window option (mocked client).
- `app/web/src/lib/search-params.ts` — **modify**: add pure `contextHref(id, params, index)` URL builder.
- `app/web/src/lib/__tests__/search-params.test.ts` — **modify**: add `contextHref` cases.
- `app/web/src/lib/card-neighbors.ts` — **create**: `Neighbor`/`NeighborContext` types, `parseNeighborContext`, pure `neighborsFromWindow`, and the I/O `getCardNeighbors`.
- `app/web/src/lib/__tests__/card-neighbors.test.ts` — **create**: pure-helper unit tests.
- `app/web/src/lib/__tests__/card-neighbors.integration.test.ts` — **create**: live-Meili test for `getCardNeighbors`.
- `app/web/src/components/card-nav.tsx` — **create**: client interaction component (chevrons, keys, swipe, hint).
- `app/web/src/components/__tests__/card-nav.test.tsx` — **create**.
- `app/web/src/components/card-tile.tsx` — **modify**: optional `context` → context-carrying href.
- `app/web/src/components/card-grid.tsx` — **modify**: optional `searchParams` + `startIndex`, passes per-tile index.
- `app/web/src/components/__tests__/card-tile.test.tsx` — **modify**: add href cases.
- `app/web/src/components/__tests__/card-grid.test.tsx` — **modify**: add index-plumbing case.
- `app/web/src/app/[locale]/search/page.tsx` — **modify**: pass `searchParams`/`startIndex` to `CardGrid`.
- `app/web/src/components/card-detail.tsx` — **modify**: accept `prev`/`next`, wrap image in `CardNav`.
- `app/web/src/app/[locale]/card/[id]/page.tsx` — **modify**: read `searchParams`, resolve neighbors, pass to `CardDetail`.
- `app/web/src/components/__tests__/card-detail-edit.test.tsx` — **modify** if needed (new required props default to null; keep passing).
- `app/web/messages/en.json`, `app/web/messages/de.json` — **modify**: add `card.prevCard` / `card.nextCard` / `card.flipHint`.

---

## Task 1: Raw offset/limit window in `searchCards`

Add a way to fetch an arbitrary window of results (needed for the 3-wide neighbor lookup around an absolute index).

**Files:**
- Modify: `app/search/src/search.ts`
- Test: `app/search/src/__tests__/search.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SearchOptions.window?: { offset: number; limit: number }`. When present it overrides `page`/`hitsPerPage`. `searchCards(client, lang, query, opts)` return shape is unchanged (`{ hits, total, page, hitsPerPage }`).

- [ ] **Step 1: Write the failing test**

Create `app/search/src/__tests__/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { searchCards } from '../search'

// Minimal fake Meili client that records the search options it was called with.
function fakeClient(captured: Record<string, unknown>) {
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        Object.assign(captured, opts)
        return { hits: [], estimatedTotalHits: 0 }
      },
    }),
  } as never
}

describe('searchCards window option', () => {
  it('uses raw offset/limit when window is provided', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', { window: { offset: 41, limit: 3 } })
    expect(captured.offset).toBe(41)
    expect(captured.limit).toBe(3)
  })

  it('falls back to page/hitsPerPage when window is absent', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', { page: 3, hitsPerPage: 24 })
    expect(captured.offset).toBe(48)
    expect(captured.limit).toBe(24)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w @revelio/search -- src/__tests__/search.test.ts`
Expected: FAIL — the window branch does not exist yet (offset is `0`, not `41`).

- [ ] **Step 3: Add the `window` option**

In `app/search/src/search.ts`, extend `SearchOptions`:

```ts
export type SearchOptions = {
  filters?: CardFilters
  sort?: string[]
  page?: number
  hitsPerPage?: number
  window?: { offset: number; limit: number } // raw window; overrides page/hitsPerPage
}
```

Update `searchCards` to honor it:

```ts
export async function searchCards(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const page = opts.page ?? 1
  const hitsPerPage = opts.hitsPerPage ?? 20
  const limit = opts.window ? opts.window.limit : hitsPerPage
  const offset = opts.window ? opts.window.offset : (page - 1) * hitsPerPage
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit,
    offset,
  })
  return {
    hits: res.hits as SearchDocument[],
    total: res.estimatedTotalHits ?? 0,
    page,
    hitsPerPage,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w @revelio/search -- src/__tests__/search.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(search): add raw offset/limit window to searchCards"
```

---

## Task 2: Pure neighbor helpers (`contextHref`, `parseNeighborContext`, `neighborsFromWindow`)

The no-I/O core: build context-carrying hrefs, parse the incoming context, and turn a window of hits into prev/next ids.

**Files:**
- Modify: `app/web/src/lib/search-params.ts`
- Create: `app/web/src/lib/card-neighbors.ts`
- Test (modify): `app/web/src/lib/__tests__/search-params.test.ts`
- Test (create): `app/web/src/lib/__tests__/card-neighbors.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `contextHref(id: string, params: URLSearchParams, index: number): string` (in `search-params.ts`) — `/card/<id>?<params>` with `page` removed and `i` set to `index`; `/card/<id>` if the query ends up empty.
  - `type Neighbor = { id: string; href: string }`
  - `type NeighborContext = { params: URLSearchParams; index: number }`
  - `parseNeighborContext(sp: URLSearchParams): NeighborContext | null`
  - `neighborsFromWindow(hits: { id: string }[], currentId: string, index: number): { prevId: string | null; prevIndex: number; nextId: string | null; nextIndex: number } | null` — `null` means the window's center is not the current card (stale index).

- [ ] **Step 1: Write the failing tests**

Append to `app/web/src/lib/__tests__/search-params.test.ts`:

```ts
import { contextHref } from '../search-params'

describe('contextHref', () => {
  it('carries search params, drops page, sets the absolute index', () => {
    const params = new URLSearchParams('q=harry&type=character&page=2')
    expect(contextHref('bs-3', params, 27)).toBe('/card/bs-3?q=harry&type=character&i=27')
  })

  it('overwrites any pre-existing i with the neighbor index', () => {
    const params = new URLSearchParams('sort=cost&i=5')
    expect(contextHref('bs-4', params, 6)).toBe('/card/bs-4?sort=cost&i=6')
  })

  it('yields a plain path when there are no other params', () => {
    expect(contextHref('bs-1', new URLSearchParams('i=0'), 1)).toBe('/card/bs-1?i=1')
    expect(contextHref('bs-1', new URLSearchParams(''), 3)).toBe('/card/bs-1?i=3')
  })
})
```

Create `app/web/src/lib/__tests__/card-neighbors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNeighborContext, neighborsFromWindow } from '../card-neighbors'

describe('parseNeighborContext', () => {
  it('returns null when there is no i param', () => {
    expect(parseNeighborContext(new URLSearchParams('q=harry'))).toBeNull()
  })
  it('parses a valid non-negative integer index', () => {
    const ctx = parseNeighborContext(new URLSearchParams('q=harry&i=12'))
    expect(ctx?.index).toBe(12)
    expect(ctx?.params.get('q')).toBe('harry')
  })
  it('rejects negative or non-integer indices', () => {
    expect(parseNeighborContext(new URLSearchParams('i=-1'))).toBeNull()
    expect(parseNeighborContext(new URLSearchParams('i=x'))).toBeNull()
    expect(parseNeighborContext(new URLSearchParams('i=1.5'))).toBeNull()
  })
})

describe('neighborsFromWindow', () => {
  const win = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('middle: prev and next around the center', () => {
    // offset = index-1, so center sits at position 1
    expect(neighborsFromWindow(win, 'b', 5)).toEqual({
      prevId: 'a', prevIndex: 4, nextId: 'c', nextIndex: 6,
    })
  })
  it('first index (0): no prev, center at position 0', () => {
    expect(neighborsFromWindow([{ id: 'b' }, { id: 'c' }], 'b', 0)).toEqual({
      prevId: null, prevIndex: -1, nextId: 'c', nextIndex: 1,
    })
  })
  it('last index: prev but no next', () => {
    expect(neighborsFromWindow([{ id: 'a' }, { id: 'b' }], 'b', 9)).toEqual({
      prevId: 'a', prevIndex: 8, nextId: null, nextIndex: 10,
    })
  })
  it('returns null when the center is not the current card (stale index)', () => {
    expect(neighborsFromWindow(win, 'z', 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -w web -- src/lib/__tests__/search-params.test.ts src/lib/__tests__/card-neighbors.test.ts`
Expected: FAIL — `contextHref` / `card-neighbors` module exports do not exist.

- [ ] **Step 3: Implement `contextHref` in `search-params.ts`**

Append to `app/web/src/lib/search-params.ts`:

```ts
// Build a card link that carries the current search context so the detail page
// can walk the result set. `index` is the card's absolute position in the
// results; `page` is dropped because the index is already absolute.
export function contextHref(id: string, params: URLSearchParams, index: number): string {
  const p = new URLSearchParams(params.toString())
  p.delete('page')
  p.set('i', String(index))
  const qs = p.toString()
  return qs ? `/card/${id}?${qs}` : `/card/${id}`
}
```

- [ ] **Step 4: Implement `card-neighbors.ts` pure parts**

Create `app/web/src/lib/card-neighbors.ts`:

```ts
import type { MeiliSearch } from 'meilisearch'
import type { CardDetailDTO } from '@revelio/core'
import { searchCards } from '@revelio/search'
import { contextHref, parseSearchParams, toSearchOptions } from './search-params'

export type Neighbor = { id: string; href: string }
export type NeighborContext = { params: URLSearchParams; index: number }

// Read the search context off the card URL. Present only when the link came
// from a result grid (`i` = the hit's absolute index in the result set).
export function parseNeighborContext(sp: URLSearchParams): NeighborContext | null {
  const raw = sp.get('i')
  if (raw == null) return null
  const i = Number(raw)
  if (!Number.isInteger(i) || i < 0) return null
  return { params: sp, index: i }
}

// Turn a 3-wide (or 2-wide at the first index) window fetched at offset
// max(0, index-1) into prev/next. Returns null if the window's center is not
// the current card — the result list changed since the link was built.
export function neighborsFromWindow(
  hits: { id: string }[],
  currentId: string,
  index: number,
): { prevId: string | null; prevIndex: number; nextId: string | null; nextIndex: number } | null {
  const centerPos = index === 0 ? 0 : 1
  if (hits[centerPos]?.id !== currentId) return null
  const prev = centerPos > 0 ? hits[centerPos - 1] : null
  const next = hits[centerPos + 1] ?? null
  return {
    prevId: prev?.id ?? null, prevIndex: index - 1,
    nextId: next?.id ?? null, nextIndex: index + 1,
  }
}
```

(The `getCardNeighbors` I/O function is added in Task 3; the `MeiliSearch`/`searchCards`/`parseSearchParams`/`toSearchOptions`/`CardDetailDTO` imports are used there. If your linter flags unused imports at this step, add `getCardNeighbors` in Task 3 before running lint; the two tasks may be committed together if that is cleaner.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npm test -w web -- src/lib/__tests__/search-params.test.ts src/lib/__tests__/card-neighbors.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): pure neighbor helpers — contextHref, parseNeighborContext, neighborsFromWindow"
```

---

## Task 3: `getCardNeighbors` (search-context window + set-order fallback)

The I/O function that composes the pure helpers with Meilisearch.

**Files:**
- Modify: `app/web/src/lib/card-neighbors.ts`
- Test (create): `app/web/src/lib/__tests__/card-neighbors.integration.test.ts`

**Interfaces:**
- Consumes: `searchCards` (with the Task 1 `window` option), `parseSearchParams`, `toSearchOptions`, `contextHref`, `neighborsFromWindow`.
- Produces: `getCardNeighbors(client: MeiliSearch, locale: string, card: CardDetailDTO, ctx: NeighborContext | null): Promise<{ prev: Neighbor | null; next: Neighbor | null }>`. Only reads `card.id` and `card.setCode`.

- [ ] **Step 1: Write the failing integration test**

Create `app/web/src/lib/__tests__/card-neighbors.integration.test.ts` (mirrors `search-client.test.ts` — needs live Meili):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createMeiliClient, cardsIndex, cardNumberSortKey, CARD_INDEX_SETTINGS, type SearchDocument,
} from '@revelio/search'
import type { CardDetailDTO } from '@revelio/core'
import { getCardNeighbors, parseNeighborContext } from '../card-neighbors'

const lang = `test${randomUUID().replace(/-/g, '')}`
const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

// Five cards in set BS, numbers 1..5 → deterministic numberSort order a,b,c,d,e.
const docs: SearchDocument[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
  id, setCode: 'BS', number: String(i + 1), numberSort: cardNumberSortKey(String(i + 1)),
  name: id, text: null, flavorText: null, types: [], subTypes: [], lesson: null, rarity: null,
  finishes: [], legality: null, cost: null, damage: null, isOfficial: true,
  imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null,
}))

const card = (id: string): CardDetailDTO => ({ id, setCode: 'BS' } as CardDetailDTO)

beforeAll(async () => {
  const s = await client.index(cardsIndex(lang)).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(cardsIndex(lang)).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(cardsIndex(lang)) })

describe('getCardNeighbors', () => {
  it('set-order fallback returns numberSort neighbors (no context)', async () => {
    const { prev, next } = await getCardNeighbors(client, lang, card('c'), null)
    expect(prev?.id).toBe('b')
    expect(next?.id).toBe('d')
    expect(prev?.href).toBe('/card/b')
    expect(next?.href).toBe('/card/d')
  })

  it('set-order fallback: first card has no prev', async () => {
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), null)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b')
  })

  it('search-context window walks the sorted result set and forwards context', async () => {
    // sort=number → numberSort:asc → order a,b,c,d,e ; 'c' is absolute index 2
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=2'))
    const { prev, next } = await getCardNeighbors(client, lang, card('c'), ctx)
    expect(prev?.id).toBe('b')
    expect(next?.id).toBe('d')
    expect(prev?.href).toBe('/card/b?sort=number&i=1')
    expect(next?.href).toBe('/card/d?sort=number&i=3')
  })

  it('search-context at index 0 has no prev', async () => {
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=0'))
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), ctx)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b')
  })

  it('stale index falls back to set order', async () => {
    // center of the window at index 2 is 'c', but we ask about 'a' → stale → fallback
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=2'))
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), ctx)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b') // plain set-order href, not context
    expect(next?.href).toBe('/card/b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/lib/__tests__/card-neighbors.integration.test.ts`
Expected: FAIL — `getCardNeighbors` is not exported yet. (If it errors on connection, start Meili first: `cd app && docker compose up -d meilisearch`.)

- [ ] **Step 3: Implement `getCardNeighbors`**

Append to `app/web/src/lib/card-neighbors.ts`:

```ts
// Resolve prev/next for a card. With search context, walk the user's result set
// via a 3-wide window; otherwise (or if the index went stale) walk the card's
// own set ordered by numberSort.
export async function getCardNeighbors(
  client: MeiliSearch,
  locale: string,
  card: CardDetailDTO,
  ctx: NeighborContext | null,
): Promise<{ prev: Neighbor | null; next: Neighbor | null }> {
  if (ctx) {
    const offset = Math.max(0, ctx.index - 1)
    const limit = ctx.index === 0 ? 2 : 3
    const { query, options } = toSearchOptions(parseSearchParams(ctx.params))
    const res = await searchCards(client, locale, query, { ...options, window: { offset, limit } })
    const w = neighborsFromWindow(res.hits, card.id, ctx.index)
    if (w) {
      return {
        prev: w.prevId ? { id: w.prevId, href: contextHref(w.prevId, ctx.params, w.prevIndex) } : null,
        next: w.nextId ? { id: w.nextId, href: contextHref(w.nextId, ctx.params, w.nextIndex) } : null,
      }
    }
    // stale index → fall through to set order
  }

  // Set-order fallback. Sets are small (≤ ~200 cards); 500 is a safe ceiling.
  const res = await searchCards(client, locale, '', {
    filters: { setCode: [card.setCode] },
    sort: ['numberSort:asc'],
    hitsPerPage: 500,
  })
  const ids = res.hits.map((h) => h.id)
  const idx = ids.indexOf(card.id)
  return {
    prev: idx > 0 ? { id: ids[idx - 1], href: `/card/${ids[idx - 1]}` } : null,
    next: idx >= 0 && idx < ids.length - 1 ? { id: ids[idx + 1], href: `/card/${ids[idx + 1]}` } : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/lib/__tests__/card-neighbors.integration.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): getCardNeighbors — search-context window with set-order fallback"
```

---

## Task 4: Carry search context from the result grid

Make search-result tiles link with the context params + absolute index; leave every other grid untouched.

**Files:**
- Modify: `app/web/src/components/card-tile.tsx`
- Modify: `app/web/src/components/card-grid.tsx`
- Modify: `app/web/src/app/[locale]/search/page.tsx`
- Test (modify): `app/web/src/components/__tests__/card-tile.test.tsx`
- Test (modify): `app/web/src/components/__tests__/card-grid.test.tsx`

**Interfaces:**
- Consumes: `contextHref` (from `search-params.ts`).
- Produces:
  - `CardTile` gains optional `context?: { params: URLSearchParams; index: number }`.
  - `CardGrid` gains optional `searchParams?: URLSearchParams` and `startIndex?: number`.

- [ ] **Step 1: Write the failing tests**

Append to `app/web/src/components/__tests__/card-tile.test.tsx`:

```ts
describe('CardTile href', () => {
  it('links to the plain card page without context', () => {
    wrap(base)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/card/bs-1')
  })

  it('carries search context (params + absolute index) when given', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CardTile hit={base} imageBase="http://img"
          context={{ params: new URLSearchParams('q=dean&page=2'), index: 30 }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/card/bs-1?q=dean&i=30')
  })
})
```

Append to `app/web/src/components/__tests__/card-grid.test.tsx`:

```ts
describe('CardGrid context plumbing', () => {
  it('gives each tile its absolute index when searchParams + startIndex are set', () => {
    render(
      <CardGrid
        hits={[hit('a', 'Harry Potter'), hit('b', 'Flobberworm')]}
        imageBase="http://img"
        searchParams={new URLSearchParams('q=x')}
        startIndex={24}
      />,
      { wrapper: Wrapper },
    )
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/card/a?q=x&i=24')
    expect(hrefs).toContain('/card/b?q=x&i=25')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -w web -- src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-grid.test.tsx`
Expected: FAIL — `context`/`searchParams`/`startIndex` props do not exist; context hrefs are missing.

- [ ] **Step 3: Add `context` to `CardTile`**

In `app/web/src/components/card-tile.tsx`, add the import and compute the href:

```tsx
import { contextHref } from '@/lib/search-params'
```

```tsx
export function CardTile({
  hit, imageBase, context,
}: {
  hit: SearchDocument
  imageBase: string
  context?: { params: URLSearchParams; index: number }
}) {
  const href = context ? contextHref(hit.id, context.params, context.index) : `/card/${hit.id}`
  return (
    <Link href={href} className="block">
      {/* …unchanged figure/figcaption… */}
    </Link>
  )
}
```

(Only the `Link` `href` changes — leave the figure markup exactly as it is.)

- [ ] **Step 4: Add plumbing to `CardGrid`**

In `app/web/src/components/card-grid.tsx`:

```tsx
export function CardGrid({
  hits, imageBase, searchParams, startIndex = 0,
}: {
  hits: SearchDocument[]
  imageBase: string
  searchParams?: URLSearchParams
  startIndex?: number
}) {
  if (hits.length === 0) {
    return <p className="py-16 text-center text-muted-foreground" role="status">No cards found.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {hits.map((hit, i) => (
        <li key={hit.id}>
          <CardTile
            hit={hit}
            imageBase={imageBase}
            context={searchParams ? { params: searchParams, index: startIndex + i } : undefined}
          />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npm test -w web -- src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-grid.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the search page**

In `app/web/src/app/[locale]/search/page.tsx`, pass the context (the page already has `current: URLSearchParams` and `results`):

```tsx
<CardGrid
  hits={results.hits}
  imageBase={IMAGE_BASE}
  searchParams={current}
  startIndex={(results.page - 1) * results.hitsPerPage}
/>
```

Leave `app/web/src/app/[locale]/sets/[code]/page.tsx` unchanged — set pages fall through to the set-order source on arrival, which is the correct behavior there.

- [ ] **Step 7: Typecheck + full web tests**

Run: `cd app && npm run typecheck && npm test -w web -- src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-grid.test.tsx`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): carry search context (params + index) from result grid to card links"
```

---

## Task 5: `CardNav` client component

Chevrons overlaid on the card (reveal on hover/focus), arrow-key + swipe navigation, and a one-time first-visit hint.

**Files:**
- Create: `app/web/src/components/card-nav.tsx`
- Test (create): `app/web/src/components/__tests__/card-nav.test.tsx`

**Interfaces:**
- Consumes: `type Neighbor` (from `card-neighbors.ts`, via `import type`), `useRouter`/`Link` (next-intl), shadcn `Button`, `Kbd`, `lucide-react` chevrons.
- Produces: `CardNav({ prev, next, labels, children })` where `labels: { prev: string; next: string; hint: string }`. Renders `children` only (no chrome) when both neighbors are null.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/card-nav.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const push = vi.fn()
const prefetch = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push, prefetch }),
  Link: (p: { href: string; children: React.ReactNode; 'aria-label'?: string }) => (
    <a href={p.href} aria-label={p['aria-label']}>{p.children}</a>
  ),
}))

import { CardNav } from '../card-nav'

const labels = { prev: 'Previous card', next: 'Next card', hint: 'to flip between cards' }
const prev = { id: 'p', href: '/card/p?i=1' }
const next = { id: 'n', href: '/card/n?i=3' }

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
}

beforeEach(() => {
  push.mockClear(); prefetch.mockClear(); localStorage.clear(); setReducedMotion(false)
})

function frame(el: HTMLElement) {
  return el.querySelector('[data-testid="card-nav-frame"]') as HTMLElement
}

describe('CardNav', () => {
  it('ArrowRight navigates to next, ArrowLeft to prev', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/card/n?i=3')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith('/card/p?i=1')
  })

  it('does nothing at a missing boundary', () => {
    render(<CardNav prev={null} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys while typing in a field', () => {
    render(
      <>
        <input data-testid="field" />
        <CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>
      </>,
    )
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'ArrowRight' })
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores arrow keys when a modifier is held', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it('swipe left past the threshold goes to next; a tap does nothing', () => {
    const { container } = render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    const f = frame(container)
    fireEvent.touchStart(f, { changedTouches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(f, { changedTouches: [{ clientX: 120, clientY: 108 }] })
    expect(push).toHaveBeenCalledWith('/card/n?i=3')
    push.mockClear()
    fireEvent.touchStart(f, { changedTouches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(f, { changedTouches: [{ clientX: 190, clientY: 100 }] })
    expect(push).not.toHaveBeenCalled()
  })

  it('renders labelled chevron links with the neighbor hrefs', () => {
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByLabelText('Previous card')).toHaveAttribute('href', '/card/p?i=1')
    expect(screen.getByLabelText('Next card')).toHaveAttribute('href', '/card/n?i=3')
  })

  it('shows the one-time hint once, then marks it seen', () => {
    const { unmount } = render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByText('to flip between cards')).toBeInTheDocument()
    expect(localStorage.getItem('revelio.cardNav.hintSeen')).toBe('1')
    unmount()
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.queryByText('to flip between cards')).toBeNull()
  })

  it('skips the hint under prefers-reduced-motion', () => {
    setReducedMotion(true)
    render(<CardNav prev={prev} next={next} labels={labels}><div>card</div></CardNav>)
    expect(screen.queryByText('to flip between cards')).toBeNull()
    expect(localStorage.getItem('revelio.cardNav.hintSeen')).toBeNull()
  })

  it('renders only children when there are no neighbors', () => {
    render(<CardNav prev={null} next={null} labels={labels}><div>card</div></CardNav>)
    expect(screen.getByText('card')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/card-nav.test.tsx`
Expected: FAIL — `card-nav` module does not exist.

- [ ] **Step 3: Implement `CardNav`**

Create `app/web/src/components/card-nav.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useRouter } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import type { Neighbor } from '@/lib/card-neighbors'

const HINT_FLAG = 'revelio.cardNav.hintSeen'
const SWIPE_THRESHOLD = 50 // px

export function CardNav({
  prev, next, labels, children,
}: {
  prev: Neighbor | null
  next: Neighbor | null
  labels: { prev: string; next: string; hint: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  const [hint, setHint] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // One-time first-visit hint, skipped under reduced-motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (localStorage.getItem(HINT_FLAG)) return
    localStorage.setItem(HINT_FLAG, '1')
    setHint(true)
  }, [])

  // Prefetch neighbors so key/swipe navigation is instant.
  useEffect(() => {
    if (prev) router.prefetch(prev.href)
    if (next) router.prefetch(next.href)
  }, [prev, next, router])

  // Arrow-key navigation (ignored while typing or with a modifier held).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) router.push(prev.href)
      else if (e.key === 'ArrowRight' && next) router.push(next.href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, router])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0 && next) router.push(next.href)
    else if (dx > 0 && prev) router.push(prev.href)
  }

  if (!prev && !next) return <>{children}</>

  const chevron =
    'absolute top-1/2 -translate-y-1/2 rounded-full bg-background/70 text-foreground opacity-0 backdrop-blur ' +
    'transition-opacity hover:bg-background/90 focus-visible:opacity-100 group-hover:opacity-100'
  const scrim = 'pointer-events-none absolute inset-y-0 w-24 opacity-0 transition-opacity group-hover:opacity-100'

  return (
    <div>
      <div
        data-testid="card-nav-frame"
        className="group relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
        {prev && (
          <>
            <div className={cn(scrim, 'left-0 rounded-l-xl bg-gradient-to-r from-black/55 to-transparent')} />
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={labels.prev}
              className={cn(chevron, 'left-2', hint && 'opacity-100 motion-safe:animate-pulse')}
            >
              <Link href={prev.href}><ChevronLeft className="size-5" /></Link>
            </Button>
          </>
        )}
        {next && (
          <>
            <div className={cn(scrim, 'right-0 rounded-r-xl bg-gradient-to-l from-black/55 to-transparent')} />
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={labels.next}
              className={cn(chevron, 'right-2', hint && 'opacity-100 motion-safe:animate-pulse')}
            >
              <Link href={next.href}><ChevronRight className="size-5" /></Link>
            </Button>
          </>
        )}
      </div>
      {hint && (
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>{labels.hint}</span>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/card-nav.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): CardNav — overlaid hover chevrons, arrow keys, swipe, one-time hint"
```

---

## Task 6: Wire neighbors into the detail page + localize

Resolve neighbors on the server, render `CardNav` around the card image, and add the i18n strings.

**Files:**
- Modify: `app/web/src/app/[locale]/card/[id]/page.tsx`
- Modify: `app/web/src/components/card-detail.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test (modify): `app/web/src/components/__tests__/card-detail-edit.test.tsx`

**Interfaces:**
- Consumes: `getCardNeighbors`, `parseNeighborContext` (card-neighbors), `getSearchClient` (search-client), `toURLSearchParams` (search-params), `CardNav`, `Neighbor`.
- Produces: `CardDetail` gains `prev?: Neighbor | null` and `next?: Neighbor | null`.

- [ ] **Step 1: Add i18n strings**

In `app/web/messages/en.json`, add to the `card` object:

```json
"prevCard": "Previous card",
"nextCard": "Next card",
"flipHint": "to flip between cards"
```

In `app/web/messages/de.json`, add to the `card` object:

```json
"prevCard": "Vorherige Karte",
"nextCard": "Nächste Karte",
"flipHint": "zum Blättern zwischen Karten"
```

- [ ] **Step 2: Write the failing test**

Add to `app/web/src/components/__tests__/card-detail-edit.test.tsx` (this suite already renders `CardDetail`; check its mock setup and reuse it). Add a case asserting the nav chevrons render when neighbors are passed:

```tsx
it('renders prev/next chevrons when neighbors are provided', () => {
  renderCardDetail({
    // reuse the suite's existing render helper / card fixture;
    // pass neighbor props:
    prev: { id: 'left', href: '/card/left' },
    next: { id: 'right', href: '/card/right' },
  })
  expect(screen.getByLabelText(en.card.prevCard)).toHaveAttribute('href', '/card/left')
  expect(screen.getByLabelText(en.card.nextCard)).toHaveAttribute('href', '/card/right')
})
```

If the existing suite has no reusable helper, mirror its current `render(<CardDetail … />)` call and add the `prev`/`next` props plus the mocks it already uses (`next-intl`, `@/../i18n/navigation`). Ensure `en.card.prevCard` etc. resolve (import `en` from `@/../messages/en.json` as the suite already does, or use the literal strings).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/card-detail-edit.test.tsx`
Expected: FAIL — `CardDetail` does not accept/render neighbors yet.

- [ ] **Step 4: Render `CardNav` in `CardDetail`**

In `app/web/src/components/card-detail.tsx`:

Add the import and a `Neighbor` type import:

```tsx
import { CardNav } from '@/components/card-nav'
import type { Neighbor } from '@/lib/card-neighbors'
```

Extend the props (add to the destructured params and the type):

```tsx
export function CardDetail({
  card, locale, imageBase, canEdit = false, subTypeLabels = {},
  canCollect = false, ownedQuantities = {}, prev = null, next = null,
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
  canEdit?: boolean
  subTypeLabels?: Record<string, string>
  canCollect?: boolean
  ownedQuantities?: Record<string, number>
  prev?: Neighbor | null
  next?: Neighbor | null
}) {
```

Wrap the image block (the `{imgLang ? <CardImage … /> : <div …fallback… />}` expression) in `CardNav`, keeping `AddToCollection` outside the nav:

```tsx
<div className={cn('w-full', horizontal ? 'md:w-[476px]' : 'md:w-[340px]')}>
  <CardNav
    prev={prev}
    next={next}
    labels={{ prev: t('prevCard'), next: t('nextCard'), hint: t('flipHint') }}
  >
    {imgLang ? (
      <CardImage
        src={imageUrl(imageBase, imageKey(card.id, card.localizations[imgLang]!.imageVersion!, imgLang, card.defaultLanguage))}
        alt={loc.name}
        orientation={card.orientation}
        upright
        sizes="(min-width: 768px) 476px, 100vw"
        priority
        frameClassName="rounded-xl border border-border/60 bg-card"
      />
    ) : (
      <div className={cn('relative flex items-center justify-center rounded-xl border border-border/60 bg-card p-4 text-center text-sm text-muted-foreground', horizontal ? 'aspect-[7/5]' : 'aspect-[5/7]')}>
        {loc.name}
      </div>
    )}
  </CardNav>
  {canCollect && (
    <AddToCollection cardId={card.id} finishes={card.finishes}
      quantities={ownedQuantities} locale={locale} className="mt-4" />
  )}
</div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/card-detail-edit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Resolve neighbors in the page**

In `app/web/src/app/[locale]/card/[id]/page.tsx`, add imports:

```tsx
import { getSearchClient } from '@/lib/search-client'
import { getCardNeighbors, parseNeighborContext } from '@/lib/card-neighbors'
import { toURLSearchParams } from '@/lib/search-params'
```

Add `searchParams` to the page signature and resolve neighbors after the card loads:

```tsx
export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const card = await loadCard(id, locale)
  if (!card) notFound()
  const { loc } = pickLocalization(card, locale)
  if (!loc) notFound()
  const session = await getSession()
  const canEdit = hasRequiredRole(session?.user?.role, 'editor')
  const subTypeLabels = await getSubTypeLabelMap(locale)
  const userId = session?.user?.id
  const ownedQuantities = userId
    ? (await getOwnedQuantities(getDb(), userId, [card.id]))[card.id] ?? {}
    : {}
  const ctx = parseNeighborContext(toURLSearchParams(await searchParams))
  const neighbors = await getCardNeighbors(getSearchClient(), locale, card, ctx)
  return (
    <CardDetail
      card={card}
      locale={locale}
      imageBase={IMAGE_BASE}
      canEdit={canEdit}
      subTypeLabels={subTypeLabels}
      canCollect={!!userId}
      ownedQuantities={ownedQuantities}
      prev={neighbors.prev}
      next={neighbors.next}
    />
  )
}
```

- [ ] **Step 7: Typecheck + full web + search test suites**

Run: `cd app && npm run typecheck && npm test -w web && npm test -w @revelio/search`
Expected: PASS across the board (Meili must be up for the integration test: `docker compose up -d meilisearch`).

- [ ] **Step 8: Lint the web workspace**

Run: `cd app && npm run lint -w web`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): card-to-card navigation on the detail page (arrows, swipe, chevrons)"
```

---

## Task 7: Manual verification

Confirm the real behavior end-to-end before opening a PR.

**Files:** none (manual).

- [ ] **Step 1: Start the app**

Run: `cd app && docker compose up -d && npm run dev -w web` (ensure the DB is seeded/ingested if not already).

- [ ] **Step 2: From search → walk results**

Search for a term with many hits, open a card near a page boundary (e.g. the 24th/25th result), then press `→` repeatedly. Confirm it advances through the *result set* (including across the page boundary) and the address bar shows `?…&i=N` incrementing. Press `←` to go back.

- [ ] **Step 3: Direct entry → set order**

Open a card via `/random` (no context). Press `→`/`←` and confirm it walks the card's set in `numberSort` order. Confirm `<link rel="canonical">` in the page source is the clean `/card/<id>`.

- [ ] **Step 4: Chevrons + hover/focus**

Hover the card image → chevrons fade in over each edge; move away → they hide. Tab with the keyboard → the focused chevron becomes visible. At the first card, the left chevron is absent; at the last, the right one is absent.

- [ ] **Step 5: Mobile swipe + one-time hint**

In a mobile viewport / device emulation with a fresh profile (clear `localStorage`), load a card: the swipe-finger/pulse hint plays once. Swipe left/right to change cards. Reload → no hint. Enable "reduce motion" and clear the flag → no hint plays.

- [ ] **Step 6: Editor unaffected**

Open `/card/<id>/edit`, focus a text field, press the arrow keys — confirm they move the caret and do NOT navigate cards.

---

## Self-Review

**Spec coverage:**
- Arrow keys / swipe / chevrons → Task 5 (`CardNav`), wired in Task 6. ✓
- Context-aware ordering (search window + set fallback) → Tasks 1–3, plumbed in Task 4. ✓
- Page-boundary correctness via absolute index → Task 3 window logic + Task 7 Step 2. ✓
- No-JS / a11y baseline (real chevron `<Link>`s, `aria-label`s) → Task 5 + Task 6. ✓
- Overlaid, reveal-on-hover/focus chevrons with scrim → Task 5 CSS. ✓
- One-time first-visit hint (caption + pulse), reduced-motion skip → Task 5. ✓
- Clean canonical, params kept in URL → unchanged `generateMetadata` (verified in Task 7 Step 3). ✓
- Editor untouched → Task 5 input guard + Task 7 Step 6. ✓
- i18n for prev/next/hint (en + de) → Task 6. ✓
- No DB migration / no index-settings change → Global Constraints; `numberSort` already sortable. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the actual code. The only soft spot is Task 6 Step 2, which adapts to the existing `card-detail-edit.test.tsx` render helper — its instructions are explicit about reusing the suite's fixtures/mocks.

**Type consistency:** `Neighbor = { id, href }` and `NeighborContext = { params, index }` are defined once in `card-neighbors.ts` and consumed unchanged in Tasks 4–6. `contextHref(id, params, index)` and `neighborsFromWindow(hits, currentId, index)` signatures match every call site. `SearchOptions.window` from Task 1 is consumed exactly in Task 3. `CardNav` props (`prev`, `next`, `labels`, `children`) match the render in Task 6.

# Web Search Page (Plan 4a-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A URL-driven, server-rendered `/search` page: Server Component reads `searchParams`, calls `searchCards` server-side, renders a thumbnail grid with page-based pagination; client search box, a few quick filter chips (Type, Lesson, Official/Fan) and a sort control update the URL.

**Architecture:** Search state lives in the URL. A pure `search-params` module maps `URLSearchParams` ⟷ `searchCards` options. The `/search` Server Component parses the params, runs the search via a server-only Meili client, and renders `CardGrid` + pagination. Interactive controls are small Client Components that update the URL via next-intl's `useRouter` — no manual hrefs. No backend change: `searchCards`/`buildFilter`/sort already support this.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, `@revelio/search` (server), `@revelio/core`, next-intl, `next/image`, Vitest + @testing-library, Playwright.

## Global Constraints

- Node **20+**, TypeScript, ESM. New code under `app/web/`.
- **Next.js best practices** ([[web-nextjs-best-practices]]): Server Components by default; `"use client"` only for the search box, chips, sort; data fetched server-side; URL is the source of truth (shareable/SEO); `params`/`searchParams` are awaited Promises; next-intl `useRouter`/`Link` (no manual `/${locale}/…`); `next/image` for thumbnails; Meili key server-only.
- **Hybrid results page:** search box + a FEW quick chips (Type, Lesson, Official/Fan) + sort (Relevance/Name/Number/Cost) + grid + page-based pagination. Full filtering (rarity, set, cost, legality, sub-types) is deferred to Advanced Search.
- **Env (server):** `MEILI_HOST`, `MEILI_SEARCH_KEY`. **Env (browser):** `NEXT_PUBLIC_IMAGE_BASE_URL`.
- Sort maps only to the index's sortable attributes: `name`, `number`, `cost` (+ relevance = no sort).
- English identifiers/comments; Conventional Commits.
- Web unit/component tests: `cd app/web && npx vitest run`. Search integration test needs Meili (`TEST_MEILI_HOST=http://localhost:7700`, `TEST_MEILI_KEY=masterKey`, container `revelio-testmeili`) and indexes its own fixtures into a unique index. The full search flow is verified against the seeded compose stack (controller-run, like the backend real-data checks).

## File Structure

```
app/web/
  next.config.ts                         # + images.remotePatterns from NEXT_PUBLIC_IMAGE_BASE_URL
  src/
    lib/
      search-params.ts                   # parse/serialize URL <-> search state (pure)
      search-client.ts                   # server-only Meili client + runSearch
      attribute-labels.ts                # attrLabel(scope, code, locale) from bundled i18n
    i18n/attribute-labels/
      en.json  de.json                   # copied from card-data/i18n (bundled)
    app/[locale]/search/
      page.tsx                           # SSR search page
    components/
      card-grid.tsx  card-tile.tsx       # results grid (server)
      pagination.tsx                     # prev/next (server, next-intl Link)
      search-box.tsx                     # client (debounced -> q)
      quick-filters.tsx                  # client (Type/Lesson/Official chips -> url)
      sort-select.tsx                    # client (sort -> url)
      __tests__/                         # component tests
    lib/__tests__/search-params.test.ts
    lib/__tests__/search-client.test.ts  # integration (real Meili)
  e2e/search.spec.ts                     # Playwright (against seeded stack)
```

---

### Task 1: URL ⟷ search-state mapping (pure)

**Files:**
- Create: `app/web/src/lib/search-params.ts`
- Test: `app/web/src/lib/__tests__/search-params.test.ts`

**Interfaces:**
- Consumes: `CardFilters`, `SearchOptions` types from `@revelio/search`.
- Produces:
  - `type SortKey = 'relevance' | 'name' | 'number' | 'cost'`
  - `type SearchState = { q: string; types: string[]; lessons: string[]; official: boolean | null; sort: SortKey; page: number }`
  - `parseSearchParams(sp: URLSearchParams): SearchState`
  - `toURLSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams`
  - `toSearchOptions(state: SearchState): { query: string; options: SearchOptions }`
  - `withParams(current: URLSearchParams, patch: Record<string, string | string[] | null>): URLSearchParams` (resets `page` unless only `page` changed)

- [ ] **Step 1: Write the failing test**

`app/web/src/lib/__tests__/search-params.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  parseSearchParams, toSearchOptions, withParams, toURLSearchParams,
} from '../search-params'

describe('search-params', () => {
  it('parses defaults', () => {
    expect(parseSearchParams(new URLSearchParams())).toEqual({
      q: '', types: [], lessons: [], official: null, sort: 'relevance', page: 1,
    })
  })

  it('parses query, multi filters, official and page', () => {
    const sp = new URLSearchParams('q=harry&type=character&type=creature&lesson=charms&official=fan&sort=name&page=3')
    expect(parseSearchParams(sp)).toEqual({
      q: 'harry', types: ['character', 'creature'], lessons: ['charms'],
      official: false, sort: 'name', page: 3,
    })
  })

  it('falls back to relevance/page 1 on bad input', () => {
    const sp = new URLSearchParams('sort=bogus&page=0')
    const s = parseSearchParams(sp)
    expect(s.sort).toBe('relevance')
    expect(s.page).toBe(1)
  })

  it('maps state to searchCards options', () => {
    const { query, options } = toSearchOptions({
      q: 'harry', types: ['creature'], lessons: [], official: true, sort: 'cost', page: 2,
    })
    expect(query).toBe('harry')
    expect(options.filters).toEqual({ types: ['creature'], isOfficial: true })
    expect(options.sort).toEqual(['cost:asc'])
    expect(options.page).toBe(2)
    // relevance -> no sort
    expect(toSearchOptions({ q: '', types: [], lessons: [], official: null, sort: 'relevance', page: 1 }).options.sort).toBeUndefined()
  })

  it('withParams sets a value and resets page', () => {
    const cur = new URLSearchParams('q=harry&page=4')
    const next = withParams(cur, { type: ['creature'] })
    expect(next.getAll('type')).toEqual(['creature'])
    expect(next.get('q')).toBe('harry')
    expect(next.has('page')).toBe(false) // reset
  })

  it('withParams keeps page when only page changes', () => {
    const next = withParams(new URLSearchParams('q=x'), { page: '2' })
    expect(next.get('page')).toBe('2')
  })

  it('toURLSearchParams handles array + scalar record', () => {
    const p = toURLSearchParams({ q: 'x', type: ['a', 'b'], page: undefined })
    expect(p.get('q')).toBe('x')
    expect(p.getAll('type')).toEqual(['a', 'b'])
    expect(p.has('page')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/web && npx vitest run search-params`
Expected: FAIL — `Cannot find module '../search-params'`.

- [ ] **Step 3: Write the implementation**

`app/web/src/lib/search-params.ts`:
```ts
import type { CardFilters, SearchOptions } from '@revelio/search'

export type SortKey = 'relevance' | 'name' | 'number' | 'cost'
export type SearchState = {
  q: string
  types: string[]
  lessons: string[]
  official: boolean | null
  sort: SortKey
  page: number
}

const SORT_KEYS: SortKey[] = ['relevance', 'name', 'number', 'cost']
const SORT_MEILI: Record<Exclude<SortKey, 'relevance'>, string> = {
  name: 'name:asc',
  number: 'number:asc',
  cost: 'cost:asc',
}
const HITS_PER_PAGE = 24

export function parseSearchParams(sp: URLSearchParams): SearchState {
  const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  const official = sp.get('official')
  const sort = sp.get('sort') as SortKey | null
  const page = Math.floor(Number(sp.get('page') ?? '1'))
  return {
    q: sp.get('q') ?? '',
    types: list('type'),
    lessons: list('lesson'),
    official: official === 'official' ? true : official === 'fan' ? false : null,
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'relevance',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

export function toURLSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(record)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v != null) p.set(k, v)
  }
  return p
}

export function toSearchOptions(state: SearchState): { query: string; options: SearchOptions } {
  const filters: CardFilters = {}
  if (state.types.length) filters.types = state.types
  if (state.lessons.length) filters.lesson = state.lessons
  if (state.official !== null) filters.isOfficial = state.official
  return {
    query: state.q,
    options: {
      filters,
      sort: state.sort === 'relevance' ? undefined : [SORT_MEILI[state.sort]],
      page: state.page,
      hitsPerPage: HITS_PER_PAGE,
    },
  }
}

export function withParams(
  current: URLSearchParams,
  patch: Record<string, string | string[] | null>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  for (const [k, v] of Object.entries(patch)) {
    next.delete(k)
    if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
    else if (v !== null && v !== '') next.set(k, v)
  }
  // Any change other than paging returns to page 1.
  if (Object.keys(patch).some((k) => k !== 'page')) next.delete('page')
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/web && npx vitest run search-params`
Expected: PASS (7 tests). Pure — no infra.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/search-params.ts app/web/src/lib/__tests__/search-params.test.ts
git commit -m "feat: url <-> search-state mapping for the search page"
```

---

### Task 2: Server search + results grid (SSR)

**Files:**
- Create: `app/web/src/lib/search-client.ts`, `app/web/src/components/card-tile.tsx`, `app/web/src/components/card-grid.tsx`, `app/web/src/components/pagination.tsx`, `app/web/src/app/[locale]/search/page.tsx`
- Modify: `app/web/next.config.ts` (images.remotePatterns)
- Test: `app/web/src/lib/__tests__/search-client.test.ts` (integration, real Meili), `app/web/src/components/__tests__/card-grid.test.tsx`

**Interfaces:**
- Consumes: `search-params` (`toSearchOptions`, `SearchState`), `@revelio/search` (`createMeiliClient`, `searchCards`, `cardsIndex`, `CARD_INDEX_SETTINGS`, `SearchDocument`, `SearchResult`), `@revelio/core` (`imageUrl`, `thumbKey`).
- Produces:
  - `getSearchClient(): MeiliSearch` (server-only, from env)
  - `runSearch(client, lang: string, state: SearchState): Promise<SearchResult>`
  - `<CardGrid hits={SearchDocument[]} imageBase={string} />`, `<CardTile hit imageBase />`, `<Pagination page total hitsPerPage searchParams />`

- [ ] **Step 1: Write the server search module**

`app/web/src/lib/search-client.ts`:
```ts
import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient, searchCards, type SearchResult } from '@revelio/search'
import { toSearchOptions, type SearchState } from './search-params'

export function getSearchClient(): MeiliSearch {
  const host = process.env.MEILI_HOST
  if (!host) throw new Error('MEILI_HOST is required')
  return createMeiliClient(host, process.env.MEILI_SEARCH_KEY ?? '')
}

export async function runSearch(
  client: MeiliSearch, lang: string, state: SearchState,
): Promise<SearchResult> {
  const { query, options } = toSearchOptions(state)
  return searchCards(client, lang, query, options)
}
```

- [ ] **Step 2: Write the failing integration test**

`app/web/src/lib/__tests__/search-client.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createMeiliClient, cardsIndex, CARD_INDEX_SETTINGS, type SearchDocument } from '@revelio/search'
import { runSearch } from '../search-client'
import { parseSearchParams } from '../search-params'

const lang = `test${randomUUID().replace(/-/g, '')}`
const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', setName: 'Base', number: '1', name: 'Harry Potter', text: null, flavorText: null, types: ['character'], subTypes: [], lesson: null, lessonColor: null, rarity: 'rare', finish: 'normal', legality: 'legal', cost: null, isOfficial: true, imageFile: 'x.png' },
  { id: 'b', setCode: 'BS', setName: 'Base', number: '2', name: 'Flobberworm', text: null, flavorText: null, types: ['creature'], subTypes: [], lesson: null, lessonColor: null, rarity: 'common', finish: 'normal', legality: 'legal', cost: 2, isOfficial: false, imageFile: null },
]

beforeAll(async () => {
  const s = await client.index(cardsIndex(lang)).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(cardsIndex(lang)).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(cardsIndex(lang)) })

describe('runSearch', () => {
  it('full-text search returns matching cards', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('q=harry')))
    expect(r.hits.map((h) => h.id)).toContain('a')
  })

  it('applies a type filter from the url', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('type=creature')))
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('applies the official/fan filter', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('official=fan')))
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run search-client`
Expected: FAIL — `Cannot find module '../search-client'`. (After Step 1 exists, note: `getSearchClient` imports `server-only`; the test imports `runSearch` which is fine, but if vitest chokes on `server-only`, alias it to an empty module in `vitest.config.ts`: `'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url))` with `test/empty.ts` = `export {}`.)

- [ ] **Step 4: (module exists from Step 1) Run test to verify it passes**

Run: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run search-client`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the results components**

`app/web/src/components/card-tile.tsx`:
```tsx
import Image from 'next/image'
import type { SearchDocument } from '@revelio/search'
import { imageUrl, thumbKey } from '@revelio/core'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <figure className="group overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="relative aspect-[5/7] bg-muted">
        {hit.imageFile ? (
          <Image
            src={imageUrl(imageBase, thumbKey(hit.id))}
            alt={hit.name}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover transition group-hover:brightness-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {hit.name}
          </div>
        )}
      </div>
      <figcaption className="truncate px-2 py-1 text-sm">{hit.name}</figcaption>
    </figure>
  )
}
```

`app/web/src/components/card-grid.tsx`:
```tsx
import type { SearchDocument } from '@revelio/search'
import { CardTile } from './card-tile'

export function CardGrid({ hits, imageBase }: { hits: SearchDocument[]; imageBase: string }) {
  if (hits.length === 0) {
    return <p className="py-16 text-center text-muted-foreground" role="status">No cards found.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {hits.map((hit) => (
        <li key={hit.id}>
          <CardTile hit={hit} imageBase={imageBase} />
        </li>
      ))}
    </ul>
  )
}
```

`app/web/src/components/pagination.tsx`:
```tsx
import { Link } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'

export function Pagination({
  page, total, hitsPerPage, current,
}: {
  page: number
  total: number
  hitsPerPage: number
  current: URLSearchParams
}) {
  const lastPage = Math.max(1, Math.ceil(total / hitsPerPage))
  if (lastPage <= 1) return null
  const href = (p: number) => `/search?${withParams(current, { page: String(p) }).toString()}`
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)}>← Prev</Link>}
      <span className="text-muted-foreground">Page {page} of {lastPage}</span>
      {page < lastPage && <Link href={href(page + 1)}>Next →</Link>}
    </nav>
  )
}
```

- [ ] **Step 6: Write the CardGrid component test**

`app/web/src/components/__tests__/card-grid.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardGrid } from '../card-grid'
import type { SearchDocument } from '@revelio/search'

vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img alt={props.alt as string} /> }))

const hit = (id: string, name: string): SearchDocument => ({
  id, setCode: 'BS', setName: 'Base', number: '1', name, text: null, flavorText: null,
  types: [], subTypes: [], lesson: null, lessonColor: null, rarity: null, finish: null,
  legality: null, cost: null, isOfficial: true, imageFile: 'x.png',
})

describe('CardGrid', () => {
  it('renders a tile per hit with the card name', () => {
    render(<CardGrid hits={[hit('a', 'Harry Potter'), hit('b', 'Flobberworm')]} imageBase="http://img" />)
    expect(screen.getByText('Harry Potter')).toBeInTheDocument()
    expect(screen.getByAltText('Flobberworm')).toBeInTheDocument()
  })

  it('shows an empty state when there are no hits', () => {
    render(<CardGrid hits={[]} imageBase="http://img" />)
    expect(screen.getByRole('status')).toHaveTextContent(/no cards found/i)
  })
})
```

- [ ] **Step 7: Write the `/search` page + image remotePatterns**

`app/web/src/app/[locale]/search/page.tsx`:
```tsx
import { setRequestLocale } from 'next-intl/server'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toURLSearchParams } from '@/lib/search-params'
import { CardGrid } from '@/components/card-grid'
import { Pagination } from '@/components/pagination'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const current = toURLSearchParams(await searchParams)
  const state = parseSearchParams(current)
  const results = await runSearch(getSearchClient(), locale, state)

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <p className="mb-4 text-sm text-muted-foreground" role="status">
        {results.total} cards
      </p>
      <CardGrid hits={results.hits} imageBase={IMAGE_BASE} />
      <Pagination
        page={results.page}
        total={results.total}
        hitsPerPage={results.hitsPerPage}
        current={current}
      />
    </main>
  )
}
```
(The interactive search box / chips / sort are added in Task 3; this task renders results from the URL.)

Modify `app/web/next.config.ts` — add `images.remotePatterns` derived from the image base URL, before `export default`:
```ts
const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL
const remotePatterns = imageBase
  ? [(() => {
      const u = new URL(imageBase)
      return { protocol: u.protocol.replace(':', '') as 'http' | 'https', hostname: u.hostname, port: u.port, pathname: '/**' }
    })()]
  : []
```
and set `images: { remotePatterns }` on the `nextConfig` object (keep the existing `turbopack.root`).

- [ ] **Step 8: Run the component + integration tests + build**

Run:
```bash
cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run card-grid search-client search-params
npx next build
```
Expected: all tests PASS; build succeeds (the `/search` route appears — it's dynamic since it reads searchParams).

- [ ] **Step 9: Commit**

```bash
git add app/web/src/lib/search-client.ts app/web/src/components/card-tile.tsx app/web/src/components/card-grid.tsx app/web/src/components/pagination.tsx "app/web/src/app/[locale]/search/page.tsx" app/web/next.config.ts app/web/src/lib/__tests__/search-client.test.ts app/web/src/components/__tests__/card-grid.test.tsx
git commit -m "feat: SSR /search page with results grid and pagination"
```

---

### Task 3: Interactive controls (search box, quick chips, sort) + attribute labels

**Files:**
- Create: `app/web/src/i18n/attribute-labels/en.json`, `de.json` (copied from `card-data/i18n`)
- Create: `app/web/src/lib/attribute-labels.ts`
- Create: `app/web/src/components/search-box.tsx`, `quick-filters.tsx`, `sort-select.tsx`, `search-controls.tsx`
- Modify: `app/web/src/app/[locale]/search/page.tsx` (mount `<SearchControls/>`)
- Test: `app/web/src/components/__tests__/search-box.test.tsx`, `quick-filters.test.tsx`

**Interfaces:**
- Consumes: `@revelio/core` (`TYPES`, `LESSONS`, `slugify`), `search-params` (`withParams`, `parseSearchParams`), next-intl navigation (`useRouter`, `usePathname`).
- Produces: `attrLabel(scope, code, locale)`; `<SearchBox/>`, `<QuickFilters/>`, `<SortSelect/>`, `<SearchControls/>`.

- [ ] **Step 1: Bundle the attribute labels + helper**

Copy the label files:
```bash
cp card-data/i18n/labels.en.json app/web/src/i18n/attribute-labels/en.json
cp card-data/i18n/labels.de.json app/web/src/i18n/attribute-labels/de.json
```
`app/web/src/lib/attribute-labels.ts`:
```ts
import en from '@/i18n/attribute-labels/en.json'
import de from '@/i18n/attribute-labels/de.json'
import { slugify } from '@revelio/core'

// The label files are keyed by the original strings ("Charms"); slugify to match our codes.
type LabelFile = Record<string, unknown>
const FILES: Record<string, LabelFile> = { en: en as LabelFile, de: de as LabelFile }

export function attrLabel(scope: 'types' | 'lessons' | 'rarities' | 'finishes', code: string, locale: string): string {
  const dict = (FILES[locale]?.[scope] ?? FILES.en?.[scope]) as Record<string, string> | undefined
  if (dict) {
    for (const [rawKey, label] of Object.entries(dict)) {
      if (slugify(rawKey) === code) return label
    }
  }
  return code
}
```
Note: this bundles a copy of the label files into the web; Plan 5 refreshes them at image build.

- [ ] **Step 2: Write the failing search-box + quick-filters tests**

`app/web/src/components/__tests__/search-box.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SearchBox } from '../search-box'

describe('SearchBox', () => {
  it('debounced typing updates the q param via router.replace', async () => {
    render(<SearchBox placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 1000 })
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/q=harry/)
  })
})
```

`app/web/src/components/__tests__/quick-filters.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { QuickFilters } from '../quick-filters'

describe('QuickFilters', () => {
  it('toggling a type chip adds it to the url', () => {
    render(<QuickFilters locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: /creature/i }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/type=creature/)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app/web && npx vitest run search-box quick-filters`
Expected: FAIL — components not found.

- [ ] **Step 4: Write the client components**

`app/web/src/components/search-box.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { useRef } from 'react'
import { withParams } from '@/lib/search-params'

export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = withParams(new URLSearchParams(params.toString()), { q: value })
      router.replace(`${pathname}?${next.toString()}`)
    }, 300)
  }

  return (
    <input
      type="search"
      role="searchbox"
      defaultValue={params.get('q') ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-4 py-2 text-base outline-none focus:ring-2 focus:ring-ring"
    />
  )
}
```

`app/web/src/components/quick-filters.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES, LESSONS } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'

export function QuickFilters({ locale }: { locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const state = parseSearchParams(new URLSearchParams(params.toString()))

  function apply(patch: Record<string, string | string[] | null>) {
    const next = withParams(new URLSearchParams(params.toString()), patch)
    router.replace(`${pathname}?${next.toString()}`)
  }
  function toggle(key: 'type' | 'lesson', current: string[], code: string) {
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    apply({ [key]: next })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TYPES.map((t) => {
        const active = state.types.includes(t.code)
        return (
          <button
            key={t.code}
            type="button"
            aria-pressed={active}
            onClick={() => toggle('type', state.types, t.code)}
            className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
          >
            {attrLabel('types', t.code, locale)}
          </button>
        )
      })}
      {LESSONS.map((l) => {
        const active = state.lessons.includes(l.code)
        return (
          <button
            key={l.code}
            type="button"
            aria-pressed={active}
            onClick={() => toggle('lesson', state.lessons, l.code)}
            style={{ borderColor: l.color, color: active ? '#fff' : l.color, backgroundColor: active ? l.color : 'transparent' }}
            className="rounded-full border px-3 py-1 text-sm"
          >
            {attrLabel('lessons', l.code, locale)}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={state.official === true}
        onClick={() => apply({ official: state.official === true ? null : 'official' })}
        className={`rounded-full border px-3 py-1 text-sm ${state.official === true ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
      >
        Official
      </button>
      <button
        type="button"
        aria-pressed={state.official === false}
        onClick={() => apply({ official: state.official === false ? null : 'fan' })}
        className={`rounded-full border px-3 py-1 text-sm ${state.official === false ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
      >
        Fan / Revival
      </button>
    </div>
  )
}
```

`app/web/src/components/sort-select.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams, type SortKey } from '@/lib/search-params'

const OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Number' },
  { key: 'cost', label: 'Cost' },
]

export function SortSelect() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  function onChange(value: string) {
    const patch = { sort: value === 'relevance' ? null : value }
    router.replace(`${pathname}?${withParams(new URLSearchParams(params.toString()), patch).toString()}`)
  }
  return (
    <select
      aria-label="Sort by"
      defaultValue={params.get('sort') ?? 'relevance'}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      {OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  )
}
```

`app/web/src/components/search-controls.tsx`:
```tsx
import { getTranslations } from 'next-intl/server'
import { SearchBox } from './search-box'
import { QuickFilters } from './quick-filters'
import { SortSelect } from './sort-select'

export async function SearchControls({ locale }: { locale: string }) {
  const t = await getTranslations('search')
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1"><SearchBox placeholder={t('placeholder')} /></div>
        <SortSelect />
      </div>
      <QuickFilters locale={locale} />
    </div>
  )
}
```

- [ ] **Step 5: Add the `search` messages + mount controls**

Add a `search` namespace to `app/web/messages/en.json` and `de.json`:
```json
"search": { "placeholder": "Search cards…", "results": "{count} cards" }
```
(de: `"placeholder": "Karten suchen…", "results": "{count} Karten"`).
In `app/web/src/app/[locale]/search/page.tsx`, import and render `<SearchControls locale={locale} />` above `<CardGrid/>`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app/web && npx vitest run search-box quick-filters`
Expected: PASS. Then `npx next build` succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components app/web/src/lib/attribute-labels.ts app/web/src/i18n/attribute-labels "app/web/src/app/[locale]/search/page.tsx" app/web/messages
git commit -m "feat: search box, quick filter chips and sort control"
```

---

### Task 4: Home search box + Playwright e2e (seeded stack)

**Files:**
- Modify: `app/web/src/app/[locale]/page.tsx` (hero search box → /search)
- Create: `app/web/src/components/home-search.tsx`
- Create: `app/web/e2e/search.spec.ts`
- Modify: `app/web/messages/{en,de}.json` (home CTA)

**Interfaces:**
- Consumes: next-intl navigation (`useRouter`), `search` messages.
- Produces: `<HomeSearch/>` on the home page; a Playwright search flow spec.

- [ ] **Step 1: Home hero search box**

`app/web/src/components/home-search.tsx`:
```tsx
'use client'
import { useRouter } from '@/../i18n/navigation'
import { useState } from 'react'

export function HomeSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`) }}
      className="mx-auto mt-8 flex max-w-xl gap-2"
    >
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
      />
      <button type="submit" className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">
        Search
      </button>
    </form>
  )
}
```
Mount it in `app/web/src/app/[locale]/page.tsx`'s `Home` under the tagline: `<HomeSearch placeholder={t('searchPlaceholder')} />` — but `Home` is a Server Component using `useTranslations`; the `HomeSearch` client component just needs the placeholder string as a prop, so pass `t('searchPlaceholder')`. Add `"searchPlaceholder"` to the `home` namespace in both messages files (`"Search cards…"` / `"Karten suchen…"`).

- [ ] **Step 2: Write the Playwright search e2e**

`app/web/e2e/search.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

// Requires the web running with MEILI_HOST/MEILI_SEARCH_KEY pointed at a SEEDED Meili
// (the compose stack). Skipped automatically if the search index has no data.
test('search from home shows results and a type filter narrows them', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('search').getByRole('searchbox').fill('harry')
  await page.getByRole('button', { name: /^search$/i }).click()
  await expect(page).toHaveURL(/\/search\?q=harry/)
  await expect(page.getByText(/\d+ cards/)).toBeVisible()
  await expect(page.getByRole('figure').first()).toBeVisible()

  const before = await page.getByRole('figure').count()
  await page.getByRole('button', { name: /creature/i }).click()
  await expect(page).toHaveURL(/type=creature/)
  await expect(page.getByRole('figure').first()).toBeVisible()
  expect(await page.getByRole('figure').count()).toBeLessThanOrEqual(before)
})
```

- [ ] **Step 3: Component test for HomeSearch**

`app/web/src/components/__tests__/home-search.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))

import { HomeSearch } from '../home-search'

describe('HomeSearch', () => {
  it('submits to /search with the query', () => {
    render(<HomeSearch placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(push).toHaveBeenCalledWith('/search?q=harry')
  })
})
```

- [ ] **Step 4: Run component tests + build**

Run: `cd app/web && npx vitest run && npx next build`
Expected: all component tests PASS; build succeeds.

- [ ] **Step 5: Real-data verification (controller / manual, against the seeded stack)**

This uses the seeded compose stack (Postgres + Meili + MinIO from Plan 3). Run:
```bash
cd app && docker compose up -d postgres meilisearch minio
docker compose run --rm -T ingest      # seeds Postgres + Meili + MinIO
# run the web pointed at the stack:
cd web && MEILI_HOST=http://localhost:7700 MEILI_SEARCH_KEY=masterKey \
  NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:9000/card-images \
  npm run build && npm run start &
# then Playwright against it:
npx playwright test search
```
Note: Meili/MinIO ports must be published to the host for the browser/web to reach them (the base compose does not publish them; publish 7700/9000 for this check, or run the check inside the network). Expect: `/search?q=harry` shows the grid; the Creature chip narrows results. Tear down with `docker compose down -v` afterwards.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/home-search.tsx "app/web/src/app/[locale]/page.tsx" app/web/src/components/__tests__/home-search.test.tsx app/web/e2e/search.spec.ts app/web/messages
git commit -m "feat: home hero search box and search e2e"
```

---

## Self-Review

**Spec coverage (Search page section):**
- URL-driven SSR `/search` (searchParams → searchCards → grid) → Tasks 1, 2 ✓
- Client search box (debounced → q), quick chips (Type/Lesson/Official), sort → Task 3 ✓
- Chip options from `@revelio/core`; labels from bundled i18n; lesson colors inline → Task 3 ✓
- Thumbnail grid via `next/image` + `imageUrl`+`thumbKey`; remotePatterns → Task 2 ✓
- Page-based pagination → Task 2 ✓
- Home hero search box → /search → Task 4 ✓
- No backend change (uses existing `searchCards`) → confirmed (Tasks use `@revelio/search` as-is) ✓
- Server-only Meili key → `search-client.ts` (`import 'server-only'`) ✓
- Advanced Search (rarity/set/cost/legality/subtypes, set/rarity sort) → deferred (noted) ✓

**Placeholder scan:** No TBD/TODO. The `server-only` vitest alias (Task 2 Step 3) and the label-file copy (Task 3) are concrete, bounded instructions. The Task 4 Step 5 verification is controller/manual (like the backend real-data checks), explicitly scoped.

**Type consistency:** `SearchState`/`SortKey` (Task 1) consumed by `runSearch`/controls (Tasks 2–3). `withParams`/`parseSearchParams`/`toURLSearchParams` (Task 1) used by page, pagination, and all controls. `SearchDocument`/`SearchResult` come from `@revelio/search`. `attrLabel(scope, code, locale)` (Task 3) called by `QuickFilters`. next-intl navigation `Link`/`useRouter`/`usePathname` used consistently (no manual hrefs).

## Notes for later plans

- **4a-3 (detail + sets):** card tiles link to `/card/[id]` (SSR detail via `@revelio/db`); set overview.
- **Advanced Search slice:** full filter form (rarity/set/cost/legality/subtypes/finish) building the same URL params; add `rarity`/`setCode` to Meili `sortableAttributes` (+ reindex) for set/rarity sort.
- **Plan 5:** copy `card-data/i18n/labels.*.json` into the web image at build (the committed copy in `src/i18n/attribute-labels/` is a dev convenience); publish Meili/MinIO or front them with a public host + a search-only Meili key; CI seeds a Meili for the search e2e.

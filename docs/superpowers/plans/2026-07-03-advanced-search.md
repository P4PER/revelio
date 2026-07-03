# Advanced Search — Filter Drawer (Plan 4a-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full filter drawer (shadcn `Sheet`) + removable active-filter chips to `/search`: Set, Type, Lesson, Rarity, Finish, Legality, a Cost range, and Official/Fan — all URL-driven — replacing the quick chips.

**Architecture:** URL stays the source of truth. Extend the pure `search-params` mapping + `buildFilter` (cost range) so the existing SSR search covers the new params. A client `FilterDrawer` holds a pending selection and pushes `/search?…` on Apply; a client `ActiveFilters` renders removable `Badge`s from the URL. No reindex.

**Tech Stack:** Next.js 16 (App Router, RSC), shadcn/ui (Sheet/Checkbox/Label/Input/Select/Button/Badge), `@revelio/search`, `@revelio/core`, `@revelio/db` (`listSets`), next-intl, Vitest + @testing-library + user-event.

## Global Constraints

- Node **20+**, TypeScript, ESM. Changes under `app/web/`, `app/search/`.
- **Next.js best practices** ([[web-nextjs-best-practices]]): `FilterDrawer`/`ActiveFilters` are the only new client components; URL via next-intl `useRouter().push` (no manual `/${locale}/…`); `params`/`searchParams` awaited; server data (`listSets`) fetched in the Server Component.
- **Drawer replaces the quick chips.** Active-filter chips are the on-page filter view.
- **Set stays single-select** (reuses the existing `set` URL param — no rename; `/sets/[code]` unchanged). Type/Lesson/Rarity/Finish/Legality are multi-select; Cost is a min/max range; Official is official/fan/any.
- **Backend:** add `costMin`/`costMax` to `CardFilters` + `buildFilter` (`cost >= min` / `cost <= max`); `cost` already filterable → **no reindex**. All other facets already supported by `buildFilter`.
- Filter option lists from `@revelio/core` (`TYPES`/`LESSONS`/`RARITIES`/`FINISHES`/`LEGALITIES`) + `listSets`. Labels via `attrLabel` (types/lessons/rarities/finishes); **legality humanized** (no label group).
- English identifiers/comments; Conventional Commits. Web tests: `cd app/web && npx vitest run`. `buildFilter` test needs Meili (`TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey`).
- **Env note:** the `shadcn add sheet` CLI + npm installs must run in the CONTROLLER (interactive CLI stalls subagents; `~/.npm` is root-owned → `NPM_CONFIG_CACHE=<scratchpad>/npm-cache`). Task 2 Step 1 is a controller prerequisite.

## File Structure

```
app/search/src/search.ts                 # CardFilters += costMin/costMax; buildFilter cost clauses
app/web/src/lib/search-params.ts         # SearchState += rarity/finish/legality/costMin/costMax
app/web/src/components/ui/sheet.tsx       # shadcn Sheet (CLI, controller)
app/web/src/components/filter-drawer.tsx  # client: Sheet with all filters -> Apply/Clear
app/web/src/components/active-filters.tsx # client: removable Badge per active param
app/web/src/components/search-controls.tsx# mount FilterDrawer + ActiveFilters (drop QuickFilters)
app/web/src/app/[locale]/search/page.tsx  # pass listSets(getDb()) to controls
app/web/src/components/quick-filters.tsx  # DELETED (replaced)
app/web/messages/{en,de}.json             # filter drawer labels
app/web/e2e/advanced-search.spec.ts       # resilient e2e
```

---

### Task 1: Filter plumbing — cost range + new URL params

**Files:**
- Modify: `app/search/src/search.ts` (CardFilters + buildFilter)
- Modify: `app/web/src/lib/search-params.ts` (SearchState + parse + toSearchOptions)
- Test: `app/search/src/search.test.ts` (add cost-range cases), `app/web/src/lib/__tests__/search-params.test.ts` (add new-field cases)

**Interfaces:**
- Produces:
  - `CardFilters` gains `costMin?: number`, `costMax?: number`.
  - `SearchState` gains `rarities: string[]`, `finishes: string[]`, `legalities: string[]`, `costMin: number | null`, `costMax: number | null`.
  - `buildFilter` emits `cost >= N` / `cost <= N` clauses.

- [ ] **Step 1: Extend CardFilters + buildFilter (cost range)**

In `app/search/src/search.ts`, add to `CardFilters`:
```ts
  isOfficial?: boolean
  costMin?: number
  costMax?: number
```
and in `buildFilter`, after the `isOfficial` clause and before `return clauses`:
```ts
  if (f.costMin != null) clauses.push(`cost >= ${f.costMin}`)
  if (f.costMax != null) clauses.push(`cost <= ${f.costMax}`)
```

- [ ] **Step 2: Add the failing buildFilter/search cost test**

In `app/search/src/search.test.ts`, add a test that indexes a couple of docs with costs and filters by range. Find the existing `beforeAll` fixture list; add two docs with distinct `cost` (e.g. one `cost: 1`, one `cost: 5`) if not present, then:
```ts
it('filters by a cost range', () => {
  expect(buildFilter({ costMin: 2 })).toContain('cost >= 2')
  expect(buildFilter({ costMax: 4 })).toContain('cost <= 4')
  expect(buildFilter({ costMin: 2, costMax: 4 })).toEqual(['cost >= 2', 'cost <= 4'])
})
```
(This is a pure `buildFilter` assertion — no Meili round-trip needed for it. Keep it in the same file so it runs with the suite.)
Run: `cd app/search && npx vitest run search` → FAIL first (no cost clauses), PASS after Step 1.

- [ ] **Step 3: Extend SearchState + parse + toSearchOptions**

Edit `app/web/src/lib/search-params.ts`:
- Add to `SearchState`: `rarities: string[]`, `finishes: string[]`, `legalities: string[]`, `costMin: number | null`, `costMax: number | null`.
- In `parseSearchParams`, add a numeric helper and the fields:
```ts
  const num = (k: string): number | null => {
    const v = sp.get(k)
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
```
and in the returned object (after `set`):
```ts
    rarities: list('rarity'),
    finishes: list('finish'),
    legalities: list('legality'),
    costMin: num('costMin'),
    costMax: num('costMax'),
```
- In `toSearchOptions`, after the `set` mapping:
```ts
  if (state.rarities.length) filters.rarity = state.rarities
  if (state.finishes.length) filters.finish = state.finishes
  if (state.legalities.length) filters.legality = state.legalities
  if (state.costMin != null) filters.costMin = state.costMin
  if (state.costMax != null) filters.costMax = state.costMax
```

- [ ] **Step 4: Add search-params tests**

In `app/web/src/lib/__tests__/search-params.test.ts`, add:
```ts
it('parses rarity/finish/legality and cost range', () => {
  const sp = new URLSearchParams('rarity=rare&finish=foil&legality=legal&costMin=2&costMax=5')
  const s = parseSearchParams(sp)
  expect(s.rarities).toEqual(['rare'])
  expect(s.finishes).toEqual(['foil'])
  expect(s.legalities).toEqual(['legal'])
  expect(s.costMin).toBe(2)
  expect(s.costMax).toBe(5)
})

it('maps the new fields to CardFilters', () => {
  const { options } = toSearchOptions({
    q: '', types: [], lessons: [], official: null, sort: 'relevance', page: 1,
    rarities: ['rare'], finishes: [], legalities: ['legal'], costMin: 2, costMax: null,
  })
  expect(options.filters).toEqual({ rarity: ['rare'], legality: ['legal'], costMin: 2 })
})

it('leaves cost null when absent or non-numeric', () => {
  expect(parseSearchParams(new URLSearchParams('costMin=abc')).costMin).toBeNull()
  expect(parseSearchParams(new URLSearchParams()).costMax).toBeNull()
})
```
Note: any existing test that constructs a full `SearchState` literal must add the new fields (`rarities:[], finishes:[], legalities:[], costMin:null, costMax:null`) — update those literals so TypeScript compiles.

- [ ] **Step 5: Run — GREEN**

Run: `cd app/search && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run` (all pass) and `cd app/web && npx vitest run search-params` (all pass).

- [ ] **Step 6: Commit**

```bash
git add app/search/src/search.ts app/search/src/search.test.ts app/web/src/lib/search-params.ts app/web/src/lib/__tests__/search-params.test.ts
git commit -m "feat: cost-range + rarity/finish/legality filter params"
```

---

### Task 2: FilterDrawer (Sheet)

**Files:**
- Create (CLI, controller): `app/web/src/components/ui/sheet.tsx`
- Create: `app/web/src/components/filter-drawer.tsx`
- Modify: `app/web/messages/{en,de}.json` (`filters` namespace)
- Test: `app/web/src/components/__tests__/filter-drawer.test.tsx`

**Interfaces:**
- Consumes: `Sheet*`, `Button`, `Checkbox`, `Label`, `Input`, `Select*` (`@/components/ui/*`); `TYPES`/`LESSONS`/`RARITIES`/`FINISHES`/`LEGALITIES`/`SetDTO` (`@revelio/core`); `attrLabel`; next-intl `useRouter`.
- Produces: `<FilterDrawer sets={SetDTO[]} locale={string} />`.

- [ ] **Step 1: (CONTROLLER) add the Sheet primitive**

From `app/web`, controller runs:
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npx --yes shadcn@latest add sheet --overwrite </dev/null
```
(Creates `src/components/ui/sheet.tsx`. Confirm `globals.css` unchanged.)

- [ ] **Step 2: Add the `filters` messages**

`messages/en.json` add:
```json
"filters": { "button": "Filters", "title": "Filters", "apply": "Apply", "clear": "Clear all", "set": "Set", "type": "Type", "lesson": "Lesson", "rarity": "Rarity", "finish": "Finish", "legality": "Legality", "cost": "Cost", "costMin": "Min", "costMax": "Max", "official": "Official only", "fan": "Fan / Revival only", "anySet": "Any set" }
```
`de.json`:
```json
"filters": { "button": "Filter", "title": "Filter", "apply": "Anwenden", "clear": "Alle zurücksetzen", "set": "Edition", "type": "Typ", "lesson": "Lektion", "rarity": "Seltenheit", "finish": "Ausführung", "legality": "Legalität", "cost": "Kosten", "costMin": "Min", "costMax": "Max", "official": "Nur offiziell", "fan": "Nur Fan/Revival", "anySet": "Alle Editionen" }
```

- [ ] **Step 3: Write the failing test**

`app/web/src/components/__tests__/filter-drawer.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { FilterDrawer } from '../filter-drawer'

const messages = { filters: { button: 'Filters', title: 'Filters', apply: 'Apply', clear: 'Clear all', set: 'Set', type: 'Type', lesson: 'Lesson', rarity: 'Rarity', finish: 'Finish', legality: 'Legality', cost: 'Cost', costMin: 'Min', costMax: 'Max', official: 'Official only', fan: 'Fan / Revival only', anySet: 'Any set' } }
const sets = [{ code: 'BS', name: 'Base Set', releaseDate: null, isOfficial: true, cardCount: 1, symbol: 'BS' }]

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FilterDrawer sets={sets} locale="en" />
    </NextIntlClientProvider>,
  )
}

describe('FilterDrawer', () => {
  it('applies a checked rarity to the URL', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(await screen.findByLabelText('Rare'))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(push.mock.calls.at(-1)?.[0]).toMatch(/rarity=rare/)
  })
})
```
(`RARITIES` includes a `rare` code whose label is "Rare".)

- [ ] **Step 4: Run — RED**

Run: `cd app/web && npx vitest run filter-drawer` → FAIL (component missing).

- [ ] **Step 5: Implement `FilterDrawer`**

`app/web/src/components/filter-drawer.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import {
  TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, type SetDTO,
} from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const humanize = (c: string) => c.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

type Grp = { param: string; titleKey: string; options: { code: string }[]; label: (c: string) => string }

export function FilterDrawer({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const t = useTranslations('filters')
  const router = useRouter()
  const params = useSearchParams()

  const groups: Grp[] = [
    { param: 'type', titleKey: 'type', options: TYPES, label: (c) => attrLabel('types', c, locale) },
    { param: 'lesson', titleKey: 'lesson', options: LESSONS, label: (c) => attrLabel('lessons', c, locale) },
    { param: 'rarity', titleKey: 'rarity', options: RARITIES, label: (c) => attrLabel('rarities', c, locale) },
    { param: 'finish', titleKey: 'finish', options: FINISHES, label: (c) => attrLabel('finishes', c, locale) },
    { param: 'legality', titleKey: 'legality', options: LEGALITIES, label: (c) => humanize(c) },
  ]

  // pending state seeded from the URL
  const [multi, setMulti] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.param, params.getAll(g.param)])),
  )
  const [set, setSet] = useState(params.get('set') ?? '')
  const [costMin, setCostMin] = useState(params.get('costMin') ?? '')
  const [costMax, setCostMax] = useState(params.get('costMax') ?? '')
  const [official, setOfficial] = useState(params.get('official') ?? '')
  const [open, setOpen] = useState(false)

  function toggle(param: string, code: string, on: boolean) {
    setMulti((m) => ({ ...m, [param]: on ? [...m[param], code] : m[param].filter((c) => c !== code) }))
  }

  function apply() {
    const next = new URLSearchParams()
    if (params.get('q')) next.set('q', params.get('q')!)
    if (params.get('sort')) next.set('sort', params.get('sort')!)
    for (const g of groups) for (const c of multi[g.param]) next.append(g.param, c)
    if (set) next.set('set', set)
    if (costMin) next.set('costMin', costMin)
    if (costMax) next.set('costMax', costMax)
    if (official) next.set('official', official)
    router.push(`/search?${next.toString()}`)
    setOpen(false)
  }

  function clearAll() {
    setMulti(Object.fromEntries(groups.map((g) => [g.param, []])))
    setSet(''); setCostMin(''); setCostMax(''); setOfficial('')
    const q = params.get('q')
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">{t('button')}</Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] overflow-y-auto sm:max-w-none">
        <SheetHeader><SheetTitle>{t('title')}</SheetTitle></SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('set')}</Label>
            <Select value={set || 'any'} onValueChange={(v) => setSet(v === 'any' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t('anySet')}</SelectItem>
                {sets.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {groups.map((g) => (
            <fieldset key={g.param}>
              <legend className="mb-2 text-sm font-medium">{t(g.titleKey)}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {g.options.map((o) => {
                  const id = `${g.param}-${o.code}`
                  const checked = multi[g.param].includes(o.code)
                  return (
                    <div key={o.code} className="flex items-center gap-2">
                      <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(g.param, o.code, v === true)} />
                      <Label htmlFor={id} className="text-sm font-normal">{g.label(o.code)}</Label>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <div>
            <Label className="mb-2 block text-sm font-medium">{t('cost')}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" aria-label={t('costMin')} placeholder={t('costMin')} value={costMin} onChange={(e) => setCostMin(e.target.value)} className="w-20" />
              <span className="text-muted-foreground">–</span>
              <Input type="number" inputMode="numeric" aria-label={t('costMax')} placeholder={t('costMax')} value={costMax} onChange={(e) => setCostMax(e.target.value)} className="w-20" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox id="f-official" checked={official === 'official'} onCheckedChange={(v) => setOfficial(v === true ? 'official' : '')} />
              <Label htmlFor="f-official" className="text-sm font-normal">{t('official')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="f-fan" checked={official === 'fan'} onCheckedChange={(v) => setOfficial(v === true ? 'fan' : '')} />
              <Label htmlFor="f-fan" className="text-sm font-normal">{t('fan')}</Label>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button onClick={apply} className="flex-1">{t('apply')}</Button>
          <Button variant="ghost" onClick={clearAll}>{t('clear')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```
Note the two official checkboxes are mutually exclusive by construction (each sets the single `official` value). If the shadcn `SheetFooter`/`SheetHeader` export names differ in the generated file, adjust imports to what `ui/sheet.tsx` exports.

- [ ] **Step 6: Run — GREEN + build**

Run: `cd app/web && npx vitest run filter-drawer` (1 pass) then `npx next build` (succeeds).

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/ui/sheet.tsx app/web/src/components/filter-drawer.tsx app/web/messages app/web/src/components/__tests__/filter-drawer.test.tsx app/web/package.json app/package-lock.json
git commit -m "feat: advanced-search filter drawer (Sheet)"
```

---

### Task 3: ActiveFilters chips

**Files:**
- Create: `app/web/src/components/active-filters.tsx`
- Test: `app/web/src/components/__tests__/active-filters.test.tsx`

**Interfaces:**
- Consumes: `Badge` (`@/components/ui/badge`); `attrLabel`; core vocab for labels; `withParams` (`@/lib/search-params`); next-intl `useRouter`; `SetDTO`.
- Produces: `<ActiveFilters sets={SetDTO[]} locale={string} />`.

- [ ] **Step 1: Write the failing test**

`app/web/src/components/__tests__/active-filters.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))
const params = new URLSearchParams('rarity=rare&type=creature&costMin=2&costMax=5')
vi.mock('next/navigation', () => ({ useSearchParams: () => params, usePathname: () => '/search' }))

import { ActiveFilters } from '../active-filters'

const sets = [{ code: 'BS', name: 'Base Set', releaseDate: null, isOfficial: true, cardCount: 1, symbol: 'BS' }]

describe('ActiveFilters', () => {
  it('renders a removable chip per active filter and removes on click', async () => {
    const user = userEvent.setup()
    render(<ActiveFilters sets={sets} locale="en" />)
    // one chip for rarity, one for type, one for the cost range
    expect(screen.getByText(/Rare/)).toBeInTheDocument()
    expect(screen.getByText(/Creature/)).toBeInTheDocument()
    expect(screen.getByText(/2.*5/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove Rare/i }))
    const url = push.mock.calls.at(-1)?.[0] as string
    expect(url).not.toMatch(/rarity=rare/)
    expect(url).toMatch(/type=creature/) // others preserved
  })
})
```

- [ ] **Step 2: Run — RED**

Run: `cd app/web && npx vitest run active-filters` → FAIL (component missing).

- [ ] **Step 3: Implement `ActiveFilters`**

`app/web/src/components/active-filters.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { withParams } from '@/lib/search-params'
import { Badge } from '@/components/ui/badge'

const humanize = (c: string) => c.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

type Chip = { key: string; label: string; remove: Record<string, string | string[] | null> }

export function ActiveFilters({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const router = useRouter()
  const params = useSearchParams()

  const multi: { param: string; scope?: 'types' | 'lessons' | 'rarities' | 'finishes' }[] = [
    { param: 'type', scope: 'types' },
    { param: 'lesson', scope: 'lessons' },
    { param: 'rarity', scope: 'rarities' },
    { param: 'finish', scope: 'finishes' },
    { param: 'legality' },
  ]

  const chips: Chip[] = []
  for (const { param, scope } of multi) {
    const values = params.getAll(param)
    for (const v of values) {
      const label = scope ? attrLabel(scope, v, locale) : humanize(v)
      chips.push({ key: `${param}:${v}`, label, remove: { [param]: values.filter((x) => x !== v) } })
    }
  }
  const setCode = params.get('set')
  if (setCode) chips.push({ key: `set:${setCode}`, label: sets.find((s) => s.code === setCode)?.name ?? setCode, remove: { set: null } })
  const min = params.get('costMin')
  const max = params.get('costMax')
  if (min || max) chips.push({ key: 'cost', label: `${min ?? '0'}–${max ?? '∞'}`, remove: { costMin: null, costMax: null } })
  const official = params.get('official')
  if (official) chips.push({ key: 'official', label: official === 'fan' ? 'Fan' : 'Official', remove: { official: null } })

  if (chips.length === 0) return null

  function remove(patch: Record<string, string | string[] | null>) {
    router.push(`/search?${withParams(new URLSearchParams(params.toString()), patch).toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
          {c.label}
          <button type="button" aria-label={`remove ${c.label}`} onClick={() => remove(c.remove)} className="ml-1 rounded-full px-1 text-muted-foreground hover:text-foreground">
            ×
          </button>
        </Badge>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run — GREEN**

Run: `cd app/web && npx vitest run active-filters` (1 pass).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/active-filters.tsx app/web/src/components/__tests__/active-filters.test.tsx
git commit -m "feat: removable active-filter chips"
```

---

### Task 4: Wire into `/search` + e2e (replace quick filters)

**Files:**
- Modify: `app/web/src/components/search-controls.tsx`, `app/web/src/app/[locale]/search/page.tsx`
- Delete: `app/web/src/components/quick-filters.tsx`, `app/web/src/components/__tests__/quick-filters.test.tsx`
- Create: `app/web/e2e/advanced-search.spec.ts`

**Interfaces:**
- Consumes: `FilterDrawer`, `ActiveFilters`, `listSets` (`@revelio/db`), `getDb`.

- [ ] **Step 1: SearchControls mounts the drawer + chips (drops QuickFilters)**

Rewrite `app/web/src/components/search-controls.tsx`:
```tsx
import { getTranslations } from 'next-intl/server'
import type { SetDTO } from '@revelio/core'
import { SearchBox } from './search-box'
import { SortSelect } from './sort-select'
import { FilterDrawer } from './filter-drawer'
import { ActiveFilters } from './active-filters'

export async function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  const t = await getTranslations('search')
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1"><SearchBox placeholder={t('placeholder')} /></div>
        <FilterDrawer sets={sets} locale={locale} />
        <SortSelect />
      </div>
      <ActiveFilters sets={sets} locale={locale} />
    </div>
  )
}
```

- [ ] **Step 2: `/search` page passes the set list**

In `app/web/src/app/[locale]/search/page.tsx`: import `getDb` (`@/lib/db`) + `listSets` (`@revelio/db`); after `setRequestLocale`, `const sets = await listSets(getDb())`; render `<SearchControls locale={locale} sets={sets} />` (add the `sets` prop). The page already runs the Meili search; this adds the Postgres set list for the drawer.

- [ ] **Step 3: Delete the replaced quick filters**

```bash
git rm app/web/src/components/quick-filters.tsx app/web/src/components/__tests__/quick-filters.test.tsx
```

- [ ] **Step 4: Resilient e2e**

`app/web/e2e/advanced-search.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('filter drawer narrows results and shows a removable chip', async ({ page }) => {
  await page.goto('/search?q=harry')
  const grid = page.getByRole('figure').first()
  if (!(await grid.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  await page.getByRole('button', { name: /filters/i }).click()
  await page.getByLabel('Creature').check()
  await page.getByRole('button', { name: /apply/i }).click()
  await expect(page).toHaveURL(/type=creature/)
  await expect(page.getByText(/Creature/)).toBeVisible() // active-filter chip
})
```

- [ ] **Step 5: Run vitest + build + shell e2e**

Run:
```bash
cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run
npx next build
npx playwright test shell
```
Expected: full suite green (quick-filters test removed), build succeeds, shell e2e still green.

- [ ] **Step 6: Commit**

```bash
git add "app/web/src/app/[locale]/search/page.tsx" app/web/src/components/search-controls.tsx app/web/e2e/advanced-search.spec.ts
git commit -m "feat: mount filter drawer + active chips on /search (replace quick filters)"
```

---

## Self-Review

**Spec coverage (advanced search section):**
- Filter drawer (Sheet) with Set/Type/Lesson/Rarity/Finish/Legality + Cost range + Official/Fan → Task 2 ✓
- Options from core vocab + `listSets`; labels via `attrLabel`; legality humanized → Tasks 2-3 ✓
- Removable active-filter chips → Task 3 ✓
- Backend `costMin`/`costMax` in `CardFilters` + `buildFilter`, no reindex → Task 1 ✓
- `parseSearchParams` gains rarity/finish/legality/costMin/costMax → Task 1 ✓
- Drawer replaces quick chips → Task 4 (delete + rewire) ✓
- Set single-select via Select (no rename) → Task 2 ✓
- Deferred sub-types + set/rarity sort → not built ✓

**Placeholder scan:** No TBD/TODO. The `shadcn add sheet` (Task 2 Step 1) is a controller CLI prerequisite, explicitly flagged (env constraints). Component code + tests are complete.

**Type consistency:** `SearchState` new fields (`rarities`/`finishes`/`legalities`/`costMin`/`costMax`) defined in Task 1 and consumed by the drawer's URL building (via the same param names) and `ActiveFilters`. `CardFilters.costMin/costMax` (Task 1) used by `toSearchOptions`. `FilterDrawer`/`ActiveFilters` both take `{ sets: SetDTO[]; locale: string }`. `withParams`/`attrLabel` reused unchanged. Param names are consistent (`type`/`lesson`/`rarity`/`finish`/`legality`/`set`/`costMin`/`costMax`/`official`) across drawer, chips, and `parseSearchParams`.

## Notes for later plans
- **Multi-set** filter: promote `set` (single) → `sets` (multi) — a `parseSearchParams` change + `/sets/[code]` update; deferred to avoid churn here.
- **Sub-types filter** + **set/rarity sort** (Meili `sortableAttributes` + reindex + rarity rank) remain deferred.
- A future `sub_types` i18n label group would let sub-type chips/filters localize (currently humanized).

# shadcn UI Adoption / Retrofit (Plan 4a-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt shadcn/ui properly across `@revelio/web` — switch to the standard Radix `new-york` style and retrofit the hand-rolled controls + chips to shadcn primitives (Input, Button, Select, Badge), preserving all behavior and the Reveal-Glow theme.

**Architecture:** A purely presentational refactor. First re-base shadcn on `new-york`/Radix (edit `components.json` + re-pull primitives; NO full `init`, to keep the Reveal-Glow `globals.css`). Then swap raw `<input>`/`<button>`/`<select>`/pill-`<span>` for `Input`/`Button`/`Select`/`Badge`, keeping roles/labels so existing tests stay green (the native→Radix `Select` is the one control whose test changes). No URL, data, or feature changes.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (new-york/Radix), Vitest + @testing-library.

## Global Constraints

- Node **20+**, TypeScript, ESM. All changes under `app/web/`.
- **Preserve the Reveal-Glow theme** — the palette + lesson `@theme` tokens live in `src/app/globals.css`; do NOT run `shadcn init` (it rewrites globals.css). Switch style via `components.json` + `shadcn add`. The theme-token test (`theme.test.tsx`) must still pass.
- **No behavior/URL/feature change** — purely presentational + accessibility. Roles/labels preserved so behavior tests stay green.
- **Bounded scope:** retrofit controls + chips only (Input/Button/Select/Badge). Layout containers (grids, tile `figure`, detail `dl`, footer, brand-mark) stay Tailwind.
- **next-intl navigation unchanged:** links stay the next-intl `Link` (wrapped via `Button asChild` where a button look is wanted); no manual `/${locale}/…`.
- shadcn primitive files are **CLI-generated** (`npx shadcn@latest add …`) — do not hand-write them; the tasks author only the retrofit usages + tests.
- English identifiers/comments; Conventional Commits. Web tests: `cd app/web && npx vitest run`.

## File Structure

```
app/web/
  components.json                       # style: base-nova -> new-york
  package.json                          # -@base-ui/react, +@radix-ui/* (via shadcn add)
  vitest.setup.ts                       # + jsdom shims for Radix (pointer capture, scrollIntoView)
  src/components/ui/                     # button/input/select/badge/checkbox/label (new-york, CLI)
  src/components/
    search-box.tsx                       # <input> -> Input
    home-search.tsx                      # <input>+<button> -> Input + Button
    sort-select.tsx                      # native <select> -> Select
    pagination.tsx                       # Link prev/next -> Button asChild + Link
    site-header.tsx                      # /sets link -> Button(ghost) asChild + Link
    language-switcher.tsx                # locale links -> Button(ghost) asChild + Link
    card-detail.tsx                      # pill spans -> Badge
    quick-filters.tsx                    # chip buttons -> Button (kept role=button)
  src/components/__tests__/
    sort-select.test.tsx                 # NEW (Radix Select interaction)
    (existing tests stay green)
```

---

### Task 1: Re-base shadcn on new-york/Radix + Radix test shims

**Files:**
- Modify: `app/web/components.json`, `app/web/package.json` (via CLI), `app/web/vitest.setup.ts`
- Create/overwrite: `app/web/src/components/ui/{button,input,select,badge,checkbox,label}.tsx` (CLI)

**Interfaces:**
- Produces: shadcn new-york primitives importable as `@/components/ui/{button,input,select,badge,checkbox,label}` (`Button` with `variant`/`size`/`asChild`; `Input`; `Select`+`SelectTrigger`+`SelectValue`+`SelectContent`+`SelectItem`; `Badge` with `variant`; `Checkbox`; `Label`).

- [ ] **Step 1: Point components.json at the new-york style**

Edit `app/web/components.json`: set `"style": "new-york"` (was `"base-nova"`). Leave `rsc`, `tailwind`, `aliases` as-is.

- [ ] **Step 2: Re-pull the primitives (overwrites base-nova badge/button with Radix versions)**

Run from `app/web`:
```bash
npx shadcn@latest add button input select badge checkbox label --overwrite --yes
```
This regenerates `src/components/ui/*.tsx` in the new-york/Radix style and installs the needed `@radix-ui/react-*` deps. If the CLI prompts, accept overwrite. (If `--yes`/`--overwrite` aren't recognized by the installed CLI version, drop them and confirm the prompts.)

- [ ] **Step 3: Drop the now-unused @base-ui dependency**

Confirm nothing imports it: `grep -rn "@base-ui" src` → expect no matches (the new badge/button use `@radix-ui`). Then remove it:
```bash
npm uninstall @base-ui/react -w @revelio/web
```
(If `grep` still finds a reference, leave the dep and note it in the report.)

- [ ] **Step 4: Add jsdom shims so Radix components are testable**

Append to `app/web/vitest.setup.ts`:
```ts
// jsdom lacks these; Radix (Select/Checkbox/Dialog) calls them during interaction.
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
}
```

- [ ] **Step 5: Verify theme intact + primitives compile**

Run:
```bash
cd app/web && npx vitest run theme && npx next build
```
Expected: `theme.test.tsx` PASS (Badge still renders "Rare"; the five lesson `--color-lesson-*` tokens still present in `globals.css` — proves `globals.css` was NOT clobbered), build succeeds. If `globals.css` changed, restore the Reveal-Glow `:root`/`.dark` values + `@theme` lesson tokens from git (`git checkout -- src/app/globals.css`) and re-run.

- [ ] **Step 6: Commit**

```bash
git add app/web/components.json app/web/package.json app/web/package-lock.json app/web/src/components/ui app/web/vitest.setup.ts
git commit -m "chore(web): re-base shadcn on new-york/Radix + add primitives"
```

---

### Task 2: Retrofit inputs & buttons

**Files:**
- Modify: `app/web/src/components/{search-box,home-search,pagination,site-header,language-switcher}.tsx`
- Test: existing `search-box.test.tsx`, `home-search.test.tsx` stay green (verify)

**Interfaces:**
- Consumes: `Input`, `Button` (`@/components/ui/*`); next-intl `Link` (`@/../i18n/navigation`).

- [ ] **Step 1: `SearchBox` → Input**

Replace the raw `<input>` in `app/web/src/components/search-box.tsx` with the shadcn `Input` (keep `type="search"` so `role=searchbox` and the debounce behavior are unchanged):
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'
import { Input } from '@/components/ui/input'

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
    <Input
      type="search"
      defaultValue={params.get('q') ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
```

- [ ] **Step 2: `HomeSearch` → Input + Button**

In `app/web/src/components/home-search.tsx`, swap the raw input/button for `Input`/`Button` (keep the `<form role="search">`, the `searchbox`, and the submit behavior):
```tsx
'use client'
import { useRouter } from '@/../i18n/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function HomeSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`) }}
      className="mx-auto mt-8 flex max-w-xl gap-2"
    >
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
      <Button type="submit">Search</Button>
    </form>
  )
}
```

- [ ] **Step 3: `Pagination` prev/next → Button asChild + Link**

In `app/web/src/components/pagination.tsx`, wrap the prev/next `Link`s in a `Button` (variant `outline`, `asChild`) — keep the `basePath` logic:
```tsx
import { Link } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'
import { Button } from '@/components/ui/button'

export function Pagination({
  page, total, hitsPerPage, current, basePath = '/search',
}: {
  page: number; total: number; hitsPerPage: number; current: URLSearchParams; basePath?: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / hitsPerPage))
  if (lastPage <= 1) return null
  const href = (p: number) => `${basePath}?${withParams(current, { page: String(p) }).toString()}`
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
      {page > 1 && <Button variant="outline" size="sm" asChild><Link href={href(page - 1)}>← Prev</Link></Button>}
      <span className="text-muted-foreground">Page {page} of {lastPage}</span>
      {page < lastPage && <Button variant="outline" size="sm" asChild><Link href={href(page + 1)}>Next →</Link></Button>}
    </nav>
  )
}
```

- [ ] **Step 4: Header + language switcher → Button(ghost) asChild + Link**

`site-header.tsx` — wrap the `/sets` link:
```tsx
import { getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="Revelio home"><BrandMark /></Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link href="/sets">{t('sets')}</Link></Button>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  )
}
```
`language-switcher.tsx` — each locale as a `Button` (variant `ghost`, active = `secondary`), `asChild` + `Link`:
```tsx
'use client'
import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { Button } from '@/components/ui/button'

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <nav aria-label="Language" className="flex gap-1">
      {routing.locales.map((l) => (
        <Button key={l} variant={l === locale ? 'secondary' : 'ghost'} size="sm" asChild>
          <Link href={pathname} locale={l}>{l.toUpperCase()}</Link>
        </Button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: Run the touched tests + build**

Run: `cd app/web && npx vitest run search-box home-search` (both PASS — `Input` keeps `role=searchbox`, `Button` keeps `role=button`/submit) and `npx next build` (succeeds). If a `language-switcher` test exists and asserts anchor roles, it still passes (`asChild` renders the `Link`'s `<a>`).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/search-box.tsx app/web/src/components/home-search.tsx app/web/src/components/pagination.tsx app/web/src/components/site-header.tsx app/web/src/components/language-switcher.tsx
git commit -m "refactor(web): retrofit inputs and buttons to shadcn Input/Button"
```

---

### Task 3: Retrofit the sort control to shadcn Select

**Files:**
- Modify: `app/web/src/components/sort-select.tsx`
- Test: `app/web/src/components/__tests__/sort-select.test.tsx` (new)

**Interfaces:**
- Consumes: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (`@/components/ui/select`); `withParams`, `SortKey` (`@/lib/search-params`).

- [ ] **Step 1: Write the failing test (Radix Select interaction)**

`app/web/src/components/__tests__/sort-select.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SortSelect } from '../sort-select'

describe('SortSelect', () => {
  it('defaults to Relevance', () => {
    render(<SortSelect />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Relevance')
  })

  it('choosing Name updates the sort param', async () => {
    const user = userEvent.setup()
    render(<SortSelect />)
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Name' }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/sort=name/)
  })
})
```
(Requires `@testing-library/user-event`; if it's not installed: `npm i -D @testing-library/user-event -w @revelio/web`. The Radix pointer/scroll shims from Task 1 make the open/select work in jsdom.)

- [ ] **Step 2: Run — RED**

Run: `cd app/web && npx vitest run sort-select`
Expected: FAIL (still a native `<select>`, no `combobox` role / no listbox `option`s).

- [ ] **Step 3: Convert `SortSelect` to shadcn Select**

`app/web/src/components/sort-select.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams, type SortKey } from '@/lib/search-params'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const current = (params.get('sort') as SortKey | null) ?? 'relevance'

  function onValueChange(value: string) {
    const patch = { sort: value === 'relevance' ? null : value }
    router.replace(`${pathname}?${withParams(new URLSearchParams(params.toString()), patch).toString()}`)
  }

  return (
    <Select value={current} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Sort by" className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 4: Run — GREEN + build**

Run: `cd app/web && npx vitest run sort-select` (2 pass) then `npx next build` (succeeds).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/sort-select.tsx app/web/src/components/__tests__/sort-select.test.tsx app/web/package.json app/web/package-lock.json
git commit -m "refactor(web): sort control uses shadcn Select"
```

---

### Task 4: Retrofit chips to shadcn Badge / Button

**Files:**
- Modify: `app/web/src/components/card-detail.tsx`, `app/web/src/components/quick-filters.tsx`
- Test: existing `card-detail.test.tsx`, `quick-filters.test.tsx` stay green (verify)

**Interfaces:**
- Consumes: `Badge` (`@/components/ui/badge`), `Button` (`@/components/ui/button`).

- [ ] **Step 1: `card-detail` pill spans → Badge**

In `app/web/src/components/card-detail.tsx`, replace the hand-rolled pill `<span>`s (lesson, types, sub-types, cost) and the machine-translation `<p>` with shadcn `Badge` (`variant="outline"` for facets/`variant="secondary"` for the machine badge). Keep the lesson color via inline `style`, keep `data-testid="machine-badge"`, keep `humanize(st)` for sub-types. Import `import { Badge } from '@/components/ui/badge'`. The row example:
```tsx
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {card.lesson && (
            <Badge variant="outline" style={{ borderColor: lessonColor, color: lessonColor }}>
              {attrLabel('lessons', card.lesson, locale)}
            </Badge>
          )}
          {card.types.map((ty) => (
            <Badge key={ty} variant="outline" className="text-muted-foreground">{attrLabel('types', ty, locale)}</Badge>
          ))}
          {card.subTypes.map((st) => (
            <Badge key={st} variant="outline" className="text-xs text-muted-foreground">{humanize(st)}</Badge>
          ))}
          {card.cost != null && (
            <Badge variant="outline" className="text-muted-foreground">{t('cost', { cost: card.cost })}</Badge>
          )}
        </div>
```
And the machine badge:
```tsx
        {loc.status === 'machine' && (
          <Badge data-testid="machine-badge" variant="secondary" className="mt-3">{t('machineTranslation')}</Badge>
        )}
```

- [ ] **Step 2: `quick-filters` chips → Button (kept clickable, role=button)**

In `app/web/src/components/quick-filters.tsx`, replace the raw chip `<button>`s with shadcn `Button` (`size="sm"`, `variant` toggled by active state; keep `aria-pressed`, `onClick`, and the `Creature`/`Charms`/`Official`/`Fan` labels so `quick-filters.test.tsx`'s `getByRole('button', { name: 'Creature' })` still matches). Lesson chips keep the inline color style. Example for a type chip:
```tsx
import { Button } from '@/components/ui/button'
// ...
  <Button
    key={t.code}
    type="button"
    size="sm"
    variant={active ? 'default' : 'outline'}
    aria-pressed={active}
    onClick={() => toggle('type', state.types, t.code)}
    className="rounded-full"
  >
    {attrLabel('types', t.code, locale)}
  </Button>
```
Apply the same pattern to the lesson buttons (keep `style={{ ... l.color ... }}`) and the Official / Fan buttons.

- [ ] **Step 3: Run the touched tests + full suite + build**

Run:
```bash
cd app/web && npx vitest run card-detail quick-filters
npx vitest run
npx next build
```
Expected: `card-detail` (Badge renders the text incl. `Beast`, `machine-badge`), `quick-filters` (Button role/name intact) PASS; full suite green; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/web/src/components/card-detail.tsx app/web/src/components/quick-filters.tsx
git commit -m "refactor(web): card chips + quick filters use shadcn Badge/Button"
```

---

## Self-Review

**Spec coverage (shadcn adoption section):**
- Switch to new-york/Radix without a full init (components.json + `shadcn add`) → Task 1 ✓
- Preserve Reveal-Glow theme (globals.css untouched; theme test) → Task 1 Steps 1-2, 5 ✓
- Remove @base-ui → Task 1 Step 3 ✓
- Retrofit Input (SearchBox/HomeSearch) → Task 2 ✓
- Retrofit Button (HomeSearch submit, Pagination, header, language switcher) → Task 2 ✓
- Retrofit Select (SortSelect) + test rewrite → Task 3 ✓
- Retrofit Badge (card-detail chips) + quick-filters Buttons → Task 4 ✓
- Radix test shims → Task 1 Step 4 ✓
- No behavior/URL/feature change; tests stay green → each task verifies ✓
- `checkbox`/`label` pulled now (used by the Advanced Search drawer next) → Task 1 Step 2 ✓

**Placeholder scan:** No TBD/TODO. `shadcn add` is a deterministic CLI step (generates the primitive files), not a placeholder. The retrofit usages + tests contain full code. Conditional fallbacks (CLI flag names, `user-event` install, globals.css restore) are concrete, bounded instructions.

**Type consistency:** `Button`/`Input`/`Badge`/`Select*` come from `@/components/ui/*` (Task 1) and are used identically across Tasks 2-4. `SortKey`/`withParams` (existing `@/lib/search-params`) unchanged. next-intl `Link` used with `Button asChild` consistently. `data-testid="machine-badge"`, `humanize`, `attrLabel(scope, code, locale)`, `basePath` preserved from prior plans.

## Notes for later plans
- **Advanced Search (4a-5):** the `Sheet` (drawer), `Checkbox`+`Label` (already pulled here), and a cost `Slider`/`Input` build on this foundation; active-filter chips reuse `Badge`; `quick-filters` is replaced by the drawer.
- If `@testing-library/user-event` was newly added, it's a shared dev dep for future Radix component tests.
- A later polish pass could wrap `CardTile`/`SetCard` in shadcn `Card`, but layout containers were intentionally left as Tailwind here.

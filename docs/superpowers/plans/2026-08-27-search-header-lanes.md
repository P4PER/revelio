# Search Header Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/search` filter header as two labelled facet lanes closed by a full-width rule, and move the active-filter chips and the clear control down into the results bar so no control appears out of nowhere.

**Architecture:** `QuickFilters` grows from one wrapping chip row into a two-row grid (label column + chip column) with a `trailing` slot for the advanced-filter trigger. `SearchControls` shrinks to that block plus a full-width rule. `ActiveFilters` and `ClearFilters` move out of `SearchControls` into the results bar in `search/page.tsx`, joining `ResultCount` on the left with `SortSelect` right-aligned. `ClearFiltersButton` becomes a labelled text button instead of a bare icon — it is shared, so the deck-builder and collection toolbars get the same control.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, shadcn/Radix primitives, vitest + @testing-library/react.

**Spec:** the approved design canvas, artboard "Option A - Labelled lanes" — https://claude.ai/code/artifact/c4ae4873-9a47-48a5-95ae-f548dc200b6c (no spec file; this was bounded work on an existing flow).

## Global Constraints

- All app commands run from `app/`. Single test file: `npm test -w web -- <path>`.
- No new i18n keys. The labels reuse existing `filters.type`, `filters.lesson` and `filters.clearFilters`, which exist in both `messages/en.json` and `messages/de.json`.
- Code comments stay ASCII-only — no em-dashes, no unicode arrows.
- Conventional Commits. No Claude/Claude Code attribution in commit messages.
- `src/components` has no barrel files: import leaf paths (`@/components/search/quick-filters`).
- The 32px control family (chip, `size="sm"` button, `size="sm"` select trigger) is the toolbar's height grid — new controls match it.
- Do not touch `src/lib/server/**`, the Meilisearch query builder, or the DB schema: this is presentation only.

---

### Task 1: Clear control becomes a labelled text button

`ClearFiltersButton` is shared by `/search`, the deck-card browser and the collection browse tab. Today it is an icon-only `✕` that mounts when a filter becomes active, which reads as a control materialising out of nowhere. A labelled text button reads as part of the run of filter chips it will sit next to.

**Files:**
- Modify: `app/web/src/components/search/clear-filters-button.tsx`
- Test: `app/web/src/components/search/__tests__/clear-filters.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ClearFiltersButton({ active: boolean, onClear: () => void })` — unchanged signature, changed rendering. Task 3 relies on it rendering visible text.

- [ ] **Step 1: Write the failing test**

Add this case to `app/web/src/components/search/__tests__/clear-filters.test.tsx`, inside the existing `describe('ClearFilters')` block:

```tsx
  it('labels the control with visible text rather than an icon alone', async () => {
    params = new URLSearchParams('q=aggro&type=creature')
    renderClear()
    const button = screen.getByRole('button', { name: /clear filters/i })
    expect(button).toHaveTextContent('Clear filters')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/search/__tests__/clear-filters.test.tsx`
Expected: FAIL — the new case reports an empty text content, because the button renders only an `<svg>` and carries its name via `aria-label`.

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `app/web/src/components/search/clear-filters-button.tsx` with:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// Shared inline "Clear filters" control, used by the search, deck-builder and
// discover pages. Renders only when a filter is active; each page owns its own
// active-check and reset handler since their filter state models differ (URL
// params vs local state). It carries a visible label rather than a bare icon:
// it appears at the end of a run of active-filter chips, where a labelled
// action reads as part of that run instead of a control popping into place.
export function ClearFiltersButton({
  active,
  onClear,
}: {
  active: boolean
  onClear: () => void
}) {
  const t = useTranslations('filters')
  if (!active) return null
  return (
    <Button variant="link" size="sm" onClick={onClear}>
      {t('clearFilters')}
    </Button>
  )
}
```

Note what this drops: the `X` import from `lucide-react`, the `aria-label` and the `title` (the visible text is now the accessible name).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- src/components/search/__tests__/clear-filters.test.tsx`
Expected: PASS, all three cases — including the existing "renders nothing when no filters are active" and the existing click-through case, whose `{ name: /clear filters/i }` query still matches because the visible text is the same string.

- [ ] **Step 5: Check the two other consumers still typecheck**

Run: `npm run typecheck`
Expected: PASS. `collection-view.tsx:152` and `deck-card-browser.tsx:185` pass the same two props and are unaffected by the internal change.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/search/clear-filters-button.tsx app/web/src/components/search/__tests__/clear-filters.test.tsx
git commit -m "refactor(web): give the clear-filters control a visible label"
```

---

### Task 2: Quick filters become labelled lanes with a trailing slot

**Files:**
- Modify: `app/web/src/components/search/quick-filters.tsx`
- Test: `app/web/src/components/search/__tests__/quick-filters.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `QuickFilters({ locale: string, trailing?: ReactNode })`. Task 3 passes `<FilterDrawer />` as `trailing`. Each lane is an ARIA group named by its facet (`Type`, `Lesson`).

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/web/src/components/search/__tests__/quick-filters.test.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { QuickFilters } from '@/components/search/quick-filters'

const messages = { filters: { type: 'Type', lesson: 'Lesson' } }

function renderFilters(trailing?: ReactNode) {
  // LessonFilter (shared) calls useLocale(), so an intl provider is needed.
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuickFilters locale="en" trailing={trailing} />
    </NextIntlClientProvider>,
  )
}

describe('QuickFilters', () => {
  it('toggling a type chip adds it to the url', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Creature' }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/type=creature/)
  })

  it('toggling a lesson chip adds it to the url', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /Potions/ }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/lesson=potions/)
  })

  it('groups the type chips in a lane labelled Type', () => {
    renderFilters()
    const lane = screen.getByRole('group', { name: 'Type' })
    expect(within(lane).getByRole('button', { name: 'Creature' })).toBeInTheDocument()
  })

  it('groups the lesson chips in a lane labelled Lesson', () => {
    renderFilters()
    const lane = screen.getByRole('group', { name: 'Lesson' })
    expect(within(lane).getByRole('button', { name: /Potions/ })).toBeInTheDocument()
  })

  it('renders the trailing slot alongside the lanes', () => {
    renderFilters(<button type="button">Advanced</button>)
    expect(screen.getByRole('button', { name: 'Advanced' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- src/components/search/__tests__/quick-filters.test.tsx`
Expected: the two existing toggle cases PASS; the three new cases FAIL — `getByRole('group', ...)` finds no group, and `QuickFilters` has no `trailing` prop so nothing renders for it.

- [ ] **Step 3: Write the implementation**

Replace the whole of `app/web/src/components/search/quick-filters.tsx` with:

```tsx
'use client'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'
import { Chip } from '@/components/ui/chip'
import { LessonFilter } from '@/components/search/lesson-filter'

// The one-click facet lanes above the search results: one labelled row per
// facet, so fourteen chips read as two named groups rather than one wrapping
// wall. The label column is sized to its content and the chips take the rest,
// which keeps both lanes' chips on a shared left edge. `trailing` takes the
// advanced-filter trigger; it sits at the top right of the block instead of
// occupying a row of its own.
export function QuickFilters({ locale, trailing }: { locale: string; trailing?: ReactNode }) {
  const t = useTranslations('filters')
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

  // leading-8 matches the 32px chip height, so a label sits on the same
  // baseline as the first line of its lane.
  const laneLabel = 'text-[11px] leading-8 font-medium tracking-wider text-muted-foreground/75 uppercase'

  return (
    <div className="flex items-start gap-4">
      <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2">
        <span className={laneLabel}>{t('type')}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('type')}>
          {TYPES.map((ty) => {
            const active = state.types.includes(ty.code)
            return (
              <Chip
                key={ty.code}
                active={active}
                onClick={() => toggle('type', state.types, ty.code)}
                className={
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-(--hover-bg) hover:text-accent-foreground'
                }
              >
                {attrLabel('types', ty.code, locale)}
              </Chip>
            )
          })}
        </div>
        <span className={laneLabel}>{t('lesson')}</span>
        <div role="group" aria-label={t('lesson')}>
          <LessonFilter
            selected={state.lessons}
            onToggle={(code) => toggle('lesson', state.lessons, code)}
          />
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
```

Two things to note while editing: the map variable is `ty`, not `t`, because `t` is now the translator; and `LessonFilter` already renders its own `flex flex-wrap gap-2` row, so the wrapper around it only carries the group role.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- src/components/search/__tests__/quick-filters.test.tsx`
Expected: PASS, all five cases.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/search/quick-filters.tsx app/web/src/components/search/__tests__/quick-filters.test.tsx
git commit -m "feat(web): group the search quick filters into labelled lanes"
```

---

### Task 3: Rewire the header and the results bar

`SearchControls` drops to the lane block plus a full-width rule; the active-filter chips and the clear control move down to sit with the result count, where they appear at the end of a run of chips instead of resizing the toolbar above them.

**Files:**
- Modify: `app/web/src/components/search/search-controls.tsx`
- Modify: `app/web/src/app/[locale]/search/page.tsx:42-52`

**Interfaces:**
- Consumes: `QuickFilters({ locale, trailing })` from Task 2; `ClearFiltersButton` (through `ClearFilters`) from Task 1.
- Produces: `SearchControls({ locale: string, sets: SetDTO[] })` — unchanged signature, now rendering only the lanes and the rule.

- [ ] **Step 1: Rewrite `search-controls.tsx`**

Replace the whole of `app/web/src/components/search/search-controls.tsx` with:

```tsx
import type { SetDTO } from '@revelio/core'
import { FilterDrawer } from '@/components/search/filter-drawer'
import { QuickFilters } from '@/components/search/quick-filters'

// Filter block above the results: the labelled facet lanes with the advanced
// trigger at their top right, closed by a full-width rule that separates
// filtering from the results. The active advanced filters and the clear
// control live one row further down, in the results bar next to the count, so
// nothing in this block resizes as filters come and go.
export function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  return (
    <div className="mb-5 space-y-5">
      <QuickFilters locale={locale} trailing={<FilterDrawer sets={sets} locale={locale} />} />
      <div className="h-px w-full bg-border/60" aria-hidden />
    </div>
  )
}
```

- [ ] **Step 2: Move the chips and the clear control into the results bar**

In `app/web/src/app/[locale]/search/page.tsx`, add these two imports next to the existing `SearchControls` import:

```tsx
import { ActiveFilters } from '@/components/search/active-filters'
import { ClearFilters } from '@/components/search/clear-filters'
```

Then replace the results-header block (the comment plus the `div` that currently holds `ResultCount` and `SortSelect`) with:

```tsx
      {/* Results bar: the count, the applied advanced filters and the clear
          control on the left; Sort right-aligned above the grid (Sort orders
          results, so it lives here and not in the filter block). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <ResultCount page={results.page} pageSize={results.hitsPerPage} total={results.total} />
          <ActiveFilters sets={sets} locale={locale} />
          <ClearFilters />
        </div>
        <SortSelect />
      </div>
```

- [ ] **Step 3: Run the whole web suite**

Run: `npm test -w web`
Expected: PASS. Nothing unit-tests `search-controls.tsx` or the page directly; this run is the regression net for the components they compose.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint -w web`
Expected: both PASS. If `lint` reports `ActiveFilters`/`ClearFilters` as unused in `search-controls.tsx`, an import was left behind — remove it.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/search/search-controls.tsx app/web/src/app/[locale]/search/page.tsx
git commit -m "feat(web): move the active filters and clear control into the results bar"
```

---

### Task 4: Verify in the running app

Unit tests cannot see a lane label sitting on the wrong baseline or a lane wrapping badly on a phone. This task is the visual gate before the branch is offered for review.

**Files:**
- None modified unless a defect is found.

**Interfaces:**
- Consumes: the finished header from Tasks 1-3.
- Produces: nothing; a pass/fail judgement plus screenshots.

- [ ] **Step 1: Start the dev server**

Run from `app/`: `npm run dev -w web`
The search page needs Meilisearch reachable at `MEILI_HOST`. If `docker compose ps` shows meilisearch down, run `docker compose up -d meilisearch postgres` first. `/search` requires a signed-in session, so drive it through a browser context that has one rather than `curl`.

- [ ] **Step 2: Screenshot the header at desktop and phone widths**

There is no Chrome on this machine; use the repo's own chromium through Playwright, imported by absolute path (`app/node_modules/playwright`). Capture `/en/search?q=harry&type=spell&lesson=charms&rarity=rare` at 1280x900 and at 390x844.

- [ ] **Step 3: Read the screenshots and check them against the spec artboard**

Confirm all of:
- Both lane labels ("TYPE", "LESSON") sit on the same baseline as the first chip in their row, and the two lanes' chips share a left edge.
- The rule spans the full container width, not just the controls.
- The Advanced trigger sits at the top right of the lane block, on the same line as the type chips.
- The results bar reads: count, then the "Rare" chip, then "Clear filters", with Sort right-aligned.
- At 390px nothing overflows horizontally and the Advanced trigger has not been squeezed into an unreadable width.

- [ ] **Step 4: Check the German locale**

Capture `/de/search?q=harry&type=spell` at 1280x900. `filters.type` is "Typ" and `filters.lesson` is "Lektion"; confirm the wider "LEKTION" label does not push the chips off their shared edge or wrap.

- [ ] **Step 5: Check the two shared consumers of the clear control**

Capture the deck-card browser and the collection browse tab with a filter applied, and confirm the new text button sits sensibly in those right-aligned toolbars. If it crowds them, note it in the handover rather than redesigning those pages here.

- [ ] **Step 6: Report**

State plainly what passed, paste any command output for what did not, and list anything deliberately left alone. Do not claim the work is done before this step's checks have actually been run.

---

## Out of scope

- The deck-builder and collection toolbars keep their current layout. They share `ClearFiltersButton` (so they inherit its new label) and nothing else from this plan.
- `ActiveFilters` keeps its `Badge variant="secondary"` pill styling; the approved artboard shows the same pill.
- No changes to the search query, the index, or pagination.

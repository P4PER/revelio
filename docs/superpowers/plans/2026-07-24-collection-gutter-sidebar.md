# Collection Gutter Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the collection page's "By sets" sidebar into the left gutter on wide screens (matching the admin sidebar), with a mobile drawer fallback, and make the card grid render at all widths.

**Architecture:** A new client wrapper `CollectionSetNav` mirrors `admin-sidebar.tsx` — a desktop static rail (sits in the left gutter on ≥1700px via a negative-margin pull on the tab's flex row) plus a mobile `Sheet` drawer. It reuses the existing `CollectionSidebar` (set list + progress bars) unchanged in visuals, adding only an `onSelect` close callback. `CollectionView` swaps its `md:grid-cols-[16rem_1fr]` block for the admin-style responsive flex row.

**Tech Stack:** Next.js 16 / React 19, Tailwind v4, shadcn `Sheet`/`Button`, next-intl, vitest + Testing Library.

## Global Constraints

- All app commands run from `app/` (npm workspaces root). Web workspace commands use `-w web`.
- Breakpoints copied verbatim from the admin pattern: `min-[1024px]` (rail↔drawer) and `min-[1700px]` (gutter pull). Do not invent new breakpoints.
- Gutter-pull constant = sidebar width (16rem, `w-64`) + row gap (`gap-8` = 2rem) = 18rem → `-ml-72` / `w-[calc(100%+18rem)]`.
- Reuse existing `CollectionSidebar` visuals; do not restyle the set rows.
- i18n keys added to **both** `app/web/messages/en.json` and `app/web/messages/de.json`.
- Conventional Commits. No Claude attribution in commits.

---

### Task 1: `CollectionSidebar` gains an `onSelect` close callback

**Files:**
- Modify: `app/web/src/components/collection-sidebar.tsx`
- Test: `app/web/src/components/__tests__/collection-sidebar.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CollectionSidebar` accepts optional `onSelect?: () => void`, invoked on each set `Link`'s click. Consumed by `CollectionSetNav` (Task 2) to close its drawer.

- [ ] **Step 1: Write the failing test**

Add to `collection-sidebar.test.tsx` — change the top import line to include `vi` and `fireEvent`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
```

Then add this test inside the `describe('CollectionSidebar', …)` block:

```tsx
  it('calls onSelect when a set row is clicked', () => {
    const onSelect = vi.fn()
    wrap(<CollectionSidebar sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?set=${c}`} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('set-row-PR'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/collection-sidebar.test.tsx`
Expected: FAIL — `onSelect` is not a prop yet, so the mock is never called (`expected 1, got 0`).

- [ ] **Step 3: Add the prop and wire it to each Link**

In `collection-sidebar.tsx`, add `onSelect` to the destructured props and the type, then pass it as `onClick` on the `Link`:

```tsx
export function CollectionSidebar({
  sets, progress, selected, hrefFor, onSelect,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
  onSelect?: () => void
}) {
```

And on the `Link` element, add `onClick={onSelect}`:

```tsx
          <Link key={s.code} href={hrefFor(s.code)} onClick={onSelect}
            data-testid={`set-row-${s.code}`} data-active={active}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/collection-sidebar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/collection-sidebar.tsx app/web/src/components/__tests__/collection-sidebar.test.tsx
git commit -m "feat(web): add onSelect callback to CollectionSidebar rows"
```

---

### Task 2: `CollectionSetNav` wrapper (gutter rail + mobile drawer) + i18n

**Files:**
- Create: `app/web/src/components/collection-set-nav.tsx`
- Create: `app/web/src/components/__tests__/collection-set-nav.test.tsx`
- Modify: `app/web/messages/en.json` (add `collection.setsNav`)
- Modify: `app/web/messages/de.json` (add `collection.setsNav`)

**Interfaces:**
- Consumes: `CollectionSidebar` with its new `onSelect` (Task 1); shadcn `Sheet`, `SheetContent`, `SheetTrigger`, `SheetTitle`; `Button`; `Menu` icon.
- Produces: `CollectionSetNav({ sets: SetDTO[], progress: SetProgress[], selected?: string, hrefFor: (setCode: string) => string })`. Consumed by `CollectionView` (Task 3).

- [ ] **Step 1: Add the i18n key to both message files**

In `app/web/messages/en.json`, immediately after the `"bySets": "By set",` line (~550), add:

```json
    "setsNav": "Sets",
```

In `app/web/messages/de.json`, immediately after the `"bySets": "Nach Set",` line (~550), add:

```json
    "setsNav": "Sets",
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/__tests__/collection-set-nav.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { CollectionSetNav } from '../collection-set-nav'

const sets = [
  { code: 'BS', name: 'Base', releaseDate: null, isOfficial: true, cardCount: 3, symbol: null },
  { code: 'PR', name: 'Promo', releaseDate: null, isOfficial: false, cardCount: 1, symbol: null },
]
const progress = [
  { setCode: 'BS', owned: 2, total: 3 },
  { setCode: 'PR', owned: 0, total: 1 },
]

describe('CollectionSetNav', () => {
  it('renders every set in the desktop rail', () => {
    renderWithIntl(
      <CollectionSetNav sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?tab=sets&set=${c}`} />,
    )
    expect(screen.getByText('Base')).toBeInTheDocument()
    expect(screen.getByText('Promo')).toBeInTheDocument()
  })

  it('renders a mobile drawer trigger labelled Sets', () => {
    renderWithIntl(
      <CollectionSetNav sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?tab=sets&set=${c}`} />,
    )
    expect(screen.getByRole('button', { name: /sets/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/collection-set-nav.test.tsx`
Expected: FAIL — `Failed to resolve import "../collection-set-nav"` (component not created yet).

- [ ] **Step 4: Create the component**

Create `app/web/src/components/collection-set-nav.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CollectionSidebar } from '@/components/collection-sidebar'
import type { SetDTO, SetProgress } from '@revelio/core'

export function CollectionSetNav({
  sets, progress, selected, hrefFor,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
}) {
  const t = useTranslations('collection')
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Desktop: static rail; hangs in the left gutter on wide screens (the pull
          lives on the parent flex row in CollectionView). */}
      <aside className="hidden w-64 shrink-0 self-start min-[1024px]:block min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:max-h-[calc(100vh-3rem)] min-[1024px]:overflow-y-auto">
        <CollectionSidebar sets={sets} progress={progress} selected={selected} hrefFor={hrefFor} />
      </aside>

      {/* Mobile: trigger + drawer. Selecting a set closes the drawer so the
          full-width card grid below is revealed. */}
      <div className="min-[1024px]:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              {t('setsNav')}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-4">
            <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('setsNav')}
            </SheetTitle>
            <CollectionSidebar
              sets={sets} progress={progress} selected={selected} hrefFor={hrefFor}
              onSelect={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/collection-set-nav.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/collection-set-nav.tsx app/web/src/components/__tests__/collection-set-nav.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): add CollectionSetNav gutter rail with mobile drawer"
```

---

### Task 3: Wire `CollectionSetNav` into `CollectionView`

**Files:**
- Modify: `app/web/src/components/collection-view.tsx`

**Interfaces:**
- Consumes: `CollectionSetNav` (Task 2).
- Produces: no new exports; the "By sets" tab now renders the gutter layout and shows cards at all widths.

- [ ] **Step 1: Swap the import**

In `collection-view.tsx`, replace the `CollectionSidebar` import line:

```tsx
import { CollectionSidebar } from '@/components/collection-sidebar'
```

with:

```tsx
import { CollectionSetNav } from '@/components/collection-set-nav'
```

- [ ] **Step 2: Replace the "By sets" tab layout**

Replace the entire `<TabsContent value="sets">…</TabsContent>` block:

```tsx
      <TabsContent value="sets">
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <aside className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
            <CollectionSidebar sets={sets} progress={progress} selected={selectedSet}
              hrefFor={(c) => `?tab=sets&set=${c}`} />
          </aside>
          <section className="hidden md:block">
            {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
          </section>
        </div>
      </TabsContent>
```

with (note the gutter pull `-ml-72`/`+18rem`, and the card `<section>` no longer has `hidden md:block`):

```tsx
      <TabsContent value="sets">
        <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8 min-[1700px]:-ml-72 min-[1700px]:w-[calc(100%+18rem)]">
          <CollectionSetNav sets={sets} progress={progress} selected={selectedSet}
            hrefFor={(c) => `?tab=sets&set=${c}`} />
          <section className="min-w-0 flex-1 min-[1024px]:max-w-[76rem]">
            {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
          </section>
        </div>
      </TabsContent>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck -w web && npm run lint -w web`
Expected: typecheck clean; lint reports no **new** warnings (13 pre-existing React Compiler warnings are known and acceptable).

- [ ] **Step 4: Run the full web test suite**

Run: `npm test -w web`
Expected: PASS — all existing tests plus the two new suites green. In particular `CollectionView` tests (tab switching, browse) remain unaffected.

- [ ] **Step 5: Manual verification**

Run `npm run dev -w web`, open the collection page signed in, "By sets" tab, and confirm:
- ~1400px: sidebar and cards share the row (two-column).
- ≥1700px (widen window): sidebar hangs in the left gutter; the card grid's right edge lines up with the site header's right edge (full 76rem, not short).
- <1024px: sidebar is a `☰ Sets` button; tapping it opens a left drawer; selecting a set closes the drawer and shows that set's cards full-width.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/collection-view.tsx
git commit -m "feat(web): move collection set sidebar into the left gutter"
```

---

## Notes on testing scope

- The Radix `Sheet` open/close flow is not asserted in jsdom (the admin-sidebar suite deliberately skips it — portalled Dialog content is flaky under jsdom). The close-on-select wiring is covered indirectly: Task 1 proves `CollectionSidebar` fires `onSelect`, and `CollectionSetNav` passes `() => setOpen(false)` as that callback. The three responsive tiers are CSS-only and are verified manually (Task 3, Step 5).
- Public collection views (`collection/[username]`, `collection/u/[userId]`) render `PublicCollection`, which **does** render `CollectionView` (`editable={false}`) inside the same `mx-auto max-w-[76rem] px-6 py-8` container as the owner page. They therefore inherit the new gutter layout automatically — this is intended and consistent (the spec calls it acceptable). During Task 3, Step 5, spot-check a public collection URL at ≥1700px to confirm the read-only sidebar sits in the gutter and the grid stays header-aligned.

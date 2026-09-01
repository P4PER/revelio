# Unified Empty-Results State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six one-line "no results" paragraphs scattered across search, sets, collection and deck surfaces with a single `EmptyResults` component that shares the error pages' vanished-card visual language.

**Architecture:** The motif currently hard-coded inside `ErrorCardState` (striped card, inner dashed border, glowing symbol, two offset sparkles) is extracted into a standalone `VanishedCard` with a size scale. `ErrorCardState` keeps its public API and renders the `lg` size; a new sibling `EmptyResults` renders `md` (default) or `sm` (compact) inside a page rather than taking one over. Each call site passes its own copy and its own recovery action.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, shadcn/Radix, Vitest + Testing Library.

**Spec:** This document. The design was settled in chat on the bounded path; the Design section below is the spec, and the tasks argue from it.

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use `/usr/local/bin/npm`, `/usr/local/bin/node`.
- Every user-facing string is sourced from `web/messages/en.json` **and** `web/messages/de.json`. Never hardcode UI copy.
- Code comments are ASCII only. No em-dashes, no unicode arrows.
- Conventional Commits.
- No Claude/Claude Code attribution in commit messages.
- Branch: `feat/unified-empty-results` (already created off `main`).
- No barrel files: import the leaf path.
- `src/components` is grouped by domain; only genuinely domain-free components sit at the root. `vanished-card.tsx` and `empty-results.tsx` are domain-free and belong at the root beside `error-card-state.tsx`.
- Vitest's `rejects.toThrow` is broken in `app/web`; if a test needs to assert a throw, catch it by hand.

---

## Design

### The family

Three sizes of one object. Only the scale changes between family members.

| | motif | heading | description | actions | wrapper |
|---|---|---|---|---|---|
| `ErrorCardState` (unchanged behavior) | `lg` h-80 | `h1` text-2xl | `mt-3 max-w-md text-base` | `mt-7` | `<main>` `min-h-[75vh] py-20` |
| `EmptyResults` `default` | `md` h-40 | `h2` text-xl | `mt-2 max-w-sm text-sm` | `mt-6` | `<div role="status">` `py-14` |
| `EmptyResults` `compact` | `sm` h-24 | `h2` text-base | `mt-1 max-w-xs text-sm` | `mt-4` | `<div role="status">` `py-10` |

`h2`, not `h1`: these render inside pages that already own an `h1`. The error pages are whole-page takeovers, so `h1` is correct there and wrong here.

Variant is always `missing` (the `?` symbol) for empty results. A question mark is the honest symbol for "no match", and it never appears on screen next to the 404 that shares it.

### Call sites

`compact` is used **only** in the deck-builder browse rail, the one genuinely cramped container (a side panel with `overflow-y-auto` and 190px columns). Everything else is `default`.

| Call site | Size | Recovery action |
|---|---|---|
| `/search` via `card-grid.tsx:15` | default | Clear filters (when filters active), Clear search (when query set) |
| `/sets/[code]` via `card-grid.tsx:15` | default | none |
| collection - By set (`collection-view.tsx:107`) | default | none |
| collection - Browse all (`collection-view.tsx:124`) | default | Clear filters (when filters active) |
| deck builder browser (`deck-card-browser.tsx:228`) | **compact** | Clear filters (when filters active) |
| deck explore (`deck-browse.tsx:143`) | default | Clear filters (when filters active) |

### No filter chips in the empty state

An earlier draft put removable filter chips inside the search empty state. Dropped: `/search` already renders `ActiveFilters` chips and a `ClearFilters` link in the results bar directly above the grid, and repeating them below would be the same redundancy that was removed from the pagination header. The empty state contributes the affordance the bar lacks - clearing the **query** - plus a full-size Clear filters button where the reader's eyes actually are.

### Out of scope

- `deck-list.tsx:117` ("you have no decks yet" + Create CTA) - an onboarding state, not a zero-result state. Its dashed frame and CTA stay.
- `deck-panel.tsx:221`/`:240` `emptyMain`/`emptySideboard` - structural placeholders inside a deck panel.
- The admin tables' `noResults` cells.
- Any "did you mean..." suggestion: it needs Meilisearch typo/suggestion settings that are not configured, and changing `CARD_INDEX_SETTINGS` requires an ingest run to reach the live index.

---

## File Structure

**Create:**
- `app/web/src/components/vanished-card.tsx` - the motif alone: variant (symbol/color/mask) x size (dimensions). No copy, no layout beyond itself.
- `app/web/src/components/empty-results.tsx` - inline empty-state shell: motif + heading + optional description + optional action row.
- `app/web/src/components/search/search-empty-results.tsx` - `/search`-specific client wrapper that reads the URL, picks the copy variant, and renders the two recovery buttons.
- `app/web/src/components/__tests__/vanished-card.test.tsx`
- `app/web/src/components/__tests__/empty-results.test.tsx`
- `app/web/src/components/search/__tests__/search-empty-results.test.tsx`

**Modify:**
- `app/web/src/components/error-card-state.tsx` - motif inlined today; delegates to `VanishedCard`. Public API unchanged.
- `app/web/src/lib/search-params.ts` - gains `hasActiveFilters`, `emptyReason`, `EmptyReason`, `CLEARED_FILTERS`.
- `app/web/src/components/search/clear-filters.tsx` - drops its local `CLEARED` and its inline filter check in favour of the shared helpers.
- `app/web/src/components/card/card-grid.tsx` - gains an `empty?: ReactNode` slot; default becomes `EmptyResults`.
- `app/web/src/app/[locale]/search/page.tsx` - passes `<SearchEmptyResults />`.
- `app/web/src/app/[locale]/sets/[code]/page.tsx` - passes a set-specific `EmptyResults`.
- `app/web/src/components/collection/collection-view.tsx` - both tabs.
- `app/web/src/components/deck/deck-card-browser.tsx` - compact variant.
- `app/web/src/components/deck/deck-browse.tsx` - default variant.
- `app/web/messages/en.json`, `app/web/messages/de.json`.
- `app/web/src/components/card/__tests__/card-grid.test.tsx` - asserts a key that this plan renames.
- `app/web/src/lib/__tests__/search-params.test.ts` - gains helper tests.

---

### Task 1: Extract the VanishedCard motif

Pure refactor. `ErrorCardState` must render exactly what it renders today; the only new capability is the size scale, which nothing uses yet.

**Files:**
- Create: `app/web/src/components/vanished-card.tsx`
- Create: `app/web/src/components/__tests__/vanished-card.test.tsx`
- Modify: `app/web/src/components/error-card-state.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VanishedCardVariant = 'missing' | 'dissolving' | 'dark'`
  - `type VanishedCardSize = 'lg' | 'md' | 'sm'`
  - `function VanishedCard(props: { variant: VanishedCardVariant; size?: VanishedCardSize; className?: string }): ReactElement` (default `size` is `'lg'`)
  - `error-card-state.tsx` keeps exporting `ErrorCardState`, `default`, and `type ErrorCardVariant`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/vanished-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VanishedCard } from '@/components/vanished-card'

describe('VanishedCard', () => {
  it('shows a "?" for the missing variant', () => {
    render(<VanishedCard variant="missing" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('shows a star for the dissolving variant', () => {
    const { container } = render(<VanishedCard variant="dissolving" />)
    expect(container.textContent).toContain('✦')
  })

  it('scales the card box with the size prop', () => {
    const { container: lg } = render(<VanishedCard variant="missing" size="lg" />)
    const { container: sm } = render(<VanishedCard variant="missing" size="sm" />)
    expect(lg.querySelector('.h-80')).not.toBeNull()
    expect(sm.querySelector('.h-24')).not.toBeNull()
  })

  it('merges a className onto the outer wrapper', () => {
    const { container } = render(<VanishedCard variant="missing" className="mb-8" />)
    expect(container.firstElementChild?.className).toContain('mb-8')
  })

  it('hides the decorative marks from assistive tech', () => {
    const { container } = render(<VanishedCard variant="missing" />)
    const marks = container.querySelectorAll('[aria-hidden="true"]')
    expect(marks.length).toBe(3) // symbol plus two sparkles
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/vanished-card.test.tsx
```

Expected: FAIL - cannot resolve `@/components/vanished-card`.

- [ ] **Step 3: Create the component**

Create `app/web/src/components/vanished-card.tsx`:

```tsx
import { cn } from '@/lib/utils'

export type VanishedCardVariant = 'missing' | 'dissolving' | 'dark'
export type VanishedCardSize = 'lg' | 'md' | 'sm'

const VARIANTS: Record<
  VanishedCardVariant,
  { symbol: string; color: string; mask: boolean }
> = {
  missing: { symbol: '?', color: 'text-primary-ink', mask: false },
  dissolving: { symbol: '✦', color: 'text-secondary-ink', mask: true },
  dark: { symbol: '✦', color: 'text-secondary-ink', mask: false },
}

// One motif at three scales. `stripe` is the width in px of a single diagonal
// band; the gradient repeats at twice that. It shrinks with the card so the
// hatching keeps the same visual density instead of turning into a smear at
// the small sizes.
const SIZES: Record<
  VanishedCardSize,
  {
    card: string
    radius: string
    inset: string
    symbol: string
    sparkleTop: string
    sparkleBottom: string
    stripe: number
  }
> = {
  lg: {
    card: 'h-80',
    radius: 'rounded-2xl',
    inset: 'inset-4 rounded-lg',
    symbol: 'text-7xl',
    sparkleTop: '-left-3 -top-2 text-xl',
    sparkleBottom: '-bottom-1 -right-3 text-sm',
    stripe: 9,
  },
  md: {
    card: 'h-40',
    radius: 'rounded-xl',
    inset: 'inset-2.5 rounded-md',
    symbol: 'text-4xl',
    sparkleTop: '-left-2 -top-1.5 text-base',
    sparkleBottom: '-bottom-1 -right-2 text-xs',
    stripe: 6,
  },
  sm: {
    card: 'h-24',
    radius: 'rounded-lg',
    inset: 'inset-1.5 rounded-sm',
    symbol: 'text-2xl',
    sparkleTop: '-left-1.5 -top-1 text-xs',
    sparkleBottom: '-bottom-0.5 -right-1.5 text-[0.625rem]',
    stripe: 4,
  },
}

export function VanishedCard({
  variant,
  size = 'lg',
  className,
}: {
  variant: VanishedCardVariant
  size?: VanishedCardSize
  className?: string
}) {
  const { symbol, color, mask } = VARIANTS[variant]
  const s = SIZES[size]
  return (
    <div className={cn('relative inline-block', className)}>
      <div
        className={cn(
          'relative grid aspect-[5/7] place-items-center overflow-hidden border border-border',
          s.card,
          s.radius,
          // Light gets the scale's own shadow; dark keeps the original heavy
          // one, which is built for a midnight page and would be too much on
          // parchment.
          'shadow-xl dark:shadow-[0_18px_42px_rgba(0,0,0,0.55)]',
          mask && '[mask-image:linear-gradient(115deg,#000_55%,transparent_92%)]',
        )}
        style={{
          backgroundImage: `repeating-linear-gradient(135deg,var(--color-muted) 0 ${s.stripe}px,var(--color-card) ${s.stripe}px ${s.stripe * 2}px)`,
        }}
      >
        <div
          className={cn(
            'pointer-events-none absolute border border-dashed border-border',
            s.inset,
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            '[filter:drop-shadow(0_0_18px_var(--glow-symbol))]',
            s.symbol,
            color,
          )}
        >
          {symbol}
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'absolute text-primary-ink [filter:drop-shadow(0_0_8px_var(--glow-sparkle))]',
          s.sparkleTop,
        )}
      >
        {'✦'}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute text-primary-ink [filter:drop-shadow(0_0_6px_var(--glow-sparkle-sm))]',
          s.sparkleBottom,
        )}
      >
        {'✦'}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/vanished-card.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Delegate from ErrorCardState**

Replace the whole of `app/web/src/components/error-card-state.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { VanishedCard, type VanishedCardVariant } from '@/components/vanished-card'

export type ErrorCardVariant = VanishedCardVariant

export function ErrorCardState({
  variant,
  heading,
  description,
  digest,
  digestLabel = 'reference',
  children,
}: {
  variant: ErrorCardVariant
  heading: string
  description: string
  digest?: string
  digestLabel?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-[75vh] flex-col items-center justify-center px-6 py-20 text-center">
      <VanishedCard variant={variant} size="lg" className="mb-8" />
      <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">{description}</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{children}</div>
      {digest ? (
        <p className="mt-5 font-mono text-xs text-muted-foreground/70">
          {digestLabel}: {digest}
        </p>
      ) : null}
    </main>
  )
}

export default ErrorCardState
```

- [ ] **Step 6: Run the existing error-card tests to prove nothing moved**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/error-card-state.test.tsx src/components/__tests__/vanished-card.test.tsx
```

Expected: PASS, 9 tests total (4 existing + 5 new).

- [ ] **Step 7: Typecheck**

```bash
cd app && /usr/local/bin/npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/vanished-card.tsx app/web/src/components/__tests__/vanished-card.test.tsx app/web/src/components/error-card-state.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): extract the vanished-card motif from ErrorCardState"
```

---

### Task 2: The EmptyResults shell

**Files:**
- Create: `app/web/src/components/empty-results.tsx`
- Create: `app/web/src/components/__tests__/empty-results.test.tsx`

**Interfaces:**
- Consumes: `VanishedCard`, `VanishedCardSize` from Task 1.
- Produces: `function EmptyResults(props: { size?: 'default' | 'compact'; heading: string; description?: string; className?: string; children?: ReactNode }): ReactElement`. Renders a `role="status"` container so screen readers announce the miss; every call site relies on that role.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/empty-results.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyResults } from '@/components/empty-results'

describe('EmptyResults', () => {
  it('announces itself and renders heading, description and actions', () => {
    render(
      <EmptyResults heading="No cards match" description="Try another spell">
        <button>Clear filters</button>
      </EmptyResults>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('No cards match')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No cards match')
    expect(screen.getByText('Try another spell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('omits the description and the action row when neither is given', () => {
    render(<EmptyResults heading="Nothing here" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Nothing here')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('uses the medium motif by default and the small one when compact', () => {
    const { container: def } = render(<EmptyResults heading="a" />)
    const { container: compact } = render(<EmptyResults heading="b" size="compact" />)
    expect(def.querySelector('.h-40')).not.toBeNull()
    expect(compact.querySelector('.h-24')).not.toBeNull()
  })

  it('merges a className onto the container so callers can span a grid', () => {
    render(<EmptyResults heading="a" className="col-span-full" />)
    expect(screen.getByRole('status').className).toContain('col-span-full')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/empty-results.test.tsx
```

Expected: FAIL - cannot resolve `@/components/empty-results`.

- [ ] **Step 3: Create the component**

Create `app/web/src/components/empty-results.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { VanishedCard, type VanishedCardSize } from '@/components/vanished-card'

// The in-page sibling of ErrorCardState: same vanished-card motif, same
// vertical rhythm, one size down and headed by an h2 because it renders
// inside a page that already owns an h1. `compact` exists for the deck
// builder's browse rail, the only container narrow enough that the default
// would crowd the grid it replaces.
const SIZES: Record<
  'default' | 'compact',
  { motif: VanishedCardSize; pad: string; gap: string; heading: string; desc: string; actions: string }
> = {
  default: {
    motif: 'md',
    pad: 'py-14',
    gap: 'mb-6',
    heading: 'text-xl',
    desc: 'mt-2 max-w-sm text-sm',
    actions: 'mt-6',
  },
  compact: {
    motif: 'sm',
    pad: 'py-10',
    gap: 'mb-4',
    heading: 'text-base',
    desc: 'mt-1 max-w-xs text-sm',
    actions: 'mt-4',
  },
}

export function EmptyResults({
  size = 'default',
  heading,
  description,
  className,
  children,
}: {
  size?: 'default' | 'compact'
  heading: string
  description?: string
  className?: string
  children?: ReactNode
}) {
  const s = SIZES[size]
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center px-6 text-center', s.pad, className)}
    >
      <VanishedCard variant="missing" size={s.motif} className={s.gap} />
      <h2 className={cn('font-semibold text-foreground', s.heading)}>{heading}</h2>
      {description ? (
        <p className={cn('text-muted-foreground', s.desc)}>{description}</p>
      ) : null}
      {children ? (
        <div className={cn('flex flex-wrap items-center justify-center gap-3', s.actions)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/empty-results.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/empty-results.tsx app/web/src/components/__tests__/empty-results.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add the EmptyResults shell"
```

---

### Task 3: Copy for every surface, in both locales

No component consumes these yet; adding them first keeps every later task free of JSON edits.

**Files:**
- Modify: `app/web/messages/en.json`
- Modify: `app/web/messages/de.json`

**Interfaces:**
- Produces these message paths, consumed by Tasks 5-8:
  - `search.empty.heading`, `search.empty.queryAndFilters`, `search.empty.filters`, `search.empty.query`, `search.empty.plain`
  - `sets.empty.heading`, `sets.empty.description`
  - `collection.emptySet.heading`, `collection.emptySet.description`, `collection.emptyBrowse.heading`, `collection.emptyBrowse.description`
  - `decks.browse.empty.heading`, `decks.browse.empty.description`
  - `decks.explore.empty.heading`, `decks.explore.empty.description`
- Removes `search.noResults`, `collection.empty`, `decks.browse.noResults`, and changes `decks.explore.empty` from a string to an object. `filters.clearFilters` and `search.clear` already exist and are reused as button labels - do not add new keys for them.

- [ ] **Step 1: Confirm the keys being removed have exactly one consumer each**

```bash
cd app/web && grep -rn "search\.noResults\|'noResults'\|collection\.empty\|explore\.empty\|browse\.noResults\|t('empty')" src e2e
```

Expected: `card-grid.tsx:15` (`t('noResults')` in the `search` namespace), `card-grid.test.tsx:27`, `collection-view.tsx:107`, `collection-view.tsx:124`, `deck-card-browser.tsx:228`, `deck-browse.tsx:143`. The `noResults` hits in `admin/*` and `deck-card-browser.tsx:228` belong to other namespaces - leave the admin ones alone. If anything else appears, stop and report it before editing the JSON.

- [ ] **Step 2: Edit `app/web/messages/en.json`**

In `search`, replace the line `"noResults": "No cards found.",` with:

```json
    "empty": {
      "heading": "No cards match",
      "queryAndFilters": "Nothing in the archive matches “{query}” with these filters.",
      "filters": "Nothing in the archive matches these filters.",
      "query": "Nothing in the archive matches “{query}”.",
      "plain": "There are no cards to show here."
    },
```

In `sets`, add:

```json
    "empty": {
      "heading": "No cards in this set",
      "description": "This set has no cards in the archive yet."
    },
```

In `collection`, replace `"empty": "You don't own any cards yet.",` with:

```json
    "emptySet": {
      "heading": "No cards from this set yet",
      "description": "You don't own any cards from this set yet."
    },
    "emptyBrowse": {
      "heading": "No cards match",
      "description": "No cards in your collection match these filters."
    },
```

In `decks.browse`, replace `"noResults": "No cards found.",` with:

```json
      "empty": {
        "heading": "No cards match",
        "description": "Try a different search, or clear the filters."
      },
```

In `decks.explore`, replace `"empty": "No decks match your filters.",` with:

```json
      "empty": {
        "heading": "No decks match",
        "description": "No decks match your filters."
      },
```

- [ ] **Step 3: Edit `app/web/messages/de.json` with the same shape**

In `search`, replace `"noResults": "Keine Karten gefunden.",` with:

```json
    "empty": {
      "heading": "Keine Karten gefunden",
      "queryAndFilters": "Nichts im Archiv passt zu „{query}“ mit diesen Filtern.",
      "filters": "Nichts im Archiv passt zu diesen Filtern.",
      "query": "Nichts im Archiv passt zu „{query}“.",
      "plain": "Hier gibt es keine Karten anzuzeigen."
    },
```

In `sets`, add:

```json
    "empty": {
      "heading": "Keine Karten in diesem Set",
      "description": "Dieses Set enthält noch keine Karten im Archiv."
    },
```

In `collection`, replace `"empty": "Du besitzt noch keine Karten.",` with:

```json
    "emptySet": {
      "heading": "Noch keine Karten aus diesem Set",
      "description": "Du besitzt noch keine Karten aus diesem Set."
    },
    "emptyBrowse": {
      "heading": "Keine Karten gefunden",
      "description": "Keine Karten in deiner Sammlung passen zu diesen Filtern."
    },
```

In `decks.browse`, replace `"noResults": "Keine Karten gefunden.",` with:

```json
      "empty": {
        "heading": "Keine Karten gefunden",
        "description": "Versuche eine andere Suche oder setze die Filter zurück."
      },
```

In `decks.explore`, replace `"empty": "Keine Decks entsprechen deinen Filtern.",` with:

```json
      "empty": {
        "heading": "Keine Decks gefunden",
        "description": "Keine Decks entsprechen deinen Filtern."
      },
```

- [ ] **Step 4: Verify both files still parse and the key sets match**

```bash
cd app/web && /usr/local/bin/node -e "
const en = require('./messages/en.json'), de = require('./messages/de.json')
const paths = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' ? paths(v, p + k + '.') : [p + k])
const a = new Set(paths(en)), b = new Set(paths(de))
const onlyEn = [...a].filter((k) => !b.has(k)), onlyDe = [...b].filter((k) => !a.has(k))
console.log('only in en:', onlyEn)
console.log('only in de:', onlyDe)
if (onlyEn.length || onlyDe.length) process.exit(1)
console.log('key sets match:', a.size, 'paths')
"
```

Expected: both lists empty, exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add empty-state copy for every result surface"
```

Note: the app will not build between this commit and Task 5 - `card-grid.tsx` still calls the removed `search.noResults`. That is expected; Task 5 closes it. Do not run `npm run build` here.

---

### Task 4: `hasActiveFilters` and `emptyReason`

`clear-filters.tsx` already owns a filter-active check and a "clear everything" patch. The search empty state needs both. Move them to `search-params.ts` rather than copying them.

**Files:**
- Modify: `app/web/src/lib/search-params.ts`
- Modify: `app/web/src/components/search/clear-filters.tsx`
- Modify: `app/web/src/lib/__tests__/search-params.test.ts`

**Interfaces:**
- Consumes: the existing `SearchState` type and `parseSearchParams` from the same file.
- Produces:
  - `const CLEARED_FILTERS: Record<string, null>`
  - `function hasActiveFilters(s: SearchState): boolean`
  - `type EmptyReason = 'queryAndFilters' | 'filters' | 'query' | 'plain'`
  - `function emptyReason(s: SearchState): EmptyReason`

- [ ] **Step 1: Write the failing tests**

Append to `app/web/src/lib/__tests__/search-params.test.ts`. The file already imports from the relative path `'../search-params'`; extend that existing import list with `hasActiveFilters`, `emptyReason` and `CLEARED_FILTERS` (`withParams` and `parseSearchParams` are already there):

```ts
import {
  parseSearchParams, toSearchOptions, withParams, toURLSearchParams, contextHref, pageQuery,
  hasActiveFilters, emptyReason, CLEARED_FILTERS,
} from '../search-params'
```

Then append these suites:

```ts
describe('hasActiveFilters', () => {
  it('is false for a bare query', () => {
    expect(hasActiveFilters(parseSearchParams(new URLSearchParams('q=lumos')))).toBe(false)
  })

  it('is true for each narrowing filter on its own', () => {
    const cases = ['type=Spell', 'lesson=Charms', 'rarity=Rare', 'finish=foil',
      'legality=banned', 'set=BS', 'costMin=2', 'costMax=5', 'official=fan']
    for (const c of cases) {
      expect(hasActiveFilters(parseSearchParams(new URLSearchParams(c)))).toBe(true)
    }
  })

  it('ignores sort and page, which do not narrow the result set', () => {
    expect(hasActiveFilters(parseSearchParams(new URLSearchParams('sort=name&page=3')))).toBe(false)
  })
})

describe('emptyReason', () => {
  it('reports both when a query and a filter are set', () => {
    expect(emptyReason(parseSearchParams(new URLSearchParams('q=lumos&rarity=Rare')))).toBe('queryAndFilters')
  })

  it('reports filters when only a filter is set', () => {
    expect(emptyReason(parseSearchParams(new URLSearchParams('rarity=Rare')))).toBe('filters')
  })

  it('reports query when only a query is set', () => {
    expect(emptyReason(parseSearchParams(new URLSearchParams('q=lumos')))).toBe('query')
  })

  it('treats a whitespace-only query as no query', () => {
    expect(emptyReason(parseSearchParams(new URLSearchParams('q=%20%20')))).toBe('plain')
  })

  it('reports plain when nothing is set', () => {
    expect(emptyReason(parseSearchParams(new URLSearchParams('')))).toBe('plain')
  })
})

describe('CLEARED_FILTERS', () => {
  it('drops every narrowing param but keeps the query and sort', () => {
    const next = withParams(
      new URLSearchParams('q=lumos&sort=name&rarity=Rare&set=BS&costMin=2&official=fan'),
      CLEARED_FILTERS,
    )
    expect(next.get('q')).toBe('lumos')
    expect(next.get('sort')).toBe('name')
    expect(next.get('rarity')).toBeNull()
    expect(next.get('set')).toBeNull()
    expect(next.get('costMin')).toBeNull()
    expect(next.get('official')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/search-params.test.ts
```

Expected: FAIL - `hasActiveFilters`, `emptyReason`, `CLEARED_FILTERS` are not exported.

- [ ] **Step 3: Add the helpers to `app/web/src/lib/search-params.ts`**

Append at the end of the file:

```ts
// Every narrowing filter, zeroed. Shared by the "Clear filters" control and by
// the search empty state so the two can never drift apart on what "clear"
// means. The query and the sort order deliberately survive.
export const CLEARED_FILTERS: Record<string, null> = {
  type: null, lesson: null, rarity: null, finish: null,
  legality: null, set: null, costMin: null, costMax: null, official: null,
}

export function hasActiveFilters(s: SearchState): boolean {
  return (
    s.types.length > 0 ||
    s.lessons.length > 0 ||
    s.rarities.length > 0 ||
    s.finishes.length > 0 ||
    s.legalities.length > 0 ||
    Boolean(s.set) ||
    s.costMin != null ||
    s.costMax != null ||
    s.official !== null
  )
}

export type EmptyReason = 'queryAndFilters' | 'filters' | 'query' | 'plain'

// Why a result set came back empty, which decides both the copy and which
// recovery buttons the empty state offers.
export function emptyReason(s: SearchState): EmptyReason {
  const query = s.q.trim().length > 0
  const filters = hasActiveFilters(s)
  if (query && filters) return 'queryAndFilters'
  if (filters) return 'filters'
  if (query) return 'query'
  return 'plain'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/search-params.test.ts
```

Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 5: Point `clear-filters.tsx` at the shared helpers**

Replace the whole of `app/web/src/components/search/clear-filters.tsx` with:

```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { CLEARED_FILTERS, hasActiveFilters, parseSearchParams, withParams } from '@/lib/search-params'
import { ClearFiltersButton } from '@/components/search/clear-filters-button'

// URL adapter for the search page: clears every narrowing filter (type/lesson/
// rarity/finish/legality/set/cost/official) in one click while preserving the
// search query and sort order.
export function ClearFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const active = hasActiveFilters(parseSearchParams(new URLSearchParams(params.toString())))

  function clear() {
    const next = withParams(new URLSearchParams(params.toString()), CLEARED_FILTERS)
    router.push(`${pathname}?${next.toString()}`)
  }

  return <ClearFiltersButton active={active} onClear={clear} />
}
```

- [ ] **Step 6: Run the search component tests and typecheck**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/search && /usr/local/bin/npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib/search-params.ts app/web/src/lib/__tests__/search-params.test.ts app/web/src/components/search/clear-filters.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): share the active-filter check and cleared-filter patch"
```

---

### Task 5: The search surface

**Files:**
- Create: `app/web/src/components/search/search-empty-results.tsx`
- Create: `app/web/src/components/search/__tests__/search-empty-results.test.tsx`
- Modify: `app/web/src/components/card/card-grid.tsx`
- Modify: `app/web/src/components/card/__tests__/card-grid.test.tsx`
- Modify: `app/web/src/app/[locale]/search/page.tsx`

**Interfaces:**
- Consumes: `EmptyResults` (Task 2); `emptyReason`, `CLEARED_FILTERS`, `parseSearchParams`, `withParams` (Task 4); `search.empty.*` and `filters.clearFilters` and `search.clear` (Task 3).
- Produces:
  - `function SearchEmptyResults(): ReactElement` - a `'use client'` component taking no props; it reads the URL itself, the way `ActiveFilters` and `ClearFilters` already do.
  - `CardGrid` gains `empty?: ReactNode`. When `hits` is empty it renders `empty` if given, otherwise a default `EmptyResults`. Passing `null` is treated as "not given"; callers that want nothing rendered should not use `CardGrid`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/search/__tests__/search-empty-results.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'
import { SearchEmptyResults } from '@/components/search/search-empty-results'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/search',
}))

beforeEach(() => {
  push.mockClear()
  search = ''
})

describe('SearchEmptyResults', () => {
  it('names the query and offers both escapes when a query and a filter are set', () => {
    search = 'q=lumos&rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(en.search.empty.heading)
    expect(screen.getByText(/lumos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.filters.clearFilters })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.search.clear })).toBeInTheDocument()
  })

  it('offers only Clear filters when there is no query', () => {
    search = 'rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByText(en.search.empty.filters)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.filters.clearFilters })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.search.clear })).not.toBeInTheDocument()
  })

  it('offers only Clear search when there are no filters', () => {
    search = 'q=lumos'
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByRole('button', { name: en.search.clear })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.filters.clearFilters })).not.toBeInTheDocument()
  })

  it('offers nothing to clear when the URL is bare', () => {
    renderWithIntl(<SearchEmptyResults />)
    expect(screen.getByText(en.search.empty.plain)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('drops every filter but keeps the query when Clear filters is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    search = 'q=lumos&rarity=Rare&set=BS'
    renderWithIntl(<SearchEmptyResults />)
    await userEvent.click(screen.getByRole('button', { name: en.filters.clearFilters }))
    expect(push).toHaveBeenCalledTimes(1)
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('q')).toBe('lumos')
    expect(url.searchParams.get('rarity')).toBeNull()
    expect(url.searchParams.get('set')).toBeNull()
  })

  it('drops the query but keeps the filters when Clear search is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    search = 'q=lumos&rarity=Rare'
    renderWithIntl(<SearchEmptyResults />)
    await userEvent.click(screen.getByRole('button', { name: en.search.clear }))
    const url = new URL(push.mock.calls[0][0] as string, 'http://x')
    expect(url.searchParams.get('q')).toBeNull()
    expect(url.searchParams.get('rarity')).toBe('Rare')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/search/__tests__/search-empty-results.test.tsx
```

Expected: FAIL - cannot resolve `@/components/search/search-empty-results`.

- [ ] **Step 3: Create the component**

Create `app/web/src/components/search/search-empty-results.tsx`:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { CLEARED_FILTERS, emptyReason, parseSearchParams, withParams } from '@/lib/search-params'
import { EmptyResults } from '@/components/empty-results'
import { Button } from '@/components/ui/button'

// The search page's zero-result state. It reads the URL itself rather than
// taking props, matching ActiveFilters and ClearFilters, so the server page
// stays a server component.
//
// No filter chips here on purpose: the results bar directly above already
// renders the removable chips and the Clear-filters link. What that bar has no
// control for is dropping the *query*, so that is the escape this state adds.
export function SearchEmptyResults() {
  const t = useTranslations('search')
  const tf = useTranslations('filters')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const state = parseSearchParams(new URLSearchParams(params.toString()))
  const reason = emptyReason(state)
  const query = state.q.trim()

  const description =
    reason === 'queryAndFilters'
      ? t('empty.queryAndFilters', { query })
      : reason === 'filters'
        ? t('empty.filters')
        : reason === 'query'
          ? t('empty.query', { query })
          : t('empty.plain')

  function patch(next: Record<string, string | string[] | null>) {
    const merged = withParams(new URLSearchParams(params.toString()), next)
    router.push(`${pathname}?${merged.toString()}`)
  }

  const canClearFilters = reason === 'queryAndFilters' || reason === 'filters'

  return (
    <EmptyResults heading={t('empty.heading')} description={description}>
      {canClearFilters ? (
        <Button onClick={() => patch(CLEARED_FILTERS)}>{tf('clearFilters')}</Button>
      ) : null}
      {query ? (
        <Button variant="outline" onClick={() => patch({ q: null })}>
          {t('clear')}
        </Button>
      ) : null}
    </EmptyResults>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/search/__tests__/search-empty-results.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Give `CardGrid` an empty slot**

In `app/web/src/components/card/card-grid.tsx`, replace the import block and the component signature and empty branch. The finished file:

```tsx
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { SearchDocument } from '@revelio/search'
import { CardTile } from '@/components/card/card-tile'
import { EmptyResults } from '@/components/empty-results'

export function CardGrid({
  hits, imageBase, searchParams, startIndex = 0, empty,
}: {
  hits: SearchDocument[]
  imageBase: string
  searchParams?: URLSearchParams
  startIndex?: number
  // Surface-specific zero-result state. Callers that know why their list is
  // empty (the search page knows the query and filters, a set page knows it is
  // a data gap) pass their own; the fallback is the generic card-grid one.
  empty?: ReactNode
}) {
  const t = useTranslations('search')
  if (hits.length === 0) {
    return empty ?? <EmptyResults heading={t('empty.heading')} description={t('empty.plain')} />
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

- [ ] **Step 6: Update the card-grid test**

In `app/web/src/components/card/__tests__/card-grid.test.tsx`, replace the `shows an empty state when there are no hits` test with:

```tsx
  it('shows the default empty state when there are no hits', () => {
    renderWithIntl(<CardGrid hits={[]} imageBase="http://img" />)
    expect(screen.getByRole('status')).toHaveTextContent(en.search.empty.heading)
    expect(screen.getByText(en.search.empty.plain)).toBeInTheDocument()
  })

  it('renders a caller-supplied empty state instead of the default', () => {
    renderWithIntl(<CardGrid hits={[]} imageBase="http://img" empty={<p>Nothing in this set</p>} />)
    expect(screen.getByText('Nothing in this set')).toBeInTheDocument()
    expect(screen.queryByText(en.search.empty.plain)).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Wire the search page**

In `app/web/src/app/[locale]/search/page.tsx`, add the import beside the other component imports:

```tsx
import { SearchEmptyResults } from '@/components/search/search-empty-results'
```

and give `CardGrid` the slot:

```tsx
      <CardGrid
        hits={results.hits}
        imageBase={IMAGE_BASE}
        searchParams={current}
        startIndex={(results.page - 1) * results.hitsPerPage}
        empty={<SearchEmptyResults />}
      />
```

- [ ] **Step 8: Run the card and search tests and typecheck**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/card src/components/search && /usr/local/bin/npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/search/search-empty-results.tsx app/web/src/components/search/__tests__/search-empty-results.test.tsx app/web/src/components/card/card-grid.tsx app/web/src/components/card/__tests__/card-grid.test.tsx "app/web/src/app/[locale]/search/page.tsx"
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give search a diagnostic empty state"
```

---

### Task 6: The set page

**Files:**
- Modify: `app/web/src/app/[locale]/sets/[code]/page.tsx`

**Interfaces:**
- Consumes: `EmptyResults` (Task 2), `CardGrid`'s `empty` prop (Task 5), `sets.empty.*` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `app/web/src/app/[locale]/sets/[code]/page.tsx`, beside the `CardGrid` import:

```tsx
import { EmptyResults } from '@/components/empty-results'
```

- [ ] **Step 2: Pass the slot**

Replace the `CardGrid` call at the bottom of the page:

```tsx
      <CardGrid
        hits={results.hits}
        imageBase={IMAGE_BASE}
        empty={
          <EmptyResults heading={t('empty.heading')} description={t('empty.description')} />
        }
      />
```

`t` is already `await getTranslations('sets')` in this component, so no new hook is needed. There is no recovery action: an empty set is a data gap the reader cannot fix from here.

- [ ] **Step 3: Typecheck**

```bash
cd app && /usr/local/bin/npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add "app/web/src/app/[locale]/sets/[code]/page.tsx"
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give the set page the shared empty state"
```

---

### Task 7: Both collection tabs

**Files:**
- Modify: `app/web/src/components/collection/collection-view.tsx`

**Interfaces:**
- Consumes: `EmptyResults` (Task 2), `collection.emptySet.*` / `collection.emptyBrowse.*` (Task 3), the file's existing `hasFilters` and `clearFilters`.
- Produces: nothing new.

- [ ] **Step 1: Add the imports**

In `app/web/src/components/collection/collection-view.tsx`, beside the other component imports:

```tsx
import { EmptyResults } from '@/components/empty-results'
import { Button } from '@/components/ui/button'
```

- [ ] **Step 2: Add the filters namespace**

Directly under `const t = useTranslations('collection')`:

```tsx
  const tf = useTranslations('filters')
```

- [ ] **Step 3: Replace the By-set empty state**

Replace this line (currently `collection-view.tsx:107`):

```tsx
            {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
```

with:

```tsx
            {cards.length ? grid(cards) : (
              <EmptyResults
                heading={t('emptySet.heading')}
                description={t('emptySet.description')}
              />
            )}
```

No action here: the set nav beside it is already the way to look at a different set.

- [ ] **Step 4: Replace the Browse-all empty state**

Replace this line (currently `collection-view.tsx:124`):

```tsx
        {browseCards.length ? grid(browseCards) : <p className="text-muted-foreground">{t('empty')}</p>}
```

with:

```tsx
        {browseCards.length ? grid(browseCards) : (
          <EmptyResults
            heading={t('emptyBrowse.heading')}
            description={t('emptyBrowse.description')}
          >
            {hasFilters ? (
              <Button onClick={clearFilters}>{tf('clearFilters')}</Button>
            ) : null}
          </EmptyResults>
        )}
```

- [ ] **Step 5: Run the collection tests and typecheck**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/collection && /usr/local/bin/npm run typecheck
```

Expected: PASS, no type errors. If a collection test asserted the old `collection.empty` string, update it to `en.collection.emptySet.heading` or `en.collection.emptyBrowse.heading` as appropriate.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/collection/collection-view.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give both collection tabs the shared empty state"
```

---

### Task 8: Both deck surfaces

The deck-builder rail is the one call site that gets `compact`: it is a side panel with `overflow-y-auto` and 190px auto-fill columns, and the default motif would crowd the grid it stands in for. Deck explore is a full-width page, so it takes the default.

**Files:**
- Modify: `app/web/src/components/deck/deck-card-browser.tsx`
- Modify: `app/web/src/components/deck/deck-browse.tsx`

**Interfaces:**
- Consumes: `EmptyResults` (Task 2), `decks.browse.empty.*` / `decks.explore.empty.*` (Task 3), each file's existing filter state (`filtersActive`/`clearFilters` in the browser, `hasFilters`/`push` in explore).
- Produces: nothing new.

- [ ] **Step 1: Import into the deck-builder browser**

In `app/web/src/components/deck/deck-card-browser.tsx`, beside the other component imports:

```tsx
import { EmptyResults } from '@/components/empty-results'
```

`Button` and `useTranslations` are already imported in this file; add a filters namespace under the existing `const t = useTranslations('decks')` (line 82):

```tsx
  const tf = useTranslations('filters')
```

If `Button` is not already imported there, add `import { Button } from '@/components/ui/button'`.

- [ ] **Step 2: Replace the browser's empty paragraph**

Replace this block (currently `deck-card-browser.tsx:228-232`):

```tsx
        {result.hits.length === 0 && !pending && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground" role="status">
            {t('browse.noResults')}
          </p>
        )}
```

with:

```tsx
        {result.hits.length === 0 && !pending && (
          <EmptyResults
            size="compact"
            className="col-span-full"
            heading={t('browse.empty.heading')}
            description={t('browse.empty.description')}
          >
            {filtersActive ? (
              <Button size="sm" onClick={clearFilters}>{tf('clearFilters')}</Button>
            ) : null}
          </EmptyResults>
        )}
```

`col-span-full` keeps it spanning the auto-fill grid, as the paragraph did. `EmptyResults` carries its own `role="status"`, so the attribute is not repeated.

- [ ] **Step 3: Import into deck explore**

In `app/web/src/components/deck/deck-browse.tsx`, beside the other component imports:

```tsx
import { EmptyResults } from '@/components/empty-results'
```

and add the filters namespace under `const t = useTranslations('decks')`:

```tsx
  const tf = useTranslations('filters')
```

`Button` is already imported in this file.

- [ ] **Step 4: Replace the explore empty paragraph**

Replace this line (currently `deck-browse.tsx:143`):

```tsx
        <p className="py-16 text-center text-sm text-muted-foreground">{t('explore.empty')}</p>
```

with:

```tsx
        <EmptyResults
          heading={t('explore.empty.heading')}
          description={t('explore.empty.description')}
        >
          {hasFilters ? (
            <Button onClick={() => push({ lessons: [], format: null })}>
              {tf('clearFilters')}
            </Button>
          ) : null}
        </EmptyResults>
```

The reset payload is copied from the `ClearFiltersButton` already on line 119, so the two controls clear exactly the same thing.

- [ ] **Step 5: Run the deck tests and typecheck**

```bash
cd app && /usr/local/bin/npm test -w web -- src/components/deck && /usr/local/bin/npm run typecheck
```

Expected: PASS, no type errors. If a deck test asserted `en.decks.browse.noResults` or the old string `en.decks.explore.empty`, update it to the new `.heading` path.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/deck/deck-card-browser.tsx app/web/src/components/deck/deck-browse.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give both deck surfaces the shared empty state"
```

---

### Task 9: Full verification and a look at the real thing

Every prior task verified its own slice. This one proves the whole app still builds, lints and renders, and that the redesigned state actually looks right in both themes.

**Files:**
- No source changes expected. Fix whatever the checks surface.

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: nothing.

- [ ] **Step 1: Confirm no stale references to the removed keys survive**

```bash
cd app/web && grep -rn "search\.noResults\|t('noResults')\|collection\.empty'\|browse\.noResults\|explore\.empty'" src e2e
```

Expected: no hits outside the `admin/` components, whose `noResults` belongs to a different namespace and is untouched.

- [ ] **Step 2: Typecheck every workspace**

```bash
cd app && /usr/local/bin/npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Lint the web workspace**

```bash
cd app && /usr/local/bin/npm run lint -w web
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
cd app && /usr/local/bin/npm test
```

Expected: all pass. Tests that need Meilisearch/MinIO/Postgres will skip or fail on their own for lack of local services; compare against a run on `main` before treating any such failure as caused by this branch.

- [ ] **Step 5: Build**

```bash
cd app && /usr/local/bin/npm run build -w web
```

Expected: build succeeds. This is the first point in the branch where the build is expected to pass, since Task 3 removed message keys that Task 5 replaced.

- [ ] **Step 6: Screenshot the redesigned state in both themes**

Start the dev server and shoot `/search` with a query that matches nothing. Per the repo's convention there is no Chrome on this machine; drive the Playwright chromium that ships with the repo, imported by absolute path.

```bash
cd app && /usr/local/bin/npm run dev -w web
```

Then, in a second shell, write and run a short script under the scratchpad that:
1. imports `chromium` from the repo's `app/web/node_modules/playwright-core` (absolute path),
2. loads `http://localhost:3000/en/search?q=zzzznotacard&rarity=Rare`,
3. screenshots it, then sets `prefers-color-scheme: dark` via `page.emulateMedia({ colorScheme: 'dark' })` and screenshots again,
4. repeats for `http://localhost:3000/en/decks?lesson=zzzz`.

Read both screenshots and confirm: the motif reads at h-40, the stripes are not a smear, the sparkles sit outside the card corners, both buttons are present and legible, and nothing overflows the container in either theme.

- [ ] **Step 7: Commit any fixes the checks surfaced**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(web): <what the verification turned up>"
```

Skip this step if nothing needed fixing.

---

## Self-Review

**Spec coverage.** All six call sites from the Design table have a task: search (5), sets (6), collection x2 (7), deck browser and deck explore (8). The family/size table is implemented in Tasks 1-2. The "no filter chips" decision is carried into Task 5's component comment. The out-of-scope list is respected: no task touches `deck-list.tsx`, `deck-panel.tsx`, or the admin tables.

**Placeholders.** None. Every code step carries the actual code; the only free-text step is Task 9 Step 6, which spells out the four things the screenshot script must do and the five things to look for.

**Type consistency.** `VanishedCardVariant`/`VanishedCardSize` are defined in Task 1 and consumed under those names in Task 2. `EmptyReason`, `hasActiveFilters`, `emptyReason`, `CLEARED_FILTERS` are defined in Task 4 and consumed under those names in Tasks 4 and 5. `EmptyResults`'s prop names (`size`, `heading`, `description`, `className`, `children`) are used consistently in Tasks 5-8. `CardGrid`'s new prop is `empty` in Tasks 5 and 6.

**Known ordering hazard.** Task 3 removes message keys that Task 5 replaces, so `npm run build` is expected to fail between them. Both tasks say so, and Task 9 Step 5 is where the build is first asserted green.

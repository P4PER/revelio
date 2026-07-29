# Sort Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Sort dropdown out of the filter toolbar into a shared, right-aligned results header on the `/search` and `/decks` pages.

**Architecture:** Pure JSX relocation of two existing Sort controls — no behavior, prop, URL-param, or component-internal changes. On `/search`, `SortSelect` moves from `search-controls.tsx` into the results-count row of `search/page.tsx`. On `/decks`, the inline sort `<Select>` moves from the filter row into the existing results-header row in `deck-browse.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn `Select`, next-intl, vitest + Testing Library.

## Global Constraints

- All app commands run from `app/` (npm workspaces root). CI sets `working-directory: app`.
- This is a **refactor**: Sort behavior, the `sort` URL param, option lists, and the `SortSelect` component internals must remain byte-for-byte identical. Only DOM placement changes.
- Both sort triggers keep `size="sm"` and their existing `aria-label`; the trigger shows the bare value ("Relevance" / "Newest") — **no** visible "Sort:" label.
- Commit with `git -c commit.gpgsign=false` (GPG signing is broken in this shell's PATH).
- Conventional Commits.

---

### Task 1: Move Sort into the deck-browse results header

**Files:**
- Modify: `app/web/src/components/deck-browse.tsx`
- Test: `app/web/src/components/__tests__/deck-browse.test.tsx`

**Interfaces:**
- Consumes: existing `push(next: Partial<BrowseState>)`, `state.sort: PublicDeckSort`, `SORTS`, the `<Select>` shadcn primitive — all already in the file.
- Produces: nothing new; DOM position of the sort `<Select>` changes only.

- [ ] **Step 1: Add a characterization test proving Sort works from its new home**

Add to `deck-browse.test.tsx` (inside a new `describe`, reusing the existing `renderBrowse`/`push` harness). This asserts choosing a sort option pushes a `sort=` URL — it must pass both before and after the move (regression guard for the relocation):

```tsx
import userEvent from '@testing-library/user-event'

describe('DeckBrowse sort control', () => {
  it('changing sort pushes a sort param', async () => {
    vi.useRealTimers()                        // userEvent needs real timers
    const user = userEvent.setup()
    renderBrowse()
    await user.click(screen.getByLabelText(en.decks.explore.sort.label))
    await user.click(await screen.findByRole('option', { name: en.decks.explore.sort.newest }))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('sort=newest'))
  })
})
```

- [ ] **Step 2: Run the test to confirm it passes against current code**

Run: `npm test -w web -- src/components/__tests__/deck-browse.test.tsx`
Expected: PASS (the control exists today in the filter row). This locks behavior before moving the DOM.

- [ ] **Step 3: Remove the sort `<Select>` from the filter row**

In `deck-browse.tsx`, delete the sort `<Select>` block (the first `<Select>` inside the `ml-auto` group, `aria-label={t('explore.sort.label')}`). The `ml-auto` group now contains only the Format `<Select>` and `<ClearFiltersButton>`.

- [ ] **Step 4: Add the sort `<Select>` into the results-header row**

In the results-header row (`<div className="flex items-center justify-between">` holding the count `<span>` and the view-toggle `<div className="flex gap-1">`), wrap the view toggle and a right-side group so the row reads `count ····· [Sort ▾] [view toggle]`:

```tsx
<div className="flex items-center justify-between">
  <span className="text-sm text-muted-foreground">{t('explore.count', { count: total })}</span>
  <div className="flex items-center gap-2">
    <Select value={state.sort} onValueChange={(v) => push({ sort: v as PublicDeckSort })}>
      <SelectTrigger aria-label={t('explore.sort.label')} size="sm" className="w-auto min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORTS.map((s) => <SelectItem key={s} value={s}>{t(`explore.sort.${s}`)}</SelectItem>)}
      </SelectContent>
    </Select>
    <div className="flex gap-1">
      <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} aria-label="List view">
        <List className="size-4" />
      </Button>
      <Button variant={view === 'gallery' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('gallery')} aria-label="Grid view">
        <LayoutGrid className="size-4" />
      </Button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Run the test again to confirm Sort still works from its new location**

Run: `npm test -w web -- src/components/__tests__/deck-browse.test.tsx`
Expected: PASS (both the instant-search test and the new sort test).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git -c commit.gpgsign=false add app/web/src/components/deck-browse.tsx app/web/src/components/__tests__/deck-browse.test.tsx
git -c commit.gpgsign=false commit -m "refactor(web): move deck Sort into the results header"
```

---

### Task 2: Move Sort into the search results header

**Files:**
- Modify: `app/web/src/components/search-controls.tsx`
- Modify: `app/web/src/app/[locale]/search/page.tsx`

**Interfaces:**
- Consumes: `SortSelect` (client component, self-contained — reads `sort` from `useSearchParams`, no props).
- Produces: nothing new; `SortSelect` renders in a new location.

- [ ] **Step 1: Remove Sort from the filter toolbar**

In `search-controls.tsx`, delete `<SortSelect />` from the flex row (leaving `<FilterDrawer />` and `<ClearFilters />`) and delete the now-unused `import { SortSelect } from './sort-select'`.

- [ ] **Step 2: Render Sort in the results-count row of the search page**

In `search/page.tsx`, add `import { SortSelect } from '@/components/sort-select'`, then wrap the existing count `<p role="status">` and `<SortSelect />` in a right-justified flex row directly above `<CardGrid>`:

```tsx
<div className="mb-4 flex items-center justify-between gap-3">
  <p className="text-sm text-muted-foreground" role="status">
    {t('results', { count: results.total })}
  </p>
  <SortSelect />
</div>
```

(The old standalone `<p className="mb-4 ...">` is replaced by this wrapper; the `mb-4` moves to the wrapper.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (no unused-import error from the removed `SortSelect` in `search-controls.tsx`).

- [ ] **Step 4: Run the web test suite**

Run: `npm test -w web`
Expected: PASS. `sort-select.test.tsx` is unaffected (component internals unchanged); nothing asserts Sort's old position in `search-controls`.

- [ ] **Step 5: Lint the web workspace**

Run: `npm run lint -w web`
Expected: no new errors (catches the removed import if missed).

- [ ] **Step 6: Commit**

```bash
git -c commit.gpgsign=false add app/web/src/components/search-controls.tsx "app/web/src/app/[locale]/search/page.tsx"
git -c commit.gpgsign=false commit -m "refactor(web): move search Sort into the results header"
```

---

### Task 3: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Build-free dev check of both pages**

Run: `npm run dev -w web`, then in the browser:
- `/search?q=harry` — the top toolbar shows only `[Filters] [✕]`; Sort sits right-aligned on the results-count line above the grid. Changing Sort reorders results and updates the `sort` URL param.
- `/decks` — the filter row shows `chips … [Format] [✕]` (no Sort); Sort sits left of the grid/list view toggle in the count row. Changing Sort reorders and updates the URL.

- [ ] **Step 2: Note result**

Record pass/fail in the session. No commit.

---

## Notes on test strategy

This is a placement-only refactor, so there is no new behavior to drive red-first. Task 1 adds a characterization test that passes before and after the move, guarding the deck Sort's wiring across the relocation. The search Sort's behavior is already covered by `sort-select.test.tsx`; its new location lives in a server component (`search/page.tsx`) that is verified by typecheck, lint, and the manual check in Task 3.

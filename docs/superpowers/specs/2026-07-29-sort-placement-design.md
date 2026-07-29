# Sort placement: move Sort into a shared results header

**Date:** 2026-07-29
**Type:** UI refactor (placement only — no behavior change)
**Scope:** `web` workspace, two components + one page

## Problem

The Sort dropdown is grouped with the **filter** controls, which misreads its
job. Sort *orders* the result set; it does not *narrow* it like filters do.
The placement is also inconsistent between pages:

- **Search page** (`/search`): Sort sits in the top filter toolbar
  (`[Filters ▾] [Sort ▾] [✕]`), separated from the result count and grid by a
  divider and the quick-filter chips.
- **Deck page** (`/decks`): Sort sits in the right-aligned filter group with
  Format and Clear, above a separate results-header row (count + view toggle).

## Principle

Filters answer "which results do I see?" Sort answers "in what order?" Keep the
two zones separate: filters stay in the filter toolbar; **Sort moves to the
results header** — the row that carries the result count (and, on decks, the
view toggle) directly above the grid — right-aligned. Both pages adopt the same
home for Sort.

## Design

### Search page (`/search`)

- `search-controls.tsx`: **remove** `SortSelect`. The top filter row becomes
  `[Filters ▾] [✕ clear]`. Drop the now-unused `SortSelect` import.
- `search/page.tsx`: wrap the existing results-count `<p role="status">` and a
  newly-rendered `<SortSelect />` in one flex row, `justify-between`,
  right-aligning Sort, directly above `<CardGrid>`:

  ```
  ⟨123 results⟩ ····················· [Relevance ▾]
  [card grid]
  ```

  `SortSelect` is a client component and already crosses the client boundary via
  `SearchControls`, so rendering it directly in the server page is fine.

### Deck page (`/decks`)

- `deck-browse.tsx`: **remove** the Sort `<Select>` from the filter row. That
  row keeps `lesson chips ···· [Format ▾] [✕]` — Format is a genuine narrowing
  filter and stays put.
- Add the same Sort `<Select>` into the existing results-header row
  (`count` + view toggle). Right side becomes `[Sort ▾] [view toggle]`, with the
  icon view toggle at the far-right corner:

  ```
  ⟨42 decks⟩ ················· [Newest ▾] [☰ ▦]
  [deck grid]
  ```

## Explicitly unchanged

- Sort **behavior**, URL params (`sort`), option lists, and the `SortSelect`
  component's internals.
- Both sort triggers keep `size="sm"` and their existing `aria-label`; the
  trigger still shows the bare value ("Relevance" / "Newest") — **no** visible
  "Sort:" label, matching today.
- Deck header order: `[Sort ▾]` then the view toggle.

## Testing

- `deck-browse.test.tsx` already exists — update/verify it still asserts Sort
  behavior from its new location (interaction is unchanged; only the DOM
  position moves).
- `sort-select.test.tsx` is unaffected (component internals unchanged).
- Manual: on `/search`, changing Sort updates order and the URL `sort` param;
  the top toolbar no longer shows Sort. On `/decks`, Sort sits next to the view
  toggle; Format/Clear/chips remain in the filter row.
- `npm run typecheck` and `npm test -w web` pass.

## Out of scope

- Any change to filter behavior, the view toggle, the search field, or sort
  option sets.
- A visible Sort label (considered and deliberately declined for consistency).

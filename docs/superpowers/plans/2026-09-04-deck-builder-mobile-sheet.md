# Deck Builder Mobile Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below `md`, browsing becomes the whole page and the deck becomes a draggable bottom sheet that carries the deck's name, format, import, export and save inside it. This fixes four defects reported from an iPhone 16 Pro (German locale) and removes the second bottom bar.

**Architecture:** One DOM tree, two layouts, switched by CSS alone. A new `DeckSheet` wrapper is a fixed two-snap bottom panel below `md` and `display: contents` from `md` up, which promotes its children into the builder's existing grid so the command bar spans the top and the deck column sits on the right exactly as it does today. Nothing about the desktop workbench changes.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, shadcn/Radix, Vitest + Testing Library, Playwright.

**Spec:** This document. The three directions were rendered as true-size iPhone 16 Pro mockups and direction **C (Zugblatt / Sheet)** was chosen: https://claude.ai/code/artifact/2468cb19-f077-486b-ae8c-1b49e0abfde0

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use `/usr/local/bin/npm`, `/usr/local/bin/node`. `gh` and `gpg` live at `/opt/homebrew/bin/`.
- Commit signing needs `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Every user-facing string is sourced from `web/messages/en.json` **and** `web/messages/de.json`. Never hardcode UI copy.
- Code comments are ASCII only. No em-dashes, no unicode arrows.
- Conventional Commits. No Claude/Claude Code attribution in commit messages.
- Branch: `feat/deck-builder-mobile-sheet` (already created off `main`).
- No barrel files: import the leaf path.
- `src/components` is grouped by domain. Everything new here belongs in `components/deck/`.
- Component folders hold components: no bare constants module in `components/deck/`. Shared class strings are exported from the component that owns them (the existing `SEGMENT_SELECTED` / `SEGMENT_UNSELECTED` in `deck-format-switch.tsx` is the precedent).
- Don't mix named (`md:`) and arbitrary (`min-[768px]:`) responsive variants on one property. Named variants win regardless of pixel value.
- Vitest's `rejects.toThrow` is broken in `app/web`; catch throws by hand.
- Web test files are not typechecked (a vitest version skew via better-auth). `npm run typecheck` will not catch errors in `*.test.tsx`.

---

## The four defects

Measured from the reported screenshots at 402 CSS px wide.

| # | Defect | Cause |
|---|---|---|
| P1 | The command bar overflows in German. `Zum Speichern anmelden` claims ~182px of a 402px screen, the name input clips to `Unbenanntes D`, and the Export button is pushed past the card's right edge. | `deck-builder.tsx:186` is `grid-cols-[1fr_auto_auto]`. The login label sits in an `auto` column and so dictates the row. |
| P2 | ~104px of dead space between the builder and the footer. | `deck-builder.tsx:314` renders an `h-20` spacer to keep the last deck row clear of the floating switch, plus the page's `py-6`. The builder is only `70dvh`, so the page barely scrolls and the spacer is never used for anything. |
| P3 | The floating pane switch floats ~39px above the Safari toolbar instead of hugging it. | `bottom-[max(1rem,env(safe-area-inset-bottom))]`. iOS Safari's fixed viewport already ends at the top of its bottom toolbar, so the home-indicator inset is counted a second time. **Reasoned, not device-tested** - confirm on the reporter's iPhone once shipped. |
| P4 | The card border and rounded corners waste horizontal space. | `rounded-xl border` on the builder root plus `px-6` on the page container costs ~50px of every row. |
| C | Two stacked bottom bars on the browse pane (pagination, then the floating switch). | Structural. Direction C removes one. |

---

## Design

### Two layouts, one tree

The deck side of the builder is wrapped in `DeckSheet`:

```
DeckBuilder root  (below md: h-[calc(100dvh-var(--header-h))]; from md: the existing workbench grid)
├── BrowsePane            data-pane="browse"   md:col-start-1 md:row-start-2
└── DeckSheet             below md: fixed bottom panel   |   md:contents
    ├── SheetHandle       grab bar + summary + chevron   md:hidden
    ├── DeckCommandBar    name, format, import, export   md:col-span-2 md:row-start-1
    ├── DeckColumn        DeckStatsPanel + DeckPanel     md:col-start-2 md:row-start-2
    └── SheetFooter       save/login + draft notice      md:hidden
```

`display: contents` generates no box, so at `md` the sheet's `position`, `height`, `transform`, `background`, `border-radius` and `overflow` are all inert and its children become direct grid items. That is what lets the command bar live inside the sheet on a phone and span the top of the workbench on a desktop **without rendering it twice**. Duplicating it would mean two name inputs bound to one state, two format switches, doubled accessible names and ambiguous `getByRole` in every test.

`SheetFooter` is `md:hidden` because from `md` up the save/login button belongs in the command bar, where it already is. It is therefore the one control that *is* rendered twice - but only one of the two is ever in the layout, they are a button and not a stateful input, and the mobile one is `md:hidden` while the bar one is `hidden md:inline-flex`. Tests must query by breakpoint-scoped class, not by role alone.

> **Rejected:** vaul / shadcn `Drawer`. It portals content to `document.body` and drives `position: fixed` and `transform` through inline styles, so the same node can never become a static grid column - which forces either a second `DeckPanel` (and a second `CardDetailSheet`) or a JS-media-query tree swap that flashes the mobile sheet on desktop first paint and drops scroll state on resize. Both `DeckPanel` and `DeckCardBrowser` also render a `CardDetailSheet` (Radix Dialog) and `DeckFilterDrawer` renders a `FilterSheet`, so a Dialog-based persistent sheet would hold real modals inside a permanently-open one. If this sheet is ever made modal, vaul becomes the correct answer and this decision should be revisited.

### Sheet geometry and states

Two snap states, `collapsed` and `expanded`. Below `md` only.

```
--peek: calc(4.5rem + env(safe-area-inset-bottom, 0px))   /* handle + summary row + inset */

fixed inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl border-t bg-card
collapsed: translateY(calc(100% - var(--peek)))
expanded:  translateY(0)
transition: transform 260ms cubic-bezier(.32,.72,0,1)
```

- `translateY` rather than animating `height`: the content does not reflow mid-animation, and the transform is composited.
- `h-[85dvh]`, not `100dvh - header`: the browse pane's search field stays visible above the expanded sheet, so it is obvious what you return to. This is what the approved mockup shows and it avoids needing the header height for the sheet.
- `bottom-0` with the inset carried as inner `padding-bottom` is what dissolves **P3**: the sheet always rests flush on the bottom edge and no arithmetic can double-count.
- The browse pane's scroll container gets `pb-[var(--peek)]` so its last grid row is never trapped under the collapsed sheet.
- A scrim (`bg-background/60`) covers the browse pane while expanded and collapses the sheet on tap. It is not a focus trap - it is the discoverable "tap to go back to browsing" affordance, and at 85dvh the pane behind is mostly covered anyway.

### Gesture and keyboard

- The whole handle row is a `<button>` with `aria-expanded` and `aria-controls` pointing at the sheet body: a disclosure, which is keyboard-operable for free. Tap is the primary affordance; drag is progressive enhancement.
- Drag is **handle-only** (`touch-action: none` on the handle). Dragging never competes with the deck list's own scrolling, which is the failure mode a full-surface drag would introduce.
- `pointerdown` captures the pointer and the start offset and drops the transition; `pointermove` writes a clamped inline offset; `pointerup` snaps on distance (>25% of travel) or velocity (>0.35 px/ms), whichever fires first.
- `prefers-reduced-motion: reduce` drops the transform transition; the state change is instant.

### Collapsed content must leave the tab order

The sheet body stays mounted when collapsed - that is the point, it preserves the deck's scroll position and the stats panel's open state - so it has to be removed from focus order and the a11y tree explicitly. Use the `inert` attribute on the sheet body.

`inert` is an HTML attribute and cannot be breakpoint-scoped in CSS, and from `md` up the sheet is always laid out, so `inert` must never apply there. Gate it with a narrow `matchMedia('(max-width: 767px)')` subscription via `useSyncExternalStore`, whose **server snapshot is `false`** (not mobile). Consequences: SSR emits no `inert`, desktop is correct from the first byte, and a phone applies it one tick after hydration. The *layout* stays pure CSS, so there is no visual flash either way - only the focus behaviour is JS-corrected.

> **Rejected:** `content-visibility: hidden`, which is CSS (so breakpoint-scopable) and does skip contents for a11y and hit-testing while preserving scroll. It also skips *layout*, so the first expand would animate from an unlaid-out body, and its a11y behaviour is less battle-tested than `inert`.

### Pagination moves up (defect C)

The browse pane's bottom `PaginationNav` and its separate result-count row show the same text at two ends of the pane, and on a phone the bottom bar would now sit directly on top of the collapsed sheet - two bars again. One `PaginationNav` moves into the toolbar row beside the count.

`PaginationNav` gains one prop, `compactLabel`, with the same name and meaning it already has on `DeckExportMenu`: below `md` the Previous/Next labels fold to chevrons (`aria-label` carries the name) and a `page / lastPage` readout appears between them; from `md` up it is the labelled pair, unchanged. **One** instance, one set of controls, responsive presentation - the codebase's existing idiom for exactly this.

`DeckCardBrowser` then drops its bottom bar and its separate `role="status"` count div, and `PaginationNav` gains `announce` to keep the live region it normally gives up when a caller passes `status` (here it *is* the count, so it must announce).

This moves the deck browser's pagination to the top of the pane at **every** width, including desktop. That is an intended consequence, not a slip: it removes a duplicated count and keeps one control. `/search` and the admin tables are untouched.

### What goes away

- The `[ Durchsuchen | Deck N ]` floating pane switch and the `pane` state in `DeckBuilder`. The sheet handle replaces both, and the deck count moves onto the handle. `md:hidden` meant the switch never existed above `md`, so nothing on desktop is affected.
- The `h-20` spacer (**P2**).
- The builder's `rounded-xl border` below `md`, and the page container's padding below `md` (**P4**).
- `decks.panes.*` in both message files, replaced by `decks.sheet.*`.

The `builderOnScreen` IntersectionObserver **stays**: the sheet is still fixed to the viewport, and once the builder has scrolled past (the page still has a footer below it) the sheet has to retire rather than hover over the footer's own controls.

### Out of scope

- The desktop (`md` and up) workbench layout, beyond the pagination move noted above.
- `/decks/[id]` (the read-only deck overview) and `/decks` browse.
- Any change to `ui/sheet.tsx`, `FilterSheet` or `CardDetailSheet`.
- Making the sheet remember its state across navigations. No new storage key, so no privacy-policy change.

---

## File Structure

**Create:**
- `app/web/src/components/deck/deck-sheet.tsx` - the two-snap panel: handle, drag, `inert` gating, `md:contents`. Owns the `--peek` value and exports it for the browse pane's bottom padding.
- `app/web/src/components/deck/deck-command-bar.tsx` - name input, format switch, import, export, and the `hidden md:inline-flex` save/login button, extracted out of `deck-builder.tsx` so the sheet and the grid can both host it. Presentational; `DeckBuilder` keeps `BuilderState`.
- `app/web/src/components/deck/__tests__/deck-sheet.test.tsx`
- `app/web/src/components/deck/__tests__/deck-command-bar.test.tsx`

**Modify:**
- `app/web/src/components/deck/deck-builder.tsx` - drops the pane switch, the `pane` state and the `h-20` spacer; composes `DeckCommandBar` + `DeckSheet`; keeps `builderOnScreen`.
- `app/web/src/components/deck/deck-card-browser.tsx` - `PaginationNav` moves into the toolbar row, bottom bar and separate count div removed, `pb-[var(--peek)]` on the grid.
- `app/web/src/components/search/pagination-nav.tsx` - `compactLabel` and `announce`.
- `app/web/src/app/globals.css` - `--header-h`.
- `app/web/src/app/[locale]/decks/new/page.tsx`, `app/web/src/app/[locale]/decks/[id]/edit/page.tsx` - `px-0 py-0 md:px-6 md:py-6`.
- `app/web/messages/en.json`, `app/web/messages/de.json`.
- `app/web/src/components/deck/__tests__/deck-builder.test.tsx` - the command-bar-layout and pane-switch suites are rewritten.
- `app/web/src/components/deck/__tests__/deck-card-browser.test.tsx` - pagination placement.
- `app/web/src/components/search/__tests__/pagination-nav.test.tsx` - the two new props.

---

## Tasks

### Phase 1 - Page shell, dead space and borders (P2, P4)

- [ ] **1.1** Add `--header-h` to `globals.css` as a documented constant. Both brand-mark variants are `h-9`, the header search field is `h-8` and the mobile nav trigger is `icon-sm`, so the tallest child is 36px: `36 + py-2 (16) + border-b (1) = 53px = 3.3125rem`. Do **not** pin `site-header.tsx` to it - forcing a height on a component every page renders risks clipping for the sake of a mobile-only need. Instead assert the relationship in e2e (task 6.2a), so drift fails CI rather than silently mis-sizing the builder.
- [ ] **1.2** `decks/new/page.tsx` and `decks/[id]/edit/page.tsx`: `px-0 py-0 md:px-6 md:py-6` on `<main>`.
- [ ] **1.3** `deck-builder.tsx`: `rounded-xl border border-border/60` becomes `md:rounded-xl md:border md:border-border/60`; the pane grid's `h-[70dvh] min-h-[420px]` becomes `h-[calc(100dvh-var(--header-h))]` below `md` (the `md:` half is unchanged); delete the `h-20 md:hidden` spacer.
- [ ] **1.4** Verify at 402x874 in Playwright that there is no dead space between the builder and the footer and no horizontal body scroll. Commit.

### Phase 2 - The sheet primitive

- [ ] **2.1** Write `deck-sheet.test.tsx` first: collapsed by default; the handle is a `button` with `aria-expanded=false` and `aria-controls` matching the body's `id`; clicking toggles `aria-expanded`; the body carries `inert` when collapsed and not when expanded (mock `matchMedia` to report mobile); the root carries `md:contents`; the handle renders the deck count.
- [ ] **2.2** Build `deck-sheet.tsx`: the geometry above, the disclosure button, the scrim, the `useSyncExternalStore` `matchMedia` gate with a `false` server snapshot, and `motion-reduce` handling. Drag lands in 2.3, so keep the pointer handlers out of this task.
- [ ] **2.3** Add the handle-only drag: `setPointerCapture`, clamped inline offset, distance-or-velocity snap, transition suppressed while dragging. Test the snap decision as a pure function rather than simulating pointer physics in jsdom.
- [ ] **2.4** Mutation-check the new tests: flip `inert` to always-on and the default state to expanded, and confirm the suite fails. Commit.

### Phase 3 - Move the command bar into the sheet (P1)

- [ ] **3.1** Extract `DeckCommandBar` from `deck-builder.tsx` with no layout change yet, so the diff that follows is only about layout. Tests stay green.
- [ ] **3.2** Re-lay the bar for the sheet: name input full width on its own row, then format switch + import + export on one row, and the save/login button `hidden md:inline-flex`. Delete `grid-cols-[1fr_auto_auto]` and the `col-start-*` placements - inside the sheet there is no 402px squeeze to solve, which is the whole point of direction C.
- [ ] **3.3** Compose in `deck-builder.tsx`: `DeckSheet` wraps `DeckCommandBar`, the deck column and the new mobile `SheetFooter` (save/login + draft notice + the save prompt). Remove the `pane` state, the pane switch and `decks.panes.*` usage. Place the children for the `md` grid (`md:col-span-2 md:row-start-1` etc.).
- [ ] **3.4** Handle summary copy: `sheet.summary` (`{count} cards · {format}`) collapsed, and the main/sideboard breakdown expanded. Keep the count badge's remount-on-add animation (keyed to the add nonce) - while the sheet is collapsed the count is the only sign an add landed.
- [ ] **3.5** Rewrite the affected suites in `deck-builder.test.tsx`. Commit.

### Phase 4 - Pagination (defect C)

- [ ] **4.1** `PaginationNav`: add `compactLabel` and `announce`, extending the existing docblock. Chevrons below `md` with `aria-label` intact, labels from `md` up, `page / lastPage` readout below `md` only. New `pagination.pageOf` key.
- [ ] **4.2** `deck-card-browser.tsx`: move `PaginationNav` into the toolbar row with `compactLabel announce`, delete the bottom bar and the separate count div, keep the `Skeleton` loading state and the scroll-to-top-on-page-change behaviour, and add `pb-[var(--peek)]` to the grid.
- [ ] **4.3** Update `pagination-nav.test.tsx` and `deck-card-browser.test.tsx`. Commit.

### Phase 5 - i18n

- [ ] **5.1** Add `decks.sheet.*` and `pagination.pageOf` to `en.json` **and** `de.json`; remove `decks.panes.*`. Keep German short: this is the locale that broke, so check each new string at 402px.
- [ ] **5.2** Grep for orphaned keys and for any hardcoded string introduced in phases 2-4.

### Phase 6 - Verification

- [ ] **6.1** `npm test`, `npm run typecheck`, `npm run lint -w web` all green.
- [ ] **6.2** `E2E_PORT=3100 npm run e2e -w web` green. The suite needs a prod build; the port override lets the dev server stay up.
- [ ] **6.2a** Add an e2e assertion that the site header's rendered `offsetHeight` equals the `--header-h` constant, so the builder's `100dvh - --header-h` cannot silently drift when the header changes.
- [ ] **6.3** Playwright pass at 402x874, German locale, logged out: the command bar no longer overflows; no dead space; the sheet rests flush on the bottom edge; the browse pane's last row is reachable; one bottom bar. Screenshot each state.
- [ ] **6.4** Re-check 768px and 1440px to confirm the desktop workbench is visually unchanged apart from the pagination move.
- [ ] **6.5** Ask the reporter to confirm P3 on the actual iPhone 16 Pro - the safe-area double-count is reasoned, not measured.

---

## Risks

| Risk | Mitigation |
|---|---|
| `display: contents` on a grid item is the load-bearing trick. If it misbehaves, the whole structure fails. | Prove it in Phase 3 before the command bar is re-laid out. Fallback is the `hidden`/`md:hidden` duplication, at the cost noted above. |
| `inert` applied a tick late on phones. | Server snapshot is `false`, so desktop is right immediately and the phone corrects on hydration. Layout is pure CSS, so nothing moves. |
| `100dvh` jitter as the iOS toolbar collapses, moving the fixed sheet. | The sheet is `bottom-0`, so it tracks the viewport rather than being positioned from the top. Watch for the browse pane resizing under the collapsed sheet during the toolbar animation. |
| P3's cause is inferred. | 6.5. If the inset is not the cause, the sheet's `bottom-0` still fixes the symptom, because there is no floating element left to mis-position. |

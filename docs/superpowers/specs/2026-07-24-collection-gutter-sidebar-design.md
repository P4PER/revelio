# Collection set sidebar → left gutter

**Date:** 2026-07-24
**Status:** Approved, ready for planning

## Problem

On the collection page (`/[locale]/collection`), the "By sets" tab renders the set
sidebar (`CollectionSidebar` — set list with per-set progress bars) **inside** the
76rem content column, as the left cell of a `md:grid-cols-[16rem_1fr]` grid. This
differs from the admin area, where PR #34 moved the sidebar into the **left gutter**
outside the content column on wide screens, with a mobile drawer fallback.

We want the collection set sidebar to match the admin sidebar's placement and
responsive behavior, for visual consistency and better use of wide-screen space.

Additionally, the current mobile "By sets" view is broken: the card `<section>` is
`hidden md:block`, so on screens `<md` selecting a set shows **nothing**. This
rework fixes that as a side effect.

## Reference pattern

`app/web/src/app/[locale]/admin/layout.tsx` + `app/web/src/components/admin-sidebar.tsx`
establish the three-tier responsive pattern we mirror:

- Content anchored to `max-w-[76rem]` (aligned with the site header).
- Inner row: `flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8`.
- Wide-screen gutter pull: `min-[1700px]:-ml-56 min-[1700px]:w-[calc(100%+14rem)]`
  (14rem == `-ml-56`), so the sidebar hangs in the left gutter while content keeps
  its full width. The pull constant equals sidebar width + row gap: admin's
  `w-48` (12rem) + `gap-8` (2rem) = 14rem. **Our sidebar is 16rem, so our pull is
  16 + 2 = 18rem → `-ml-72` / `w-[calc(100%+18rem)]`.**
- Sidebar component renders a desktop static `<aside>` (`hidden … min-[1024px]:block`,
  sticky, `self-start`) **and** a mobile `Sheet` drawer (`min-[1024px]:hidden`) with
  a `SheetTitle` and an `onNavigate` callback that closes the drawer on selection.

## Design

### 1. Layout of the "By sets" tab

In `CollectionView` (`app/web/src/components/collection-view.tsx`), replace the
`TabsContent value="sets"` grid with the admin-style responsive flex row, scoped to
the tab so the page header and `TabsList` remain anchored to 76rem:

```jsx
<TabsContent value="sets">
  <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8
                  min-[1700px]:-ml-72 min-[1700px]:w-[calc(100%+18rem)]">
    <CollectionSetNav sets={sets} progress={progress} selected={selectedSet}
      hrefFor={(c) => `?tab=sets&set=${c}`} />
    <section className="min-w-0 flex-1 min-[1024px]:max-w-[76rem]">
      {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
    </section>
  </div>
</TabsContent>
```

Note the removal of `hidden md:block` from the card `<section>`: cards now render at
all widths so the mobile drawer selection has a landing target.

Responsive tiers (identical to admin):

| Width        | Sidebar                          | Cards                    |
|--------------|----------------------------------|--------------------------|
| ≥1700px      | left gutter, outside content     | full 76rem, header-aligned |
| 1024–1699px  | shares the row (two-column)      | fills remaining width    |
| <1024px      | `☰ Sets` → `Sheet` drawer        | full width               |

### 2. New component: `collection-set-nav.tsx`

A thin **client** wrapper (`'use client'`) mirroring `admin-sidebar.tsx`, in
`app/web/src/components/`. Props: `{ sets, progress, selected, hrefFor }` — the same
inputs `CollectionSidebar` already takes.

- Desktop: `<aside className="hidden w-64 shrink-0 self-start min-[1024px]:block
  min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:max-h-[calc(100vh-3rem)]
  min-[1024px]:overflow-y-auto">` wrapping `<CollectionSidebar … />`.
  (Width `w-64`/16rem — wider than admin's `w-48` because of set names + progress +
  counts; matches today's `[16rem_1fr]` grid. The gutter-pull constant in §1
  (`-ml-72`/18rem) is derived from this width + `gap-8`.)
- Mobile (`min-[1024px]:hidden`): a `Sheet` with an outline `Button` trigger
  (`Menu` icon + label) and `SheetContent side="left"` containing a `SheetTitle`
  and `<CollectionSidebar … onSelect={() => setOpen(false)} />`.

Reuses the **existing** `CollectionSidebar` unchanged in visuals; this wrapper only
adds placement + the drawer.

### 3. `CollectionSidebar` change

Add an optional `onSelect?: () => void` prop, wired to each set `Link`'s `onClick`.
Default undefined (desktop rail passes nothing; drawer passes the close handler).
No visual change.

### 4. i18n

Add `collection.setsNav` to `en.json` and `de.json` (e.g. `"Sets"` / `"Sets"`),
used as the mobile drawer trigger label and `SheetTitle`.

## Out of scope / unchanged

- "Browse all" tab: no sidebar (it has its own Set filter in the filter drawer) —
  untouched.
- Server data flow (`loadCollectionPage`), `hrefFor` semantics, progress
  calculation, card tile rendering — untouched.
- Public/other-user collection views (`collection/[username]`, `collection/u/[userId]`)
  — out of scope unless they reuse `CollectionView`; if they do, they inherit the
  new layout automatically, which is acceptable (verify during implementation).

## Testing

- `collection-sidebar.test.tsx`: extend to assert `onSelect` fires on a set click.
- New `collection-set-nav.test.tsx` (mirroring `admin-sidebar.test.tsx`): desktop
  rail renders sets; mobile trigger opens the drawer; selecting a set in the drawer
  invokes the close handler.
- Existing `CollectionView` behavior (tab switching, browse) must remain green.
- Manual: verify the three tiers at ~1400px, ~1200px, ~800px; confirm card grid
  right edge aligns with the header at ≥1700px and mobile set selection shows cards.

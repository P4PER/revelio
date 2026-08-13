# Card-to-card navigation — design

**Date:** 2026-08-13
**Status:** Approved (brainstorm), pending implementation plan
**Area:** `app/web` (card detail page), `app/search` (one small query extension)

## Summary

On the card detail page (`/[locale]/card/[id]`), let the user move to the previous/next card using:

- **Arrow keys** (`←` / `→`) on desktop,
- **Swipe** (horizontal) on mobile/touch,
- **On-screen chevron buttons** as the always-visible, accessible, no-JS baseline.

"Next card" is **context-aware**: when the user arrived from search, navigation follows the exact result list they were browsing (query + filters + sort), crossing pagination boundaries. From any other entry point (direct link, `/random`, home constellation, collection), navigation follows the card's **own set ordered by `numberSort`**.

A one-time, per-browser hint teaches the affordance on first visit: **chevron pulse + key-cap flash on desktop**, **ghost swipe-finger sweep on touch**. The hint respects `prefers-reduced-motion`.

## Goals / non-goals

**Goals**
- Prev/next navigation from the detail page via keys, swipe, and buttons.
- Context-aware ordering: search result set when available, set order otherwise.
- Correct behaviour across search pagination boundaries.
- Accessible and functional without JavaScript (chevrons are real links).
- Discoverable via a subtle, one-time, motion-safe hint.

**Non-goals**
- Drag-to-follow / rubber-band swipe animation (threshold-triggered navigation only for MVP).
- Navigation on the `/edit` route.
- Preserving search context across a hard share/refresh as anything more than URL params (canonical stays clean).
- Caching the set-order lookup (YAGNI; revisit only if profiling shows a cost).
- RTL layouts (only `en`/`de` locales ship).

## Core concept: one neighbor primitive, two sources

Both navigation modes reduce to the same question: *given an ordered list of cards and my position in it, what are the prev/next card ids?* A single server helper answers it:

```ts
type Neighbor = { id: string; href: string }
function getCardNeighbors(
  client: MeiliSearch,
  locale: string,
  card: CardDetailDTO,
  ctx?: NeighborContext,   // parsed from the incoming search params, if any
): Promise<{ prev: Neighbor | null; next: Neighbor | null }>
```

`href` is a locale-aware pathname (built the same way existing links are). The interaction layer never needs to know which source produced the neighbors.

### Source A — search context

When the incoming URL carries search context, the detail page walks the user's result set.

- **How context arrives:** `CardTile` links append the current search params **plus the hit's absolute index** `i`:
  `i = (page - 1) * hitsPerPage + positionOnPage`. Example: `/card/x-1?q=quidditch&sort=cost&i=42`.
- **Presence marker:** the `i` param signals "search context present". `parseSearchParams` (existing) parses the rest.
- **Neighbor lookup:** re-run the *same* search as a 3-wide window — `offset = max(0, i - 1)`, `limit = i === 0 ? 2 : 3`. The window is exactly `[prev?, current, next?]`:
  - `i === 0`: `[current, next?]` → no prev.
  - middle: `[prev, current, next]`.
  - last index: `[prev, current]` → no next.
  The window's own length encodes boundaries, so **no total-count query is needed**, and **page boundaries need no special-casing** because `i` is absolute.
- **Forward context:** `prev.href` / `next.href` carry the same params forward with `i - 1` / `i + 1`, so the user keeps walking the result set.
- **Stale-index guard:** if the middle hit's id ≠ the current card id (data changed since the list was rendered), discard the window and fall back to Source B.

### Source B — set order (fallback)

When there is no search context (or Source A fell back):

- Query Meili scoped to the card's set: empty query, filter `set:<code>`, sort `numberSort:asc`.
- Sets are small (≤ ~200 cards); fetch the ordered ids, locate the current card, take its neighbors.
- Neighbor `href`s are plain `/card/<id>` (no context) — arriving there re-derives set order.

## Plumbing changes

- **`app/search` — `searchCards`:** add an optional raw window (`offset` + `limit`) alongside the existing `page`/`hitsPerPage`. When a raw window is given it takes precedence. Keeps existing callers unchanged.
- **`web/components/card-grid.tsx` / `card-tile.tsx`:** `CardGrid` receives `startIndex` (`= (page-1)*hitsPerPage`) and the serialized current search params; it passes each tile its absolute index; `CardTile` builds the context-carrying href. Tiles reached from non-search grids (collection, constellation) keep plain hrefs.
- **`web/app/[locale]/card/[id]/page.tsx`:** read `searchParams`, build `ctx` when `i` is present, call `getCardNeighbors`, pass `prev`/`next` into `CardDetail`.
- **`web/components/card-detail.tsx`:** wrap the card image in `<CardNav prev next>` (renders nothing when both are null).
- **New:** `web/lib/card-neighbors.ts` (`getCardNeighbors` + context parsing), `web/components/card-nav.tsx` (client interaction component).

## Interaction layer — `<CardNav>` (`'use client'`)

Props: `prev: Neighbor | null`, `next: Neighbor | null`, and its `children` (the card image). Renders nothing if both neighbors are null.

- **Chevron buttons** — shadcn `Button` (`variant="ghost"`, `asChild` → next-intl `<Link href>`), `ChevronLeft`/`ChevronRight` from lucide, flanking the card. These are the real, baseline control: keyboard-focusable, screen-reader-labelled (`aria-label` from messages), and functional with JS disabled. Absent when the corresponding neighbor is null.
- **Arrow keys (desktop enhancement)** — a `window` `keydown` listener: `ArrowLeft` → prev, `ArrowRight` → next, via the next-intl router. Ignored when:
  - the event target is an `input` / `textarea` / `contenteditable`, or
  - any of `metaKey` / `ctrlKey` / `altKey` is held, or
  - the corresponding neighbor is null.
  A small `Kbd` `←`/`→` hint sits by the chevrons, shown only `sm:` and up (mirrors the existing `KbdHint` touch-hiding pattern).
- **Swipe (touch enhancement)** — touch handlers on the image wrapper. Record `touchstart` x/y; on `touchend`, if horizontal delta exceeds ~50px **and** dominates the vertical delta, navigate: swipe-left → next, swipe-right → prev.
- **First-visit hint (chosen B + C)** — gated by a `localStorage` flag (e.g. `revelio.cardNav.hintSeen`). On a fresh visit only:
  - **desktop:** chevrons pulse + `←`/`→` key-caps flash, one loop;
  - **touch:** a translucent finger sweeps across the card once with a trailing streak.
  Then the flag is set and the hint never plays again. **Skipped entirely** under `prefers-reduced-motion: reduce`.
- **Prefetch:** next-intl `<Link>` prefetches the chevron targets; the component also prefetches the neighbor hrefs on mount so key/swipe navigation is instant.

## URLs & SEO

- The address bar may carry context params (`?q=…&i=42`) so refresh, back/forward, and shared links preserve the walking position.
- The page's `<link rel=canonical>` remains `/card/<id>` (already set in `generateMetadata`), so crawlers and link previews resolve to the clean resource. No client-side param stripping.

## Edge cases

- **Boundaries:** first card → no prev (left key/chevron inert/absent); last → no next; single-card set or empty context → `<CardNav>` renders nothing.
- **Editor:** `/card/[id]/edit` never mounts `<CardNav>`; the key listener does not exist there.
- **Stale search index:** handled by the Source A → Source B fallback (see above).
- **Horizontal cards:** swipe axis is unchanged (horizontal drag).
- **Non-search grids:** collection/constellation tiles keep plain hrefs → Source B on arrival.

## Testing

- **`getCardNeighbors` (unit, mocked search client):** window middle / first-index / last-index; stale-index → set fallback; set-order neighbors incl. set boundaries; no-context path.
- **`searchCards` raw window (unit):** offset/limit precedence over page.
- **`CardNav` (component):** `→`/`←` navigate; ignored while focus is in an input and when a modifier is held; swipe past/under threshold; boundary no-op when a neighbor is null; chevron hrefs correct; `prefers-reduced-motion` skips the hint; nothing renders when both neighbors null.
- **i18n:** new keys (`aria-label`s for previous/next) added to `messages/en.json` and `messages/de.json`.

## Rollout notes

- No DB migration, no Meilisearch index-settings change (`numberSort` is already a sortable attribute) — a standard web build/deploy suffices.

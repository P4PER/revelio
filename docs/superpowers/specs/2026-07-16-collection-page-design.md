# Collection Page — Design Spec

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation planning
**Area:** `@revelio/db`, `@revelio/web` (new `collection` feature), card detail page

## 1. Summary

A per-user **collection tracker** for the Harry Potter TCG dataset. Every card in
the database is shown; cards the user owns are rendered in colour, cards they do
not own are greyed out. Users record ownership **per finish** (only the finishes
that actually exist for that card) and may own **multiple copies** of each finish.

Ownership can be recorded from two places:

- The dedicated **collection page** (`/collection`).
- The **card detail page** (`/card/[id]`), via a new "Add to collection" control.

A user has exactly **one** collection ("everything I own"). The collection can be
toggled **private / public** like a deck. A public collection is viewable at a
shareable URL. There are **no likes, no view counts, and no public "discover
collections" browse page** — sharing is a single read-only link only.

## 2. Goals / Non-goals

**Goals**
- Track ownership per `(user, card, finish)` with quantities.
- Only expose a card's real finishes (Normal always; Foil *or* Holo on Rares).
- Grey out unowned cards everywhere in the collection UI.
- Per-set completion overview (the collector "dashboard").
- Cross-set search + advanced filters, including an **ownership filter**
  (owned / missing / duplicates).
- Private/public visibility toggle; shareable read-only public page.

**Non-goals (YAGNI for v1)**
- Multiple named binders/collections per user.
- Likes, view counts, a public collections browse/discover page.
- "Finish-complete" set percentages (completion is finish-agnostic in v1 — see §5).
- Wishlists, condition/grading, monetary value, trade matching.
- Writing ownership into Meilisearch (ownership stays per-user in Postgres).

## 3. Layout & UX

Chosen after visual mockups. Three surfaces, built from shared components.

### 3.1 Default view — sidebar master–detail (desktop) / drill-down (mobile)
- **Desktop:** a left **sidebar lists every set** with a completion progress bar
  and `owned / total` count. Selecting a set renders that set's cards in the
  right pane. The selected set is held in a URL search param (`?set=CODE`) so the
  view is server-rendered and shareable; switching sets is client navigation, no
  full reload.
- **Mobile:** the sidebar becomes a full-screen list of set tiles; tapping a set
  pushes to that set's card grid; the back button returns. Same components, a
  responsive split (no separate implementation).
- A lightweight **summary header** shows overall totals: distinct cards owned /
  total cards, and total physical copies (sum of quantities).

### 3.2 Flat view — "Browse all / Search"
- A toggle on the collection page opens a **flat grid of every card across all
  sets**, reusing the existing search infrastructure (Meilisearch + `FilterSheet`).
- Full-text search + advanced filters, **plus** an ownership filter:
  **Owned / Missing / Duplicates** (see §6 for data flow).

### 3.3 Card ownership control
- **On the collection grid (view 3.1 & 3.2):** *hover-overlay steppers* (mockup
  option B). The card art shows a total-owned **count badge**; hovering (tap on
  mobile) reveals per-finish `− n +` steppers. Only the card's available finishes
  appear. A card with zero of every finish is greyed.
- **On the card detail page:** a *button → popover* (mockup option C). An
  "Add to collection" / "In collection ▾" button opens a popover listing the
  card's finishes, each with a `− n +` stepper. This popover component is shared
  between the detail page and (optionally) the grid.

### 3.4 Public / shared view
- The **owner's** editable page lives at `/collection` (requires login).
- The **public read-only** page lives at `/collection/[username]`.
  - Resolve the user by `username`; if the user has no username, fall back to a
    `/collection/u/[userId]` form so sharing still works.
  - If the collection is private and the viewer is not the owner → 404
    (mirrors `getDeckForViewer`).
  - Read-only pages render the same grids but with editing controls hidden
    (`editable={false}`): owned cards in colour with count badges, no steppers.
- A visibility toggle (Private / Public) plus a "copy share link" affordance
  lives on the owner's `/collection` page.

## 4. Data model (`@revelio/db`)

Follows the existing decks pattern (`user`-owned, `ON DELETE CASCADE`). New
migration generated via `npm run generate` — **append-only, never edit `0000`**.

### `collections` (one row per user — holds settings/visibility)
| column | type | notes |
| --- | --- | --- |
| `userId` | text PK | FK → `user.id` `ON DELETE CASCADE` |
| `visibility` | text NOT NULL default `'private'` | `'private'` \| `'public'` |
| `updatedAt` | timestamp | touched on any change |

Row is **lazily created** on first write (first card added or first visibility
change). Absence of a row = empty private collection.

### `userCards` (the owned copies)
| column | type | notes |
| --- | --- | --- |
| `userId` | text | FK → `user.id` `ON DELETE CASCADE` |
| `cardId` | text | FK → `cards.id` |
| `finish` | text | validated against `core` `FINISHES` **and** the card's own `finishes[]` |
| `quantity` | int NOT NULL | invariant `quantity >= 1` |

- **Composite PK:** `(userId, cardId, finish)`.
- Rows exist **only for quantity ≥ 1**; decrementing to 0 **deletes** the row.
- Index on `userId` (and `(userId, cardId)`) for per-user reads and set-progress
  aggregation.
- `finish` is a plain `text` value (there is no `finishes` vocab table — it was
  dropped in migration `0009`), validated in the write path, not by an FK.

## 5. Completion semantics

- **Set completion** = *distinct cards owned* (≥ 1 copy of **any** finish) ÷
  `sets.cardCount`. Finish-agnostic in v1.
- **Duplicates** = a card counts as a duplicate when **any single finish** of it
  has `quantity > 1`. (Simple, matches "I have spares to trade"; owning one Normal
  + one Holo is *not* a duplicate.)
- Finish-complete progress ("owned every printing") is explicitly deferred.

## 6. Ownership filter — data flow

Meilisearch indexes cards **globally**; it has no per-user data. Ownership must not
be written to Meili. Instead, ownership is resolved from Postgres and folded into
the Meili query via id filters, preserving Meili's pagination/search/facets:

1. Load the user's **owned card ids** (cheap; the whole HP TCG set is ~1k cards) —
   `SELECT DISTINCT cardId FROM userCards WHERE userId = ?`. Cache per request.
2. Translate the ownership filter into a Meili `filter` on the card `id`
   (`id` is already filterable — see `documents.ts`):
   - **Owned** → `id IN [ownedIds]`
   - **Missing** → `id NOT IN [ownedIds]`
   - **Duplicates** → compute the id subset with any `quantity > 1`, then
     `id IN [dupeIds]`
3. Run the normal Meili search with the extra id filter. Pagination and counts
   stay correct because the filter is applied inside Meili, not after.
4. For **display** (colour vs grey, count badge), overlay the per-card owned
   quantities for the page's card ids from Postgres regardless of any filter.

The **default sidebar view** does not need Meili for the set list — per-set
progress is a Postgres aggregation (`getCollectionSetProgress(userId)` →
`{ setCode, ownedDistinct, total }[]`). The right-pane card grid reuses the
existing set-scoped Meili query (as `sets/[code]` does today) with the ownership
overlay applied.

## 7. Server actions (`app/web/src/lib/collection-actions.ts`, `'use server'`)

Mirror `deck-actions.ts`: `requireUserId()` → validate with Zod → mutate →
`revalidatePath`.

- `setCardQuantityAction(cardId, finish, quantity)` — upsert/delete a `userCards`
  row. Validates `finish ∈ card.finishes` and `quantity >= 0` (0 deletes). Lazily
  creates the `collections` row.
- `incrementCardAction(cardId, finish, delta)` — convenience for `+1 / −1`
  steppers (clamps at 0 → delete).
- `setCollectionVisibilityAction(visibility)` — `'private' | 'public'`.
- Read helpers used by server components: `getCollectionSetProgress(userId)`,
  `getOwnedQuantitiesForCards(userId, cardIds)`, `getOwnedCardIds(userId)`,
  `getCollectionVisibility(userId)`, and a viewer-aware resolver
  `getCollectionForViewer(username|userId, viewerId)` (owner-or-public-else-404,
  analogous to `getDeckForViewer`).

All ownership mutation is **Postgres only** — no Meilisearch write, so no reindex.

## 8. Routing & navigation

- `/[locale]/collection` — owner's editable collection (redirect to login if
  unauthenticated). Holds the sidebar/flat toggle and the visibility control.
- `/[locale]/collection/[username]` (+ `/collection/u/[userId]` fallback) —
  public read-only view; 404 when private and not the owner.
- Navbar: add a **"Collection"** entry for logged-in users.
- Card detail page (`card/[id]/page.tsx` → `card-detail.tsx`): add the
  "Add to collection" popover control for logged-in users (net-new surface — the
  page currently only renders an editor-gated Edit link).

## 9. Components (`app/web/src/components/`)

Reuse existing primitives; add collection-specific pieces:

- `collection-sidebar.tsx` — set list with progress bars (desktop) / set tile list
  (mobile).
- `collection-card-grid.tsx` — wraps existing `CardGrid`/`CardTile` with the
  ownership overlay (grey state, count badge, hover steppers). Accepts
  `editable` to render read-only on public pages.
- `card-finish-stepper.tsx` — the per-finish `− n +` control (used by both the
  grid overlay and the detail popover).
- `add-to-collection-popover.tsx` — detail-page control (mockup option C).
- `collection-filter-drawer.tsx` — a new `FilterSheet` adapter that adds the
  **Ownership** group (Owned / Missing / Duplicates). The ownership group is only
  rendered in the collection context; `FilterSheet` gains an optional
  ownership-group prop so `/search` and the deck builder are unaffected.
- `collection-summary.tsx` — totals header (distinct owned / total, physical count).

Client-side edit state may reuse the localStorage-draft pattern from
`deck-model.ts` only if optimistic UI is needed; otherwise steppers call the
server action directly and rely on `revalidatePath`. Prefer server-action-direct
for v1 (simpler, no draft reconciliation).

## 10. Auth & permissions

- All mutations require a logged-in user (`requireUserId()`); a user may only
  mutate **their own** `userCards` (keyed by `userId` from the session — no
  cross-user writes are expressible).
- Public read is gated by the `collections.visibility` flag via
  `getCollectionForViewer`.
- No role gating (any authenticated user has a collection; unrelated to
  editor/admin roles).

## 11. Testing

- **DB (Testcontainers Postgres):** upsert increments/decrements, delete-at-zero
  invariant, `getCollectionSetProgress` aggregation correctness, `getOwnedCardIds`,
  cascade delete when a user is removed.
- **Actions:** finish validation (reject a finish not in `card.finishes`),
  visibility toggle, viewer-aware 404 for private collections.
- **Ownership filter (search):** owned / missing / duplicates translate to the
  correct Meili id filter and pagination stays consistent.
- **Component:** grey vs owned rendering, badge counts, read-only mode hides
  steppers.

## 12. Open implementation notes

- `username` is unique but nullable; the public route prefers `username` and falls
  back to `/collection/u/[userId]`.
- The owned-id list is small (~1k cards max) so `id IN / NOT IN` filters are safe
  to pass to Meili; revisit only if the dataset grows by orders of magnitude.
- Migration must be generated with `npm run generate` from `app/db` and committed
  together with the `schema.ts` edit (CI `verify` enforces this).

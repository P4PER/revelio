# Public Deck Browse — Design

## Summary

Add a **public deck browse** page: a searchable, filterable list of every published
deck (`visibility === 'public'`), open to everyone including logged-out visitors. Each
entry shows the **author's username**, the **deck name**, the **lessons** used (icons),
and engagement counts — **likes** (♥) and **views** (👁). This is the follow-up the
deck-overview spec named as a "natural follow-up" — it turns the existing per-link public
overview into a discoverable community gallery.

The browse list becomes the new **`/decks`** landing (default, public). The current
private per-user list moves to **`/decks/mine`**. Clicking an entry opens the existing
read-only overview at `/decks/[id]`; `/decks/new` and `/decks/[id]/edit` are unchanged.

## Goals

- Public list of all published decks at `/decks`, viewable logged-out.
- Free-text **search** over deck name **and** author username.
- Filter by **lesson** (color/icon chips) and **format**; **author** filter folded into
  search via `@username`.
- **Sort** by Most liked / Most viewed / Newest / Recently updated.
- **Likes**: login-gated toggle, one per account.
- **Views**: unique per logged-in account (Moxfield-style); logged-out views not counted.
- Two entry presentations — **List ↔ Grid** toggle — reusing the overview's view-pref
  pattern; both show the same data with the real lesson SVGs.
- Classic **page-number pagination** (24 / page).
- Scale-ready: filter/sort stay index-friendly at 1,000+ decks and beyond.

## Non-goals (YAGNI)

- No anonymous / logged-out view counting (and therefore **no cookies** for views).
- No comments, deck versioning, or "trending over time" decay ranking. Sort is over
  raw cached counts.
- No card-count / deck-size filter (dropped during design).
- No dedicated author-filter control — `@username` in the search box covers it.
- No infinite scroll — classic page numbers only.
- No lesson-tinted card surfaces or gradient hero strip on entries (considered and
  rejected as redundant with the lesson icons).

## Placement & routing

| Route | Before | After |
|---|---|---|
| `/decks` | private "My Decks" (login-gated) | **public browse** (open to all) |
| `/decks/mine` | — | private "My Decks" (login-gated) — the old `/decks` page moved verbatim |
| `/decks/[id]` | public overview | unchanged; now also records a view |
| `/decks/[id]/edit`, `/decks/new` | — | unchanged |

Nav gains a **Browse decks** entry pointing at `/decks`; the personal list is reachable
from a **My Decks** link (login-gated) at `/decks/mine`. The logged-out empty state that
`/decks` shows today moves with the page to `/decks/mine`.

## Data model

Two new tables, parallel in shape ("which user did X to which deck"), plus three cached
columns on `decks`. All derived values are maintained inside the transactions that
already touch these write paths, so they can't drift under normal operation.

### New tables

```
deck_likes (
  deck_id  text  → decks.id  on delete cascade,
  user_id  text  → user.id   on delete cascade,
  created_at timestamptz default now(),
  primary key (deck_id, user_id)
)  index on (user_id)   -- "decks I liked"

deck_views (
  deck_id  text  → decks.id  on delete cascade,
  user_id  text  → user.id   on delete cascade,
  created_at timestamptz default now(),
  primary key (deck_id, user_id)   -- one row per account per deck = unique views
)
```

Both are the **source of truth** — like toggle state (`does a row exist for me?`) and
unique-view dedupe. Keyed by `user_id` only, so views/likes dedupe across devices with no
cookies.

### Cached columns on `decks`

| Column | Type | Maintained in | Index | Why |
|---|---|---|---|---|
| `like_count` | `integer` default 0 | `toggleLikeAction` (±1 in the like tx) | btree | sort by Most liked without aggregation |
| `view_count` | `integer` default 0 | `recordViewAction` (+1 only on first insert) | btree | sort by Most viewed |
| `lessons` | `text[]` default `{}` | deck save (same tx that rewrites `deck_cards`) | **GIN** | lesson filter = array-overlap, no join |

`lessons` holds the deck's distinct lesson codes (from `deck_cards → cards.lesson`),
recomputed deterministically on every save in `replaceDeckCards` / `updateDeck`. A
migration backfills all three columns for existing decks.

### Why cached columns (scale rationale)

Displaying lessons/counts for the 24 decks on a page is cheap either way. The cost driver
is **filtering and sorting across the whole public set before pagination**:

- On-the-fly lesson filter = `EXISTS` subquery through `deck_cards → cards` per candidate
  deck; fine at 1k, degrades by 50k.
- On-the-fly count sort = `GROUP BY` aggregation over the join on every page load — the
  classic slow path with `OFFSET` pagination on a growing table.

Cached `lessons[]` (GIN) + `like_count`/`view_count` (btree) make the browse query a
plain indexed `WHERE … ORDER BY … LIMIT/OFFSET` with a single join for the username.

## Browse query

`listPublicDecks({ search, lessons, format, sort, page, viewerId })` in `@revelio/db`:

```sql
SELECT d.id, d.name, d.format, d.lessons, d.like_count, d.view_count, d.updated_at,
       u.username,
       (l.user_id IS NOT NULL) AS liked_by_viewer   -- left join deck_likes on viewer
FROM decks d
JOIN "user" u ON u.id = d.user_id
LEFT JOIN deck_likes l ON l.deck_id = d.id AND l.user_id = :viewerId   -- null when logged out
WHERE d.visibility = 'public'
  AND (:search   IS NULL OR d.name ILIKE :q OR u.username ILIKE :q)
  AND (:lessons  IS NULL OR d.lessons && :lessons)        -- GIN array overlap
  AND (:format   IS NULL OR d.format = :format)
ORDER BY <sort>          -- like_count DESC | view_count DESC | created_at DESC | updated_at DESC
LIMIT 24 OFFSET (:page-1)*24;
-- plus a COUNT(*) over the same WHERE for total pages
```

`search` starting with `@` targets username only (author filter); otherwise it matches
name OR username. `lessons && :lessons` returns decks using **any** selected lesson (OR
semantics — matches the search page's lesson filter behavior).

## Write paths

- **`toggleLikeAction(deckId)`** — `'use server'`, login required (returns an auth error
  otherwise). In one tx: if my `deck_likes` row exists → delete it and `like_count -= 1`;
  else insert and `like_count += 1`. Returns `{ liked, likeCount }`. Never touches
  `deck_cards`.
- **`recordViewAction(deckId)`** — `'use server'`. If logged out → no-op. If logged in →
  `INSERT INTO deck_views … ON CONFLICT DO NOTHING RETURNING 1`; when a row was actually
  inserted, `view_count += 1`, same tx. Fired **once from the overview client component
  on mount** — not in the page's server render (Next may render/prefetch it repeatedly,
  and writes in render are discouraged).
- **Deck save** (existing `updateDeck` / `replaceDeckCards`) — additionally recompute and
  write `decks.lessons` from the incoming cards. Purely additive to the existing tx.

## UI

### Page shell (`/decks`)

Header "Browse decks" + subtitle, with `+ New deck`. A search input (name / `@author`),
a Sort dropdown (Most liked default), lesson chip toggles (the color pips), a Format
dropdown, a Clear control, a result count, and a **List / Grid** toggle whose choice is
remembered via the same cookie mechanism as the deck-overview page. Filters/sort/search/
page live in the URL query (`?q=&lesson=&format=&sort=&page=`) so state is shareable and
back-button friendly — reusing the search page's URL-state approach where practical.

### Entry — Design A (List row)

```
[icon][icon][icon]  Nimbus Aggro Tempo                 ♥ 42    👁 340
lesson SVGs (~18px) by @severus_s · Standard · 60 cards · updated 2d ago
```

Lesson SVGs are the leading element (left, vertically centered), a `flex gap-1` row at
~18px, capped with a `+N` overflow chip so row height is fixed. Text block: bold name,
then `by @author · format · N cards · updated`. Counts right-aligned.

### Entry — Design B (Grid card)

```
Nimbus Aggro Tempo
@severus_s

[icon][icon][icon]        ← lesson SVGs (~20px)
Standard · 60 cards
────────────────────
♥ 42            👁 340
```

No gradient/hero strip (rejected as redundant); the lesson SVGs are the sole color
identity. Standard shadcn surface + hover.

### Shared

- A `LessonIcons` component (deck lesson codes → `/lessons/<code>.svg` at a given size,
  with `+N` overflow) is reused by both layouts.
- **♥** is an interactive toggle for logged-in viewers (filled = liked), calling
  `toggleLikeAction` with optimistic update; for logged-out viewers it's a read-only count
  that routes to sign-in on click. **👁** is always read-only.
- Clicking anywhere else on the entry opens `/decks/[id]`.
- Default view: **Grid** (more inviting for discovery), overridable by the toggle.

## Error handling

- `toggleLikeAction` / `recordViewAction` failures are swallowed for views (best-effort,
  no user-facing error) and toasted for likes with optimistic-state rollback.
- Logged-out like attempt → redirect/prompt to sign in, no write.
- Empty result set → an empty-state ("No decks match your filters · Clear filters").
- Out-of-range `page` clamps to the last valid page.

## Testing

- **`@revelio/db`**: `listPublicDecks` filter/sort/pagination + `liked_by_viewer` join
  (Testcontainers Postgres); like toggle idempotency and counter correctness; view insert
  on-conflict no-double-count; `lessons[]` recompute on save; backfill migration.
- **`@revelio/web`**: URL search-param parsing for the new filters/sort/page; `LessonIcons`
  overflow behavior; like button optimistic/rollback + logged-out gate; `recordViewAction`
  logged-out no-op.
- **Migration**: `npm run verify` (schema/migration in sync); `db check`.

## Migration

One incremental migration (`db/drizzle/NNNN_*.sql`, generated via `npm run generate`):
`deck_likes` + `deck_views` tables; `like_count` / `view_count` / `lessons` columns on
`decks` with their indexes; backfill (`lessons` from `deck_cards`, counts from the new
tables which start empty → 0). Append-only; never regenerate `0000`.

# Deck Overview — Design

## Summary

Insert a read-only **deck overview** page between the "My Decks" list and the deck
editor. Today, clicking a deck tile jumps straight into the owner-only editor at
`/decks/[id]`. Instead, a tile should open an overview that shows every card and its
quantity, deck stats, and a set of actions: **Edit**, **Publish / Unpublish**,
**Export**, and **Duplicate → editor**.

The overview at `/decks/[id]` is viewable by the **owner always**, and by **anyone
with the link once the deck is published** (`visibility === 'public'`) — so it doubles
as the shareable public page. This is the first thing in the app that actually consumes
the existing `decks.visibility` column. The editor moves to `/decks/[id]/edit` and keeps
its strict owner gate.

## Goals

- Read-only overview of a deck: character, main deck (grouped by lesson), sideboard,
  with quantities.
- Two card presentations with a **List ↔ Gallery** toggle, choice remembered locally.
- Publish makes the deck's overview link work for other people; unpublish revokes it.
- Export (Text `//`-format / JSON / PNG) available from the overview.
- Duplicate the deck into the editor as a new draft (works for guests too).

## Non-goals (YAGNI)

- No public deck **gallery / browse** route (a grid of everyone's public decks). Public
  decks are reachable only by direct link for now. This is a natural follow-up spec.
- No character-art "hero banner". The starting character gets prominence simply by being
  the first entry in the card region.
- No comments, likes, view counts, or deck versioning.
- No stacked/overlapping-column visual spoiler. Gallery is a flat thumbnail grid; the
  fancier stacked layout can be a later enhancement.

## Layout

Layout "B" — a full-width shell so both toggle states get the same frame and only the
card region swaps.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← My Decks                                                            │
│  Gryffindor Aggro                                    [🌐 Public]      │
│  Classic · 60 cards · updated 2 days ago                             │
│  [ ✎ Edit ] [ 🌐 Publish ] [ ⬆ Export ▾ ] [ ⧉ Duplicate → editor ]  │
│                                              [ ☰ List | ▦ Gallery ]  │
│  ◗ 60/60 Legal   │  ▁▃█▅▂▁ curve   │  🟢24 🔵16 🔴12 ⚪8              │  ← stats strip
├─────────────────────────────────────────────────────────────────────┤
│  CHARACTER   Harry Potter (BS 12)          ← always first            │
│                                                                      │
│  ☰ LIST                          │  ▦ GALLERY                        │
│  CREATURES (18)                  │  ┌──┐┌──┐┌──┐┌──┐┌──┐             │
│   4× Fluffy      (BS 45)         │  │④ ││④ ││② ││④ ││③ │ …          │
│   4× Norbert     (BS 46)         │  └──┘└──┘└──┘└──┘└──┘             │
│   …                              │  (art + quantity badge)           │
│  CHARMS (16) …                   │                                   │
│  SIDEBOARD (8) …                 │                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Shell (top to bottom):**

1. Back link — `← My Decks` (`Link` to `/decks`).
2. Header — deck name, `format` + `visibility` badges, `Classic · N cards · updated <date>`.
3. Action bar — Edit / Publish / Export / Duplicate, plus the List|Gallery segmented
   toggle at the right.
4. Stats strip (horizontal, full width) — legality ring + count (`LegalitySeal`), lesson
   curve sparkline (`LessonCurve`), and a compact lesson breakdown.
5. Card region (full width), toggles between List and Gallery.

**Card region ordering (both views):** starting **character first**, then **main deck**
grouped by lesson, then **sideboard**.

- **List view** — grouped text rows with `4×` quantity labels. Reuses `DeckPanel` with
  its quantity steppers removed (read-only mode).
- **Gallery view** — a flat responsive thumbnail grid using the browser's existing
  `next/image` + `thumbKey(...)` tiles, each with a quantity badge. Read-only (no add/
  remove). Character is the first tile.

**Responsive:** the stats strip wraps on narrow screens; the Gallery grid reflows
columns; the action bar wraps with the toggle dropping to its own row.

## Routing & access

| Route | Who | Behavior |
|---|---|---|
| `/decks` | owner | My Decks list; tiles now link to the **overview**. |
| `/decks/[id]` | owner **or** anyone if `public` | **Overview** (new). Non-owner + private → `notFound()`. |
| `/decks/[id]/edit` | owner only | **Editor** (moved from `/decks/[id]`). Non-owner → `notFound()`. |
| `/decks/new` | anyone | Builder for a new deck (unchanged). |

- **New query** `getDeckForViewer(db, id, viewerId | null)` in `@revelio/db` — returns the
  full deck view (same shape as `getDeck`) when `deck.userId === viewerId` **or**
  `deck.visibility === 'public'`, else `null`. The overview page uses this; it never
  leaks a private deck to a non-owner.
- The **editor** page (`/decks/[id]/edit`) keeps the current strict gate
  (`existing.userId !== session.user.id → notFound()`), reusing `getDeck`.
- Deck-list tiles (`deck-list.tsx`): the tile link and the dropdown's "Open" now point at
  `/decks/${id}` (overview). A new "Edit" dropdown item points at `/decks/${id}/edit`.

## Actions

Rendered conditionally by role (owner vs. non-owner) and publish state.

- **Edit** — `Link` to `/decks/[id]/edit`. **Owner only.**
- **Publish / Unpublish** — **owner only.** Toggles `visibility` via the existing
  `updateDeckMetaAction(deckId, { name, visibility })` (name unchanged), which already
  `revalidatePath`s. When the deck is public, the control becomes a split/dropdown button:
  **Copy link** (writes the canonical overview URL to the clipboard) + **Unpublish**.
- **Export ▾** — **everyone.** Reuses `DeckExportMenu` (Copy/Download Text, Copy/Download
  JSON, Download PNG). Built client-side from the loaded deck, exactly as in the editor.
- **Duplicate → editor** — **everyone.**
  - Logged-in: call `duplicateDeckAction(deckId)` → `router.push('/decks/<newId>/edit')`.
  - Guest: load the deck into the guest `localStorage` draft (`saveDraft`) and
    `router.push('/decks/new')`. (`duplicateDeckAction` requires auth, so guests use the
    draft path.)

**Action visibility matrix:**

| Viewer / state | Edit | Publish | Export | Duplicate |
|---|:--:|:--:|:--:|:--:|
| Owner, private | ✓ | Publish | ✓ | ✓ |
| Owner, public | ✓ | Copy link · Unpublish | ✓ | ✓ |
| Non-owner, public | — | — | ✓ | ✓ |
| Non-owner, private | 404 (page not found) | | | |

## Components

New (all under `app/web/src/components/`):

- `deck-overview.tsx` (`'use client'`) — the shell: header, action bar, stats strip,
  view toggle, and the card region. Owns the `view` state and its `localStorage`
  persistence. Receives the resolved deck view + `isOwner` + `imageBase` as props from
  the server page.
- `deck-gallery.tsx` — the read-only thumbnail grid (character first, then grouped main,
  then sideboard) with quantity badges.
- `deck-overview-actions.tsx` — the action bar (Edit / Publish / Export / Duplicate),
  wiring the server actions and clipboard.

Reused as-is or lightly adapted:

- `DeckPanel` — add a `readOnly` prop (or a sibling presentational component) that hides
  the quantity steppers and renders `N×` labels. Same grouping/marker logic.
- `LegalitySeal`, `LessonCurve`, `LessonCost`, `DeckExportMenu` — reused directly.

Server page `app/web/src/app/[locale]/decks/[id]/page.tsx` becomes the overview
(server component: `setRequestLocale` + `getTranslations('decks')`, resolves session,
calls `getDeckForViewer`). The current editor body moves to
`app/web/src/app/[locale]/decks/[id]/edit/page.tsx` (keeps the owner gate + `DeckBuilder`).

## Data flow

1. Server page resolves `session` (may be null) and calls
   `getDeckForViewer(getDb(), id, session?.user?.id ?? null)`.
2. `null` → `notFound()`. Otherwise pass `{ deck, isOwner: deck.userId === session?.user?.id, imageBase }`
   to `<DeckOverview />`.
3. `DeckOverview` renders the shell and the current view; derives legality/curve/lesson
   breakdown from the deck entries via `evaluateDeck()` and existing helpers.
4. Publish/Unpublish and Duplicate call the existing server actions; `revalidatePath`
   keeps the page fresh. Export and Copy link are pure client-side.

## i18n

New strings under the `decks` namespace in `app/web/messages/{en,de}.json`, e.g.
`overview.backToDecks`, `overview.character`, `overview.sideboard`, `overview.viewList`,
`overview.viewGallery`, `overview.publish`, `overview.unpublish`, `overview.copyLink`,
`overview.linkCopied`, `overview.duplicate`, `overview.edit`, `overview.updatedAt`.

## Testing

- **`getDeckForViewer`** (db, Testcontainers): owner-private → returns; non-owner-public →
  returns; non-owner-private → `null`; guest (null viewer) public → returns; missing id →
  `null`.
- **Overview page access** (component/route): owner sees actions; non-owner of a public
  deck sees Export + Duplicate but not Edit/Publish; non-owner of a private deck →
  `notFound`.
- **View toggle**: switching List↔Gallery swaps the card region and persists to
  `localStorage`; initial render honors a stored preference.
- **Action visibility**: matrix above renders the right buttons per role/state.
- **Duplicate**: logged-in path calls `duplicateDeckAction` and routes to the new deck's
  editor; guest path writes a draft and routes to `/decks/new`.
- **Deck-list linking**: tiles/"Open" point at the overview; new "Edit" item points at
  `/decks/[id]/edit`.

## Open questions

None outstanding — audience (owner + public link), export behavior (Export menu **and**
Duplicate), and layout (B, character-first, List/Gallery toggle) are decided.

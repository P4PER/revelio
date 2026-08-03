# Deck view header — Moxfield-style banner

**Date:** 2026-08-03
**Status:** Approved design
**Area:** `app/web` deck view (`/decks/[id]`)

## Goal

Replace the plain text header at the top of the deck view with an immersive
banner ("Option A", the Moxfield-style direction from the mockups): the deck's
starting-character art fills a hero banner, with the deck name, metadata, and a
new **owner display name** overlaid on a dark scrim. The actions row, view
switcher, stats panel, legality bar, and card list below the header are
**unchanged**.

Mockup reference: `deck-header-mockups.html` (Option A).

## Current state

`deck-overview.tsx` renders, top to bottom:

1. A header block: `<h1>` deck name, a meta line (`format · updated`, view
   count, `DeckLikeButton`), and a visibility `Badge`.
2. A row: `DeckOverviewActions` (Copy/Export/Edit/Delete) + list/gallery view
   switcher.
3. A bordered panel: `DeckStatsPanel` + `DeckLegalityBar` + `DeckPanel`/`DeckGallery`.

The view has **no art and no owner name**. `getDeckForViewer` returns
`{ deck, userId, views, viewCount }` — the owner's name/username is never loaded.

## Design

### Scope

Replace **only item 1** (the header block) with a new banner component. Items 2
and 3 stay exactly as they are.

### New component: `deck-header.tsx`

A self-contained client component that renders the banner. One purpose: present
the deck's identity (art, name, meta, owner, visibility).

**Props**

```ts
type DeckHeaderProps = {
  deckId: string
  name: string
  format: DeckFormat
  updatedAt: string
  visibility: 'private' | 'public'
  viewCount: number
  likeCount: number
  liked: boolean
  loggedIn: boolean
  imageBase: string
  // owner
  ownerName: string            // display label (displayUsername ?? username ?? name)
  ownerUsername: string | null // @handle for the link; null → name is plain text
  // starter art + lessons, derived from views by the caller
  starterCardId: string | null
  starterArtCropVersion: number | null
  lessons: string[]
}
```

**Layout** (mirrors mockup A):

- Root: `relative overflow-hidden rounded-xl border border-border`, min-height
  ~230px, `flex`.
- Background: `DeckArt` wrapped in an `absolute inset-0` div so it fills the
  banner (`<div className="absolute inset-0"><DeckArt className="h-full w-full" …/></div>`).
  Pass `cardId={starterCardId}`, `version={starterArtCropVersion}`,
  `lessons={lessons}`, `alt={name}`. DeckArt already falls back to a
  lesson-colour gradient (then `bg-muted`) when there is no starter or the image
  fails — no new fallback logic needed.
- Two scrims over the art (like `DeckHeroCard`): a top gradient
  (`from-black/70 … to-transparent`) and a bottom gradient
  (`from-[#090816]/92 … to-transparent`) so overlaid text stays legible. All
  overlaid text carries `text-shadow: 0 2px 10px rgba(0,0,0,0.85)`.
- Content layer (`relative z-10`, `flex flex-col justify-between`, padded):
  - **Top row** (`justify-between`): owner link (left) + visibility `Badge` (right).
  - **Bottom block**: `<h1>` deck name (`text-white`, clamped/`text-wrap: balance`),
    then a meta row: `format · updated`, view count (`Eye`), `DeckLikeButton`,
    and `LessonIcons` for the deck's lessons (pushed to the right).

**Owner element**

- No avatar. Text only: the display name followed by `@username`
  (e.g. `Grindelwald @grindlewald`), styled light-on-scrim.
- When `ownerUsername` is non-null: wrap in a locale-aware `Link` to
  `/decks?q=@${ownerUsername}` (the deck browse already treats a leading `@` as a
  username filter — `queries.ts` `listPublicDecks`). When null: render as plain
  text (no link).

### `DeckLikeButton` change

Add an optional `className?: string` prop, merged with the existing classes via
`cn(...)`. Default rendering is unchanged. `DeckHeader` passes a light-on-scrim
override (e.g. `text-white/90 hover:text-white`) so the heart/count read on the
art. No behavioural change.

### Data plumbing (owner name/username)

The one new piece of data is the owner's name + username.

1. **`@revelio/db` — `getDeck`** (`queries.ts`): add an inner join to `user` and
   return an `owner` field:
   ```ts
   owner: { name: string; username: string | null }
   ```
   where `name = user.displayUsername ?? user.username ?? user.name ?? '—'` and
   `username = user.username` (mirrors `listPublicDecks`'s `author`). Update the
   return type of `getDeck` and `getDeckForViewer` accordingly.
2. **Page** (`decks/[id]/page.tsx`): pass `ownerName={existing.owner.name}` and
   `ownerUsername={existing.owner.username}` into `DeckOverview`.
3. **`DeckOverview`**: accept `ownerName`/`ownerUsername` props; derive starter
   art + lessons from `views` and forward everything to `DeckHeader`:
   - `const starter = views.find((v) => v.zone === 'character')`
   - `starterCardId = starter?.cardId ?? null`,
     `starterArtCropVersion = starter?.artCropVersion ?? null`
   - `lessons = [...new Set(views.map((v) => v.lesson).filter(Boolean))]`

No schema change, no migration.

### Localization

- New `decks.overview.viewAuthorDecks` (aria-label for the owner link), e.g.
  `"View decks by {name}"` / German equivalent. Added to `messages/en.json` and
  `messages/de.json`.
- Deck-name art `alt` reuses the deck name (as `DeckHeroCard` does). No hardcoded
  user-facing strings.

## Error handling / edge cases

- **No starting character** (deck without a `character`-zone card): `starterCardId`
  is null → `DeckArt` renders the lesson gradient (or `bg-muted` when the deck has
  no lessons yet). Scrims + text stay the same, so the banner still reads.
- **Owner has no username** (`ownerUsername === null`): owner name renders as
  plain text, no link.
- **Long deck name**: `text-wrap: balance` + a line clamp keep the banner height
  bounded.
- **Private deck (owner view)**: badge shows `Private`; banner is otherwise
  identical. Non-owners still 404 on private decks via `getDeckForViewer` — the
  owner join does not change visibility gating.

## Testing

- **`deck-overview.test.tsx`**: update header expectations — the deck name now
  lives in the banner; assert the owner name renders and (with a username) links
  to `/decks?q=@…`, and that the visibility badge still appears. Keep assertions
  for the actions row + view switcher.
- **`deck-header.test.tsx`** (new): renders name/meta/owner; owner links when a
  username is present and is plain text when null; renders `DeckArt` fallback
  when `starterCardId` is null.
- **`deck-like-button`**: existing tests must still pass with the new optional
  `className` (default path unchanged).
- **db query test** (if `getDeck`/`getDeckForViewer` is covered): assert the new
  `owner` field is populated.

## Out of scope

- Merging stats/legality into the banner (that was Option C).
- Owner avatar of any kind (text name + `@username` only).
- Any change to the actions row, view switcher, stats panel, legality bar, or
  card list.
- Schema/migration changes.

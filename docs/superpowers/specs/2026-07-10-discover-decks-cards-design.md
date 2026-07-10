# Discover Decks — Hero Cards & Polish — Design

## Summary

Iterate on the public deck list (built in `2026-07-10-public-deck-browse`): rename it
**"Discover decks"**, and replace the plain Grid tiles with **Moxfield-style hero cards**
that crop the deck's **starting-character art** as a banner, overlaying the deck name,
format, lessons, and read-only engagement counts, with an author + relative-time footer.
The List view keeps compact rows (now with a small cropped-art thumbnail). Also: make the
search **wider, instant (debounced, no Enter), and height-aligned** with the filter
selects; and move the **interactive like** from the list to the **deck overview** page
(counts in the list become read-only).

## Goals

- Grid tiles become rich **hero cards**: cropped starting-character art + gradient
  overlays (name, `format · N cards` at top; lessons + `♥`/`👁` at bottom) + a solid
  footer bar (author avatar + name · relative updated time). (Design "A".)
- Missing starter art → a **lesson-colour gradient** with the deck name.
- List view keeps dense rows, each with a small cropped-art thumbnail (same fallback).
- **Instant search**: debounced (~300 ms) URL update on keystroke, no Enter — mirrors the
  card search (`search-box.tsx`); wider input; search + Sort + Format controls same height.
- Rename **"Browse decks" → "Discover decks"** (nav + page heading/title).
- **Likes read-only in the list**; the interactive like button lives on the **deck
  overview** page (`/decks/[id]`).

## Non-goals (YAGNI)

- No comments (the reference's `💬` is dropped — we have no comment feature).
- No new image assets / server-side cropping — the crop is pure CSS on the existing full
  card image. No new S3 objects, no `sharp` changes.
- No change to the underlying route (`/decks` stays; only the visible label changes).
- No art focal-point editor — a single tuned `object-position` for all cards.
- No change to how views are counted or to the `deck_likes`/`deck_views` tables.

## Data model / query changes

### `listPublicDecks` → also return the starting-character card id

Each hero/thumbnail needs the deck's starting-character image. Add `starterCardId` to
`PublicDeckEntry`, resolved for the page's decks the same way `cardCount` already is (a
second query over the page's ids, no extra per-row joins in the main query):

```ts
// after the main paginated `rows` query, alongside the cardCount lookup:
const starters = ids.length
  ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId })
      .from(deckCards).where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
  : []
const starterByDeck = new Map(starters.map((s) => [s.deckId, s.cardId]))
// entry: starterCardId: starterByDeck.get(r.id) ?? null
```

`PublicDeckEntry` gains `starterCardId: string | null`.

### Like state for the deck overview

The overview page must show the current like count and whether the viewer liked it. Add:

```ts
export async function getDeckLikeState(
  db: DB, deckId: string, viewerId: string | null,
): Promise<{ likeCount: number; liked: boolean }>
```

Reads `decks.like_count` and (when `viewerId`) checks `deck_likes` for the pair. Exported
from `@revelio/db`.

## Components

### `DeckArt` (new, client) — the cropped image with fallback

`web/src/components/deck-art.tsx`. One place owns the crop + fallback so hero and thumbnail
stay identical.

- Props: `cardId: string | null`, `lessons: string[]`, `imageBase: string`,
  `alt: string`, `className?: string` (the container controls aspect/size).
- If `cardId` and `imageBase`: render the full card image (`imageUrl(imageBase,
  imageKey(cardId))`) as an absolutely-positioned `<img>` with
  `object-fit: cover; object-position: center 22%` (the illustration band of an HP TCG
  card). `onError` flips to the gradient fallback (covers "card has no uploaded image").
- Fallback (no `cardId`, or image errored): a `linear-gradient(135deg, …)` built from the
  deck's lesson colours (via `LESSONS`/`lessonColor`); neutral muted gradient if the deck
  has no lessons.
- Uses a plain `<img>` (like `LessonIcons`) so `onError` fallback is simple; container is
  `relative overflow-hidden`.

### `DeckHeroCard` (new, client) — Grid tile (Design A)

`web/src/components/deck-hero-card.tsx`. A `<Link>` to `/decks/[id]` wrapping:

- **Art band** (`aspect-[16/10] relative`): `<DeckArt>` filling it, plus two gradient
  scrims — a top `from-black/70` and a bottom `from-black/70` — for text legibility.
- **Top overlay:** deck name (bold, white, `line-clamp-1`) + `format · N cards` (muted
  white).
- **Bottom overlay:** `LessonIcons` (left) and read-only `♥ {likeCount}` + `👁 {viewCount}`
  (right).
- **Footer bar** (solid `bg-card`, below the art): an avatar chip (first letter of author)
  + author name (left); relative updated time (right).

### `DeckDiscoverRow` (new, client) — List row

`web/src/components/deck-discover-row.tsx`. `<Link>` row: small `<DeckArt>` thumb
(`size-14 rounded`), then name (bold) + `by @author · format · N cards · {relative}` with
`LessonIcons` at the end of the meta line, and read-only `♥`/`👁` at the right.

### `DeckBrowse` (modify) — instant search, layout, read-only stats

- **Search**: replace the Enter-on-keydown `Input` with a debounced controlled input (a
  `useRef` timer + `router.replace`, 300 ms — mirroring `search-box.tsx`). Make it the
  flexible/wide element (`flex-1` up to a sensible max). Give the input and both
  `SelectTrigger`s the **same height** (`h-9`; use the default `SelectTrigger` size, not
  `sm`, so all three align).
- **Entries**: Grid maps to `<DeckHeroCard>`, List to `<DeckDiscoverRow>`; the inline
  markup and `DeckLikeButton` import are removed (stats are now read-only).
- Needs `imageBase` — the page passes `NEXT_PUBLIC_IMAGE_BASE_URL` down (as the overview
  and gallery pages already do).

### `relative-time` helper (new) + test

`web/src/lib/relative-time.ts`: `formatRelativeTime(iso: string, locale: string): string`
using `Intl.RelativeTimeFormat` — picks the largest fitting unit (min/hour/day/week/…).
Pure function, unit-tested with a fixed "now" argument (`formatRelativeTime(iso, locale,
now?)` so tests don't touch the clock).

### Like button relocation

- **List**: no button — plain `♥ {count}` text in `DeckHeroCard`/`DeckDiscoverRow`.
- **Overview**: add `<DeckLikeButton>` to the overview header actions
  (`deck-overview-actions.tsx`, which already receives `deckId`/`loggedIn`). The overview
  page (`/decks/[id]/page.tsx`) fetches `getDeckLikeState` and passes `initialLiked` /
  `initialCount`.
- Move the like copy from `decks.explore.likeLabel`/`likeError` to neutral
  `decks.like.label`/`decks.like.error` (used on the overview now, not the list).

## Cropping technique (answering "how do we crop the starting card?")

No image processing — CSS only. The full card image (`cards/{id}.webp`, `63/88` portrait)
is placed in a wide, short container (`aspect-[16/10]` hero, `size-14` thumb) with
`object-fit: cover` and `object-position: center 22%`, which frames the illustration band
near the top of the card and hides the title/text box. The same `DeckArt` component is
reused at both sizes so the crop is consistent. `object-position` is a single constant
(no per-card focal editing in scope).

## Rename

- `messages.*.nav.browse`: "Browse decks" → "Discover decks" / "Decks entdecken" (unchanged
  German, already "Decks entdecken").
- `messages.*.decks.explore.title`/`subtitle`: "Discover decks" / keep subtitle.
- The internal `explore` message namespace and the `/decks` route are unchanged.

## Error handling

- `DeckArt`: `onError` → gradient fallback; `starterCardId === null` → gradient directly.
- Like on overview: optimistic toggle with rollback + toast (existing `DeckLikeButton`
  behaviour); logged-out → routes to sign-in.
- Instant search: debounced; empty query clears the `q` param. Rapid typing cancels the
  prior timer (no stale navigations).
- Missing `imageBase` (env unset): `DeckArt` treats it as no image → gradient.

## Testing

- **`@revelio/db`** (ingest tests): `listPublicDecks` returns `starterCardId` (deck with a
  `character`-zone card vs. without → null); `getDeckLikeState` count + `liked` flag for
  viewer/guest.
- **`@revelio/web`**:
  - `formatRelativeTime` — units and locales with a fixed `now`.
  - `DeckArt` — renders `<img>` with the starter image src when `cardId` given; renders the
    gradient fallback (no `img`) when `cardId` is null.
  - `DeckHeroCard` — shows name, `format · cards`, read-only counts (no like button),
    author, lessons.
  - `DeckBrowse` — debounced search updates the URL without Enter (fake timers); List/Grid
    render the row/hero components.

## File structure

**Create:** `web/src/components/deck-art.tsx`, `web/src/components/deck-hero-card.tsx`,
`web/src/components/deck-discover-row.tsx`, `web/src/lib/relative-time.ts`,
`web/src/lib/__tests__/relative-time.test.ts`, plus component tests.

**Modify:** `db/src/queries.ts` (starterCardId + `getDeckLikeState`), `db/src/index.ts`,
`web/src/components/deck-browse.tsx`, `web/src/app/[locale]/decks/page.tsx` (pass
imageBase), `web/src/app/[locale]/decks/[id]/page.tsx` + `deck-overview-actions.tsx` (like
button + state), `web/src/components/site-header.tsx` isn't needed (nav uses the message),
`web/messages/en.json` + `de.json` (rename + `decks.like.*`).

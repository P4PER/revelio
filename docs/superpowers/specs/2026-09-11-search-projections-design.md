# Search Projections Design

## Problem

Every Meilisearch read in the app asks for whole documents. `SearchDocument` carries
24 fields (`app/search/src/documents.ts`), including `text` and `flavorText`, which
together are about 32% of the payload. Most surfaces render a handful of fields.

The bot's `/search` was the first case fixed (`perf(bot): fetch only the fields /search
renders`). The web app has the same shape on four surfaces:

| Surface | Hits per read | Fields the renderer reads | Reaches |
|---|---|---|---|
| `/search` (`HITS_PER_PAGE = 24`) | 24 | 6 - `CardTile` | server only |
| `/sets/[code]` (`FULL_SET_LIMIT = 250`) | 250 | 6 - `CardTile` | server only |
| Collection grids (`FULL_SET_LIMIT` / `BROWSE_PAGE_SIZE = 60`) | 250 / 60 | 7 - `toCollectionCards` | server only |
| Deck card browser (`DECK_BROWSE_PAGE_SIZE = 30`) | 30 | 16 - `toAddView` + the tile | **the browser** |

Sizes below are computed by reshaping `card-data/dist/cards.en.json` into the indexed
document shape; the local Meilisearch holds no `cards-*` index, so they are estimates,
not a live measurement:

- `/sets/[code]`: ~143 KiB -> ~36 KiB (-75%)
- `/search`: ~15 KiB -> ~3.6 KiB (-76%)
- Collection browse: ~35 KiB -> ~10.5 KiB (-70%)
- Deck browser: mostly `text`/`flavorText`/`rarity`, about -35%

`card/[id]` is already narrow: it reads neighbours through `searchCardIds`.

`card-grid.tsx` and `card-tile.tsx` are server components, so three of the four
surfaces only pay the Meilisearch-to-Next hop on a private network. `deck-card-browser.tsx`
is `'use client'` and receives its results from the `searchDeckCards` server action, so
there the whole documents are serialised into the browser payload on every debounced
keystroke. That is the only one that costs users bandwidth, and also the one that needs
the most fields.

## The failure mode this must design out

Narrowing a projection is a footgun. `searchCardSummaries` was applied to `findOneCard`
by accident during the bot change; that path feeds `cardEmbed`, which reads `text`,
`types` and the image fields, so `/card name:...` would have thrown on
`doc.types.map` of undefined. Two things let it through:

1. The narrowed function returned a type wide enough to keep compiling in some call
   shapes - the guard was a hand-written type, not one derived from the projection.
2. The bot's Meilisearch stub returned whole fixtures whatever `attributesToRetrieve`
   asked for, so the test could not see the difference.

The design answer to (1): **one tuple is the single source of truth, and the hit type is
derived from that same tuple.** A surface declares its fields once as a `const` tuple;
the query sends it as `attributesToRetrieve` and the type is
`Pick<SearchDocument, (typeof FIELDS)[number]>`. Reading a field the query did not ask
for is then a compile error, not a runtime `undefined`.

The design answer to (2): assert projections against a **real** Meilisearch.
`web/src/lib/server/__tests__/search-client.test.ts` already runs against
`TEST_MEILI_HOST` with its own throwaway index, so it can assert the exact key set that
comes back. A stub cannot lie there.

## Shape

`@revelio/search` grows one generic read:

```ts
export type CardProjection<K extends keyof SearchDocument> =
  Omit<SearchResult, 'hits'> & { hits: Pick<SearchDocument, K>[] }

export async function searchCardFields<K extends keyof SearchDocument>(
  client: MeiliSearch, lang: string, query: string,
  fields: readonly K[], opts?: SearchOptions,
): Promise<CardProjection<K>>
```

`searchCards` (whole documents) stays: `/card`, the card embed and the bot's
`findOneCard`/`findCardById` genuinely need every field. `searchCardSummaries` and
`searchCardSuggestions` become thin wrappers over the generic so there is one code path
that builds `attributesToRetrieve`.

`web` gets one isomorphic module, `web/src/lib/search-projections.ts`, holding the three
tuples and their derived types. It is a plain constants-and-types module at `lib/` root
(not `lib/server/`), because `deck-card-browser.tsx` is a client component and needs the
type.

## Non-goals

- Narrowing `searchCards` itself, or removing it.
- Touching `card/[id]`, `card-neighbors`, or any DB query.
- Changing index settings. `CARD_INDEX_SETTINGS` is untouched, so no ingest run is needed.

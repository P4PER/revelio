# Name-First Search Ranking Design

## Problem

Searching `Harry Potter` on `/search` returns name matches, then flavor-text matches,
then name matches again. Measured against the local `cards-en` index (1098 documents):

```
 1-4   name      Harry Potter, The Famous Harry Potter, Harry's Wand, Harry Triumphant
 5-18  flavor    Meeting on the Train, Double-Beater Defence, ... Butterbeer
19-24  name      Harry Hunting, Harry the Seeker, Harry, Second Year, ...
```

A card whose flavor text mentions Harry Potter in passing outranks fourteen cards with
Harry in the name. The name is what a player searches by, so the list reads as broken.

## Cause

Not the position of `attribute` in `CARD_INDEX_SETTINGS.rankingRules`
(`app/search/src/documents.ts`). Meilisearch's `words` rule - "sorts by decreasing
number of matched query terms" - is applied while the query graph is resolved, above
the configured rules, so it cannot be demoted or removed. `_rankingScoreDetails` for
the list above:

| Hits | `matchingWords` | Where |
|---|---|---|
| 1-18 | 2/2 | 1-4 name, 5-18 flavor |
| 19-24 | 1/2 | name (`Harry Hunting` has no "Potter") |

Every document matching both terms outranks every document matching one, wherever the
terms matched. Within a `matchingWords` bucket the `attribute` rule does put name
above text - which is why the list alternates rather than being random.

Two configurations were tried against a scratch index holding the same 1098 documents.
Both returned byte-identical output to the list above:

1. `rankingRules: ['attribute', 'words', 'typo', 'proximity', 'sort', 'exactness']`
2. `rankingRules: ['attribute', 'typo', 'proximity', 'sort', 'exactness']` - `words`
   dropped from the rules entirely

So no index-settings change can fix this. It has to be fixed at query time.

## Shape

Meilisearch 1.10 added **federated multi-search**: several queries merged into one
result list, ranked by `weightedRankingScore` (`_rankingScore * federationOptions.weight`),
keeping a document's best-scoring occurrence. Two queries against the same index:

| Query | `attributesToSearchOn` | `weight` |
|---|---|---|
| 0 | `['name']` | 10 |
| 1 | *(unset - name, text, flavorText)* | 1 |

Query 0 returns a subset of query 1, so every name match is scored twice and kept at
its weighted score. `_rankingScore` is in `(0, 1]`, so a weight of 10 lifts the whole
name group above the whole text/flavor group with an order of magnitude to spare, while
ranking *inside* each group stays Meilisearch's own. Measured on the same 1098
documents, `q = "harry potter"`:

```
 1  Harry Potter             q0  2.0000     <- weight x score, name group
 2  The Famous Harry Potter  q0  1.9963
 3  Harry Hunting            q0  0.9949     <- matched "Harry" only, still a name match
 ...
10  Harry's Wand             q0  0.9949
11  Meeting on the Train     q1  0.9648     <- text/flavor group begins
12  Double-Beater Defence    q1  0.9632
```

The margin widens as queries get longer: at `q = "harry potter quidditch world cup"`
the weakest name match scores 1.9899 against 0.3859 for the strongest flavor match.

## Decisions

**The whole name group ranks above the whole text/flavor group.** A card matching one
word of the query in its name (`Harry Hunting`) outranks a card matching every word in
its flavor text (`Meeting on the Train`). Confirmed with the user against real result
lists. Exactness still wins *within* the name group, so the card named exactly
`Harry Potter` stays first.

**Weight 10, not 2.** 2 is enough for the two-word case measured above (0.9949 vs
0.9648) but the margin is three thousandths of a point and nothing in Meilisearch
guarantees it. Scores are bounded by 1, so 10 makes the separation structural rather
than empirical.

**Federate only when relevance decides the order** - a non-empty query *and* no
explicit sort. Both exclusions were measured, and both are failures, not preferences:

- **Explicit sort.** With `sort: ['name:asc']` the merge still orders by weighted
  score, so the name group is lifted out of the requested alphabetical order.
- **Empty query.** Every document matches both queries at score 1.0, so the merge
  order becomes arbitrary. A browse read of `q=''` sorted by `numberSort:asc` came
  back in neither card-number nor any other discernible order.

This maps exactly onto `toSearchOptions` in `web/src/lib/search-params.ts`, which
already sends `sort: undefined` only for `sort=relevance`.

**Both reads federate, not just the paged one.** `web/src/lib/card-neighbors.ts` walks
the user's result set through `searchCardIds` to build the card page's prev/next
chevrons. If the grid federates and the walk does not, the chevrons step through a
different order than the grid displayed, and `neighborsFromWindow` reads that as a
stale index and silently falls back to set order. One shared helper serves both.

## Blast radius

`@revelio/search` is the only workspace that changes. Everything downstream inherits
the fix: `/search`, the set pages, collection browse, the deck card browser, the card
page's prev/next walk, and the bot's `/card`, `/search` and autocomplete.

`CARD_INDEX_SETTINGS` is untouched, so **no ingest run and no reindex** is needed.

The floor is Meilisearch **1.10** (federation's first release). `docker-compose.yml`
and `.github/workflows/ci.yml` both pin `getmeili/meilisearch:v1.10`; the deployed
instance has to be at least that.

## The failure mode this must design out

The Meilisearch JS client types `multiSearch` as two overloads, and the non-federated
one wins for any argument that also satisfies `MultiSearchParams` - which a federated
request does. So

```ts
const res = await client.multiSearch(federatedParams)
res.hits // TS2339: Property 'hits' does not exist on type 'MultiSearchResponse'
```

The federated response type has to be named at the call site. Verified with `tsc`.

Second: a federated hit carries a `_federation` bookkeeping object. Projected reads
are typed as exactly the fields the caller asked for, and
`web/src/lib/server/__tests__/search-client.test.ts` asserts
`Object.keys(hits[0]).sort()` equals the projection tuple, so `_federation` has to be
stripped before the hits are handed back. That live test is the guard.

Third: every Meilisearch stub in the tree implements `index().search` and nothing
else, so each one starts throwing `multiSearch is not a function` the moment a
non-empty query federates. The stubs are updated *before* the behaviour changes, in
their own commit, so no commit leaves a workspace red.

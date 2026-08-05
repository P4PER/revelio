# Daily-Rotating Example Searches — Design

**Date:** 2026-08-05
**Status:** Approved
**Area:** `app/web` home page (`src/app/[locale]/page.tsx`)

## Problem

The home page shows a fixed row of five example-search chips, hardcoded as
`EXAMPLE_SEARCHES = ['Harry Potter', 'Dumbledore', 'Quidditch', 'Snitch', 'Charms']`.
We want the shown examples to rotate — a different set of five each day, changing
every 24 hours — so the page feels fresher and surfaces more of the dataset over
time.

## Requirements

- Five example chips shown at a time (unchanged from today).
- The selection changes once every 24 hours.
- The selection is **date-seeded**: all visitors see the same five on a given day,
  and it is stable within that day (no per-request flicker).
- Locale-aware: English and German visitors get locale-appropriate terms.
- Each term must be a search query that returns results in that locale.

## Non-Goals

- No dynamic DB query. The pool is curated, not derived from card data at runtime.
- No admin UI for editing the pool — it lives in code.
- No per-user personalization or history.

## Design

### 1. Locale-keyed curated pool (data, not UI copy)

The candidate terms are curated content that doubles as functional search queries,
not translatable UI copy. They therefore live as a typed constant in code — **not**
in `messages/*.json` — colocated with the selection logic. This keeps type safety
(no `t.raw()` escape hatch) and keeps the pool next to the code that consumes it.

`src/lib/daily-examples.ts`:

```ts
const POOLS: Record<string, string[]> = {
  en: [ /* ~15–20 terms: themes + iconic card/character names */ ],
  de: [ /* ~15–20 locale-appropriate terms */ ],
}
```

Draft `en` pool (final list refined during implementation): Harry Potter,
Dumbledore, Hermione, Ron Weasley, Snape, Hagrid, Draco Malfoy, Voldemort,
Quidditch, Snitch, Charms, Transfiguration, Potions, Broom, Wand, Dragon, Troll,
Owl.

Draft `de` pool: Harry Potter, Dumbledore, Hermine, Ron Weasley, Snape, Hagrid,
Draco Malfoy, Voldemort, Quidditch, Schnatz, Zauberkunst, Verwandlung,
Zaubertränke, Besen, Zauberstab, Drache, Troll, Eule.

**Implementation caveat:** every `de` term must be verified against the German
search index (run a quick search per term) so the chip always lands on results.
Terms that return nothing in `de` are dropped or replaced. Same sanity check for
`en`.

### 2. Deterministic daily picker (pure)

`src/lib/daily-examples.ts` exports:

```ts
export function pickDailyExamples(
  locale: string,
  date: Date,
  count = 5,
): string[]
```

Algorithm:

1. Resolve the pool: `POOLS[locale] ?? POOLS.en` (fallback for unknown locales).
2. Compute a UTC day-number: `Math.floor(date.getTime() / 86_400_000)`. This
   ignores the time of day, so the result is stable for the whole UTC day and
   flips at 00:00 UTC.
3. Seed a tiny inline PRNG (mulberry32) with the day-number.
4. Fisher–Yates shuffle a copy of the pool using that PRNG.
5. Return the first `count` items (or the whole shuffled pool if it is shorter).

Pure function, no I/O, no dependencies — fully unit-testable.

**Timezone note:** rotation happens at 00:00 UTC (≈01:00/02:00 local for DE),
not local midnight. Chosen for simplicity and because it gives every visitor the
same set at the same instant. Acceptable trade-off; revisit only if local-midnight
rotation is later requested.

### 3. Wiring into the page

`src/app/[locale]/page.tsx`:

- Remove the module-level `EXAMPLE_SEARCHES` constant.
- The `Home` component already receives `locale` context; pass `locale` into it (or
  read it) and compute `const examples = pickDailyExamples(locale, new Date())`.
- Render loop over `examples` is otherwise unchanged (`Badge` + `Link`).

The page is already `export const dynamic = 'force-dynamic'`, so `new Date()` is
evaluated per request; day-seeding makes the output stable within each UTC day.

## Testing

`src/lib/__tests__/daily-examples.test.ts` (vitest):

- **Determinism:** same `(locale, date)` → identical result across calls.
- **Intra-day stability:** two different times on the same UTC day → identical result.
- **Rotation:** consecutive UTC days → different result (at least not identical).
- **Count & distinctness:** returns exactly `count` items, all distinct.
- **Small pool:** `count` larger than pool length returns the whole pool, no dupes.
- **Locale fallback:** unknown locale falls back to the `en` pool.

## Files

- `app/web/src/lib/daily-examples.ts` — new (pool + picker).
- `app/web/src/lib/__tests__/daily-examples.test.ts` — new.
- `app/web/src/app/[locale]/page.tsx` — edit (drop constant, call picker).

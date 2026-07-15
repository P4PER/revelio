# Card Finish Model: scalar `finish` → `finishes[]`

**Date:** 2026-07-16
**Status:** Design — approved decisions, pending spec review
**Depends on:** nothing
**Blocks:** the Collection page feature (separate, later spec)

## Context & problem

A card's finish is currently modeled as an **identity**: `cards.finish` is a per-row
scalar (`normal` / `foil` / `holo`), and premium printings are stored as **separate card
rows**. This is wrong for the Harry Potter TCG, where a finish is an **availability
property** of one physical card — the same card can be owned as normal *or* as its
premium finish.

The current data confirms the model is unreliable:

- **1,035 cards**, of which **26** are premium rows (15 `foil`, 11 `holo`) — all `Rare`.
- The premium assignments don't even follow a consistent rule: 15 of the 26 premium rows
  are Characters, yet only 11 are `holo`, so some Rare characters are mislabeled `foil`
  and some non-characters `holo`.
- **22 of the 26** premium rows have **no `normal` sibling** at the same `(setCode,
  number)` — those cards currently exist *only* as a premium entry.
- The remaining **4** premium rows are **typo-twins**: the same card entered twice under
  slightly different spellings, colliding on `(setCode, number)` but getting distinct
  slug ids because the id is derived from the name:

  | Set # | normal-row name | premium-row name |
  |---|---|---|
  | QC #6 | Gaze **into** the Mirror | Gaze **Into** the Mirror (foil) |
  | QC #7 | Gold**en** Cauldron | Gold Cauldron (foil) |
  | DA #27 | The Leak**ey** Cauldron | The Leak**y** Cauldron (foil) |
  | AAH #3 | Crabbe **&** Goyle | Crabbe **and** Goyle (holo) |

This spec corrects the model at the **source (the card-data build pipeline)** so `dist/`
is already clean, then threads the array through the DB, search, ingest, and web layers.

## Goal

Replace the scalar `cards.finish` with `cards.finishes: string[]`, an **availability
array derived from a single rule**, and eliminate the duplicate premium rows the old
model created — without losing the ability to own a card in each of its finishes.

## The rule (single source of truth)

`finishes` is computed from `rarity` + `types`:

| Card | `finishes` |
|---|---|
| `Rare` + Character | `["normal", "holo"]` |
| `Rare` + non-Character | `["normal", "foil"]` |
| everything else (Common / Uncommon / Lesson, or any non-Rare) | `["normal"]` |

- Array order follows the `finishes` vocabulary `sortOrder` (`normal` first).
- The rule is **authoritative**: it overwrites the existing (unreliable) premium
  assignments. **No overrides file** for now (YAGNI). If a genuine real-world exception
  surfaces later, add a small `finish_overrides.json` keyed by card id — out of scope
  here.
- Under this rule, of **333 Rare** cards: **108** rare characters gain `holo`, **225**
  rare non-characters gain `foil`; the other **702** cards are `["normal"]`.

## Approach — fix at import, thread through the stack

### 1. card-data pipeline (source of truth)

Files: `card-data/transform_hpjson.py`, `card-data/build_dataset.py`,
`card-data/card.schema.json`.

- **`transform_hpjson.py`**
  - Keep `split_rarity` / `RARITY_FINISH` **only** to recover a base `rarity` for
    premium-sourced rows (premium-only cards must still land as `Rare`).
  - Stop emitting a scalar `"finish"`. Add `derive_finishes(rarity, types)` implementing
    the rule above and emit `"finishes": [...]` (line ~123, replacing the `"finish"`
    field).
  - Tag each row transformed from a premium rarity label with a **transient provenance
    flag** (e.g. `_premiumSource: True`) used only for dedup in step below; strip it
    before writing.

- **`build_dataset.py`**
  - Add a **dedup pass** (in/around `build_cards`, before id-suffixing): group rows by
    `(setCode, number)`. If a group contains **both** a `_premiumSource` row **and** a
    non-premium row, **drop the premium-sourced row(s)**. This removes exactly the **4**
    typo-twins; the surviving normal row already carries the premium via its derived
    `finishes`.
    - The **22** premium-only rows have no non-premium sibling → **kept** as ordinary
      `Rare` cards with derived `finishes`.
    - The **10** `(normal, normal)` same-number rows contain no premium-sourced row →
      **untouched** (not finish-related; out of scope).
  - Strip the transient `_premiumSource` flag before writing.
  - Update `slim` (line ~106) and `search_index` (line ~114) to carry `finishes` instead
    of `finish`.

- **`card.schema.json`**: replace the `finish` enum property with
  `finishes: { type: "array", items: { enum: ["normal","foil","holo"] }, minItems: 1 }`
  (every card includes `"normal"`). Update `build_dataset.py`'s `validate` expectations
  accordingly.

- **Result:** `dist/` drops from **1,035 → 1,031** cards, each with a `finishes[]` array.
  Rebuild via `python3 build_dataset.py` (0 schema errors expected).

### 2. `@revelio/db` — schema + migration

Files: `app/db/src/schema.ts`, generated `app/db/drizzle/NNNN_*.sql`,
`app/db/src/queries.ts`.

- `schema.ts`: change `cards.finish` (`text`, FK → `finishes.code`) to
  `cards.finishes` (`text[]`, not null, default `['normal']`). Keep the `finishes`
  vocabulary table (`code`, `sortOrder`) for ordering/labels (array elements reference it
  by convention; no array FK).
- Run `npm run generate` from `app/db`, review + commit the migration **with** the schema
  edit (append-only; `npm run verify` is CI-enforced).
- `queries.ts`: select `cards.finishes` into the card DTOs (currently `card.finish` at
  ~184 and ~279).

### 3. `@revelio/core`

File: `app/core/src/domain.ts`.

- `CardDTO.finish: string | null` → `finishes: string[]`. `CardDetailDTO` inherits it.
- `attributes.ts` `FINISHES` vocabulary (`normal` / `foil` / `holo`, with `sortOrder`)
  stays as-is — it now describes possible array elements.

### 4. `@revelio/search`

Files: `app/search/src/documents.ts`, `app/search/src/search.ts`.

- `SearchDocument.finish` → `finishes: string[]`; keep it in `filterableAttributes`
  (Meilisearch treats array members as facet values → "contains" semantics for free).
- `buildFilter` (`CardFilters.finishes`): a `finishes` filter matches cards whose array
  **contains** any requested value (same OR-within-facet shape as today).
- **Reindex required** after ingest (facet/document shape changed).

### 5. `@revelio/ingest`

File: `app/ingest/src/build-documents.ts` (and any `finish` reference in load/index
steps).

- Emit `finishes` on the search document; seed `cards.finishes` from the bundle.
- Re-running ingest reseeds cards from the clean `dist/`, so the 4 dropped ids simply no
  longer exist — **no row-deletion DB migration needed.**
- **Deck FK note:** `deckCards.cardId` → `cards.id`. If a deployed DB has a deck
  referencing one of the 4 dropped premium ids, reseeding would orphan/deny that FK. In
  practice these are obscure premium duplicates unlikely to be in any deck; the ingest
  card-sync step should log/clean stale card ids, and if any deck row references a dropped
  id it is remapped to the surviving normal sibling (same `setCode`+`number`). Verify
  during ingest; do not build elaborate machinery for it.

### 6. `@revelio/web`

- **FilterSheet** (`app/web/src/components/filter-sheet.tsx`) + `search-params.ts`: the
  finishes checkbox group now filters "cards whose `finishes` contains X" — the UI is
  unchanged; only the underlying facet field name changes (`finish` → `finishes`).
- **Card detail** (`app/web/src/components/card-detail.tsx` via `card/[id]/page.tsx`):
  render the available finishes (e.g. "Available finishes: Normal, Holo") instead of a
  single finish value.
- Grep for any other `finish` reads and update to the array.

## Out of scope

- The **Collection page** feature (its own spec): `userCards(userId, cardId, finish,
  quantity)`, per-finish quantities, the finish selector, sets overview, gray-unowned,
  filters. This spec only makes the finish model correct so the collection can sit on it.
- A `finish_overrides.json` curation mechanism (add only if a real exception appears).

### Known follow-up — normal/normal same-number duplicates (tracked, separate spec)

Independent of finishes, **10** `(setCode, number)` pairs have two `normal` rows. They
are **not** finish-related and need human judgment, so they get their own small
data-cleanup spec (before or during the Collection page). Two categories:

- **8 typo-twins** — same card, misspelled; safe to merge on the correct spelling:
  AAH #59 (Flavour/Flavor), AAH #65 (Manegro/Manegrow), GOF #19 (Perfurmed/Perfumed),
  GOF #37 (Fertiliser/Fertilizer), GOF #99 (Thickness on/of), GOF #119
  (Divination/Divinatino), POA #71 (Lumos!/Lumos), POA #72 (Substitute/Subsitute).
- **2 genuine number collisions** — two *different* cards sharing a number because one has
  the **wrong number**; fix by correcting the number (sourced from the real set
  checklist), **not** by merging:
  - EOTP #84 — "Sirius's Letter" vs "Wizard's Desk". Per owner: "Wizard's Desk" should be
    **#85** (example — verify against the checklist).
  - GOF #56 — "Ron's Jealousy" vs "Skeeter's Scoop" (correct number TBD from checklist).

## Testing

- **Pipeline unit tests** (`card-data`): `derive_finishes` returns the right array for
  each of the 3 rule cases; the dedup pass drops exactly the 4 typo-twins and keeps the
  22 premium-only rows; final card count is 1,031.
- **Schema validation**: `build_dataset.py` validates `dist/` against
  `card.schema.json` with 0 errors; every card's `finishes` is non-empty and contains
  `"normal"`.
- **DB**: `npm run verify -w @revelio/db` passes (schema ↔ migration in sync).
- **Search**: a `finishes` contains-facet filter returns rare characters for `holo` and
  rare non-characters for `foil`; non-rares excluded.
- **core**: `FINISHES` vocabulary test still asserts `normal` / `foil` / `holo`.
- **web**: FilterSheet + search-params tests updated to the `finishes` field; card detail
  renders the available-finishes list.

## Rollout

1. Land pipeline + schema/migration + core/search/ingest/web together (finish is threaded
   end-to-end; a partial change won't typecheck).
2. Rebuild `dist/`, run migration, re-ingest, **reindex Meilisearch**.
3. Then start the Collection page spec on the clean foundation.

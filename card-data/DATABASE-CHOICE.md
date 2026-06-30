# revelio.cards – Database Choice

## Requirements

- ~1,035 cards now, a few thousand at most (small dataset).
- Effectively **read-only** (cards change rarely; updates via rebuild).
- Nested/relational shape: cards ↔ sets, per-language localizations, arrays
  (types, subTypes, artist), nested objects (stats, adventure, match, rulings, provides).
- **Multilingual full-text search** (English + German stemming, more languages later).
- **Faceted filtering**: set, type, lesson, rarity, cost, legality.
- Typo tolerance on names is desirable (Scryfall-like UX).

## Recommendation: PostgreSQL (primary)

One system covers relational + document + search:

- **Relational core** maps 1:1 to our build output:
  - `sets(code PK, name, release_date, is_official, card_count, symbol)`
  - `cards(id PK, set_code FK, number, types text[], sub_types text[], lesson,
    cost int, rarity, artist text[], orientation, legality, draft_value,
    health int, damage_per_turn int, provides jsonb, rulings jsonb)`
  - `card_localizations(card_id FK, lang, name, status, source, text, flavor_text,
    adventure jsonb, match jsonb, image_file, image_url,
    PRIMARY KEY(card_id, lang), search tsvector)`
- **Full-text search per language**: a `tsvector` column using the matching config
  (`to_tsvector('german', …)` / `'english'`), GIN-indexed.
- **Typo/fuzzy name search**: `pg_trgm` extension + GIN trigram index on `name`.
- **Facets/arrays**: GIN index on `types`/`sub_types` for fast `&&`/`@>` filters.
- **JSONB** for the irregular bits (rulings, provides, adventure/match) without
  extra tables.

Why not the others (for the primary store):
- **SQLite + FTS5** – genuinely sufficient given the tiny, read-only dataset; great
  for the prototype and even a static/edge deploy. Pick this if we want zero ops.
  Weaker multi-language stemming and no trigram by default.
- **MongoDB** – the document shape matches our JSON nicely, but faceting + multi-
  language FTS are stronger/cheaper in Postgres unless we adopt Atlas Search.
- **Meilisearch / Typesense** – excellent instant-search + typo tolerance + facets,
  but they are a **search layer**, not the source of truth. Add later on top of
  Postgres if we want best-in-class search UX.

## Suggested path

1. **Prototype**: load `dist/*.json` directly in the client, or SQLite + FTS5. No
   server needed.
2. **Production**: PostgreSQL with the schema above; the build's `dist/` files load
   straight into it (one row per card, one per localization).
3. **Optional later**: mirror into Meilisearch/Typesense for instant search.

The build output already matches this model: `dist/cards.json` → `cards` +
`card_localizations`, `dist/sets.json` → `sets`, and `dist/search-index.<lang>.json`
mirrors what a `tsvector`/search engine would index.

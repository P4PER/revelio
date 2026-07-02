# revelio.cards – Web Stack Design

**Date:** 2026-06-30
**Status:** Architecture approved, ready for implementation planning

## Goal

A search-centric card database website for the Harry Potter TCG (Scryfall-style), built
on the finished data artifacts in `card-data/dist/`. Full stack (FE+BE+DB), fully
Docker-hostable — both as one orchestrated `docker-compose` stack and as individually
deployable, env-configured containers.

## Constraints (from the existing project)

- **~1,035 cards, 14 sets** as the initial dataset, produced by the Python pipeline
  (`build_dataset.py` → `card-data/dist/*.json`, `card-data/assets/`). The pipeline is a
  **one-time seed**: after import, **PostgreSQL is the source of truth** and sets/cards/
  localizations can be created and edited in-app.
- Multilingual (en = official, de = machine), more languages planned.
- UI labels already exist in `card-data/i18n/labels.<lang>.json`.
- Images: ~1.3 GB of PNGs (cards + thumbnails) in `card-data/assets/`.
- Branding: Poppins font, Reveal-Glow (gold on indigo/midnight), assets in `logos/`.
- The data pipeline is **Python** and stays unchanged/separate.

## Architecture decisions

| Layer | Choice | Rationale |
|---|---|---|
| Frontend + Backend | **Next.js** (App Router, TypeScript) | SSR for SEO, Server Components + API routes in one; a single language for the whole web app |
| UI | **Tailwind CSS + shadcn/ui** | Fully customizable to Reveal-Glow/Poppins, no templated look, components copied into the repo |
| Source-of-truth DB | **PostgreSQL 16** | The authoritative store: seeded once from the pipeline, then owns all in-app creates/edits and later user data |
| Search engine | **Meilisearch** | Instant search, typo tolerance, facets — Scryfall UX out of the box |
| Image store | **MinIO** (S3-compatible) | Self-hosted object storage, signed URLs, open to later uploads |
| ORM | **Drizzle** | TypeScript-first, lightweight, fits Postgres |
| Shared code | **`@revelio/core`** (TS + Zod) | Driver-free package: attribute config (codes, lesson colors, sort order), Zod validation schemas, shared domain DTO types — consumed by `db`, `ingest`, `web` |
| i18n | **next-intl** | Fed from `card-data/i18n/labels.<lang>.json` |
| Orchestration | **Docker Compose** + per-service Dockerfiles | Both: one stack OR individually env-configured and deployable |

## Folder structure

New top-level folder **`app/`** next to `card-data/` and `logos/`:

```
app/
  core/                 # @revelio/core — shared types, vocab config, Zod (no DB driver)
  db/                   # @revelio/db — Drizzle schema + migrations + client
  ingest/               # @revelio/ingest — one-time seed job
    Dockerfile
  web/                  # Next.js (FE+BE)
    Dockerfile
  docker-compose.yml
  .env.example
```

## Data model: normalized attributes

Because Postgres is now the editable source of truth (no upstream validation on in-app
creates), the controlled attributes are **reference tables with FKs**, not free text:

- **Reference tables** — `types`, `sub_types`, `lessons`, `rarities`, `finishes`,
  `legalities`. Each is `code` PK + `sort_order` (+ `lessons.color` for the facet
  accents). **`code` is a normalized snake_case slug** (e.g. `care_of_magical_creatures`,
  `character`, `normal`) produced by a shared `slugify()` in `@revelio/core`; the seed
  slugifies both the reference codes and the card FK values so they match, and the web
  slugifies the i18n label keys with the same function to look up display labels. Adding
  a value is an `INSERT`, not a migration; `sub_types` self-extends as users add cards.
- **`cards`** references `lessons` / `rarities` / `finishes` / `legalities` via nullable
  FKs. The array-valued `types` and `sub_types` become **junction tables**
  (`card_types`, `card_sub_types`).
- **Display labels are DB-backed and editable.** Each reference table has a `labels`
  jsonb column (`{"en":"Charms","de":"Zauberkunst"}`), seeded from
  `card-data/i18n/labels.<lang>.json` (the file keys are slugified to match the codes),
  and editable in-app like card text — so user-added attribute values can be labelled too.
  The `AttributeTermDTO.label` resolves `labels[lang] ?? code`. The label files cover
  `types`/`lessons`/`rarities`/`finishes`; `sub_types` and `legalities` have no file and
  start with empty labels (web falls back to the code / its own next-intl messages).
- The canonical value list is **derived from the dist data** at seed time (nothing
  missed); **metadata** (lesson colors, sort order) comes from a **curated config in
  `@revelio/core`**, which the web app also reads for facet-accent colors. Values seen in
  the data but absent from the config are still inserted (null color / default order).
- Validation of vocab on in-app writes uses the **Zod schemas in `@revelio/core`** (same
  source as the config), so `db`, `ingest`, and `web` agree on what is valid.

## Search (Meilisearch)

Search is a driver-free package `@revelio/search` plus an indexer in `@revelio/ingest`:

- **`@revelio/search`** (no DB driver, so the web can import it freely): a Meili client
  factory (env `MEILI_HOST`, `MEILI_MASTER_KEY`), the per-language index **settings**, the
  search-document type, and a typed **`searchCards(lang, query, { filters, sort, page })`**
  the web calls.
- **Indexer** (in `@revelio/ingest`, which has `@revelio/db`): reads cards + localizations
  + attribute labels from **Postgres** (the source of truth), builds one document set per
  language (resolving that language's localization, falling back to `defaultLanguage`),
  applies the index settings, and `addDocuments`. The same function re-indexes after
  in-app edits (Plan 4).

**One index per language** present in `card_localizations` (`cards-en`, `cards-de`, …).
Each document:
- **searchable:** `name`, `text`, `flavorText`
- **filterable (facets):** `setCode`, `types`, `subTypes`, `lesson`, `rarity`, `finish`,
  `legality`, `cost`, `isOfficial`
- **sortable:** `number`, `name`, `cost`
- **display-only:** `id`, `imageFile`, set name, lesson `color` — enough to render a
  result card without a second query

Index settings: typo tolerance on, ranking tuned for name-first relevance, optional
synonyms. The initial index build runs inside the `ingest` one-shot (after the Postgres
load). In prod Meili is a **standalone image or pre-deployed** (dev: a compose service);
the seed uses the master key, and the web queries with a **search-only key** (Plan 4/5).

## Image hosting (MinIO)

Card images are served from MinIO (S3-compatible), **public-read**. Two pieces:

- **`@revelio/core`** (driver-free) adds key/URL helpers used by both the uploader and the
  web: `imageKey(id)` → `cards/${id}.png`, `thumbKey(id)` → `cards/thumb/${id}.jpg`,
  `symbolKey(code)` → `symbols/${code}.png`, `imageUrl(base, key)` → `${base}/${key}`.
- **`@revelio/ingest`** adds an uploader (`@aws-sdk/client-s3`): ensures the bucket exists
  and sets a **public-read** policy, then uploads `card-data/assets/` **diffed** (skips
  objects already present via `headObject`) with correct content-types (`image/png`,
  `image/jpeg`). Uploaded: full cards (`cards/<id>.png`), thumbnails
  (`cards/thumb/<id>.jpg`), and set symbols (`symbols/<code>.png`).

**Seed flow:** the `ingest` one-shot, after Postgres + Meili, uploads images when
`S3_ENDPOINT` is set (skipped otherwise). Reads `ASSETS_DIR` (dev: bind-mount
`../card-data/assets`; prod: baked into the `revelio-data` image).

**Web (Plan 4):** builds public URLs `imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL, imageKey(id))`
for Next `<Image>` — no S3 client or signing in the web.

**Env** (no hardcoded hosts): `S3_ENDPOINT`, `S3_BUCKET` (default `card-images`),
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` (default `us-east-1`),
`S3_FORCE_PATH_STYLE=true` (MinIO), `NEXT_PUBLIC_IMAGE_BASE_URL` (web). S3-compatible, so
MinIO now, real S3 / Cloudflare R2 later by changing env.

## Web app (Next.js) — read-only (Plan 4a)

The web is `app/web/` (Next.js App Router, TypeScript, Tailwind + shadcn/ui, Poppins),
depending on `@revelio/db` (server-side SSR queries), `@revelio/search` (server-side
search) and `@revelio/core` (image URLs, lesson colors, DTO types).

- **Search is server-side:** a Next route handler / server action calls `searchCards`
  (Meili) on the server; the search page is a client component that fetches it (debounced)
  as the user types. `MEILI_HOST`/`MEILI_SEARCH_KEY` stay server-only (no `NEXT_PUBLIC`
  Meili, no CORS/browser key).
- **Detail & set pages are SSR** via `@revelio/db` (Drizzle) in server components — full
  card data (text, flavor, rulings, adventure/match, illustrator, status badge) straight
  from Postgres (SEO-friendly).
- **i18n = next-intl, path-based, as-needed** (English default unprefixed at `/`, German at `/de/…`), via the locale-aware `Link` (`createNavigation`), with a translation-status badge
  and fallback to `defaultLanguage`. Web UI strings live in `app/web/messages/{en,de}.json`;
  attribute labels (type/lesson/rarity names) come from `card-data/i18n/labels.<lang>.json`
  (bundled at build).
- **Images** load directly from the **public MinIO** URL via
  `imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL, thumbKey(id) | imageKey(id))`; `next.config`
  `remotePatterns` allows the image host.
- **Testing:** Vitest + @testing-library/react (components); integration tests for the
  server data functions (search route, card loader) against real Postgres/Meili;
  **Playwright** e2e for key flows (search → results → detail). Each slice ends with a
  dev-server run + verification.
- **Env (web):** `DATABASE_URL`, `MEILI_HOST`, `MEILI_SEARCH_KEY` (server-only),
  `NEXT_PUBLIC_IMAGE_BASE_URL` (browser).

**Sliced into:** 4a-1 shell (scaffold + theme + i18n + layout + disclaimer), 4a-2 search
(box + facet chips + thumbnail grid), 4a-3 detail + sets (SSR). In-app authoring + auth is
a separate **Plan 4b**.

## Search page (Plan 4a-2)

The `/search` page (localized `/search`, `/de/search`) is **URL-driven SSR**, hybrid model
(a few quick chips + sort on the results page; full filtering is Advanced Search, deferred):

- A **Server Component** reads `searchParams` (`q`, `type`, `lesson`, `official`, `sort`,
  `page`), calls `searchCards` server-side (Meili key stays server-only), and renders the
  results grid + pagination.
- **Client components** (only where interactive) update the URL via next-intl's `useRouter`
  (no manual hrefs): the **search box** (debounced → `q`, `router.replace`), **quick chips**
  (Type, Lesson [with accent colors], Official/Fan toggle → URL params), and a **sort**
  dropdown (Relevance / Name / Number / Cost — the index's sortable attributes).
- Chip options come from `@revelio/core` (`TYPES`, `LESSONS`) with labels from the i18n
  attribute labels (`card-data/i18n/labels.<lang>.json`, bundled into the web); no
  facet-count work needed. Lesson chip colors from `@revelio/core` `LESSONS` (inline
  style, not dynamic Tailwind classes).
- **Grid** of thumbnails via `next/image` (`imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL,
  thumbKey(id))`; `next.config` `remotePatterns` for the image host) + card name.
- **Page-based** pagination (`?page=N`, prev/next) from `searchCards`'s `page`/`total`.
- The **home hero** gets a search box → `/search?q=…`.
- **No backend change** — the existing `searchCards` already supports these filters
  (`buildFilter`) and sort. 4a-2 is web-only.
- **Deferred → Advanced Search** (own slice): rarity, set, cost range, legality, sub-types,
  finish, and set/rarity sort (the last needs added Meili sortable attributes).

## Card detail + set overview (Plan 4a-3)

Three SSR read pages, powered by **Postgres via `@revelio/db`** (the search index
lacks rulings, artist, health/damage, translation status and both-language text):

- **Data layer:** add a read-query layer to `@revelio/db` (`src/queries.ts`):
  `getCardById(db, id)` (card + both localizations + types + subTypes + rulings +
  set), `listSets(db)`, `getSetByCode(db, code)`. Convert `@revelio/db` to
  extensionless relative imports (Turbopack, as with core/search). The web gets a
  **server-only** db client (`src/lib/db.ts`, `getDb()` from `DATABASE_URL`,
  `import 'server-only'`).
- **`/card/[id]`** (server component): full card image (`imageKey`), name, set +
  collector number, rarity/finish, lesson (accent color), types/subTypes, cost,
  health/damage/orientation (when present), rules text, flavor, artist, legality,
  rulings list. Localized to the current locale (name/text/flavor from
  `cardLocalizations[locale]`, falling back to `defaultLanguage`) with a
  **translation-status badge** when the localization is machine/missing (`status`).
  `generateMetadata`: title = card name, canonical/hreflang, `og:image` = card
  image. Unknown id → `notFound()`.
- **`/sets`** (server component): grid of all sets (symbol, name, card count,
  release date, Official/Fan badge) → each links to `/sets/[code]`.
- **`/sets/[code]`** (server component): set header from Postgres (`getSetByCode`)
  + a grid of that set's cards via `searchCards({ setCode }, sort: number, page)`
  (reuses `CardGrid` + `Pagination`). Unknown code → `notFound()`.
- **Wiring:** `CardTile` wrapped in a `Link` → `/card/[id]` (search results + set
  pages link to detail).
- **Env:** adds `DATABASE_URL` (web's first Postgres use) alongside `MEILI_*`
  (set-page grid) and `NEXT_PUBLIC_IMAGE_BASE_URL`.
- **Deferred:** `adventure`/`match` jsonb, `provides`, `draftValue` (niche fields).

## shadcn UI adoption / retrofit (Plan 4a-4)

We initialized shadcn in 4a-1 but then hand-rolled all UI; only `badge.tsx` +
`button.tsx` exist and neither is used. This slice adopts shadcn properly across
the app (consistency + accessibility) BEFORE Advanced Search builds on it.

- **Foundation — switch to the standard Radix `new-york` style** (from the CLI
  default `base-nova`/@base-ui). Do NOT run a full `init` (it would clobber the
  Reveal-Glow `globals.css`): set `components.json` `style: "new-york"`, swap
  `@base-ui/react` → `@radix-ui/*`, and re-pull primitives
  (`shadcn add button input select badge checkbox label`). new-york components
  reference the same CSS variables (`--background`/`--primary`/…) we already set,
  so the Reveal-Glow palette + lesson `@theme` tokens are preserved.
- **Retrofit map (behavior unchanged, primitives swapped):** `SearchBox`/
  `HomeSearch` `<input>` → **Input**; `SortSelect` `<select>` → **Select**;
  submit / pagination prev-next / header links → **Button** (`asChild` + next-intl
  `Link`); chips (type, sub-type, lesson [inline color], rarity, cost,
  translation badge, quick filters) → **Badge**. Layout containers (grids,
  tile `figure`, detail `dl`) stay Tailwind — no meaningful primitive.
- **Test impact:** Radix `Select`/`Checkbox` change the DOM (not native
  `<select>`/`<input type=checkbox>`); affected component tests (esp.
  `SortSelect`) are rewritten to the Radix interaction (`getByRole('combobox')`
  + open/select). Behavior (URL updates) is unchanged; Input/Button/Badge keep
  roles/labels so those tests stay green.
- **No behavior/URL/feature change** — purely presentational + a11y (focus, ARIA,
  keyboard). Scope is bounded to controls + badges, not every layout div. The
  Reveal-Glow theme-token test still passes.

Then **Advanced Search (Plan 4a-5)** builds the filter drawer (`Sheet`) + active-
filter chips (`Badge`) + cost-range (`Input`/`Slider`) on this shadcn foundation.

## Services

```
web         → Next.js (FE+BE), port 3000          [own Dockerfile]
ingest      → dist/ → Postgres → Meilisearch → MinIO   [own Dockerfile]
postgres    → PostgreSQL 16                        [official image]
meilisearch → search, port 7700                    [official image]
minio       → image object store, port 9000/9001   [official image]
```

The **`ingest` job** is the bridge to the Python pipeline: it reads
`card-data/dist/*.json` + `card-data/assets/` and populates Postgres (cards, sets,
localizations), builds the per-language Meilisearch index, and uploads the images to
MinIO. The data build (Python) and the web stack (TypeScript) stay cleanly separated.

## Data flow

```
Python build_dataset.py  →  card-data/dist/*.json + assets/cards/*.png
                                      │
                              [ ingest job ]
                          ┌───────────┼─────────────┐
                          ▼           ▼             ▼
                     PostgreSQL   Meilisearch     MinIO
                   (cards, sets,  (search index   (images)
                    localizations, per language)
                    user data)
                          │           │             │
                          └──────── Next.js ────────┘
                                      │
                                   Browser
```

- **Search** (typing, facet filters) → Next.js → Meilisearch → instant.
- **Detail page** for a card → Next.js Server Component → Postgres → SSR (SEO).
- **Images** → Next.js `<Image>` optimizes in front, source is MinIO.

## Deployment model

Two equivalent paths, both fed from the same environment variables:

1. **One stack:** `docker-compose up` starts all services on the same network; defaults
   point at the internal hostnames (`@postgres`, `@meilisearch`, `@minio`).
2. **Individually:** each owned service (`web`, `ingest`) has a standalone Dockerfile and
   is configured **exclusively via env variables** — no hardcoded hosts. So `web` can run
   on host A and point at external Postgres/Meilisearch/MinIO via env.

**`.env.example`** documents all variables centrally:

```
DATABASE_URL=postgres://user:pass@postgres:5432/revelio
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=...
S3_ENDPOINT=http://minio:9000
S3_BUCKET=card-images
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
NEXT_PUBLIC_IMAGE_BASE_URL=...
```

## Visual design direction

Grounded in the Reveal-Glow brand (`logos/BRAND-GUIDE.md`), borrowing from the HP TCG
card aesthetic, kept modern. **Dark-first**: the Revelio concept is gold light revealing
the hidden dark, so a midnight/indigo canvas with gold as the revealing accent — which
also makes the colorful card art pop.

**Palette**
- Canvas: midnight `#13122A`, badge `#181634`, ink `#1C1838` surfaces
- Accent (gold): `#E8B23A` primary, `#F6D58B` glow, `#C8881E` pressed
- Indigo: `#3B3194` / `#6E66C9` for secondary UI, links, structure
- Parchment `#FBF3DC` for text-heavy panels (rules/flavor boxes)
- Optional later: a light "parchment" theme toggle

**TCG cues, applied as accents (not skeuomorphism)**
- Gold hairline borders + subtle corner flourishes on cards/panels (thin, no heavy textures)
- A faint gold "reveal" glow on hover/focus (the charm motif as a micro-interaction)
- Lesson colors as filter/type accents — the magic lessons (Creatures, Charms, Potions,
  Transfiguration, Quidditch) color-code type chips/facets, echoing the cards
- Parchment-toned panels only for rules/flavor text; everything else stays clean dark

**Modern guardrails**
- Poppins throughout (geometric sans), SemiBold headings to match the wordmark
- Clean responsive grid, generous whitespace, Scryfall-style card grid, rounded corners,
  soft shadows, gold focus rings
- Ornament is accent only (hairlines, glow, one flourish) — never full filigree/parchment
  textures everywhere
- Optional: a refined display serif for flavor-text/quotes only, as a single TCG accent

**Confirmed decisions:** dark-first default (light/parchment theme optional, later);
lesson colors used for type/facet accents.

## Data ingestion & distribution

The Python pipeline produces a versioned **data artifact** — `card-data/dist/*.json`
(~5 MB) and `card-data/assets/` (~1.3 GB images), both git-ignored. The `ingest` job
loads it into the running stack. **Deployment reality:** production does **not** run
docker-compose. Postgres/Meili/MinIO are standalone docker images or pre-deployed
infra, and each service runs as a **standalone `docker run` image configured entirely
via env vars** (no hardcoded hosts, no files copied onto the host, no compose).
docker-compose is a **dev-only** convenience. The design below honors that.

### Source-of-truth model

PostgreSQL is authoritative. The Python pipeline is a **one-time additive seed**, not a
recurring overwrite. The ingest job therefore imports **non-destructively**: it inserts
only rows that don't already exist (`INSERT ... ON CONFLICT DO NOTHING`) and **never
updates or deletes** existing rows. Consequences:

- Re-running ingest (e.g. a redeploy) is a safe no-op for existing data; a later pipeline
  run can add *new* official cards without clobbering anything created or edited in-app.
- Every table carries editability metadata: `created_at`, `updated_at`, and `origin`
  (`import` for pipeline-seeded rows, `user` for in-app creates). `card_localizations`
  additionally keeps its own `source` (translation-text provenance) and `status`
  (`official` / `machine` / `community` / `unknown`).
- The `pgdata` volume now holds **non-regenerable** content → it must be **backed up**.
- Meilisearch and MinIO are **derived from Postgres** and kept in sync on writes (in-app
  edits reindex/upload), not rebuilt from `dist/`. The initial seed primes them from the
  same import pass; later plans wire write-time sync.

### The ingest job (TypeScript, `app/ingest/`)

A **one-shot compose service**: on `up` it starts after the stores are healthy, runs the
additive import, and exits. Reads its data from `DATA_DIR` (default `/data`).

```
1. migrate    → drizzle-kit applies schema to Postgres (tables + indexes)
2. → Postgres → read sets.json + cards.json
                 INSERT ... ON CONFLICT DO NOTHING for sets, cards, card_localizations
                 (source = 'import'; existing rows untouched)
3. → Meili    → per language: build docs from cards.<lang>.json
                 + fold fields from search-index.<lang>.json
                 set index settings (searchable/filterable/sortable, typo, synonyms)
                 addDocuments (by primary key `id`)
4. → MinIO    → upload assets/cards/<id>.png (+ thumbnails), diffed; named by card id
```

File → target mapping:

| Source | Target |
|---|---|
| `dist/sets.json` | Postgres `sets` |
| `dist/cards.json` | Postgres `cards` + `card_localizations` |
| `dist/cards.<lang>.json` | Meilisearch documents per language |
| `dist/search-index.<lang>.json` | fold fields merged into Meili docs |
| `assets/cards/<id>.png` (+ `thumb/`) | MinIO (keyed by card **id**, not `image.file`) |

Design choices: Postgres is the single source of truth. For the **initial seed** the job
reads `dist/` directly (faster than a Postgres round-trip) to prime all three stores in
one pass; thereafter Meilisearch and MinIO are kept in sync from **Postgres** on in-app
writes. One Meili index per language (`cards-en`, `cards-de`) for correct per-language
stemming/typo behavior.

### Distribution: dev vs production

- **Local dev** (`docker-compose.override.yml`): builds `ingest`/`web` from source and
  bind-mounts `../card-data/dist` (+ `assets/`) read-only; `DATA_DIR` points at the
  mount. Iterate without baking images.
- **Production** (CI + container registry, standalone images / pre-deployed infra): the
  data is **baked into the `ingest` image** at CI build time, split from loader code so
  the 1.3 GB layer isn't rebuilt on every code change:
  - **`revelio-data`** image — contains *only* `dist/` + `assets/`; built **only when the
    Python pipeline reproduces new data** (rare), versioned independently
    (e.g. `revelio-data:2026-06-30`).
  - **`revelio-ingest`** image — small loader; pulls data in at build via
    `COPY --from=ghcr.io/<org>/revelio-data:<tag> /data /data`. The server only ever
    pulls this final image; nothing is mounted in production.
  - CI: data change → build & push `revelio-data` then `revelio-ingest`; code change →
    build & push `revelio-ingest` + `revelio-web` (fast, small).
  - Deploy: pull the images and run each as a standalone container against the
    (standalone or pre-deployed) Postgres/Meili/MinIO, via env vars. Order: ensure the
    stores are up → run the `ingest` one-shot (`docker run … revelio-ingest`, which
    migrates + additively seeds, then exits) → run `revelio-web`. Migrations alone can be
    run the same way with a command override (`… npx tsx db/src/migrate-cli.ts`).
    Re-running `ingest` is a near-instant additive no-op (existing rows untouched). The
    Postgres data is authoritative and **must be backed up**. Rollback of *code* = pin an
    older image tag (data lives in the DB, not the image).

## Scope: first cut (MVP)

**In:**
- Full-text search + facet filters (set, type, lesson, rarity, cost, legality) via Meilisearch.
- Card detail pages (SSR, SEO) with image, rules text, set, rarity, number, illustrator.
- Set/expansion overview.
- Multilingual (en/de) with a status badge + fallback to `defaultLanguage`.
- Branding integrated (logo, favicon, Poppins, Reveal-Glow colors).
- "Unofficial fan project" disclaimer (see the legal note in PROJECT.md).

**Deliberately NOT in the first cut (YAGNI):**
- User accounts, collection/wishlist, deck builder, price/market data.
  Prepared via Postgres as the source of truth; auth later, e.g. Auth.js.
- **In-app authoring** — create/edit sets, cards, and localizations (incl. community
  translations) through the app. The data model is built for it from day one (Postgres
  authoritative, additive seed, `origin`/`source`/`status`/timestamps, write-time
  Meili/MinIO sync), but the write API/UI and the auth that gates it are a later plan.

## Open details for the planning phase

- Exact Postgres schema (DDL) derived from `DATABASE-CHOICE.md` + Drizzle migrations.
- Meilisearch index config (searchable/filterable/sortable attributes, synonyms,
  ranking rules) per language.
- MinIO bucket policy (public-read vs. signed URLs) + Next `<Image>` remote pattern.
- CI pipeline specifics (registry, image tags/triggers for `revelio-data` vs code images).

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
| i18n | **next-intl** | Fed from `card-data/i18n/labels.<lang>.json` |
| Orchestration | **Docker Compose** + per-service Dockerfiles | Both: one stack OR individually env-configured and deployable |

## Folder structure

New top-level folder **`app/`** next to `card-data/` and `logos/`:

```
app/
  web/                  # Next.js (FE+BE)
    Dockerfile
  ingest/               # one-shot data load job
    Dockerfile
  docker-compose.yml
  .env.example
```

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
loads it into the running stack. **Server constraint:** the production server can only
*pull images* and *run `docker compose up`* — no manual commands, no building on the
server, no files copied onto it. The design below honors that.

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
- **Production** (CI + container registry, pull-only server): the data is **baked into
  the `ingest` image** at CI build time, split from loader code so the 1.3 GB layer isn't
  rebuilt on every code change:
  - **`revelio-data`** image — contains *only* `dist/` + `assets/`; built **only when the
    Python pipeline reproduces new data** (rare), versioned independently
    (e.g. `revelio-data:2026-06-30`).
  - **`revelio-ingest`** image — small loader; pulls data in at build via
    `COPY --from=ghcr.io/<org>/revelio-data:<tag> /data /data`. The server only ever
    pulls this final image; nothing is mounted in production.
  - CI: data change → build & push `revelio-data` then `revelio-ingest`; code change →
    build & push `revelio-ingest` + `revelio-web` (fast, small).
  - Server: `docker compose pull && docker compose up -d`. `ingest` runs as a gated
    one-shot (`depends_on` stores `service_healthy`, `restart: "no"`); `web` waits via
    `depends_on: ingest: condition: service_completed_successfully`. Persistent volumes
    (`pgdata`, `meili`, `minio`) mean the heavy seed runs once; later `up`s re-run the
    additive `ingest` as a near-instant no-op (existing rows untouched). The `pgdata`
    volume is authoritative and **must be backed up**. Rollback of *code* = pin an older
    image tag (data lives in the volume, not the image).

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

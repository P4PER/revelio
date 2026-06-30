# revelio.cards – Web Stack Design

**Date:** 2026-06-30
**Status:** Architecture approved, ready for implementation planning

## Goal

A search-centric card database website for the Harry Potter TCG (Scryfall-style), built
on the finished data artifacts in `card-data/dist/`. Full stack (FE+BE+DB), fully
Docker-hostable — both as one orchestrated `docker-compose` stack and as individually
deployable, env-configured containers.

## Constraints (from the existing project)

- **~1,035 cards, 14 sets**, effectively read-only; updates happen via a rebuild of the
  Python pipeline (`build_dataset.py` → `card-data/dist/*.json`, `card-data/assets/`).
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
| Source-of-truth DB | **PostgreSQL 16** | Schema from `card-data/DATABASE-CHOICE.md`; also carries later user data |
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

## Open details for the planning phase

- Exact Postgres schema (DDL) derived from `DATABASE-CHOICE.md` + Drizzle migrations.
- Meilisearch index config (searchable/filterable/sortable attributes, synonyms,
  ranking rules) per language.
- MinIO bucket policy (public-read vs. signed URLs) + Next `<Image>` remote pattern.
- ingest job: idempotency, re-run on data update, image-upload diffing.

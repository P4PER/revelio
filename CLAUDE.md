# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Revelio (revelio.cards) is a Scryfall-style searchable card database for the **Harry Potter Trading Card Game (2001, WotC)** — an unofficial fan project. Branding lives in `logos/BRAND-GUIDE.md` (Poppins font, gold-on-indigo "Reveal-Glow" scheme). The card dataset and its build pipeline live under `card-data/` (Python, see `card-data/README.md`); the deployable web application lives under `app/`.

## Working directory

**All app commands run from `app/`**, which is the npm workspaces root (`app/package.json`). CI sets `working-directory: app`. There is no root-level `package.json`.

## Commands

Run from `app/`:

```bash
npm ci                       # install (uses app/package-lock.json)
npm test                     # all workspace tests (vitest)
npm run typecheck            # tsc --noEmit across all workspaces
npm run build -w web         # next build (needs env vars, see below)
npm run dev -w web           # next dev server

# single test file / single test
npm test -w web -- src/lib/__tests__/search-params.test.ts
npm test -w web -- -t "test name substring"

# lint (only the web workspace is linted — eslint-config-next)
npm run lint -w web

# database / migrations (see MIGRATIONS section)
npm run db:generate          # alias for generate -w @revelio/db
npm run check -w @revelio/db     # drizzle-kit journal/snapshot consistency
npm run verify -w @revelio/db    # fails if schema.ts drifted from migrations (offline)
```

CI (`.github/workflows/ci.yml`) has three jobs: **check** (db check + verify, web lint, typecheck), **test** (spins up Meilisearch + MinIO in Docker, then `npm test`), and **build** (`next build`). Tests requiring live services read `TEST_MEILI_HOST`/`TEST_MEILI_KEY`/`TEST_S3_*`; Postgres-backed tests use Testcontainers (Docker required, no compose Postgres service in CI).

### Local infra

`docker compose up` (from `app/`) starts postgres, meilisearch, and minio. Migrations run via the compose `tools` profile: `docker compose run --rm migrate`. Copy `app/.env.example` → `app/.env`; compose hostnames are the service names (`postgres`, `meilisearch`, `minio`), use `localhost` + published ports when running a service on the host.

## Architecture

Five npm workspaces under `app/`, with a strict dependency direction `core ← {search, db} ← {ingest, web}`:

- **`@revelio/core`** (`core/`) — framework-agnostic domain layer: Zod schemas (`schemas.ts`), the card domain model (`domain.ts`), attribute definitions (`attributes.ts`), image key helpers (`images.ts`). No I/O. Every other workspace imports from here.
- **`@revelio/search`** (`search/`) — Meilisearch client + document shape + query builder. `createMeiliClient(host, key)` is the single client factory; `documents.ts` defines the indexed card document; `search.ts` builds queries/filters.
- **`@revelio/db`** (`db/`) — Drizzle ORM over Postgres. `schema.ts` (card data) + `auth-schema.ts` (Better Auth tables), `queries.ts`, `client.ts`, and migration runners (`migrate.ts` / `migrate-cli.ts`). Migrations are checked-in SQL under `db/drizzle/`.
- **`@revelio/ingest`** (`ingest/`) — one-shot job (`src/main.ts`, run with `tsx`) that runs migrations, seeds Postgres from `card-data`, indexes Meilisearch, and uploads card images to S3/MinIO. The `load-*.ts` files each own one data source; `build-documents.ts` + `index-cards.ts` produce the search index; `upload-images.ts` handles S3.
- **`@revelio/web`** (`web/`) — Next.js 16 (App Router, React 19) app. This is the only workspace with a lint step and the only one that ships to users.

### Web app specifics

- **Next.js App Router with `next-intl`**. All pages live under `src/app/[locale]/` — the `[locale]` root layout owns `<html>`/`<body>`. `src/middleware.ts` drives locale routing. Use next-intl's navigation helpers, not bare `next/link`, for locale-aware links.
- **Server Actions** in `src/lib/*-actions.ts` (`auth-actions`, `localization-actions`, `rulings-actions`, `image-actions`) are the write path. Editor saves go through these; they are `'use server'` and must never leak secrets to the client.
- **Two Meilisearch keys, server-only.** Read path uses `MEILI_SEARCH_KEY`; editor writes use a **scoped** `MEILI_WRITE_KEY` (documents.add/update on card indexes only) via `getWriteClient()` in `src/lib/reindex.ts`. The master key is never used at runtime and never sent to the browser. Editing a card writes to Postgres *and* re-indexes Meilisearch in the same action.
- **Auth**: Better Auth (email-OTP + username + roles) wired at `src/app/api/auth/[...all]/route.ts`, config in `src/lib/auth.ts`; roles/session helpers in `src/lib/roles.ts` / `src/lib/session.ts`. Admin emails come from `ADMIN_EMAILS`.
- **Images**: per-language card images stored in S3/MinIO with lang-aware keys and fallback; `sharp` generates thumbnails. Public base URL is `NEXT_PUBLIC_IMAGE_BASE_URL` (build-time inlined).
- **UI**: shadcn + Radix + Tailwind v4. Shared primitives in `src/components/ui/`.
- `NEXT_PUBLIC_*` env vars are inlined at `next build` — they must be set at build time, not just at runtime.

## Migrations (read before touching the schema)

Drizzle migrations are **incremental and append-only**; full details in `docs/MIGRATIONS.md`. `db/drizzle/0000_*.sql` is the frozen baseline — **never** `rm` the `drizzle/` folder or regenerate `0000`. To change the schema: edit `db/src/schema.ts`, run `npm run generate` from `app/db`, review the generated `drizzle/NNNN_*.sql`, and commit the schema edit + migration together. `npm run verify` (CI-enforced) fails if you edited the schema but forgot to generate.

## Planning docs

Design specs and phased implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`, dated and named per feature (e.g. `2026-07-04-edit-rulings.md`). Consult the relevant plan/spec before extending a feature area.

## Conventions

- **Conventional Commits** for commit messages.
- Documentation filenames are UPPERCASE (`README.md`, `MIGRATIONS.md`, `BRAND-GUIDE.md`).
- All docs/specs/prose in English.

## Subagents

Prefer solving tasks in a single session. Only spawn subagents for genuinely independent workstreams.

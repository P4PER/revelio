# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Revelio (revelio.cards) is a searchable card database for the **Harry Potter Trading Card Game (2001, WotC)** — an unofficial fan project. Branding lives in `logos/BRAND-GUIDE.md` (Poppins font, gold-on-indigo "Reveal-Glow" scheme). The card dataset and its build pipeline live under `card-data/` (Python, see `card-data/README.md`); the deployable web application lives under `app/`.

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

# Playwright e2e (web only; specs in web/e2e/, config in web/playwright.config.ts)
npm run e2e -w web           # builds + starts prod server, runs against localhost:3000

# lint (only the web workspace is linted — eslint-config-next)
npm run lint -w web

# Discord bot (needs bot/.env.local, see below)
npm run dev -w @revelio/bot       # run against the local stack
npm run register -w @revelio/bot  # publish slash commands without starting the gateway

# database / migrations (see MIGRATIONS section)
npm run db:generate          # alias for generate -w @revelio/db
npm run check -w @revelio/db     # drizzle-kit journal/snapshot consistency
npm run verify -w @revelio/db    # fails if schema.ts drifted from migrations (offline)
```

CI (`.github/workflows/ci.yml`) has three jobs: **check** (db check + verify, web lint, typecheck), **test** (spins up Meilisearch + MinIO in Docker, then `npm test`), and **build** (`next build`). Tests requiring live services read `TEST_MEILI_HOST`/`TEST_MEILI_KEY`/`TEST_S3_*`; Postgres-backed tests use Testcontainers (Docker required, no compose Postgres service in CI).

### Local infra

`docker compose up` (from `app/`) starts postgres, meilisearch, and minio. Migrations run via the compose `tools` profile: `docker compose run --rm --build migrate`. The bot is behind a `bot` profile so a bare `up` never needs a Discord token: `docker compose --profile bot up bot`.

**Do not drop the `--build`.** The `migrate` service runs `image: revelio-ingest:local`, and compose only builds that image when it is *missing* — so a plain `docker compose run --rm migrate` runs whatever SQL was baked in whenever the image was last built. A migration generated since then is simply not in the container: the run prints `migrations applied` and applies **nothing**, with no error and no warning. Running from the host is the other way round it:

```bash
cd app
DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio npx tsx db/src/migrate-cli.ts
```

Either way, confirm the change actually landed rather than trusting the success line — e.g. `docker compose exec -T postgres psql -U revelio -d revelio -c "\d <table>"`.

**Env files are per workspace, and `app/.env` is not the one the app reads.** Copy `app/.env.example` → `app/.env` for compose only — compose hostnames are the service names (`postgres`, `meilisearch`, `minio`). Next reads `app/web/.env.local`, and the bot reads `app/bot/.env.local` (both have a committed `.env.example` beside them). Use `localhost` + published ports in those two, since they run on the host; the compose `bot` service loads `bot/.env.local` via `env_file` and overrides the two hostnames.

## Architecture

Six npm workspaces under `app/`, with a strict dependency direction `core ← {search, db} ← {ingest, web, bot}`:

- **`@revelio/core`** (`core/`) — framework-agnostic domain layer: Zod schemas (`schemas.ts`), the card domain model (`domain.ts`), attribute definitions (`attributes.ts`), image key helpers (`images.ts`). No I/O. Every other workspace imports from here.
- **`@revelio/search`** (`search/`) — Meilisearch client + document shape + query builder. `createMeiliClient(host, key)` is the single client factory; `documents.ts` defines the indexed card document; `search.ts` builds queries/filters.
- **`@revelio/db`** (`db/`) — Drizzle ORM over Postgres. `schema.ts` (card data) + `auth-schema.ts` (Better Auth tables), `queries.ts`, `client.ts`, and migration runners (`migrate.ts` / `migrate-cli.ts`). Migrations are checked-in SQL under `db/drizzle/`.
- **`@revelio/ingest`** (`ingest/`) — one-shot job (`src/main.ts`, run with `tsx`) that runs migrations, seeds Postgres from `card-data`, indexes Meilisearch, and uploads card images to S3/MinIO. The `load-*.ts` files each own one data source; `build-documents.ts` + `index-cards.ts` produce the search index; `upload-images.ts` handles S3.
- **`@revelio/web`** (`web/`) — Next.js 16 (App Router, React 19) app. This is the only workspace with a lint step, and the only one users reach in a browser.
- **`@revelio/bot`** (`bot/`) — discord.js gateway bot serving `/card`, `/search`, `/deck`, `/collection` and `/mydecks` in Discord. It reads Meilisearch and Postgres directly on the private network; there is no HTTP API between it and `web`, and it must never import from `web`. Read-only: it uses `MEILI_SEARCH_KEY` and never `MEILI_WRITE_KEY`.

### Web app specifics

- **Next.js App Router with `next-intl`**. All pages live under `src/app/[locale]/` — the `[locale]` root layout owns `<html>`/`<body>`. `src/proxy.ts` drives locale routing (Next 16 renamed the `middleware.ts` convention to `proxy.ts`). Use next-intl's navigation helpers, not bare `next/link`, for locale-aware links.
- **Server Actions** in `src/lib/actions/` (`auth-actions`, `localization-actions`, `rulings-actions`, `image-actions`) are the write path. Editor saves go through these; they are `'use server'` and must never leak secrets to the client.
- **Two Meilisearch keys, server-only.** Read path uses `MEILI_SEARCH_KEY`; editor writes use a **scoped** `MEILI_WRITE_KEY` (documents.add/update on card indexes only) via `getWriteClient()` in `src/lib/server/reindex.ts`. The master key is never used at runtime and never sent to the browser. Editing a card writes to Postgres *and* re-indexes Meilisearch in the same action.
- **Auth**: Better Auth (email-OTP + username + roles) wired at `src/app/api/auth/[...all]/route.ts`, config in `src/lib/server/auth.ts`; roles/session helpers in `src/lib/roles.ts` / `src/lib/server/session.ts`. Admin emails come from `ADMIN_EMAILS`.
- **Discord linking is opt-in and link-only.** The social provider is registered only when `DISCORD_CLIENT_ID` *and* `DISCORD_CLIENT_SECRET` are set (both server-only, in `web/.env.local`); otherwise the Connections pane says so instead of rendering a dead button. `disableSignUp` + `disableImplicitLinking` keep `POST /sign-in/social` from becoming a second way in that skips the OTP flow — do not add `discord` to `trustedProviders`, which would let that path accept an unverified provider email. **Unlinking deliberately does not use Better Auth's `/unlink-account`**: it sits behind fresh-session middleware measured from `session.createdAt`, so any session over a day old gets a permanent 403. It goes through `lib/actions/connections-actions.ts` instead, which also revokes the authorization at Discord — as do both account-deletion paths, via `unlinkAndRevokeDiscord`.
- **`src/lib` is split by runtime.** `lib/server/` holds server-only modules (DB, S3, auth,
  session, search client) and every file there must start with `import 'server-only'` - a test
  in `lib/server/__tests__/server-only-guard.test.ts` enforces it. `lib/actions/` holds the
  `'use server'` modules. Pure, isomorphic helpers stay at `lib/` root; `utils.ts` must stay
  there because `components.json` pins `aliases.utils` to `@/lib/utils`.
- **Images**: per-language card images stored in S3/MinIO with lang-aware keys and fallback; `sharp` generates thumbnails. Public base URL is `NEXT_PUBLIC_IMAGE_BASE_URL` (build-time inlined).
- **UI**: shadcn + Radix + Tailwind v4. Shared primitives in `src/components/ui/`.
- **`src/components` is grouped by domain.** `card/`, `deck/`, `collection/`, `search/`,
  `admin/`, `set/`, `auth/`, `layout/`, plus `settings/` and `legal/`. Cross-domain components
  live in the domain that owns them, not in a shared folder - `deck/` importing
  `@/components/card/card-image` is the intended shape. Only genuinely domain-free components
  (`date-picker`, `error-card-state`, `responsive-sidebar`, ...) sit at the root. No barrel
  files: import the leaf path. Each folder owns its `__tests__/` and, where two or more
  siblings share a type, its `types.ts`.
- `NEXT_PUBLIC_*` env vars are inlined at `next build` — they must be set at build time, not just at runtime.

### Discord bot specifics

- **No privileged intents.** `GatewayIntentBits.Guilds` only — reading message content or member lists would require Discord verification, and slash commands need neither.
- **Every personal reply is ephemeral.** `/collection` and `/mydecks` must `deferReply({ flags: MessageFlags.Ephemeral })` as their first statement, and a test asserts it on each — a regression there leaks a user's collection into a public channel. Any new personal command must do the same.
- **Account linking has no table of its own.** A Discord user is resolved through Better Auth's existing `account` row (`providerId = 'discord'`, `accountId` = the snowflake) by `getUserIdByDiscordAccount`, which is also where a **ban** is enforced: banning deletes web sessions but leaves that row, so the query joins `user` and rejects an active ban. Every personal command goes through `resolveLinkedUser`, so that rule has one place to audit.
- **Every user-facing string comes from `bot/src/i18n/{en,de}.json`**, never hardcoded copy; `test/catalog-parity.test.ts` enforces that both catalogs hold the same keys. Attribute codes (lesson/type/rarity/finish/legality) render via `attrLabel` from `@revelio/core`, which is shared with `web`.
- **Discord embed limits are hard** and a breach fails the whole interaction with a 400: description 4096 chars, field value 1024, at most 25 fields. Clamp rather than risk it.
- **Every command defers first** (`interaction.deferReply()`), then edits — a deferred reply has 15 minutes against Discord's 3-second initial budget.
- **Replies must not be able to ping.** The client sets `allowedMentions: { parse: [] }`; commands echo user input back, so anything else lets `/card name:@everyone` mass-ping a guild.
- **Meilisearch totals are estimates.** `estimatedTotalHits` over-counts, so a page inside the computed page count can still come back empty — treat that as out of range.
- Commands are registered on every boot (Discord's `PUT` is a full replace), but a registration failure is logged and survived rather than fatal.
- Card images use `thumbKey` (300px), never the full `imageKey`.

## Migrations (read before touching the schema)

Drizzle migrations are **incremental and append-only**; full details in `docs/MIGRATIONS.md`. `db/drizzle/0000_*.sql` is the frozen baseline — **never** `rm` the `drizzle/` folder or regenerate `0000`. To change the schema: edit `db/src/schema.ts`, run `npm run generate` from `app/db`, review the generated `drizzle/NNNN_*.sql`, and commit the schema edit + migration together. `npm run verify` (CI-enforced) fails if you edited the schema but forgot to generate. Commit the migration *before* running `verify` — its git-clean step deletes an uncommitted one. To apply a fresh migration locally, mind the stale-image trap in **Local infra** above: `docker compose run --rm migrate` without `--build` reports success while applying nothing.

## Planning docs

Design specs and phased implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`, dated and named per feature (e.g. `2026-07-04-edit-rulings.md`). Consult the relevant plan/spec before extending a feature area.

## Conventions

- **Conventional Commits** for commit messages.
- Documentation filenames are UPPERCASE (`README.md`, `MIGRATIONS.md`, `BRAND-GUIDE.md`).
- All docs/specs/prose in English.
- **Declaration order within a file: types → constants → helpers → exported functions.** Imports first, then every `type`/`interface`, then module constants, then unexported helpers, then the exported functions (`search/src/search.ts` and `core/src/deck-legality.ts` are the reference). A type buried between two functions is the thing to avoid: readers look for the shape before the behaviour.
- **Shared types → `types.ts`.** When a type is used by two or more sibling modules in a folder, define it once in a folder-scoped `types.ts` (e.g. `src/lib/email/types.ts` exports `RenderedEmail`, shared by `otp-template.tsx` and `contact-template.tsx`) and import it with `import type`. Keep single-use types local to their module — don't pre-emptively create a `types.ts` for a type with one consumer.

## Subagents

Prefer solving tasks in a single session. Only spawn subagents for genuinely independent workstreams.

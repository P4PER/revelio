# Revelio

**A searchable card database for the Harry Potter Trading Card Game (2001, Wizards of the Coast).**

> ⚠️ **Unofficial fan project.** Revelio is not affiliated with, endorsed, or
> sponsored by Warner Bros., Wizards of the Coast, or any rights holder. It is a
> non-commercial project made by fans, for fans. See [Legal & IP](#legal--ip).

Revelio lets you search, filter, and browse the full HP TCG card pool the way
players of modern card games expect — fast full-text search, structured
attribute filters, per-language card images, and rulings.

---

## What's in this repo

| Path                | What it is                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| `app/`              | The deployable web application (npm workspaces root — **all app commands run here**). |
| `card-data/`        | The card dataset and its Python build pipeline (see `card-data/README.md`).   |
| `docs/`             | Design specs, data model, and migration docs.                                |
| `logos/`            | Brand assets and the `BRAND-GUIDE.md`.                                        |
| `CLAUDE.md`         | Architecture and conventions overview (the best single-file map of the repo). |

## Architecture

The app is five npm workspaces under `app/`, with a strict dependency direction
`core ← {search, db} ← {ingest, web}`:

- **`@revelio/core`** — framework-agnostic domain layer (Zod schemas, card
  domain model, attribute definitions). No I/O; every other workspace imports it.
- **`@revelio/search`** — Meilisearch client, indexed document shape, and query builder.
- **`@revelio/db`** — Drizzle ORM over Postgres; checked-in SQL migrations.
- **`@revelio/ingest`** — one-shot job that runs migrations, seeds Postgres from
  `card-data`, indexes Meilisearch, and uploads card images to S3/MinIO.
- **`@revelio/web`** — the Next.js 16 (App Router, React 19) app that ships to users.

**Stack:** Next.js · React · Postgres + Drizzle · Meilisearch · S3/MinIO · Better Auth · shadcn/Radix/Tailwind v4 · `next-intl`.

## Getting started

Everything runs from `app/`.

```bash
cd app

# 1. Start local infrastructure (postgres, meilisearch, minio)
docker compose up -d

# 2. Configure environment
cp .env.example .env      # then fill in the values

# 3. Install dependencies
npm ci

# 4. Run migrations (compose "tools" profile)
docker compose run --rm migrate

# 5. Start the dev server
npm run dev -w web
```

Common workspace commands (from `app/`):

```bash
npm test                 # all workspace tests (vitest)
npm run typecheck        # tsc --noEmit across all workspaces
npm run lint -w web      # lint the web workspace
npm run build -w web     # next build (requires build-time env vars)
```

For the card dataset and how the pipeline produces the data the app ingests, see
[`card-data/README.md`](card-data/README.md). For schema changes and the
append-only migration workflow, see [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).

## Contributing

Revelio is source-available but not open source — see the license below before
reusing anything. If you'd like to contribute or request permission to use the
code, please reach out to the Revelio team.

## Legal & IP

Revelio is an **unofficial, non-commercial fan project**. The names
"Harry Potter" and "Wizards of the Coast", all card names and card text, and all
related artwork, characters, logos, and trademarks are the property of
Warner Bros. Entertainment Inc., Wizards of the Coast, and their respective
owners. This project claims no ownership of that intellectual property and is
not affiliated with or endorsed by its owners.

## License

Copyright © 2026 the Revelio team. **All rights reserved.**

This code is **source-available, not open source**: you may read it, but you may
not use, run, copy, modify, or redistribute it without prior written permission.
See [`LICENSE`](LICENSE) for the full terms. The license covers only the
original code and tooling authored by the Revelio team — not the Harry Potter
intellectual property described above.

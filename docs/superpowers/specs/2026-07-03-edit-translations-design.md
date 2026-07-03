# Edit Translations (Plan 4b-2) — Design

> Second slice of **Plan 4b (Authoring + Auth)**. The auth foundation (Plan 4b-1) is merged: passwordless email-OTP + username + roles, with a fail-closed `requireRole('editor' | 'admin')` gate. This slice is the first thing that *uses* editor gating.

## Goal

Editors and admins edit a card's text localizations (name / text / flavor / status) per language on a dedicated edit page. Saves write back to Postgres with provenance (`origin: 'user'`, `updated_at`) and re-index that card in Meilisearch. Public browsing stays read-only.

## Scope (decided)

- **Editable fields:** `name`, `text`, `flavorText`, `status` on `card_localizations` (per language). `status` is a small select — the existing values are `machine` / `official`.
- **Edit surface:** a dedicated **`/card/[id]/edit`** page (not inline, not a drawer).
- **Languages:** edit one language at a time via a switcher (default = current UI locale); an editor can also **create a localization for a missing language**.
- **Who:** role ≥ `editor` (admins included). Everyone else sees the site read-only.

## Data facts (verified)

- `card_localizations` PK is `(cardId, lang)` and includes the shared `...editable` columns (`createdAt`, `updatedAt`, `origin` default `'import'`). Write-back is an **upsert** on `(cardId, lang)` setting `origin: 'user'`, `updated_at = now`.
- Current data: langs `en` (status `official`, source `WotC (hpjson)`) and `de` (status `machine`, source `Claude (machine)`). The core editor workflow is correcting a machine German translation and flipping its `status` to `official`.

## Architecture

- **Detail page** (`/card/[id]`): an **Edit button** shown only when `getSession()` resolves role ≥ editor → links to `/card/[id]/edit`.
- **Edit page** (`/card/[id]/edit`, server component): `await requireRole('editor')` first (non-editors get `notFound()`); loads the card via `getCardById`. Renders a language switcher (existing langs + "add a language") and a client form for the four fields (`status` as a select of `machine` / `official`).
- **Save server action** (`updateLocalization`): `'use server'`, `await requireRole('editor')`, validate with Zod, **upsert** the localization (`origin: 'user'`, `updated_at`), then attempt **`reindexCard(cardId)`**, then `revalidatePath` for the detail + edit routes.

## New/changed units (interfaces)

- `@revelio/db` → `upsertLocalization(db, { cardId, lang, name, text, flavorText, status }): Promise<void>` — insert-or-update on `(cardId, lang)`, always sets `origin: 'user'` and `updated_at`. Creates the row if the language is missing.
- **Shared doc builder:** extract the per-card/per-language search-document construction currently in `app/ingest/src/build-documents.ts` into **`buildCardDocument(card, lang)`** in `@revelio/search`, so the bulk ingest and the web save use the same code (DRY). `build-documents.ts` is refactored to call it.
- `@revelio/search` → `reindexCard(writeClient, db, cardId): Promise<void>` — rebuild the document(s) for the card's languages and `addDocuments` into the matching per-language index.
- `app/web` → `updateLocalization` server action + `/card/[id]/edit/page.tsx` + an edit form client component + the Edit button on the detail page.

## Meilisearch key model (best-practice)

Public search already uses a **search-only** key (`MEILI_SEARCH_KEY`). Writing from the web needs a separate key — **not the master key**:

- **`MEILI_WRITE_KEY`**: a **scoped** API key created from the master key, limited to actions `documents.add` / `documents.update` (+ `indexes.get` if needed) on the card indexes (`cards_*`) only. No `keys.*`, no deletes.
- **Server-only**: used only inside the save server action; never `NEXT_PUBLIC_`, never sent to the browser.
- Three keys, three roles: **master** (infra only, mints keys), **write** (server edit), **search** (public).
- Setup: a documented one-time step/script creates the scoped key from the master key (curl `POST /keys` with the scoped `actions` + `indexes`). Documented in `.env.example`; the app reads only `MEILI_WRITE_KEY`.

## Error handling

- **Authorization:** edit page + save action both start with `requireRole('editor')` → `notFound()` (page) / thrown error (action) for others. Edit button hidden below editor.
- **Validation (Zod, server-side):** `name` required (non-empty); `text` / `flavorText` optional; `status ∈ { machine, official }`; `lang` ∈ known locales. Errors surfaced in the form.
- **Missing language:** upsert inserts the new localization (`name` required).
- **Reindex is non-fatal:** Postgres is the source of truth. Upsert first (authoritative); then attempt the reindex. On reindex failure, log it and show the editor a soft warning — the edit stays saved (a later rebuild can reconcile), rather than failing the whole action.

## Testing

- **DB (integration, real Postgres):** `upsertLocalization` sets `origin: 'user'` + `updated_at`; creates a row for a missing language.
- **Search:** `buildCardDocument` (unit) reflects edited fields; `reindexCard` against real Meilisearch — the card's document mirrors the change.
- **Authorization:** the save action blocks a non-editor (role `user`); the Edit button renders only for role ≥ editor.
- **Form:** validation error on empty `name`; the `status` select offers `machine` / `official`.

## Deferred to later slices

Written down explicitly so the next slices are already scoped:

- **Rulings editing** — `card_rulings` is a separate table (per-entry multilingual `text`, ordered by `seq`, with `date` / `source`); own UI + logic. Its own slice.
- **`adventure` / `match` (jsonb)** — structured nested fields; need JSON-shape-aware editing + validation. Own slice.
- **Images** — `imageFile` / `imageUrl` per localization; involves upload/storage (MinIO) and is not plain text. Own slice.
- **Audit history** — beyond the minimal `origin` / `updated_at` provenance: who changed what, when, and diffs. A dedicated change-log table + UI.
- **Optimistic concurrency** — this slice is last-write-wins; two editors on the same `(cardId, lang)` can clobber each other. Add version/`updated_at` checks (409 on conflict) later.
- **Promote-user UI** — an admin screen to make a user an `editor` (until then: `ADMIN_EMAILS` → admin, then manual/DB). Small later slice; 4b-2 works admin-only in the meantime.

## Env

- New: `MEILI_WRITE_KEY` (scoped write key, server-only). Reuses `MEILI_HOST`, `DATABASE_URL`, and the auth envs. Documented in `app/.env.example` + `app/web/.env.example`.

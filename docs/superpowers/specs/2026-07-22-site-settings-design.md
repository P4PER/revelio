# Site Settings Subsystem — Design

> **Status: LOCKED (brainstormed 2026-07-22).** Ready for `superpowers:writing-plans`.
> **Spec 1 of 3** in the "footer legal & about pages" track. Builds the DB-backed,
> admin-editable store that **Spec 2** (`/about`, `/privacy`, `/imprint` pages) and
> **Spec 3** (`/contact` form) will consume. Ships no public pages itself.

## Summary

Introduce a single, admin-editable **site settings** record holding the
operator/legal fields the upcoming Impressum and Privacy Policy need, plus the
GitHub link the footer already shows. The values live in a new `site_settings`
Postgres table, are edited at `/admin/settings` (admin-only), read through a
tag-cached accessor so the DB is not touched on every page render, and become the
**single source of truth** — the two overlapping env vars (`CONTACT_EMAIL`,
`GITHUB_URL`) are migrated to this store and removed from `.env.example`.

## Context & principle

The dividing line already used in this codebase (see the admin-sets track) is:
**frozen vocabulary → i18n catalog; data-driven / admin-created → the DB**. The
operator's legal details and the GitHub link are operator-owned, occasionally-
changing configuration — not code, not translations. They belong in the DB with a
small admin surface, so they can be corrected without a redeploy.

These fields are single-operator, single-tenant, and change on the order of once
every few years, so the store is a **typed singleton row**, not a key-value bag:
the schema documents exactly which settings exist and keeps typed access.

The legal *prose* itself is **not** in scope here — it stays in next-intl message
files (Spec 2). Only the structured, operator-specific *values* are DB-backed.

## Scope

**In scope**

- `site_settings` singleton table + Drizzle export + append-only migration.
- `getSiteSettings` / `upsertSiteSettings` queries in `@revelio/db`.
- A tag-cached web accessor `getCachedSiteSettings()` (`unstable_cache`, tag
  `site-settings`) — the first use of `unstable_cache`/`revalidateTag` in the repo.
- `/admin/settings` admin-only page + `SiteSettingsForm` + `site-settings-actions`
  save action, and a "Settings" card on the `/admin` index.
- **Migrate the two overlapping env values** into the store and remove them from
  `.env.example`:
  - `CONTACT_EMAIL` → `site_settings.contactEmail`; the OTP email path reads it
    from settings.
  - `GITHUB_URL` → `site_settings.githubUrl`; the footer reads it from settings.
- `adminSettings` i18n namespace (`en.json`/`de.json`) + field-validation keys.

**Out of scope**

- The public `/about`, `/privacy`, `/imprint` pages and their prose (Spec 2).
- The `/contact` form (Spec 3) — it will later read `contactEmail` from this store.
- Any key-value / generic settings framework, or speculative fields (VAT ID, phone,
  register entries) — added later via migration only if a real need appears.
- Migrating infrastructure/auth env vars (`MAIL_FROM`, `ADMIN_EMAILS`, SMTP/S3/DB) —
  those are deployment config, not editable site content, and stay in env.

## Verified current-state facts

- **Overlapping env vars today:** `.env.example` defines
  `CONTACT_EMAIL=support@revelio.cards` (read at `src/lib/email/otp-template.tsx:51`
  via `process.env.CONTACT_EMAIL ?? ''`) and
  `GITHUB_URL=https://github.com/P4PER/revelio` (read at
  `src/components/site-footer.tsx:62`). No other `process.env` reads overlap the
  proposed fields.
- **Footer shape:** `SiteFooter` is an async server wrapper that resolves session
  state and renders the sync, prop-driven `SiteFooterView`. `githubUrl` is
  currently read from env *inside* the presentational view — it will move to a prop
  fed by the wrapper, matching how `isLoggedIn` is already threaded (keeps the view
  pure and its tests env-free).
- **OTP email path:** `auth.ts`'s `emailOTP.sendVerificationOTP` calls
  `renderOtpEmail({ otp, type })` (`@/lib/email/otp-template`), which internally
  reads `CONTACT_EMAIL`. Better Auth runs inside the Next route handler
  (`api/auth/[...all]`), so a Next server-cache accessor is usable there. `auth.ts`
  builds its own db client, but the cached accessor uses `getDb()` — both are fine
  in that context.
- **Admin gating:** pages use `getSession()` + `hasRequiredRole(role, 'admin')`;
  write actions use `requireRole('admin')` (`src/lib/session.ts`). The `/admin`
  index (`admin/page.tsx`) lists cards and already gates the Users card behind
  `isAdmin`.
- **Form conventions:** client forms use react-hook-form + `zodResolver` +
  translated `validation` messages, with `Input`, `auto-textarea` (exists in
  `src/components/ui/`), `FieldError`, `Button`. Save actions mirror
  `set-actions.ts`: `'use server'`, role check, zod validate, mutate,
  `revalidate*`, return `{ ok: true } | { ok: false; error }`.
- **Migrations:** append-only; edit `db/src/schema.ts` → `npm run generate` from
  `app/db` → review generated `drizzle/NNNN_*.sql` → commit schema + migration
  together; never touch `0000`. `npm run verify` is CI-enforced.
- **DB tests** use Testcontainers Postgres; **web tests** are vitest under
  `__tests__`.

## Design

### 1. Schema: `site_settings` (typed singleton)

```
site_settings
  id                 text        pk  default 'singleton'   -- enforces one row
  operator_name      text        null
  operator_address   text        null                       -- multi-line
  contact_email      text        null
  hosting_provider   text        null
  responsible_person text        null                       -- §18 MStV, optional
  github_url         text        null
  updated_at         timestamp   notNull default now()
```

All content columns are nullable so the row may exist partially filled; consumers
treat `null`/missing as "not set" and fall back gracefully (e.g. the OTP template's
existing `?? ''`, the footer hiding the GitHub link when unset). The single row is
keyed by the constant `id = 'singleton'`.

### 2. Queries (`@revelio/db`)

- `getSiteSettings(db): Promise<SiteSettings | null>` — selects the `'singleton'`
  row; `null` when unset. Export `SiteSettings` via `$inferSelect`.
- `upsertSiteSettings(db, values): Promise<void>` — insert-or-update the singleton
  (`insert … onConflictDoUpdate({ target: id })`), stamping `updated_at`.

### 3. Cached accessor + invalidation (`@revelio/web`)

- `src/lib/site-settings.ts` exports
  `getCachedSiteSettings = unstable_cache(() => getSiteSettings(getDb()), ['site-settings'], { tags: ['site-settings'] })`.
  **All rendering consumers** (footer, later the legal pages, the OTP path) call
  this — the DB is hit only on a cache miss, then served from cache until
  invalidated. This removes any need for `force-dynamic` on consuming pages.
- The **save action** calls `revalidateTag('site-settings')` immediately after
  `upsertSiteSettings`, so an edit propagates at once and nothing else re-queries.
- The **admin edit form** loads via the *uncached* `getSiteSettings(getDb())` so the
  editor never edits a stale cached copy.

### 4. Env-var migration (single source of truth)

- **`contactEmail`:** `auth.ts` fetches settings via `getCachedSiteSettings()` and
  passes `contactEmail` into `renderOtpEmail({ otp, type, contactEmail })`;
  `otp-template.tsx` takes it as a parameter instead of reading
  `process.env.CONTACT_EMAIL`, keeping the same empty-string fallback. Remove
  `CONTACT_EMAIL` from `.env.example`.
- **`githubUrl`:** `SiteFooter` (async wrapper) reads `getCachedSiteSettings()` and
  passes `githubUrl` as a prop to `SiteFooterView`; the view renders the GitHub
  link only when the prop is set (same truthiness guard as today, now prop- not
  env-driven). Remove `GITHUB_URL` from `.env.example`.
- Existing footer/OTP tests keep passing because both consumers become
  prop/parameter-driven (no env reads in the presentational units).

### 5. Admin UI

- **Route** `src/app/[locale]/admin/settings/page.tsx` — server component gated with
  `getSession()` + `hasRequiredRole(role, 'admin')` (admin-only). Loads current
  settings via uncached `getSiteSettings` and renders a prefilled `SiteSettingsForm`.
- **Server action** `src/lib/site-settings-actions.ts` (`'use server'`):
  `requireRole('admin')`, zod-validate the input, `upsertSiteSettings`,
  `revalidateTag('site-settings')`, return `{ ok: true } | { ok: false; error }`.
- **Form** `SiteSettingsForm` (client): react-hook-form + `zodResolver` + translated
  `validation` messages; `Input` for `operatorName`, `contactEmail` (email),
  `hostingProvider`, `responsiblePerson`, `githubUrl` (url); `auto-textarea` for
  `operatorAddress`; `FieldError` per field; a submit `Button` with success/error
  feedback. Validation schema in `src/lib/schemas/site-settings.ts` (mirrors the
  auth schema pattern): all fields optional/nullable-friendly, `contactEmail` a
  valid email when present, `githubUrl` a valid URL when present.
- **Admin index:** add a "Settings" card to `admin/page.tsx`, gated `isAdmin`.
- **i18n:** new `adminSettings` namespace (title, field labels, save/success/error)
  in `en.json` + `de.json`; any new field-error strings under `validation`.

## Testing

- **DB (Testcontainers):** `getSiteSettings` returns `null` when unset; after
  `upsertSiteSettings`, read returns the values; a second `upsert` overwrites the
  same singleton row (still exactly one row) and bumps `updated_at`.
- **Save action:** non-admin is rejected; invalid `contactEmail`/`githubUrl`
  rejected by zod; a valid payload upserts and the action returns `{ ok: true }`.
- **Env migration:** footer renders the GitHub link from the `githubUrl` prop and
  hides it when absent; `renderOtpEmail` uses the passed `contactEmail` (empty-
  string fallback preserved). Existing footer/OTP suites stay green.
- **Form:** renders prefilled, shows inline validation errors, submits.
- **CI gates:** `npm run verify` (schema ↔ migration) + `npm run check` + typecheck
  + web lint all pass.

## Next step

`superpowers:writing-plans` for the phased implementation plan (schema + migration
→ queries → cached accessor → env migration for footer/OTP → admin action/form/page
→ tests), then Spec 2 (legal & about pages) consumes `getCachedSiteSettings()`.

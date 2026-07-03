# Auth Foundation (Plan 4b-1) — Design

> First slice of **Plan 4b (Authoring + Auth)**. The read-only web (Plan 4a) is complete.

## Why 4b is decomposed

4b spans several subsystems, so it is split into sequential slices:

- **4b-1 Auth foundation** (this spec) — registration, passwordless login, roles, session, gating helper, minimal UI. Everything else depends on it.
- **4b-2 Edit translations** — editors/admins edit `card_localizations` (name/text/flavor/status), write back to Postgres with `origin: 'user'` + `updated_at`, re-index Meilisearch, edit UI on the detail page.
- **4b-3+** — rulings/other fields, an admin "promote user" UI, then (Plan 4c) normal-user features: decks and favorites.

## Editor model (decided)

Open registration — anyone can create an account and is a **`user`** by default. Only **`editor`** or **`admin`** may change cards. Normal users later get decks/favorites (4c). Public browsing stays read-only and unauthenticated.

## Architecture

- **Better Auth** (open-source, MIT, self-hosted — no external account/cost; runs entirely on our Postgres) with three plugins:
  - **email-OTP** — passwordless login via a **6-digit code** emailed to the user.
  - **username** — a unique `username` in addition to `email`.
  - **admin / roles** — a `role` field: `user` (default) / `editor` / `admin`.
- **Drizzle adapter** — Better Auth's tables live in the **same Postgres** as the card data (via `@revelio/db`). No separate database.
- Server instance `app/web/src/lib/auth.ts`; a client for React; a catch-all route handler `app/web/src/app/api/auth/[...all]/route.ts`. Server-only helpers `getSession()` and `requireRole('editor' | 'admin')`.

## Flow

- **Registration:** email + **username** (unique). New accounts get role `user`.
- **Login (passwordless):** enter email → a 6-digit OTP is emailed → enter the code → a DB-backed session cookie is created.
- **Logout:** clears the session.
- **Email delivery** is pluggable via a `sendEmail` function:
  - **Dev:** log the OTP to the server console (no external service needed).
  - **Prod:** a real provider (e.g. Resend/SMTP) configured via env — **deferred to Plan 5**.

## Roles & gating

- Roles: `user` (default), `editor`, `admin`.
- `requireRole(role)` (server-only) guards the edit server actions/routes added in 4b-2; returns/redirects for unauthorized users.
- **First admin:** an env `ADMIN_EMAILS` (comma-separated). On sign-up, if the email is in `ADMIN_EMAILS`, the account is created/promoted to `admin`. Admins later promote others to `editor` (promote UI is a later mini-slice; until then, manual/DB or admin action).

## Data / schema

- Better Auth's schema (user, session, account/verification tables) is generated via its CLI and added to `@revelio/db` `schema.ts`; the consolidated migration is **regenerated** (existing project pattern — requires a fresh DB or re-seed, per the Plan 5 migration TODO).
- Adds `username` (unique) and `role` to the user table (via the username/admin plugins).

## UI (minimal)

- `/login` (localized) — an email field → "enter the 6-digit code" step → done. Registration collects email + username.
- **Header account state:** show the logged-in **username + Logout**; otherwise a **Login** link. Placed in the header nav next to the language switcher.
- The rest of the site is unchanged and public.

## Scope

- **IN:** registration (email + username), OTP login, logout, session, `role` field + `requireRole` helper, `ADMIN_EMAILS` bootstrap, minimal login UI + header account state.
- **OUT (later slices):** actual card editing (4b-2), decks/favorites (4c), production email provider (Plan 5), an admin UI to promote users.

## Env

- `BETTER_AUTH_SECRET` (session signing), `BETTER_AUTH_URL` (base URL), `ADMIN_EMAILS` (bootstrap admins). Reuses `DATABASE_URL`. Prod email-provider vars deferred.

## Testing

- **Integration (real Postgres):** request OTP → verify OTP → session established; username uniqueness; `ADMIN_EMAILS` promotion on sign-up.
- **`requireRole` gating:** unauthorized (user) is blocked; editor/admin passes.
- **Resilient e2e:** register → read the OTP from the dev console/test hook → logged in; a non-editor cannot reach an editor-gated action.

## Deferred / notes

- Rate-limiting on OTP requests (Better Auth has options) — enable sensible defaults; revisit for prod.
- The regenerated-migration pattern means adding auth tables needs a fresh DB / re-seed (see the Plan 5 migration-strategy TODO).
- Prod email delivery + email verification/anti-abuse hardening land in Plan 5.

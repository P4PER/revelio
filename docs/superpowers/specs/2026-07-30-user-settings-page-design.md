# User settings page

**Date:** 2026-07-30
**Type:** Feature (new authenticated route + write actions + Better Auth config)
**Scope:** `web` workspace (new route, components, actions, i18n), `db` workspace (one export aggregator query), Better Auth server config.

## Problem

Signed-in users have no way to manage their own account. There is no self-service
route to change their username, change the email they sign in with, download the
data Revelio holds about them, or delete their account. Everything user-facing
today (decks, collection) is content; account management is missing entirely.

This is also a data-rights gap: users cannot export or delete their own data.

## Goals

A single settings page lets a signed-in user:

1. **Change their username** (their public handle, shown on published decks).
2. **Change their sign-in email**, verified by a code sent to the new address.
3. **Export their data** as one JSON download.
4. **Delete their account**, confirmed by an emailed code, cascading all their data.

Non-goals: password management (auth is OTP-only — there is no password),
notification preferences, avatar/image upload, admin-only settings (those live in
`adminSettings`).

## Constraints from the codebase

- **Auth is OTP-only.** `emailAndPassword` is disabled in `src/lib/auth.ts`. There
  is no password to re-enter, so both sensitive flows (email change, delete) are
  gated by a **one-time code**, reusing the existing email-OTP + `sendMail` infra.
- **Write path = server actions.** All mutations go through `'use server'` actions
  in `src/lib/*-actions.ts`, returning the shared discriminated result
  `{ ok: true } | { ok: false; error: string }`, validated with a module-scope
  `zod` schema (`.safeParse`), gated on the session first. The client wraps the
  call in try/catch and reports via sonner `toast.success` / `toast.error`. This
  is the **only** error-handling pattern used and the settings page follows it.
- **Deletes cascade.** Every user-owned table (`decks`, `deckCards`, `deckLikes`,
  `deckViews`, `collections`, `userCards`, plus auth `session`/`account`) has
  `userId → user.id, onDelete: 'cascade'`. `deleteUserById(db, id)` already exists
  and is a single `delete(user)` — the DB removes the rest.
- **Reusable pieces that already exist:** `usernameAvailable()` and
  `authClient.updateUser({ username, displayUsername })` (from the register flow);
  per-user read queries `listDecksByUser`, `getOwnedCardIds`, `getDuplicateCardIds`,
  `getCollectionSummary`, `getCollectionVisibility`; the collection
  `ResponsiveSidebar`; shadcn `input`, `input-otp`, `form`/`FormMessage`,
  `field-error`, `alert-dialog`, `button`, `sonner`.

## Design

### Route & gating

- New route `src/app/[locale]/settings/page.tsx`, a server component with
  `export const dynamic = 'force-dynamic'` and `robots: { index: false }` (same as
  the admin subtree). It calls `getSession()`; if `!session?.user` it redirects to
  `/login` (locale-aware). It passes the current `user` (username, email, role,
  createdAt) into the client shell.
- Add a **"Settings"** link to `src/components/account-menu.tsx`, above sign-out,
  shown to every signed-in user (not role-gated).

### Shell — left nav + content

Reuse the collection nav pattern: `ResponsiveSidebar` with `title` = "Settings",
a `w-64` sticky rail on ≥1024px that collapses to a left `Sheet` drawer below that.
Nav items render with the shared active style (`bg-gradient-to-r from-accent/25
to-accent/10 shadow-[inset_3px_0_0_var(--color-primary)]`, `rounded-lg px-3 py-2
text-sm`, `hover:bg-accent/50`). Items:

```
Settings
  Profile        ← username
  Email          ← change sign-in address (OTP)
  Your data      ← export JSON
  Danger zone    ← delete account (OTP)   (danger-tinted)
```

Section selection is client-side (local state, no route change) — the right pane
swaps between four panes. Page header: `Settings` + lead "Manage your Revelio
account". No "signed in as" line.

### Profile pane

- One editable field, **Username** (shadcn `input`), plus read-only Email, role,
  and join date for context.
- Client form: react-hook-form + zod (new schema factory
  `src/lib/schemas/settings.ts`, i18n messages injected like `schemas/auth.ts`).
  Live availability check debounced against `usernameAvailable()`; inline
  `FormMessage` shows "taken" / validation errors from the `validation` + new
  `settings` namespaces.
- Save calls a `updateUsername` server action (gated on session, validates, calls
  Better Auth server-side `auth.api.updateUser` for the *current* user, updating
  both `username` and `displayUsername`), then toast + `revalidatePath`.

### Email pane

Two-step, OTP-to-the-**new**-address:

1. **Request** — user enters a new email (zod-validated inline). `requestEmailChange`
   action: gate on session, reject if the address already belongs to an account,
   generate a short-lived 6-digit code bound to `{ userId, newEmail }`, send it via
   `sendMail` (new template, mirroring the OTP sign-in template).
2. **Verify** — user enters the code (`input-otp`). `confirmEmailChange` action:
   validate the code+newEmail pair; on success update `user.email` and clear the
   code; wrong/expired code → `{ ok: false, error }` → inline error + toast.

The code store: prefer reusing the emailOTP mechanism / `verification` table
rather than inventing a new one — **resolved in the plan** (see Open questions).

### Your data pane

- A single **Export as JSON** button. `exportMyData` server action gates on
  session and composes the existing per-user queries into one object:

  ```jsonc
  {
    "profile":    { username, email, role, createdAt },
    "decks":      [ { name, format, cards: [...] }, ... ],
    "collection": { visibility, ownedCards: [...] },
    "likes":      [ deckId, ... ]
  }
  ```

  A thin `getUserExport(db, userId)` aggregator in `@revelio/db` wraps the existing
  read queries so the action stays declarative. The client turns the returned
  object into a `Blob` download named `revelio-export-<username>.json`. Failure →
  `toast.error`.

### Danger zone pane

- **Delete account** button opens an `AlertDialog` that lists what will be removed
  (decks, collection, likes/views) and requires an emailed code:
  1. Opening the dialog (or a "send code" step) triggers `requestAccountDeletion`
     → emails a 6-digit code to the account address.
  2. User enters the code (`input-otp`); `confirmAccountDeletion` validates it,
     then calls `deleteUserById` (DB cascades handle decks/collection/likes/views),
     clears the session, and the client redirects home with a toast.
- Wrong/expired code → inline error, no deletion.

### Better Auth config

`changeEmail` and self-`deleteUser` are **not** currently wired in `auth.ts`.
Rather than adopt Better Auth's built-in link/password-oriented `changeEmail`, both
sensitive flows are implemented as **custom server actions that reuse the existing
email-OTP + `sendMail`** infrastructure (consistent with the passwordless model).
The exact Better Auth surface used for the final `user.email` update and the code
store is settled in the plan.

## i18n

New top-level `settings` namespace in `messages/en.json` **and** `de.json`
(section titles, field labels, hints, button labels, success/error toasts,
delete-confirmation copy). Reuse the shared `validation` namespace for field-level
messages (`required`, `email`, `sixDigits`, username `taken`). Add the account-menu
"Settings" label (under `nav` or `auth`). No hardcoded user-facing strings.

## Error handling (uniform)

Every action returns `{ ok: true } | { ok: false; error: string }`. Clients call
inside try/catch (a thrown/forbidden path still surfaces), branch on `res.ok`, and
report with sonner. Field-level validation stays inline via `FormMessage` /
`field-error`; action-level failures are toasts. No new error convention.

## Testing

- **Unit (vitest, web):** the `settings` zod schema (valid/invalid username,
  email); the export-object shape from `getUserExport` (mocked queries); action
  result branching for the OTP mismatch path.
- **`db`:** `getUserExport` composes the right per-user rows (Testcontainers, like
  existing query tests).
- **e2e (Playwright):** signed-in user opens `/settings`, changes username (sees
  availability + success toast), and the delete dialog requires a code. Email/delete
  OTP send is stubbed at the action boundary.
- `npm run typecheck`, `npm test -w web`, `npm run lint -w web` pass. If Better Auth
  wiring touches nothing in `db/schema.ts`, no migration; if a code-store column is
  added, generate a migration per `docs/MIGRATIONS.md`.

## Open questions (resolve in the plan)

1. **OTP code store for email-change / delete.** Reuse Better Auth's emailOTP
   plugin (which type?) vs. a short-lived row in the `verification` table vs. a
   small dedicated table. Affects whether a migration is needed.
2. **Session invalidation on email change.** Should changing the email sign out
   other active sessions? Default: no (out of scope) unless we decide otherwise.

## Out of scope

- Password/credential management (none exists — OTP-only).
- Avatar/image, notification or locale preferences.
- Admin-facing settings (`adminSettings` already covers those).
- Re-authentication timeouts / "sudo mode" beyond the per-action OTP.

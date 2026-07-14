# Admin User Management — Design

**Date:** 2026-07-14
**Status:** Approved (brainstorm) — pending implementation plan

## Purpose

Give admins a place to see every registered user and moderate accounts:
change a user's role, ban/unban them, reset their password, and delete them.
The backend largely exists already — Better Auth's `admin()` plugin is wired in
`web/src/lib/auth.ts` and the `user` table carries `role`, `banned`,
`banReason`, `banExpires`. This feature is the admin-facing UI plus the thin
server actions and queries behind it.

This is a **moderation** tool, not content authoring. The editable surface per
user is small (role + ban + password + delete), which shapes the UI choices
below.

## Scope

In scope (v1):

- List all users in a searchable, filterable table.
- Edit page per user with four actions: change role, ban/unban, set password,
  delete.
- Admin-only access.
- Safety guards against admin self-lockout and removing the last admin.

Out of scope (v1):

- Creating users from the admin UI (users self-register).
- Impersonation, session management, bulk actions, audit log, email
  invitations. (Better Auth supports some of these; deferred.)

## Decisions

- **Edit surface = separate page**, not a side sheet. Chosen for consistency
  with the existing `/admin/sets/[code]/edit` pattern and room to grow.
  (A side sheet was considered and is arguably better-suited to pure
  moderation, but page-consistency won.)
- **No create-user flow** — registration is self-service.
- **Delete is a hard delete** and cascades (see Data model note).
- **Password changes route through Better Auth**, everything else is direct
  Drizzle, matching the `*-actions.ts` + `@revelio/db` convention.

## Access control

- New pages live under the existing `/[locale]/admin` route group. That
  layout (`admin/layout.tsx`) only requires the `editor` role, so user
  management pages **must additionally enforce `admin`**:
  - Both `admin/users/page.tsx` and `admin/users/[id]/edit/page.tsx` call
    `getSession()` + `hasRequiredRole(role, 'admin')`, and `notFound()` when it
    fails.
  - Every server action calls `await requireRole('admin')` first.
- The admin nav entry for "Users" renders only when the session role is
  `admin`.

## Routes

| Route | Type | Guard |
|-------|------|-------|
| `/[locale]/admin/users` | Server component (list) | admin |
| `/[locale]/admin/users/[id]/edit` | Server component (edit) | admin |

No `new` route.

## List page + table

Server component fetches rows via a new `listUsers(db)` query and renders a
client table component `admin-users-table.tsx`, built on `@tanstack/react-table`
exactly like `admin-sets-table.tsx`.

- **Columns:** avatar (`image`, initials fallback), name, email (+ verified
  badge), username, role (badge), status (Active / Banned badge), joined
  (`createdAt`, formatted).
- **Row → edit:** the name cell is a locale-aware `Link` to
  `/admin/users/[id]/edit` (mirrors the sets table).
- **Search:** single input filtering across name + email + username (custom
  `globalFilterFn`, like `nameOrCode`).
- **Filters:** role toggle buttons (user / editor / admin) and status toggle
  (active / banned), using the same pre-filter + toggle pattern as the sets
  table's official/fan toggles.
- **Sort:** default by joined date; pagination page size 20.

## Edit page

A stacked form page (server component loads the user via `getUserById`; the
interactive parts are client sub-components). Sections top to bottom:

1. **Identity (read-only):** avatar, name, email + verified badge, username,
   joined date.
2. **Role:** `Select` with user / editor / admin → Save. Disabled for your own
   row (self-demote blocked) and when this is the last admin.
3. **Ban status:**
   - If active: reason (`Input`/textarea) + optional expiry (the shared
     tz-safe `DatePicker` from the sets work) → **Ban** button behind an
     `AlertDialog` confirm.
   - If banned: show current reason + expiry, and an **Unban** button.
   - Disabled for your own row.
4. **Password:** new-password field → Save. Routes through
   `auth.api.setUserPassword`. Allowed on your own account.
5. **Danger zone:** **Delete user** behind an `AlertDialog` whose copy spells
   out the cascade ("also permanently deletes their N decks and likes").
   Disabled for your own row and for the last admin.

## Server actions — `web/src/lib/user-admin-actions.ts` (`'use server'`)

Each begins with `await requireRole('admin')` and returns a redacted
success/error result consistent with existing actions. All revalidate the
affected list/edit paths.

- `setUserRole(userId, role)` — Drizzle update of `user.role`.
- `banUser(userId, reason, expiresAt?)` — Drizzle update of
  `banned` / `banReason` / `banExpires`.
- `unbanUser(userId)` — clears those three fields.
- `setUserPassword(userId, newPassword)` — `auth.api.setUserPassword`
  (correct hashing).
- `deleteUser(userId)` — Drizzle delete; DB cascade removes decks/likes.

### Safety guards (enforced server-side, reflected in UI)

- The acting admin **cannot demote, ban, or delete themselves** — actions
  compare `userId` to the session user id and throw. UI disables those controls
  on your own row.
- **Last-admin protection:** demoting or deleting a user throws if they are the
  only remaining `admin`. Requires an admin-count check in the action.
- Self password change **is** allowed.

## Data layer — `@revelio/db`

- `listUsers(db)` — returns the shape the table needs (id, name, email,
  emailVerified, image, username, role, banned, createdAt).
- `getUserById(db, id)` — full row for the edit page (adds banReason,
  banExpires).
- Small mutation helpers (`updateUserRole`, `setUserBan`, `clearUserBan`,
  `deleteUser`, `countAdmins`) in `queries.ts`, called by the actions.

### Data model note (cascade)

Every FK to `user.id` in `schema.ts` is `onDelete: 'cascade'` (decks, deck
likes, deck collaborators). Deleting a user therefore hard-deletes all their
decks and related rows. This is why **ban** is the reversible moderation tool
and **delete** is the nuclear one, and why the delete confirm must surface the
count.

## i18n

New `admin.users.*` message namespace mirroring `admin.sets.*` (title, desc,
column headers, filter labels, action labels, confirm copy, success/error
toasts), added across all locales.

## Testing

- **DB (Testcontainers):** `listUsers` / `getUserById` return correct shapes;
  `countAdmins`; mutation helpers.
- **Actions:** non-admin caller → throws; self demote/ban/delete → throws;
  last-admin demote/delete → throws; happy paths update expected fields.
- **Table:** render + search + role/status filter behavior, mirroring the
  existing sets-table test.

## Follow-ups / deferred

- Impersonation, forced session revocation, bulk moderation, audit logging,
  email invites.
- Consider a `?user=<id>`-backed slide-over later if moderation volume makes
  full-page navigation feel heavy.

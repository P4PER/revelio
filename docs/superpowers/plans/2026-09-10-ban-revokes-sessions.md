# Ban Enforcement and Self-Ban Field Plan

**Goal:** Make a ban take effect immediately instead of at session expiry, and grey out the
ban expiry date field on your own user like every other control in that form already is.

**Architecture:** Two independent one-line-scale fixes in two workspaces.

1. `@revelio/db`'s `setUserBan` writes the `banned` / `banReason` / `banExpires` flags and
   nothing else. Better Auth's admin plugin only reads `banned` in its `session.create.before`
   hook (`better-auth/dist/plugins/admin/admin.mjs:33`), i.e. on the sign-in path, so a user
   banned mid-session keeps browsing until their session row expires. Better Auth's own
   `/admin/ban-user` route pairs the flag write with
   `internalAdapter.deleteUserSessions(userId)` (`routes.mjs:529`); we write the flags
   directly and never got that half. Fix: `setUserBan` deletes the user's `session` rows in
   the same transaction as the flag write. The auth config sets no `session.cookieCache`, so
   `auth.api.getSession` reads the table on every request and the revocation lands on the
   next one.
2. `DatePicker` accepts no `disabled` prop, so `user-ban-form.tsx` cannot pass one and the
   expiry trigger stays live on your own user while the reason `Input` and both `Button`s
   grey out. Fix: `DatePicker` takes `disabled` and forwards it to its `PopoverTrigger`
   button; `UserBanForm` passes the `disabled` it already receives.

**Tech Stack:** TypeScript, Drizzle, postgres.js, Next.js 16, Vitest + Testing Library.

**Spec:** none - (1) is the deferred item flagged during the `feat/connections-pane-rework`
review, (2) is a bug report from manual admin testing.

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use
  `/usr/local/bin/npm` and `/usr/local/bin/node`; `gh` and `gpg` live in `/opt/homebrew/bin`.
- Run tests per workspace. Never run the bare `npm test` at the workspace root locally:
  `@revelio/ingest`'s `test/main.test.ts` deletes the dev `cards-en` / `cards-de`
  Meilisearch indexes.
- Code comments are ASCII only. Conventional Commits. No Claude/Claude Code attribution.
- Branch: `fix/ban-revokes-sessions`, created off `main`.
- No schema change, so no migration.

## Test strategy

The `db/` workspace has no test script of its own, but its queries are covered from
`ingest/test/`, which runs them against a migrated Postgres (`withMigratedDb`, an external
`TEST_DATABASE_URL` or a Testcontainers fallback). `setUserBan` already has a case there in
`test/user-admin.test.ts`, so change (1) is covered in that harness. Change (2) is covered by
unit tests - one on `DatePicker` for the new prop, one on `UserBanForm` for the self case.

---

## Task 1: DatePicker takes a disabled prop

**Files:** `web/src/components/date-picker.tsx`,
`web/src/components/__tests__/date-picker.test.tsx`

1. Failing test: rendering with `disabled` leaves the trigger button disabled, and the
   default (no prop) leaves it enabled.
2. Add `disabled?: boolean` to the prop type and pass it to the `PopoverTrigger` `Button`.
3. `npm test -w web -- src/components/__tests__/date-picker.test.tsx` green.

## Task 2: UserBanForm greys out the expiry field on your own user

**Files:** `web/src/components/admin/user-ban-form.tsx`,
`web/src/components/admin/__tests__/user-ban-form.test.tsx` (new)

1. Failing test: with `disabled` (the self case) the reason input, the ban button and the
   expiry trigger are all disabled; without it, none are.
2. Pass `disabled={disabled}` to the `DatePicker`, matching the sibling reason `Input`.
3. `npm test -w web -- src/components/admin/__tests__/user-ban-form.test.tsx` green.

## Task 3: setUserBan revokes the banned user's sessions

**Files:** `db/src/queries.ts`

1. Wrap the existing `update(user)` in `db.transaction`, and add
   `tx.delete(session).where(eq(session.userId, id))` beside it, with a comment naming why
   (the admin plugin only checks `banned` on session create).
2. Import `session` from `./auth-schema` if it is not already in scope there.
3. `npm run typecheck -w @revelio/db` clean.
4. Extend `ingest/test/user-admin.test.ts` with a case that seeds a session row for the
   banned user and one for a bystander, then asserts only the banned user's row is gone and
   that `clearUserBan` does not resurrect it.
5. Run that file alone - never the whole `@revelio/ingest` suite locally, `test/main.test.ts`
   deletes the dev Meilisearch indexes:
   `TEST_DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio npx vitest run test/user-admin.test.ts`

## Verification

- `npm test -w web`, `npm test -w core`, `npm test -w @revelio/search`, `npm test -w @revelio/bot`
- `npm run typecheck` (all workspaces)
- `npm run lint -w web`
- `npx vitest run test/user-admin.test.ts` in `ingest/`, against a live Postgres.

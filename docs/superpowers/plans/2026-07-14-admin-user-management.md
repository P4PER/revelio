# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a page to list every user and moderate accounts — change role, ban/unban, set password, delete — behind admin-only access with self-lockout and last-admin guards.

**Architecture:** Two admin-only server-component pages (`/admin/users` list, `/admin/users/[id]/edit`) mirroring the existing `/admin/sets` pattern: a `@tanstack/react-table` client table for the list, and a stacked edit page composed of small client sub-forms. Writes go through `'use server'` actions in `user-admin-actions.ts` that enforce `requireRole('admin')` + safety guards; role/ban/delete are direct Drizzle updates, password goes through `auth.api.setUserPassword` for correct hashing. New read/write query helpers live in `@revelio/db`.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Drizzle/Postgres, Better Auth `admin()` plugin, `@tanstack/react-table`, shadcn/Radix (Select, AlertDialog, Sheet-not-used), Tailwind v4, Vitest + Testing Library, Testcontainers.

## Global Constraints

- All app commands run from `app/`. Tests: `npm test -w web` (mocked) / `npm test -w @revelio/ingest` (Testcontainers DB tests). Typecheck: `npm run typecheck`. Lint: `npm run lint -w web`.
- Roles are single-valued text: `user` < `editor` < `admin` (`web/src/lib/roles.ts`). A null/absent role means `user`.
- Locale-aware links use `Link` from `@/../i18n/navigation`, never bare `next/link`.
- Server actions are `'use server'`, must never leak secrets, and return a redacted `{ ok: true } | { ok: false; error: string }`.
- Two locales must stay in sync: `web/messages/en.json` and `web/messages/de.json`. Every new key added to both.
- DB-integration (real Postgres) tests live under `ingest/test/*.test.ts` and use `withMigratedDb()` from `ingest/test/helpers`. Pure/mocked tests live beside their code under `__tests__/`.
- Migrations are append-only; **this feature adds no schema changes** — the `user` table already has `role`, `banned`, `banReason`, `banExpires`.
- Conventional Commits. Docs UPPERCASE. Prose in English.

---

## File Structure

**Create:**
- `app/db/src/queries.ts` — (modify) add user-admin read/write helpers + row types.
- `app/ingest/test/user-admin.test.ts` — Testcontainers tests for the new queries.
- `app/web/src/lib/user-admin-actions.ts` — the five server actions + guards.
- `app/web/src/lib/__tests__/user-admin-actions.test.ts` — mocked action tests.
- `app/web/src/components/admin-users-table.tsx` — client list table.
- `app/web/src/components/__tests__/admin-users-table.test.tsx` — table render/filter test.
- `app/web/src/components/user-role-form.tsx` — role Select + Save (client).
- `app/web/src/components/user-ban-form.tsx` — ban/unban form + AlertDialog (client).
- `app/web/src/components/user-password-form.tsx` — set-password form (client).
- `app/web/src/components/delete-user-button.tsx` — delete + AlertDialog (client).
- `app/web/src/components/__tests__/delete-user-button.test.tsx` — representative sub-form test.
- `app/web/src/app/[locale]/admin/users/page.tsx` — list page (admin guard).
- `app/web/src/app/[locale]/admin/users/[id]/edit/page.tsx` — edit page (admin guard).

**Modify:**
- `app/db/src/index.ts` — export new query fns + types.
- `app/web/src/app/[locale]/admin/page.tsx` — add admin-only "Users" nav card.
- `app/web/messages/en.json`, `app/web/messages/de.json` — add `admin.users.*`.

---

## Task 1: DB query helpers for user admin

**Files:**
- Modify: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts`
- Test: `app/ingest/test/user-admin.test.ts`

**Interfaces:**
- Consumes: `DB` (from `./client`), `user` (from `./auth-schema`), `decks` (from `./schema`), drizzle `eq`, `desc`, `count`.
- Produces:
  - `type UserAdminRow = { id: string; name: string; email: string; emailVerified: boolean; image: string | null; username: string | null; role: string; banned: boolean; createdAt: Date }`
  - `type UserAdminDetail = UserAdminRow & { banReason: string | null; banExpires: Date | null }`
  - `listUsersForAdmin(db: DB): Promise<UserAdminRow[]>`
  - `getUserForAdmin(db: DB, id: string): Promise<UserAdminDetail | null>`
  - `countAdmins(db: DB): Promise<number>`
  - `countUserDecks(db: DB, userId: string): Promise<number>`
  - `updateUserRole(db: DB, id: string, role: string): Promise<void>`
  - `setUserBan(db: DB, id: string, reason: string | null, expires: Date | null): Promise<void>`
  - `clearUserBan(db: DB, id: string): Promise<void>`
  - `deleteUserById(db: DB, id: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/user-admin.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { schema } from '@revelio/db'
import {
  listUsersForAdmin, getUserForAdmin, countAdmins, countUserDecks,
  updateUserRole, setUserBan, clearUserBan, deleteUserById,
} from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

async function seedUser(id: string, over: Partial<typeof schema.user.$inferInsert> = {}) {
  await ctx.db.insert(schema.user).values({
    id, name: `User ${id}`, email: `${id}@x.test`, emailVerified: true,
    role: 'user', banned: false, ...over,
  })
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  await seedUser('u1', { role: 'admin' })
  await seedUser('u2', { role: 'editor', username: 'ed' })
  await seedUser('u3', { role: 'user', banned: true, banReason: 'spam' })
  await ctx.db.insert(schema.decks).values({
    id: 'd1', userId: 'u2', name: 'Deck', format: 'standard', isPublic: false,
  })
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('user-admin queries', () => {
  it('lists all users with the row shape the table needs', async () => {
    const rows = await listUsersForAdmin(ctx.db)
    expect(rows).toHaveLength(3)
    const u2 = rows.find((r) => r.id === 'u2')!
    expect(u2).toMatchObject({ role: 'editor', username: 'ed', banned: false })
    expect(u2.createdAt).toBeInstanceOf(Date)
  })

  it('normalizes a null role to "user"', async () => {
    await seedUser('u4', { role: null })
    const rows = await listUsersForAdmin(ctx.db)
    expect(rows.find((r) => r.id === 'u4')!.role).toBe('user')
    await deleteUserById(ctx.db, 'u4')
  })

  it('reads one user with ban detail', async () => {
    const d = await getUserForAdmin(ctx.db, 'u3')
    expect(d).toMatchObject({ id: 'u3', banned: true, banReason: 'spam' })
    expect(await getUserForAdmin(ctx.db, 'nope')).toBeNull()
  })

  it('counts admins and a user\'s decks', async () => {
    expect(await countAdmins(ctx.db)).toBe(1)
    expect(await countUserDecks(ctx.db, 'u2')).toBe(1)
    expect(await countUserDecks(ctx.db, 'u1')).toBe(0)
  })

  it('updates role', async () => {
    await updateUserRole(ctx.db, 'u2', 'admin')
    expect((await getUserForAdmin(ctx.db, 'u2'))!.role).toBe('admin')
    expect(await countAdmins(ctx.db)).toBe(2)
    await updateUserRole(ctx.db, 'u2', 'editor')
  })

  it('sets and clears a ban', async () => {
    const exp = new Date('2030-01-01T00:00:00Z')
    await setUserBan(ctx.db, 'u2', 'rules', exp)
    let d = (await getUserForAdmin(ctx.db, 'u2'))!
    expect(d.banned).toBe(true)
    expect(d.banReason).toBe('rules')
    await clearUserBan(ctx.db, 'u2')
    d = (await getUserForAdmin(ctx.db, 'u2'))!
    expect(d.banned).toBe(false)
    expect(d.banReason).toBeNull()
    expect(d.banExpires).toBeNull()
  })

  it('deletes a user and cascades their decks', async () => {
    await deleteUserById(ctx.db, 'u2')
    expect(await getUserForAdmin(ctx.db, 'u2')).toBeNull()
    expect(await countUserDecks(ctx.db, 'u2')).toBe(0)
  })
})
```

> Note: match the `schema.decks` insert to the actual required columns of `decks` in `db/src/schema.ts` (check `$inferInsert`); adjust `format`/`isPublic`/etc. field names if they differ. If `decks` requires more non-null columns, add them here.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w @revelio/ingest -- user-admin`
Expected: FAIL — `listUsersForAdmin` (etc.) is not exported from `@revelio/db`.

- [ ] **Step 3: Add the query helpers**

In `app/db/src/queries.ts`, ensure these imports exist at the top (add what's missing):

```ts
import { eq, desc, count } from 'drizzle-orm'
import { user } from './auth-schema'
import { decks } from './schema' // if not already imported
```

Append to `app/db/src/queries.ts`:

```ts
export type UserAdminRow = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  username: string | null
  role: string
  banned: boolean
  createdAt: Date
}

export type UserAdminDetail = UserAdminRow & {
  banReason: string | null
  banExpires: Date | null
}

export async function listUsersForAdmin(db: DB): Promise<UserAdminRow[]> {
  const rows = await db.select().from(user).orderBy(desc(user.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
  }))
}

export async function getUserForAdmin(db: DB, id: string): Promise<UserAdminDetail | null> {
  const [r] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
    banReason: r.banReason,
    banExpires: r.banExpires,
  }
}

export async function countAdmins(db: DB): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'))
  return Number(row?.n ?? 0)
}

export async function countUserDecks(db: DB, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(decks).where(eq(decks.userId, userId))
  return Number(row?.n ?? 0)
}

export async function updateUserRole(db: DB, id: string, role: string): Promise<void> {
  await db.update(user).set({ role }).where(eq(user.id, id))
}

export async function setUserBan(
  db: DB, id: string, reason: string | null, expires: Date | null,
): Promise<void> {
  await db.update(user)
    .set({ banned: true, banReason: reason, banExpires: expires })
    .where(eq(user.id, id))
}

export async function clearUserBan(db: DB, id: string): Promise<void> {
  await db.update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, id))
}

export async function deleteUserById(db: DB, id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}
```

- [ ] **Step 4: Export from the db barrel**

In `app/db/src/index.ts`, add the function names to the `export { ... } from './queries'` list and the types to the `export type { ... } from './queries'` list:

```ts
// add to the value export from './queries':
listUsersForAdmin, getUserForAdmin, countAdmins, countUserDecks,
updateUserRole, setUserBan, clearUserBan, deleteUserById,
// add to the type export from './queries':
UserAdminRow, UserAdminDetail,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm test -w @revelio/ingest -- user-admin`
Expected: PASS (all cases).
Then: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/user-admin.test.ts
git commit -m "feat(db): user-admin read/write query helpers"
```

---

## Task 2: Server actions with guards

**Files:**
- Create: `app/web/src/lib/user-admin-actions.ts`
- Test: `app/web/src/lib/__tests__/user-admin-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/session` (returns a session where `session.user.id` and `session.user.role` exist); `getDb` from `@/lib/db`; the Task 1 query fns from `@revelio/db`; `auth` from `@/lib/auth`; `headers` from `next/headers`; `revalidatePath` from `next/cache`.
- Produces (all `'use server'`):
  - `type UserActionResult = { ok: true } | { ok: false; error: string }`
  - `setUserRole(userId: string, role: string): Promise<UserActionResult>`
  - `banUser(userId: string, reason: string, expiresAt: string | null): Promise<UserActionResult>`
  - `unbanUser(userId: string): Promise<UserActionResult>`
  - `setUserPassword(userId: string, newPassword: string): Promise<UserActionResult>`
  - `deleteUser(userId: string): Promise<UserActionResult>`
  - Error codes used by the UI: `'invalid'`, `'self'`, `'last-admin'`, `'forbidden'`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/user-admin-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { id: 'me', role: 'admin' } })),
  updateUserRole: vi.fn(async () => {}),
  setUserBan: vi.fn(async () => {}),
  clearUserBan: vi.fn(async () => {}),
  deleteUserById: vi.fn(async () => {}),
  getUserForAdmin: vi.fn(async () => ({ id: 'u2', role: 'user' })),
  countAdmins: vi.fn(async () => 2),
  setUserPassword: vi.fn(async () => ({})),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  updateUserRole: m.updateUserRole, setUserBan: m.setUserBan, clearUserBan: m.clearUserBan,
  deleteUserById: m.deleteUserById, getUserForAdmin: m.getUserForAdmin, countAdmins: m.countAdmins,
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { setUserPassword: m.setUserPassword } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import {
  setUserRole, banUser, unbanUser, setUserPassword, deleteUser,
} from '../user-admin-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.requireRole.mockResolvedValue({ user: { id: 'me', role: 'admin' } })
  m.getUserForAdmin.mockResolvedValue({ id: 'u2', role: 'user' })
  m.countAdmins.mockResolvedValue(2)
})

describe('setUserRole', () => {
  it('rejects a non-admin before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await setUserRole('u2', 'editor').catch((e) => { caught = e })
    expect((caught as Error).message).toBe('Forbidden')
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('blocks changing your own role', async () => {
    const res = await setUserRole('me', 'user')
    expect(res).toEqual({ ok: false, error: 'self' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('blocks demoting the last admin', async () => {
    m.getUserForAdmin.mockResolvedValueOnce({ id: 'u2', role: 'admin' })
    m.countAdmins.mockResolvedValueOnce(1)
    const res = await setUserRole('u2', 'editor')
    expect(res).toEqual({ ok: false, error: 'last-admin' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('updates the role and revalidates', async () => {
    const res = await setUserRole('u2', 'editor')
    expect(res).toEqual({ ok: true })
    expect(m.updateUserRole).toHaveBeenCalledWith(expect.anything(), 'u2', 'editor')
    expect(m.revalidatePath).toHaveBeenCalledWith('/admin/users')
  })

  it('rejects an unknown role value', async () => {
    const res = await setUserRole('u2', 'superuser')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })
})

describe('banUser / unbanUser', () => {
  it('blocks banning yourself', async () => {
    expect(await banUser('me', 'x', null)).toEqual({ ok: false, error: 'self' })
    expect(m.setUserBan).not.toHaveBeenCalled()
  })

  it('bans with a parsed expiry', async () => {
    const res = await banUser('u2', 'spam', '2030-01-01')
    expect(res).toEqual({ ok: true })
    const [, id, reason, expires] = m.setUserBan.mock.calls[0]
    expect(id).toBe('u2')
    expect(reason).toBe('spam')
    expect(expires).toBeInstanceOf(Date)
  })

  it('bans with no expiry (null)', async () => {
    await banUser('u2', 'spam', null)
    expect(m.setUserBan.mock.calls[0][3]).toBeNull()
  })

  it('unbans', async () => {
    expect(await unbanUser('u2')).toEqual({ ok: true })
    expect(m.clearUserBan).toHaveBeenCalledWith(expect.anything(), 'u2')
  })
})

describe('setUserPassword', () => {
  it('rejects a too-short password', async () => {
    const res = await setUserPassword('u2', 'short')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.setUserPassword).not.toHaveBeenCalled()
  })

  it('sets a valid password on your own account via better-auth', async () => {
    const res = await setUserPassword('me', 'longenough1')
    expect(res).toEqual({ ok: true })
    expect(m.setUserPassword).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'me', newPassword: 'longenough1' } }),
    )
  })
})

describe('deleteUser', () => {
  it('blocks deleting yourself', async () => {
    expect(await deleteUser('me')).toEqual({ ok: false, error: 'self' })
    expect(m.deleteUserById).not.toHaveBeenCalled()
  })

  it('blocks deleting the last admin', async () => {
    m.getUserForAdmin.mockResolvedValueOnce({ id: 'u2', role: 'admin' })
    m.countAdmins.mockResolvedValueOnce(1)
    expect(await deleteUser('u2')).toEqual({ ok: false, error: 'last-admin' })
    expect(m.deleteUserById).not.toHaveBeenCalled()
  })

  it('deletes and revalidates', async () => {
    expect(await deleteUser('u2')).toEqual({ ok: true })
    expect(m.deleteUserById).toHaveBeenCalledWith(expect.anything(), 'u2')
    expect(m.revalidatePath).toHaveBeenCalledWith('/admin/users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- user-admin-actions`
Expected: FAIL — `../user-admin-actions` does not exist.

- [ ] **Step 3: Write the actions**

Create `app/web/src/lib/user-admin-actions.ts`:

```ts
'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { auth } from '@/lib/auth'
import {
  getUserForAdmin, countAdmins, updateUserRole, setUserBan, clearUserBan, deleteUserById,
} from '@revelio/db'

export type UserActionResult = { ok: true } | { ok: false; error: string }

const ROLES = ['user', 'editor', 'admin'] as const
const MIN_PASSWORD = 8

function revalidateUser(userId: string) {
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}/edit`)
}

// True when removing/demoting `userId`'s admin status would leave zero admins.
async function wouldOrphanAdmins(db: ReturnType<typeof getDb>, userId: string): Promise<boolean> {
  const target = await getUserForAdmin(db, userId)
  if (target?.role !== 'admin') return false
  return (await countAdmins(db)) <= 1
}

export async function setUserRole(userId: string, role: string): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: 'invalid' }
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const db = getDb()
  if (role !== 'admin' && (await wouldOrphanAdmins(db, userId))) {
    return { ok: false, error: 'last-admin' }
  }
  await updateUserRole(db, userId, role)
  revalidateUser(userId)
  return { ok: true }
}

export async function banUser(
  userId: string, reason: string, expiresAt: string | null,
): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const expires = expiresAt ? new Date(expiresAt) : null
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: 'invalid' }
  const db = getDb()
  await setUserBan(db, userId, reason.trim() || null, expires)
  revalidateUser(userId)
  return { ok: true }
}

export async function unbanUser(userId: string): Promise<UserActionResult> {
  await requireRole('admin')
  await clearUserBan(getDb(), userId)
  revalidateUser(userId)
  return { ok: true }
}

export async function setUserPassword(
  userId: string, newPassword: string,
): Promise<UserActionResult> {
  await requireRole('admin')
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) {
    return { ok: false, error: 'invalid' }
  }
  await auth.api.setUserPassword({
    body: { userId, newPassword },
    headers: await headers(),
  })
  revalidateUser(userId)
  return { ok: true }
}

export async function deleteUser(userId: string): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const db = getDb()
  if (await wouldOrphanAdmins(db, userId)) return { ok: false, error: 'last-admin' }
  await deleteUserById(db, userId)
  revalidatePath('/admin/users')
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- user-admin-actions`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/user-admin-actions.ts app/web/src/lib/__tests__/user-admin-actions.test.ts
git commit -m "feat(web): admin user moderation server actions with self/last-admin guards"
```

---

## Task 3: Users list table + i18n keys

**Files:**
- Create: `app/web/src/components/admin-users-table.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/__tests__/admin-users-table.test.tsx`

**Interfaces:**
- Consumes: `UserAdminRow` from `@revelio/core`? — No: it's exported from `@revelio/db`. Import the type from `@revelio/db`. `Link` from `@/../i18n/navigation`; `@tanstack/react-table`; `Input`, `Button`, `Badge`, `Table*` from `@/components/ui/*`; `useTranslations` from `next-intl`.
- Produces: `export function AdminUsersTable({ users }: { users: UserAdminRow[] })`.

- [ ] **Step 1: Add the i18n keys (both locales)**

In `app/web/messages/en.json`, inside the `"admin"` object (as a sibling of `"sets"`), add:

```json
"users": {
  "title": "Users",
  "desc": "Manage user roles, bans, and accounts.",
  "searchPlaceholder": "Search name, email, or username…",
  "name": "Name",
  "email": "Email",
  "username": "Username",
  "role": "Role",
  "status": "Status",
  "joined": "Joined",
  "active": "Active",
  "banned": "Banned",
  "verified": "Verified",
  "roleUser": "User",
  "roleEditor": "Editor",
  "roleAdmin": "Admin",
  "noResults": "No matches",
  "edit": "Edit",
  "identity": "Account",
  "roleSection": "Role",
  "banSection": "Ban status",
  "passwordSection": "Password",
  "dangerSection": "Danger zone",
  "banReason": "Reason",
  "banExpires": "Expires (optional)",
  "banAction": "Ban user",
  "unbanAction": "Unban user",
  "banConfirmTitle": "Ban this user?",
  "banConfirmBody": "They will be unable to sign in until unbanned.",
  "newPassword": "New password",
  "setPassword": "Set password",
  "deleteAction": "Delete user",
  "deleteConfirmTitle": "Delete this user permanently?",
  "deleteConfirmBody": "This also permanently deletes their {decks} deck(s) and all related data. This cannot be undone.",
  "cancel": "Cancel",
  "save": "Save",
  "saved": "Saved",
  "saveError": "Could not save",
  "selfError": "You cannot do this to your own account.",
  "lastAdminError": "You cannot remove the last remaining admin.",
  "cannotSelf": "Not available on your own account"
}
```

In `app/web/messages/de.json`, add the same keys under `"admin"` with German values:

```json
"users": {
  "title": "Benutzer",
  "desc": "Benutzerrollen, Sperren und Konten verwalten.",
  "searchPlaceholder": "Name, E-Mail oder Benutzername suchen…",
  "name": "Name",
  "email": "E-Mail",
  "username": "Benutzername",
  "role": "Rolle",
  "status": "Status",
  "joined": "Beigetreten",
  "active": "Aktiv",
  "banned": "Gesperrt",
  "verified": "Verifiziert",
  "roleUser": "Benutzer",
  "roleEditor": "Redakteur",
  "roleAdmin": "Admin",
  "noResults": "Keine Treffer",
  "edit": "Bearbeiten",
  "identity": "Konto",
  "roleSection": "Rolle",
  "banSection": "Sperrstatus",
  "passwordSection": "Passwort",
  "dangerSection": "Gefahrenzone",
  "banReason": "Grund",
  "banExpires": "Läuft ab (optional)",
  "banAction": "Benutzer sperren",
  "unbanAction": "Sperre aufheben",
  "banConfirmTitle": "Diesen Benutzer sperren?",
  "banConfirmBody": "Er kann sich nicht anmelden, bis die Sperre aufgehoben wird.",
  "newPassword": "Neues Passwort",
  "setPassword": "Passwort setzen",
  "deleteAction": "Benutzer löschen",
  "deleteConfirmTitle": "Diesen Benutzer dauerhaft löschen?",
  "deleteConfirmBody": "Dies löscht auch dauerhaft {decks} Deck(s) und alle zugehörigen Daten. Dies kann nicht rückgängig gemacht werden.",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "saved": "Gespeichert",
  "saveError": "Konnte nicht gespeichert werden",
  "selfError": "Das können Sie nicht mit Ihrem eigenen Konto tun.",
  "lastAdminError": "Sie können den letzten verbleibenden Admin nicht entfernen.",
  "cannotSelf": "Für das eigene Konto nicht verfügbar"
}
```

- [ ] **Step 2: Check `Badge` exists**

Run: `ls app/web/src/components/ui/badge.tsx`
Expected: file exists (confirmed in repo). If missing, add via `npx shadcn@latest add badge` from `app/web`.

- [ ] **Step 3: Write the failing test**

Create `app/web/src/components/__tests__/admin-users-table.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { UserAdminRow } from '@revelio/db'
import { AdminUsersTable } from '../admin-users-table'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

const users: UserAdminRow[] = [
  { id: 'u1', name: 'Ann Admin', email: 'ann@x.test', emailVerified: true, image: null, username: 'ann', role: 'admin', banned: false, createdAt: new Date('2024-01-01') },
  { id: 'u2', name: 'Ed Editor', email: 'ed@x.test', emailVerified: true, image: null, username: 'ed', role: 'editor', banned: false, createdAt: new Date('2024-02-01') },
  { id: 'u3', name: 'Bob Banned', email: 'bob@x.test', emailVerified: false, image: null, username: null, role: 'user', banned: true, createdAt: new Date('2024-03-01') },
]

function renderTable(rows = users) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdminUsersTable users={rows} />
    </NextIntlClientProvider>,
  )
}
function rowNames(): string[] {
  return screen.getAllByRole('link').map((a) => a.textContent ?? '')
}

beforeEach(() => vi.clearAllMocks())

describe('AdminUsersTable', () => {
  it('renders a linked row per user pointing at its edit page', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'Ann Admin' })).toHaveAttribute('href', '/admin/users/u1/edit')
    expect(rowNames()).toHaveLength(3)
  })

  it('searches across name, email, and username', () => {
    renderTable()
    const search = screen.getByPlaceholderText(en.admin.users.searchPlaceholder)
    fireEvent.change(search, { target: { value: 'ed@x' } })
    expect(rowNames()).toEqual(['Ed Editor'])
    fireEvent.change(search, { target: { value: 'ann' } }) // username
    expect(rowNames()).toEqual(['Ann Admin'])
  })

  it('filters by banned status', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: en.admin.users.banned }))
    expect(rowNames()).toEqual(['Bob Banned'])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd app && npm test -w web -- admin-users-table`
Expected: FAIL — `../admin-users-table` does not exist.

- [ ] **Step 5: Write the table component**

Create `app/web/src/components/admin-users-table.tsx` (mirrors `admin-sets-table.tsx`):

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  type ColumnDef, type SortingState, type FilterFn,
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link } from '@/../i18n/navigation'
import type { UserAdminRow } from '@revelio/db'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const nameEmailUser: FilterFn<UserAdminRow> = (row, _id, value) => {
  const q = String(value).trim().toLowerCase()
  if (!q) return true
  const u = row.original
  return (
    u.name.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q) ||
    (u.username?.toLowerCase().includes(q) ?? false)
  )
}

export function AdminUsersTable({ users }: { users: UserAdminRow[] }) {
  const t = useTranslations('admin.users')
  const [globalFilter, setGlobalFilter] = useState('')
  const [showActive, setShowActive] = useState(false)
  const [showBanned, setShowBanned] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])

  const roleLabel = (r: string) =>
    r === 'admin' ? t('roleAdmin') : r === 'editor' ? t('roleEditor') : t('roleUser')

  const data = useMemo(() => {
    if (!showActive && !showBanned) return users
    return users.filter((u) => (showActive && !u.banned) || (showBanned && u.banned))
  }, [users, showActive, showBanned])

  const columns = useMemo<ColumnDef<UserAdminRow>[]>(() => [
    {
      accessorKey: 'name',
      header: t('name'),
      cell: ({ row }) => (
        <Link href={`/admin/users/${row.original.id}/edit`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'email',
      header: t('email'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.email}
          {row.original.emailVerified && (
            <span className="ml-2 text-xs text-primary">{t('verified')}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'username',
      header: t('username'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">{String(getValue() ?? '—')}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: t('role'),
      cell: ({ getValue }) => <Badge variant="secondary">{roleLabel(String(getValue()))}</Badge>,
    },
    {
      id: 'status',
      accessorFn: (u) => (u.banned ? 'banned' : 'active'),
      header: t('status'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.banned
          ? <Badge variant="destructive">{t('banned')}</Badge>
          : <span className="text-xs text-muted-foreground">{t('active')}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: t('joined'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {(getValue() as Date).toISOString().slice(0, 10)}
        </span>
      ),
    },
  ], [t])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: nameEmailUser,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const rows = table.getRowModel().rows

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-8 w-full pr-8"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label={t('searchPlaceholder')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="button" size="sm" variant={showActive ? 'secondary' : 'outline'} aria-pressed={showActive} onClick={() => setShowActive((v) => !v)}>
          {t('active')}
        </Button>
        <Button type="button" size="sm" variant={showBanned ? 'secondary' : 'outline'} aria-pressed={showBanned} onClick={() => setShowBanned((v) => !v)}>
          {t('banned')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort()
                  const dir = h.column.getIsSorted()
                  return (
                    <TableHead key={h.id}>
                      {sortable ? (
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp className="size-3" />
                            : dir === 'desc' ? <ArrowDown className="size-3" />
                              : <ChevronsUpDown className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {t('noResults')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd app && npm test -w web -- admin-users-table`
Expected: PASS (3 cases).

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/admin-users-table.tsx app/web/src/components/__tests__/admin-users-table.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): admin users table with search and status filter"
```

---

## Task 4: List page + admin guard + nav card

**Files:**
- Create: `app/web/src/app/[locale]/admin/users/page.tsx`
- Modify: `app/web/src/app/[locale]/admin/page.tsx`

**Interfaces:**
- Consumes: `listUsersForAdmin` from `@revelio/db`; `getDb` from `@/lib/db`; `getSession` from `@/lib/session`; `hasRequiredRole` from `@/lib/roles`; `AdminUsersTable` from `@/components/admin-users-table`; `notFound` from `next/navigation`.
- Produces: the `/admin/users` route.

- [ ] **Step 1: Write the list page**

Create `app/web/src/app/[locale]/admin/users/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { listUsersForAdmin } from '@revelio/db'
import { AdminUsersTable } from '@/components/admin-users-table'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const t = await getTranslations('admin.users')
  const users = await listUsersForAdmin(getDb())

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </div>
      <AdminUsersTable users={users} />
    </div>
  )
}
```

- [ ] **Step 2: Add the admin-only "Users" nav card**

Modify `app/web/src/app/[locale]/admin/page.tsx`. Add imports for the guard and render the Users card only for admins. Full updated file:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'

export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  const session = await getSession()
  const isAdmin = hasRequiredRole(session?.user?.role, 'admin')

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <div className="space-y-3">
        <Link
          href="/admin/sub-types"
          className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="font-medium">{t('subTypes')}</div>
          <div className="text-sm text-muted-foreground">{t('subTypesDesc')}</div>
        </Link>
        <Link
          href="/admin/sets"
          className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="font-medium">{t('sets.title')}</div>
          <div className="text-sm text-muted-foreground">{t('sets.desc')}</div>
        </Link>
        {isAdmin && (
          <Link
            href="/admin/users"
            className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="font-medium">{t('users.title')}</div>
            <div className="text-sm text-muted-foreground">{t('users.desc')}</div>
          </Link>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify it typechecks, lints, and builds**

Run: `cd app && npm run typecheck && npm run lint -w web`
Expected: no errors, no new warnings.

- [ ] **Step 4: Manual smoke check**

Run: `cd app && npm run dev -w web` (with local infra up per CLAUDE.md).
Verify as an admin: `/admin` shows the Users card; `/admin/users` lists users, search + status filters work, a row links to `/admin/users/<id>/edit` (404 until Task 5).
Verify as a non-admin (editor): `/admin/users` returns 404 and the Users card is absent.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/app/[locale]/admin/users/page.tsx app/web/src/app/[locale]/admin/page.tsx
git commit -m "feat(web): admin users list page (admin-guarded) + nav card"
```

---

## Task 5: Edit page + sub-forms

**Files:**
- Create: `app/web/src/app/[locale]/admin/users/[id]/edit/page.tsx`
- Create: `app/web/src/components/user-role-form.tsx`
- Create: `app/web/src/components/user-ban-form.tsx`
- Create: `app/web/src/components/user-password-form.tsx`
- Create: `app/web/src/components/delete-user-button.tsx`
- Test: `app/web/src/components/__tests__/delete-user-button.test.tsx`

**Interfaces:**
- Consumes: `getUserForAdmin`, `countUserDecks` from `@revelio/db`; the Task 2 actions from `@/lib/user-admin-actions`; `getSession`/`hasRequiredRole`; UI primitives (`Select`, `AlertDialog`, `Input`, `Button`, `Badge`); the shared `DatePicker` from `@/components/date-picker`; `toast` from `sonner`; `useTranslations` from `next-intl`.
- Produces: the `/admin/users/[id]/edit` route composed of the four client sub-forms. Each sub-form receives `userId: string` and an `isSelf: boolean` (and role/ban current values where relevant) and calls the matching action, toasting `saved`/`selfError`/`lastAdminError`/`saveError` based on the result.

- [ ] **Step 1: Write the failing test (representative sub-form: delete button)**

Create `app/web/src/components/__tests__/delete-user-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeleteUserButton } from '../delete-user-button'

const h = vi.hoisted(() => ({
  deleteUser: vi.fn(async () => ({ ok: true as const })),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/user-admin-actions', () => ({ deleteUser: h.deleteUser }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error } }))

function renderBtn(isSelf = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeleteUserButton userId="u2" deckCount={3} isSelf={isSelf} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.deleteUser.mockResolvedValue({ ok: true }) })

describe('DeleteUserButton', () => {
  it('is disabled on your own account', () => {
    renderBtn(true)
    expect(screen.getByRole('button', { name: en.admin.users.deleteAction })).toBeDisabled()
  })

  it('confirms, calls the action, and redirects to the list on success', async () => {
    renderBtn(false)
    fireEvent.click(screen.getByRole('button', { name: en.admin.users.deleteAction }))
    fireEvent.click(await screen.findByRole('button', { name: en.admin.users.deleteAction, hidden: false }))
    await waitFor(() => expect(h.deleteUser).toHaveBeenCalledWith('u2'))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/admin/users'))
  })

  it('toasts the last-admin error and does not redirect', async () => {
    h.deleteUser.mockResolvedValueOnce({ ok: false, error: 'last-admin' })
    renderBtn(false)
    fireEvent.click(screen.getByRole('button', { name: en.admin.users.deleteAction }))
    fireEvent.click(await screen.findAllByRole('button', { name: en.admin.users.deleteAction }).then((b) => b[b.length - 1]))
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(en.admin.users.lastAdminError))
    expect(h.push).not.toHaveBeenCalled()
  })
})
```

> If the confirm-dialog trigger and the confirm button share the same accessible name and make the last test's selector ambiguous, give the AlertDialog trigger `aria-label={t('deleteAction')}` and the confirm action a distinct label (e.g. reuse `deleteAction` on the action and set the trigger to an icon+`deleteAction` — then select the confirm button via `within(dialog)`). Keep the test asserting: action called with `'u2'`, and error toast on `last-admin`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- delete-user-button`
Expected: FAIL — `../delete-user-button` does not exist.

- [ ] **Step 3: Confirm required shadcn primitives exist**

Run: `ls app/web/src/components/ui/select.tsx app/web/src/components/ui/alert-dialog.tsx app/web/src/components/date-picker.tsx`
Expected: all exist (confirmed in repo).

- [ ] **Step 4: Write the delete button**

Create `app/web/src/components/delete-user-button.tsx`:

```tsx
'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { deleteUser } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function DeleteUserButton(
  { userId, deckCount, isSelf }: { userId: string; deckCount: number; isSelf: boolean },
) {
  const t = useTranslations('admin.users')
  const router = useRouter()
  const [pending, start] = useTransition()

  function onConfirm() {
    start(async () => {
      const res = await deleteUser(userId)
      if (res.ok) {
        toast.success(t('saved'))
        router.push('/admin/users')
      } else {
        toast.error(t(res.error === 'self' ? 'selfError' : res.error === 'last-admin' ? 'lastAdminError' : 'saveError'))
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={isSelf || pending}>
          {t('deleteAction')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteConfirmBody', { decks: deckCount })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('deleteAction')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 5: Write the role form**

Create `app/web/src/components/user-role-form.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { setUserRole } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export function UserRoleForm(
  { userId, role, disabled }: { userId: string; role: string; disabled: boolean },
) {
  const t = useTranslations('admin.users')
  const [value, setValue] = useState(role)
  const [pending, start] = useTransition()

  function onSave() {
    start(async () => {
      const res = await setUserRole(userId, value)
      if (res.ok) toast.success(t('saved'))
      else toast.error(t(res.error === 'self' ? 'selfError' : res.error === 'last-admin' ? 'lastAdminError' : 'saveError'))
    })
  }

  return (
    <div className="flex items-end gap-3">
      <Select value={value} onValueChange={setValue} disabled={disabled || pending}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="user">{t('roleUser')}</SelectItem>
          <SelectItem value="editor">{t('roleEditor')}</SelectItem>
          <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" onClick={onSave} disabled={disabled || pending || value === role}>
        {t('save')}
      </Button>
      {disabled && <span className="text-xs text-muted-foreground">{t('cannotSelf')}</span>}
    </div>
  )
}
```

- [ ] **Step 6: Write the ban form**

Create `app/web/src/components/user-ban-form.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { banUser, unbanUser } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/date-picker'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Props = {
  userId: string
  banned: boolean
  currentReason: string | null
  currentExpires: string | null // ISO date (yyyy-mm-dd) or null
  disabled: boolean
}

export function UserBanForm({ userId, banned, currentReason, currentExpires, disabled }: Props) {
  const t = useTranslations('admin.users')
  const [reason, setReason] = useState('')
  const [expires, setExpires] = useState<string | null>(null) // yyyy-mm-dd
  const [pending, start] = useTransition()

  function handle(res: Promise<{ ok: true } | { ok: false; error: string }>) {
    start(async () => {
      const r = await res
      if (r.ok) toast.success(t('saved'))
      else toast.error(t(r.error === 'self' ? 'selfError' : 'saveError'))
    })
  }

  if (banned) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('banned')}{currentReason ? ` — ${currentReason}` : ''}
          {currentExpires ? ` (${currentExpires})` : ''}
        </p>
        <Button type="button" variant="outline" disabled={disabled || pending} onClick={() => handle(unbanUser(userId))}>
          {t('unbanAction')}
        </Button>
        {disabled && <p className="text-xs text-muted-foreground">{t('cannotSelf')}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ban-reason">{t('banReason')}</Label>
        <Input id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label>{t('banExpires')}</Label>
        <DatePicker value={expires} onChange={setExpires} />
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={disabled || pending}>{t('banAction')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('banConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('banConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handle(banUser(userId, reason, expires))}>
              {t('banAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {disabled && <p className="text-xs text-muted-foreground">{t('cannotSelf')}</p>}
    </div>
  )
}
```

> Verify the `DatePicker` prop names against `web/src/components/date-picker.tsx` (it was built for the sets form). If its props are e.g. `{ date, setDate }` or Date objects rather than `{ value, onChange }` ISO strings, adapt the `expires` state type and the `banUser` call (the action accepts an ISO date string or null) accordingly. Do not change `DatePicker`.

- [ ] **Step 7: Write the password form**

Create `app/web/src/components/user-password-form.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { setUserPassword } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function UserPasswordForm({ userId }: { userId: string }) {
  const t = useTranslations('admin.users')
  const [password, setPassword] = useState('')
  const [pending, start] = useTransition()

  function onSave() {
    start(async () => {
      const res = await setUserPassword(userId, password)
      if (res.ok) { toast.success(t('saved')); setPassword('') }
      else toast.error(t('saveError'))
    })
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="new-password">{t('newPassword')}</Label>
      <div className="flex items-center gap-3">
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={onSave} disabled={pending || password.length < 8}>
          {t('setPassword')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Write the edit page**

Create `app/web/src/app/[locale]/admin/users/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getUserForAdmin, countUserDecks } from '@revelio/db'
import { UserRoleForm } from '@/components/user-role-form'
import { UserBanForm } from '@/components/user-ban-form'
import { UserPasswordForm } from '@/components/user-password-form'
import { DeleteUserButton } from '@/components/delete-user-button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function EditUserPage(
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const db = getDb()
  const user = await getUserForAdmin(db, id)
  if (!user) notFound()
  const deckCount = await countUserDecks(db, id)
  const isSelf = session!.user.id === user.id
  const t = await getTranslations('admin.users')

  const expiresIso = user.banExpires ? user.banExpires.toISOString().slice(0, 10) : null

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t('identity')}</h2>
        <div className="rounded-lg border p-4">
          <div className="text-lg font-semibold">{user.name}</div>
          <div className="text-sm text-muted-foreground">
            {user.email}{user.emailVerified && <Badge variant="secondary" className="ml-2">{t('verified')}</Badge>}
          </div>
          {user.username && <div className="text-sm text-muted-foreground">@{user.username}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            {t('joined')}: {user.createdAt.toISOString().slice(0, 10)}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('roleSection')}</h2>
        <UserRoleForm userId={user.id} role={user.role} disabled={isSelf} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('banSection')}</h2>
        <UserBanForm
          userId={user.id}
          banned={user.banned}
          currentReason={user.banReason}
          currentExpires={expiresIso}
          disabled={isSelf}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('passwordSection')}</h2>
        <UserPasswordForm userId={user.id} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-destructive">{t('dangerSection')}</h2>
        <DeleteUserButton userId={user.id} deckCount={deckCount} isSelf={isSelf} />
      </section>
    </div>
  )
}
```

- [ ] **Step 9: Run the sub-form test to verify it passes**

Run: `cd app && npm test -w web -- delete-user-button`
Expected: PASS (adjust the ambiguous-selector note from Step 1 if needed).

- [ ] **Step 10: Typecheck, lint, full web tests**

Run: `cd app && npm run typecheck && npm run lint -w web && npm test -w web`
Expected: no errors; all tests pass.

- [ ] **Step 11: Manual smoke check**

Run: `cd app && npm run dev -w web` (infra up). As admin, open `/admin/users/<id>/edit` for another user:
- change role → toast Saved, reflected on reload;
- ban with reason + expiry → confirm → user shows Banned; unban works;
- set a password (≥8 chars) → Saved;
- delete → confirm dialog shows the deck count → redirects to the list.
On your **own** edit page: role/ban/delete disabled; password still works.
Stop the dev server.

- [ ] **Step 12: Commit**

```bash
git add app/web/src/app/[locale]/admin/users/[id]/edit/page.tsx \
  app/web/src/components/user-role-form.tsx app/web/src/components/user-ban-form.tsx \
  app/web/src/components/user-password-form.tsx app/web/src/components/delete-user-button.tsx \
  app/web/src/components/__tests__/delete-user-button.test.tsx
git commit -m "feat(web): admin user edit page with role/ban/password/delete controls"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole gate**

Run from `app/`:
```bash
npm run typecheck
npm run lint -w web
npm test -w web
npm test -w @revelio/ingest -- user-admin
npm run build -w web   # needs env vars per CLAUDE.md
```
Expected: typecheck clean; lint no new warnings; all tests pass; build succeeds.

- [ ] **Step 2: Confirm no schema drift**

Run: `cd app && npm run verify -w @revelio/db`
Expected: PASS — this feature adds no migration (the `user` columns already exist).

- [ ] **Step 3: Commit any incidental fixes**

If verification surfaced fixes, commit them with a `fix(web): …` or `test(web): …` message.

---

## Self-Review Notes

- **Spec coverage:** access control (Tasks 4–5 guards + Task 2 `requireRole`), list table with search + role/status filters (Task 3), edit page with all four actions (Tasks 2 + 5), self-lockout + last-admin guards (Task 2), cascade-aware delete copy (Task 3 `deleteConfirmBody` + Task 5 `deckCount`), i18n both locales (Task 3), tests DB + actions + table + representative sub-form (Tasks 1–3, 5). No create-user flow (out of scope) — confirmed absent.
- **Known adaptation points flagged inline:** `decks` insert columns in the Task 1 test; `DatePicker` prop shape in Task 5; possible AlertDialog selector ambiguity in the delete test. Each has explicit instructions to adapt to the real signatures without changing shared components.
- **Type consistency:** `UserAdminRow`/`UserAdminDetail` defined in Task 1, consumed by Tasks 3/5; action names (`setUserRole`, `banUser`, `unbanUser`, `setUserPassword`, `deleteUser`) defined in Task 2 and imported unchanged in Task 5; error codes (`self`, `last-admin`, `invalid`) map to message keys (`selfError`, `lastAdminError`, `saveError`).

# Terms of Service, Phase 2: Recording Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store which Terms of Service version each account accepted and when, record it at registration, and ask signed-in accounts on an older or no version to accept the current one through a non-blocking banner.

**Architecture:** Two nullable columns on Better Auth's `user` table, declared as `additionalFields` with `input: false` so no client-facing Better Auth endpoint can write them. A single argument-free server action, `acceptTermsAction`, writes them from the session user, the server's `TERMS_VERSION` and the server clock; both the registration form and the banner call it. The banner is a server component in the `[locale]` layout that reads the session and renders a small client view only when the stored version is stale.

**Tech Stack:** Better Auth (admin, username, emailOTP plugins), Drizzle ORM + drizzle-kit, Next.js 16 server actions, next-intl, Vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (Phase 2)

## Global Constraints

- Depends on Phase 1 being merged: `TERMS_VERSION` in `app/web/src/lib/terms.ts` and the `/terms` page must exist.
- All app commands run from `app/`. Node and npm are at `/usr/local/bin`.
- Migrations are append-only. Never touch `db/drizzle/0000_*.sql` or delete `db/drizzle/`. Commit the generated migration **before** running `npm run verify -w @revelio/db`; its git-clean step deletes an uncommitted one.
- `@revelio/db` queries are tested from `app/ingest/test/` with `withMigratedDb` (Docker required).
- Every file in `web/src/lib/server/` starts with `import 'server-only'`.
- User-facing strings come from `web/messages/en.json` and `de.json`. UI copy in German uses "du"; the privacy policy uses "Sie".
- Code comments are ASCII-only.
- `type` aliases, never `interface`; type-only imports say `type`. Declaration order: types, constants, helpers, exported functions.
- Commits: Conventional Commits, no tool attribution, signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`. Schema edit and its migration are one commit.
- Branch: `feat/terms-acceptance` off `main`.

---

### Task 1: Columns, migration and the acceptance query

**Files:**
- Modify: `app/db/src/auth-schema.ts` (the `user` table)
- Create: `app/db/drizzle/0015_<generated>.sql` plus `app/db/drizzle/meta/*` (generated)
- Modify: `app/db/src/queries/users.ts`
- Modify: `app/db/src/index.ts:19`
- Create: `app/ingest/test/terms-acceptance.test.ts`

**Interfaces:**
- Produces: `user.termsVersion: text | null`, `user.termsAcceptedAt: timestamp | null` on `schema.user`.
- Produces: `recordTermsAcceptance(db: DB, id: string, version: string, acceptedAt: Date): Promise<void>`, exported from `@revelio/db`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git fetch origin && git switch -c feat/terms-acceptance origin/main
```

- [ ] **Step 2: Write the failing query test**

`app/ingest/test/terms-acceptance.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema, recordTermsAcceptance } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

async function seedUser(id: string) {
  await ctx.db.insert(schema.user).values({
    id, name: `User ${id}`, email: `${id}@x.test`, emailVerified: true, role: 'user', banned: false,
  })
}

async function acceptance(id: string) {
  const [row] = await ctx.db
    .select({ version: schema.user.termsVersion, at: schema.user.termsAcceptedAt })
    .from(schema.user)
    .where(eq(schema.user.id, id))
  return row
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  await seedUser('a')
  await seedUser('b')
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('recordTermsAcceptance', () => {
  // Accounts that predate the terms must read as "never accepted", not as a
  // default version nobody was shown.
  it('leaves a new account with no recorded acceptance', async () => {
    expect(await acceptance('a')).toEqual({ version: null, at: null })
  })

  it('stores the version and the moment of acceptance', async () => {
    const at = new Date('2026-09-20T10:00:00Z')
    await recordTermsAcceptance(ctx.db, 'a', '2026-09-16', at)
    expect(await acceptance('a')).toEqual({ version: '2026-09-16', at })
  })

  it('overwrites an earlier acceptance with a later version', async () => {
    const at = new Date('2027-01-05T08:30:00Z')
    await recordTermsAcceptance(ctx.db, 'a', '2027-01-01', at)
    expect(await acceptance('a')).toEqual({ version: '2027-01-01', at })
  })

  it('touches only the given account', async () => {
    expect(await acceptance('b')).toEqual({ version: null, at: null })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w @revelio/ingest -- test/terms-acceptance.test.ts`
Expected: FAIL, `recordTermsAcceptance` is not exported (and `schema.user.termsVersion` is undefined).

- [ ] **Step 4: Add the columns**

In `app/db/src/auth-schema.ts`, inside `pgTable("user", { ... })`, directly after `banExpires: timestamp("ban_expires"),`:

```ts
  // Terms of Service acceptance: the TERMS_VERSION (web/src/lib/terms.ts) the
  // user accepted and when. Null means never accepted - accounts that predate
  // the terms. Declared as input:false additionalFields in web's auth.ts, so
  // Better Auth never lets a client write them; only acceptTermsAction does.
  termsVersion: text("terms_version"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
```

- [ ] **Step 5: Generate and review the migration**

Run: `npm run generate -w @revelio/db`
Expected: a new `app/db/drizzle/0015_*.sql` containing exactly:

```sql
ALTER TABLE "user" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_accepted_at" timestamp;
```

If it contains anything else (a DROP, an unrelated ALTER), stop: the schema and the snapshots disagree, and that must be understood before committing.

- [ ] **Step 6: Add the query**

In `app/db/src/queries/users.ts`, append after `deleteUserById`:

```ts
// Stamps which Terms of Service version a user accepted, and when. Called only
// by web's acceptTermsAction with the server's own TERMS_VERSION and clock,
// never with client input, so the row is evidence of what was actually shown.
// A later acceptance replaces the earlier one: the current contract is what
// matters, and the version string says which text that was.
export async function recordTermsAcceptance(
  db: DB, id: string, version: string, acceptedAt: Date,
): Promise<void> {
  await db.update(user)
    .set({ termsVersion: version, termsAcceptedAt: acceptedAt })
    .where(eq(user.id, id))
}
```

In `app/db/src/index.ts`, extend the users export line to:

```ts
export { listUsersForAdmin, getUserForAdmin, countAdmins, countUserDecks, updateUserRole, setUserBan, clearUserBan, deleteUserById, recordTermsAcceptance } from './queries/users'
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -w @revelio/ingest -- test/terms-acceptance.test.ts test/user-admin.test.ts`
Expected: PASS (4 new tests, and the existing user-admin suite unchanged).

- [ ] **Step 8: Commit, then verify the migration**

```bash
git add app/db/src/auth-schema.ts app/db/drizzle app/db/src/queries/users.ts app/db/src/index.ts \
  app/ingest/test/terms-acceptance.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): record which terms version a user accepted" \
  -m "The operator bears the burden of proving the terms were incorporated
(§ 305(2) BGB). Both columns are nullable with no backfill: an account
that predates the terms never accepted any."
npm run check -w @revelio/db
npm run verify -w @revelio/db
```

Expected: both succeed and `git status` is clean afterwards.

---

### Task 2: Expose the fields through Better Auth, read-only

**Files:**
- Modify: `app/web/src/lib/server/auth.ts` (top-level `user` option)
- Modify: `app/ingest/test/auth.test.ts` (config mirror + one test)

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces: `session.user.termsVersion: string | null | undefined` on the type returned by `getSession()` in `@/lib/server/session`. Task 4 reads it.

- [ ] **Step 1: Write the failing test**

In `app/ingest/test/auth.test.ts`, add to the `betterAuth({ ... })` options in `beforeAll`, next to `emailAndPassword`:

```ts
    // Mirrors web/src/lib/server/auth.ts. input:false is the guarantee under
    // test: no Better Auth endpoint may let a client write its own acceptance.
    user: {
      additionalFields: {
        termsVersion: { type: 'string', required: false, input: false },
        termsAcceptedAt: { type: 'date', required: false, input: false },
      },
    },
```

Then add inside `describe('email-OTP auth', ...)`:

```ts
  it('never lets a client set its own terms acceptance', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'terms@example.com', type: 'sign-in' } })
    const res = await auth.api.signInEmailOTP({
      body: { email: 'terms@example.com', otp: lastOtp },
      asResponse: true,
    })
    const cookie = res.headers.get('set-cookie') ?? ''

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user.termsVersion ?? null).toBeNull()

    // Rejected or silently ignored, the stored value must not move.
    await auth.api
      .updateUser({
        headers: new Headers({ cookie }),
        body: { termsVersion: '2099-01-01' } as Record<string, unknown>,
      })
      .catch(() => {})

    const [row] = await ctx.db
      .select({ v: schema.user.termsVersion })
      .from(schema.user)
      .where(eq(schema.user.email, 'terms@example.com'))
    expect(row.v).toBeNull()
  })
```

Add `import { eq } from 'drizzle-orm'` at the top if the file does not import it yet.

- [ ] **Step 2: Run it**

Run: `npm test -w @revelio/ingest -- test/auth.test.ts`
Expected: PASS. This is a pin test of library behaviour rather than red-green: it proves Better Auth's `input: false` keeps `updateUser` from writing the field, which the design relies on. To see it bite, temporarily change `input: false` to `input: true` in the test config and rerun: it must FAIL on `expect(row.v).toBeNull()`. Revert. If it passes even with `input: true`, the `updateUser` call is not reaching the handler (check the cookie), so fix the test before moving on. If it fails with `input: false`, stop and report: the design depends on it.

- [ ] **Step 3: Declare the fields in the app**

In `app/web/src/lib/server/auth.ts`, add a top-level option directly after `emailAndPassword: { enabled: false },`:

```ts
  user: {
    additionalFields: {
      // Terms of Service acceptance (db/src/auth-schema.ts). Declared so the
      // session carries termsVersion for the acceptance banner and so a
      // future `@better-auth/cli generate` keeps the columns. input:false:
      // no Better Auth endpoint may write them - sign-up and updateUser
      // bodies reject or drop them - and only acceptTermsAction does, from
      // the session and the server's own TERMS_VERSION.
      termsVersion: { type: 'string', required: false, input: false },
      termsAcceptedAt: { type: 'date', required: false, input: false },
    },
  },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `session.user.termsVersion` now type-checks wherever `getSession()` is used.

- [ ] **Step 5: Run the auth test**

Run: `npm test -w @revelio/ingest -- test/auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/server/auth.ts app/ingest/test/auth.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): expose terms acceptance on the session as read-only fields"
```

---

### Task 3: `acceptTermsAction`, called at registration

**Files:**
- Create: `app/web/src/lib/actions/terms-actions.ts`
- Create: `app/web/src/lib/actions/__tests__/terms-actions.test.ts`
- Modify: `app/web/src/lib/terms.ts` (add `needsTermsAcceptance`)
- Modify: `app/web/src/lib/__tests__/terms.test.ts`
- Modify: `app/web/src/components/auth/auth-form.tsx` (`verify()`)
- Modify: `app/web/src/components/auth/__tests__/auth-form.test.tsx`

**Interfaces:**
- Consumes: `recordTermsAcceptance` (Task 1), `getSession` from `@/lib/server/session`, `getDb` from `@/lib/server/db`, `TERMS_VERSION`.
- Produces: `acceptTermsAction(): Promise<AcceptTermsResult>` with `type AcceptTermsResult = { ok: true } | { ok: false; error: 'unauthorized' }`.
- Produces: `needsTermsAcceptance(accepted: string | null | undefined): boolean` in `@/lib/terms`.

- [ ] **Step 1: Write the failing tests**

Append to `app/web/src/lib/__tests__/terms.test.ts` (and add `needsTermsAcceptance` to its import):

```ts
describe('needsTermsAcceptance', () => {
  it('asks an account that never accepted', () => {
    expect(needsTermsAcceptance(null)).toBe(true)
    expect(needsTermsAcceptance(undefined)).toBe(true)
  })

  it('asks an account on an older version', () => {
    expect(needsTermsAcceptance('2000-01-01')).toBe(true)
  })

  it('leaves an account on the current version alone', () => {
    expect(needsTermsAcceptance(TERMS_VERSION)).toBe(false)
  })
})
```

`app/web/src/lib/actions/__tests__/terms-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TERMS_VERSION } from '@/lib/terms'

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordTermsAcceptance: vi.fn(async () => {}),
}))
vi.mock('@/lib/server/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ recordTermsAcceptance: m.recordTermsAcceptance }))

import { acceptTermsAction } from '../terms-actions'

beforeEach(() => {
  m.getSession.mockReset()
  m.recordTermsAcceptance.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('acceptTermsAction', () => {
  it('refuses without a session and writes nothing', async () => {
    m.getSession.mockResolvedValue(null)
    expect(await acceptTermsAction()).toEqual({ ok: false, error: 'unauthorized' })
    expect(m.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  // The record is only evidence if nothing about it comes from the client:
  // who from the session, which version from the constant, when from the
  // server clock.
  it('records the session user, the current version and the server time', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await acceptTermsAction()).toEqual({ ok: true })
    expect(m.recordTermsAcceptance).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      TERMS_VERSION,
      new Date('2026-09-20T12:00:00Z'),
    )
  })

  it('ignores anything a caller passes', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1' } })
    const call = acceptTermsAction as unknown as (...a: unknown[]) => Promise<unknown>
    await call({ userId: 'someone-else', version: '2099-01-01' })
    expect(m.recordTermsAcceptance).toHaveBeenCalledWith(expect.anything(), 'u1', TERMS_VERSION, expect.any(Date))
  })
})
```

In `auth-form.test.tsx`, add a mock next to the existing `vi.mock('@/lib/actions/auth-actions', ...)`:

```tsx
const acceptTermsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/terms-actions', () => ({
  acceptTermsAction: (...a: unknown[]) => acceptTermsAction(...a),
}))
```

add `acceptTermsAction.mockClear()` to `beforeEach`, and add a `signOut` stub to the `authClient` mock object: `signOut: vi.fn(async () => {}),`. Then add these tests:

```tsx
  async function registerAs(username: string) {
    renderForm('register')
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Username'), username)
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
  }

  it('records terms acceptance once the account is fully registered', async () => {
    await registerAs('Hermione')
    expect(acceptTermsAction).toHaveBeenCalledTimes(1)
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      acceptTermsAction.mock.invocationCallOrder[0],
    )
  })

  it('records nothing when the username step fails', async () => {
    updateUser.mockResolvedValueOnce({ error: { message: 'taken' } } as never)
    await registerAs('Hermione')
    expect(acceptTermsAction).not.toHaveBeenCalled()
  })

  // The banner asks again on the next page, so a failed write must not strand
  // a user who has just registered successfully.
  it('still finishes registration when recording acceptance fails', async () => {
    acceptTermsAction.mockRejectedValueOnce(new Error('network'))
    await registerAs('Hermione')
    expect(push).toHaveBeenCalledWith('/')
  })

  it('records nothing on login', async () => {
    await signIn(null)
    expect(acceptTermsAction).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web -- src/lib/__tests__/terms.test.ts src/lib/actions/__tests__/terms-actions.test.ts src/components/auth/__tests__/auth-form.test.tsx`
Expected: FAIL, `needsTermsAcceptance` and `../terms-actions` do not exist; `acceptTermsAction` never called.

- [ ] **Step 3: Add the helper**

Append to `app/web/src/lib/terms.ts`:

```ts
/** True when an account's stored acceptance is missing or for an older text. */
export function needsTermsAcceptance(accepted: string | null | undefined): boolean {
  return accepted !== TERMS_VERSION
}
```

- [ ] **Step 4: Write the action**

`app/web/src/lib/actions/terms-actions.ts`:

```ts
'use server'
import { recordTermsAcceptance } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'
import { TERMS_VERSION } from '@/lib/terms'

export type AcceptTermsResult = { ok: true } | { ok: false; error: 'unauthorized' }

// Deliberately takes no arguments. The user comes from the session, the version
// from the server's constant and the time from the server clock, so a caller can
// neither accept for someone else, nor claim a version it was not shown, nor
// back-date the record.
export async function acceptTermsAction(): Promise<AcceptTermsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  await recordTermsAcceptance(getDb(), session.user.id, TERMS_VERSION, new Date())
  return { ok: true }
}
```

- [ ] **Step 5: Call it from registration**

In `auth-form.tsx`, add the import:

```tsx
import { acceptTermsAction } from '@/lib/actions/terms-actions'
```

and in `verify()`, inside `if (register) { ... }`, directly after the `if (updateError) { ... }` block closes:

```tsx
      // The visitor pressed Register under the terms notice, and the account is
      // now complete. Best-effort: if this write fails the acceptance banner asks
      // again, which beats failing a registration that has already succeeded.
      try {
        await acceptTermsAction()
      } catch {
        // Covered by the banner on the next render.
      }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w web -- src/lib/__tests__/terms.test.ts src/lib/actions/__tests__/terms-actions.test.ts src/components/auth/__tests__/auth-form.test.tsx`
Expected: PASS, including every pre-existing auth-form test.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/lib/terms.ts app/web/src/lib/__tests__/terms.test.ts app/web/src/lib/actions/terms-actions.ts \
  app/web/src/lib/actions/__tests__/terms-actions.test.ts app/web/src/components/auth
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): record terms acceptance when registration completes"
```

---

### Task 4: Acceptance banner for existing accounts

**Files:**
- Create: `app/web/src/components/legal/terms-banner.tsx` (server)
- Create: `app/web/src/components/legal/terms-banner-view.tsx` (client)
- Create: `app/web/src/components/legal/__tests__/terms-banner.test.tsx`
- Modify: `app/web/src/app/[locale]/layout.tsx`
- Modify: `app/web/messages/en.json` and `de.json` (new `termsBanner` namespace)

**Interfaces:**
- Consumes: `getSession()` with `session.user.termsVersion` (Task 2), `needsTermsAcceptance` and `acceptTermsAction` (Task 3).
- Produces: `TermsBanner(): Promise<JSX.Element | null>` and `TermsBannerView(): JSX.Element`.

- [ ] **Step 1: Add the copy**

`en.json`, new top-level key directly after `"terms"`:

```json
  "termsBanner": {
    "label": "Terms of Service",
    "body": "Please review and accept our current <terms>Terms of Service</terms>.",
    "accept": "Accept terms",
    "error": "Couldn’t save your acceptance. Please try again."
  },
```

`de.json`, same place:

```json
  "termsBanner": {
    "label": "Nutzungsbedingungen",
    "body": "Bitte lies unsere aktuellen <terms>Nutzungsbedingungen</terms> und stimme ihnen zu.",
    "accept": "Zustimmen",
    "error": "Deine Zustimmung konnte nicht gespeichert werden. Bitte versuche es erneut."
  },
```

- [ ] **Step 2: Write the failing tests**

`app/web/src/components/legal/__tests__/terms-banner.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import en from '@/../messages/en.json'
import { TERMS_VERSION } from '@/lib/terms'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  acceptTermsAction: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/server/session', () => ({ getSession: h.getSession }))
vi.mock('@/lib/actions/terms-actions', () => ({ acceptTermsAction: h.acceptTermsAction }))
vi.mock('sonner', () => ({ toast: { error: h.toastError } }))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

import { TermsBanner } from '../terms-banner'
import { TermsBannerView } from '../terms-banner-view'

function withIntl(node: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={en}>{node}</NextIntlClientProvider>
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
})

describe('TermsBanner', () => {
  it('renders nothing for a visitor who is not signed in', async () => {
    h.getSession.mockResolvedValue(null)
    expect(await TermsBanner()).toBeNull()
  })

  it('renders nothing for an account on the current version', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: TERMS_VERSION } })
    expect(await TermsBanner()).toBeNull()
  })

  it('asks an account that never accepted', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: null } })
    render(withIntl(await TermsBanner()))
    expect(screen.getByRole('region', { name: 'Terms of Service' })).toBeInTheDocument()
  })

  it('asks an account on an older version', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: '2000-01-01' } })
    render(withIntl(await TermsBanner()))
    expect(screen.getByRole('button', { name: 'Accept terms' })).toBeInTheDocument()
  })
})

describe('TermsBannerView', () => {
  it('links the terms', () => {
    render(withIntl(<TermsBannerView />))
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })

  // Accepting is the only way to clear it: there is deliberately no dismiss
  // control, since closing a banner is not agreeing to anything.
  it('offers no way to dismiss without accepting', () => {
    render(withIntl(<TermsBannerView />))
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('records acceptance and refreshes so the banner goes away', async () => {
    h.acceptTermsAction.mockResolvedValue({ ok: true })
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    expect(h.acceptTermsAction).toHaveBeenCalledTimes(1)
  })

  it('reports a failed save and stays', async () => {
    h.acceptTermsAction.mockResolvedValue({ ok: false, error: 'unauthorized' })
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(en.termsBanner.error))
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('reports a thrown action the same way', async () => {
    h.acceptTermsAction.mockRejectedValue(new Error('network'))
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(en.termsBanner.error))
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w web -- src/components/legal/__tests__/terms-banner.test.tsx`
Expected: FAIL, cannot resolve `../terms-banner`.

- [ ] **Step 4: Write the client view**

`app/web/src/components/legal/terms-banner-view.tsx`:

```tsx
'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/../i18n/navigation'
import { acceptTermsAction } from '@/lib/actions/terms-actions'
import { Button } from '@/components/ui/button'

/**
 * Asks a signed-in account to accept the current Terms of Service. No dismiss
 * control on purpose: closing a banner is not agreeing to anything, and the
 * terms only bind an existing account once it accepts (terms section 12).
 * Not blocking either - the site stays fully usable while it shows.
 */
export function TermsBannerView() {
  const t = useTranslations('termsBanner')
  const router = useRouter()
  const [pending, start] = useTransition()

  function accept() {
    start(async () => {
      try {
        const result = await acceptTermsAction()
        if (result.ok) {
          router.refresh()
          return
        }
      } catch {
        // Falls through to the same message as a refused save.
      }
      toast.error(t('error'))
    })
  }

  return (
    <div role="region" aria-label={t('label')} className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex max-w-[76rem] flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t.rich('body', {
            terms: (chunks) => (
              <Link href="/terms" className="text-foreground underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <Button size="sm" onClick={accept} disabled={pending} className="shrink-0 self-start sm:self-auto">
          {t('accept')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write the server wrapper**

`app/web/src/components/legal/terms-banner.tsx`:

```tsx
import { getSession } from '@/lib/server/session'
import { needsTermsAcceptance } from '@/lib/terms'
import { TermsBannerView } from './terms-banner-view'

/** Async server wrapper: shows the banner only to a signed-in account on a stale or missing version. */
export async function TermsBanner() {
  const session = await getSession()
  if (!session?.user || !needsTermsAcceptance(session.user.termsVersion)) return null
  return <TermsBannerView />
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w web -- src/components/legal/__tests__/terms-banner.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 7: Mount it in the layout**

In `app/web/src/app/[locale]/layout.tsx`, add the import:

```tsx
import { TermsBanner } from '@/components/legal/terms-banner'
```

and change the header block to:

```tsx
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <TermsBanner />
            <div className="flex-1">{children}</div>
          </div>
```

- [ ] **Step 8: Check it in the browser**

Start the stack and apply the migration from the host (not `docker compose run --rm migrate`, which may run a stale image):

```bash
docker compose up -d postgres
DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio npx tsx db/src/migrate-cli.ts
docker compose exec -T postgres psql -U revelio -d revelio -c '\d "user"'
```

Expected: `terms_version` and `terms_accepted_at` listed. Then with `npm run dev -w web`, sign in as an existing local account and screenshot at 1280px and 375px with Playwright chromium (scratchpad only). Expected: the banner sits under the header; pressing "Accept terms" makes it disappear without a full reload; `select terms_version, terms_accepted_at from "user" where email = '<that account>'` shows the current version and a timestamp; `/de` shows the German copy.

- [ ] **Step 9: Commit**

```bash
git add app/web/src/components/legal/terms-banner.tsx app/web/src/components/legal/terms-banner-view.tsx \
  app/web/src/components/legal/__tests__/terms-banner.test.tsx 'app/web/src/app/[locale]/layout.tsx' \
  app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): ask existing accounts to accept the current terms" \
  -m "Accounts that predate the terms, and every account after a future
change, are bound only once they accept (BGH XI ZR 26/20 rules out
deemed consent). The banner has no dismiss control for that reason,
and it does not block the site."
```

---

### Task 5: Privacy policy covers the acceptance record

**Files:**
- Modify: `app/web/messages/en.json` and `de.json` (`privacy.accountBody`)
- Modify: `app/web/src/app/[locale]/privacy/page.tsx` (`LAST_UPDATED`)
- Modify: `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside `describe('PrivacyContent', ...)`:

```tsx
  it('discloses the terms acceptance record in both locales', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByText(/which version of the terms of service you accepted and when/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de', de, FULL)
    expect(screen.getByText(/welcher Fassung der Nutzungsbedingungen Sie wann zugestimmt haben/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx'`
Expected: FAIL, text not found.

- [ ] **Step 3: Extend the copy**

Replace `privacy.accountBody` in `en.json` with:

```json
    "accountBody": "When you create an account we process your email address, username, display name, role, and email-verification status so that we can provide your account and its features. Legal basis: performance of a contract (Art. 6(1)(b) GDPR). When you register, or later accept updated terms of service, we also store which version of the terms of service you accepted and when, so that we can prove which terms apply to your account. Legal basis: our legitimate interest in being able to prove the terms agreed (Art. 6(1)(f) GDPR).",
```

and in `de.json` with:

```json
    "accountBody": "Wenn Sie ein Konto anlegen, verarbeiten wir Ihre E-Mail-Adresse, Ihren Benutzernamen, Ihren Anzeigenamen, Ihre Rolle und den Status der E-Mail-Bestätigung, um Ihnen Ihr Konto und dessen Funktionen bereitzustellen. Rechtsgrundlage: Erfüllung eines Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Wenn Sie sich registrieren oder später geänderten Nutzungsbedingungen zustimmen, speichern wir außerdem, welcher Fassung der Nutzungsbedingungen Sie wann zugestimmt haben, damit wir nachweisen können, welche Bedingungen für Ihr Konto gelten. Rechtsgrundlage: unser berechtigtes Interesse am Nachweis der vereinbarten Bedingungen (Art. 6 Abs. 1 lit. f DSGVO).",
```

- [ ] **Step 4: Move the privacy policy date**

In `privacy/page.tsx`, set `LAST_UPDATED` to the date you make this change (`date -u +%Y-%m-%d`):

```tsx
const LAST_UPDATED = new Date('2026-09-16T00:00:00Z')
```

replacing `2026-09-16` with that date.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json 'app/web/src/app/[locale]/privacy'
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): disclose the terms acceptance record in the privacy policy"
```

---

### Task 6: Verify and open the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (status line only)

- [ ] **Step 1: Run the full checks**

From `app/`:

```bash
npm run check -w @revelio/db
npm run verify -w @revelio/db
npm run lint
npm run typecheck
npm test
```

Expected: all pass. `npm test` wipes the dev Meilisearch indexes (`main.test.ts`, `index-cards.test.ts`); run it against a throwaway Meilisearch on another port, or re-run ingest afterwards. Record each command's real result for the PR.

- [ ] **Step 2: Mark the spec**

```markdown
Status: approved; Phases 1 and 2 implemented
```

```bash
git add docs/superpowers/specs/2026-09-16-terms-of-service-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(plans): mark terms of service phase 2 as implemented"
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/terms-acceptance
/opt/homebrew/bin/gh pr create --base main \
  --title "feat(web): record terms of service acceptance" \
  --body-file <scratchpad>/pr-body.md
```

Body: opening prose (terms bind only once accepted, and the operator must be able to prove it), `## What changed`, `## Verification` with real results only, links to the spec, this plan and the Phase 1 PR. `## Deployment` must say:

- Apply migration `0015_*` before deploying web: `migrate-cli` from the host, or `docker compose run --rm --build migrate`, then confirm with `\d "user"`. Web reads `terms_version` through Better Auth, so deploying web first breaks every session read.
- Every existing account sees the acceptance banner once after deploy. That is intended.

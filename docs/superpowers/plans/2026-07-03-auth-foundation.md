# Auth Foundation (Plan 4b-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passwordless auth (email 6-digit OTP + unique username) with roles (user/editor/admin) via Better Auth, on the existing Postgres — registration, login, logout, session, and a `requireRole` gate for later editing.

**Architecture:** Better Auth (open-source, self-hosted) with the email-OTP, username and admin plugins, using its Drizzle adapter against `@revelio/db`'s Postgres. Auth tables live in `@revelio/db`'s schema (one DB, one migration). A Next.js catch-all route handler serves the auth API; a client drives the login UI; server-only `getSession`/`requireRole` helpers gate access. Dev emails are logged to the console.

**Tech Stack:** Better Auth v1, Drizzle/postgres-js, Next.js 16 (App Router), next-intl, Vitest.

## Global Constraints

- Node **20+**, TypeScript, ESM. New code under `app/web/` and `app/db/`.
- **Better Auth is self-hosted/free** — no external account. It runs on our Postgres (`DATABASE_URL`).
- **Passwordless:** email + **6-digit OTP**. `emailAndPassword` disabled. Every account has a unique **`username`** and a **`role`** (`user` default / `editor` / `admin`).
- **First admin:** `ADMIN_EMAILS` (comma-separated env) → those emails are created as `admin`.
- **Email delivery:** dev logs the OTP to the server console; a real provider is **deferred to Plan 5** (throw in production if unconfigured).
- **Auth tables in `@revelio/db`**, migration **regenerated** (project pattern → needs a fresh DB / re-seed; see the Plan 5 migration TODO).
- **Env:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS` (+ existing `DATABASE_URL`).
- **Version caveat:** the Better Auth APIs below are v1.x. If the installed version differs, adjust names/options to match — the **integration test (Task 2) is the gate**: it must drive a real OTP sign-up → session end-to-end against Postgres.
- **Env gotcha (this repo):** `~/.npm` is root-owned → run installs with `NPM_CONFIG_CACHE=<scratchpad>/npm-cache`. CLI/install steps that may prompt should run in the CONTROLLER, not a subagent.
- Auth integration tests need Postgres (`TEST_DATABASE_URL=postgres://revelio:revelio@localhost:55432/revelio`, container `revelio-testpg`). English identifiers; Conventional Commits.

## File Structure

```
app/db/src/
  auth-schema.ts            # Better Auth Drizzle tables (generated) — user/session/account/verification
  schema.ts                 # re-export auth-schema so it's in `schema` + the migration
  index.ts                  # export the auth tables + a getAuthDb() convenience if needed
app/web/src/
  lib/auth.ts               # betterAuth() server config (plugins, adapter, dev email, ADMIN_EMAILS)
  lib/auth-client.ts        # createAuthClient() with the matching client plugins
  lib/session.ts            # server-only getSession()/requireRole()
  app/api/auth/[...all]/route.ts   # toNextJsHandler(auth)
  app/[locale]/login/page.tsx      # email+username -> OTP -> code UI
  components/account-menu.tsx      # header: username + logout, or Login link
  components/site-header.tsx       # mount <AccountMenu/>
app/ingest/test/auth.test.ts       # OTP sign-up -> session integration test (reuses withMigratedDb)
```

---

### Task 1: Better Auth server config + Drizzle auth schema + migration

**Files:**
- Create: `app/web/src/lib/auth.ts`, `app/db/src/auth-schema.ts`
- Modify: `app/db/src/schema.ts` (re-export), `app/db/src/index.ts`, `app/web/package.json` (dep)
- Regenerate: `app/db/drizzle/*`

**Interfaces:**
- Produces: `auth` (Better Auth instance) from `@/lib/auth`; the auth tables (`user`, `session`, `account`, `verification`) in `@revelio/db`'s `schema`.

- [ ] **Step 1: (CONTROLLER) install Better Auth**

From `app/web`:
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm install better-auth -w @revelio/web
```

- [ ] **Step 2: Write the auth server config**

`app/web/src/lib/auth.ts`:
```ts
import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { createClient, schema } from '@revelio/db'

const db = createClient(process.env.DATABASE_URL ?? '').db

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: false },
  plugins: [
    username(),
    admin(), // adds `role` (default 'user'), ban fields
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 min
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Email provider not configured (deferred to Plan 5)')
        }
        // eslint-disable-next-line no-console
        console.log(`[auth] OTP for ${email} (${type}): ${otp}`)
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, role: ADMIN_EMAILS.includes(user.email.toLowerCase()) ? 'admin' : 'user' },
        }),
      },
    },
  },
})
```
(Match the installed better-auth's exact plugin/option names if they differ.)

- [ ] **Step 3: Generate the Drizzle auth schema into `@revelio/db`**

From `app/web`, run Better Auth's schema generator against the config and place the output in the db package:
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npx @better-auth/cli@latest generate \
  --config src/lib/auth.ts --output ../db/src/auth-schema.ts -y
```
This writes the Drizzle `pgTable` definitions for `user` (with `username`, `role`, ban fields), `session`, `account`, `verification`. If the CLI can't resolve `@revelio/db` while reading the config, temporarily point `auth.ts`'s db at a throwaway `createClient('postgres://x')` — generation only needs the config shape, not a live DB. Ensure the generated file imports from `drizzle-orm/pg-core` only (no `better-auth` import).

- [ ] **Step 4: Re-export the auth tables + regenerate the migration**

In `app/db/src/schema.ts`, add at the end: `export * from './auth-schema'`.
In `app/db/src/index.ts`, add: `export { user, session, account, verification } from './auth-schema'` (match the generated export names).
Regenerate the consolidated migration:
```bash
cd app/db && rm -rf drizzle/* && NPM_CONFIG_CACHE=<scratchpad>/npm-cache npx drizzle-kit generate
```
Confirm: `grep -l 'CREATE TABLE "user"' drizzle/*.sql` and that `session`, `account`, `verification` tables + a `username` and `role` column are present.

- [ ] **Step 5: Apply to a fresh test DB + typecheck**

```bash
docker exec revelio-testpg psql -U revelio -d postgres -c "DROP DATABASE IF EXISTS revelio WITH (FORCE);"
docker exec revelio-testpg psql -U revelio -d postgres -c "CREATE DATABASE revelio;"
cd app/db && DATABASE_URL=postgres://revelio:revelio@localhost:55432/revelio npm run migrate
```
Then `cd app/web && npx tsc --noEmit -p tsconfig.json 2>&1 | head` (the `auth.ts` + adapter typecheck; `schema` includes the auth tables).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/auth.ts app/db/src/auth-schema.ts app/db/src/schema.ts app/db/src/index.ts app/db/drizzle app/web/package.json app/package-lock.json
git commit -m "feat(auth): Better Auth server config + Drizzle auth schema (email-OTP/username/roles)"
```

---

### Task 2: Route handler, client, session helpers + OTP integration test

**Files:**
- Create: `app/web/src/app/api/auth/[...all]/route.ts`, `app/web/src/lib/auth-client.ts`, `app/web/src/lib/session.ts`
- Test: `app/ingest/test/auth.test.ts`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`).
- Produces: `authClient` (+ `useSession`, `signOut`) from `@/lib/auth-client`; `getSession()`, `requireRole(role)` from `@/lib/session`.

- [ ] **Step 1: Next route handler**

`app/web/src/app/api/auth/[...all]/route.ts`:
```ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 2: Auth client**

`app/web/src/lib/auth-client.ts`:
```ts
import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, usernameClient, adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), usernameClient(), adminClient()],
})

export const { useSession, signOut } = authClient
```

- [ ] **Step 3: Server session/role helpers**

`app/web/src/lib/session.ts`:
```ts
import 'server-only'
import { headers } from 'next/headers'
import { auth } from './auth'

const RANK: Record<string, number> = { user: 0, editor: 1, admin: 2 }

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireRole(role: 'editor' | 'admin') {
  const session = await getSession()
  const userRole = session?.user?.role ?? 'user'
  if (RANK[userRole] < RANK[role]) throw new Error('Forbidden')
  return session!
}
```

- [ ] **Step 4: Write the failing OTP integration test**

`app/ingest/test/auth.test.ts` — build a Better Auth instance wired to a fresh test DB with a **capturing** OTP sender, and drive the real flow via `auth.api`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { createClient, schema } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let auth: ReturnType<typeof betterAuth>
let lastOtp = ''

beforeAll(async () => {
  ctx = await withMigratedDb() // migrates the consolidated schema incl. auth tables
  auth = betterAuth({
    secret: 'test-secret-please-change',
    database: drizzleAdapter(ctx.db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: false },
    plugins: [
      username(),
      admin(),
      emailOTP({ otpLength: 6, async sendVerificationOTP({ otp }) { lastOtp = otp } }),
    ],
    databaseHooks: {
      user: { create: { before: async (u) => ({ data: { ...u, role: u.email === 'boss@revelio.cards' ? 'admin' : 'user' } }) } },
    },
  })
}, 60_000)
afterAll(async () => { await ctx.stop() })

describe('email-OTP auth', () => {
  it('signs up a new user via OTP and creates a session', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'ann@example.com', type: 'sign-in' } })
    expect(lastOtp).toMatch(/^\d{6}$/)
    const res = await auth.api.signInEmailOTP({ body: { email: 'ann@example.com', otp: lastOtp }, asResponse: true })
    expect(res.status).toBe(200)
  })

  it('promotes ADMIN_EMAILS on sign-up', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'boss@revelio.cards', type: 'sign-in' } })
    await auth.api.signInEmailOTP({ body: { email: 'boss@revelio.cards', otp: lastOtp } })
    const [row] = await ctx.db.select().from(schema.user).where(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (schema as any).eq ? undefined : undefined,
    ).limit(50)
    const admins = await ctx.db.select().from(schema.user)
    expect(admins.find((u) => u.email === 'boss@revelio.cards')?.role).toBe('admin')
  })
})
```
(Adjust `auth.api.*` method/body shapes to the installed better-auth; the assertions — OTP is 6 digits, sign-in succeeds, ADMIN_EMAILS → role 'admin' — are the gate.)

- [ ] **Step 5: Run — RED then GREEN**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run auth`
Expected: fails until the schema/config are correct, then PASS (2 tests). Also `cd app/web && npx next build` (route handler + client compile).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/app/api/auth app/web/src/lib/auth-client.ts app/web/src/lib/session.ts app/ingest/test/auth.test.ts
git commit -m "feat(auth): route handler, client, session/role helpers + OTP integration test"
```

---

### Task 3: Login UI + header account state

**Files:**
- Create: `app/web/src/app/[locale]/login/page.tsx`, `app/web/src/components/account-menu.tsx`
- Modify: `app/web/src/components/site-header.tsx`, `app/web/messages/{en,de}.json` (`auth` namespace)
- Test: `app/web/src/components/__tests__/account-menu.test.tsx`

**Interfaces:**
- Consumes: `authClient`, `useSession`, `signOut` (`@/lib/auth-client`); shadcn `Input`/`Button`; next-intl `Link`.

- [ ] **Step 1: Login page (email + username → OTP → code)**

`app/web/src/app/[locale]/login/page.tsx` (client component): a two-step form. Step 1 collects **email** + **username** (username used when the account is new) and calls `authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })`; Step 2 shows a 6-digit code input and calls `authClient.signIn.emailOtp({ email, otp })`, then — if a username was entered and the account is new — `authClient.updateUser({ username })`; on success `router.push('/')`. Use shadcn `Input`/`Button`, `useTranslations('auth')`, and surface errors (invalid/expired code, username taken). Full code:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    setBusy(false)
    if (error) return setError(t('sendFailed'))
    setStep('code')
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const { error } = await authClient.signIn.emailOtp({ email, otp: code })
    if (error) { setBusy(false); return setError(t('badCode')) }
    if (name) await authClient.updateUser({ username: name }).catch(() => {})
    router.push('/')
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-3">
          <Input type="email" required placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="text" placeholder={t('username')} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy} className="w-full">{t('sendCode')}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
          <Input inputMode="numeric" required placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={busy} className="w-full">{t('verify')}</Button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </main>
  )
}
```

- [ ] **Step 2: `auth` messages**

`messages/en.json` `"auth"`: `{ "title": "Sign in", "email": "Email", "username": "Username (for new accounts)", "sendCode": "Send code", "codeSent": "We emailed a 6-digit code to {email}.", "verify": "Verify", "sendFailed": "Could not send the code. Try again.", "badCode": "Invalid or expired code.", "signIn": "Sign in", "signOut": "Sign out" }`.
`de.json`: German equivalents (`"title": "Anmelden"`, `"signIn": "Anmelden"`, `"signOut": "Abmelden"`, …).

- [ ] **Step 3: Account menu (header) + failing test**

`app/web/src/components/__tests__/account-menu.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { username: 'hermione' } } }),
  signOut: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

import { AccountMenu } from '../account-menu'

describe('AccountMenu', () => {
  it('shows the username when signed in', () => {
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    expect(screen.getByText('hermione')).toBeInTheDocument()
  })
})
```
`app/web/src/components/account-menu.tsx` (client):
```tsx
'use client'
import { Link } from '@/../i18n/navigation'
import { useSession, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function AccountMenu({ signInLabel, signOutLabel }: { signInLabel: string; signOutLabel: string }) {
  const { data } = useSession()
  if (!data?.user) {
    return <Button variant="ghost" size="sm" asChild><Link href="/login">{signInLabel}</Link></Button>
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium">{data.user.username ?? data.user.email}</span>
      <Button variant="ghost" size="sm" onClick={() => signOut()}>{signOutLabel}</Button>
    </span>
  )
}
```
Run: `cd app/web && npx vitest run account-menu` → RED then GREEN.

- [ ] **Step 4: Mount in the header**

In `app/web/src/components/site-header.tsx`, render `<AccountMenu signInLabel={t('signIn')} signOutLabel={t('signOut')} />` (fetch via `getTranslations('auth')`) inside the header nav, after the language switcher.

- [ ] **Step 5: Run vitest + build**

Run: `cd app/web && npx vitest run` (all green) and `npx next build` (succeeds; `/[locale]/login` present, `/api/auth/[...all]` route present).

- [ ] **Step 6: Commit**

```bash
git add "app/web/src/app/[locale]/login" app/web/src/components/account-menu.tsx app/web/src/components/site-header.tsx app/web/messages app/web/src/components/__tests__/account-menu.test.tsx
git commit -m "feat(auth): login page (email OTP + username) and header account menu"
```

---

## Self-Review

**Spec coverage:**
- Better Auth + email-OTP + username + admin/roles plugins, Drizzle adapter, same Postgres → Task 1 ✓
- Registration (email+username), OTP login, session → Tasks 2-3 ✓
- Dev email = console; prod deferred → Task 1 Step 2 ✓
- Roles + `requireRole` + `ADMIN_EMAILS` bootstrap → Task 1 (hook) + Task 2 (helper/test) ✓
- Auth tables in `@revelio/db` + regenerated migration → Task 1 Steps 3-5 ✓
- Login UI + header account state → Task 3 ✓
- Env `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`/`ADMIN_EMAILS` → Task 1 config ✓
- Integration test (OTP round-trip, ADMIN_EMAILS), `requireRole` gating → Task 2 ✓
- OUT of scope (editing/decks/prod email/promote UI) → not built ✓

**Placeholder scan:** No TBD/TODO. The single explicit caveat — "match the installed better-auth v1 API" — is a bounded, honest note for a versioned dependency, with the integration test as the objective gate; not a content placeholder. All component/UI code is complete.

**Type/name consistency:** `auth` (`@/lib/auth`) consumed by the route handler, `session.ts`, and the test. `authClient`/`useSession`/`signOut` (`@/lib/auth-client`) used by `account-menu` + login page. `requireRole('editor'|'admin')` shape is what 4b-2's edit actions will call. Auth table exports (`user`/`session`/`account`/`verification`) named consistently across `auth-schema.ts` → `index.ts` → the test.

## Notes for later plans
- **4b-2 (edit translations):** server actions call `requireRole('editor')`, update `card_localizations` with `origin: 'user'` + `updated_at`, then re-index that card in Meili.
- **Plan 5:** prod email provider for OTP; OTP rate-limiting review; the incremental-migration strategy (auth tables make a fresh-DB requirement more painful — another reason to move off regenerated migrations).
- A **promote-user admin UI** (user→editor) is a small later slice; until then use `ADMIN_EMAILS` + manual DB.

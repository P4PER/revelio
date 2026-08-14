# Logged-Out Teasers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/collection` and `/decks/mine` a consistent signed-out state — a teaser card floating over a blurred, dimmed ghost of that page's real layout — and make every login redirect carry the user back to where they started.

**Architecture:** A pure `redirect-path` module validates and builds `?redirect=` hrefs; a server-side `requireUser(redirectTo)` guard uses it for pages with nothing to show signed out (settings); a `SignedOutTeaser` component uses it for pages that get a teaser instead. The `/login` and `/register` pages read the parameter server-side (no `useSearchParams`, so no Suspense boundary is needed) and hand it to `AuthForm`, which pushes it after a successful OTP verification.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Better Auth, Tailwind v4 + shadcn, Vitest + Testing Library.

**Spec:** No spec file — this is a bounded change designed in chat. The approved visual treatment is "B: dimmed and blurred behind a solid card" from the mockups at https://claude.ai/code/artifact/7bd23f64-2ddd-4892-9606-535c7d6d8a1f

## Global Constraints

- All commands run from `app/`. Tests: `npm test -w web -- <path>`.
- Conventional Commits.
- Every user-facing string comes from `web/messages/en.json` AND `web/messages/de.json`. Never hardcode.
- Code comments are ASCII only (no em-dashes, no unicode arrows).
- Locale-aware navigation only: `Link` / `redirect` / `useRouter` from `@/../i18n/navigation`, never bare `next/link` or `next/navigation`. Hrefs passed to those helpers are locale-FREE (`/collection`, not `/de/collection`).
- The ghost skeleton never animates and is always `aria-hidden`.
- Do not commit to `main`. Work happens on `feat/logged-out-teasers`.

---

## File Structure

**Create:**
- `web/src/lib/redirect-path.ts` — validate/build post-login hrefs. Pure, no I/O, importable from client AND server.
- `web/src/lib/require-user.ts` — server-side auth guard that redirects to `/login` with a return URL.
- `web/src/components/ui/skeleton.tsx` — shadcn Skeleton primitive.
- `web/src/components/signed-out-teaser.tsx` — teaser card over a blurred ghost.
- `web/src/components/collection-skeleton.tsx` — ghost of the collection page.
- `web/src/components/deck-list-skeleton.tsx` — ghost of the deck list.

**Modify:**
- `web/src/lib/settings-user.ts` — delegate to `requireUser`, take a `redirectTo`.
- `web/src/app/[locale]/settings/{page,profile/page,email/page,data/page,danger/page}.tsx` — pass their own path.
- `web/src/app/[locale]/login/page.tsx`, `register/page.tsx` — read `?redirect=` server-side.
- `web/src/components/auth-card.tsx`, `web/src/components/auth-form.tsx` — thread `redirectTo` through; push it after verification.
- `web/src/app/[locale]/collection/page.tsx` — teaser instead of `redirect()`.
- `web/src/app/[locale]/decks/mine/page.tsx` — teaser instead of the plain centered empty state.
- `web/messages/en.json`, `web/messages/de.json` — `collection.loggedOut.*`, reworded `decks.list.loggedOut.*`.

---

### Task 1: Redirect path validation

**Files:**
- Create: `app/web/src/lib/redirect-path.ts`
- Test: `app/web/src/lib/__tests__/redirect-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `REDIRECT_PARAM: 'redirect'`, `safeRedirectPath(value: string | null | undefined): string | null`, `loginHref(to?: string | null): string`, `registerHref(to?: string | null): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { REDIRECT_PARAM, safeRedirectPath, loginHref, registerHref } from '../redirect-path'

describe('safeRedirectPath', () => {
  it('keeps a root-relative path, including query and hash', () => {
    expect(safeRedirectPath('/collection')).toBe('/collection')
    expect(safeRedirectPath('/collection?tab=browse#top')).toBe('/collection?tab=browse#top')
  })

  it('rejects absolute URLs', () => {
    expect(safeRedirectPath('https://evil.example/collection')).toBeNull()
    expect(safeRedirectPath('javascript:alert(1)')).toBeNull()
  })

  it('rejects protocol-relative paths', () => {
    expect(safeRedirectPath('//evil.example')).toBeNull()
  })

  it('rejects backslash variants browsers normalise to //', () => {
    expect(safeRedirectPath('/\\evil.example')).toBeNull()
    expect(safeRedirectPath('\\\\evil.example')).toBeNull()
  })

  it('rejects control characters', () => {
    expect(safeRedirectPath('/collection\nSet-Cookie: x=1')).toBeNull()
  })

  it('rejects empty and missing values', () => {
    expect(safeRedirectPath('')).toBeNull()
    expect(safeRedirectPath(null)).toBeNull()
    expect(safeRedirectPath(undefined)).toBeNull()
  })
})

describe('loginHref', () => {
  it('is bare /login without a target', () => {
    expect(loginHref()).toBe('/login')
  })

  it('carries an encoded target', () => {
    expect(loginHref('/collection?tab=browse')).toBe(`/login?${REDIRECT_PARAM}=%2Fcollection%3Ftab%3Dbrowse`)
  })

  it('drops an unsafe target rather than passing it on', () => {
    expect(loginHref('//evil.example')).toBe('/login')
  })
})

describe('registerHref', () => {
  it('carries the same target to /register', () => {
    expect(registerHref('/decks/mine')).toBe(`/register?${REDIRECT_PARAM}=%2Fdecks%2Fmine`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/redirect-path.test.ts`
Expected: FAIL — cannot resolve `../redirect-path`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Shared by the server-side guard (require-user.ts) and the client-side auth
// form, so this module must stay free of 'server-only' and of next/headers.

/** Query parameter carrying the post-login destination. */
export const REDIRECT_PARAM = 'redirect'

/**
 * Narrows a `?redirect=` value to a path we are willing to navigate to.
 * Only root-relative, same-origin paths pass. Anything that could send the
 * user off-site is dropped: absolute URLs, protocol-relative "//host", the
 * "/\" variant browsers normalise to "//", and control characters.
 *
 * Values are locale-FREE hrefs ("/collection"): the next-intl navigation
 * helpers add the locale prefix on the way out.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return value
}

function withRedirect(base: '/login' | '/register', to?: string | null): string {
  const target = safeRedirectPath(to)
  return target ? `${base}?${REDIRECT_PARAM}=${encodeURIComponent(target)}` : base
}

/** `/login`, carrying `to` as the post-login destination when it is safe. */
export function loginHref(to?: string | null): string {
  return withRedirect('/login', to)
}

/** `/register`, carrying `to` so the cross-link does not lose the destination. */
export function registerHref(to?: string | null): string {
  return withRedirect('/register', to)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/redirect-path.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/redirect-path.ts app/web/src/lib/__tests__/redirect-path.test.ts
git commit -m "feat(web): add same-origin redirect path helpers for auth"
```

---

### Task 2: requireUser guard

**Files:**
- Create: `app/web/src/lib/require-user.ts`
- Test: `app/web/src/lib/__tests__/require-user.test.ts`
- Modify: `app/web/src/lib/settings-user.ts`
- Modify: `app/web/src/app/[locale]/settings/page.tsx`, `settings/profile/page.tsx`, `settings/email/page.tsx`, `settings/data/page.tsx`, `settings/danger/page.tsx`

**Interfaces:**
- Consumes: `loginHref` from Task 1; `getSession` from `@/lib/session`.
- Produces: `requireUser(redirectTo?: string)` returning the Better Auth session user; `requireSettingsUser(redirectTo?: string): Promise<SettingsUser>` (same shape as today, new optional argument).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSession = vi.fn()
const redirectMock = vi.fn(() => {
  // The real next-intl redirect throws to halt rendering; mirror that so the
  // test proves requireUser never returns for a signed-out visitor.
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
vi.mock('@/../i18n/navigation', () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'de' }))

import { requireUser } from '../require-user'

beforeEach(() => {
  getSession.mockReset()
  redirectMock.mockClear()
})

describe('requireUser', () => {
  it('returns the user when signed in', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } })
    await expect(requireUser('/settings/profile')).resolves.toMatchObject({ id: 'u1' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects a signed-out visitor to /login carrying the destination', async () => {
    getSession.mockResolvedValue(null)
    await expect(requireUser('/settings/profile')).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith({
      href: '/login?redirect=%2Fsettings%2Fprofile',
      locale: 'de',
    })
  })

  it('redirects to bare /login when no destination is given', async () => {
    getSession.mockResolvedValue(null)
    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'de' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/require-user.test.ts`
Expected: FAIL — cannot resolve `../require-user`.

- [ ] **Step 3: Write minimal implementation**

```ts
import 'server-only'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { loginHref } from '@/lib/redirect-path'

/**
 * The signed-in user, or a redirect to /login carrying `redirectTo` so signing
 * in lands back where the visitor started. Pass the locale-free href of the
 * page doing the guarding, e.g. '/settings/profile'.
 *
 * Use this only for pages with nothing to show signed out. Pages that have a
 * logged-out story (/collection, /decks/mine) render SignedOutTeaser instead:
 * bouncing someone to a login form is the right call only when the page would
 * otherwise be empty.
 */
export async function requireUser(redirectTo?: string) {
  const session = await getSession()
  if (!session?.user) redirect({ href: loginHref(redirectTo), locale: await getLocale() })
  return session!.user
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/require-user.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Route the settings guard through it**

Replace the body of `requireSettingsUser` in `app/web/src/lib/settings-user.ts`:

```ts
import 'server-only'
import { requireUser } from '@/lib/require-user'
import type { SettingsUser } from '@/components/settings/types'

/**
 * The current user shaped for the settings panes. Redirects to /login when
 * signed out, carrying `redirectTo` so the visitor comes back here - call it
 * at the top of every settings page (Next.js auth guidance is to check auth in
 * the page/data layer, not only in a layout).
 */
export async function requireSettingsUser(redirectTo?: string): Promise<SettingsUser> {
  const u = await requireUser(redirectTo)
  return {
    id: u.id,
    username: u.username ?? null,
    displayUsername: u.displayUsername ?? null,
    email: u.email,
    role: u.role ?? null,
    createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
  }
}
```

Then pass each page's own path at the five call sites:
- `settings/page.tsx`: `await requireSettingsUser('/settings/profile')`
- `settings/profile/page.tsx`: `await requireSettingsUser('/settings/profile')`
- `settings/email/page.tsx`: `await requireSettingsUser('/settings/email')`
- `settings/data/page.tsx`: `await requireSettingsUser('/settings/data')`
- `settings/danger/page.tsx`: `await requireSettingsUser('/settings/danger')`

- [ ] **Step 6: Run the settings and lib suites**

Run: `npm test -w web -- src/app/\[locale\]/settings src/lib/__tests__/require-user.test.ts`
Expected: PASS, no new warnings.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/lib/require-user.ts app/web/src/lib/__tests__/require-user.test.ts app/web/src/lib/settings-user.ts "app/web/src/app/[locale]/settings"
git commit -m "feat(web): redirect signed-out settings visitors back after login"
```

---

### Task 3: Auth form returns the visitor to their destination

**Files:**
- Modify: `app/web/src/app/[locale]/login/page.tsx`, `app/web/src/app/[locale]/register/page.tsx`
- Modify: `app/web/src/components/auth-card.tsx`, `app/web/src/components/auth-form.tsx`
- Test: `app/web/src/components/__tests__/auth-form.test.tsx` (extend)

**Interfaces:**
- Consumes: `safeRedirectPath`, `loginHref`, `registerHref`, `REDIRECT_PARAM` from Task 1.
- Produces: `AuthForm({ mode, redirectTo })`, `AuthCard({ mode, redirectTo })` where `redirectTo?: string | null`.

The parameter is read on the server and passed down as a prop rather than read
with `useSearchParams` in the client component: `useSearchParams` in a
statically rendered route forces a Suspense boundary at build time, and
validating server-side keeps the untrusted value out of the client entirely.

- [ ] **Step 1: Write the failing tests**

Append to `app/web/src/components/__tests__/auth-form.test.tsx`. Note the existing
`vi.mock('@/../i18n/navigation', ...)` at the top of that file returns a fresh
`vi.fn()` for `push` on every render, so replace that mock factory with a shared spy:

```tsx
const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
```

and update `renderForm` to take the prop:

```tsx
function renderForm(mode: 'login' | 'register', redirectTo?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AuthForm mode={mode} redirectTo={redirectTo} />
    </NextIntlClientProvider>,
  )
}
```

Then add:

```tsx
async function signInWith(redirectTo?: string | null) {
  const user = userEvent.setup()
  renderForm('login', redirectTo)
  await user.type(screen.getByLabelText('Email'), 'a@b.co')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  const slots = await screen.findAllByRole('textbox')
  await user.type(slots[0], '123456')
  await user.click(screen.getByRole('button', { name: 'Verify' }))
}

it('lands on the destination after verifying with a redirect target', async () => {
  await signInWith('/collection')
  expect(push).toHaveBeenCalledWith('/collection')
})

it('lands on the home page when there is no redirect target', async () => {
  await signInWith(null)
  expect(push).toHaveBeenCalledWith('/')
})

it('keeps the destination on the link across to register', () => {
  renderForm('login', '/decks/mine')
  expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
    'href',
    '/register?redirect=%2Fdecks%2Fmine',
  )
})
```

Add `push.mockClear()` to the existing `beforeEach`. If the OTP input does not
expose six textboxes under `getAllByRole('textbox')`, read the existing verify
test in this file and reuse whatever selector it already uses to fill the code.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- src/components/__tests__/auth-form.test.tsx`
Expected: FAIL — `push` called with `'/'` instead of `'/collection'`, and the register link has no query.

- [ ] **Step 3: Write minimal implementation**

In `auth-form.tsx`, take the prop and use it in the two places:

```tsx
import { loginHref, registerHref } from '@/lib/redirect-path'

export function AuthForm({ mode, redirectTo }: { mode: 'login' | 'register'; redirectTo?: string | null }) {
```

Replace `router.push('/')` with:

```tsx
    // Back to wherever the visitor was headed before the sign-in wall.
    router.push(redirectTo ?? '/')
```

Replace the two cross-link hrefs at the bottom of the component:

```tsx
            <Link href={loginHref(redirectTo)} className="text-foreground underline">{t('signIn')}</Link>
```
```tsx
            <Link href={registerHref(redirectTo)} className="text-foreground underline">{t('register')}</Link>
```

In `auth-card.tsx`:

```tsx
export function AuthCard({ mode, redirectTo }: { mode: 'login' | 'register'; redirectTo?: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-6 py-12 md:py-20">
      <AuthForm mode={mode} redirectTo={redirectTo} />
    </main>
  )
}
```

In `login/page.tsx`, replace the default export (keep `generateMetadata` as it is):

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  // Validated here, on the server, so an untrusted value never reaches the client.
  const redirectTo = safeRedirectPath((await searchParams).redirect)
  return <AuthCard mode="login" redirectTo={redirectTo} />
}
```

with `import { safeRedirectPath } from '@/lib/redirect-path'` added. Apply the
same change to `register/page.tsx` with `mode="register"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- src/components/__tests__/auth-form.test.tsx src/components/__tests__/auth-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/auth-form.tsx app/web/src/components/auth-card.tsx "app/web/src/app/[locale]/login" "app/web/src/app/[locale]/register" app/web/src/components/__tests__/auth-form.test.tsx
git commit -m "feat(web): return to the requested page after signing in"
```

---

### Task 4: Skeleton primitive and SignedOutTeaser

**Files:**
- Create: `app/web/src/components/ui/skeleton.tsx`
- Create: `app/web/src/components/signed-out-teaser.tsx`
- Test: `app/web/src/components/__tests__/signed-out-teaser.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`, `Link` from `@/../i18n/navigation`.
- Produces: `Skeleton` (a `div` with `data-slot="skeleton"`); `SignedOutTeaser({ title, description, primary, secondary, children })` where `primary`/`secondary` are `{ label: string; href: string }` and `children` is the ghost.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { SignedOutTeaser } from '../signed-out-teaser'

function renderTeaser() {
  return render(
    <SignedOutTeaser
      title="Track what you own"
      description="Mark cards as owned."
      primary={{ label: 'Sign in', href: '/login?redirect=%2Fcollection' }}
      secondary={{ label: 'Browse sets', href: '/sets' }}
    >
      <div data-testid="ghost">ghost</div>
    </SignedOutTeaser>,
  )
}

describe('SignedOutTeaser', () => {
  it('makes the teaser title the page heading', () => {
    renderTeaser()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Track what you own')
  })

  it('offers both calls to action', () => {
    renderTeaser()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirect=%2Fcollection')
    expect(screen.getByRole('link', { name: 'Browse sets' })).toHaveAttribute('href', '/sets')
  })

  it('hides the ghost from assistive tech', () => {
    const { container } = renderTeaser()
    const ghostLayer = container.querySelector('[aria-hidden="true"]')
    expect(ghostLayer).not.toBeNull()
    expect(ghostLayer).toContainElement(screen.getByTestId('ghost'))
  })

  it('never animates the ghost', () => {
    const { container } = renderTeaser()
    const ghostLayer = container.querySelector('[aria-hidden="true"]')!
    expect(ghostLayer.className).toContain('[&_[data-slot=skeleton]]:animate-none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/signed-out-teaser.test.tsx`
Expected: FAIL — cannot resolve `../signed-out-teaser`.

- [ ] **Step 3: Write minimal implementation**

`ui/skeleton.tsx` (shadcn's primitive; `bg-muted` rather than the upstream
`bg-accent` because this theme's accent is a vivid violet, not a neutral surface):

```tsx
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
```

`signed-out-teaser.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'

type Cta = { label: string; href: string }

/**
 * Signed-out state for a page that has something worth showing: a teaser card
 * over a blurred, dimmed ghost of the real layout, so a visitor can see the
 * shape of what signing in gets them.
 *
 * The ghost is decoration. It is hidden from assistive tech, non-interactive,
 * and deliberately NOT animated - a pulsing skeleton promises data that is on
 * its way, and nothing is on its way until the visitor signs in. The teaser
 * title carries the page's h1, since the ghost's own heading is hidden.
 */
export function SignedOutTeaser({
  title,
  description,
  primary,
  secondary,
  children,
}: {
  title: string
  description: string
  primary: Cta
  secondary: Cta
  children: ReactNode
}) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none max-h-[38rem] select-none overflow-hidden opacity-45 blur-[4px] [&_[data-slot=skeleton]]:animate-none"
      >
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-2xl">
          <h1 className="text-balance text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={primary.href}>{primary.label}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/signed-out-teaser.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/ui/skeleton.tsx app/web/src/components/signed-out-teaser.tsx app/web/src/components/__tests__/signed-out-teaser.test.tsx
git commit -m "feat(web): add skeleton primitive and signed-out teaser"
```

---

### Task 5: Collection teaser

**Files:**
- Create: `app/web/src/components/collection-skeleton.tsx`
- Modify: `app/web/src/app/[locale]/collection/page.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/app/[locale]/collection/__tests__/page-signed-out.test.tsx`

**Interfaces:**
- Consumes: `SignedOutTeaser`, `Skeleton` (Task 4), `loginHref` (Task 1).
- Produces: `CollectionSkeleton()`.

- [ ] **Step 1: Add the message keys**

In `messages/en.json`, inside `"collection"`:

```json
    "loggedOut": {
      "title": "Track what you own",
      "desc": "Mark cards as owned, watch each set fill up, and share your collection with a single link.",
      "signIn": "Sign in",
      "browseSets": "Browse sets"
    },
```

In `messages/de.json`, inside `"collection"`:

```json
    "loggedOut": {
      "title": "Behalte deine Sammlung im Blick",
      "desc": "Markiere Karten als vorhanden, verfolge deinen Fortschritt Set fuer Set und teile deine Sammlung mit einem Link.",
      "signIn": "Anmelden",
      "browseSets": "Sets entdecken"
    },
```

Use the real German characters (`fuer` above is ASCII only because this plan file avoids unicode in code blocks; write `für` in the JSON).

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const getSession = vi.fn()
const loadCollectionPage = vi.fn()

vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/search-client', () => ({ getSearchClient: () => ({}) }))
vi.mock('@/lib/collection-page-data', () => ({ loadCollectionPage: (...a: unknown[]) => loadCollectionPage(...a) }))
vi.mock('@revelio/db', () => ({ getCollectionVisibility: vi.fn() }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import CollectionPage from '../page'
import en from '@/../messages/en.json'

beforeEach(() => {
  getSession.mockReset()
  loadCollectionPage.mockReset()
})

describe('signed-out /collection', () => {
  it('shows the teaser with a sign-in link that comes back here', async () => {
    getSession.mockResolvedValue(null)
    const ui = await CollectionPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })
    render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Track what you own')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcollection',
    )
  })

  it('does no collection lookup for a signed-out visitor', async () => {
    getSession.mockResolvedValue(null)
    await CollectionPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })
    expect(loadCollectionPage).not.toHaveBeenCalled()
  })
})
```

If `setRequestLocale` or `getTranslations` complain outside a request scope, add
`vi.mock('next-intl/server', ...)` returning `setRequestLocale: vi.fn()` and a
`getTranslations` that resolves keys out of `en.json` — check
`src/app/[locale]/__tests__/contact-page.test.tsx` for the pattern this repo
already uses before inventing one.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/collection/__tests__/page-signed-out.test.tsx"`
Expected: FAIL — the page still calls `redirect()` instead of rendering a teaser.

- [ ] **Step 4: Write the skeleton**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

// Static ghost of the signed-in collection page: heading and summary, tab bar,
// set rail, card grid. Column counts mirror CollectionView so the shape behind
// the teaser is the shape the visitor gets after signing in.
export function CollectionSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8">
        <div className="flex w-full flex-col gap-4 min-[1024px]:w-56">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[768px]:grid-cols-4 min-[1780px]:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[5/7] w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire the page**

In `app/web/src/app/[locale]/collection/page.tsx`: drop the `redirect` import from
`next/navigation`, add

```tsx
import type { Metadata } from 'next'
import { SignedOutTeaser } from '@/components/signed-out-teaser'
import { CollectionSkeleton } from '@/components/collection-skeleton'
import { loginHref } from '@/lib/redirect-path'

// Personal page, and now renderable signed out - keep the teaser out of the index.
export const metadata: Metadata = { robots: { index: false } }
```

and replace `if (!userId) redirect(...)` with:

```tsx
  if (!userId) {
    const tOut = await getTranslations({ locale, namespace: 'collection.loggedOut' })
    return (
      <main className="mx-auto max-w-[76rem] px-6 py-8">
        <SignedOutTeaser
          title={tOut('title')}
          description={tOut('desc')}
          primary={{ label: tOut('signIn'), href: loginHref('/collection') }}
          secondary={{ label: tOut('browseSets'), href: '/sets' }}
        >
          <CollectionSkeleton />
        </SignedOutTeaser>
      </main>
    )
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w web -- "src/app/[locale]/collection" src/components/__tests__/signed-out-teaser.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/web/src/app/[locale]/collection" app/web/src/components/collection-skeleton.tsx app/web/messages
git commit -m "feat(web): show a teaser instead of a login bounce on /collection"
```

---

### Task 6: My Decks teaser

**Files:**
- Create: `app/web/src/components/deck-list-skeleton.tsx`
- Modify: `app/web/src/app/[locale]/decks/mine/page.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/app/[locale]/decks/mine/__tests__/page-signed-out.test.tsx`

**Interfaces:**
- Consumes: `SignedOutTeaser`, `Skeleton` (Task 4), `loginHref` (Task 1).
- Produces: `DeckListSkeleton()`.

- [ ] **Step 1: Reword the message keys**

`decks.list.loggedOut` currently reads as an instruction ("Sign in to see your
decks") rather than a teaser. In `messages/en.json`:

```json
      "loggedOut": {
        "title": "Your decks live here",
        "desc": "Sign in to pick up where you left off, or start building right now - no account needed.",
        "signIn": "Sign in",
        "tryBuilder": "Try the builder"
      },
```

In `messages/de.json`:

```json
      "loggedOut": {
        "title": "Hier wohnen deine Decks",
        "desc": "Melde dich an, um dort weiterzumachen, wo du aufgehoert hast - oder bau direkt los, ganz ohne Konto.",
        "signIn": "Anmelden",
        "tryBuilder": "Builder ausprobieren"
      },
```

(Write `aufgehört` with the real umlaut in the JSON; the ASCII spelling here is a
constraint of this plan file only.)

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const getSession = vi.fn()
const listDecksByUser = vi.fn()

vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ listDecksByUser: (...a: unknown[]) => listDecksByUser(...a) }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import DecksPage from '../page'
import en from '@/../messages/en.json'

beforeEach(() => {
  getSession.mockReset()
  listDecksByUser.mockReset()
})

describe('signed-out /decks/mine', () => {
  it('shows the teaser with a sign-in link that comes back here', async () => {
    getSession.mockResolvedValue(null)
    const ui = await DecksPage({ params: Promise.resolve({ locale: 'en' }) })
    render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your decks live here')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdecks%2Fmine',
    )
    expect(screen.getByRole('link', { name: 'Try the builder' })).toHaveAttribute('href', '/decks/new')
  })

  it('does no deck lookup for a signed-out visitor', async () => {
    getSession.mockResolvedValue(null)
    await DecksPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(listDecksByUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/decks/mine"`
Expected: FAIL — heading text is still "Sign in to see your decks" and it is an `h1` without a teaser.

- [ ] **Step 4: Write the skeleton**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

// Static ghost of the signed-in deck list: the same 1/2/4-column card grid
// DeckList renders, with a name line, a format badge and a fill bar per card.
export function DeckListSkeleton() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-input bg-card/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="size-4" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire the page**

In `app/web/src/app/[locale]/decks/mine/page.tsx`, replace the whole `if (!session?.user)`
block with:

```tsx
  if (!session?.user) {
    return (
      <main className="mx-auto max-w-[76rem] px-6 py-8">
        <SignedOutTeaser
          title={t('list.loggedOut.title')}
          description={t('list.loggedOut.desc')}
          primary={{ label: t('list.loggedOut.signIn'), href: loginHref('/decks/mine') }}
          secondary={{ label: t('list.loggedOut.tryBuilder'), href: '/decks/new' }}
        >
          <DeckListSkeleton />
        </SignedOutTeaser>
      </main>
    )
  }
```

with imports for `SignedOutTeaser`, `DeckListSkeleton` and `loginHref`. The
`Button` import stays (the signed-in branch still uses it); drop it only if
nothing else references it.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w web -- "src/app/[locale]/decks"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/web/src/app/[locale]/decks/mine" app/web/src/components/deck-list-skeleton.tsx app/web/messages
git commit -m "feat(web): show a teaser and deck ghost on signed-out /decks/mine"
```

---

### Task 7: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Whole suite**

Run: `npm test -w web`
Expected: PASS. A `@revelio/ingest` testcontainers flake is a known parallelism issue and is not part of this workspace.

- [ ] **Step 2: Types**

Run: `npm run typecheck`
Expected: no errors across all workspaces.

- [ ] **Step 3: Lint**

Run: `npm run lint -w web`
Expected: no NEW warnings (the repo currently reports 14 pre-existing ones).

- [ ] **Step 4: Look at it**

Run: `npm run dev -w web`, then open `/collection` and `/decks/mine` signed out,
at a desktop width and at 390px. Confirm: the ghost is blurred and still, the
card is centred and readable, "Sign in" lands on `/login`, and verifying the OTP
returns to the page you started from. Repeat on `/de/collection` to confirm the
locale prefix survives the round trip.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): <what the check caught>"
```

---

## Self-Review

**Spec coverage:** teaser on both pages (Tasks 5, 6), treatment B blur/dim/solid card (Task 4), page-specific skeletons (Tasks 5, 6), `requireUser` helper (Task 2), redirect support end to end (Tasks 1, 2, 3). Covered.

**Placeholders:** none — every step carries the code it needs. Two steps say "check the existing pattern in file X before inventing one" (OTP selector, next-intl server mocks); those name the exact file to read.

**Type consistency:** `safeRedirectPath` / `loginHref` / `registerHref` / `REDIRECT_PARAM` are defined in Task 1 and used with those exact names in Tasks 2, 3, 5, 6. `SignedOutTeaser` props (`title`, `description`, `primary`, `secondary`, `children`) match at all three call sites. `requireSettingsUser` keeps its return type and gains one optional argument, so the existing settings test keeps passing.

## Known follow-ups (out of scope)

- `/decks/new` already lets anyone build and only asks for an account at save time. That deferred-auth pattern converts better than any wall and is worth reusing for future gated flows.
- `robots.ts` claims collections are kept out of the index by per-page noindex; Task 5 makes that claim true for `/collection`, which had no metadata export because it used to redirect.

# Admin Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin area a persistent left sidebar (in the page gutter) for jumping between sections, with `/admin` resuming the last-visited section via a cookie.

**Architecture:** The parent `[locale]/layout.tsx` keeps supplying the global `SiteHeader` (the logo is the route home). The admin `layout.tsx` wraps children in a centered flex row: a fixed-width sidebar sitting in the gutter *outside* the content's `max-w-[76rem]`, plus the full-width content. A pure `admin-nav.ts` module holds the section registry + cookie resolver (server-safe, unit-tested); the client `AdminSidebar` renders nav with active state and writes the cookie; `/admin/page.tsx` reads the cookie server-side and redirects.

**Tech Stack:** Next.js 16 App Router (React 19), next-intl (locale-aware `Link`/`redirect`/`usePathname` from `@/../i18n/navigation`), Tailwind v4, shadcn `Sheet`/`Button`, `lucide-react`, Vitest + Testing Library.

## Global Constraints

- All app commands run from `app/`. Web workspace: `-w web`.
- Locale-aware navigation only: import `Link`, `redirect`, `usePathname` from `@/../i18n/navigation` — never bare `next/link`/`next/navigation` for locale routes.
- Role logic is server-side only: the layout computes `isAdmin` and passes it as a prop; the client never calls role helpers. The layout's existing `editor` gate (`hasRequiredRole(role, 'editor')` → `notFound()`) stays and is the real access boundary.
- i18n: every user-facing string comes from `messages/en.json` + `messages/de.json`; keys must exist in both.
- Shared types → folder-scoped module; the section registry lives in `src/lib/admin-nav.ts` and is imported by both the server page and the client sidebar.
- Cookie name is exactly `revelio.admin.section`; stored value is always a known section href (e.g. `/admin/sets`), never a raw nested path.
- Conventional Commits.

---

## File structure

- `src/lib/admin-nav.ts` (new) — pure registry + resolvers (`ADMIN_SECTIONS`, `resolveAdminSection`, `activeSectionHref`, `visibleSections`, `ADMIN_SECTION_COOKIE`). No React, no icons, no I/O → safe on server and client.
- `src/lib/__tests__/admin-nav.test.ts` (new) — unit tests for the resolvers.
- `src/app/[locale]/admin/page.tsx` (rewrite) — server redirect; deletes the link-card grid.
- `src/components/admin-sidebar.tsx` (new) — client nav component (desktop aside + mobile `Sheet`), writes the cookie.
- `src/components/__tests__/admin-sidebar.test.tsx` (new) — role filtering, active state, cookie write.
- `src/app/[locale]/admin/layout.tsx` (modify) — gutter flex shell, renders `<AdminSidebar>`.
- `messages/en.json`, `messages/de.json` (modify) — add `admin.nav.*` labels.

---

## Task 1: Section registry + resolvers (pure module)

**Files:**
- Create: `src/lib/admin-nav.ts`
- Test: `src/lib/__tests__/admin-nav.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AdminSectionId = 'sub-types' | 'sets' | 'users' | 'settings'`
  - `interface AdminSection { id: AdminSectionId; href: string; labelKey: string; adminOnly: boolean }`
  - `const ADMIN_SECTIONS: AdminSection[]`
  - `const ADMIN_SECTION_COOKIE = 'revelio.admin.section'`
  - `function visibleSections(isAdmin: boolean): AdminSection[]`
  - `function resolveAdminSection(cookieValue: string | undefined, isAdmin: boolean): string`
  - `function activeSectionHref(pathname: string): string | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/admin-nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  resolveAdminSection,
  activeSectionHref,
  visibleSections,
} from '../admin-nav'

describe('visibleSections', () => {
  it('hides admin-only sections for non-admins', () => {
    expect(visibleSections(false).map((s) => s.id)).toEqual(['sub-types', 'sets'])
  })
  it('shows all sections for admins', () => {
    expect(visibleSections(true).map((s) => s.id)).toEqual([
      'sub-types',
      'sets',
      'users',
      'settings',
    ])
  })
})

describe('resolveAdminSection', () => {
  it('returns a valid stored section', () => {
    expect(resolveAdminSection('/admin/sets', false)).toBe('/admin/sets')
  })
  it('defaults to sub-types when the cookie is absent', () => {
    expect(resolveAdminSection(undefined, false)).toBe('/admin/sub-types')
  })
  it('defaults when the value is unknown/garbage', () => {
    expect(resolveAdminSection('/admin/../etc', true)).toBe('/admin/sub-types')
  })
  it('rejects an admin-only target for a non-admin', () => {
    expect(resolveAdminSection('/admin/users', false)).toBe('/admin/sub-types')
  })
  it('allows an admin-only target for an admin', () => {
    expect(resolveAdminSection('/admin/users', true)).toBe('/admin/users')
  })
})

describe('activeSectionHref', () => {
  it('matches the exact section path', () => {
    expect(activeSectionHref('/admin/sets')).toBe('/admin/sets')
  })
  it('matches a nested sub-page to its parent section', () => {
    expect(activeSectionHref('/admin/sets/new')).toBe('/admin/sets')
    expect(activeSectionHref('/admin/sets/base-set/edit')).toBe('/admin/sets')
  })
  it('returns undefined for /admin itself', () => {
    expect(activeSectionHref('/admin')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/admin-nav.test.ts`
Expected: FAIL — cannot resolve `../admin-nav`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/admin-nav.ts`:

```ts
export type AdminSectionId = 'sub-types' | 'sets' | 'users' | 'settings'

export interface AdminSection {
  id: AdminSectionId
  href: string
  /** key under the `admin.nav` i18n namespace */
  labelKey: string
  adminOnly: boolean
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'sub-types', href: '/admin/sub-types', labelKey: 'subTypes', adminOnly: false },
  { id: 'sets', href: '/admin/sets', labelKey: 'sets', adminOnly: false },
  { id: 'users', href: '/admin/users', labelKey: 'users', adminOnly: true },
  { id: 'settings', href: '/admin/settings', labelKey: 'settings', adminOnly: true },
]

export const ADMIN_SECTION_COOKIE = 'revelio.admin.section'

const DEFAULT_SECTION = '/admin/sub-types'

export function visibleSections(isAdmin: boolean): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => isAdmin || !s.adminOnly)
}

/** Resolve a cookie value to a valid, role-appropriate section href. */
export function resolveAdminSection(
  cookieValue: string | undefined,
  isAdmin: boolean,
): string {
  const match = ADMIN_SECTIONS.find((s) => s.href === cookieValue)
  if (match && (isAdmin || !match.adminOnly)) return match.href
  return DEFAULT_SECTION
}

/**
 * The section href to highlight for a locale-stripped pathname, matching nested
 * sub-pages (e.g. `/admin/sets/new`) to their parent section. `undefined` for `/admin`.
 */
export function activeSectionHref(pathname: string): string | undefined {
  const match = ADMIN_SECTIONS.find(
    (s) => pathname === s.href || pathname.startsWith(s.href + '/'),
  )
  return match?.href
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/admin-nav.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/admin-nav.ts app/web/src/lib/__tests__/admin-nav.test.ts
git commit -m "feat(web): add admin section registry and cookie resolver"
```

---

## Task 2: i18n nav labels

**Files:**
- Modify: `messages/en.json` (add `admin.nav`)
- Modify: `messages/de.json` (add `admin.nav`)

**Interfaces:**
- Consumes: `AdminSection.labelKey` values from Task 1 (`subTypes`, `sets`, `users`, `settings`).
- Produces: `admin.nav.{subTypes,sets,users,settings}` keys used by Task 3's `useTranslations('admin.nav')`.

- [ ] **Step 1: Add the English keys**

In `messages/en.json`, inside the `"admin"` object, add a `"nav"` block (place it right after `"title": "Admin",`):

```json
    "nav": {
      "subTypes": "Sub-types",
      "sets": "Sets",
      "users": "Users",
      "settings": "Settings"
    },
```

- [ ] **Step 2: Add the German keys**

In `messages/de.json`, inside the `"admin"` object, add the matching block:

```json
    "nav": {
      "subTypes": "Unterarten",
      "sets": "Sets",
      "users": "Benutzer",
      "settings": "Einstellungen"
    },
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `cd app/web && node -e "require('./messages/en.json').admin.nav; require('./messages/de.json').admin.nav; console.log('ok')"`
Expected: prints `ok` (no JSON parse error, `nav` present in both).

- [ ] **Step 4: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): add admin sidebar nav i18n labels"
```

---

## Task 3: AdminSidebar client component

**Files:**
- Create: `src/components/admin-sidebar.tsx`
- Test: `src/components/__tests__/admin-sidebar.test.tsx`

**Interfaces:**
- Consumes: `visibleSections`, `activeSectionHref`, `ADMIN_SECTION_COOKIE`, `AdminSectionId` (Task 1); `admin.nav.*` (Task 2); `Sheet*`/`Button`/`cn` primitives.
- Produces: `export function AdminSidebar({ isAdmin }: { isAdmin: boolean })` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/admin-sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'

let mockPathname = '/admin/sets'
vi.mock('@/../i18n/navigation', () => ({
  usePathname: () => mockPathname,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { AdminSidebar } from '../admin-sidebar'

beforeEach(() => {
  mockPathname = '/admin/sets'
  // reset cookie between tests
  document.cookie = 'revelio.admin.section=; path=/; max-age=0'
})

describe('AdminSidebar', () => {
  it('shows all sections for admins', () => {
    renderWithIntl(<AdminSidebar isAdmin={true} />)
    // desktop <aside> + mobile drawer trigger both render the list header;
    // sections appear in the always-mounted desktop aside
    expect(screen.getAllByText('Users').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
  })

  it('hides admin-only sections for non-admins', () => {
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    expect(screen.queryByText('Users')).toBeNull()
    expect(screen.queryByText('Settings')).toBeNull()
    expect(screen.getAllByText('Sub-types').length).toBeGreaterThan(0)
  })

  it('marks the active section (including nested pages) with aria-current', () => {
    mockPathname = '/admin/sets/new'
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    const current = screen.getAllByRole('link', { current: 'page' })
    expect(current.length).toBeGreaterThan(0)
    current.forEach((el) => expect(el).toHaveAttribute('href', '/admin/sets'))
  })

  it('writes the last-section cookie for the active section', () => {
    mockPathname = '/admin/sub-types'
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    expect(document.cookie).toContain('revelio.admin.section=%2Fadmin%2Fsub-types')
  })
})
```

Note: `document.cookie` encodes `/` as `%2F`; the assertion matches the encoded form. If the implementation writes the raw `/admin/sub-types`, jsdom still stores it encoded — keep the assertion as the encoded string.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/admin-sidebar.test.tsx`
Expected: FAIL — cannot resolve `../admin-sidebar`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/admin-sidebar.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, Link } from '@/../i18n/navigation'
import { Menu, Tags, Layers, Users, Settings, type LucideIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ADMIN_SECTION_COOKIE,
  activeSectionHref,
  visibleSections,
  type AdminSectionId,
} from '@/lib/admin-nav'

const ICONS: Record<AdminSectionId, LucideIcon> = {
  'sub-types': Tags,
  sets: Layers,
  users: Users,
  settings: Settings,
}

function NavList({
  isAdmin,
  activeHref,
  onNavigate,
}: {
  isAdmin: boolean
  activeHref: string | undefined
  onNavigate?: () => void
}) {
  const t = useTranslations('admin.nav')
  return (
    <nav className="flex flex-col gap-1">
      {visibleSections(isAdmin).map((s) => {
        const Icon = ICONS[s.id]
        const active = s.href === activeHref
        return (
          <Link
            key={s.id}
            href={s.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/15 font-medium text-primary'
                : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
            {t(s.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}

export function AdminSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const activeHref = activeSectionHref(pathname)
  const t = useTranslations('admin')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!activeHref) return
    const oneYear = 60 * 60 * 24 * 365
    document.cookie = `${ADMIN_SECTION_COOKIE}=${activeHref}; path=/; max-age=${oneYear}; SameSite=Lax`
  }, [activeHref])

  const label = (
    <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {t('title')}
    </p>
  )

  return (
    <>
      {/* Desktop: static sidebar sitting in the gutter (always mounted). */}
      <aside className="hidden w-48 shrink-0 min-[1180px]:block">
        <div className="sticky top-6">
          {label}
          <NavList isAdmin={isAdmin} activeHref={activeHref} />
        </div>
      </aside>

      {/* Mobile: trigger + drawer. */}
      <div className="min-[1180px]:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              {t('title')}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('title')}
            </SheetTitle>
            <NavList
              isAdmin={isAdmin}
              activeHref={activeHref}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/admin-sidebar.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/admin-sidebar.tsx app/web/src/components/__tests__/admin-sidebar.test.tsx
git commit -m "feat(web): add admin sidebar nav component"
```

---

## Task 4: `/admin` resume-redirect page

**Files:**
- Rewrite: `src/app/[locale]/admin/page.tsx`
- Test: `src/app/[locale]/admin/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `resolveAdminSection`, `ADMIN_SECTION_COOKIE` (Task 1); `getSession` (`@/lib/session`), `hasRequiredRole` (`@/lib/roles`), `cookies` (`next/headers`), `redirect` (`@/../i18n/navigation`).
- Produces: nothing downstream (leaf route).

- [ ] **Step 1: Write the failing test**

Create `src/app/[locale]/admin/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn()
const getSession = vi.fn()
const cookieGet = vi.fn()

vi.mock('@/../i18n/navigation', () => ({ redirect: (arg: unknown) => redirect(arg) }))
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))
vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
// real roles helper is pure; no need to mock it

import AdminIndexPage from '../page'

const run = () => AdminIndexPage({ params: Promise.resolve({ locale: 'en' }) })

beforeEach(() => {
  redirect.mockClear()
  cookieGet.mockReset()
  getSession.mockReset()
})

describe('AdminIndexPage', () => {
  it('redirects to the stored section for an admin', async () => {
    getSession.mockResolvedValue({ user: { role: 'admin' } })
    cookieGet.mockReturnValue({ value: '/admin/users' })
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/users', locale: 'en' })
  })

  it('falls back to sub-types when no cookie is set', async () => {
    getSession.mockResolvedValue({ user: { role: 'editor' } })
    cookieGet.mockReturnValue(undefined)
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/sub-types', locale: 'en' })
  })

  it('ignores an admin-only stored section for a non-admin', async () => {
    getSession.mockResolvedValue({ user: { role: 'editor' } })
    cookieGet.mockReturnValue({ value: '/admin/users' })
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/sub-types', locale: 'en' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/app/[locale]/admin/__tests__/page.test.tsx`
Expected: FAIL — current `page.tsx` renders a grid and never calls `redirect`.

- [ ] **Step 3: Rewrite the page**

Replace the entire contents of `src/app/[locale]/admin/page.tsx` with:

```tsx
import { cookies } from 'next/headers'
import { setRequestLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { ADMIN_SECTION_COOKIE, resolveAdminSection } from '@/lib/admin-nav'

export const dynamic = 'force-dynamic'

export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  const isAdmin = hasRequiredRole(session?.user?.role, 'admin')
  const target = resolveAdminSection(cookieStore.get(ADMIN_SECTION_COOKIE)?.value, isAdmin)
  redirect({ href: target, locale })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/app/[locale]/admin/__tests__/page.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/app/[locale]/admin/page.tsx app/web/src/app/[locale]/admin/__tests__/page.test.tsx
git commit -m "feat(web): redirect /admin to last-visited section"
```

---

## Task 5: Admin layout gutter shell

**Files:**
- Modify: `src/app/[locale]/admin/layout.tsx`

**Interfaces:**
- Consumes: `AdminSidebar` (Task 3); existing `getSession`, `hasRequiredRole`.
- Produces: the rendered admin shell (no exported symbols).

- [ ] **Step 1: Rewrite the layout**

Replace the entire contents of `src/app/[locale]/admin/layout.tsx` with:

```tsx
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { AdminSidebar } from '@/components/admin-sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()
  const isAdmin = hasRequiredRole(session?.user?.role, 'admin')
  return (
    // Centered flex row: the sidebar sits in the gutter (outside the content's
    // max-w-[76rem]); below 1180px the sidebar collapses to a Sheet trigger and
    // the content uses the normal centered width.
    <div className="mx-auto flex w-full flex-col gap-4 px-6 py-10 min-[1180px]:w-fit min-[1180px]:flex-row min-[1180px]:gap-8">
      <AdminSidebar isAdmin={isAdmin} />
      <main className="w-full min-w-0 max-w-[76rem]">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w web`
Expected: PASS — no type errors (the layout imports `AdminSidebar`, passes `isAdmin: boolean`).

- [ ] **Step 3: Lint**

Run: `npm run lint -w web`
Expected: PASS — no lint errors.

- [ ] **Step 4: Run the full web test suite**

Run: `npm test -w web`
Expected: PASS — including `admin-nav`, `admin-sidebar`, and `admin/page` tests.

- [ ] **Step 5: Manual verification**

Run the dev server (`npm run dev -w web`) and, signed in as an editor/admin:
- Visit `/admin` → redirected to a section (sub-types on first visit).
- Sidebar sits to the left in the gutter; the content column keeps full width (compare to `/sets`).
- The active section is highlighted gold; clicking between sections updates the highlight.
- Navigate into `/admin/sets/new` → **Sets** stays highlighted.
- Leave admin (header logo) and return to `/admin` → lands on the last section you viewed.
- As a non-admin editor: Users/Settings are absent; a cookie pointing at `/admin/users` still lands on sub-types.
- Narrow the window below ~1180px → sidebar becomes a "Admin" drawer button; opening it and clicking a link navigates and closes the drawer.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/app/[locale]/admin/layout.tsx
git commit -m "feat(web): render admin sidebar shell with gutter layout"
```

---

## Self-review notes

- **Spec coverage:** sidebar + kept header (Task 5 + parent layout), lightweight custom nav (Task 3), role gating server-side (Tasks 4/5 compute `isAdmin`; Task 3 filters), active state incl. nested pages (Task 1 `activeSectionHref` + Task 3), cookie writer (Task 3), `/admin` resume redirect with validation (Tasks 1/4), link-card grid removed (Task 4 rewrite), i18n keys (Task 2), gutter layout (Task 5), mobile `Sheet` drawer (Task 3). "Back to site" link intentionally omitted per revised spec — header logo covers it.
- **Type consistency:** `AdminSectionId`, `ADMIN_SECTIONS`, `resolveAdminSection`, `activeSectionHref`, `visibleSections`, `ADMIN_SECTION_COOKIE` names are identical across Tasks 1/3/4. `AdminSidebar({ isAdmin })` signature matches its use in Task 5.
- **No placeholders:** every code step is complete.

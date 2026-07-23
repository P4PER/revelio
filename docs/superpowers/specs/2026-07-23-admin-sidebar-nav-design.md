# Admin sidebar navigation — design

**Date:** 2026-07-23
**Status:** Approved (design)
**Area:** `app/web` — admin console (`src/app/[locale]/admin/`)

## Problem

The admin area (`/admin`) is a landing grid of link-cards pointing at four sections
(Sub-types, Sets, Users, Settings). Once you drill into a section there is **no persistent
navigation between sections** — you bounce back to `/admin` each time — and the area offers
no scoped "you are in admin" affordance. The global `SiteHeader` (with the logo linking home)
*is* rendered on admin pages via the parent `[locale]/layout.tsx`, but it doesn't read as a
clear way back, and there's no way to jump laterally between admin sections.

## Goal

Give the admin area a persistent **left sidebar** for its sections, while keeping the global
site header on top so the route back to the main site is never removed. Remember the last
section visited so returning to `/admin` lands you where you left off.

Chosen approach: **Option 1 — sidebar with the site header kept** (evaluated against a full
admin shell and a top-tab bar; see "Alternatives"). It is the least disruptive, is idiomatic
to the shadcn stack, and solves the "can't get back" complaint by preserving the header users
already know.

## Scope

**In scope**
- New two-column admin shell: sidebar + content.
- New `AdminSidebar` client component (nav, active state, role gating, mobile drawer,
  last-section cookie writer).
- `/admin` becomes a server-side "resume last section" redirect; the link-card grid is removed.
- i18n keys for the nav labels.

**Out of scope**
- Any change to the individual section pages' contents (sub-types, sets, users, settings tables).
- Installing the full shadcn `Sidebar` primitive (see "Key decision" below).
- A dashboard/overview page with live counts (explicitly rejected in favour of the redirect).
- Collapsible/pinned sidebar state persistence beyond the mobile drawer.

## Key decisions

### Lightweight custom sidebar, not the shadcn `Sidebar` primitive
The shadcn `Sidebar` block (~700 lines: context provider, cookie-persisted collapse state,
tooltip dependency, rail, etc.) is not installed and is disproportionate to a 4-item nav.
`ui/sheet.tsx` **is** already present, which covers the mobile drawer. We build a small
custom component using existing tokens (`--sidebar*`, `--primary`) and `lucide-react` icons.

### Cookie, not localStorage, for "last section"
`/admin/page.tsx` is a server component. A cookie is readable server-side, so we can
`redirect()` before render — no flash. localStorage would force a client render then a
`useEffect` bounce, producing a visible flicker on every visit. Cookies are also the app's
existing mechanism for server-readable state.

### Role gating stays server-side
The layout (server) computes `isAdmin` and passes it as a prop to `AdminSidebar`. The client
never runs role logic. The layout's existing `editor` role gate (`hasRequiredRole(... , 'editor')`
→ `notFound()`) is unchanged and remains the real access boundary; the sidebar only decides
which links to *show*.

## Architecture

The parent `[locale]/layout.tsx` continues to supply `SiteHeader` / `SiteFooter`. The admin
layout renders inside it.

**Sidebar lives in the gutter, not inside the content width.** The admin content column keeps
the app's full `max-w-[76rem]`; the sidebar is a fixed-width (~200px) column placed *to the
left of* that content, so the overall shell is wider than 76rem and the content never loses
width to the nav. The shell is centered as a whole, so on wide screens the sidebar sits in the
left margin/gutter beside the full-width content:

```
┌ SiteHeader  (unchanged — logo → home, main nav) ─────────────────────────────┐
├──────────────┬───────────────────────────────────────────────────────────────┤
│              │                                                                │
│ AdminSidebar │   <main> {children} </main>        (full max-w-[76rem])        │
│  (~200px,    │                                                                │
│   sticky,    │   · Sub-types  · Sets  · Users*  · Settings*   * admin-only    │
│   gutter)    │                                                                │
└──────────────┴───────────────────────────────────────────────────────────────┘
   └── sidebar width + gap sits OUTSIDE the 76rem content column ──┘
```

The shell is a flex row: `[sidebar (fixed ~200px)] [gap] [content (max-w-[76rem])]`, with the
whole row centered (`w-fit mx-auto`) so the content column matches the width of every other
page and the sidebar consumes gutter space. When the viewport is too narrow to fit both
side-by-side (roughly below `76rem + sidebar + gap`), the desktop sidebar column is dropped
and nav moves entirely into the mobile `Sheet` drawer (see below) — the content then uses the
normal centered `max-w-[76rem]`. This avoids a squeezed content column at intermediate widths.

### Components & files

**`src/app/[locale]/admin/layout.tsx`** (modify — stays server component)
- Keep: `getSession()` + `hasRequiredRole(role, 'editor')` → `notFound()`.
- Compute `isAdmin = hasRequiredRole(role, 'admin')`.
- Replace the bare `<main>` with a centered flex row that places the sidebar in the gutter and
  keeps the content at full width:
  `<div className="mx-auto flex w-fit gap-8 px-6 py-10"> <AdminSidebar isAdmin={isAdmin} /> <main className="w-full max-w-[76rem] min-w-0">{children}</main> </div>`.
- The sidebar is a fixed ~200px sticky column; the content keeps `max-w-[76rem]`, so the row's
  total width exceeds 76rem and the sidebar occupies gutter space rather than shrinking content.
- Below the combined breakpoint the sidebar column is hidden (`hidden xl:flex` or similar) and
  the content falls back to the normal centered `max-w-[76rem]`; nav is reached via the mobile
  `Sheet` trigger. Pick the breakpoint so the sidebar only shows when `76rem + ~200px + gap`
  fits (Tailwind `xl` = 80rem is too small on its own, so use a `min-[…]` arbitrary breakpoint
  around `72rem`+sidebar, e.g. `min-[1180px]:flex`).

**`src/components/admin-sidebar.tsx`** (new — client component, `'use client'`)
- Props: `{ isAdmin: boolean }`.
- Nav model (array of `{ href, labelKey, icon }`):
  - `Sub-types` → `/admin/sub-types` (all editors)
  - `Sets` → `/admin/sets` (all editors)
  - `Users` → `/admin/users` (admin only)
  - `Settings` → `/admin/settings` (admin only)
  - Admin-only items are filtered out unless `isAdmin`.
- Active state: `usePathname()` from `@/../i18n/navigation`; an item is active when
  `pathname === href || pathname.startsWith(href + '/')`, so `/admin/sets/new` and
  `/admin/sets/[code]/edit` keep **Sets** highlighted.
- Links use `Link` from `@/../i18n/navigation` (locale-aware).
- Active styling: `bg` tint from `--primary` + gold `text-primary`, matching the artifact
  mockup and existing token usage.
- No dedicated "back to site" control: the global `SiteHeader` logo (always present above the
  shell) is the route back to the main site.
- **Last-section cookie writer:** a `useEffect` keyed on `pathname` writes
  `document.cookie = "revelio.admin.section=<pathname>; path=/; max-age=…; SameSite=Lax"`
  whenever the pathname is an admin *section* route. It stores the **locale-stripped section
  path** (e.g. `/admin/sets`) — the value written is one of the known section hrefs, derived by
  matching the active nav item, never a raw nested path — so the stored value is always a valid
  redirect target. Do not write for `/admin` itself.
- **Mobile:** below a breakpoint the sidebar column is hidden and instead rendered inside a
  `Sheet` (`ui/sheet.tsx`) drawer, opened by a trigger button placed at the top of the admin
  content on small screens. The nav list is shared between desktop and drawer.

**`src/app/[locale]/admin/page.tsx`** (rewrite — server component)
- Read `revelio.admin.section` from `cookies()`.
- Validate the value against the **role-appropriate** section list (recompute `isAdmin`;
  `users`/`settings` are only valid targets for admins). Invalid/absent/stale → default
  `/admin/sub-types`.
- `redirect(<locale-aware target>)`. Remove the entire link-card grid and its markup.
- Because a non-admin can't produce a valid admin-only target (validation rejects it) and the
  layout gate independently enforces access, the cookie cannot be used to escalate.

**i18n — `messages/en.json` & `messages/de.json`** (modify)
- Add under `admin`:
  - `nav.subTypes`, `nav.sets`, `nav.users`, `nav.settings` — short sidebar labels
    (reuse existing wording: "Sub-types", "Sets", "Users", "Settings").
- Existing `admin.title` / `admin.*.desc` keys stay (still used by section pages); the
  redundant grid copy is simply no longer rendered.

## Data flow

1. Editor visits `/admin` → server reads `revelio.admin.section` cookie → validates against
   role → `redirect()` to that section (or `/admin/sub-types` by default).
2. Section page renders inside the layout shell; `AdminSidebar` highlights the active item and
   writes the cookie for the current section.
3. Navigating between sections updates the highlight (client) and the cookie (client effect).
4. The header logo → `/` (the way back to the main site).

## Error handling & edge cases

- **Stale/forged cookie value** (e.g. `/admin/users` for a non-admin, or a garbage string):
  `/admin` validation rejects it and falls back to `/admin/sub-types`. The layout role gate is
  the real boundary regardless.
- **First visit / no cookie:** default to `/admin/sub-types`.
- **Deep sub-page** (`/admin/sets/new`): sidebar still highlights the parent via `startsWith`;
  cookie stores the parent section href, not the deep path, so resume returns to `/admin/sets`.
- **Locale:** all links and the redirect go through the i18n navigation helpers, so the
  as-needed locale prefix is handled automatically; the cookie stores the locale-stripped
  section path.
- **Reduced motion / focus:** nav links and the mobile trigger get visible keyboard focus
  states; the `Sheet` already handles focus trapping and `prefers-reduced-motion`.

## Testing

- **`admin-sidebar.test.tsx`** (new):
  - Renders all four items when `isAdmin`; hides Users & Settings when not.
  - Marks the correct item active for `/admin/sets` and for a nested `/admin/sets/new`.
  - Writes the `revelio.admin.section` cookie to the section href on the active pathname;
    does not write for `/admin`.
- **`/admin` redirect** — unit-test the cookie→target resolution helper (extract the
  validation/default logic into a pure function so it's testable without a request):
  valid section, admin-only section as non-admin (→ default), missing cookie (→ default),
  garbage value (→ default).
- Mock `usePathname` per the existing pattern in `search-box.test.tsx`.

## Alternatives considered

- **Full admin shell** (replace site header with a slim admin topbar + "Exit to Revelio"):
  more console-like but removes the familiar header and is more to build; the "back to main"
  affordance rests entirely on the Exit button being noticed. Rejected.
- **Top tabs, no sidebar:** lightest build, but doesn't scale past ~4 flat sections and leaves
  edit sub-pages without a nav anchor. Rejected.
- **shadcn `Sidebar` primitive:** disproportionate dependency weight for a 4-item nav
  (see "Key decisions"). Rejected in favour of a lightweight custom component.
- **localStorage for last section:** causes a redirect flash on a server route. Rejected in
  favour of a cookie.

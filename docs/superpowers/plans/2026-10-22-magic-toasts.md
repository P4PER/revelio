# Magic Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move toasts off the navbar search (top-left on desktop, top-centre on phones, both below the header) and give user-facing toasts the "Lumos star" brand style, leaving admin/editor toasts on Sonner's `richColors`.

**Architecture:** All changes sit in the one `Toaster` wrapper (`components/ui/sonner.tsx`) plus a CSS block in `globals.css`. The wrapper picks position from a shared phone media-query hook and turns `richColors` on for admin/editor routes; the brand CSS targets toasts whose `data-rich-colors` is not `true`, so admin toasts are untouched by construction.

**Tech Stack:** Next.js 16, React 19, sonner 2.0.8, next-intl navigation, Tailwind v4, lucide-react, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-magic-toasts-design.md`

## Global Constraints

- All commands run from `app/`. Branch: `feat/magic-toasts` (already created).
- Phone breakpoint is exactly `not all and (min-width: 48rem)` (the deck sheet's query).
- Desktop position `top-left`, phone position `top-center`, both with top offset `4rem`.
  (Execution note: superseded. Desktop went bottom-right, then top-left; both were rejected in
  use, and toasts now sit top-centre below the header on every viewport. With no viewport
  split left, Task 1's shared `useIsPhone` hook had no second consumer and was dropped.)
- Admin/editor paths: locale-stripped pathname starting with `/admin` (`/admin` itself and `/admin/...`), or matching `/card/<id>/edit`.
- Colours only from existing tokens: `--card`, `--card-foreground`, `--border`, `--primary`, `--primary-ink`, `--destructive`. No new hex values.
- Keyframe name `toast-twinkle` (`twinkle` is already taken in `globals.css`).
- Code comments ASCII-only. Commits: Conventional Commits, no tool attribution, sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- A toast fired on an admin page, then the user navigates to a non-admin page while it is visible: it switches to the brand look. Accepted; no test.
- Viewport crosses 48rem while a toast is showing (rotate a tablet): position flips live. The hook test in Task 1 pins that the hook follows `change` events.
- `/card/123/edit` vs `/card/123` vs `/cards/edit-guide`: only the first is editor. Pinned in Task 2's path test.
- Error toast in light theme: red bar and Sonner's error icon must stay distinguishable from gold success. Checked in Task 3's screenshot step.
- Reduced motion: the star must not animate. Checked in Task 3's screenshot step by emulating `reducedMotion: 'reduce'`.

---

### Task 1: Extract the shared phone-viewport hook

**Files:**
- Create: `app/web/src/lib/use-is-phone.ts`
- Modify: `app/web/src/components/deck/deck-sheet.tsx` (remove `PHONE_QUERY`, `subscribeToViewport`, `useIsPhone`; import the hook)
- Test: `app/web/src/lib/__tests__/use-is-phone.test.ts`

**Interfaces:**
- Produces: `export function useIsPhone(): boolean` and `export const PHONE_QUERY = 'not all and (min-width: 48rem)'` from `@/lib/use-is-phone`. Server snapshot `false`.

- [ ] **Step 1: Write the failing test** `use-is-phone.test.ts`, stubbing `window.matchMedia` the way `components/deck/__tests__/deck-sheet.test.tsx` does, with a controllable `matches` and captured `change` listener:
  - `it('reports a phone when the query matches')` - `renderHook(useIsPhone)` -> `true`; asserts `matchMedia` was called with `PHONE_QUERY`.
  - `it('follows viewport changes')` - start `false`, flip `matches` and fire the listener inside `act`, expect `true`.
  - `it('removes its listener on unmount')`.
- [ ] **Step 2:** `npm test -w web -- src/lib/__tests__/use-is-phone.test.ts` -> FAIL (module not found).
- [ ] **Step 3:** Move the three declarations out of `deck-sheet.tsx` verbatim, with their comments (the `PHONE_QUERY` comment and the server-snapshot comment), into `use-is-phone.ts` (`'use client'` not needed; it is a hook module). Export `PHONE_QUERY` and `useIsPhone`. `deck-sheet.tsx` imports `useIsPhone` and drops `useSyncExternalStore` from its React import if now unused.
- [ ] **Step 4:** `npm test -w web -- src/lib/__tests__/use-is-phone.test.ts src/components/deck/__tests__/deck-sheet.test.tsx` -> PASS.
- [ ] **Step 5: Commit** `refactor(web): share the deck sheet's phone viewport hook`

### Task 2: Toaster position and admin routing

**Files:**
- Modify: `app/web/src/components/ui/sonner.tsx`
- Test: `app/web/src/components/ui/__tests__/sonner.test.tsx`

**Interfaces:**
- Consumes: `useIsPhone` from `@/lib/use-is-phone`; `usePathname` from `@/../i18n/navigation` (locale-stripped).
- Produces: unchanged `Toaster` signature. Renders Sonner with:
  - desktop: `position="bottom-right"`, no offset props
  - phone: `position="top-center"`, `offset={{ top: '4rem' }}`, `mobileOffset={{ top: '4rem' }}` (sonner swaps to `mobileOffset` below its own 600px breakpoint, so both are needed for 600-768px)
  - `richColors={isEditorPath(pathname)}` - always a boolean, so `data-rich-colors` is always `"true"` or `"false"` for the CSS in Task 3
  - `icons={{ success: <Sparkle className="toast-star" fill="currentColor" /> }}` (lucide `Sparkle`, `size-4`)
- `isEditorPath(pathname: string): boolean` stays module-private, declared above the component.

- [ ] **Step 1: Write the failing tests.** `vi.mock('sonner', ...)` with a `Toaster` that records its props; mock `@/../i18n/navigation`'s `usePathname` and `@/lib/use-is-phone`'s `useIsPhone`.
  - `it('sits bottom-right on desktop')` - `position === 'bottom-right'`, `offset` undefined.
  - `it('drops below the header at the top on a phone')` - `position === 'top-center'`, `offset` and `mobileOffset` both `{ top: '4rem' }`.
  - `it.each(['/admin', '/admin/users', '/card/123/edit'])('keeps rich colours on %s')` -> `richColors === true`.
  - `it.each(['/', '/decks', '/card/123', '/settings', '/administrator'])('uses the brand style on %s')` -> `richColors === false`.
  - `it('lets a caller prop still win')` - `<Toaster theme="dark" position="top-left" />` -> `position === 'top-left'` (existing `{...props}` spread stays last).
- [ ] **Step 2:** `npm test -w web -- src/components/ui/__tests__/sonner.test.tsx` -> FAIL.
- [ ] **Step 3:** Implement in `sonner.tsx`. Extend the existing header comment with one paragraph: why position depends on the viewport (desktop top-centre covered the search; phone bottom covers the deck sheet handle), and why richColors follows the route (admin toasts keep the stock look; the brand CSS keys on `data-rich-colors`).
- [ ] **Step 4:** Re-run the test -> PASS. Then `npm test -w web` -> all green (note the count).
- [ ] **Step 5: Commit** `feat(web): move toasts off the header search`

### Task 3: Lumos star style

**Files:**
- Modify: `app/web/src/app/globals.css` (new block next to the other component keyframes, around the existing `@keyframes twinkle`)

**Interfaces:**
- Consumes: `data-rich-colors`, `data-type`, `data-styled` attributes Sonner puts on `[data-sonner-toast]`; the `.toast-star` class from Task 2.

- [ ] **Step 1: Write the CSS.** Selector root: `[data-sonner-toast][data-styled='true']:not([data-rich-colors='true'])` (specific enough to beat sonner's injected `[data-sonner-toast][data-styled=true]` rules).
  - Surface: `background: var(--card); color: var(--card-foreground); border: 1px solid var(--border);` and a soft drop shadow.
  - Bar via a custom property `--toast-accent` (default `var(--primary)`, `[data-type='error']` -> `var(--destructive)`): `box-shadow: inset 3px 0 0 var(--toast-accent), inset 10px 0 12px -10px var(--toast-accent), <drop shadow>`. Use box-shadow, not `::before`/`::after`: sonner already uses both pseudo-elements on the toast for its swipe and gap areas.
  - Bump left padding by 3px so text clears the bar.
  - `.toast-star`: `color: var(--primary-ink); filter: drop-shadow(0 0 6px color-mix(in oklab, var(--primary) 85%, transparent));`
  - `@keyframes toast-twinkle` from `scale(.2) rotate(-40deg); opacity: 0` via `scale(1.35) rotate(10deg)` at 60% to `none`; applied to `.toast-star` under the same `:not([data-rich-colors='true'])` root, `0.7s 0.1s ease-out both`, inside `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 2: Visual check with Playwright** (repo chromium; see memory "Visual checks use Playwright"). Against the dev server, on a page that fires toasts (Settings > Appearance save gives a success; the same save after `context.setOffline(true)` gives an error). Screenshot at DPR 1:
  - 1280x800 dark and light: success and error bottom-right, clear of the search; gold bar vs red bar distinguishable; star glows.
  - 390x844: toast top-centre, fully below the header (if the header measures taller than ~3.5rem, raise the `4rem` in Task 2 and its test); on `/decks/<id>/edit`, nothing covers the sheet handle.
  - `/admin` success toast: still Sonner's green rich look, now bottom-right.
  - `reducedMotion: 'reduce'`: star renders static.
- [ ] **Step 3:** `npm run lint`, `npm run typecheck`, `npm test -w web` -> clean/green.
- [ ] **Step 4: Commit** `feat(web): give user toasts the lumos star style`

### Task 4: PR

- [ ] **Step 1:** Commit spec + plan if not already (`docs(plans): plan magic toasts`), push, open PR titled `feat(web): move toasts off the search and give them the brand style`, body per CLAUDE.md (prose lead, `## What changed`, `## Verification` with real counts, link the spec and plan, screenshots). No `## Deployment` needed: no env, migration or ingest.

### Task 5 (follow-up after review): toast descriptions and review fixes

The mockup's toasts carried a second line; the shipped ones only had a title. A description goes only where it adds what the title cannot:

- Deck save / rename / visibility / duplicate / delete successes name the deck (`savedDetail`, `renamedDetail`, `visibilityPublicDetail` / `visibilityPrivateDetail`, `duplicatedDetail`, `deletedDetail`); import says how many cards came in (`import.successDetail`, ICU plural).
- Errors that block the user say what to do next, chosen by the action's error: `auth` gets `signInHint` (deck save: `saveErrorDetail`, keep the tab and sign in in a new one), anything else `reloadHint`; a non-auth deck save failure gets no second line, since a reload would lose the deck. An import that resolved no cards gets no toast.
- Copy-link, appearance, like and settings toasts stay title-only (their titles already carry the whole message).
- Style: brand toasts' title semibold, description `--muted-foreground` at 13px. Admin toasts keep sonner's.
- Review fixes folded in: light theme gets a lighter drop shadow; `icons` hoisted to module scope; stale comments in `use-is-phone.ts` and `sonner.tsx` corrected, plus a note that the 4rem offset assumes the page is scrolled to the top.
- Tests: the existing component tests that assert these toast calls are updated first to expect the description, watched fail, then made to pass. Visual check of both themes with Playwright.
- Deletions (deck in list and overview, account) go through `toastRemoved` in `components/ui/sonner.tsx`: a plain toast tagged `toast-removed`, quiet neutral style, trash icon, no Undo yet (no restore on the server). Brand error toasts colour their icon `--destructive`.

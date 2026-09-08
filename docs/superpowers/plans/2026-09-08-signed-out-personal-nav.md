# Signed-Out Personal Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the two personal destinations — Collection (`/collection`) and My Decks (`/decks/mine`) — in every navigation surface whether or not the visitor is signed in, so the signed-out teasers those pages already render are reachable from the app itself.

**Architecture:** No new components, no new routes, no new strings. Four surfaces currently hide the two links behind a session check; this removes all four checks and the now-dead `isLoggedIn` / `requiresAuth` plumbing that fed them. The pages themselves are untouched — `SignedOutTeaser` over a skeleton ghost with a `loginHref(here)` CTA is already the signed-out experience for both, and it already carries the deep link back after sign-in.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4 + shadcn, Vitest + Testing Library.

**Spec:** No standalone spec — this plan is the record of the decision. The signed-out screens it exposes were built by `docs/superpowers/plans/2026-08-14-logged-out-teasers.md`, which specified the teasers but never revisited nav visibility. Background and rationale below.

## Background

`app/web/src/app/[locale]/collection/page.tsx` and `app/web/src/app/[locale]/decks/mine/page.tsx` both branch on `getSession()` and render a `SignedOutTeaser` when there is no user: the real page heading, then a pitch card over a blurred, non-animated ghost of the real layout, with a sign-in CTA that round-trips back to the current URL and a secondary CTA onward to `/sets` or `/decks/new`.

Every navigation surface hides the links to those pages when signed out. The result: the teasers only fire on a bookmark, a shared URL, or a hand-typed path — never on a click inside the app.

**Decision: ungate both destinations everywhere.**

- The teaser was built for this moment. Gating the nav means the only path that reaches it is the path where the visitor already knew where they were going.
- Collection tracking and saved decks are the reason to sign up. Hiding them hides the pitch.
- The nav should not change shape on sign-in. A visitor who signs in should not discover two items they never knew existed.
- It is already half-done: Deck Builder (`/decks/new`) is visible signed out and works for guests, the collection teaser's own secondary CTA points at `/decks/new`, and public collection pages (`/collection/[username]`) are visible to anyone.

## Global Constraints

- **Labels stay plain — no lock icon, no "(sign in)" suffix.** A lock promises a wall; there is no wall, there is a teaser. Reuse the existing labels exactly.
- **No new i18n strings.** `nav.collection`, `nav.myDecks`, `footer.collection`, `footer.myDecks` all exist in both `messages/en.json` and `messages/de.json`. Verified — do not add keys.
- **No route or page changes.** `collection/page.tsx` and `decks/mine/page.tsx` are out of scope, including their `robots: { index: false }` (correct as-is: the pages become linked from every page's footer, and noindex is what keeps them out of search results).
- **Comments are ASCII-only** — no em-dashes, no unicode arrows.
- **Locale-aware navigation only:** `Link` from `@/../i18n/navigation`, never bare `next/link`. Hrefs are locale-FREE (`/collection`, not `/de/collection`).
- **Out of scope, do not fix:** the header uses the `Library` icon for Collection while the mobile drawer uses `LibraryBig`. Pre-existing inconsistency, unrelated to this change.
- **Commands run from `app/`.** The toolchain is not on the default shell PATH: prefix npm with `/usr/local/bin` (`/usr/local/bin/npm test -w web -- <path>`). Never run the full `npm test` from `app/` — `@revelio/ingest`'s test suite wipes the dev Meilisearch indexes. Web-only runs are safe.

## File Structure

| File | Change |
|---|---|
| `app/web/src/components/layout/nav-links.ts` | Drop `requiresAuth` from the `DeckLink` type and from the `/decks/mine` entry; update the comment. |
| `app/web/src/components/layout/decks-menu.tsx` | Drop the `isLoggedIn` prop and the filter; render all of `DECK_LINKS`. |
| `app/web/src/components/layout/mobile-nav.tsx` | Drop the `isLoggedIn` local, the `DECK_LINKS` filter, and the conditional around the Collection row. |
| `app/web/src/components/layout/site-header.tsx` | Render `<DecksMenu />` with no prop; unwrap the Collection button from its `session?.user` check. |
| `app/web/src/components/layout/site-footer.tsx` | Drop the `isLoggedIn` prop from `SiteFooterView`, unwrap both Build links, and drop the now-unused `getSession()` call and import from `SiteFooter`. |
| `app/web/src/components/layout/__tests__/decks-menu.test.tsx` | Collapse the three signed-in/out cases into one "every destination, always" case. |
| `app/web/src/components/layout/__tests__/mobile-nav.test.tsx` | Assert the personal rows are present when signed out. |
| `app/web/src/components/layout/__tests__/site-footer.test.tsx` | Drop the `isLoggedIn` render arg and the "hides personal Build links" case. |

Two tasks. Task 1 is the header/drawer/dropdown cluster, which shares `DECK_LINKS`. Task 2 is the footer, which additionally sheds its session dependency. A reviewer could reasonably accept one and question the other, so they commit separately.

---

### Task 1: Ungate the header, drawer, and decks dropdown

**Files:**
- Modify: `app/web/src/components/layout/nav-links.ts`
- Modify: `app/web/src/components/layout/decks-menu.tsx`
- Modify: `app/web/src/components/layout/mobile-nav.tsx:49,68,74`
- Modify: `app/web/src/components/layout/site-header.tsx:44,47-51`
- Test: `app/web/src/components/layout/__tests__/decks-menu.test.tsx`
- Test: `app/web/src/components/layout/__tests__/mobile-nav.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DeckLink` loses its optional `requiresAuth?: boolean` field, becoming `{ href: string; labelKey: 'browse' | 'deckBuilder' | 'myDecks'; Icon: LucideIcon }`. `DecksMenu` becomes a zero-prop component: `function DecksMenu(): JSX.Element`. `MobileNav`'s signature is unchanged (`{ isEditor: boolean; user: AccountUser | null }`) — only its body changes.

- [ ] **Step 1: Rewrite the DecksMenu test to expect every link, always**

Replace the whole `renderMenu` helper and `describe` block in `app/web/src/components/layout/__tests__/decks-menu.test.tsx` (keep the imports and the `vi.mock` above them exactly as they are):

```tsx
function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DecksMenu />
    </NextIntlClientProvider>,
  )
}

describe('DecksMenu', () => {
  it('links to every deck destination, signed in or out', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /Decks/ }))
    expect((await screen.findByText('Discover decks')).closest('a')).toHaveAttribute('href', '/decks')
    expect(screen.getByText('Deck Builder').closest('a')).toHaveAttribute('href', '/decks/new')
    // My Decks shows to every visitor. Signed out, /decks/mine renders its own
    // teaser, so the link is a pitch for signing up rather than a dead end.
    expect(screen.getByText('My Decks').closest('a')).toHaveAttribute('href', '/decks/mine')
  })
})
```

- [ ] **Step 2: Rewrite the MobileNav case that asserts the personal rows are absent**

In `app/web/src/components/layout/__tests__/mobile-nav.test.tsx`, replace the second `it(...)` block - `'shows a sign-in link and hides account-only items when signed out'` - leaving the first case and the two signed-in cases below it untouched:

```tsx
  it('keeps the personal destinations and offers sign-in when signed out', async () => {
    await openMenu(false, null)
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    // Both land on their own signed-out teaser, so they stay in the drawer.
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection')
    expect(screen.getByRole('link', { name: 'My Decks' })).toHaveAttribute('href', '/decks/mine')
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })
```

- [ ] **Step 3: Run both test files to verify they fail**

Run from `app/`:

```bash
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/decks-menu.test.tsx src/components/layout/__tests__/mobile-nav.test.tsx
```

Expected: FAIL. `DecksMenu` renders with `isLoggedIn` undefined so "My Decks" is filtered out (`Unable to find an element with the text: My Decks`), and the drawer's signed-out case cannot find the `Collection` or `My Decks` links.

- [ ] **Step 4: Drop `requiresAuth` from the shared link list**

Replace the contents of `app/web/src/components/layout/nav-links.ts`:

```ts
import { Compass, Wand2, Library, type LucideIcon } from 'lucide-react'

// Deck destinations shared by DecksMenu (desktop dropdown) and MobileNav
// (drawer), so both stay in sync when a route or label changes. `labelKey` is a
// key in the `nav` message namespace. Every link shows to every visitor: signed
// out, /decks/mine renders its own teaser rather than a dead end. Each consumer
// applies its own icon sizing.
export type DeckLink = {
  href: string
  labelKey: 'browse' | 'deckBuilder' | 'myDecks'
  Icon: LucideIcon
}

export const DECK_LINKS: readonly DeckLink[] = [
  { href: '/decks', labelKey: 'browse', Icon: Compass },
  { href: '/decks/new', labelKey: 'deckBuilder', Icon: Wand2 },
  { href: '/decks/mine', labelKey: 'myDecks', Icon: Library },
]
```

- [ ] **Step 5: Drop the prop and the filter from DecksMenu**

In `app/web/src/components/layout/decks-menu.tsx`, replace the doc comment, the signature, and the map:

```tsx
// Groups every deck-related destination under one "Decks" menu: discovering
// public decks, building a new one, and the user's own decks. My Decks shows
// signed out too, where /decks/mine answers with its own teaser.
export function DecksMenu() {
```

and inside `DropdownMenuContent`:

```tsx
        {DECK_LINKS.map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <Link href={l.href}><l.Icon />{t(l.labelKey)}</Link>
          </DropdownMenuItem>
        ))}
```

- [ ] **Step 6: Drop the filter and the Collection conditional from MobileNav**

In `app/web/src/components/layout/mobile-nav.tsx`, delete the `const isLoggedIn = !!user` line (line 49 — nothing else reads it; the account block below branches on `user` directly), then replace the deck-link map and the Collection row inside `<nav>`:

```tsx
          {DECK_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={rowClass}>
              <l.Icon className="size-4 opacity-70" />
              {t(l.labelKey)}
            </Link>
          ))}
          <Link href="/collection" onClick={close} className={rowClass}>
            <LibraryBig className="size-4 opacity-70" />
            {t('collection')}
          </Link>
```

- [ ] **Step 7: Drop the prop and the conditional from the header**

In `app/web/src/components/layout/site-header.tsx`, replace lines 44-51 (the `DecksMenu` call and the gated Collection button) with:

```tsx
          <DecksMenu />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/collection"><Library className="size-4 opacity-70" />{t('collection')}</Link>
          </Button>
```

Leave the rest of the component alone: `session` is still needed for `isEditor` and `accountUser`.

- [ ] **Step 8: Run both test files to verify they pass**

Run from `app/`:

```bash
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/decks-menu.test.tsx src/components/layout/__tests__/mobile-nav.test.tsx
```

Expected: PASS, all cases in both files.

- [ ] **Step 9: Commit**

```bash
git add app/web/src/components/layout/nav-links.ts \
        app/web/src/components/layout/decks-menu.tsx \
        app/web/src/components/layout/mobile-nav.tsx \
        app/web/src/components/layout/site-header.tsx \
        app/web/src/components/layout/__tests__/decks-menu.test.tsx \
        app/web/src/components/layout/__tests__/mobile-nav.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): show Collection and My Decks in the nav when signed out"
```

---

### Task 2: Ungate the footer and drop its session dependency

**Files:**
- Modify: `app/web/src/components/layout/site-footer.tsx:10,50-53,58-66,88-89`
- Test: `app/web/src/components/layout/__tests__/site-footer.test.tsx:14-20,55-61,74,79`

**Interfaces:**
- Consumes: nothing from Task 1 — the footer does not use `DECK_LINKS`.
- Produces: `SiteFooterView` becomes `function SiteFooterView({ githubUrl }: { githubUrl: string | null }): JSX.Element`. `SiteFooter` stays `async` (it still awaits `getCachedSiteSettings()`) and its signature is unchanged; only its body sheds `getSession()`.

- [ ] **Step 1: Update the footer tests to the new signature and expectations**

In `app/web/src/components/layout/__tests__/site-footer.test.tsx`:

Replace the `renderFooter` helper:

```tsx
function renderFooter(githubUrl: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteFooterView githubUrl={githubUrl} />
    </NextIntlClientProvider>,
  )
}
```

Delete the whole `it('hides personal Build links when logged out but keeps the deck builder', ...)` case — the footer no longer knows whether anyone is signed in, and the columns case below now covers every visitor.

In `it('renders the three navigation columns with internal links', ...)`, add a comment above the Build assertions so the intent survives:

```tsx
    // The Build column is the same for every visitor: My Decks and Collection
    // both answer signed out with their own teaser.
    const build = screen.getByRole('navigation', { name: 'Build' })
```

Fix the two GitHub cases, which passed `isLoggedIn` as the first argument:

```tsx
  it('hides the GitHub link when githubUrl is unset', () => {
    renderFooter(null)
    expect(screen.queryByRole('link', { name: /GitHub/ })).not.toBeInTheDocument()
  })

  it('renders an external GitHub link when githubUrl is set', () => {
    renderFooter('https://github.com/P4PER/revelio')
    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
```

- [ ] **Step 2: Run the footer tests to verify they fail**

Run from `app/`:

```bash
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx
```

Expected: FAIL on the columns case — `isLoggedIn` arrives undefined, so `My Decks` and `Collection` are not rendered (`Unable to find an accessible element with the role "link" and name "My Decks"`).

- [ ] **Step 3: Drop the session from the footer**

In `app/web/src/components/layout/site-footer.tsx`, delete the `import { getSession } from '@/lib/server/session'` line, then replace the wrapper and the view's signature:

```tsx
/** Async server wrapper: resolves site settings, then renders the presentational view. */
export async function SiteFooter() {
  const settings = await getCachedSiteSettings()
  return <SiteFooterView githubUrl={settings?.githubUrl ?? null} />
}

/**
 * Presentational footer. Kept sync + prop-driven so it renders in both server and
 * test trees. Every column is the same for every visitor: the personal Build
 * links (My Decks, Collection) answer signed out with their own teaser, so the
 * footer needs no session at all.
 */
export function SiteFooterView({
  githubUrl,
}: {
  githubUrl: string | null
}) {
```

- [ ] **Step 4: Unwrap the two personal Build links**

Replace the Build column body:

```tsx
          <FooterColumn label={t('build')}>
            <FooterLink href="/decks/new">{t('deckBuilder')}</FooterLink>
            <FooterLink href="/decks/mine">{t('myDecks')}</FooterLink>
            <FooterLink href="/collection">{t('collection')}</FooterLink>
          </FooterColumn>
```

- [ ] **Step 5: Run the footer tests to verify they pass**

Run from `app/`:

```bash
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx
```

Expected: PASS, all cases.

- [ ] **Step 6: Verify the whole web workspace, types, and lint**

Run from `app/`:

```bash
/usr/local/bin/npm test -w web
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint -w web
```

Expected: all three exit 0. Typecheck is the one that catches a stale `isLoggedIn={...}` left at a call site — web test files are not typechecked, so only the non-test sources are covered here.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/layout/site-footer.tsx \
        app/web/src/components/layout/__tests__/site-footer.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): link Collection and My Decks from the footer for every visitor"
```

---

## Verification

After both tasks, from `app/`:

```bash
/usr/local/bin/npm test -w web        # full web suite
/usr/local/bin/npm run typecheck      # all workspaces
/usr/local/bin/npm run lint -w web
```

Then a manual pass, signed out, at both viewports:

1. Desktop (>=1024px): the header shows Sets, Decks, Collection, Random. Open the Decks dropdown: Discover decks, Deck Builder, My Decks.
2. Below 1024px: the drawer lists Sets, Discover decks, Deck Builder, My Decks, Collection, Random, then Language, then Sign in.
3. Footer Build column: Deck Builder, My Decks, Collection.
4. Click Collection: the page shows the "Collection" heading, the teaser card over the blurred ghost, and a sign-in button. Sign in from it and confirm you land back on `/collection`.
5. Click My Decks: same shape, with the "Try the deck builder" secondary CTA.

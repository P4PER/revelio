# Deck View Header Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text header on the deck view (`/decks/[id]`) with a Moxfield-style hero banner: the deck's starting-character art fills the banner, with the deck name, metadata, owner `@username`, and visibility badge overlaid on a dark scrim.

**Architecture:** A new client component `deck-header.tsx` renders the banner and is dropped in at the top of `deck-overview.tsx`; the actions row, view switcher, stats panel, legality bar, and card list below stay unchanged. Starter art + lessons are derived from the existing `views` array (no schema change); the one new piece of data — the owner's `@username` — is added to the `getDeck` query and threaded through the page.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, Drizzle ORM, Vitest + Testing Library.

## Global Constraints

- All app commands run from `app/`. Toolchain is not on PATH — prefix with `/usr/local/bin/npm` (node/npm) and `/opt/homebrew/bin/gpg` for signed commits (`git -c gpg.program=/opt/homebrew/bin/gpg commit`).
- No schema/migration changes in this plan.
- All user-facing strings come from `messages/en.json` + `messages/de.json` — never hardcode.
- Conventional Commits. Work on branch `feat/deck-header-banner` (already created).
- No Claude/Claude Code attribution in commits.
- `strict` dependency direction: `web` may import from `@revelio/core`/`db`; `db` must not import from `web`.

---

### Task 1: `DeckLikeButton` — optional `className` escape hatch

The banner needs the like button to read light-on-scrim. Add an optional `className` merged via the existing `cn(...)` (tailwind-merge), so the default rendering is unchanged and callers can override the colour.

**Files:**
- Modify: `app/web/src/components/deck-like-button.tsx`

**Interfaces:**
- Produces: `DeckLikeButton` now accepts an optional `className?: string` prop, merged onto the root `<button>`.

- [ ] **Step 1: Add the prop and merge it**

In `deck-like-button.tsx`, add `className` to the destructured props and the prop type, then merge it on the button. The component already imports `cn` from `@/lib/utils`.

Change the props block:

```tsx
export function DeckLikeButton({
  deckId,
  initialLiked,
  initialCount,
  loggedIn,
  className,
}: {
  deckId: string
  initialLiked: boolean
  initialCount: number
  loggedIn: boolean
  className?: string
}) {
```

Change the button's `className` from the string literal to:

```tsx
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60',
        className,
      )}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && /usr/local/bin/npm run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add app/web/src/components/deck-like-button.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): allow DeckLikeButton className override"
```

---

### Task 2: `getDeck` returns the owner's `@username`

Add the owner handle to the deck read so the banner can show and link it. `getDeck` already imports the `user` table (`db/src/queries.ts:5`). This layer has no unit-test harness (Postgres tests use Testcontainers/Docker, none cover `getDeck`), so this task is verified by `typecheck` — the behaviour is exercised by the component tests in later tasks.

**Files:**
- Modify: `app/db/src/queries.ts` (`getDeck` ~L516-543, `getDeckForViewer` ~L549-557)

**Interfaces:**
- Produces: `getDeck` and `getDeckForViewer` return objects now include `ownerUsername: string | null` (the `displayUsername ?? username` handle, matching the account dropdown).

- [ ] **Step 1: Extend `getDeck`**

Update the `getDeck` return-type annotation to include `ownerUsername`:

```ts
export async function getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[]; viewCount: number; ownerUsername: string | null } | null> {
```

Just before the `return` at the end of `getDeck`, fetch the owner handle:

```ts
  const [owner] = await db
    .select({ username: user.username, displayUsername: user.displayUsername })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1)
  const ownerUsername = owner?.displayUsername ?? owner?.username ?? null
```

Change the return statement to:

```ts
  return { deck, userId: row.userId, views, viewCount: row.viewCount, ownerUsername }
```

- [ ] **Step 2: Extend `getDeckForViewer`**

Update only its return-type annotation to match (its body already `return res`, which now carries `ownerUsername`):

```ts
export async function getDeckForViewer(
  db: DB, id: string, viewerId: string | null,
): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[]; viewCount: number; ownerUsername: string | null } | null> {
```

- [ ] **Step 3: Typecheck**

Run: `cd app && /usr/local/bin/npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): return owner username from getDeck"
```

---

### Task 3: `DeckHeader` banner component (TDD)

The banner itself, plus its i18n key. Written test-first.

**Files:**
- Create: `app/web/src/components/deck-header.tsx`
- Create: `app/web/src/components/__tests__/deck-header.test.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Consumes: `DeckArt` (`{ cardId, version, lessons, imageBase, alt, className }`), `DeckLikeButton` (now with `className`, Task 1), `LessonIcons` (`{ codes, size, max }`), `Badge`, `Link` from `@/../i18n/navigation`.
- Produces:
  ```ts
  export type DeckHeaderProps = {
    deckId: string
    name: string
    format: DeckFormat
    updatedAt: string
    visibility: 'private' | 'public'
    viewCount: number
    likeCount: number
    liked: boolean
    loggedIn: boolean
    imageBase: string
    ownerUsername: string | null
    starterCardId: string | null
    starterArtCropVersion: number | null
    lessons: string[]
  }
  export function DeckHeader(props: DeckHeaderProps): JSX.Element
  ```

- [ ] **Step 1: Add the i18n key**

In `app/web/messages/en.json`, under `decks.overview` (add after the `views` key):

```json
    "viewAuthorDecks": "View decks by @{username}",
```

In `app/web/messages/de.json`, under `decks.overview` (same spot):

```json
    "viewAuthorDecks": "Decks von @{username} ansehen",
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/__tests__/deck-header.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { DeckHeader } from '@/components/deck-header'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
// Isolate the header: the like button has its own action/router deps.
vi.mock('@/components/deck-like-button', () => ({ DeckLikeButton: () => <div data-testid="like" /> }))

const base = {
  deckId: 'd1',
  name: 'My Deck',
  format: 'revival' as const,
  updatedAt: '2026-07-01T00:00:00.000Z',
  visibility: 'public' as const,
  viewCount: 12,
  likeCount: 3,
  liked: false,
  loggedIn: true,
  imageBase: 'https://img.example',
  ownerUsername: 'ron',
  starterCardId: 'harry',
  starterArtCropVersion: 1,
  lessons: ['charms'],
}

describe('DeckHeader', () => {
  it('renders the deck name and links the owner handle to filtered deck search', () => {
    renderWithIntl(<DeckHeader {...base} />)
    expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /ron/i })
    expect(link).toHaveAttribute('href', '/decks?q=@ron')
  })

  it('omits the owner element when there is no username', () => {
    renderWithIntl(<DeckHeader {...base} ownerUsername={null} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the lesson-gradient fallback when there is no starter art', () => {
    const { container } = renderWithIntl(
      <DeckHeader {...base} starterCardId={null} starterArtCropVersion={null} />,
    )
    expect(container.querySelector('[data-slot="deck-art-fallback"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/deck-header.test.tsx`
Expected: FAIL — cannot resolve `@/components/deck-header`.

- [ ] **Step 4: Implement `DeckHeader`**

Create `app/web/src/components/deck-header.tsx`:

```tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Eye } from 'lucide-react'
import type { DeckFormat } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { DeckLikeButton } from '@/components/deck-like-button'
import { Badge } from '@/components/ui/badge'

export type DeckHeaderProps = {
  deckId: string
  name: string
  format: DeckFormat
  updatedAt: string
  visibility: 'private' | 'public'
  viewCount: number
  likeCount: number
  liked: boolean
  loggedIn: boolean
  imageBase: string
  ownerUsername: string | null
  starterCardId: string | null
  starterArtCropVersion: number | null
  lessons: string[]
}

const SHADOW = { textShadow: '0 1px 3px rgba(0,0,0,0.9)' } as const

export function DeckHeader(props: DeckHeaderProps) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(props.updatedAt))

  return (
    <div className="relative flex min-h-[230px] overflow-hidden rounded-xl border border-border">
      {/* Starter-character art fills the banner; DeckArt falls back to a
          lesson-colour gradient (then bg-muted) when there's no starter. */}
      <div className="absolute inset-0">
        <DeckArt
          cardId={props.starterCardId}
          version={props.starterArtCropVersion}
          lessons={props.lessons}
          imageBase={props.imageBase}
          alt={props.name}
          className="h-full w-full"
        />
      </div>
      {/* Scrims keep overlaid text legible over any art. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <div className="relative z-10 flex w-full flex-col justify-between gap-6 p-5">
        <div className="flex items-start justify-between gap-3">
          {props.ownerUsername ? (
            <Link
              href={`/decks?q=@${props.ownerUsername}`}
              aria-label={t('overview.viewAuthorDecks', { username: props.ownerUsername })}
              className="truncate text-sm font-semibold text-white/90 transition-colors hover:text-white"
              style={SHADOW}
            >
              <span className="relative bottom-px text-primary">@</span>
              {props.ownerUsername}
            </Link>
          ) : (
            <span />
          )}
          <Badge variant={props.visibility === 'public' ? 'default' : 'secondary'}>
            {t(`list.visibility.${props.visibility}`)}
          </Badge>
        </div>

        <div style={SHADOW}>
          <h1 className="text-3xl font-bold text-balance text-white sm:text-4xl">{props.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-white/90">
            <span>
              {t(`format.${props.format}`)} · {t('overview.updatedAt', { date: updated })}
            </span>
            <span
              className="inline-flex items-center gap-1"
              aria-label={t('overview.views', { count: props.viewCount })}
            >
              <Eye className="size-5" />
              {props.viewCount}
            </span>
            <DeckLikeButton
              deckId={props.deckId}
              initialLiked={props.liked}
              initialCount={props.likeCount}
              loggedIn={props.loggedIn}
              className="text-white/90 hover:text-white"
            />
            {props.lessons.length > 0 && (
              <span className="ml-auto">
                <LessonIcons codes={props.lessons} size={20} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/deck-header.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/deck-header.tsx app/web/src/components/__tests__/deck-header.test.tsx app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add deck header banner component"
```

---

### Task 4: Wire `DeckHeader` into `DeckOverview` and the page

Replace the old header block with the banner, derive starter art + lessons from `views`, and thread `ownerUsername` from the page. Update the overview test.

**Files:**
- Modify: `app/web/src/components/deck-overview.tsx`
- Modify: `app/web/src/app/[locale]/decks/[id]/page.tsx`
- Modify: `app/web/src/components/__tests__/deck-overview.test.tsx`

**Interfaces:**
- Consumes: `DeckHeader` (Task 3), `getDeckForViewer().ownerUsername` (Task 2).
- Produces: `DeckOverviewProps` gains `ownerUsername: string | null`.

- [ ] **Step 1: Update the overview test first**

In `app/web/src/components/__tests__/deck-overview.test.tsx`, add a `DeckHeader` mock next to the other component mocks (after the `deck-gallery` mock at line 15):

```tsx
vi.mock('@/components/deck-header', () => ({
  DeckHeader: ({ name }: { name: string }) => <h1>{name}</h1>,
}))
```

Add `ownerUsername` to the shared `props` object (append to the last line of the object literal):

```tsx
  likeCount: 3, liked: false, viewCount: 12, ownerUsername: 'ron',
```

The existing assertions (`heading { name: 'My Deck' }`, `actions` testid, view switching) still hold — the heading now comes from the mocked `DeckHeader`.

- [ ] **Step 2: Run the overview test to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/deck-overview.test.tsx`
Expected: FAIL — `DeckOverview` still renders the old header's `<h1>My Deck</h1>` *and* the mocked `DeckHeader` is not yet used, but once Step 3 renders `DeckHeader` there would be two `My Deck` headings; running now surfaces either the unused-mock state or (after a partial edit) a "multiple elements with role heading" error. The gate that matters is Step 5 (green after the rework).

- [ ] **Step 3: Rework `DeckOverview`**

In `app/web/src/components/deck-overview.tsx`:

Replace the imports of `Eye`, `Badge`, and `DeckLikeButton` and the `useLocale` usage — they move into `DeckHeader`. Update the top imports so line 3-16 become:

```tsx
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutGrid, List } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { deckStats } from '@/lib/deck-stats'
import { DeckHeader } from '@/components/deck-header'
import { DeckPanel } from '@/components/deck-panel'
import { DeckGallery } from '@/components/deck-gallery'
import { DeckStatsPanel } from '@/components/deck-stats-panel'
import { DeckLegalityBar } from '@/components/deck-legality-bar'
import { DeckOverviewActions } from '@/components/deck-overview-actions'
import { recordViewAction } from '@/lib/deck-actions'
import { Button } from '@/components/ui/button'
import { DECK_VIEW_COOKIE, type DeckView as View } from '@/lib/deck-view'
```

(`DeckLikeButton`, `DeckLegalityBar`'s sibling imports otherwise unchanged; `Eye`, `Badge`, `useLocale`, and the `DeckLikeButton` import are removed because they're no longer used here.)

Add `ownerUsername` to `DeckOverviewProps`:

```tsx
  liked: boolean
  viewCount: number
  ownerUsername: string | null
```

In the component body, remove the `const locale = useLocale()` line and the `const updated = ...` line. After `const { status, mainCount } = deckStats(views, format)`, add the starter/lessons derivation:

```tsx
  const { status, mainCount } = deckStats(views, format)
  const starter = views.find((v) => v.zone === 'character')
  const lessons = [...new Set(views.map((v) => v.lesson).filter((l): l is string => Boolean(l)))]
```

Replace the entire old header block (the `<div className="flex flex-wrap items-start justify-between gap-3">…</div>` spanning lines 65-82) with:

```tsx
      <DeckHeader
        deckId={deckId}
        name={name}
        format={format}
        updatedAt={updatedAt}
        visibility={visibility}
        viewCount={props.viewCount}
        likeCount={props.likeCount}
        liked={props.liked}
        loggedIn={loggedIn}
        imageBase={imageBase}
        ownerUsername={props.ownerUsername}
        starterCardId={starter?.cardId ?? null}
        starterArtCropVersion={starter?.artCropVersion ?? null}
        lessons={lessons}
      />
```

Leave the actions row (`<div className="flex flex-wrap items-center justify-between gap-3">…`), the view switcher, and the stats/legality/list panel exactly as they are.

- [ ] **Step 4: Pass `ownerUsername` from the page**

In `app/web/src/app/[locale]/decks/[id]/page.tsx`, add the prop to the `<DeckOverview>` element (after `viewCount={existing.viewCount}`):

```tsx
        viewCount={existing.viewCount}
        ownerUsername={existing.ownerUsername}
```

- [ ] **Step 5: Run the overview test to verify it passes**

Run: `cd app && /usr/local/bin/npm test -w web -- src/components/__tests__/deck-overview.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/deck-overview.tsx app/web/src/app/[locale]/decks/[id]/page.tsx app/web/src/components/__tests__/deck-overview.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): use banner header on deck view"
```

---

### Task 5: Full verification

Confirm the whole change is green across the checks CI runs.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd app && /usr/local/bin/npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint the web workspace**

Run: `cd app && /usr/local/bin/npm run lint -w web`
Expected: PASS (no errors; the removed `Eye`/`Badge`/`DeckLikeButton`/`useLocale` imports must not linger as unused-import errors).

- [ ] **Step 3: Full web test suite**

Run: `cd app && /usr/local/bin/npm test -w web`
Expected: PASS (all files, including `deck-header` and `deck-overview`).

- [ ] **Step 4: Push and open a PR**

```bash
git push -u origin feat/deck-header-banner
/opt/homebrew/bin/gh pr create --fill --base main
```

---

## Self-Review

**Spec coverage:**
- Banner component (`deck-header.tsx`) → Task 3. ✓
- `DeckArt` background + scrims + overlay layout → Task 3. ✓
- Starter art + lessons derived from `views` → Task 4 Step 3. ✓
- Owner `@username` styled like the account dropdown, linked to `/decks?q=@username`, omitted when null → Task 3 (component + tests). ✓
- `ownerUsername` from `getDeck`/`getDeckForViewer` join → Task 2; threaded via page → Task 4. ✓
- `DeckLikeButton` `className` escape hatch → Task 1. ✓
- i18n `overview.viewAuthorDecks` in en + de → Task 3 Step 1. ✓
- Edge cases: no starter (fallback) → Task 3 test; no username (omitted) → Task 3 test; private badge → carried by `visibility` prop. ✓
- Tests: new `deck-header.test.tsx` + updated `deck-overview.test.tsx` → Tasks 3-4. ✓
- No schema/migration change → confirmed (Task 2 is query-only). ✓
- Out of scope (stats merge, avatars, avatar images) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code step has literal content. ✓

**Type consistency:** `ownerUsername: string | null` is identical across `getDeck`, `getDeckForViewer`, `DeckOverviewProps`, and `DeckHeaderProps`. `starterCardId`/`starterArtCropVersion` names match between `DeckHeaderProps` and the `views.find(...)` derivation. `DeckLikeButton`'s new `className?: string` matches its use in `DeckHeader`. ✓

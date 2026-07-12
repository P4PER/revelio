# Discover Decks — Hero Cards & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public deck list into "Discover decks" with Moxfield-style hero cards (cropped starting-character art), instant search, and a like button that lives on the deck overview (list counts become read-only).

**Architecture:** The browse query gains each deck's starting-character card id; a shared `DeckArt` client component crops that card image via pure CSS (`object-fit: cover` + `object-position`) with a lesson-gradient fallback. `DeckHeroCard` (Grid) and `DeckDiscoverRow` (List) compose `DeckArt` + `LessonIcons` + a relative-time footer. `DeckBrowse` gets a debounced instant search and height-aligned controls. The interactive `DeckLikeButton` moves to the overview page, fed by a new `getDeckLikeState` query.

**Tech Stack:** Next.js 16 App Router (React 19), next-intl, Drizzle ORM over Postgres, shadcn/Radix/Tailwind v4, Vitest (+ Testcontainers Postgres for DB tests).

## Global Constraints

- **All commands run from `app/`** (npm workspaces root). No root `package.json`.
- **DB query tests live in `app/ingest/test/*.test.ts`** using `withMigratedDb()` from `ingest/test/helpers.js`. The `db` workspace has no test runner. Run with `npm test -w @revelio/ingest -- <name>`.
- **next-intl:** use `Link`/`useRouter` from `@/../i18n/navigation`; attribute/label copy in **both** `web/messages/en.json` and `de.json`. `attrLabel(scope, code, locale)` reads the JSON catalog directly.
- **Lessons** (codes): `care_of_magical_creatures`, `charms`, `potions`, `transfiguration`, `quidditch`; colors in `LESSONS` (`@revelio/core`); SVGs at `web/public/lessons/<code>.svg`.
- **Images:** `imageKey(id)` → `cards/{id}.webp`; `imageUrl(base, key)`; base from `process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''`.
- **DeckZone** values: `character | main | sideboard`. **DeckFormat**: `classic | revival`.
- **Route is unchanged** (`/decks` stays); only visible labels change to "Discover decks".
- **Conventional Commits.** No new image assets / `sharp` changes / new S3 objects.
- No native HTML form controls where a shadcn `ui/*` primitive exists (use `Input`, `Select`, `Button`).

---

## File Structure

**Create:**
- `web/src/lib/relative-time.ts` — `formatRelativeTime(iso, locale, now?)`.
- `web/src/lib/__tests__/relative-time.test.ts`.
- `web/src/components/deck-art.tsx` — cropped starter-card image + lesson-gradient fallback.
- `web/src/components/__tests__/deck-art.test.tsx`.
- `web/src/components/deck-hero-card.tsx` — Grid tile (Design A).
- `web/src/components/__tests__/deck-hero-card.test.tsx`.
- `web/src/components/deck-discover-row.tsx` — List row.
- `web/src/components/__tests__/deck-discover-row.test.tsx`.

**Modify:**
- `db/src/queries.ts` — `starterCardId` on `PublicDeckEntry`; new `getDeckLikeState`.
- `db/src/index.ts` — export `getDeckLikeState` + type.
- `ingest/test/deck-browse.test.ts` — cover both.
- `web/src/components/deck-like-button.tsx` — use `decks.like.*` copy.
- `web/messages/en.json`, `web/messages/de.json` — rename + `decks.like.*`.
- `web/src/components/deck-browse.tsx` — instant search, control heights, hero/row components, read-only stats, `imageBase` prop.
- `web/src/app/[locale]/decks/page.tsx` — pass `imageBase`.
- `web/src/app/[locale]/decks/[id]/page.tsx` — fetch like state, pass down.
- `web/src/components/deck-overview.tsx` — thread like state to actions.
- `web/src/components/deck-overview-actions.tsx` — render `DeckLikeButton`.

---

## Task 1: `listPublicDecks` returns `starterCardId`

**Files:**
- Modify: `db/src/queries.ts` (`PublicDeckEntry`, `listPublicDecks`)
- Test: `ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces: `PublicDeckEntry.starterCardId: string | null` (the deck's `zone='character'` card id, or null).

- [ ] **Step 1: Write the failing test**

Append to `ingest/test/deck-browse.test.ts` inside the `listPublicDecks` describe (or as a new `it`):

```ts
it('returns the starting-character card id (null when the deck has none)', async () => {
  const withStarter = await createDeck(ctx.db, 'u1', {
    name: 'Has Starter', format: 'revival', visibility: 'public',
    cards: [
      { cardId: 'c-charms', zone: 'character', quantity: 1 },
      { cardId: 'c-potions', zone: 'main', quantity: 1 },
    ],
  })
  const noStarter = await createDeck(ctx.db, 'u1', {
    name: 'No Starter', format: 'revival', visibility: 'public',
    cards: [{ cardId: 'c-potions', zone: 'main', quantity: 1 }],
  })
  const res = await listPublicDecks(ctx.db, {})
  expect(res.entries.find((e) => e.id === withStarter)!.starterCardId).toBe('c-charms')
  expect(res.entries.find((e) => e.id === noStarter)!.starterCardId).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `starterCardId` is `undefined` (property doesn't exist).

- [ ] **Step 3: Implement**

In `db/src/queries.ts`, add `starterCardId` to the type:

```ts
export type PublicDeckEntry = {
  id: string; name: string; format: DeckFormat; author: string
  lessons: string[]; likeCount: number; viewCount: number
  cardCount: number; updatedAt: string; likedByViewer: boolean
  starterCardId: string | null
}
```

In `listPublicDecks`, after the `counts` lookup (which builds `byDeck`), add a starters lookup and include it in the mapped entries:

```ts
  const starters = ids.length
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId })
        .from(deckCards).where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
    : []
  const starterByDeck = new Map(starters.map((s) => [s.deckId, s.cardId]))
```

Then in the `entries` map add:

```ts
    starterCardId: starterByDeck.get(r.id) ?? null,
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/src/queries.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): return starterCardId (character-zone card) from listPublicDecks"
```

---

## Task 2: `getDeckLikeState` query

**Files:**
- Modify: `db/src/queries.ts`, `db/src/index.ts`
- Test: `ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces: `getDeckLikeState(db: DB, deckId: string, viewerId: string | null): Promise<{ likeCount: number; liked: boolean }>` — exported from `@revelio/db`.

- [ ] **Step 1: Write the failing test**

Append to `ingest/test/deck-browse.test.ts` (add `getDeckLikeState` to the `@revelio/db` import):

```ts
describe('getDeckLikeState', () => {
  it('reports count and whether the viewer liked it', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'S', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await toggleLike(ctx.db, id, 'u2')
    expect(await getDeckLikeState(ctx.db, id, 'u2')).toEqual({ likeCount: 1, liked: true })
    expect(await getDeckLikeState(ctx.db, id, 'u1')).toEqual({ likeCount: 1, liked: false })
    expect(await getDeckLikeState(ctx.db, id, null)).toEqual({ likeCount: 1, liked: false })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `getDeckLikeState` not exported.

- [ ] **Step 3: Implement**

In `db/src/queries.ts`:

```ts
export async function getDeckLikeState(db: DB, deckId: string, viewerId: string | null): Promise<{ likeCount: number; liked: boolean }> {
  const [row] = await db.select({ likeCount: decks.likeCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
  const likeCount = row?.likeCount ?? 0
  if (!viewerId) return { likeCount, liked: false }
  const [mine] = await db.select({ deckId: deckLikes.deckId }).from(deckLikes)
    .where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, viewerId))).limit(1)
  return { likeCount, liked: Boolean(mine) }
}
```

Add `getDeckLikeState` to the queries export in `db/src/index.ts`.

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/src/queries.ts db/src/index.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): getDeckLikeState for the deck overview like button"
```

---

## Task 3: `formatRelativeTime` helper

**Files:**
- Create: `web/src/lib/relative-time.ts`
- Test: `web/src/lib/__tests__/relative-time.test.ts`

**Interfaces:**
- Produces: `formatRelativeTime(iso: string, locale: string, now?: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/lib/relative-time'

const NOW = Date.parse('2026-07-10T12:00:00Z')

describe('formatRelativeTime', () => {
  it('formats seconds, days, and months (en)', () => {
    expect(formatRelativeTime('2026-07-10T11:59:30Z', 'en', NOW)).toBe('30 seconds ago')
    expect(formatRelativeTime('2026-07-08T12:00:00Z', 'en', NOW)).toBe('2 days ago')
    expect(formatRelativeTime('2026-05-11T12:00:00Z', 'en', NOW)).toBe('2 months ago')
  })

  it('respects the locale (de)', () => {
    expect(formatRelativeTime('2026-07-08T12:00:00Z', 'de', NOW)).toBe('vor 2 Tagen')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- relative-time
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// Largest-fitting-unit relative time via Intl. `now` is injectable for tests.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]

export function formatRelativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000) // negative = past
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, sec] of UNITS) {
    if (abs >= sec || unit === 'second') return rtf.format(Math.round(diffSec / sec), unit)
  }
  return rtf.format(0, 'second')
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- relative-time
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/relative-time.ts web/src/lib/__tests__/relative-time.test.ts
git commit -m "feat(web): formatRelativeTime helper"
```

---

## Task 4: `DeckArt` component (cropped image + fallback)

**Files:**
- Create: `web/src/components/deck-art.tsx`
- Test: `web/src/components/__tests__/deck-art.test.tsx`

**Interfaces:**
- Produces: `DeckArt({ cardId, lessons, imageBase, alt, className }: { cardId: string | null; lessons: string[]; imageBase: string; alt: string; className?: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DeckArt } from '@/components/deck-art'

describe('DeckArt', () => {
  it('renders the cropped starter image when a card id and base are given', () => {
    const { container } = render(<DeckArt cardId="c-1" lessons={['charms']} imageBase="https://img.test" alt="Deck" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://img.test/cards/c-1.webp')
    expect(img).toHaveAttribute('alt', 'Deck')
  })

  it('renders no image (gradient fallback) when there is no card id', () => {
    const { container } = render(<DeckArt cardId={null} lessons={['charms', 'potions']} imageBase="https://img.test" alt="Deck" />)
    expect(container.querySelector('img')).toBeNull()
    // gradient element present
    expect(container.querySelector('[data-slot="deck-art-fallback"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- deck-art
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client'
import { useState } from 'react'
import { imageKey, imageUrl, LESSONS } from '@revelio/core'
import { cn } from '@/lib/utils'

const LESSON_COLOR = new Map(LESSONS.map((l) => [l.code, l.color]))

function lessonGradient(lessons: string[]): string | undefined {
  const colors = lessons.map((c) => LESSON_COLOR.get(c)).filter(Boolean) as string[]
  if (colors.length === 0) return undefined // container's bg-muted shows through
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]}99)`
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

// Crops the deck's starting-character card image to its illustration band via CSS.
// Falls back to a lesson-colour gradient when there's no starter card or the
// image fails to load. The container controls size/aspect.
export function DeckArt({
  cardId, lessons, imageBase, alt, className,
}: {
  cardId: string | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(cardId && imageBase) && !errored
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {showImage ? (
        <img
          src={imageUrl(imageBase, imageKey(cardId as string))}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center 22%' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <div data-slot="deck-art-fallback" className="absolute inset-0" style={{ background: lessonGradient(lessons) }} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- deck-art
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deck-art.tsx web/src/components/__tests__/deck-art.test.tsx
git commit -m "feat(web): DeckArt cropped starter image with lesson-gradient fallback"
```

---

## Task 5: `DeckHeroCard` (Grid tile, Design A)

**Files:**
- Create: `web/src/components/deck-hero-card.tsx`
- Test: `web/src/components/__tests__/deck-hero-card.test.tsx`

**Interfaces:**
- Consumes: `DeckArt` (Task 4), `formatRelativeTime` (Task 3), `LessonIcons`, `PublicDeckEntry` (with `starterCardId`, Task 1).
- Produces: `DeckHeroCard({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeckHeroCard } from '@/components/deck-hero-card'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a>,
}))

const deck = {
  id: 'd1', name: 'Lara but Fast', format: 'revival' as const, author: 'Abls',
  lessons: ['charms', 'potions'], likeCount: 3, viewCount: 10, cardCount: 60,
  updatedAt: new Date().toISOString(), likedByViewer: false, starterCardId: 'c-1',
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckHeroCard deck={deck} imageBase="https://img.test" />
    </NextIntlClientProvider>,
  )
}

describe('DeckHeroCard', () => {
  it('shows name, format · cards, author, lessons, and read-only counts', () => {
    const { container } = renderCard()
    expect(screen.getByText('Lara but Fast')).toBeInTheDocument()
    expect(screen.getByText(/Revival · 60 cards/)).toBeInTheDocument()
    expect(screen.getByText('Abls')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()  // likes
    expect(screen.getByText('10')).toBeInTheDocument() // views
    // lesson icons + starter art present, but NO interactive like button
    expect(container.querySelector('[aria-pressed]')).toBeNull()
    expect(container.querySelector('a')).toHaveAttribute('href', '/decks/d1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- deck-hero-card
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Heart, Eye } from 'lucide-react'
import type { PublicDeckEntry } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { formatRelativeTime } from '@/lib/relative-time'

export function DeckHeroCard({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  return (
    <Link
      href={`/decks/${deck.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-[16/10]">
        <DeckArt cardId={deck.starterCardId} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="h-full w-full" />
        {/* top scrim + name/meta */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3">
          <div className="line-clamp-1 font-semibold text-white">{deck.name}</div>
          <div className="text-xs text-white/80">
            {t(`explore.format.${deck.format}`)} · {t('explore.cards', { count: deck.cardCount })}
          </div>
        </div>
        {/* bottom scrim + lessons/stats */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
          <LessonIcons codes={deck.lessons} size={18} />
          <div className="flex items-center gap-3 text-sm text-white">
            <span className="inline-flex items-center gap-1"><Heart className="size-4" />{deck.likeCount}</span>
            <span className="inline-flex items-center gap-1"><Eye className="size-4" />{deck.viewCount}</span>
          </div>
        </div>
      </div>
      {/* footer bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-foreground">
            {deck.author.charAt(0)}
          </span>
          <span className="truncate">{deck.author}</span>
        </span>
        <span className="shrink-0">{formatRelativeTime(deck.updatedAt, locale)}</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- deck-hero-card
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deck-hero-card.tsx web/src/components/__tests__/deck-hero-card.test.tsx
git commit -m "feat(web): DeckHeroCard grid tile with cropped hero art"
```

---

## Task 6: `DeckDiscoverRow` (List row)

**Files:**
- Create: `web/src/components/deck-discover-row.tsx`
- Test: `web/src/components/__tests__/deck-discover-row.test.tsx`

**Interfaces:**
- Consumes: `DeckArt`, `formatRelativeTime`, `LessonIcons`, `PublicDeckEntry`.
- Produces: `DeckDiscoverRow({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeckDiscoverRow } from '@/components/deck-discover-row'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a>,
}))

const deck = {
  id: 'd1', name: 'Potions Control', format: 'revival' as const, author: 'Herm',
  lessons: ['potions'], likeCount: 1, viewCount: 9, cardCount: 61,
  updatedAt: new Date().toISOString(), likedByViewer: false, starterCardId: null,
}

describe('DeckDiscoverRow', () => {
  it('renders name, author/meta, read-only counts, and links to the deck', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}><DeckDiscoverRow deck={deck} imageBase="https://img.test" /></NextIntlClientProvider>,
    )
    expect(screen.getByText('Potions Control')).toBeInTheDocument()
    expect(screen.getByText(/@Herm/)).toBeInTheDocument()
    expect(container.querySelector('[aria-pressed]')).toBeNull() // no like button
    expect(container.querySelector('a')).toHaveAttribute('href', '/decks/d1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- deck-discover-row
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Heart, Eye } from 'lucide-react'
import type { PublicDeckEntry } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { formatRelativeTime } from '@/lib/relative-time'

export function DeckDiscoverRow({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  return (
    <Link
      href={`/decks/${deck.id}`}
      className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <DeckArt cardId={deck.starterCardId} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="size-14 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{deck.name}</div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {t('explore.by', { author: deck.author })} · {t(`explore.format.${deck.format}`)} · {t('explore.cards', { count: deck.cardCount })} · {formatRelativeTime(deck.updatedAt, locale)}
          </span>
          <LessonIcons codes={deck.lessons} size={16} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Heart className="size-4" />{deck.likeCount}</span>
        <span className="inline-flex items-center gap-1"><Eye className="size-4" />{deck.viewCount}</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- deck-discover-row
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deck-discover-row.tsx web/src/components/__tests__/deck-discover-row.test.tsx
git commit -m "feat(web): DeckDiscoverRow list row with cropped thumbnail"
```

---

## Task 7: Rename to "Discover decks" + move like copy to `decks.like.*`

**Files:**
- Modify: `web/messages/en.json`, `web/messages/de.json`, `web/src/components/deck-like-button.tsx`

**Interfaces:**
- Produces: `decks.like.label`, `decks.like.error` message keys; `nav.browse` / `decks.explore.title` now read "Discover decks".

- [ ] **Step 1: Update English copy**

In `web/messages/en.json`:
- `nav.browse`: `"Browse decks"` → `"Discover decks"`.
- `decks.explore.title`: `"Browse decks"` → `"Discover decks"`.
- Remove `decks.explore.likeLabel` and `decks.explore.likeError`.
- Add a `decks.like` block (place it right after the `decks.explore` block's closing `},`):

```json
    "like": {
      "label": "Like this deck",
      "error": "Could not update your like. Please try again."
    },
```

- [ ] **Step 2: Update German copy**

In `web/messages/de.json`:
- `nav.browse` stays `"Decks entdecken"`; `decks.explore.title` stays `"Decks entdecken"`.
- Remove `decks.explore.likeLabel` / `likeError`.
- Add:

```json
    "like": {
      "label": "Dieses Deck liken",
      "error": "Like konnte nicht gespeichert werden. Bitte versuche es erneut."
    },
```

- [ ] **Step 3: Point the like button at the new keys**

In `web/src/components/deck-like-button.tsx`, change the two lookups:
- `t('explore.likeError')` → `t('like.error')`
- `t('explore.likeLabel')` → `t('like.label')`

- [ ] **Step 4: Verify JSON + keys resolve**

```bash
cd app && node -e "for (const l of ['en','de']){const d=require('./web/messages/'+l+'.json');if(!d.decks.like.label||!d.decks.like.error)throw new Error('missing like copy '+l);if(d.decks.explore.likeLabel)throw new Error('stale explore.likeLabel '+l)}console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add web/messages/en.json web/messages/de.json web/src/components/deck-like-button.tsx
git commit -m "feat(web): rename to Discover decks; move like copy to decks.like.*"
```

---

## Task 8: `DeckBrowse` — instant search, aligned controls, hero/row entries

**Files:**
- Modify: `web/src/components/deck-browse.tsx`, `web/src/app/[locale]/decks/page.tsx`

**Interfaces:**
- Consumes: `DeckHeroCard` (Task 5), `DeckDiscoverRow` (Task 6), `PublicDeckEntry.starterCardId`.
- Produces: `DeckBrowse` now takes an added `imageBase: string` prop.

- [ ] **Step 1: Pass `imageBase` from the page**

In `web/src/app/[locale]/decks/page.tsx`, add the image base constant and prop. At the top (after imports):

```ts
const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
```

And in the returned `<DeckBrowse … />`, add:

```tsx
        imageBase={IMAGE_BASE}
```

- [ ] **Step 2: Update `DeckBrowse` — props, imports, instant search**

In `web/src/components/deck-browse.tsx`:

Add to imports:

```tsx
import { useRef } from 'react'
import { DeckHeroCard } from '@/components/deck-hero-card'
import { DeckDiscoverRow } from '@/components/deck-discover-row'
```

Remove the now-unused imports: `Eye` (from lucide), `LessonIcons`, `DeckLikeButton`, `Link` (entries no longer build their own links — confirm no other `Link` use remains; the "Clear"/pagination use `Button`/`router`, not `Link`). Keep `List`, `LayoutGrid` (view toggle icons).

Add `imageBase: string` to the component's props type and destructure it:

```tsx
export function DeckBrowse({
  state, entries, total, pageCount, loggedIn, initialView, imageBase,
}: {
  state: BrowseState
  entries: PublicDeckEntry[]
  total: number
  pageCount: number
  loggedIn: boolean
  initialView?: DeckView
  imageBase: string
}) {
```

(`loggedIn` stays in the type but is now unused by the list — keep it; it's harmless and avoids churn at the call site. If lint flags it, prefix usage is not needed; leave the prop and reference it once via `void loggedIn` is NOT allowed — instead simply drop `loggedIn` from the destructure and the type since the list no longer needs it.)

**Decision:** drop `loggedIn` entirely from `DeckBrowse` (type + destructure) and remove it from the page's `<DeckBrowse>` call, since read-only stats don't need it.

Inside the component body, add a debounced search handler (mirrors `search-box.tsx`):

```tsx
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onSearchChange(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => push({ q: value }), 300)
  }
```

- [ ] **Step 3: Replace the search input + align control heights**

Replace the controls `Input` and both `SelectTrigger`s. The search grows to fill; all three controls are `h-9` (drop `size="sm"` from the triggers so they match the default `Input` height):

```tsx
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          defaultValue={state.q}
          placeholder={t('explore.searchPlaceholder')}
          className="h-9 min-w-56 flex-1"
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Select value={state.sort} onValueChange={(v) => push({ sort: v as PublicDeckSort })}>
          <SelectTrigger aria-label={t('explore.sort.label')} className="h-9 w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => <SelectItem key={s} value={s}>{t(`explore.sort.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={state.format ?? 'all'}
          onValueChange={(v) => push({ format: v === 'all' ? null : (v as DeckFormat) })}
        >
          <SelectTrigger aria-label={t('explore.format.label')} className="h-9 w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('explore.format.all')}</SelectItem>
            {FORMATS.map((f) => <SelectItem key={f} value={f}>{t(`explore.format.${f}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => router.push('/decks')}>{t('explore.clear')}</Button>
        ) : null}
      </div>
```

- [ ] **Step 4: Replace both entry blocks with the new components**

Replace the entire `{entries.length === 0 ? … List … : … Grid … }` block with:

```tsx
      {/* Entries */}
      {entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('explore.empty')}</p>
      ) : view === 'list' ? (
        <ul className="space-y-2">
          {entries.map((d) => (
            <li key={d.id}><DeckDiscoverRow deck={d} imageBase={imageBase} /></li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((d) => (
            <li key={d.id}><DeckHeroCard deck={d} imageBase={imageBase} /></li>
          ))}
        </ul>
      )}
```

- [ ] **Step 5: Update the existing `deck-browse` test for instant search**

The suite has no dedicated `deck-browse` test yet; add one. Create `web/src/components/__tests__/deck-browse.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const replace = vi.fn()
const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'}>{children}</a>,
}))

import { DeckBrowse } from '@/components/deck-browse'

const base = {
  state: { q: '', lessons: [], format: null, sort: 'likes' as const, page: 1 },
  entries: [], total: 0, pageCount: 1, imageBase: 'https://img.test', initialView: 'gallery' as const,
}

function renderBrowse() {
  return render(<NextIntlClientProvider locale="en" messages={en}><DeckBrowse {...base} /></NextIntlClientProvider>)
}

beforeEach(() => { vi.useFakeTimers(); push.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('DeckBrowse instant search', () => {
  it('debounces typing into a URL update without Enter', () => {
    renderBrowse()
    const input = screen.getByPlaceholderText(en.decks.explore.searchPlaceholder)
    fireEvent.change(input, { target: { value: 'aggro' } })
    expect(push).not.toHaveBeenCalled()          // not yet (debounced)
    act(() => { vi.advanceTimersByTime(300) })
    expect(push).toHaveBeenCalledWith(expect.stringContaining('q=aggro'))
  })
})
```

Note: `push` here is `router.push` used by `DeckBrowse`'s internal `push()` helper via `router.push(...)`. Since `DeckBrowse.push()` calls `router.push(\`/decks?...\`)`, asserting the mocked `router.push` receives `q=aggro` verifies the debounced search fires.

- [ ] **Step 6: Run tests + typecheck + lint**

```bash
npm test -w web -- deck-browse
npm run typecheck
npm run lint -w web
```

Expected: deck-browse test PASSES; typecheck clean; lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/deck-browse.tsx web/src/app/[locale]/decks/page.tsx web/src/components/__tests__/deck-browse.test.tsx
git commit -m "feat(web): Discover hero/row entries + instant, height-aligned search"
```

---

## Task 9: Interactive like on the deck overview

**Files:**
- Modify: `web/src/app/[locale]/decks/[id]/page.tsx`, `web/src/components/deck-overview.tsx`, `web/src/components/deck-overview-actions.tsx`

**Interfaces:**
- Consumes: `getDeckLikeState` (Task 2), `DeckLikeButton` (existing, keys updated Task 7).
- Produces: overview renders a working like toggle for logged-in viewers.

- [ ] **Step 1: Fetch like state in the overview page**

In `web/src/app/[locale]/decks/[id]/page.tsx`, add `getDeckLikeState` to the `@revelio/db` import, fetch it alongside the deck, and pass it down. After `if (!existing) notFound()`:

```tsx
  const likeState = await getDeckLikeState(getDb(), id, viewerId)
```

In the `<DeckOverview … />` props, add:

```tsx
        likeCount={likeState.likeCount}
        liked={likeState.liked}
```

- [ ] **Step 2: Thread through `DeckOverview`**

In `web/src/components/deck-overview.tsx`, add to `DeckOverviewProps`:

```tsx
  likeCount: number
  liked: boolean
```

Destructure them in the component (add to the existing destructure list) and pass to `DeckOverviewActions`:

```tsx
      <DeckOverviewActions
        deckId={deckId}
        name={name}
        format={format}
        visibility={visibility}
        views={views}
        isOwner={isOwner}
        loggedIn={loggedIn}
        likeCount={props.likeCount}
        liked={props.liked}
      />
```

(Match the existing prop list; only `likeCount` and `liked` are new.)

- [ ] **Step 3: Render the like button in the actions bar**

In `web/src/components/deck-overview-actions.tsx`:
- Add `DeckLikeButton` import: `import { DeckLikeButton } from '@/components/deck-like-button'`.
- Add `likeCount: number` and `liked: boolean` to the props type + destructure.
- Render the button in the actions row (e.g. right after the opening `<div className="flex flex-wrap items-center gap-2">`):

```tsx
      <DeckLikeButton deckId={deckId} initialLiked={liked} initialCount={likeCount} loggedIn={loggedIn} />
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS (all three prop chains line up).

- [ ] **Step 5: Full web test suite + lint**

```bash
npm test -w web
npm run lint -w web
```

Expected: all pass; 0 lint errors.

- [ ] **Step 6: Manual end-to-end verification**

With the local stack up (`docker compose up -d`; migrations already current) and `npm run dev -w web`:

- `/decks` (Discover): heading reads "Discover decks"; typing filters instantly (no Enter); search + Sort + Format are the same height; Grid shows hero cards with cropped starter art (or lesson-gradient fallback); List shows rows with thumbnails; ♥/👁 are plain text (no toggle).
- Open a public deck → overview shows the like button; logged-in click toggles ♥ and persists on reload; logged-out click routes to sign-in.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/[locale]/decks/[id]/page.tsx" web/src/components/deck-overview.tsx web/src/components/deck-overview-actions.tsx
git commit -m "feat(web): interactive like button on the deck overview page"
```

---

## Self-Review

**Spec coverage:**
- Hero cards (Design A) w/ cropped art + gradients + footer → Tasks 4, 5. ✓
- Lesson-gradient fallback → Task 4. ✓
- List rows w/ cropped thumbnail → Task 6. ✓
- Cropping = CSS `object-fit`/`object-position`, no new assets → Task 4. ✓
- `starterCardId` from query → Task 1. ✓
- Instant, wider, height-aligned search → Task 8. ✓
- Rename to "Discover decks" → Task 7. ✓
- Likes read-only in list; interactive on overview; `getDeckLikeState` → Tasks 2, 7, 8 (read-only entries), 9. ✓
- Relative-time footer → Task 3. ✓
- `imageBase` plumbed to the list → Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `PublicDeckEntry.starterCardId` defined in Task 1, consumed in Tasks 5/6/8; `getDeckLikeState` signature consistent Tasks 2→9; `DeckArt` prop names (`cardId`/`lessons`/`imageBase`/`alt`/`className`) match across Tasks 4/5/6; `DeckLikeButton` props (`deckId`/`initialLiked`/`initialCount`/`loggedIn`) match its existing signature at the Task 9 call site; `decks.like.label`/`error` defined Task 7, used by `deck-like-button` in Task 7. ✓

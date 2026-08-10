# Conjured Constellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily-rotating, cast-and-drift showcase of real cards to the foot of the home page.

**Architecture:** A new `@revelio/db` query returns a stable pool of portrait, image-bearing cards with locale names. Two pure web helpers deterministically pick the day's cards (`pickDailyCards`) and their scatter (`scatterPositions`) from `mulberry32(dayNumber)`. A server module (`showcase.ts`) caches the pool and assembles the day's set; the server `HomePage` renders it through a client `<CardConstellation>` that server-renders cards at rest and layers on a one-time cast animation.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, next-intl, Drizzle/Postgres, Tailwind v4, vitest + Testing Library, Testcontainers (db query test).

## Global Constraints

- All app commands run from `app/`. There is no root `package.json`.
- **Conventional Commits.** Sign commits with the gpg path: `git -c gpg.program=/opt/homebrew/bin/gpg commit …`.
- Toolchain is not on PATH: use `/usr/local/bin/node` / `/usr/local/bin/npm`, and `/opt/homebrew/bin/gpg`.
- **Localize all user-facing strings** in both `web/messages/en.json` and `web/messages/de.json` — never hardcode.
- **Never load full-res card images on the home page** — use `thumbKey` thumbnails only.
- Rotation is **deterministic per UTC calendar day** via `mulberry32(dayNumber)`, mirroring `web/src/lib/daily-examples.ts`.
- Respect `prefers-reduced-motion`; the showcase must work with **no JavaScript** (cards server-rendered at rest, links functional before hydration).
- **No schema change / no migration.** Purely additive.
- Selection is **locale-independent** (same cards worldwide); locale only resolves name/image.

---

### Task 1: `getDailyShowcaseCandidates` DB query

**Files:**
- Modify: `app/db/src/queries.ts` (add query + `ShowcaseCandidate` type)
- Modify: `app/db/src/index.ts:12` (named export of fn) and `:13` (named export of type)
- Test: `app/ingest/test/queries.test.ts` (add `describe` block)

**Interfaces:**
- Produces: `type ShowcaseCandidate = { id: string; name: string; imageVersion: number }` and
  `getDailyShowcaseCandidates(db: DB, locale: string): Promise<ShowcaseCandidate[]>` — portrait
  (`orientation` null or not `'horizontal'`), image-bearing (`imageVersion` not null) cards,
  ordered by `id`, with `name` resolved to the locale (fallback to `cards.name`).

- [ ] **Step 1: Write the failing test**

Add to `app/ingest/test/queries.test.ts`. Import `getDailyShowcaseCandidates` in the existing top `import { … } from '@revelio/db'` line, then append:

```ts
describe('getDailyShowcaseCandidates', () => {
  beforeAll(async () => {
    await ctx.db.insert(schema.cards).values([
      { id: 'bs-2-owl', setCode: 'BS', number: '2', name: 'Owl', imageVersion: 3,
        orientation: 'vertical', defaultLanguage: 'en', languages: ['en'] },
      { id: 'bs-3-map', setCode: 'BS', number: '3', name: 'Map', imageVersion: 1,
        orientation: 'horizontal', defaultLanguage: 'en', languages: ['en'] },
    ])
    await ctx.db.insert(schema.cardLocalizations).values({
      cardId: 'bs-2-owl', lang: 'de', name: 'Eule', status: 'official', text: null, flavorText: null,
    })
  })

  it('returns only portrait, image-bearing cards', async () => {
    const ids = (await getDailyShowcaseCandidates(ctx.db, 'en')).map((c) => c.id)
    expect(ids).toContain('bs-2-owl')
    expect(ids).not.toContain('bs-3-map')    // horizontal excluded
    expect(ids).not.toContain('bs-1-fluffy') // no imageVersion excluded
  })

  it('uses the localized name when present, else the base name', async () => {
    const de = await getDailyShowcaseCandidates(ctx.db, 'de')
    expect(de.find((c) => c.id === 'bs-2-owl')?.name).toBe('Eule')
    const en = await getDailyShowcaseCandidates(ctx.db, 'en')
    expect(en.find((c) => c.id === 'bs-2-owl')?.name).toBe('Owl')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/usr/local/bin/npm test -w ingest -- test/queries.test.ts -t "getDailyShowcaseCandidates"`
Expected: FAIL — `getDailyShowcaseCandidates` is not exported / not a function. (Requires Docker for Testcontainers.)

- [ ] **Step 3: Add the query**

In `app/db/src/queries.ts`, ensure the drizzle-orm import includes `and, or, eq, ne, isNull, isNotNull, asc` (add any missing to the existing `from 'drizzle-orm'` import), and that `cards` and `cardLocalizations` are imported from the schema (both are already used in this file). Append:

```ts
export type ShowcaseCandidate = { id: string; name: string; imageVersion: number }

// Portrait, image-bearing cards for the home showcase, locale name resolved.
// Stable order (by id) so the daily picker is deterministic; selection itself is
// locale-independent — locale only affects the resolved name.
export async function getDailyShowcaseCandidates(
  db: DB,
  locale: string,
): Promise<ShowcaseCandidate[]> {
  const rows = await db
    .select({
      id: cards.id,
      baseName: cards.name,
      localName: cardLocalizations.name,
      imageVersion: cards.imageVersion,
    })
    .from(cards)
    .leftJoin(
      cardLocalizations,
      and(eq(cardLocalizations.cardId, cards.id), eq(cardLocalizations.lang, locale)),
    )
    .where(
      and(
        isNotNull(cards.imageVersion),
        or(isNull(cards.orientation), ne(cards.orientation, 'horizontal')),
      ),
    )
    .orderBy(asc(cards.id))
  return rows.map((r) => ({ id: r.id, name: r.localName ?? r.baseName, imageVersion: r.imageVersion! }))
}
```

- [ ] **Step 4: Export from the package root**

In `app/db/src/index.ts`, add `getDailyShowcaseCandidates` to the value export list on line 12, and `ShowcaseCandidate` to the `export type { … } from './queries'` list on line 13.

- [ ] **Step 5: Run test to verify it passes**

Run: `/usr/local/bin/npm test -w ingest -- test/queries.test.ts -t "getDailyShowcaseCandidates"`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/queries.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): add getDailyShowcaseCandidates query for home showcase"
```

---

### Task 2: `pickDailyCards` helper

**Files:**
- Create: `app/web/src/lib/daily-cards.ts`
- Test: `app/web/src/lib/__tests__/daily-cards.test.ts`

**Interfaces:**
- Consumes: `ShowcaseCandidate` (Task 1), `mulberry32` from `@/lib/random`.
- Produces: `pickDailyCards(candidates: readonly ShowcaseCandidate[], date: Date, count?: number): ShowcaseCandidate[]` — deterministic per UTC day, default `count = 6`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/daily-cards.test.ts`:

```ts
import { it, expect } from 'vitest'
import { pickDailyCards } from '../daily-cards'

const pool = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Card ${i}`, imageVersion: 1 }))

it('picks `count` cards, no duplicates', () => {
  const r = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'), 6)
  expect(r).toHaveLength(6)
  expect(new Set(r.map((c) => c.id)).size).toBe(6)
})

it('is deterministic within a UTC day', () => {
  expect(pickDailyCards(pool, new Date('2026-08-10T00:00:00Z'))).toEqual(
    pickDailyCards(pool, new Date('2026-08-10T23:59:59Z')),
  )
})

it('rotates across consecutive UTC days', () => {
  const a = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'))
  const b = pickDailyCards(pool, new Date('2026-08-11T12:00:00Z'))
  expect(a).not.toEqual(b)
})

it('returns the whole pool (no dupes) when count exceeds size', () => {
  const r = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'), 999)
  expect(r).toHaveLength(pool.length)
  expect(new Set(r.map((c) => c.id)).size).toBe(pool.length)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/usr/local/bin/npm test -w web -- src/lib/__tests__/daily-cards.test.ts`
Expected: FAIL — cannot find module `../daily-cards`.

- [ ] **Step 3: Write the implementation**

Create `app/web/src/lib/daily-cards.ts`:

```ts
import type { ShowcaseCandidate } from '@revelio/db'
import { mulberry32 } from './random'

const MS_PER_DAY = 86_400_000

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Deterministically pick the day's showcase cards. Depends only on the pool and
 * the UTC calendar day of `date`, so it is stable for all visitors within a day
 * and rotates at 00:00 UTC. Mirrors `pickDailyExamples`.
 */
export function pickDailyCards(
  candidates: readonly ShowcaseCandidate[],
  date: Date,
  count = 6,
): ShowcaseCandidate[] {
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  return shuffle(candidates, mulberry32(day)).slice(0, count)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/usr/local/bin/npm test -w web -- src/lib/__tests__/daily-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/daily-cards.ts app/web/src/lib/__tests__/daily-cards.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add deterministic daily card picker"
```

---

### Task 3: `scatterPositions` helper

**Files:**
- Create: `app/web/src/lib/card-scatter.ts`
- Test: `app/web/src/lib/__tests__/card-scatter.test.ts`

**Interfaces:**
- Consumes: `mulberry32` from `@/lib/random`.
- Produces: `type ScatterSlot = { left: number; top: number; rot: number }` (percent, percent, degrees) and
  `scatterPositions(date: Date, count: number): ScatterSlot[]` — deterministic per UTC day, one card per
  horizontal cell (no horizontal-center collisions), all values in-bounds.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/card-scatter.test.ts`:

```ts
import { it, expect } from 'vitest'
import { scatterPositions } from '../card-scatter'

const day = new Date('2026-08-10T12:00:00Z')

it('returns one slot per requested card', () => {
  expect(scatterPositions(day, 6)).toHaveLength(6)
})

it('is deterministic within a UTC day and rotates across days', () => {
  expect(scatterPositions(new Date('2026-08-10T01:00:00Z'), 6)).toEqual(
    scatterPositions(new Date('2026-08-10T22:00:00Z'), 6),
  )
  expect(scatterPositions(day, 6)).not.toEqual(scatterPositions(new Date('2026-08-11T12:00:00Z'), 6))
})

it('keeps every slot in bounds', () => {
  for (const s of scatterPositions(day, 6)) {
    expect(s.left).toBeGreaterThanOrEqual(0)
    expect(s.left).toBeLessThanOrEqual(100)
    expect(s.top).toBeGreaterThanOrEqual(0)
    expect(s.top).toBeLessThanOrEqual(100)
    expect(Math.abs(s.rot)).toBeLessThanOrEqual(12)
  }
})

it('lays cards left-to-right with no horizontal collisions', () => {
  const lefts = scatterPositions(day, 6).map((s) => s.left)
  const sorted = [...lefts].sort((a, b) => a - b)
  expect(lefts).toEqual(sorted)
  for (let i = 1; i < lefts.length; i++) expect(lefts[i] - lefts[i - 1]).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/usr/local/bin/npm test -w web -- src/lib/__tests__/card-scatter.test.ts`
Expected: FAIL — cannot find module `../card-scatter`.

- [ ] **Step 3: Write the implementation**

Create `app/web/src/lib/card-scatter.ts`:

```ts
import { mulberry32 } from './random'

export type ScatterSlot = { left: number; top: number; rot: number }

const MS_PER_DAY = 86_400_000
const EDGE = 6        // keep cards off the exact band edges (percent)
const TOP_MIN = 30    // vertical band the card centers may occupy (percent)
const TOP_MAX = 60
const ROT_MAX = 12    // max tilt (degrees)

/**
 * Deterministic per-day scatter within the showcase band. Splits the usable
 * width into `count` cells and jitters one card inside each, so cards cover the
 * band without horizontal-center collisions. Seed is offset from the card picker
 * so positions don't correlate with which cards were chosen.
 */
export function scatterPositions(date: Date, count: number): ScatterSlot[] {
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  const rng = mulberry32((day ^ 0x9e3779b9) >>> 0)
  const cell = (100 - EDGE * 2) / count
  return Array.from({ length: count }, (_, i) => {
    const left = EDGE + i * cell + (0.2 + rng() * 0.6) * cell // jitter within [0.2,0.8] of the cell
    const top = TOP_MIN + rng() * (TOP_MAX - TOP_MIN)
    const rot = (rng() * 2 - 1) * ROT_MAX
    return {
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
      rot: Number(rot.toFixed(2)),
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/usr/local/bin/npm test -w web -- src/lib/__tests__/card-scatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/card-scatter.ts app/web/src/lib/__tests__/card-scatter.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add deterministic daily card scatter"
```

---

### Task 4: `<CardConstellation>` client component

**Files:**
- Create: `app/web/src/components/card-constellation.tsx`
- Modify: `app/web/src/app/globals.css` (add `card-bob` keyframe + class)
- Modify: `app/web/messages/en.json` and `app/web/messages/de.json` (`home.showcaseLabel`)
- Test: `app/web/src/components/__tests__/card-constellation.test.tsx`

**Interfaces:**
- Consumes: `ShowcaseCandidate` (Task 1), `ScatterSlot` (Task 3), `imageUrl`/`thumbKey` from `@revelio/core`,
  `CardImage` from `@/components/card-image`, `Link` from `@/../i18n/navigation`.
- Produces: `CardConstellation({ cards, positions, imageBase }: { cards: ShowcaseCandidate[]; positions: ScatterSlot[]; imageBase: string })`.

- [ ] **Step 1: Add the i18n label (both locales)**

In `app/web/messages/en.json`, inside the `"home"` object, add: `"showcaseLabel": "Featured cards"`.
In `app/web/messages/de.json`, inside the `"home"` object, add: `"showcaseLabel": "Vorgestellte Karten"`.

- [ ] **Step 2: Add the drift keyframe**

Append to `app/web/src/app/globals.css`:

```css
@keyframes card-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.card-bob { animation: card-bob var(--bob-dur, 7s) ease-in-out var(--bob-delay, 0s) infinite; }
@media (prefers-reduced-motion: reduce) {
  .card-bob { animation: none; }
}
```

- [ ] **Step 3: Write the failing test**

Create `app/web/src/components/__tests__/card-constellation.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { it, expect, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a>,
}))

import { CardConstellation } from '../card-constellation'

const cards = [
  { id: 'a', name: 'Alpha', imageVersion: 1 },
  { id: 'b', name: 'Beta', imageVersion: 2 },
]
const positions = [
  { left: 20, top: 40, rot: -5 },
  { left: 70, top: 50, rot: 5 },
]

it('renders one link per card to its detail page, labelled by name', () => {
  render(<CardConstellation cards={cards} positions={positions} imageBase="https://img" />)
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(2)
  expect(links[0]).toHaveAttribute('href', '/card/a')
  expect(screen.getByLabelText('Alpha')).toBeInTheDocument()
})

it('renders nothing when there are no cards', () => {
  const { container } = render(<CardConstellation cards={[]} positions={[]} imageBase="https://img" />)
  expect(container.querySelector('section')).toBeNull()
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `/usr/local/bin/npm test -w web -- src/components/__tests__/card-constellation.test.tsx`
Expected: FAIL — cannot find module `../card-constellation`.

- [ ] **Step 5: Write the component**

Create `app/web/src/components/card-constellation.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { imageUrl, thumbKey } from '@revelio/core'
import type { ShowcaseCandidate } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { CardImage } from '@/components/card-image'
import type { ScatterSlot } from '@/lib/card-scatter'

const SESSION_KEY = 'revelio.constellation.cast'

// Daily card showcase pinned to the foot of the home hero. Cards are
// server-rendered at rest (positioned + tilted); on first mount per session we
// layer on a one-time "cast" from a spark at the band's base. Drift + hover are
// CSS. Everything degrades to static links with no JS / reduced motion.
export function CardConstellation({
  cards,
  positions,
  imageBase,
}: {
  cards: ShowcaseCandidate[]
  positions: ScatterSlot[]
  imageBase: string
}) {
  const t = useTranslations('home')
  const bandRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const band = bandRef.current
    if (!band) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, '1')

    const rect = band.getBoundingClientRect()
    const sparkX = rect.left + rect.width / 2
    const sparkY = rect.bottom
    band.querySelectorAll<HTMLElement>('[data-card]').forEach((el, i) => {
      if (typeof el.animate !== 'function') return
      const r = el.getBoundingClientRect()
      const dx = sparkX - (r.left + r.width / 2)
      const dy = sparkY - (r.top + r.height / 2)
      const rot = el.dataset.rot ?? '0'
      el.animate(
        [
          { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.35) rotate(0deg)`, opacity: 0 },
          { transform: `translate(-50%,-50%) rotate(${rot}deg)`, opacity: 1 },
        ],
        { duration: 620, delay: 80 + i * 70, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' },
      )
    })
  }, [])

  if (cards.length === 0) return null

  return (
    <section
      aria-label={t('showcaseLabel')}
      className="pointer-events-none fixed inset-x-0 bottom-0 -z-[5] h-44 overflow-hidden sm:h-48"
    >
      <div ref={bandRef} className="relative mx-auto h-full max-w-5xl">
        {cards.map((card, i) => {
          const pos = positions[i]
          if (!pos) return null
          return (
            <Link
              key={card.id}
              href={`/card/${card.id}`}
              data-card
              data-rot={String(pos.rot)}
              aria-label={card.name}
              className="group pointer-events-auto absolute block w-[76px] sm:w-[84px]"
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: `translate(-50%,-50%) rotate(${pos.rot}deg)`,
              }}
            >
              <span
                className="card-bob block"
                style={
                  { '--bob-dur': `${6 + i * 0.5}s`, '--bob-delay': `${i * 0.4}s` } as React.CSSProperties
                }
              >
                <span className="block overflow-hidden rounded-lg border border-primary/40 shadow-lg shadow-black/40 transition duration-200 group-hover:scale-105 group-hover:border-primary group-focus-visible:scale-105">
                  <CardImage
                    src={imageUrl(imageBase, thumbKey(card.id, card.imageVersion))}
                    alt={card.name}
                    sizes="84px"
                    frameClassName="rounded-lg"
                  />
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `/usr/local/bin/npm test -w web -- src/components/__tests__/card-constellation.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/card-constellation.tsx app/web/src/components/__tests__/card-constellation.test.tsx app/web/src/app/globals.css app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add CardConstellation home showcase component"
```

---

### Task 5: Server assembly + wire into the home page

**Files:**
- Create: `app/web/src/lib/showcase.ts`
- Modify: `app/web/src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `getDailyShowcaseCandidates` (Task 1), `pickDailyCards` (Task 2), `scatterPositions` (Task 3),
  `CardConstellation` (Task 4), `getDb` from `@/lib/db`.
- Produces: `type HomeShowcase = { cards: ShowcaseCandidate[]; positions: ScatterSlot[] }` and
  `getHomeShowcase(locale: string, date: Date): Promise<HomeShowcase>`.

- [ ] **Step 1: Write the assembly module**

Create `app/web/src/lib/showcase.ts`:

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { getDailyShowcaseCandidates, type ShowcaseCandidate } from '@revelio/db'
import { getDb } from '@/lib/db'
import { pickDailyCards } from '@/lib/daily-cards'
import { scatterPositions, type ScatterSlot } from '@/lib/card-scatter'

const SHOWCASE_COUNT = 6

export type HomeShowcase = { cards: ShowcaseCandidate[]; positions: ScatterSlot[] }

function loadCandidates(locale: string): Promise<ShowcaseCandidate[]> {
  return getDailyShowcaseCandidates(getDb(), locale)
}

// The candidate pool only changes when cards/images are added (an ingest run),
// so cache it for a day even though the home page is force-dynamic. The daily
// pick + scatter are cheap and computed per request.
const getCachedCandidates = unstable_cache(loadCandidates, ['showcase-candidates'], {
  revalidate: 86_400,
})

export async function getHomeShowcase(locale: string, date: Date): Promise<HomeShowcase> {
  const cards = pickDailyCards(await getCachedCandidates(locale), date, SHOWCASE_COUNT)
  return { cards, positions: scatterPositions(date, cards.length) }
}
```

- [ ] **Step 2: Wire it into the home page**

Edit `app/web/src/app/[locale]/page.tsx`:

1. Add imports near the other `@/lib` / `@/components` imports:

```ts
import { getHomeShowcase, type HomeShowcase } from '@/lib/showcase'
import { CardConstellation } from '@/components/card-constellation'
```

2. Extend the `Home` component signature and render the showcase. Replace the current
   `export function Home({ recentSets = [] }: { recentSets?: SetDTO[] }) {` line with:

```tsx
export function Home({
  recentSets = [],
  showcase,
  imageBase,
}: {
  recentSets?: SetDTO[]
  showcase?: HomeShowcase
  imageBase?: string
}) {
```

3. Immediately before the closing `</main>` tag, add:

```tsx
      {showcase && imageBase && showcase.cards.length > 0 && (
        <CardConstellation
          cards={showcase.cards}
          positions={showcase.positions}
          imageBase={imageBase}
        />
      )}
```

4. In the async `HomePage`, replace the body's data fetch + return. Change:

```tsx
  const sets = await listSets(getDb(), locale)
  const recentSets = [...sets].sort((a, b) => byReleaseDate(b, a)).slice(0, 5)
  return <Home recentSets={recentSets} />
```

to:

```tsx
  const [sets, showcase] = await Promise.all([
    listSets(getDb(), locale),
    getHomeShowcase(locale, new Date()),
  ])
  const recentSets = [...sets].sort((a, b) => byReleaseDate(b, a)).slice(0, 5)
  const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  return <Home recentSets={recentSets} showcase={showcase} imageBase={imageBase} />
```

- [ ] **Step 3: Typecheck, lint, and run the web test suite**

Run: `/usr/local/bin/npm run typecheck`
Expected: PASS (no errors).

Run: `/usr/local/bin/npm run lint -w web`
Expected: no new errors (pre-existing warnings are acceptable).

Run: `/usr/local/bin/npm test -w web`
Expected: PASS — the full web suite is green, including the new helper and component tests.

- [ ] **Step 4: Verify in the browser (manual)**

Start the dev server (`/usr/local/bin/npm run dev -w web`), open the home page, and confirm:
- Cards appear in a scattered band at the very bottom, below the search + chips + recent sets, never overlapping the search.
- On first load the cards cast up from the base; reloading in the same tab shows them already at rest (once-per-session).
- Hovering a card lifts/brightens it; clicking opens `/card/<id>`.
- Toggling the OS "reduce motion" setting removes the cast and drift.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/showcase.ts "app/web/src/app/[locale]/page.tsx"
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): show daily conjured-constellation card showcase on home"
```

---

## Self-Review

**Spec coverage:**
- Daily deterministic rotation → Tasks 2, 3 (`mulberry32`-seeded pick + scatter), assembled in Task 5.
- Bottom-band placement clear of search → Task 4 (`fixed inset-x-0 bottom-0`), Task 5 (rendered in `main`).
- 6 desktop / 4 mobile → count is 6 (Task 5); narrow layout note carried by CSS. *(See open item below.)*
- Cast on load, once per session; drift; hover reveal; reduced-motion → Task 4.
- Thumbnails via `thumbKey`, lazy, no full-res → Task 4 (`CardImage` + `thumbKey`, default lazy).
- Cache pool vs force-dynamic → Task 5 (`unstable_cache`, day revalidate).
- Progressive enhancement (server-rendered at rest, works without JS) → Task 4.
- No-image / portrait-only filtering, locale name → Task 1.
- Accessibility (labelled section, name-labelled links, decorative hidden) → Task 4.
- Testing (pick, scatter, query, component) → Tasks 1–4.

**Open implementation item (resolve during Task 5, Step 4):**
- **4 cards on mobile.** The plan renders 6 slots; on very narrow screens 6 may crowd. If it does, cap the count responsively — the simplest approach is to render 6 but hide the last two under `max-sm:hidden` on their `Link`, and skip their slots. Decide against the running app; it does not change any interface.

**Placeholder scan:** none — every step has concrete code or exact edit.

**Type consistency:** `ShowcaseCandidate` (Task 1) is imported by Tasks 2, 4, 5; `ScatterSlot` (Task 3) by Tasks 4, 5; `HomeShowcase` (Task 5) by the page. `getHomeShowcase(locale, date)` and `CardConstellation({cards, positions, imageBase})` signatures match across producer and consumers.

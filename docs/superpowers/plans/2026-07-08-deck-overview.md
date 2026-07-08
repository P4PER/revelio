# Deck Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a read-only deck **overview** page at `/decks/[id]` (owner always, anyone once published) with a List/Gallery toggle, and move the editor to `/decks/[id]/edit`.

**Architecture:** A new server page resolves the deck through a viewer-aware query and renders a client `DeckOverview` shell (header, stats strip, action bar, List↔Gallery toggle). List view reuses `DeckPanel` in a new read-only mode; Gallery view is a new thumbnail grid. Publish/Export/Duplicate reuse existing server actions and the existing `DeckExportMenu`. The editor component is unchanged — only its route moves.

**Tech Stack:** Next.js 16 App Router (React 19) + next-intl, Drizzle/Postgres, Meilisearch (unaffected), Vitest + Testing Library, Tailwind v4 + shadcn/Radix.

## Global Constraints

- All app commands run from `app/`. There is no root `package.json`.
- Conventional Commits for every commit.
- No DB schema change — this feature adds **no migration** (it reuses the existing `decks.visibility` column and `deck_cards`). Do **not** run `npm run generate`.
- Every new user-facing string gets a key in **both** `app/web/messages/en.json` and `app/web/messages/de.json` (the two files must stay key-for-key identical).
- Zone string values are exactly `'character' | 'main' | 'sideboard'`.
- Locale-aware links use `Link`/`useRouter` from `@/../i18n/navigation`, never bare `next/link`.
- Server actions stay `'use server'`; never leak secrets to the client.
- TDD: write the failing test first, watch it fail, implement, watch it pass, commit.

---

## File Structure

**Create:**
- `app/web/src/lib/deck-stats.ts` — pure derivation of legality status/violations + main entries/count from `DeckCardView[]`.
- `app/web/src/lib/__tests__/deck-stats.test.ts` — unit tests for the above.
- `app/web/src/test/intl.tsx` — `renderWithIntl` test helper (NextIntlClientProvider + en messages).
- `app/web/src/components/deck-gallery.tsx` — read-only card-art grid (character → main → sideboard) with quantity badges.
- `app/web/src/components/deck-overview-actions.tsx` — Edit / Publish-Unpublish / Export / Duplicate action bar.
- `app/web/src/components/deck-overview.tsx` — the overview shell (header, stats strip, view toggle, card region).
- `app/web/src/components/__tests__/deck-panel-readonly.test.tsx`
- `app/web/src/components/__tests__/deck-gallery.test.tsx`
- `app/web/src/components/__tests__/deck-overview-actions.test.tsx`
- `app/web/src/components/__tests__/deck-overview.test.tsx`
- `app/web/src/app/[locale]/decks/[id]/edit/page.tsx` — the editor, moved here.
- `app/ingest/test/deck-viewer.test.ts` — Testcontainers test for the new query.

**Modify:**
- `app/db/src/queries.ts` — add `getDeckForViewer`.
- `app/db/src/index.ts` — export `getDeckForViewer` from the barrel.
- `app/web/src/lib/deck-actions.ts` — relax `duplicateDeckAction` to allow public decks.
- `app/web/src/components/deck-panel.tsx` — add a `readOnly` prop.
- `app/web/src/app/[locale]/decks/[id]/page.tsx` — replace editor with the overview page.
- `app/web/src/components/deck-list.tsx` — add an "Edit" dropdown item.
- `app/web/messages/en.json` + `de.json` — new `decks.overview.*` keys and `decks.list.actions.edit`.

**Access model recap (drives the tasks):**

| Route | Owner | Non-owner, public | Non-owner, private / guest |
|---|---|---|---|
| `/decks/[id]` (overview) | ✓ | ✓ | `notFound()` |
| `/decks/[id]/edit` (editor) | ✓ | `notFound()` | `notFound()` |

---

## Task 1: i18n strings for the overview

**Files:**
- Modify: `app/web/messages/en.json`
- Modify: `app/web/messages/de.json`

**Interfaces:**
- Produces: keys `decks.overview.{backToDecks,edit,publish,published,unpublish,copyLink,linkCopied,duplicate,viewList,viewGallery,cardCount,updatedAt}` and `decks.list.actions.edit`, consumed by Tasks 5–11.

- [ ] **Step 1: Add the `overview` block to `en.json`**

Inside the `decks` object in `app/web/messages/en.json`, add a new `"overview"` key (e.g. right after the existing `"export"` block):

```json
  "overview": {
    "backToDecks": "Back to My Decks",
    "edit": "Edit",
    "publish": "Publish",
    "published": "Published",
    "unpublish": "Unpublish",
    "copyLink": "Copy link",
    "linkCopied": "Link copied to clipboard.",
    "duplicate": "Duplicate → editor",
    "viewList": "List",
    "viewGallery": "Gallery",
    "cardCount": "{count} cards",
    "updatedAt": "Updated {date}"
  },
```

- [ ] **Step 2: Add `edit` to `decks.list.actions` in `en.json`**

In the existing `"list": { "actions": { ... } }` object, add after `"open"`:

```json
      "edit": "Edit",
```

- [ ] **Step 3: Mirror both additions in `de.json`**

Add the same keys to `app/web/messages/de.json` with German copy:

```json
  "overview": {
    "backToDecks": "Zurück zu meinen Decks",
    "edit": "Bearbeiten",
    "publish": "Veröffentlichen",
    "published": "Veröffentlicht",
    "unpublish": "Zurückziehen",
    "copyLink": "Link kopieren",
    "linkCopied": "Link in die Zwischenablage kopiert.",
    "duplicate": "Duplizieren → Editor",
    "viewList": "Liste",
    "viewGallery": "Galerie",
    "cardCount": "{count} Karten",
    "updatedAt": "Aktualisiert {date}"
  },
```

and in `de.json`'s `list.actions`, after `"open"`:

```json
      "edit": "Bearbeiten",
```

- [ ] **Step 4: Verify JSON parses and keys match**

Run: `cd app && node -e "const a=require('./web/messages/en.json'),b=require('./web/messages/de.json');const keys=o=>Object.keys(o.decks.overview).sort().join(',');if(keys(a)!==keys(b))throw new Error('overview keys differ');console.log('ok',keys(a))"`
Expected: `ok backToDecks,cardCount,copyLink,duplicate,edit,linkCopied,publish,published,unpublish,updatedAt,viewGallery,viewList`

- [ ] **Step 5: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json
git commit -m "i18n(decks): add deck overview strings (en, de)"
```

---

## Task 2: `deck-stats` derivation helper

Pure function that turns the deck's `DeckCardView[]` into the props `LegalitySeal` and `LessonCurve` need — mirrors `deck-builder.tsx` exactly, but testable without React.

**Files:**
- Create: `app/web/src/lib/deck-stats.ts`
- Test: `app/web/src/lib/__tests__/deck-stats.test.ts`

**Interfaces:**
- Consumes: `evaluateDeck(entries, format, meta)` from `@revelio/core` — returns `{ status: DeckStatus; violations: Violation[] }`; `DeckCardView`, `DeckFormat`, `DeckStatus`, `Violation` types from `@revelio/core`.
- Produces: `deckStats(views: DeckCardView[], format: DeckFormat): { status: DeckStatus; violations: Violation[]; mainEntries: DeckCardView[]; mainCount: number }`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/deck-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { deckStats } from '../deck-stats'

function view(partial: Partial<DeckCardView> & Pick<DeckCardView, 'cardId' | 'zone' | 'quantity'>): DeckCardView {
  return {
    name: partial.cardId, cost: null, setCode: 'BS', number: '1', lesson: null,
    isOfficial: true, legality: null, isLesson: false, isStartingCharacter: false,
    ...partial,
  }
}

describe('deckStats', () => {
  it('separates main entries and sums main count', () => {
    const views = [
      view({ cardId: 'harry', zone: 'character', quantity: 1, isStartingCharacter: true }),
      view({ cardId: 'accio', zone: 'main', quantity: 4 }),
      view({ cardId: 'lumos', zone: 'main', quantity: 3 }),
      view({ cardId: 'side1', zone: 'sideboard', quantity: 2 }),
    ]
    const s = deckStats(views, 'revival')
    expect(s.mainEntries.map((e) => e.cardId)).toEqual(['accio', 'lumos'])
    expect(s.mainCount).toBe(7)
  })

  it('reports incomplete for an under-size main deck', () => {
    const views = [view({ cardId: 'harry', zone: 'character', quantity: 1, isStartingCharacter: true })]
    const s = deckStats(views, 'revival')
    expect(s.status).toBe('incomplete')
    expect(Array.isArray(s.violations)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -w web -- src/lib/__tests__/deck-stats.test.ts`
Expected: FAIL — cannot find module `../deck-stats`.

- [ ] **Step 3: Implement `deck-stats.ts`**

Create `app/web/src/lib/deck-stats.ts`:

```ts
import { evaluateDeck } from '@revelio/core'
import type { DeckCardView, DeckFormat, DeckStatus, Violation } from '@revelio/core'

export type DeckStats = {
  status: DeckStatus
  violations: Violation[]
  mainEntries: DeckCardView[]
  mainCount: number
}

// Mirrors deck-builder.tsx: build the meta map evaluateDeck needs, then derive
// the main-zone entries/count used by LessonCurve and LegalitySeal.
export function deckStats(views: DeckCardView[], format: DeckFormat): DeckStats {
  const meta = Object.fromEntries(
    views.map((e) => [
      e.cardId,
      { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter },
    ]),
  )
  const { status, violations } = evaluateDeck(
    views.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
    format,
    meta,
  )
  const mainEntries = views.filter((e) => e.zone === 'main')
  const mainCount = mainEntries.reduce((n, e) => n + e.quantity, 0)
  return { status, violations, mainEntries, mainCount }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm test -w web -- src/lib/__tests__/deck-stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/deck-stats.ts app/web/src/lib/__tests__/deck-stats.test.ts
git commit -m "feat(web): add deckStats helper for overview legality/curve"
```

---

## Task 3: `getDeckForViewer` query

Viewer-aware read: returns the full deck only when the viewer owns it or it is public.

**Files:**
- Modify: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts`
- Test: `app/ingest/test/deck-viewer.test.ts`

**Interfaces:**
- Consumes: existing `getDeck(db, id): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null>`.
- Produces: `getDeckForViewer(db: DB, id: string, viewerId: string | null): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null>` — same shape as `getDeck`, `null` when not viewable.

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/deck-viewer.test.ts` (mirrors `app/ingest/test/deck-write.test.ts` setup):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import { createDeck, getDeckForViewer, updateDeckMeta, user, sets, cards } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let deckId: string

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values([
    { id: 'owner', name: 'Owner', email: 'o@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'other', name: 'Other', email: 'x@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ])
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 1 }])
  await ctx.db.insert(cards).values([{ id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry Potter', defaultLanguage: 'en' }])
  deckId = await createDeck(ctx.db, 'owner', {
    name: 'Private Deck', format: 'revival', visibility: 'private',
    cards: [{ cardId: 'bs-harry', zone: 'character', quantity: 1 }],
  })
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('getDeckForViewer', () => {
  it('returns the deck to its owner even when private', async () => {
    const res = await getDeckForViewer(ctx.db, deckId, 'owner')
    expect(res?.deck.name).toBe('Private Deck')
  })

  it('hides a private deck from a non-owner', async () => {
    expect(await getDeckForViewer(ctx.db, deckId, 'other')).toBeNull()
  })

  it('hides a private deck from a guest (null viewer)', async () => {
    expect(await getDeckForViewer(ctx.db, deckId, null)).toBeNull()
  })

  it('shows a public deck to a non-owner and a guest', async () => {
    await updateDeckMeta(ctx.db, deckId, { visibility: 'public' })
    expect((await getDeckForViewer(ctx.db, deckId, 'other'))?.deck.visibility).toBe('public')
    expect((await getDeckForViewer(ctx.db, deckId, null))?.deck.name).toBe('Private Deck')
  })

  it('returns null for a missing id', async () => {
    expect(await getDeckForViewer(ctx.db, 'nope', 'owner')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -w @revelio/ingest -- test/deck-viewer.test.ts`
Expected: FAIL — `getDeckForViewer` is not exported from `@revelio/db`.
(Requires Docker for Testcontainers, or `TEST_DATABASE_URL` set — same as the existing `deck-write.test.ts`.)

- [ ] **Step 3: Add `getDeckForViewer` to `queries.ts`**

In `app/db/src/queries.ts`, immediately after the `getDeck` function, add:

```ts
// Viewer-aware read for the public overview page: the owner always sees their
// deck; everyone else (including guests, viewerId=null) only sees it when it is
// public. Returning null for a private deck a viewer can't see means the route
// 404s and can't be used to probe another user's deck IDs.
export async function getDeckForViewer(
  db: DB, id: string, viewerId: string | null,
): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null> {
  const res = await getDeck(db, id)
  if (!res) return null
  const isOwner = res.userId === viewerId
  if (!isOwner && res.deck.visibility !== 'public') return null
  return res
}
```

- [ ] **Step 4: Export it from the barrel**

In `app/db/src/index.ts`, add `getDeckForViewer` to the named export list from `./queries` (the line that already lists `getDeck`, `listDecksByUser`, etc.):

```ts
export { getCardById, listSets, getSetByCode, getSetForEdit, getRandomCardId, upsertLocalization, setLocalizationImage, getCardIndexData, saveRulings, listRulingSources, getSubTypeLabels, listSubTypesWithTranslations, saveSubTypeTranslations, createSet, updateSet, deleteSet, setSymbolFile, listDecksByUser, getDeck, getDeckForViewer, createDeck, updateDeck, updateDeckMeta, deleteDeck, resolveCardsByName, getCardViews } from './queries'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npm test -w @revelio/ingest -- test/deck-viewer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/deck-viewer.test.ts
git commit -m "feat(db): add getDeckForViewer for public deck overview"
```

---

## Task 4: Allow duplicating a public deck

Today `duplicateDeckAction` refuses any deck the caller doesn't own. The overview's "Duplicate → editor" must work for a logged-in viewer of someone else's **public** deck.

**Files:**
- Modify: `app/web/src/lib/deck-actions.ts`

**Interfaces:**
- Produces: `duplicateDeckAction(id: string): Promise<DeckActionResult>` (`{ ok: true; id } | { ok: false; error }`) — now succeeds when the deck is the caller's **or** public.

- [ ] **Step 1: Relax the ownership guard**

In `app/web/src/lib/deck-actions.ts`, in `duplicateDeckAction`, replace the ownership check:

```ts
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
```

with a check that also permits public decks:

```ts
  // Owners can duplicate their own decks; anyone logged in can duplicate a
  // public deck into their own account (the copy is theirs, private by default).
  if (existing.userId !== userId && existing.deck.visibility !== 'public') {
    return { ok: false, error: 'forbidden' }
  }
```

- [ ] **Step 2: Make the copy private by default**

Still in `duplicateDeckAction`, change the `createDeck` call so a copied public deck doesn't stay public under the new owner:

```ts
  const { deck } = existing
  const newId = await createDeck(getDb(), userId, {
    name: `${deck.name} (copy)`, format: deck.format, visibility: 'private', cards: deck.cards,
  })
```

(For an owner duplicating their own private deck this is unchanged behaviour; for a public deck it makes the copy private, which is the safe default.)

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/web/src/lib/deck-actions.ts
git commit -m "feat(web): allow duplicating a public deck into your account"
```

> Note: this server action needs auth/session + `next/cache`, so it isn't unit-tested in isolation; it's exercised end-to-end in Task 12's manual verification.

---

## Task 5: Read-only mode for `DeckPanel`

Add a `readOnly` prop that swaps the quantity steppers for a static `N×` label. Also create the shared intl render helper here (first RTL test).

**Files:**
- Modify: `app/web/src/components/deck-panel.tsx`
- Create: `app/web/src/test/intl.tsx`
- Test: `app/web/src/components/__tests__/deck-panel-readonly.test.tsx`

**Interfaces:**
- Produces: `DeckPanel` now accepts `readOnly?: boolean` (default `false`) and `onQuantityChange?` (now optional). When `readOnly`, no stepper buttons render.
- Produces: `renderWithIntl(ui)` test helper.

- [ ] **Step 1: Create the intl render helper**

Create `app/web/src/test/intl.tsx`:

```tsx
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../messages/en.json'

export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/__tests__/deck-panel-readonly.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck-panel'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
  }
}

describe('DeckPanel readOnly', () => {
  const entries = [view('harry', 'character', 1), view('accio', 'main', 4)]

  it('renders quantities without stepper buttons when readOnly', () => {
    renderWithIntl(<DeckPanel entries={entries} readOnly />)
    expect(screen.getByText('4×')).toBeInTheDocument()
    expect(screen.queryByLabelText('Increase accio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease accio')).not.toBeInTheDocument()
  })

  it('renders stepper buttons when not readOnly', () => {
    renderWithIntl(<DeckPanel entries={entries} onQuantityChange={() => {}} />)
    expect(screen.getByLabelText('Increase accio')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-panel-readonly.test.tsx`
Expected: FAIL — `readOnly` not supported; `4×` text not found.

- [ ] **Step 4: Add the `readOnly` prop**

In `app/web/src/components/deck-panel.tsx`, update the signature:

```tsx
export function DeckPanel({
  entries,
  onQuantityChange,
  readOnly = false,
}: {
  entries: DeckCardView[]
  onQuantityChange?: (cardId: string, zone: DeckZone, qty: number) => void
  readOnly?: boolean
}) {
```

Then, inside the `row()` helper, replace the stepper `<span>` (the element containing the two `<button>`s) with a `readOnly` branch:

```tsx
        {readOnly ? (
          <b className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{e.quantity}×</b>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label={t('panel.decrease', { name: e.name })}
              className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity - 1)}
            >
              <Minus className="size-3" />
            </button>
            <b className="min-w-4 text-center text-xs tabular-nums">{e.quantity}</b>
            <button
              type="button"
              aria-label={t('panel.increase', { name: e.name })}
              className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity + 1)}
            >
              <Plus className="size-3" />
            </button>
          </span>
        )}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-panel-readonly.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/deck-panel.tsx app/web/src/test/intl.tsx app/web/src/components/__tests__/deck-panel-readonly.test.tsx
git commit -m "feat(web): add read-only mode to DeckPanel"
```

---

## Task 6: `DeckGallery` component

Read-only card-art grid: character first, then main, then sideboard, each tile with a quantity badge and a name fallback when the image is missing.

**Files:**
- Create: `app/web/src/components/deck-gallery.tsx`
- Test: `app/web/src/components/__tests__/deck-gallery.test.tsx`

**Interfaces:**
- Consumes: `imageUrl(base, key)` and `thumbKey(id, lang?, defaultLang?)` from `@revelio/core`; `DeckCardView`.
- Produces: `DeckGallery({ entries: DeckCardView[]; imageBase: string })`.

> Image note: `DeckCardView` carries no per-card image language, so the gallery uses the default-language thumbnail `thumbKey(cardId)` → `cards/thumb/<id>.webp`. A per-tile `onError` falls back to the card name.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/deck-gallery.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckGallery } from '@/components/deck-gallery'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
  }
}

describe('DeckGallery', () => {
  it('renders a tile per card with a quantity badge', () => {
    const entries = [
      view('harry', 'character', 1),
      view('accio', 'main', 4),
      view('side1', 'sideboard', 2),
    ]
    renderWithIntl(<DeckGallery entries={entries} imageBase="https://img.example" />)
    expect(screen.getByAltText('accio')).toBeInTheDocument()
    expect(screen.getByText('4×')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByText('1×')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-gallery.test.tsx`
Expected: FAIL — cannot find module `deck-gallery`.

- [ ] **Step 3: Implement `deck-gallery.tsx`**

Create `app/web/src/components/deck-gallery.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView } from '@revelio/core'

function GalleryTile({ entry, imageBase }: { entry: DeckCardView; imageBase: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="relative aspect-[63/88] overflow-hidden rounded-lg border border-border bg-muted">
      {broken ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {entry.name}
        </div>
      ) : (
        <Image
          src={imageUrl(imageBase, thumbKey(entry.cardId))}
          alt={entry.name}
          fill
          sizes="(max-width: 640px) 30vw, 160px"
          className="object-cover"
          onError={() => setBroken(true)}
        />
      )}
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
        {entry.quantity}×
      </span>
    </div>
  )
}

function Grid({ entries, imageBase }: { entries: DeckCardView[]; imageBase: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {entries.map((e) => (
        <GalleryTile key={`${e.zone}-${e.cardId}`} entry={e} imageBase={imageBase} />
      ))}
    </div>
  )
}

export function DeckGallery({ entries, imageBase }: { entries: DeckCardView[]; imageBase: string }) {
  const t = useTranslations('decks')
  const character = entries.filter((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')

  return (
    <div className="space-y-6">
      {character.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.character')}</h3>
          <Grid entries={character} imageBase={imageBase} />
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.main')}</h3>
        {main.length === 0
          ? <p className="text-sm text-muted-foreground">{t('panel.emptyMain')}</p>
          : <Grid entries={main} imageBase={imageBase} />}
      </section>
      {sideboard.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.sideboard')}</h3>
          <Grid entries={sideboard} imageBase={imageBase} />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-gallery.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/deck-gallery.tsx app/web/src/components/__tests__/deck-gallery.test.tsx
git commit -m "feat(web): add read-only DeckGallery grid"
```

---

## Task 7: `DeckOverviewActions` component

The action bar: Edit (owner), Publish/Unpublish + Copy link (owner), Export (everyone), Duplicate (everyone).

**Files:**
- Create: `app/web/src/components/deck-overview-actions.tsx`
- Test: `app/web/src/components/__tests__/deck-overview-actions.test.tsx`

**Interfaces:**
- Consumes: `updateDeckMetaAction(id, input)`, `duplicateDeckAction(id)` from `@/lib/deck-actions`; `saveDraft`, `BuilderState` from `@/lib/deck-model`; `DeckExportMenu`; `Link`/`useRouter` from `@/../i18n/navigation`.
- Produces: `DeckOverviewActions({ deckId, name, format, visibility, views, isOwner, loggedIn })`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/deck-overview-actions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckOverviewActions } from '@/components/deck-overview-actions'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/deck-actions', () => ({
  updateDeckMetaAction: vi.fn(async () => ({ ok: true, id: 'd1' })),
  duplicateDeckAction: vi.fn(async () => ({ ok: true, id: 'copy1' })),
}))

const views: DeckCardView[] = [
  { cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true },
]
const base = { deckId: 'd1', name: 'My Deck', format: 'revival' as const, views }

describe('DeckOverviewActions visibility', () => {
  it('owner of a private deck sees Edit, Publish, Export, Duplicate', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="private" isOwner loggedIn />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Duplicate → editor')).toBeInTheDocument()
  })

  it('owner of a public deck sees Published instead of Publish', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="public" isOwner loggedIn />)
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.queryByText('Publish')).not.toBeInTheDocument()
  })

  it('non-owner viewer sees only Export and Duplicate', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="public" isOwner={false} loggedIn />)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Publish')).not.toBeInTheDocument()
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Duplicate → editor')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-overview-actions.test.tsx`
Expected: FAIL — cannot find module `deck-overview-actions`.

- [ ] **Step 3: Implement `deck-overview-actions.tsx`**

Create `app/web/src/components/deck-overview-actions.tsx`:

```tsx
'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, Copy, Globe, Link2, Lock, Pencil } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { Link, useRouter } from '@/../i18n/navigation'
import { duplicateDeckAction, updateDeckMetaAction } from '@/lib/deck-actions'
import { saveDraft, type BuilderState } from '@/lib/deck-model'
import { DeckExportMenu } from '@/components/deck-export-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function DeckOverviewActions({
  deckId,
  name,
  format,
  visibility,
  views,
  isOwner,
  loggedIn,
}: {
  deckId: string
  name: string
  format: DeckFormat
  visibility: 'private' | 'public'
  views: DeckCardView[]
  isOwner: boolean
  loggedIn: boolean
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const state: BuilderState = { name, format, visibility, entries: views }

  function setVisibility(next: 'private' | 'public') {
    startTransition(async () => {
      const res = await updateDeckMetaAction(deckId, { name, visibility: next })
      if (!res.ok) toast.error(t('list.visibilityError'))
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('overview.linkCopied'))
    } catch {
      toast.error(t('export.copyError'))
    }
  }

  function duplicate() {
    if (loggedIn) {
      startTransition(async () => {
        const res = await duplicateDeckAction(deckId)
        if (res.ok) router.push(`/decks/${res.id}/edit`)
        else toast.error(t('list.duplicateError'))
      })
    } else {
      saveDraft({ name: `${name} (copy)`, format, visibility: 'private', entries: views })
      router.push('/decks/new')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOwner && (
        <Button asChild>
          <Link href={`/decks/${deckId}/edit`}>
            <Pencil className="size-4" />
            {t('overview.edit')}
          </Link>
        </Button>
      )}

      {isOwner &&
        (visibility === 'private' ? (
          <Button variant="outline" disabled={pending} onClick={() => setVisibility('public')}>
            <Globe className="size-4" />
            {t('overview.publish')}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Globe className="size-4" />
                {t('overview.published')}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                {t('overview.copyLink')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setVisibility('private')}>
                <Lock />
                {t('overview.unpublish')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

      <DeckExportMenu state={state} />

      <Button variant="outline" disabled={pending} onClick={duplicate}>
        <Copy className="size-4" />
        {t('overview.duplicate')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-overview-actions.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/deck-overview-actions.tsx app/web/src/components/__tests__/deck-overview-actions.test.tsx
git commit -m "feat(web): add DeckOverviewActions (edit/publish/export/duplicate)"
```

---

## Task 8: `DeckOverview` shell

The client shell: back link, header, action bar, stats strip, and the List↔Gallery toggle persisted to `localStorage`.

**Files:**
- Create: `app/web/src/components/deck-overview.tsx`
- Test: `app/web/src/components/__tests__/deck-overview.test.tsx`

**Interfaces:**
- Consumes: `deckStats` (Task 2); `DeckPanel` (readOnly, Task 5); `DeckGallery` (Task 6); `DeckOverviewActions` (Task 7); `LegalitySeal`, `LessonCurve`; `Link` from `@/../i18n/navigation`.
- Produces: `DeckOverview(props: DeckOverviewProps)` where
  `DeckOverviewProps = { deckId: string; name: string; format: DeckFormat; visibility: 'private'|'public'; createdAt: string; updatedAt: string; views: DeckCardView[]; isOwner: boolean; loggedIn: boolean; imageBase: string }`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/deck-overview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckOverview } from '@/components/deck-overview'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/deck-overview-actions', () => ({
  DeckOverviewActions: () => <div data-testid="actions" />,
}))
vi.mock('@/components/deck-panel', () => ({ DeckPanel: () => <div data-testid="list-view" /> }))
vi.mock('@/components/deck-gallery', () => ({ DeckGallery: () => <div data-testid="gallery-view" /> }))

const views: DeckCardView[] = [
  { cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true },
  { cardId: 'accio', zone: 'main', quantity: 4, name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: false },
]
const props = {
  deckId: 'd1', name: 'My Deck', format: 'revival' as const, visibility: 'private' as const,
  createdAt: '2026-06-30T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  views, isOwner: true, loggedIn: true, imageBase: 'https://img.example',
}

beforeEach(() => window.localStorage.clear())

describe('DeckOverview', () => {
  it('shows the deck name and defaults to the list view', () => {
    renderWithIntl(<DeckOverview {...props} />)
    expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument()
    expect(screen.getByTestId('list-view')).toBeInTheDocument()
    expect(screen.queryByTestId('gallery-view')).not.toBeInTheDocument()
  })

  it('switches to the gallery view and persists the choice', () => {
    renderWithIntl(<DeckOverview {...props} />)
    fireEvent.click(screen.getByText('Gallery'))
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument()
    expect(window.localStorage.getItem('revelio.deck.view')).toBe('gallery')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-overview.test.tsx`
Expected: FAIL — cannot find module `deck-overview`.

- [ ] **Step 3: Implement `deck-overview.tsx`**

Create `app/web/src/components/deck-overview.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, LayoutGrid, List } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { deckStats } from '@/lib/deck-stats'
import { DeckPanel } from '@/components/deck-panel'
import { DeckGallery } from '@/components/deck-gallery'
import { DeckOverviewActions } from '@/components/deck-overview-actions'
import { LegalitySeal } from '@/components/legality-seal'
import { LessonCurve } from '@/components/lesson-curve'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const VIEW_KEY = 'revelio.deck.view'
type View = 'list' | 'gallery'

export type DeckOverviewProps = {
  deckId: string
  name: string
  format: DeckFormat
  visibility: 'private' | 'public'
  createdAt: string
  updatedAt: string
  views: DeckCardView[]
  isOwner: boolean
  loggedIn: boolean
  imageBase: string
}

export function DeckOverview(props: DeckOverviewProps) {
  const { deckId, name, format, visibility, updatedAt, views, isOwner, loggedIn, imageBase } = props
  const t = useTranslations('decks')
  const locale = useLocale()
  const [view, setView] = useState<View>('list')

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    if (saved === 'list' || saved === 'gallery') setView(saved)
  }, [])

  function changeView(next: View) {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const { status, violations, mainEntries, mainCount } = deckStats(views, format)
  const totalCards = views.reduce((n, e) => n + e.quantity, 0)
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(updatedAt))

  return (
    <div className="space-y-4">
      <Link
        href="/decks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('overview.backToDecks')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`format.${format}`)} · {t('overview.cardCount', { count: totalCards })} ·{' '}
            {t('overview.updatedAt', { date: updated })}
          </p>
        </div>
        <Badge variant={visibility === 'public' ? 'default' : 'secondary'}>
          {t(`list.visibility.${visibility}`)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DeckOverviewActions
          deckId={deckId}
          name={name}
          format={format}
          visibility={visibility}
          views={views}
          isOwner={isOwner}
          loggedIn={loggedIn}
        />
        <div className="inline-flex rounded-md border border-border p-0.5">
          <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => changeView('list')}>
            <List className="size-4" />
            {t('overview.viewList')}
          </Button>
          <Button size="sm" variant={view === 'gallery' ? 'secondary' : 'ghost'} onClick={() => changeView('gallery')}>
            <LayoutGrid className="size-4" />
            {t('overview.viewGallery')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <LegalitySeal status={status} mainCount={mainCount} violations={violations} />
        <div className="min-w-[220px] flex-1">
          <LessonCurve entries={mainEntries} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {view === 'list' ? (
          <DeckPanel entries={views} readOnly />
        ) : (
          <div className="p-4">
            <DeckGallery entries={views} imageBase={imageBase} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/deck-overview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/deck-overview.tsx app/web/src/components/__tests__/deck-overview.test.tsx
git commit -m "feat(web): add DeckOverview shell with List/Gallery toggle"
```

---

## Task 9: Move the editor to `/decks/[id]/edit`

Create the new editor route with the **current** `[id]/page.tsx` content (the overview replaces `[id]/page.tsx` in Task 10).

**Files:**
- Create: `app/web/src/app/[locale]/decks/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `getDeck`, `listSets`, `DeckBuilder`, `getSession`, `BuilderState`, `getDb`.
- Produces: an owner-only editor page at `/decks/[id]/edit`.

- [ ] **Step 1: Create the edit route**

Create `app/web/src/app/[locale]/decks/[id]/edit/page.tsx` with the current editor content (this is the verbatim body of today's `[id]/page.tsx`):

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDeck, listSets } from '@revelio/db'
import type { BuilderState } from '@/lib/deck-model'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { DeckBuilder } from '@/components/deck-builder'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, existing, t] = await Promise.all([
    getSession(),
    getDeck(getDb(), id),
    getTranslations('decks'),
  ])
  const isOwner = !!existing && existing.userId === session?.user?.id
  return { title: isOwner ? existing.deck.name : t('title') }
}

export default async function EditDeckPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, existing, sets] = await Promise.all([
    getSession(),
    getDeck(getDb(), id),
    listSets(getDb(), locale),
  ])

  // Owner-only: a missing deck and a deck owned by someone else both 404, so
  // the response can't be used to probe for another user's deck IDs.
  if (!existing || existing.userId !== session?.user?.id) notFound()

  const state: BuilderState = {
    name: existing.deck.name,
    format: existing.deck.format,
    visibility: existing.deck.visibility,
    entries: existing.views,
  }

  return (
    <main className="mx-auto max-w-[2100px] px-6 py-6">
      <DeckBuilder initial={state} deckId={id} loggedIn sets={sets} imageBase={IMAGE_BASE} />
    </main>
  )
}
```

- [ ] **Step 2: Verify the editor renders at the new URL**

Run: `cd app && npm run typecheck`
Expected: no errors.
(End-to-end navigation is verified in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add app/web/src/app/[locale]/decks/[id]/edit/page.tsx
git commit -m "feat(web): move deck editor to /decks/[id]/edit"
```

---

## Task 10: Overview page at `/decks/[id]`

Replace the editor page body with the viewer-aware overview.

**Files:**
- Modify: `app/web/src/app/[locale]/decks/[id]/page.tsx`

**Interfaces:**
- Consumes: `getDeckForViewer` (Task 3), `DeckOverview` (Task 8), `getSession`, `getDb`.

- [ ] **Step 1: Replace the file contents**

Overwrite `app/web/src/app/[locale]/decks/[id]/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDeckForViewer } from '@revelio/db'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { DeckOverview } from '@/components/deck-overview'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, t] = await Promise.all([getSession(), getTranslations('decks')])
  // getDeckForViewer returns null for a deck this viewer can't see, so a private
  // deck's name never leaks into the title for a non-owner.
  const existing = await getDeckForViewer(getDb(), id, session?.user?.id ?? null)
  return { title: existing ? existing.deck.name : t('title') }
}

export default async function DeckOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  const viewerId = session?.user?.id ?? null
  const existing = await getDeckForViewer(getDb(), id, viewerId)
  if (!existing) notFound()

  return (
    <main className="mx-auto max-w-[2100px] px-6 py-6">
      <DeckOverview
        deckId={id}
        name={existing.deck.name}
        format={existing.deck.format}
        visibility={existing.deck.visibility}
        createdAt={existing.deck.createdAt}
        updatedAt={existing.deck.updatedAt}
        views={existing.views}
        isOwner={existing.userId === viewerId}
        loggedIn={!!session?.user}
        imageBase={IMAGE_BASE}
      />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/web/src/app/[locale]/decks/[id]/page.tsx
git commit -m "feat(web): serve deck overview at /decks/[id]"
```

---

## Task 11: Add an "Edit" item to the deck list menu

The deck tile now links to the overview (unchanged URL `/decks/[id]`, which is now the overview). Add an explicit "Edit" item to the ⋯ menu that jumps straight to the editor.

**Files:**
- Modify: `app/web/src/components/deck-list.tsx`

- [ ] **Step 1: Add the Edit menu item**

In `app/web/src/components/deck-list.tsx`, inside `DropdownMenuContent`, add an Edit item right after the existing "Open" item:

```tsx
                    <DropdownMenuItem asChild>
                      <Link href={`/decks/${deck.id}`}>{t('list.actions.open')}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/decks/${deck.id}/edit`}>
                        <Pencil />
                        {t('list.actions.edit')}
                      </Link>
                    </DropdownMenuItem>
```

(`Pencil` is already imported in this file for the Rename item.)

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/web/src/components/deck-list.tsx
git commit -m "feat(web): add Edit action to deck list menu"
```

---

## Task 12: Full verification & manual run

**Files:** none (verification only).

- [ ] **Step 1: Lint the web workspace**

Run: `cd app && npm run lint -w web`
Expected: no new errors (pre-existing warnings unrelated to these files are acceptable).

- [ ] **Step 2: Typecheck all workspaces**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd app && npm test`
Expected: PASS, including `deck-stats`, `deck-viewer`, `deck-panel-readonly`, `deck-gallery`, `deck-overview-actions`, `deck-overview`.
(The `deck-viewer` Testcontainers test needs Docker or `TEST_DATABASE_URL`.)

- [ ] **Step 4: Production build**

Run: `cd app && npm run build -w web`
Expected: build succeeds; `/decks/[id]` and `/decks/[id]/edit` both compile.

- [ ] **Step 5: Manual smoke test (use the `verify` or `run` skill to drive the app)**

Start infra + dev server (`docker compose up`, `npm run dev -w web`) and confirm:
  1. As the owner, `/decks` → clicking a deck lands on the **overview** (not the editor).
  2. Overview **Edit** → `/decks/[id]/edit` opens the builder.
  3. **Publish** flips the badge to Public; the button becomes **Published** with **Copy link** + **Unpublish**.
  4. Open the same `/decks/[id]` in a logged-out browser: private → 404; after publishing → read-only overview with only **Export** and **Duplicate → editor**.
  5. **List ↔ Gallery** toggle swaps the card region and survives a reload (localStorage).
  6. **Duplicate → editor**: logged-in → new deck opens in the editor; logged-out → builder opens at `/decks/new` pre-filled with the deck.
  7. **Export** menu produces text/JSON/PNG.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(web): deck overview verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** routing move (Tasks 9–10), viewer access + `getDeckForViewer` (Task 3), Layout B shell + character-first + stats strip (Task 8), List/Gallery toggle + persistence (Tasks 5/6/8), Publish/Copy link/Unpublish (Task 7), Export reuse (Task 7), Duplicate for owner/guest/public-viewer (Tasks 4/7), i18n en+de (Task 1), tests (Tasks 2,3,5,6,7,8,12), deck-list linking (Task 11). All spec sections map to a task.
- **Deviation from spec (intentional, YAGNI):** the stats strip ships with `LegalitySeal` + `LessonCurve` only; the standalone per-lesson breakdown widget from the spec mockup is deferred (it would be a new bespoke component reusing unverified `lessonColor` internals). Note this to the user.
- **Deviation:** duplicated public decks are made **private** under the new owner (safer default than inheriting `public`); `duplicateDeckAction` change in Task 4.
- **Type consistency:** `DeckOverviewProps`, `deckStats` return shape, and the `views: DeckCardView[]` flow are consistent across Tasks 2/7/8/10. Zone values `'character'|'main'|'sideboard'` used uniformly.

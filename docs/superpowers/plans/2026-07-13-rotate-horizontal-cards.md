# Rotate Horizontal Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users stand horizontal cards upright — via a hover rotate button in every card list (floating the rotated card over its neighbors) and by default on the single-card detail page.

**Architecture:** Card images are all stored as portrait 745×1040 files; a "horizontal" card is a landscape card whose art is rotated 90° to fit that canvas, so standing it upright is a lossless CSS `rotate(90deg)` inside a landscape frame. We propagate the existing `orientation` field into the search document (the source lists render from), add two small components — `CardImage` (frame + optional upright rotation) and `CardRotate` (client hover-button + portal overlay) — and wire them into the four render surfaces.

**Tech Stack:** Next.js 16 App Router / React 19, TypeScript, Tailwind v4, next-intl, Meilisearch (`@revelio/search`), Drizzle/Postgres (`@revelio/db`), Vitest + @testing-library/react.

## Global Constraints

- All commands run from `app/` (npm workspaces root). There is no root `package.json`.
- Dependency direction is strict: `core ← {search, db} ← {ingest, web}`. Never import "up".
- Conventional Commits for every commit.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Do **not** touch `db/drizzle/` — no schema/migration changes in this plan (the `orientation` column already exists in `db/src/schema.ts`).
- `orientation` values in the data are the strings `'horizontal'` and `'vertical'`; treat anything that is not exactly `'horizontal'` as portrait.
- Locales are `['en', 'de']` — any new i18n key must be added to **both** `web/messages/en.json` and `web/messages/de.json`.
- Rotation direction (`rotate-90` vs `-rotate-90`) and exact overlay sizing are tuned by visual verification during implementation; the values below are the starting point.

---

## File Structure

- `app/search/src/documents.ts` — add `orientation` to `SearchDocument`, `CardIndexData`, and `buildCardDocument`. **(Task 1)**
- `app/db/src/queries.ts` — `getCardIndexData` supplies `orientation`; `cardViewMetaByIds`/`getDeck` supply `orientation` on deck views. **(Task 1, Task 7)**
- `app/ingest/src/build-documents.ts` — pass `orientation` through the `CardIndexData` map. **(Task 1)**
- `app/web/src/components/card-image.tsx` — **NEW.** Presentational card image; renders portrait normally, or a rotated landscape frame when `upright` and horizontal. Exports `isHorizontal`. **(Task 2)**
- `app/web/src/components/card-detail.tsx` — use `CardImage upright` for the hero image. **(Task 3)**
- `app/web/src/components/card-rotate.tsx` — **NEW.** Client. Renders (for horizontal cards) a hover rotate button + a portal overlay showing the upright card floating over the grid. **(Task 4)**
- `app/web/src/components/card-tile.tsx` — mount `CardRotate` in the search/set grid tile. **(Task 5)**
- `app/web/src/components/deck-card-browser.tsx` — mount `CardRotate` in the deck-builder browser tile. **(Task 6)**
- `app/core/src/domain.ts` — add optional `orientation` to `DeckCardView`. **(Task 7)**
- `app/web/src/components/deck-gallery.tsx` — mount `CardRotate` in the deck gallery tile. **(Task 7)**
- `app/web/messages/{en,de}.json` — `card.rotate` / `card.rotateBack` aria labels. **(Task 4)**

---

### Task 1: Propagate `orientation` into the search document

**Files:**
- Modify: `app/search/src/documents.ts` (`SearchDocument` ~L4-22, `CardIndexData` ~L62-77, `buildCardDocument` ~L79-100)
- Modify: `app/db/src/queries.ts` (`getCardIndexData` ~L257-286)
- Modify: `app/ingest/src/build-documents.ts` (the `dataByCard` map ~L41-67)
- Modify: `app/web/src/components/__tests__/card-grid.test.tsx` (the `hit` fixture) — add `orientation`
- Test: `app/search/test/documents.test.ts`

**Interfaces:**
- Produces: `SearchDocument.orientation: string | null`, `CardIndexData.orientation: string | null`. `buildCardDocument(d, lang)` copies `d.orientation` onto the returned document. Consumed by Tasks 5, 6.

- [ ] **Step 1: Write the failing test**

Add to `app/search/test/documents.test.ts`:

```ts
it('carries orientation onto the built document', () => {
  const data = {
    id: 'bs-1', setCode: 'BS', number: '1', name: 'Harry',
    lesson: null, rarity: null, finish: null, legality: null, cost: null,
    isOfficial: true, types: ['character'], subTypes: [], defaultLanguage: 'en',
    orientation: 'horizontal',
    localizations: { en: { name: 'Harry', text: null, flavorText: null, imageFile: null } },
  }
  const doc = buildCardDocument(data, 'en')
  expect(doc.orientation).toBe('horizontal')
})
```

Ensure the file imports `buildCardDocument` (mirror the existing imports at the top of `documents.test.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/search -- -t "carries orientation"`
Expected: FAIL — `data.orientation` is not a valid `CardIndexData` field / `doc.orientation` is `undefined`.

- [ ] **Step 3: Implement**

In `app/search/src/documents.ts`:

Add to the `SearchDocument` type (after `defaultLanguage: string`):
```ts
  orientation: string | null
```

Add to the `CardIndexData` type (after `defaultLanguage: string`):
```ts
  orientation: string | null
```

In `buildCardDocument`, add to the returned object (after `defaultLanguage: d.defaultLanguage,`):
```ts
    orientation: d.orientation,
```

In `app/db/src/queries.ts` `getCardIndexData`, add to the returned object (after `defaultLanguage: card.defaultLanguage,`):
```ts
    orientation: card.orientation,
```

In `app/ingest/src/build-documents.ts`, add to the object returned from the `allCards.map` (after `defaultLanguage: c.defaultLanguage,`):
```ts
      orientation: c.orientation,
```

In `app/web/src/components/__tests__/card-grid.test.tsx`, add `orientation: null,` to the object returned by the `hit` helper (keeps the fixture assignable to the widened `SearchDocument`).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -w @revelio/search -- -t "carries orientation"`
Expected: PASS
Run: `npm run typecheck`
Expected: PASS (no callers of `CardIndexData`/`SearchDocument` left without `orientation`).

- [ ] **Step 5: Commit**

```bash
git add app/search/src/documents.ts app/db/src/queries.ts app/ingest/src/build-documents.ts app/search/test/documents.test.ts app/web/src/components/__tests__/card-grid.test.tsx
git commit -m "feat(search): carry card orientation into the search document"
```

> **Note:** existing indexed documents gain `orientation` only after a reindex. Editor saves reindex per card automatically (`reindexCard`); a full backfill happens on the next ingest run. No index-settings change is needed (orientation is displayed, not filtered/sorted).

---

### Task 2: `CardImage` presentational component

**Files:**
- Create: `app/web/src/components/card-image.tsx`
- Test: `app/web/src/components/__tests__/card-image.test.tsx`

**Interfaces:**
- Produces:
  - `isHorizontal(orientation?: string | null): boolean` — `orientation === 'horizontal'`.
  - `CardImage(props: { src: string; alt: string; orientation?: string | null; upright?: boolean; sizes?: string; priority?: boolean; frameClassName?: string })` — renders a `relative` frame containing a `next/image` with `fill`. When `upright && isHorizontal(orientation)` the frame is landscape (`aspect-[7/5]`) and the image is rotated to fill it; otherwise the frame is portrait (`aspect-[5/7]`). Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/card-image.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardImage, isHorizontal } from '../card-image'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

describe('isHorizontal', () => {
  it('is true only for the exact horizontal string', () => {
    expect(isHorizontal('horizontal')).toBe(true)
    expect(isHorizontal('vertical')).toBe(false)
    expect(isHorizontal(null)).toBe(false)
    expect(isHorizontal(undefined)).toBe(false)
  })
})

describe('CardImage', () => {
  it('renders a portrait frame by default', () => {
    const { container } = render(<CardImage src="s" alt="Fluffy" orientation="horizontal" />)
    expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
    expect(container.querySelector('.aspect-\\[7\\/5\\]')).toBeNull()
    expect(screen.getByAltText('Fluffy')).toBeInTheDocument()
  })

  it('renders an upright landscape frame for a horizontal card when upright', () => {
    const { container } = render(<CardImage src="s" alt="Fluffy" orientation="horizontal" upright />)
    expect(container.querySelector('.aspect-\\[7\\/5\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).not.toBeNull()
  })

  it('ignores upright for a vertical card', () => {
    const { container } = render(<CardImage src="s" alt="Wand" orientation="vertical" upright />)
    expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/card-image.test.tsx`
Expected: FAIL — module `../card-image` not found.

- [ ] **Step 3: Implement**

Create `app/web/src/components/card-image.tsx`:

```tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

export function isHorizontal(orientation?: string | null): boolean {
  return orientation === 'horizontal'
}

// Card faces are stored as portrait 745×1040 files; a "horizontal" card is a
// landscape card rotated 90° to fit that canvas. When `upright` is requested for
// such a card we render a landscape frame and rotate the image back to fill it.
// The inner box is the portrait footprint (5:7): sized to 71.43% × 140% of the
// landscape frame so a 90° rotation lands exactly on the frame's edges.
export function CardImage({
  src, alt, orientation, upright = false, sizes, priority = false, frameClassName,
}: {
  src: string
  alt: string
  orientation?: string | null
  upright?: boolean
  sizes?: string
  priority?: boolean
  frameClassName?: string
}) {
  if (upright && isHorizontal(orientation)) {
    return (
      <div className={cn('relative aspect-[7/5] overflow-hidden', frameClassName)}>
        <div className="absolute top-1/2 left-1/2 h-[140%] w-[71.4286%] -translate-x-1/2 -translate-y-1/2 rotate-90">
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
        </div>
      </div>
    )
  }
  return (
    <div className={cn('relative aspect-[5/7] overflow-hidden', frameClassName)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/card-image.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/card-image.tsx app/web/src/components/__tests__/card-image.test.tsx
git commit -m "feat(web): add CardImage with upright rotation for horizontal cards"
```

---

### Task 3: Show horizontal cards upright on the detail page

**Files:**
- Modify: `app/web/src/components/card-detail.tsx` (image block ~L38-53, imports L1/L7)
- Test: `app/web/src/components/__tests__/card-detail.test.tsx`

**Interfaces:**
- Consumes: `CardImage` from Task 2. `card.orientation` already exists on `CardDetailDTO`.

- [ ] **Step 1: Write the failing test**

Add to `app/web/src/components/__tests__/card-detail.test.tsx` (inside `describe('CardDetail', ...)`):

```tsx
it('renders a horizontal card upright (landscape frame)', () => {
  const horizontal = { ...card, orientation: 'horizontal' as const,
    localizations: { ...card.localizations,
      en: { ...card.localizations.en, imageFile: 'bs-1-fluffy.webp' } } }
  const { container } = render(<CardDetail card={horizontal} locale="en" imageBase="http://img" />, { wrapper: Wrapper })
  expect(container.querySelector('.aspect-\\[7\\/5\\]')).not.toBeNull()
  expect(container.querySelector('.rotate-90')).not.toBeNull()
})

it('renders a vertical card in a portrait frame', () => {
  const vertical = { ...card,
    localizations: { ...card.localizations,
      en: { ...card.localizations.en, imageFile: 'bs-1-fluffy.webp' } } }
  const { container } = render(<CardDetail card={vertical} locale="en" imageBase="http://img" />, { wrapper: Wrapper })
  expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
  expect(container.querySelector('.rotate-90')).toBeNull()
})
```

(The `imageFile` override makes `effectiveImageLang` resolve so the image branch renders instead of the name-fallback.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/card-detail.test.tsx -t "upright"`
Expected: FAIL — no `.aspect-[7/5]` / `.rotate-90` in output (still the old portrait `<div>`).

- [ ] **Step 3: Implement**

In `app/web/src/components/card-detail.tsx`:

Add the import (near the other `@/components` imports):
```tsx
import { CardImage } from '@/components/card-image'
```

Replace the hero image block (currently the `<div className="relative aspect-[5/7] overflow-hidden rounded-xl border border-border/60 bg-card">…</div>`, ~L38-53) with:

```tsx
      {imgLang ? (
        <CardImage
          src={imageUrl(imageBase, imageKey(card.id, imgLang, card.defaultLanguage))}
          alt={loc.name}
          orientation={card.orientation}
          upright
          sizes="340px"
          priority
          frameClassName="rounded-xl border border-border/60 bg-card"
        />
      ) : (
        <div className="relative flex aspect-[5/7] items-center justify-center rounded-xl border border-border/60 bg-card p-4 text-center text-sm text-muted-foreground">
          {loc.name}
        </div>
      )}
```

`Image` may now be an unused import — remove `import Image from 'next/image'` if nothing else in the file uses it (typecheck/lint will tell you).

- [ ] **Step 4: Run tests + lint**

Run: `npm test -w web -- src/components/__tests__/card-detail.test.tsx`
Expected: PASS (new cases + existing cases)
Run: `npm run lint -w web`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/card-detail.tsx app/web/src/components/__tests__/card-detail.test.tsx
git commit -m "feat(web): show horizontal cards upright on the detail page"
```

---

### Task 4: `CardRotate` — hover rotate button + floating upright overlay

**Files:**
- Create: `app/web/src/components/card-rotate.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (`card.rotate`, `card.rotateBack`)
- Test: `app/web/src/components/__tests__/card-rotate.test.tsx`

**Interfaces:**
- Produces: `CardRotate(props: { src: string; alt: string; orientation?: string | null; sizes?: string })`.
  - Renders **nothing** for non-horizontal cards.
  - For horizontal cards renders an absolutely-positioned button (`aria-label` = `card.rotate`, toggles to `card.rotateBack`, `aria-pressed`) in the top-left of its `data-card-frame` ancestor.
  - Clicking calls `preventDefault()` + `stopPropagation()` (never triggers the tile's own link/add action) and toggles a portal overlay (rendered to `document.body`) showing the upright card centered over the frame, above all tiles.
  - Overlay closes on the button again, Escape, backdrop click, or scroll/resize.
  - Consumed by Tasks 5, 6, 7. Each host tile must put `data-card-frame` (and `group`, for hover reveal) on the `relative` box that wraps its image.

- [ ] **Step 1: Add i18n keys**

In `app/web/messages/en.json`, inside the `"card"` object add:
```json
    "rotate": "Rotate upright",
    "rotateBack": "Close rotated view",
```
In `app/web/messages/de.json`, inside the `"card"` object add:
```json
    "rotate": "Aufrecht drehen",
    "rotateBack": "Gedrehte Ansicht schließen",
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/__tests__/card-rotate.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { CardRotate } from '../card-rotate'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

const messages = { card: { rotate: 'Rotate upright', rotateBack: 'Close rotated view' } }

function mount(orientation: string | null, onParentClick = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <div data-card-frame className="group relative" onClick={onParentClick}>
        <CardRotate src="http://img/bs-1.webp" alt="Dean Thomas" orientation={orientation} />
      </div>
    </NextIntlClientProvider>,
  )
}

describe('CardRotate', () => {
  it('renders no button for a vertical card', () => {
    mount('vertical')
    expect(screen.queryByRole('button', { name: /rotate upright/i })).toBeNull()
  })

  it('opens and closes the upright overlay for a horizontal card', () => {
    mount('horizontal')
    const btn = screen.getByRole('button', { name: /rotate upright/i })
    fireEvent.click(btn)
    expect(screen.getAllByAltText('Dean Thomas').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /close rotated view/i })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /close rotated view/i })).toBeNull()
  })

  it('does not trigger the parent click when the button is pressed', () => {
    const parentClick = vi.fn()
    mount('horizontal', parentClick)
    fireEvent.click(screen.getByRole('button', { name: /rotate upright/i }))
    expect(parentClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/card-rotate.test.tsx`
Expected: FAIL — module `../card-rotate` not found.

- [ ] **Step 4: Implement**

Create `app/web/src/components/card-rotate.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { RotateCw } from 'lucide-react'
import { isHorizontal } from '@/components/card-image'

// For horizontal cards, adds a hover rotate button to the enclosing
// `[data-card-frame]` tile. Clicking floats an upright (landscape) copy of the
// card over the grid via a portal, so it escapes the tile's `overflow-hidden`
// and paints above neighbouring cards without reflowing the grid.
export function CardRotate({
  src, alt, orientation, sizes,
}: {
  src: string
  alt: string
  orientation?: string | null
  sizes?: string
}) {
  const t = useTranslations('card')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const open = rect !== null

  useEffect(() => {
    if (!open) return
    const close = () => setRect(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!isHorizontal(orientation)) return null

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (open) return setRect(null)
    const frame = (e.currentTarget as HTMLElement).closest('[data-card-frame]')
    setRect(frame ? frame.getBoundingClientRect() : new DOMRect(0, 0, 0, 0))
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? t('rotateBack') : t('rotate')}
        aria-pressed={open}
        onClick={toggle}
        className="absolute top-1.5 left-1.5 z-20 rounded-full bg-background/80 p-1.5 text-foreground opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <RotateCw className="size-3.5" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setRect(null)} />
          <div
            className="fixed z-50 aspect-[7/5] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{
              left: rect.left + rect.width / 2,
              top: rect.top + rect.height / 2,
              // Upright landscape card ≈ twice the tile width, centred on the tile.
              width: Math.max(rect.width * 2, 320),
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute top-1/2 left-1/2 h-[140%] w-[71.4286%] -translate-x-1/2 -translate-y-1/2 rotate-90 transition-transform duration-200">
              <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/card-rotate.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/card-rotate.tsx app/web/src/components/__tests__/card-rotate.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): add CardRotate hover-rotate overlay for horizontal cards"
```

---

### Task 5: Wire `CardRotate` into the search / set grid tile

**Files:**
- Modify: `app/web/src/components/card-tile.tsx`
- Test: `app/web/src/components/__tests__/card-tile.test.tsx` (new)

**Interfaces:**
- Consumes: `CardRotate` (Task 4), `imageKey` (for the full-res overlay src), `hit.orientation` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/card-tile.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { CardTile } from '../card-tile'
import type { SearchDocument } from '@revelio/search'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode; className?: string }) => <a href={p.href}>{p.children}</a> }))

const base: SearchDocument = {
  id: 'bs-1', setCode: 'BS', number: '1', name: 'Dean Thomas', text: null, flavorText: null,
  types: ['character'], subTypes: [], lesson: null, rarity: null, finish: null,
  legality: null, cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en',
  orientation: 'horizontal',
}
const messages = { card: { rotate: 'Rotate upright', rotateBack: 'Close rotated view' } }
const wrap = (hit: SearchDocument) =>
  render(<NextIntlClientProvider locale="en" messages={messages}><CardTile hit={hit} imageBase="http://img" /></NextIntlClientProvider>)

describe('CardTile rotate button', () => {
  it('shows a rotate button for a horizontal card', () => {
    wrap(base)
    expect(screen.getByRole('button', { name: /rotate upright/i })).toBeInTheDocument()
  })
  it('shows no rotate button for a vertical card', () => {
    wrap({ ...base, orientation: 'vertical' })
    expect(screen.queryByRole('button', { name: /rotate upright/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/card-tile.test.tsx`
Expected: FAIL — no rotate button (CardRotate not mounted yet).

- [ ] **Step 3: Implement**

Rewrite `app/web/src/components/card-tile.tsx`:

```tsx
import Image from 'next/image'
import { Link } from '@/../i18n/navigation'
import type { SearchDocument } from '@revelio/search'
import { imageKey, imageUrl, thumbKey } from '@revelio/core'
import { CardRotate } from '@/components/card-rotate'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <Link href={`/card/${hit.id}`} className="block">
      <figure className="group rounded-lg border border-border/60 bg-card">
        <div data-card-frame className="relative aspect-[5/7] overflow-hidden rounded-t-lg bg-muted">
          {hit.imageLang ? (
            <>
              <Image
                src={imageUrl(imageBase, thumbKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                alt={hit.name}
                fill
                sizes="(max-width: 640px) 45vw, 200px"
                className="object-cover transition group-hover:brightness-110"
              />
              <CardRotate
                src={imageUrl(imageBase, imageKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                alt={hit.name}
                orientation={hit.orientation}
                sizes="400px"
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {hit.name}
            </div>
          )}
        </div>
        <figcaption className="truncate px-2 py-1 text-sm">{hit.name}</figcaption>
      </figure>
    </Link>
  )
}
```

(Note: `overflow-hidden` moved from the `figure` onto the inner frame so the rounded image corners are preserved; the portal overlay lives outside this subtree so clipping does not affect it. `rounded-t-lg` keeps the top corners rounded above the caption.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-grid.test.tsx`
Expected: PASS (new tile tests + existing grid tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/card-tile.tsx app/web/src/components/__tests__/card-tile.test.tsx
git commit -m "feat(web): rotate button on search and set grid tiles"
```

---

### Task 6: Wire `CardRotate` into the deck-builder card browser

**Files:**
- Modify: `app/web/src/components/deck-card-browser.tsx` (image block ~L169-197, imports ~L6)
- Test: none new (this component has no test harness for the async search flow; covered by `CardRotate`'s own tests). Verify via typecheck + the shared build.

**Interfaces:**
- Consumes: `CardRotate` (Task 4), `imageKey`, `hit.orientation` (Task 1).

- [ ] **Step 1: Implement**

In `app/web/src/components/deck-card-browser.tsx`:

Add `imageKey` to the `@revelio/core` import (it currently imports `deckCardMeta, imageUrl, thumbKey`):
```ts
import { deckCardMeta, imageKey, imageUrl, thumbKey } from '@revelio/core'
```

Add the import:
```ts
import { CardRotate } from '@/components/card-rotate'
```

On the inner image box, add `data-card-frame` and mount `CardRotate` next to the `<Image>`. Change the opening tag of that box from:
```tsx
<div className={cn('relative aspect-[5/7] bg-muted', banned && 'grayscale brightness-75')}>
```
to:
```tsx
<div data-card-frame className={cn('relative aspect-[5/7] bg-muted', banned && 'grayscale brightness-75')}>
```

Immediately after the closing of the `hit.imageLang ? (<Image … />) : (<div…/>)` ternary (before the gradient overlay `<div className="pointer-events-none absolute inset-0 bg-gradient-to-t …" />`), insert:
```tsx
                {hit.imageLang && (
                  <CardRotate
                    src={imageUrl(imageBase, imageKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                    alt={hit.name}
                    orientation={hit.orientation}
                    sizes="400px"
                  />
                )}
```

The rotate button sits top-left (`top-1.5 left-1.5`); the existing Info button is top-right, so they do not collide. The button's click is `stopPropagation`'d, so it never opens the Add dropdown.

- [ ] **Step 2: Typecheck + tests**

Run: `npm run typecheck`
Expected: PASS
Run: `npm test -w web`
Expected: PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add app/web/src/components/deck-card-browser.tsx
git commit -m "feat(web): rotate button in the deck-builder card browser"
```

---

### Task 7: Deck-gallery rotation (DeckCardView plumbing + `CardRotate`)

**Files:**
- Modify: `app/core/src/domain.ts` (`DeckCardView` ~L77-88)
- Modify: `app/db/src/queries.ts` (`cardViewMetaByIds` ~L440-448, `getDeck` view map ~L466-476)
- Modify: `app/web/src/components/deck-gallery.tsx` (`GalleryTile` ~L8-31)
- Test: `app/web/src/components/__tests__/deck-gallery.test.tsx` (extend)

**Interfaces:**
- Consumes: `CardRotate` (Task 4), `imageKey` (`@revelio/core`).
- Produces: `DeckCardView.orientation?: string | null` (optional — avoids touching every `DeckCardView` constructor; only the DB deck queries populate it, everything else leaves it `undefined`).

- [ ] **Step 1: Write the failing test**

Look at the top of `app/web/src/components/__tests__/deck-gallery.test.tsx` for the existing `DeckCardView` fixture/factory and the render wrapper, then add:

```tsx
it('shows a rotate button for a horizontal deck card', () => {
  // reuse the file's existing render helper / entry factory; set orientation: 'horizontal'
  // and quantity/zone as the existing tests do, then:
  expect(screen.getByRole('button', { name: /rotate upright/i })).toBeInTheDocument()
})
```

If the file has no i18n provider, wrap the render in `NextIntlClientProvider` with `messages={{ card: { rotate: 'Rotate upright', rotateBack: 'Close rotated view' }, decks: { … } }}` (merge with whatever `decks` messages the existing tests already supply). Model the entry on the file's existing fixtures, adding `orientation: 'horizontal'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/deck-gallery.test.tsx -t "rotate"`
Expected: FAIL — no rotate button rendered.

- [ ] **Step 3: Implement the data plumbing**

In `app/core/src/domain.ts`, add to `DeckCardView` (after `isStartingCharacter: boolean`):
```ts
  orientation?: string | null
```

In `app/db/src/queries.ts` `cardViewMetaByIds`, add `orientation` to the `out.set(...)` object (after `isLesson: m.isLesson, isStartingCharacter: m.isStartingCharacter,`):
```ts
      orientation: c.orientation ?? null,
```

In `app/db/src/queries.ts` `getDeck`, add `orientation` to the `views` map object (after `isLesson: meta?.isLesson ?? false, isStartingCharacter: meta?.isStartingCharacter ?? false,`):
```ts
      orientation: meta?.orientation ?? null,
```

- [ ] **Step 4: Implement the gallery tile**

In `app/web/src/components/deck-gallery.tsx`:

Add imports:
```tsx
import { imageKey, imageUrl, thumbKey } from '@revelio/core'
import { CardRotate } from '@/components/card-rotate'
```
(replace the existing `import { imageUrl, thumbKey } from '@revelio/core'`).

Change the `GalleryTile` wrapper `<div>` to a hover group with a frame marker, and mount `CardRotate`:

```tsx
function GalleryTile({ entry, imageBase }: { entry: DeckCardView; imageBase: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div data-card-frame className="group relative aspect-[63/88] overflow-hidden rounded-lg border border-border bg-muted">
      {broken ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {entry.name}
        </div>
      ) : (
        <>
          <Image
            src={imageUrl(imageBase, thumbKey(entry.cardId))}
            alt={entry.name}
            fill
            sizes="(max-width: 640px) 30vw, 160px"
            className="object-cover"
            onError={() => setBroken(true)}
          />
          <CardRotate
            src={imageUrl(imageBase, imageKey(entry.cardId))}
            alt={entry.name}
            orientation={entry.orientation}
            sizes="400px"
          />
        </>
      )}
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
        {entry.quantity}×
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -w web -- src/components/__tests__/deck-gallery.test.tsx`
Expected: PASS
Run: `npm run typecheck`
Expected: PASS
Run: `npm test -w @revelio/db` (if the deck query has tests, confirm no regression)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/core/src/domain.ts app/db/src/queries.ts app/web/src/components/deck-gallery.tsx app/web/src/components/__tests__/deck-gallery.test.tsx
git commit -m "feat(web): rotate button in the deck gallery"
```

---

### Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Whole-suite gates**

Run: `npm run typecheck`
Expected: PASS
Run: `npm test`
Expected: PASS (all workspaces)
Run: `npm run lint -w web`
Expected: no new errors

- [ ] **Step 2: Visual verification (use the `verify` / `run` skill)**

Start the app (`npm run dev -w web`) with a dataset that has horizontal cards, then confirm:
- Search grid: horizontal cards show sideways by default; hovering reveals the rotate button; clicking floats the card **upright** over its neighbours without reflowing the grid; Escape / outside-click / scroll closes it. Vertical cards show no button.
- Confirm the rotation **direction** stands cards upright (readable). If they're upside-relative, switch `rotate-90` → `-rotate-90` in `card-image.tsx` and `card-rotate.tsx` (keep both consistent) and re-verify.
- Set page grid: same behaviour.
- Detail page: a horizontal card renders upright (landscape frame) by default; a vertical card is unchanged.
- Deck builder browser + deck gallery: rotate button appears for horizontal cards and the overlay floats correctly; the button never triggers Add / navigation.

- [ ] **Step 3: Commit any direction/tuning fix**

```bash
git add -A
git commit -m "fix(web): correct rotation direction and overlay sizing for horizontal cards"
```

(Skip this commit if no tuning was needed.)

---

## Self-Review

**Spec coverage:**
- List hover-rotate button (horizontal only) → Tasks 4–7. ✅
- Rotated card floats over neighbours, grid never reflows (portal overlay) → Task 4. ✅
- Animated rotation → Task 4 (`transition-transform`), direction/tuning in Task 8. ✅
- Toggle back / Escape / ephemeral state → Task 4. ✅
- Button stops propagation (no navigate/add) → Task 4 + tests in Task 5. ✅
- Detail page upright by default, no toggle → Tasks 2–3. ✅
- Vertical cards untouched everywhere → Tasks 2, 4 (guards) + tests. ✅
- Applies to search grid, set grid, deck browser, deck gallery → Tasks 5, 6, 7. ✅
- `orientation` propagated into the search document + reindex note → Task 1. ✅
- `DeckArt` untouched → not referenced by any task. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 7's test step references the file's existing fixture factory rather than repeating it because the exact fixture shape must be read from that file first — the added assertion and the `orientation` field are given explicitly.

**Type consistency:** `orientation` typed `string | null` on `SearchDocument`/`CardIndexData`/`CardDetailDTO` (matches the existing `CardDetailDTO.orientation: string | null`), and optional `string | null` on `DeckCardView`. `isHorizontal(orientation?: string | null)` and `CardImage`/`CardRotate` props accept `string | null | undefined` consistently. `CardRotate` prop names (`src`, `alt`, `orientation`, `sizes`) are identical across Tasks 4–7.

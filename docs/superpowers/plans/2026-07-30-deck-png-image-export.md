# Deck PNG image-export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-only deck PNG export with an image sheet — each card drawn as its full-card thumbnail with a corner quantity badge, grouped under the existing section headers.

**Architecture:** Keep the client-side Canvas render in `app/web/src/lib/deck-png.ts`. Split it into three pieces: a pure **layout model** (`layoutDeckSheet`) that groups entries into sections of card cells, a pure **geometry** function (`computeSheetGeometry`) that positions those cells into a grid and computes canvas height, and the browser-only **render** (`renderDeckPng`) that preloads thumbnails cross-origin and draws them. The pure pieces are unit-tested; the canvas draw stays thin and is verified by build + manual check.

**Tech Stack:** TypeScript, Next.js 16 (web workspace), Canvas 2D API, Vitest. Image URLs built with `@revelio/core` helpers (`imageUrl`, `thumbKey`).

## Global Constraints

- All app commands run from `app/`. This is the npm workspaces root; CI sets `working-directory: app`.
- The sheet is **English-only** (no i18n) — it is a shareable artifact, not a UI surface. No new strings in `messages/en.json` / `de.json`.
- Commits are GPG-signed but `gpg` is not on PATH. Commit with: `git -c gpg.program=/opt/homebrew/bin/gpg commit -m "..."`.
- Conventional Commits for messages.
- Test files are **not** typechecked (`tsconfig.typecheck.json` excludes `**/__tests__/**`) and Vitest transpiles without type-checking, so test fixtures may set only the fields a test needs — matching the existing partial-fixture style in `deck-png.test.ts`.
- CORS on the image host is already enabled and scoped to the site origin (verified: `access-control-allow-origin: https://revelio.cards`). Load thumbnails with `crossOrigin="anonymous"`; no proxy route.
- Branch: `feat/deck-png-image-export` (already created).

**Canvas layout constants** (used by geometry + render; define once at the top of `deck-png.ts`):

```ts
const WIDTH = 980
const PADDING = 36
const THUMB_W = 132
const THUMB_H = 185           // round(THUMB_W * 7 / 5)
const GRID_GAP = 12
const COLS = 6                // floor((WIDTH - 2*PADDING + GRID_GAP) / (THUMB_W + GRID_GAP)) = floor(920/144)
const TITLE_HEIGHT = 48
const SECTION_HEADER_H = 30
const SECTION_GAP = 16
const BADGE_RADIUS = 18       // "a little bigger" than a minimal badge
```

---

## File Structure

- `app/web/src/lib/deck-png.ts` — **Modified.** Gains `DeckPngCard` type + `layoutDeckSheet` (replaces `layoutDeckLines`), gains `computeSheetGeometry` + geometry types, and `renderDeckPng` is rewritten to draw the image grid. Loses the text-line drawing path (`cardLine` usage in render, `columnize`, `sectionHeight`) once Task 3 lands.
- `app/web/src/lib/__tests__/deck-png.test.ts` — **Modified.** Migrated from the `section.lines` shape to `section.cards`, plus new geometry tests.
- `app/web/src/components/deck-export-menu.tsx` — **Unchanged.** Already calls `renderDeckPng(deck, entries)`; the signature is preserved.

---

## Task 1: Layout model — sections of card cells

Rename `layoutDeckLines` → `layoutDeckSheet` and change each section from `lines: string[]` to `cards: DeckPngCard[]`. Preserve all existing grouping/counting behavior exactly. Keep `renderDeckPng`'s output byte-identical this task by projecting cards back to text lines internally — the visual change comes in Task 3.

**Files:**
- Modify: `app/web/src/lib/deck-png.ts`
- Test: `app/web/src/lib/__tests__/deck-png.test.ts`

**Interfaces:**
- Consumes: `DeckCardView`, `DeckFormat` from `@revelio/core` (already imported).
- Produces:
  ```ts
  export type DeckPngCard = {
    cardId: string
    quantity: number
    name: string
    setCode: string
    imageVersion: number | null
    orientation: string | null
  }
  export type DeckPngSection = { title: string; color: string; cards: DeckPngCard[] }
  export type DeckPngLayout = { title: string; sections: DeckPngSection[] }
  export function layoutDeckSheet(
    deck: { name: string; format: DeckFormat },
    entries: DeckCardView[],
  ): DeckPngLayout
  ```

- [ ] **Step 1: Migrate the test fixtures + assertions to the card shape**

Replace the whole body of `app/web/src/lib/__tests__/deck-png.test.ts` with:

```ts
import { it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { layoutDeckSheet } from '../deck-png'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1,
  name: 'Harry Potter', cost: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  imageVersion: 100, orientation: 'horizontal',
}
const accio: DeckCardView = {
  cardId: 'bs-accio', zone: 'main', quantity: 4,
  name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 101, orientation: null,
}
const charmsLesson: DeckCardView = {
  cardId: 'bs-charms-class', zone: 'main', quantity: 6,
  name: 'Charms Class', cost: null, setCode: 'BS', number: '3', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: true, isStartingCharacter: false,
  imageVersion: 102, orientation: null,
}
const item: DeckCardView = {
  cardId: 'bs-nimbus', zone: 'main', quantity: 2,
  name: 'Nimbus Two Thousand', cost: 2, setCode: 'BS', number: '4', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: null, orientation: null,
}
const sideCard: DeckCardView = {
  cardId: 'bs-dobby', zone: 'sideboard', quantity: 1,
  name: 'Dobby', cost: 1, setCode: 'BS', number: '5', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 103, orientation: null,
}

it('renders a title from deck name and format label', () => {
  const { title } = layoutDeckSheet({ name: 'My Deck', format: 'revival' }, [])
  expect(title).toBe('My Deck (Revival)')
})

it('produces no sections for an empty deck', () => {
  const { sections } = layoutDeckSheet({ name: 'Empty', format: 'classic' }, [])
  expect(sections).toEqual([])
})

it('adds a Character section holding the character card cell', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'revival' }, [harry])
  expect(sections[0]).toEqual({
    title: 'Character', color: '#E8B23A',
    cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }],
  })
})

it('groups the main zone into a heading plus lesson/type buckets, and lists the sideboard flat', () => {
  const { sections } = layoutDeckSheet(
    { name: 'D', format: 'revival' },
    [harry, accio, charmsLesson, item, sideCard],
  )

  expect(sections).toEqual([
    { title: 'Character', color: '#E8B23A', cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }] },
    { title: 'Main deck (12)', color: '#E8B23A', cards: [] },
    { title: 'Charms (4)', color: '#0069A9', cards: [{ cardId: 'bs-accio', quantity: 4, name: 'Accio', setCode: 'BS', imageVersion: 101, orientation: null }] },
    { title: 'Lessons (6)', color: '#E8B23A', cards: [{ cardId: 'bs-charms-class', quantity: 6, name: 'Charms Class', setCode: 'BS', imageVersion: 102, orientation: null }] },
    { title: 'Items (2)', color: '#8C88A8', cards: [{ cardId: 'bs-nimbus', quantity: 2, name: 'Nimbus Two Thousand', setCode: 'BS', imageVersion: null, orientation: null }] },
    { title: 'Sideboard (1)', color: '#E8B23A', cards: [{ cardId: 'bs-dobby', quantity: 1, name: 'Dobby', setCode: 'BS', imageVersion: 103, orientation: null }] },
  ])
})

it('omits Main deck / Sideboard sections entirely when those zones are empty', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'classic' }, [harry])
  expect(sections.map((s) => s.title)).toEqual(['Character'])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w web -- src/lib/__tests__/deck-png.test.ts`
Expected: FAIL — `layoutDeckSheet` is not exported (import error / "is not a function").

- [ ] **Step 3: Refactor the layout model in `deck-png.ts`**

In `app/web/src/lib/deck-png.ts`:

1. Replace the `DeckPngSection` type and add `DeckPngCard`:

```ts
export type DeckPngCard = {
  cardId: string
  quantity: number
  name: string
  setCode: string
  imageVersion: number | null
  orientation: string | null
}
export type DeckPngSection = {
  title: string
  color: string
  cards: DeckPngCard[]
}
export type DeckPngLayout = {
  title: string
  sections: DeckPngSection[]
}
```

2. Add a mapper next to the existing `cardLine` (keep `cardLine` — the render still uses it this task):

```ts
function cardCell(v: DeckCardView): DeckPngCard {
  return {
    cardId: v.cardId,
    quantity: v.quantity,
    name: v.name,
    setCode: v.setCode,
    imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
  }
}
```

3. Rename `layoutDeckLines` → `layoutDeckSheet` and swap `lines: [...]` / `.map(cardLine)` for `cards: [...]` / `.map(cardCell)`:

```ts
export function layoutDeckSheet(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
): DeckPngLayout {
  const title = `${deck.name} (${FORMAT_LABEL[deck.format]})`
  const sections: DeckPngSection[] = []

  const character = entries.find((e) => e.zone === 'character')
  if (character) sections.push({ title: 'Character', color: GOLD, cards: [cardCell(character)] })

  const main = entries.filter((e) => e.zone === 'main')
  if (main.length) {
    const mainCount = main.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `Main deck (${mainCount})`, color: GOLD, cards: [] })
    const groups = new Map<string, DeckCardView[]>()
    for (const e of main) groups.set(groupKey(e), [...(groups.get(groupKey(e)) ?? []), e])
    for (const [key, list] of groups) {
      const count = list.reduce((n, e) => n + e.quantity, 0)
      sections.push({ title: `${groupLabel(key)} (${count})`, color: groupColor(key), cards: list.map(cardCell) })
    }
  }

  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  if (sideboard.length) {
    const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `Sideboard (${sideCount})`, color: GOLD, cards: sideboard.map(cardCell) })
  }

  return { title, sections }
}
```

4. Keep `renderDeckPng`'s output identical for now by projecting cards to text lines at the top of its body. Change the destructuring line and add the projection:

```ts
  const { title, sections: cardSections } = layoutDeckSheet(deck, entries)
  const sections = cardSections.map((s) => ({ title: s.title, color: s.color, lines: s.cards.map(cardLine) }))
```

Leave `columnize`, `sectionHeight`, `truncateToWidth`, and the draw loop untouched — they operate on the projected `{ title, color, lines }` sections exactly as before. (`sectionHeight`/`columnize` type params infer from this local shape; if a type annotation references `DeckPngSection`, change it to the inline `{ title: string; color: string; lines: string[] }` shape.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- src/lib/__tests__/deck-png.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Verify the whole web workspace still builds and typechecks**

Run: `npm run typecheck -w web`
Expected: PASS (no references to the removed `layoutDeckLines` remain; `deck-export-menu.tsx` only uses `renderDeckPng`).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/deck-png.ts app/web/src/lib/__tests__/deck-png.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): model deck PNG sections as card cells"
```

---

## Task 2: Grid geometry

Add a pure `computeSheetGeometry` that turns the layout into positioned card cells and a total canvas height. No canvas, no rendering — just arithmetic, fully unit-tested.

**Files:**
- Modify: `app/web/src/lib/deck-png.ts`
- Test: `app/web/src/lib/__tests__/deck-png.test.ts`

**Interfaces:**
- Consumes: `DeckPngLayout`, `DeckPngCard` (Task 1); the canvas layout constants (Global Constraints).
- Produces:
  ```ts
  export type PositionedCard = { card: DeckPngCard; x: number; y: number }
  export type PositionedSection = { title: string; color: string; headerY: number; cards: PositionedCard[] }
  export type SheetGeometry = { width: number; height: number; sections: PositionedSection[] }
  export function computeSheetGeometry(layout: DeckPngLayout): SheetGeometry
  ```
  Positioning rules: cell origin `(x, y)` is the top-left of a `THUMB_W × THUMB_H` box. `x = PADDING + (i % COLS) * (THUMB_W + GRID_GAP)`; grid top of a section is `headerY + SECTION_HEADER_H`; `y = gridTop + floor(i / COLS) * (THUMB_H + GRID_GAP)`. A section with zero cards contributes only its header. Content starts at `PADDING + TITLE_HEIGHT`; `height` adds a bottom `PADDING` and drops the trailing `SECTION_GAP`.

- [ ] **Step 1: Write the failing geometry tests**

Append to `app/web/src/lib/__tests__/deck-png.test.ts`:

```ts
import { computeSheetGeometry } from '../deck-png'

const cell = (cardId: string): import('../deck-png').DeckPngCard => ({
  cardId, quantity: 1, name: cardId, setCode: 'BS', imageVersion: 1, orientation: null,
})

it('positions a single-card section and sizes the canvas to fit', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Character', color: '#E8B23A', cards: [cell('a')] }],
  })
  expect(geom.width).toBe(980)
  // content top = PADDING(36)+TITLE_HEIGHT(48)=84; header 84; gridTop 114
  expect(geom.sections[0].headerY).toBe(84)
  expect(geom.sections[0].cards[0]).toEqual({ card: cell('a'), x: 36, y: 114 })
  // gridH = 185; y = 114+185+16 = 315; height = 315 - 16 + 36 = 335
  expect(geom.height).toBe(335)
})

it('wraps cards past COLS onto the next row', () => {
  const cards = Array.from({ length: 7 }, (_, i) => cell(`c${i}`))
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Charms (7)', color: '#0069A9', cards }],
  })
  // 6 columns → 7th card (index 6) is row 1, col 0
  expect(geom.sections[0].cards[6]).toEqual({ card: cards[6], x: 36, y: 311 }) // 114 + (185+12)
  // rows=2 → gridH = 2*185 + 12 = 382; y = 114+382+16 = 512; height = 512-16+36 = 532
  expect(geom.height).toBe(532)
})

it('advances past a header-only section (Main deck heading with no cards)', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [
      { title: 'Main deck (4)', color: '#E8B23A', cards: [] },
      { title: 'Charms (4)', color: '#0069A9', cards: [cell('a')] },
    ],
  })
  expect(geom.sections[0].headerY).toBe(84)
  // header-only: gridTop 114, gridH 0, y = 114+0+16 = 130 → next headerY 130
  expect(geom.sections[1].headerY).toBe(130)
  expect(geom.sections[1].cards[0]).toEqual({ card: cell('a'), x: 36, y: 160 }) // 130+30
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w web -- src/lib/__tests__/deck-png.test.ts`
Expected: FAIL — `computeSheetGeometry` is not exported.

- [ ] **Step 3: Implement `computeSheetGeometry`**

Add to `app/web/src/lib/deck-png.ts` (constants from Global Constraints must exist near the top; add any that are missing):

```ts
export type PositionedCard = { card: DeckPngCard; x: number; y: number }
export type PositionedSection = { title: string; color: string; headerY: number; cards: PositionedCard[] }
export type SheetGeometry = { width: number; height: number; sections: PositionedSection[] }

export function computeSheetGeometry(layout: DeckPngLayout): SheetGeometry {
  const sections: PositionedSection[] = []
  let y = PADDING + TITLE_HEIGHT
  for (const s of layout.sections) {
    const headerY = y
    const gridTop = y + SECTION_HEADER_H
    const cards: PositionedCard[] = s.cards.map((card, i) => ({
      card,
      x: PADDING + (i % COLS) * (THUMB_W + GRID_GAP),
      y: gridTop + Math.floor(i / COLS) * (THUMB_H + GRID_GAP),
    }))
    const rows = Math.ceil(s.cards.length / COLS)
    const gridH = rows > 0 ? rows * THUMB_H + (rows - 1) * GRID_GAP : 0
    sections.push({ title: s.title, color: s.color, headerY, cards })
    y = gridTop + gridH + SECTION_GAP
  }
  const height = y - SECTION_GAP + PADDING
  return { width: WIDTH, height, sections }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- src/lib/__tests__/deck-png.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/deck-png.ts app/web/src/lib/__tests__/deck-png.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): compute deck PNG grid geometry"
```

---

## Task 3: Image-grid canvas render

Rewrite `renderDeckPng` to draw the thumbnail grid with quantity badges, using `layoutDeckSheet` + `computeSheetGeometry`. Load each thumbnail cross-origin, fall back to a placeholder tile, and remove the now-dead text-line code. This is browser-only, so it is verified by typecheck + full suite + build + a manual visual check rather than a unit test.

**Files:**
- Modify: `app/web/src/lib/deck-png.ts`

**Interfaces:**
- Consumes: `layoutDeckSheet`, `computeSheetGeometry`, `SheetGeometry`, `PositionedCard`, `DeckPngCard` (Tasks 1–2); `imageUrl`, `thumbKey` from `@revelio/core`.
- Produces: `renderDeckPng(deck, entries): Promise<Blob>` — same signature/contract as today (consumed unchanged by `deck-export-menu.tsx`).

- [ ] **Step 1: Add the image base + thumbnail loader**

In `app/web/src/lib/deck-png.ts`:

1. Extend the core import: `import { imageUrl, thumbKey } from '@revelio/core'` (add to the existing `import type { DeckCardView, DeckFormat } from '@revelio/core'` — note `imageUrl`/`thumbKey` are values, so use a separate non-type import).
2. Near the top constants add:

```ts
const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
const IMG_TIMEOUT_MS = 10_000
```

3. Add the loader (resolves to `null` on missing version, error, or timeout — never rejects):

```ts
function loadThumb(card: DeckPngCard): Promise<HTMLImageElement | null> {
  if (card.imageVersion == null || !IMAGE_BASE) return Promise.resolve(null)
  const url = imageUrl(IMAGE_BASE, thumbKey(card.cardId, card.imageVersion))
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), IMG_TIMEOUT_MS)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}
```

- [ ] **Step 2: Add the cell-drawing helpers**

Add to `app/web/src/lib/deck-png.ts`. `drawCover` fills the portrait cell (object-fit: cover); `drawRotatedUpright` handles horizontal cards (stored portrait, shown as a landscape card centered in the cell); `drawPlaceholder` is the no-image fallback; `drawBadge` is the gold corner badge. `truncateToWidth` already exists — reuse it for the placeholder name.

```ts
const BADGE_FILL = GOLD
const BADGE_TEXT = '#1A1730'
const BADGE_FONT = '700 20px system-ui, sans-serif'

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// Horizontal cards are stored portrait with the landscape art rotated 90°.
// Draw them as an upright landscape card (aspect 7:5) fit to the cell width,
// centered vertically in the portrait cell — mirrors CardImage's `upright`.
function drawRotatedUpright(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number) {
  const landW = THUMB_W
  const landH = Math.round(THUMB_W * 5 / 7)
  const cx = x + THUMB_W / 2
  const cy = y + THUMB_H / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y + (THUMB_H - landH) / 2, landW, landH)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate(Math.PI / 2)
  // after a 90° turn the target box is landH wide × landW tall in rotated space
  const scale = Math.max(landH / img.naturalWidth, landW / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, name: string) {
  ctx.fillStyle = CARD_BG
  ctx.fillRect(x, y, THUMB_W, THUMB_H)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, THUMB_W - 1, THUMB_H - 1)
  ctx.fillStyle = PARCHMENT
  ctx.font = LINE_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateToWidth(ctx, name, THUMB_W - 16), x + THUMB_W / 2, y + THUMB_H / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, quantity: number) {
  const cx = x + THUMB_W - BADGE_RADIUS - 6
  const cy = y + THUMB_H - BADGE_RADIUS - 6
  ctx.beginPath()
  ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = BADGE_FILL
  ctx.fill()
  ctx.strokeStyle = BG
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = BADGE_TEXT
  ctx.font = BADGE_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(quantity), cx, cy + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
```

- [ ] **Step 3: Rewrite `renderDeckPng` to draw the grid**

Replace the entire body of `renderDeckPng` (keep the signature and the `typeof document` guard) with:

```ts
export async function renderDeckPng(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderDeckPng can only run in a browser')

  const layout = layoutDeckSheet(deck, entries)
  const geom = computeSheetGeometry(layout)

  // Preload every thumbnail concurrently; a failed/absent image becomes a
  // placeholder (loadThumb resolves null, never rejects), so one bad image
  // never aborts the export.
  const allCards = geom.sections.flatMap((s) => s.cards.map((pc) => pc.card))
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    allCards.map(async (card) => { images.set(card.cardId, await loadThumb(card)) }),
  )

  const canvas = document.createElement('canvas')
  canvas.width = geom.width * SCALE
  canvas.height = geom.height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(SCALE, SCALE)

  // Background sheet: midnight frame around a card-colored panel
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, geom.width, geom.height)
  const FRAME = 8
  ctx.fillStyle = CARD_BG
  ctx.fillRect(FRAME, FRAME, geom.width - FRAME * 2, geom.height - FRAME * 2)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(FRAME + 0.5, FRAME + 0.5, geom.width - FRAME * 2 - 1, geom.height - FRAME * 2 - 1)

  // Title
  ctx.fillStyle = GOLD
  ctx.font = TITLE_FONT
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateToWidth(ctx, layout.title, geom.width - PADDING * 2), PADDING, PADDING + 22)

  for (const section of geom.sections) {
    // Section header: color swatch + parchment title on the header baseline
    const baseline = section.headerY + SECTION_HEADER_H - 8
    ctx.fillStyle = section.color
    ctx.fillRect(PADDING, baseline - SWATCH_SIZE + 4, SWATCH_SIZE / 3, SWATCH_SIZE)
    ctx.fillStyle = PARCHMENT
    ctx.font = SECTION_FONT
    ctx.fillText(truncateToWidth(ctx, section.title, geom.width - PADDING * 2 - 14), PADDING + 12, baseline)

    for (const pc of section.cards) {
      const img = images.get(pc.card.cardId) ?? null
      if (img && pc.card.orientation === 'horizontal') drawRotatedUpright(ctx, img, pc.x, pc.y)
      else if (img) drawCover(ctx, img, pc.x, pc.y, THUMB_W, THUMB_H)
      else drawPlaceholder(ctx, pc.x, pc.y, pc.card.name)
      drawBadge(ctx, pc.x, pc.y, pc.card.quantity)
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render deck PNG'))
    }, 'image/png')
  })
}
```

- [ ] **Step 4: Remove the dead text-line code**

Delete the now-unused helpers and constants in `deck-png.ts`: `cardLine`, `columnize`, `sectionHeight`, and the constants only they used (`COLUMN_GAP`, `LINE_HEIGHT`, `SECTION_TITLE_HEIGHT`, and the old `SECTION_GAP` value is now reused — keep it). Keep `truncateToWidth`, `SWATCH_SIZE`, `TITLE_FONT`, `SECTION_FONT`, `LINE_FONT`, `SCALE`, and all color constants (still used). Confirm nothing else in the file references the removed symbols.

- [ ] **Step 5: Verify typecheck, lint, and the full test suite**

Run:
```bash
npm run typecheck -w web
npm run lint -w web
npm test -w web -- src/lib/__tests__/deck-png.test.ts
```
Expected: typecheck PASS; lint PASS (pre-existing React-compiler warnings are acceptable, 0 errors); the 8 deck-png tests PASS (layout + geometry unchanged by this task).

- [ ] **Step 6: Manual visual check in the running app**

Use the `run` skill (or `npm run dev -w web` from `app/`) to open the deck builder, add a starting character (horizontal) plus several main-deck and sideboard cards, and export the PNG. Confirm:
- thumbnails render (not tainted/blank) and the file downloads,
- the horizontal character card appears **upright** (not sideways) — if it's rotated the wrong way, flip the sign of `ctx.rotate` in `drawRotatedUpright` to `-Math.PI / 2`,
- the gold quantity badge sits in the bottom-right of each card and is legible,
- a card with no image shows the placeholder tile with its name.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/lib/deck-png.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): render deck PNG export as card-image grid with quantity badges"
```

---

## Self-Review

**Spec coverage:**
- Grid of full-card thumbnails under existing section headers → Task 1 (model) + Task 2 (geometry) + Task 3 (draw). ✓
- Larger gold corner badge on every card → Task 3 `drawBadge` (`BADGE_RADIUS = 18`). ✓
- Card names dropped → Task 3 removes `cardLine`; names only survive as placeholder fallback text. ✓
- `crossOrigin="anonymous"`, no proxy → Task 3 `loadThumb`. ✓
- Placeholder fallback, export never aborts on one bad image → Task 3 `loadThumb` resolves `null`, `drawPlaceholder`. ✓
- Horizontal cards upright → Task 3 `drawRotatedUpright`. ✓
- Full thumbnail, not art crop → `loadThumb` uses `thumbKey`. ✓
- Pure layout refactored + tests migrated from `lines` shape → Task 1. ✓
- Geometry unit-tested → Task 2. ✓
- Canvas draw thin/browser-only, unchanged download flow → Task 3, `deck-export-menu.tsx` untouched. ✓
- English-only, no new i18n strings → confirmed in Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete content. ✓

**Type consistency:** `layoutDeckSheet` (Task 1) → consumed by `computeSheetGeometry` (Task 2) → `SheetGeometry`/`PositionedCard` consumed by `renderDeckPng` (Task 3). `DeckPngCard` fields (`cardId`, `quantity`, `name`, `setCode`, `imageVersion`, `orientation`) are consistent across tasks. `loadThumb`/`drawCover`/`drawRotatedUpright`/`drawPlaceholder`/`drawBadge` names match their call sites in Step 3. ✓

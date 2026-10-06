# Deck Sheet Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint the deck sheet as design B. The sheet becomes 1440 px wide, with a hero
banner (character art crop, gold-framed character card, deck name, makeup bar), packed
type groups, stacked copies with ×N chips, and the Revelio logo in the footer.

**Architecture:** `@revelio/core` owns the contract, layout and geometry as pure
functions. `@revelio/sheet` owns pixels: it fetches art, builds SVG chrome and Pango
text, and composites everything with sharp. Web and the bot change only through
`pickSheetEntries`, which starts sending the character's `artCropVersion`.

**Tech Stack:** TypeScript, Zod 3, sharp 0.35 (libvips + librsvg + Pango), Vitest, esbuild
bundle, Docker.

**Spec:** `docs/superpowers/specs/2026-10-06-deck-sheet-redesign-design.md`.
The visual reference is mock B in https://claude.ai/artifact/UAtRLsnokstgQ1BbhKz4tR.

## Global Constraints

- All commands run from `app/` (the npm workspaces root). Prefix binaries:
  `/usr/local/bin/node`, `/usr/local/bin/npm`, `/usr/local/bin/docker`. Prefix
  `/opt/homebrew/bin/gh` and `/opt/homebrew/bin/gpg`.
- Work on branch `feat/deck-sheet-redesign`, which already exists and holds the spec.
  Never commit to `main`.
- Commit with `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`. Use Conventional
  Commits (`type(scope): subject`, scope = workspace). No `Co-authored-by` and no "generated
  with" lines.
- **Never run a bare `npm test` from `app/`.** `ingest` tests wipe the dev Meilisearch
  indexes. Run workspaces explicitly: `npm test -w @revelio/core`,
  `npm test -w @revelio/sheet`, `npm test -w @revelio/bot`, `npm test -w web`.
- Code style (CLAUDE.md):
  - `type` aliases only, never `interface`.
  - `import type` / inline `type` for type-only imports.
  - Declaration order: types, then constants, then helpers, then exported functions.
  - Code comments are ASCII only: no em-dashes and no unicode arrows. Use `x` for
    multiplication in comments. The `×` glyph appears only inside painted string
    literals, written as `'×'`.
- Exact values from the spec:
  - Sheet: width 1440, side padding 40, banner 320, art area 880 x 320 right-aligned,
    focus 30% from the top.
  - Cards: 112 x 157 portrait and 157 x 112 landscape, radius 6.
  - Spacing: card gaps 16 / 20, group gaps 36 / 24, group label 22 + 10, zone header 44,
    zone gap 24, footer 72.
  - Logo: 34 px tall.
  - Character card in the banner: 224 x 160 at (40, 40), with a 2 px gold ring.
  - Banner text starts at x 290 (40 without a character), 560 wide (1000 without).
  - Makeup bar: y 254, 10 px tall, 2 px gaps. Legend at y 274.
  - Stack offset: 5 px per copy, at most two outlines.
  - Chip: 26 px tall, at least 30 px wide, 7 px side padding, overhangs 6 px right and
    8 px down.
- `MAX_SHEET_PIXELS`, the PNG-then-WebP fallback, the fetch budget and the 768Mi limit
  do not change.
- Every user-facing string comes from `core/src/messages/{en,de}.json`.
  `core/test/labels.test.ts` enforces that both catalogs have the same keys.

## Review Focus

1. **A deck name at the 120-character painted maximum.** The banner title must
   ellipsise inside its text column (560 px with a card, 1000 without). It must not run
   under the art or past the canvas. A composite overlay past the canvas edge is a sharp
   error, so the whole render would fail. Pinned in Task 4.
2. **A quantity of 999.** The ×N chip grows with the digits and stays on the canvas.
   Pinned in Task 4.
3. **A deck that is only a starting character.** No zones, so the sheet is banner plus
   footer, and it still renders. Pinned in Tasks 3 and 4.
4. **Every main group present in German.** Nine legend items with long German labels
   must stop at the bar's right edge instead of overflowing the canvas. Pinned in
   Task 4.
5. **A one-card group in the last column.** A group label wider than the group's one
   card must be fitted to the space left before the right edge. Otherwise it is an
   overlay past the canvas. Pinned in Task 4.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `core/src/deck-sheet.ts` | modify | contract field, layout model (banner + zones), geometry (packing), makeup segments, sheet constants and colours |
| `core/src/messages/en.json`, `de.json` | modify | `deckSheet.cards`, `deckSheet.startingCharacter`; drop `deckSheet.character` |
| `core/test/deck-sheet.test.ts` | modify | contract, layout, geometry tests |
| `sheet/src/text.ts` | modify | optional letter-spacing (`tracking`) |
| `sheet/src/render.ts` | modify | painter: banner art, chrome/fade/decor SVGs, chips, labels, logo |
| `sheet/src/server.ts` | modify | body-cap comment for the new field |
| `sheet/src/revelio-logo.svg` | create | byte copy of `logos/revelio-logo-dark.svg` |
| `sheet/build.mjs`, `sheet/Dockerfile` | modify | ship the logo next to the bundle |
| `sheet/test/render.test.ts`, `server.test.ts`, `text.test.ts` | modify | painter, body cap, tracking |
| `sheet/test/logo.test.ts` | create | drift test against `logos/` |
| `bot/test/sheet.test.ts`, `web/src/app/api/deck-sheet/__tests__/route.test.ts` | modify | the request shape now carries `artCropVersion: null` |

Commit boundary: Task 3 changes core's layout API, and `sheet/src/render.ts` does not
compile against it until Task 4. Run only core's tests in Task 3. Do not push between
Task 3 and Task 4.

---

### Task 1: Contract carries the character's art crop version

**Files:**
- Modify: `core/src/deck-sheet.ts` (`DeckSheetEntry`, `DeckSheetEntryInput`, `pickSheetEntries`)
- Modify: `sheet/src/server.ts:9-15` (comment only)
- Test: `core/test/deck-sheet.test.ts`, `sheet/test/server.test.ts`, `sheet/test/render.test.ts`, `bot/test/sheet.test.ts`, `web/src/app/api/deck-sheet/__tests__/route.test.ts`

**Interfaces:**
- Produces: `DeckSheetEntry` now includes `artCropVersion: number | null` (from
  `DeckCardView`). `DeckSheetRequest['entries'][number].artCropVersion: number | null`,
  null by default when absent on the wire. `pickSheetEntries` sets it on character
  entries and sends `null` on every other zone.

- [ ] **Step 1: Write the failing core tests**

In `core/test/deck-sheet.test.ts`, replace the existing `pickSheetEntries keeps exactly the painted fields` test and add two tests inside `describe('DeckSheetRequest', ...)`:

```ts
  it('pickSheetEntries keeps exactly the painted fields', () => {
    const view = { ...entry, artCropVersion: null, cost: 4, damage: null, lesson: null, isOfficial: true, legality: 'legal' }
    expect(pickSheetEntries([view])).toEqual([{ ...entry, artCropVersion: null }])
  })

  // Only the banner reads it, and the banner only draws the character. Sending a
  // version for every card would widen the request for bytes nothing paints.
  it('pickSheetEntries sends the art crop for the character only', () => {
    const character = { ...entry, zone: 'character' as const, artCropVersion: 1_783_899_940 }
    const main = { ...entry, cardId: 'other', artCropVersion: 1_783_899_940 }
    expect(pickSheetEntries([character, main]).map((e) => e.artCropVersion)).toEqual([1_783_899_940, null])
  })

  // Optional on the wire so a new service accepts an old caller's body, and
  // bounded like imageVersion because it is the same kind of value.
  it('defaults artCropVersion to null and bounds it like imageVersion', () => {
    expect(DeckSheetRequest.parse(body).entries[0].artCropVersion).toBeNull()
    const ok = (artCropVersion: unknown) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, artCropVersion }] }).success
    expect(ok(1_783_899_940)).toBe(true)
    expect(ok(null)).toBe(true)
    expect(ok(-1)).toBe(false)
    expect(ok(1.5)).toBe(false)
    expect(ok(SHEET_FIELD_LIMITS.imageVersion + 1)).toBe(false)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/core -- test/deck-sheet.test.ts`
Expected: FAIL. The two new tests fail on `artCropVersion` being `undefined`, and the
replaced test fails on the missing key.

- [ ] **Step 3: Implement in `core/src/deck-sheet.ts`**

Add `'artCropVersion'` to the `DeckSheetEntry` pick:

```ts
export type DeckSheetEntry = Pick<
  DeckCardView,
  'cardId' | 'zone' | 'quantity' | 'name' | 'setCode' | 'types' | 'imageVersion' | 'orientation' | 'artCropVersion'
>
```

In `DeckSheetEntryInput`, after `imageVersion`:

```ts
  // The banner's art crop (images.ts artCropKey). Read on the character entry
  // only; pickSheetEntries sends null everywhere else. Defaulted so a caller
  // that predates the banner still sends a valid body, and bounded like
  // imageVersion because it is the same unix-seconds mtime.
  artCropVersion: z.number().int().nonnegative().max(SHEET_FIELD_LIMITS.imageVersion).nullable().default(null),
```

In `pickSheetEntries`, add the field to the mapped object:

```ts
    orientation: v.orientation ?? null,
    artCropVersion: v.zone === 'character' ? v.artCropVersion ?? null : null,
```

- [ ] **Step 4: Run core tests to verify they pass**

Run: `npm test -w @revelio/core`
Expected: PASS.

- [ ] **Step 5: Update the callers' shape assertions and the sheet fixtures**

- `bot/test/sheet.test.ts`: in `expect(sent.entries[0]).toEqual({...})`, add
  `artCropVersion: null` after `orientation: null`.
- `web/src/app/api/deck-sheet/__tests__/route.test.ts`: in
  `expect(sent.entries).toEqual([{...}])`, add `artCropVersion: null` after
  `orientation: null`.
- `sheet/test/render.test.ts`: in the `entry()` helper's returned object, add
  `artCropVersion: null` before `...extra`.
- `sheet/test/server.test.ts`:
  - In the top-level `body` entry, add `artCropVersion: null`.
  - In `reads the most expensive body the contract accepts`, add
    `artCropVersion: L.imageVersion,` after `imageVersion: L.imageVersion,`.

- [ ] **Step 6: Update the body-cap comment in `sheet/src/server.ts`**

Replace the `JSON_ENTRY_OVERHEAD` comment with this text. The constant stays at 180,
because the fixed part now measures 152 against the contract's maxima:

```ts
// The fixed half of a serialized entry: every key name, the zone, the quantity,
// the bounded imageVersion and artCropVersion and the punctuation around them,
// plus the comma that joins it to the next. Measured at 152 against the
// contract's own maxima (124 before artCropVersion), not against realistic
// values - sizing the fixed half from one and the variable half from the other
// is how this was wrong before. The rest is headroom for the contract gaining a
// field.
```

- [ ] **Step 7: Run every affected workspace**

Run: `npm test -w @revelio/sheet && npm test -w @revelio/bot && npm test -w web -- src/app/api/deck-sheet && npm run typecheck`
Expected: all PASS. The worst-body test passes, because the measured fixed part (152)
is still under 180.

- [ ] **Step 8: Commit**

```bash
git add core/src/deck-sheet.ts core/test/deck-sheet.test.ts sheet/src/server.ts sheet/test bot/test/sheet.test.ts web/src/app/api/deck-sheet/__tests__/route.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(core): carry the character's art crop version to the sheet"
```

---

### Task 2: Letter-spacing in sheet text

**Files:**
- Modify: `sheet/src/text.ts`
- Test: `sheet/test/text.test.ts`

**Interfaces:**
- Produces: `TextStyle.tracking?: number`, in em. `renderText` and `fitText` accept it
  unchanged.

- [ ] **Step 1: Write the failing test**

Append to `describe('renderText', ...)` in `sheet/test/text.test.ts`:

```ts
  // Uppercase labels are set with tracking, as the mock does with letter-spacing.
  it('spreads glyphs apart when tracking is set', async () => {
    const plain = await renderText('MAIN DECK', { size: 26, color: '#ffffff' })
    const tracked = await renderText('MAIN DECK', { size: 26, color: '#ffffff', tracking: 0.2 })
    // Eight gaps between nine glyphs at 0.2em of 26px is ~42px wider.
    expect(tracked.width - plain.width).toBeGreaterThan(30)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/text.test.ts`
Expected: FAIL. The widths are equal.

- [ ] **Step 3: Implement**

In `sheet/src/text.ts`, extend `TextStyle`:

```ts
export type TextStyle = {
  size: number
  color: string
  // Letter-spacing in em. Pango takes it in 1/1024 pt, and at dpi 72 a point is
  // a pixel, so size x tracking x 1024 is exact.
  tracking?: number
  // Only for tests proving the bundled face is the one drawn.
  family?: string
}
```

In `renderText`, build the span with the attribute:

```ts
  const spacing = style.tracking ? ` letter_spacing="${Math.round(style.tracking * style.size * 1024)}"` : ''
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${style.color}"${spacing}>${escapeMarkup(text)}</span>`,
```

(the rest of the call is unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @revelio/sheet -- test/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sheet/src/text.ts sheet/test/text.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(sheet): letter-space sheet labels"
```

---

### Task 3: Layout model and packed geometry in core

**Files:**
- Modify: `core/src/deck-sheet.ts` (types, `DECK_SHEET_COLORS`, `DECK_SHEET`, `sheetLabels`, `layoutDeckSheet`, `computeSheetGeometry`, new `makeupSegments`)
- Modify: `core/src/messages/en.json`, `core/src/messages/de.json`
- Test: `core/test/deck-sheet.test.ts`

**Interfaces:**
- Consumes: `DeckSheetEntry.artCropVersion` (Task 1), `groupMainEntries`, `OTHER_GROUP`.
- Produces (exported from `@revelio/core` via the existing barrel):

```ts
export type DeckSheetCard = { cardId: string; quantity: number; name: string; setCode: string; imageVersion: number | null; orientation: string | null }
export type DeckSheetMakeup = { key: string; label: string; count: number; color: string }
export type DeckSheetBanner = {
  name: string
  eyebrow: string
  character: { card: DeckSheetCard; label: string; artCropVersion: number | null } | null
  makeup: DeckSheetMakeup[]
}
export type DeckSheetGroup = { key: string; title: string | null; count: number; color: string; cards: DeckSheetCard[] }
export type DeckSheetZone = { title: string; count: number; groups: DeckSheetGroup[] }
export type DeckSheetLayout = { banner: DeckSheetBanner; zones: DeckSheetZone[] }
export type DeckSheetLabels = { formatLabel: Record<DeckFormat, string>; mainDeck: string; sideboard: string; cards: string; startingCharacter: string; group: (key: string) => string }
export type Rect = { x: number; y: number; w: number; h: number }
export type PositionedCard = { card: DeckSheetCard; x: number; y: number; w: number; h: number }
export type PositionedGroup = { key: string; title: string | null; count: number; color: string; x: number; labelY: number; cards: PositionedCard[] }
export type PositionedZone = { title: string; count: number; headerY: number; groups: PositionedGroup[] }
export type PositionedBanner = { art: Rect; card: PositionedCard | null; textX: number; textWidth: number; bar: Rect; legendY: number }
export type SheetGeometry = { width: number; height: number; banner: PositionedBanner; zones: PositionedZone[]; logo: Rect }
export function layoutDeckSheet(deck: { name: string; format: DeckFormat }, entries: DeckSheetEntry[], labels: DeckSheetLabels): DeckSheetLayout
export function computeSheetGeometry(layout: DeckSheetLayout): SheetGeometry
export function makeupSegments(makeup: DeckSheetMakeup[], bar: Rect): (Rect & { color: string })[]
```

`PositionedSection` and `DeckSheetSection` are deleted.

- [ ] **Step 1: Write the failing layout tests**

In `core/test/deck-sheet.test.ts`:
- Delete every test from `renders a title from deck name and format label` through
  `advances past a header-only section (Main deck heading with no cards)`. That covers
  the old layout tests, the `cell`/`hcell` helpers and the old geometry tests.
- Replace the `labels` constant.
- Add `artCropVersion` to `harry`.

```ts
const labels = {
  formatLabel: { classic: 'Classic', revival: 'Revival' },
  mainDeck: 'Main deck',
  sideboard: 'Sideboard',
  cards: 'cards',
  startingCharacter: 'Starting character',
  group: (k: string): string => ({ spell: 'Spells', item: 'Items', lesson: 'Lessons' } as Record<string, string>)[k] ?? k,
}
```

Change `harry` to `artCropVersion: 1_783_899_940` (it stays a `horizontal` character).
Then add:

```ts
const card = (v: DeckCardView) => ({
  cardId: v.cardId, quantity: v.quantity, name: v.name, setCode: v.setCode,
  imageVersion: v.imageVersion, orientation: v.orientation ?? null,
})
const full = [harry, accio, charmsLesson, item, sideCard]

describe('layoutDeckSheet', () => {
  it('puts the character in the banner and in no zone', () => {
    const { banner, zones } = layoutDeckSheet({ name: 'D', format: 'revival' }, full, labels)
    expect(banner.character).toEqual({ card: card(harry), label: 'Starting character', artCropVersion: 1_783_899_940 })
    const ids = zones.flatMap((z) => z.groups.flatMap((g) => g.cards.map((c) => c.cardId)))
    expect(ids).not.toContain('bs-harry')
  })

  it('names the deck without the format suffix and counts the main deck in the eyebrow', () => {
    const { banner } = layoutDeckSheet({ name: 'Charms Aggro', format: 'revival' }, full, labels)
    expect(banner.name).toBe('Charms Aggro')
    // The character and the sideboard are not part of the main deck's 12.
    expect(banner.eyebrow).toBe('REVIVAL · 12 CARDS')
  })

  it('builds the makeup from the main zone only, in group order', () => {
    const { banner } = layoutDeckSheet({ name: 'D', format: 'classic' }, full, labels)
    expect(banner.makeup).toEqual([
      { key: 'spell', label: 'Spells', count: 4, color: DECK_SHEET_COLORS.group.spell },
      { key: 'item', label: 'Items', count: 2, color: DECK_SHEET_COLORS.group.item },
      { key: 'lesson', label: 'Lessons', count: 6, color: DECK_SHEET_COLORS.group.lesson },
    ])
  })

  it('groups the main zone by type and lists the sideboard as one untitled group', () => {
    const { zones } = layoutDeckSheet({ name: 'D', format: 'classic' }, full, labels)
    expect(zones).toEqual([
      {
        title: 'MAIN DECK', count: 12, groups: [
          { key: 'spell', title: 'SPELLS', count: 4, color: DECK_SHEET_COLORS.group.spell, cards: [card(accio)] },
          { key: 'item', title: 'ITEMS', count: 2, color: DECK_SHEET_COLORS.group.item, cards: [card(item)] },
          { key: 'lesson', title: 'LESSONS', count: 6, color: DECK_SHEET_COLORS.group.lesson, cards: [card(charmsLesson)] },
        ],
      },
      {
        title: 'SIDEBOARD', count: 1, groups: [
          { key: 'sideboard', title: null, count: 1, color: DECK_SHEET_COLORS.group[OTHER_GROUP], cards: [card(sideCard)] },
        ],
      },
    ])
  })

  it('has no zones and no makeup for a deck that is only a character', () => {
    const { banner, zones } = layoutDeckSheet({ name: 'D', format: 'classic' }, [harry], labels)
    expect(zones).toEqual([])
    expect(banner.makeup).toEqual([])
    expect(banner.eyebrow).toBe('CLASSIC · 0 CARDS')
  })

  it('has no character when the deck has none', () => {
    expect(layoutDeckSheet({ name: 'D', format: 'classic' }, [accio], labels).banner.character).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing geometry tests**

Add below the layout tests. The numbers are worked out from the Global Constraints
values, and each comment shows the arithmetic:

```ts
const p = (id: string, quantity = 1): DeckSheetCard => ({ cardId: id, quantity, name: id, setCode: 'BS', imageVersion: 1, orientation: null })
const l = (id: string): DeckSheetCard => ({ ...p(id), orientation: 'horizontal' })
const group = (key: string, cards: DeckSheetCard[], title: string | null = key.toUpperCase()) =>
  ({ key, title, count: cards.length, color: '#000000', cards })
const sheet = (groups: ReturnType<typeof group>[], character: DeckSheetCard | null = null): DeckSheetLayout => ({
  banner: { name: 'D', eyebrow: 'E', makeup: [], character: character && { card: character, label: 'S', artCropVersion: null } },
  zones: [{ title: 'MAIN DECK', count: 0, groups }],
})

describe('computeSheetGeometry', () => {
  it('is 1440 wide with the first zone below the banner', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    expect(geom.width).toBe(1440)
    // banner 320 + zone gap 24
    expect(geom.zones[0].headerY).toBe(344)
    // header 344 + 44 = line top 388; label 22 + gap 10 = cards at 420
    expect(geom.zones[0].groups[0].labelY).toBe(388)
    expect(geom.zones[0].groups[0].cards[0]).toEqual({ card: p('a'), x: 40, y: 420, w: 112, h: 157 })
    // line 420 + 157 - 388 = 189; y = 388 + 189 + 24 = 601; height = 601 - 24 + footer 72
    expect(geom.height).toBe(649)
  })

  it('makes a row of landscape cards only as tall as a landscape card', () => {
    const geom = computeSheetGeometry(sheet([group('creature', [l('a'), l('b')])]))
    expect(geom.zones[0].groups[0].cards[1]).toEqual({ card: l('b'), x: 213, y: 420, w: 157, h: 112 }) // 40 + 157 + 16
    expect(geom.height).toBe(604) // 649 - (157 - 112)
  })

  it('bottom-aligns a landscape card in a row with a portrait one', () => {
    const geom = computeSheetGeometry(sheet([group('item', [p('a'), l('b')])]))
    expect(geom.zones[0].groups[0].cards[1]).toMatchObject({ x: 168, y: 465 }) // 40+112+16; 420+157-112
  })

  it('packs a second group beside the first when it fits', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a'), p('b'), p('c')]), group('item', [p('d')])]))
    // 3 x 112 + 2 x 16 = 368; next group at 40 + 368 + 36
    expect(geom.zones[0].groups[1]).toMatchObject({ x: 444, labelY: 388 })
    expect(geom.zones[0].groups[1].cards[0]).toMatchObject({ x: 444, y: 420 })
  })

  it('starts a new line when the next group does not fit', () => {
    const nine = Array.from({ length: 9 }, (_, i) => p(`s${i}`))
    const geom = computeSheetGeometry(sheet([group('spell', nine), group('item', [p('x'), p('y')])]))
    // 9 cards end at 40 + 1136 = 1176; + 36 = 1212; two cards (240) would end at 1452 > 1400
    // new line top = 388 + 189 + 24 = 601; cards at 601 + 32
    expect(geom.zones[0].groups[1]).toMatchObject({ x: 40, labelY: 601 })
    expect(geom.zones[0].groups[1].cards[0]).toMatchObject({ x: 40, y: 633 })
  })

  it('wraps an oversize group inside itself at ten portrait cards a row', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => p(`s${i}`))
    const geom = computeSheetGeometry(sheet([group('spell', twelve)]))
    // 40 + 10 x 112 + 9 x 16 = 1304 fits; an eleventh would end at 1432 > 1400
    expect(geom.zones[0].groups[0].cards[10]).toMatchObject({ x: 40, y: 597 }) // 420 + 157 + 20
  })

  it('skips the label band for an untitled group', () => {
    const geom = computeSheetGeometry(sheet([group('sideboard', [p('a')], null)]))
    expect(geom.zones[0].groups[0].cards[0].y).toBe(398) // 388 + 10
  })

  it('places the banner card, the text column and the bar', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])], l('hero')))
    expect(geom.banner).toEqual({
      art: { x: 560, y: 0, w: 880, h: 320 },
      card: { card: l('hero'), x: 40, y: 40, w: 224, h: 160 },
      textX: 290, textWidth: 560,
      bar: { x: 40, y: 254, w: 1360, h: 10 },
      legendY: 274,
    })
  })

  it('moves the text left and widens it when there is no character', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    expect(geom.banner).toMatchObject({ card: null, textX: 40, textWidth: 1000 })
  })

  it('is banner plus footer for a deck with no zones', () => {
    const geom = computeSheetGeometry({ ...sheet([], l('hero')), zones: [] })
    expect(geom.zones).toEqual([])
    expect(geom.height).toBe(392) // 320 + 72
  })

  it('puts the logo in the footer, right-aligned', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    // 34 tall, 34 x 262 / 78 = 114 wide; centred in the 72px footer of a 649 sheet
    expect(geom.logo).toEqual({ x: 1286, y: 596, w: 114, h: 34 })
  })
})

describe('makeupSegments', () => {
  it('splits the bar by count with 2px gaps and ends flush', () => {
    const segs = makeupSegments(
      [{ key: 'a', label: 'A', count: 3, color: '#111111' }, { key: 'b', label: 'B', count: 1, color: '#222222' }],
      { x: 40, y: 254, w: 1360, h: 10 },
    )
    // free = 1360 - 2 = 1358; round(0.75 x 1358) = 1019; the last takes the rest
    expect(segs).toEqual([
      { x: 40, y: 254, w: 1019, h: 10, color: '#111111' },
      { x: 1061, y: 254, w: 339, h: 10, color: '#222222' },
    ])
  })

  it('draws nothing for an empty main deck', () => {
    expect(makeupSegments([], { x: 40, y: 254, w: 1360, h: 10 })).toEqual([])
  })
})
```

Update the imports at the top of the file:

```ts
import {
  DECK_SHEET, DECK_SHEET_COLORS, layoutDeckSheet, computeSheetGeometry, makeupSegments,
  type DeckSheetCard, type DeckSheetLayout,
} from '../src/deck-sheet.js'
```

In `describe('sheetLabels', ...)`, replace `expect(en.character).toBe('Character')` with:

```ts
    expect(en.cards).toBe('cards')
    expect(en.startingCharacter).toBe('Starting character')
```

and add to the German test:

```ts
    expect(de.cards).toBe('Karten')
    expect(de.startingCharacter).toBe('Startcharakter')
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w @revelio/core -- test/deck-sheet.test.ts`
Expected: FAIL. There are type and import errors for `makeupSegments`,
`DECK_SHEET_COLORS.group` and `banner`.

- [ ] **Step 4: Update the label catalogs**

In `core/src/messages/en.json`, set the `deckSheet` scope to:

```json
  "deckSheet": {
    "mainDeck": "Main deck",
    "sideboard": "Sideboard",
    "cards": "cards",
    "startingCharacter": "Starting character"
  },
```

and in `core/src/messages/de.json`:

```json
  "deckSheet": {
    "mainDeck": "Hauptdeck",
    "sideboard": "Sideboard",
    "cards": "Karten",
    "startingCharacter": "Startcharakter"
  },
```

- [ ] **Step 5: Replace the layout half of `core/src/deck-sheet.ts`**

Keep everything from the top of the file through `DeckSheetRequest` and its type (the
contract) unchanged. Replace everything after `export type DeckSheetRequest = ...` with
the following. `cardCell` and `pickSheetEntries` keep their bodies; `pickSheetEntries`
already has Task 1's `artCropVersion` line.

```ts
export type DeckSheetCard = {
  cardId: string
  quantity: number
  name: string
  setCode: string
  imageVersion: number | null
  orientation: string | null
}

// One segment of the banner's makeup bar and its legend entry.
export type DeckSheetMakeup = { key: string; label: string; count: number; color: string }

// The hero banner. `character` is null for a deck without one; its
// artCropVersion is null when the card has no crop, which the painter answers
// with the glow fallback rather than a different layout.
export type DeckSheetBanner = {
  name: string
  eyebrow: string
  character: { card: DeckSheetCard; label: string; artCropVersion: number | null } | null
  makeup: DeckSheetMakeup[]
}

// `title` is null for the sideboard's single group: the zone header names it.
export type DeckSheetGroup = { key: string; title: string | null; count: number; color: string; cards: DeckSheetCard[] }
export type DeckSheetZone = { title: string; count: number; groups: DeckSheetGroup[] }
export type DeckSheetLayout = { banner: DeckSheetBanner; zones: DeckSheetZone[] }

// Localized labels for the sheet, resolved by sheetLabels from core's own
// catalog. `group` maps a deck-groups type key (creature, spell, ..., or
// OTHER_GROUP) to its localized plural label.
export type DeckSheetLabels = {
  formatLabel: Record<DeckFormat, string>
  mainDeck: string
  sideboard: string
  cards: string
  startingCharacter: string
  group: (key: string) => string
}

export type Rect = { x: number; y: number; w: number; h: number }
// `x`/`y` are the top-left of the drawn card box; `w`/`h` its size - portrait
// cards are cardWidth x cardHeight, horizontal cards the same card turned
// upright. Cards sit on the bottom edge of their row.
export type PositionedCard = { card: DeckSheetCard; x: number; y: number; w: number; h: number }
// `x` is the group's left edge and `labelY` the top of its label band (or of its
// cards, for an untitled group).
export type PositionedGroup = { key: string; title: string | null; count: number; color: string; x: number; labelY: number; cards: PositionedCard[] }
export type PositionedZone = { title: string; count: number; headerY: number; groups: PositionedGroup[] }
export type PositionedBanner = { art: Rect; card: PositionedCard | null; textX: number; textWidth: number; bar: Rect; legendY: number }
export type SheetGeometry = { width: number; height: number; banner: PositionedBanner; zones: PositionedZone[]; logo: Rect }

export const DECK_SHEET_COLORS = {
  background: '#13122A',
  panel: '#1C1838',
  border: '#2E2A50',
  gold: '#E8B23A',
  goldLight: '#F6D58B',
  mutedAccent: '#8C88A8',
  parchment: '#FBF3DC',
  // Makeup bar and legend swatch per deck-groups key. Fixed so a type is the
  // same colour on every sheet; Lessons, the resource base, are the one gold.
  group: {
    creature: '#6E66C9',
    spell: '#8C88A8',
    item: '#4B4486',
    adventure: '#B9B3D9',
    location: '#5A5390',
    event: '#9A93D6',
    match: '#3B3194',
    character: '#7D78A6',
    [OTHER_GROUP]: '#57537A',
    lesson: '#E8B23A',
  } as Record<string, string>,
} as const

// Layout pixels; the painter multiplies by DECK_SHEET.scale (or less, inside
// the pixel budget). Values are spec section 3 and 4 and mock B.
export const DECK_SHEET = {
  scale: 2,
  width: 1440,
  padding: 40,
  bannerHeight: 320,
  // The art area is right-aligned and full height. focusY is how much of the
  // crop's spare height is cut from the top: faces sit high in the crops.
  art: { width: 880, focusY: 0.3 },
  heroCard: { x: 40, y: 40, w: 224, h: 160 },
  text: { xWithCard: 290, widthWithCard: 560, widthAlone: 1000, eyebrowY: 58, titleY: 84, subtitleY: 146 },
  bar: { y: 254, height: 10, gap: 2, legendY: 274 },
  zoneGap: 24,
  zoneHeaderHeight: 44,
  groupLabelHeight: 22,
  // Also the room above a row for the stacked-copy outlines (two x stackOffset).
  groupLabelGap: 10,
  groupGapX: 36,
  groupGapY: 24,
  // Portrait card box, 5:7.
  cardWidth: 112,
  cardHeight: 157,
  cardRadius: 6,
  cardGapX: 16,
  // Leaves room for the chip that overhangs each card's bottom edge.
  cardGapY: 20,
  stackOffset: 5,
  chip: { height: 26, minWidth: 30, padX: 7, overhangX: 6, overhangY: 8 },
  footerHeight: 72,
  // logos/revelio-logo-dark.svg is 262 x 78.
  logo: { height: 34, aspect: 262 / 78 },
  fontSize: { eyebrow: 12, title: 44, subtitle: 15, legend: 12, zone: 13, group: 12, chipSign: 11, chip: 14, placeholder: 12 },
  tracking: { eyebrow: 0.2, zone: 0.2, group: 0.14 },
} as const

const CONTENT_W = DECK_SHEET.width - DECK_SHEET.padding * 2
const CONTENT_RIGHT = DECK_SHEET.padding + CONTENT_W

function groupColor(key: string): string {
  return DECK_SHEET_COLORS.group[key] ?? DECK_SHEET_COLORS.group[OTHER_GROUP]
}

function cardCell(v: DeckSheetEntry): DeckSheetCard {
  return {
    cardId: v.cardId,
    quantity: v.quantity,
    name: v.name,
    setCode: v.setCode,
    imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
  }
}

// Drawn box size for a card: horizontal cards render as an upright landscape card.
function cardBox(card: DeckSheetCard): { w: number; h: number } {
  return card.orientation === 'horizontal'
    ? { w: DECK_SHEET.cardHeight, h: DECK_SHEET.cardWidth }
    : { w: DECK_SHEET.cardWidth, h: DECK_SHEET.cardHeight }
}

function naturalWidth(cards: DeckSheetCard[]): number {
  return cards.reduce((w, c) => w + cardBox(c).w, 0) + DECK_SHEET.cardGapX * Math.max(0, cards.length - 1)
}

const sum = (list: { quantity: number }[]) => list.reduce((n, e) => n + e.quantity, 0)

// One group's cards from (left, top), wrapping at the content's right edge. A
// row is as tall as its tallest card and cards sit on its bottom edge, so a
// row of landscape cards does not keep a portrait row's empty band.
function placeCards(cards: DeckSheetCard[], left: number, top: number): { cards: PositionedCard[]; width: number; height: number } {
  if (!cards.length) return { cards: [], width: 0, height: 0 }
  const rows: { card: DeckSheetCard; x: number; w: number; h: number }[][] = [[]]
  let x = left
  let width = 0
  for (const card of cards) {
    const { w, h } = cardBox(card)
    if (x > left && x + w > CONTENT_RIGHT) { rows.push([]); x = left }
    rows[rows.length - 1].push({ card, x, w, h })
    width = Math.max(width, x + w - left)
    x += w + DECK_SHEET.cardGapX
  }
  const placed: PositionedCard[] = []
  let y = top
  for (const row of rows) {
    const rowH = Math.max(...row.map((c) => c.h))
    for (const c of row) placed.push({ card: c.card, x: c.x, y: y + rowH - c.h, w: c.w, h: c.h })
    y += rowH + DECK_SHEET.cardGapY
  }
  return { cards: placed, width, height: y - DECK_SHEET.cardGapY - top }
}

function bannerGeometry(layout: DeckSheetLayout): PositionedBanner {
  const { width, padding, bannerHeight, art, heroCard, text, bar } = DECK_SHEET
  const character = layout.banner.character
  return {
    art: { x: width - art.width, y: 0, w: art.width, h: bannerHeight },
    card: character ? { card: character.card, ...heroCard } : null,
    textX: character ? text.xWithCard : padding,
    textWidth: character ? text.widthWithCard : text.widthAlone,
    bar: { x: padding, y: bar.y, w: CONTENT_W, h: bar.height },
    legendY: bar.legendY,
  }
}

/**
 * The sheet's labels for one locale, resolved from core's own catalog. The
 * render service calls this instead of taking labels in its request: the sheet
 * is cached on its input, and translations in that input would mean a label
 * change in one caller's catalog silently renders a different picture.
 *
 * Record<DeckFormat, string> is what makes a new format a type error here
 * rather than a missing title at render time.
 */
export function sheetLabels(locale: string): DeckSheetLabels {
  return {
    formatLabel: {
      classic: attrLabel('formats', 'classic', locale),
      revival: attrLabel('formats', 'revival', locale),
    },
    mainDeck: attrLabel('deckSheet', 'mainDeck', locale),
    sideboard: attrLabel('deckSheet', 'sideboard', locale),
    cards: attrLabel('deckSheet', 'cards', locale),
    startingCharacter: attrLabel('deckSheet', 'startingCharacter', locale),
    group: (key) => attrLabel('deckGroups', key === OTHER_GROUP ? 'other' : key, locale),
  }
}

// (pickSheetEntries stays here unchanged, with its doc comment.)

/**
 * Splits a deck into the banner and its zones. The character appears only in
 * the banner: it is not one of the main deck's cards, so neither the zone
 * counts nor the makeup bar include it. Main-zone groups reuse the deck view's
 * type grouping (groupMainEntries), so the sheet matches the builder, with
 * Lessons last. Cards keep the order they arrive in within a group.
 */
export function layoutDeckSheet(
  deck: { name: string; format: DeckFormat },
  entries: DeckSheetEntry[],
  labels: DeckSheetLabels,
): DeckSheetLayout {
  const characterEntry = entries.find((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainCount = sum(main)

  const groups: DeckSheetGroup[] = [...groupMainEntries(main)].map(([key, list]) => ({
    key, title: labels.group(key).toUpperCase(), count: sum(list), color: groupColor(key), cards: list.map(cardCell),
  }))

  const zones: DeckSheetZone[] = []
  if (main.length) zones.push({ title: labels.mainDeck.toUpperCase(), count: mainCount, groups })
  if (sideboard.length) {
    zones.push({
      title: labels.sideboard.toUpperCase(),
      count: sum(sideboard),
      groups: [{ key: 'sideboard', title: null, count: sum(sideboard), color: groupColor(OTHER_GROUP), cards: sideboard.map(cardCell) }],
    })
  }

  return {
    banner: {
      name: deck.name,
      // A separator instead of "Classic deck", so no locale has to inflect the
      // format name.
      eyebrow: `${labels.formatLabel[deck.format]} · ${mainCount} ${labels.cards}`.toUpperCase(),
      character: characterEntry
        ? { card: cardCell(characterEntry), label: labels.startingCharacter, artCropVersion: characterEntry.artCropVersion ?? null }
        : null,
      makeup: groups.map((g) => ({ key: g.key, label: labels.group(g.key), count: g.count, color: g.color })),
    },
    zones,
  }
}

/**
 * Positions everything on the sheet. Below the banner, each zone is a header
 * followed by its groups packed left to right as inline blocks: a group that
 * does not fit what is left of the line starts a new one, a group wider than
 * the content takes a line of its own and wraps inside it, and a line is as
 * tall as its tallest group. Greedy and order-keeping on purpose - the group
 * order is information (Lessons last), which outranks a few pixels of gap.
 */
export function computeSheetGeometry(layout: DeckSheetLayout): SheetGeometry {
  const D = DECK_SHEET
  const zones: PositionedZone[] = []
  let y = D.bannerHeight + D.zoneGap
  for (const zone of layout.zones) {
    const headerY = y
    let lineTop = y + D.zoneHeaderHeight
    let lineH = 0
    let x = D.padding
    const groups: PositionedGroup[] = []
    for (const g of zone.groups) {
      if (x > D.padding && x + naturalWidth(g.cards) > CONTENT_RIGHT) {
        x = D.padding
        lineTop += lineH + D.groupGapY
        lineH = 0
      }
      const cardsTop = lineTop + (g.title === null ? 0 : D.groupLabelHeight) + D.groupLabelGap
      const placed = placeCards(g.cards, x, cardsTop)
      groups.push({ key: g.key, title: g.title, count: g.count, color: g.color, x, labelY: lineTop, cards: placed.cards })
      lineH = Math.max(lineH, cardsTop + placed.height - lineTop)
      x += placed.width + D.groupGapX
    }
    zones.push({ title: zone.title, count: zone.count, headerY, groups })
    y = lineTop + lineH + D.zoneGap
  }
  const height = (zones.length ? y - D.zoneGap : D.bannerHeight) + D.footerHeight
  const logoW = Math.round(D.logo.height * D.logo.aspect)
  return {
    width: D.width,
    height,
    banner: bannerGeometry(layout),
    zones,
    logo: { x: D.width - D.padding - logoW, y: height - D.footerHeight / 2 - D.logo.height / 2, w: logoW, h: D.logo.height },
  }
}

/**
 * The makeup bar's segments: one per group, sized by count, 2px apart. Widths
 * are rounded and the last segment takes the remainder, so the bar always ends
 * flush with the content edge whatever the rounding did.
 */
export function makeupSegments(makeup: DeckSheetMakeup[], bar: Rect): (Rect & { color: string })[] {
  const total = makeup.reduce((n, m) => n + m.count, 0)
  if (!total) return []
  const free = bar.w - DECK_SHEET.bar.gap * (makeup.length - 1)
  let x = bar.x
  let used = 0
  return makeup.map((m, i) => {
    const w = i === makeup.length - 1 ? free - used : Math.round((m.count / total) * free)
    const segment = { x, y: bar.y, w, h: bar.h, color: m.color }
    x += w + DECK_SHEET.bar.gap
    used += w
    return segment
  })
}
```

Notes for the implementer:
- `sum` is a module constant holding a function. Under the declaration-order rule it sits
  with the helpers. If lint objects, turn it into `function sum(...)`.
- Update the file's header comment to say "banner, zones and geometry" instead of
  "grouping, geometry and colours", and drop the "Geometry is in CSS pixels" sentence
  that is now on `DECK_SHEET`.
- The logo `y` is `649 - 36 - 17 = 596` for the 649 sheet in the test.

- [ ] **Step 6: Run core tests to verify they pass**

Run: `npm test -w @revelio/core`
Expected: PASS, including `labels.test.ts` catalog parity.

- [ ] **Step 7: Typecheck core only**

Run: `npm run typecheck -w @revelio/core`
Expected: no errors. `sheet` does not compile yet; Task 4 fixes it.

- [ ] **Step 8: Commit**

```bash
git add core/src/deck-sheet.ts core/src/messages/en.json core/src/messages/de.json core/test/deck-sheet.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(core): lay the deck sheet out as a banner and packed groups"
```

---

### Task 4: Paint the banner, packed grid, stacked copies and chips

**Files:**
- Modify: `sheet/src/render.ts`
- Test: `sheet/test/render.test.ts`

**Interfaces:**
- Consumes: everything Task 3 produces, and `TextStyle.tracking` (Task 2). `artCropKey`
  comes from `@revelio/core`.
- Produces: `renderSheet(req, opts): Promise<SheetRender>`, with the same signature and
  the same `SheetRender` fields. `dropped` now also counts a banner art crop that failed
  to fetch or decode.

- [ ] **Step 1: Write the failing tests**

In `sheet/test/render.test.ts`:
- Give `harry` in `entries` an art crop:
  `entry('harry', 'character', ['character'], { quantity: 1, orientation: 'horizontal', artCropVersion: 9 })`.
- Add a pixel helper below `recordingFetch`.
- Add the new tests inside `describe('renderSheet', ...)`.

```ts
// RGB of one layout-pixel position on a rendered sheet.
async function pixelAt(png: Buffer, x: number, y: number, s: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const i = (Math.round(y * s) * info.width + Math.round(x * s)) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const near = ([r, g, b]: number[], hex: string, tol = 24) =>
  [1, 3, 5].every((o, k) => Math.abs([r, g, b][k] - parseInt(hex.slice(o, o + 2), 16)) <= tol)
```

```ts
  it('fetches the character art crop and paints it on the banner', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet(req, opts)
    expect(urls).toContain('https://img.test/cards/art-crop/harry.9.webp')
    // Far right of the banner, above the bottom fade: the crop shows through as is.
    expect(near(await pixelAt(out.body, 1400, 60, out.scale), '#6E66C9')).toBe(true)
  })

  it('draws the glow instead when the character has no crop, and asks for none', async () => {
    const urls = recordingFetch(await art())
    const noCrop = { ...req, entries: req.entries.map((e) => ({ ...e, artCropVersion: null })) }
    const out = await renderSheet(noCrop, opts)
    expect(urls.some((u) => u.includes('/art-crop/'))).toBe(false)
    expect(near(await pixelAt(out.body, 1400, 60, out.scale), '#6E66C9')).toBe(false)
  })

  it('counts a failed crop as dropped and still renders', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/art-crop/') ? new Response('nope', { status: 404 }) : new Response(await art(), { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await renderSheet(req, opts)
    expect(out.dropped).toBe(1)
    expect(warn.mock.calls.flat().join(' ')).toContain('no banner art for harry')
  })

  it('renders a deck without a character', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet({ ...req, entries: req.entries.filter((e) => e.zone !== 'character') }, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
    expect(urls.some((u) => u.includes('harry'))).toBe(false)
  })

  // Review focus 3: no zones at all.
  it('renders a deck that is only a character', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const only = { ...req, entries: req.entries.filter((e) => e.zone === 'character') }
    const out = await renderSheet(only, opts)
    const meta = await sharp(out.body).metadata()
    expect(meta.height).toBe(Math.floor((DECK_SHEET.bannerHeight + DECK_SHEET.footerHeight) * out.scale))
  })

  // Review focus 1 and 2: the widest title and the widest chip must stay on the
  // canvas - sharp rejects an overlay that runs past its edge, which would fail
  // the whole render.
  it('fits the longest deck name and a 999 chip on the canvas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const wide = {
      ...req,
      deck: { ...req.deck, name: 'W'.repeat(120) },
      entries: [...req.entries, ...Array.from({ length: 9 }, (_, i) => entry(`q${i}`, 'main', ['spell'], { quantity: 999 }))],
    }
    expect((await sharp((await renderSheet(wide, opts)).body).metadata()).format).toBe('png')
    const alone = { ...wide, entries: wide.entries.filter((e) => e.zone !== 'character') }
    expect((await sharp((await renderSheet(alone, opts)).body).metadata()).format).toBe('png')
  })

  // Review focus 4 and 5: every group, German labels, and a one-card group whose
  // label is wider than its card landing in the last column.
  it('keeps every legend item and group label inside the canvas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const types = ['creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'lesson', 'unknown_type']
    const every: DeckSheetRequest = {
      ...req, locale: 'de',
      entries: [
        ...Array.from({ length: 9 }, (_, i) => entry(`fill${i}`, 'main', ['creature'])),
        ...types.map((t) => entry(`one-${t}`, 'main', [t], { quantity: 999 })),
      ],
    }
    expect((await sharp((await renderSheet(every, opts)).body).metadata()).format).toBe('png')
  })
```

Also update the existing `still renders when every card image fails, and counts the drops`
expectation. Every fetch returns 500, so the crop fails as well:

```ts
    expect(out.dropped).toBe(out.distinct) // every distinct card but 'noimg', plus the crop
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/sheet -- test/render.test.ts`
Expected: FAIL. It does not compile: `render.ts` still reads `geom.sections` and
`layout.title`.

- [ ] **Step 3: Rewrite the painter in `sheet/src/render.ts`**

These parts stay as they are:
- `SheetRenderOptions` and `SheetRender`
- `CardImageResult`
- the fetch constants and `MAX_SHEET_PIXELS` / `PNG_BYTES_PER_MEGAPIXEL`
- `pixelBudget`, `resolveBudget`, `sheetScale`, `usesFullArt`
- `px`, `canvasSize`, `containedImageUrl`
- the encode tail of `renderSheet`, from `const encodeStarted` to the end

Update the imports:

```ts
import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  artCropKey,
  computeSheetGeometry,
  imageKey,
  imageUrl,
  layoutDeckSheet,
  makeupSegments,
  mapLimit,
  sheetLabels,
  thumbKey,
  type DeckSheetBanner,
  type DeckSheetCard,
  type DeckSheetLayout,
  type DeckSheetRequest,
  type PositionedCard,
  type Rect,
  type SheetGeometry,
} from '@revelio/core'
import { fitText, renderText, type RenderedText, type TextStyle } from './text'
```

Add after `CardImageResult`:

```ts
// Shapes that can only be placed once their text is measured: chip pills,
// legend swatches and the rules beside zone headers. Device pixels.
type Decor = { pills: Rect[]; swatches: (Rect & { color: string })[]; rules: Rect[] }
type TextLayer = { overlays: OverlayOptions[]; decor: Decor }
```

Replace `fetchCardImage` with a key-level fetch and a card wrapper. The body is today's
`fetchCardImage` from `const left = ...` onwards, with the URL built from `key`:

```ts
// `deadline` is an epoch millisecond, shared by every fetch in one render, and
// clamping each request's own timeout to what is left of it is what holds the
// phase to its budget rather than to the budget plus one more timeout.
async function fetchKey(
  key: string,
  imageBase: string,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<CardImageResult> {
  const left = deadline - Date.now()
  if (left <= 0) return { failure: BUDGET_SPENT }
  // The reason names the key's card, never the resolved URL: the image base can
  // be an internal hostname and this ends up in a log line.
  const url = containedImageUrl(imageBase, key)
  if (url === null) return { failure: 'key resolves outside the configured image base' }
  try {
    const timeout = AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left))
    const res = await fetch(url, { signal: signal ? AbortSignal.any([timeout, signal]) : timeout })
    if (!res.ok) return { failure: `HTTP ${res.status}` }
    return { body: Buffer.from(await res.arrayBuffer()) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

function fetchCardImage(
  card: DeckSheetCard,
  imageBase: string,
  fullArt: boolean,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<CardImageResult> {
  if (card.imageVersion == null) return Promise.resolve({ failure: null })
  const key = fullArt ? imageKey : thumbKey
  return fetchKey(key(card.cardId, card.imageVersion), imageBase, deadline, signal)
}
```

Round the card images. In `cardImage`, after `.resize(w, h, { fit: 'cover' })`, add
`.composite([{ input: roundedMask(w, h, radius), blend: 'dest-in' }])`. `cardImage`
takes a `radius` parameter (device px):

```ts
// Alpha mask for a rounded card: dest-in keeps the image only where this is opaque.
function roundedMask(w: number, h: number, r: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`)
}

async function cardImage(source: Buffer, w: number, h: number, upright: boolean, radius: number): Promise<CardImageResult> {
  try {
    const pipeline = sharp(source)
    if (upright) pipeline.rotate(90)
    return {
      body: await pipeline.resize(w, h, { fit: 'cover' })
        .composite([{ input: roundedMask(w, h, radius), blend: 'dest-in' }])
        .png().toBuffer(),
    }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}
```

Change `cardOverlays` to take the positioned cards directly instead of
`sections: PositionedSection[]`. Its first line becomes the parameter:

```ts
async function cardOverlays(
  positioned: PositionedCard[],
  imageBase: string,
  s: number,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<{ overlays: OverlayOptions[]; dropped: number; distinct: number }> {
  const distinct = [...new Set(positioned.map((pc) => pc.card.cardId))]
```

Inside it, the `cardImage(...)` call passes `px(DECK_SHEET.cardRadius, s)` as the new
last argument. The placeholder font size becomes `DECK_SHEET.fontSize.placeholder`.
Everything else in `cardOverlays` is unchanged.

Add the banner art:

```ts
/**
 * The art crop cut to the banner's art area: scaled to cover it, centred
 * horizontally, and cut focusY of the spare height from the top rather than
 * the middle, because the crops put faces high.
 */
async function coverFocused(source: Buffer, w: number, h: number): Promise<Buffer> {
  const meta = await sharp(source).metadata()
  const k = Math.max(w / meta.width!, h / meta.height!)
  const rw = Math.max(w, Math.ceil(meta.width! * k))
  const rh = Math.max(h, Math.ceil(meta.height! * k))
  return sharp(source)
    .resize(rw, rh)
    .extract({ left: Math.floor((rw - w) / 2), top: Math.round((rh - h) * DECK_SHEET.art.focusY), width: w, height: h })
    .png()
    .toBuffer()
}

// The banner's art overlay, or null for the glow fallback. A crop that fails to
// fetch or decode counts as one dropped image, like a card's.
async function bannerArt(
  banner: DeckSheetBanner,
  area: Rect,
  imageBase: string,
  s: number,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<{ overlay: OverlayOptions | null; dropped: number }> {
  const character = banner.character
  if (!character || character.artCropVersion === null) return { overlay: null, dropped: 0 }
  const id = character.card.cardId
  const fetched = await fetchKey(artCropKey(id, character.artCropVersion), imageBase, Date.now() + budgetMs, signal)
  if (!('body' in fetched)) {
    console.warn(`deck image: no banner art for ${id}: ${fetched.failure}`)
    return { overlay: null, dropped: 1 }
  }
  try {
    const input = await coverFocused(fetched.body, px(area.w, s), px(area.h, s))
    return { overlay: { input, left: px(area.x, s), top: px(area.y, s) }, dropped: 0 }
  } catch (err) {
    console.warn(`deck image: could not decode banner art for ${id}: ${err instanceof Error ? err.message : String(err)}`)
    return { overlay: null, dropped: 1 }
  }
}
```

Replace `chromeSvg` and `badgeSvg` with three SVG builders. All coordinates are device
px. `svg()` wraps the parts:

```ts
function svg(geom: SheetGeometry, s: number, parts: string[]): Buffer {
  const { w, h } = canvasSize(geom, s)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`)
}

// Under everything: the midnight sheet, the glow when there is no art, the
// banner card's shadow and gold ring, each card's stacked-copy outlines and
// placeholder box, and the makeup bar.
function baseSvg(geom: SheetGeometry, layout: DeckSheetLayout, s: number, hasArt: boolean): Buffer {
  const C = DECK_SHEET_COLORS
  const r = px(DECK_SHEET.cardRadius, s)
  const { w, h } = canvasSize(geom, s)
  const parts = [
    `<defs>` +
      `<radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>` +
      `<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${12 * s}"/></filter>` +
      `<clipPath id="bar"><rect x="${px(geom.banner.bar.x, s)}" y="${px(geom.banner.bar.y, s)}" width="${px(geom.banner.bar.w, s)}" height="${px(geom.banner.bar.h, s)}" rx="${px(geom.banner.bar.h / 2, s)}"/></clipPath>` +
    `</defs>`,
    `<rect width="${w}" height="${h}" fill="${C.background}"/>`,
  ]
  if (!hasArt) parts.push(`<circle cx="${px(DECK_SHEET.width - 300, s)}" cy="${px(140, s)}" r="${px(420, s)}" fill="url(#glow)"/>`)
  const hero = geom.banner.card
  if (hero) {
    parts.push(
      `<rect x="${px(hero.x, s)}" y="${px(hero.y + 14, s)}" width="${px(hero.w, s)}" height="${px(hero.h, s)}" fill="#000" opacity="0.6" filter="url(#shadow)"/>`,
      `<rect x="${px(hero.x - 2, s)}" y="${px(hero.y - 2, s)}" width="${px(hero.w + 4, s)}" height="${px(hero.h + 4, s)}" rx="${px(8, s)}" fill="${C.gold}"/>`,
    )
  }
  const box = (pc: PositionedCard, dx: number, dy: number) =>
    `<rect x="${px(pc.x + dx, s) + 0.5}" y="${px(pc.y - dy, s) + 0.5}" width="${px(pc.w, s) - 1}" height="${px(pc.h, s) - 1}"` +
    ` rx="${r}" fill="${C.panel}" stroke="${C.border}" stroke-width="1"/>`
  for (const zone of geom.zones) {
    for (const group of zone.groups) {
      for (const pc of group.cards) {
        // Farthest copy first, so the nearer one and then the face cover it.
        const off = DECK_SHEET.stackOffset
        if (pc.card.quantity >= 3) parts.push(box(pc, off * 2, off * 2))
        if (pc.card.quantity >= 2) parts.push(box(pc, off, off))
        parts.push(box(pc, 0, 0))
      }
    }
  }
  if (hero) parts.push(box(hero, 0, 0))
  const segments = makeupSegments(layout.banner.makeup, geom.banner.bar)
  if (segments.length) {
    parts.push(`<g clip-path="url(#bar)">${segments.map((g) =>
      `<rect x="${px(g.x, s)}" y="${px(g.y, s)}" width="${px(g.w, s)}" height="${px(g.h, s)}" fill="${g.color}"/>`).join('')}</g>`)
  }
  return svg(geom, s, parts)
}

// Over the art only: fades it into the sheet leftwards and downwards so the
// title and the bar sit on midnight. Drawn only when there is art.
function fadeSvg(geom: SheetGeometry, s: number): Buffer {
  const bg = DECK_SHEET_COLORS.background
  const a = geom.banner.art
  const rect = (fill: string) =>
    `<rect x="${px(a.x, s)}" y="${px(a.y, s)}" width="${px(a.w, s)}" height="${px(a.h, s)}" fill="${fill}"/>`
  return svg(geom, s, [
    `<defs>` +
      `<linearGradient id="fl" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="${bg}" stop-opacity="1"/><stop offset="0.22" stop-color="${bg}" stop-opacity="0.85"/>` +
        `<stop offset="0.6" stop-color="${bg}" stop-opacity="0.15"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/>` +
      `</linearGradient>` +
      `<linearGradient id="fb" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0.6" stop-color="${bg}" stop-opacity="0"/><stop offset="1" stop-color="${bg}" stop-opacity="1"/>` +
      `</linearGradient>` +
    `</defs>`,
    rect('url(#fl)'),
    rect('url(#fb)'),
  ])
}

// Over the cards: chip pills, legend swatches and the zone rules, each placed
// from text the text layer has already measured.
function decorSvg(geom: SheetGeometry, s: number, decor: Decor): Buffer {
  const C = DECK_SHEET_COLORS
  return svg(geom, s, [
    `<defs><linearGradient id="rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.border}"/><stop offset="1" stop-color="${C.border}" stop-opacity="0"/></linearGradient></defs>`,
    ...decor.rules.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#rule)"/>`),
    ...decor.swatches.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${2 * s}" fill="${r.color}"/>`),
    ...decor.pills.map((r) =>
      `<rect x="${r.x + s}" y="${r.y + s}" width="${r.w - 2 * s}" height="${r.h - 2 * s}" rx="${(r.h - 2 * s) / 2}"` +
      ` fill="${C.background}" stroke="${C.gold}" stroke-width="${2 * s}"/>`),
  ])
}
```

Replace `textOverlays`. Every string is fitted to the space it has left before
`CONTENT_RIGHT`; review focus 1, 4 and 5 depend on this:

```ts
async function textOverlays(geom: SheetGeometry, layout: DeckSheetLayout, s: number): Promise<TextLayer> {
  const D = DECK_SHEET
  const C = DECK_SHEET_COLORS
  const right = px(D.width - D.padding, s)
  const overlays: OverlayOptions[] = []
  const decor: Decor = { pills: [], swatches: [], rules: [] }
  const style = (size: number, color: string, tracking?: number): TextStyle => ({ size: size * s, color, tracking })
  const at = (t: RenderedText, left: number, top: number) => { overlays.push({ input: t.input, left: Math.round(left), top: Math.round(top) }); return t }

  // Banner text column.
  const { textX, textWidth } = geom.banner
  const colLeft = px(textX, s)
  const colW = px(textWidth, s)
  at(await fitText(layout.banner.eyebrow, style(D.fontSize.eyebrow, C.gold, D.tracking.eyebrow), colW), colLeft, px(D.text.eyebrowY, s))
  at(await fitText(layout.banner.name, style(D.fontSize.title, C.parchment), colW), colLeft, px(D.text.titleY, s))
  const character = layout.banner.character
  if (character) {
    const label = at(await renderText(character.label, style(D.fontSize.subtitle, C.mutedAccent)), colLeft, px(D.text.subtitleY, s))
    const nameLeft = colLeft + label.width + 6 * s
    at(await fitText(character.card.name, style(D.fontSize.subtitle, C.goldLight), colLeft + colW - nameLeft), nameLeft, px(D.text.subtitleY, s))
  }

  // Legend: swatch, label, count per group, stopping at the bar's right edge
  // rather than running off the canvas (the bar itself still shows every group).
  let cursor = px(geom.banner.bar.x, s)
  const legendTop = px(geom.banner.legendY, s)
  for (const m of layout.banner.makeup) {
    const label = await renderText(m.label, style(D.fontSize.legend, C.mutedAccent))
    const count = await renderText(String(m.count), style(D.fontSize.legend, C.parchment))
    const itemW = 14 * s + label.width + 4 * s + count.width
    if (cursor + itemW > right) break
    decor.swatches.push({ x: cursor, y: legendTop + Math.round((label.height - 8 * s) / 2), w: 8 * s, h: 8 * s, color: m.color })
    at(label, cursor + 14 * s, legendTop)
    at(count, cursor + 14 * s + label.width + 4 * s, legendTop)
    cursor += itemW + 20 * s
  }

  for (const zone of geom.zones) {
    // Zone header: title, count, then a rule that fades out to the right.
    const top = px(zone.headerY, s)
    const title = at(await fitText(zone.title, style(D.fontSize.zone, C.parchment, D.tracking.zone), right - px(D.padding, s)), px(D.padding, s), top)
    const count = at(await renderText(String(zone.count), style(D.fontSize.zone, C.gold)), px(D.padding, s) + title.width + 10 * s, top)
    const ruleLeft = px(D.padding, s) + title.width + 10 * s + count.width + 14 * s
    if (ruleLeft < right) decor.rules.push({ x: ruleLeft, y: top + Math.round(title.height / 2), w: right - ruleLeft, h: Math.max(1, Math.round(s)) })

    for (const group of zone.groups) {
      if (group.title !== null) {
        const left = px(group.x, s)
        const color = group.key === 'lesson' ? C.goldLight : C.mutedAccent
        const label = at(await fitText(group.title, style(D.fontSize.group, color, D.tracking.group), right - left), left, px(group.labelY, s))
        const n = await renderText(String(group.count), style(D.fontSize.group, C.gold))
        const nLeft = left + label.width + 8 * s
        if (nLeft + n.width <= right) at(n, nLeft, px(group.labelY, s))
      }
      for (const pc of group.cards) {
        // xN chip on the bottom-right corner, sized to its digits.
        const sign = await renderText('×', style(D.fontSize.chipSign, C.gold))
        const num = await renderText(String(pc.card.quantity), style(D.fontSize.chip, C.gold))
        const contentW = sign.width + s + num.width
        const pillH = px(D.chip.height, s)
        const pillW = Math.max(px(D.chip.minWidth, s), Math.round(contentW + 2 * D.chip.padX * s))
        const pillRight = px(pc.x + pc.w + D.chip.overhangX, s)
        const pillBottom = px(pc.y + pc.h + D.chip.overhangY, s)
        const pill = { x: pillRight - pillW, y: pillBottom - pillH, w: pillW, h: pillH }
        decor.pills.push(pill)
        const textLeft = pill.x + (pillW - contentW) / 2
        at(sign, textLeft, pill.y + (pillH - sign.height) / 2 + s)
        at(num, textLeft + sign.width + s, pill.y + (pillH - num.height) / 2)
      }
    }
  }
  return { overlays, decor }
}
```

Replace the first half of `renderSheet`, up to and including the `sheet = sharp(...)`
line:

```ts
export async function renderSheet(req: DeckSheetRequest, opts: SheetRenderOptions): Promise<SheetRender> {
  const layout = layoutDeckSheet(req.deck, req.entries, sheetLabels(req.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom, resolveBudget(req.maxBytes, opts.pixelBudget))
  const { w, h } = canvasSize(geom, s)
  const budgetMs = opts.fetchBudgetMs ?? FETCH_BUDGET_MS
  const positioned = [
    ...(geom.banner.card ? [geom.banner.card] : []),
    ...geom.zones.flatMap((z) => z.groups.flatMap((g) => g.cards)),
  ]

  const fetchStarted = performance.now()
  const [cards, banner, text] = await Promise.all([
    cardOverlays(positioned, opts.imageBase, s, budgetMs, opts.signal),
    bannerArt(layout.banner, geom.banner.art, opts.imageBase, s, budgetMs, opts.signal),
    textOverlays(geom, layout, s),
  ])
  const fetchMs = Math.round(performance.now() - fetchStarted)
  opts.signal?.throwIfAborted()

  // Paint order: sheet and placeholders, the art and its fades, the card
  // faces, then the shapes and text that sit on top of them.
  const sheet = sharp(baseSvg(geom, layout, s, banner.overlay !== null)).composite([
    ...(banner.overlay ? [banner.overlay, { input: fadeSvg(geom, s) }] : []),
    ...cards.overlays,
    { input: decorSvg(geom, s, text.decor) },
    ...text.overlays,
  ])
  const dropped = cards.dropped + banner.dropped
  const common = { pixels: w * h, scale: s, fullArt: usesFullArt(s), dropped, distinct: cards.distinct, fetchMs }
```

The rest of `renderSheet` (the encode block) is unchanged. Keep the two comments above
the old `sheet = ...` line (`clone()` and the raw-pixel note) above the new one. Delete
`centered` only if nothing uses it any more; the placeholder in `cardOverlays` still
does, so it stays. In the `usesFullArt` doc comment, change "At the full 2x that side is 264px against a thumb's 300 - a 1.14:1 repaint" to "At the full 2x that side is 224px against a thumb's 300 - a 1.34:1 repaint", because the box is now 112 wide. Update the `renderSheet` doc comment: "Grouping, geometry and colours
come from @revelio/core" stays true. Add one sentence: "The banner draws the character's
art crop when it has one and a gold glow when it does not; either way the layout is the
same."

- [ ] **Step 4: Run the sheet tests to verify they pass**

Run: `npm test -w @revelio/sheet`
Expected: PASS. If `sheetScale > renders a small deck at the full device scale` fails,
check it with the new 1440 width before changing anything. `req` is about 1440 x 1300,
or 7.5 Mpx at 2x, which is under 12 Mpx, so it should still be 2.

- [ ] **Step 5: Typecheck and lint everything**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add sheet/src/render.ts sheet/test/render.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(sheet): paint the deck sheet with a hero banner and packed groups"
```

---

### Task 5: The Revelio logo in the footer

**Files:**
- Create: `sheet/src/revelio-logo.svg` (copy of `logos/revelio-logo-dark.svg`)
- Create: `sheet/test/logo.test.ts`
- Modify: `sheet/src/render.ts`, `sheet/build.mjs`, `sheet/Dockerfile:45,58`
- Test: `sheet/test/render.test.ts`

**Interfaces:**
- Consumes: `SheetGeometry.logo: Rect` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `sheet/test/logo.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, it, expect } from 'vitest'

// The sheet image builds from app/, which cannot reach the repo root's logos/,
// so the service ships a copy. This is what stops a brand update from quietly
// skipping the sheet.
describe('revelio-logo.svg', () => {
  it('is byte for byte the brand guide dark logo', async () => {
    const shipped = await readFile(new URL('../src/revelio-logo.svg', import.meta.url))
    const brand = await readFile(new URL('../../../logos/revelio-logo-dark.svg', import.meta.url))
    expect(shipped.equals(brand)).toBe(true)
  })
})
```

Add to `describe('renderSheet', ...)` in `sheet/test/render.test.ts`:

```ts
  it('draws the logo in the footer corner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    const geom = computeSheetGeometry(layoutDeckSheet(req.deck, req.entries, sheetLabels('en')))
    const { data, info } = await sharp(out.body)
      .extract({
        left: Math.round(geom.logo.x * out.scale), top: Math.round(geom.logo.y * out.scale),
        width: Math.round(geom.logo.w * out.scale), height: Math.round(geom.logo.h * out.scale),
      })
      .raw().toBuffer({ resolveWithObject: true })
    // The wordmark is parchment (#FBF3DC); nothing else in the footer is that light.
    let light = 0
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 220 && data[i + 1] > 220) light++
    expect(light).toBeGreaterThan(50)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/sheet -- test/logo.test.ts test/render.test.ts`
Expected: FAIL. The logo test hits ENOENT on `src/revelio-logo.svg`, and the footer
render test finds 0 light pixels.

- [ ] **Step 3: Copy the asset**

Run: `cp ../logos/revelio-logo-dark.svg sheet/src/revelio-logo.svg`

- [ ] **Step 4: Draw it in `sheet/src/render.ts`**

Add the imports `import { fileURLToPath } from 'node:url'` and `type Rect` (already in the
core import from Task 4). Add with the module constants:

```ts
// Resolved against this module in dev and against sheet.mjs in the bundle, the
// same way text.ts finds the font; build.mjs copies it next to the bundle.
const LOGO_FILE = fileURLToPath(new URL('./revelio-logo.svg', import.meta.url))
```

and a helper:

```ts
// The logo's wordmark is already paths, so librsvg draws it with no font.
// Rasterised large and scaled down, which keeps the star's points crisp.
async function logoOverlay(rect: Rect, s: number): Promise<OverlayOptions> {
  const input = await sharp(LOGO_FILE, { density: 288 }).resize({ height: px(rect.h, s) }).png().toBuffer()
  return { input, left: px(rect.x, s), top: px(rect.y, s) }
}
```

In `renderSheet`, add `logoOverlay(geom.logo, s)` as a fourth member of the
`Promise.all`, as `logo`. Append `logo` as the last composite input, after
`...text.overlays`.

- [ ] **Step 5: Ship it in the bundle and the image**

`sheet/build.mjs`: change the asset loop to

```js
  for (const asset of ['Poppins-SemiBold.ttf', 'fonts.conf', 'revelio-logo.svg']) {
```

and its comment to "text.ts and render.ts resolve these against import.meta.url, which
inside the bundle is dist/sheet.mjs."

`sheet/Dockerfile` line 45 becomes:

```dockerfile
COPY --from=build --chown=sheet:nodejs /app/sheet/dist/Poppins-SemiBold.ttf /app/sheet/dist/fonts.conf /app/sheet/dist/revelio-logo.svg ./
```

and line 58:

```dockerfile
RUN test -s /app/Poppins-SemiBold.ttf && test -s /app/fonts.conf && test -s /app/revelio-logo.svg
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm test -w @revelio/sheet && npm run build -w @revelio/sheet && ls sheet/dist`
Expected: tests PASS, and `sheet/dist` lists `sheet.mjs`, `Poppins-SemiBold.ttf`,
`fonts.conf` and `revelio-logo.svg`.

- [ ] **Step 7: Build the image to prove the runtime stage finds it**

Run: `PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" /usr/local/bin/docker compose build sheet`
Expected: the build succeeds. The `test -s` line and the boot-check grep both pass.

- [ ] **Step 8: Commit**

```bash
git add sheet/src/revelio-logo.svg sheet/src/render.ts sheet/build.mjs sheet/Dockerfile sheet/test/logo.test.ts sheet/test/render.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(sheet): sign the deck sheet with the revelio logo"
```

---

### Task 6: Verify against the mock and close out

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-deck-sheet-redesign-design.md` (status line, and section 6's Dockerfile sentence)

- [ ] **Step 1: Run the full per-workspace suite**

Run: `npm test -w @revelio/core && npm test -w @revelio/sheet && npm test -w @revelio/bot && npm test -w web && npm run typecheck && npm run lint`
Expected: all green. Record each test count for the PR's `## Verification`.

- [ ] **Step 2: Render the sample deck from the local stack**

Run from `app/` with the stack up (`docker compose up -d`):

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" /usr/local/bin/docker compose up -d --build sheet
OUT=$(mktemp -d)
/usr/local/bin/docker compose exec -T postgres psql -U revelio -d revelio -At -c "
with base as (
  select c.id, c.set_code, c.orientation, c.lesson, c.art_crop_version, l.name, l.image_version,
    (select array_agg(type_code) from card_types t where t.card_id = c.id) types
  from cards c join card_localizations l on l.card_id = c.id and l.lang = 'en'
  where l.image_version is not null),
pick as (
  (select *, 'character' z, 1 q from base where 'character' = any(types) and art_crop_version is not null and name ilike '%hagrid%' order by id limit 1)
  union all (select *, 'main', 4 from base where 'creature' = any(types) and lesson = 'care_of_magical_creatures' order by id limit 7)
  union all (select *, 'main', 3 from base where 'spell' = any(types) and lesson = 'charms' order by id limit 6)
  union all (select *, 'main', 2 from base where 'item' = any(types) order by id limit 3)
  union all (select *, 'main', 1 from base where 'adventure' = any(types) order by id limit 2)
  union all (select *, 'main', 1 from base where 'location' = any(types) order by id limit 1)
  union all (select *, 'main', 15 from base where 'lesson' = any(types) and lesson = 'care_of_magical_creatures' order by id limit 1)
  union all (select *, 'main', 6 from base where 'lesson' = any(types) and lesson = 'charms' order by id limit 1)
  union all (select *, 'sideboard', 2 from base where 'spell' = any(types) and lesson = 'transfiguration' order by id limit 4))
select json_build_object('locale', 'en', 'deck', json_build_object('name', 'Hagrid''s Menagerie', 'format', 'classic'),
  'entries', json_agg(json_build_object('cardId', id, 'zone', z, 'quantity', q, 'name', name, 'setCode', set_code,
    'types', types, 'imageVersion', image_version, 'orientation', orientation,
    'artCropVersion', case when z = 'character' then art_crop_version end)))
from pick" > "$OUT/deck.json"
curl -s -o "$OUT/sheet.png" -w '%{http_code} %{size_download}\n' -H 'Authorization: Bearer local-dev-sheet-token' \
  -H 'Content-Type: application/json' --data @"$OUT/deck.json" http://127.0.0.1:8080/render
/usr/local/bin/node -e "const d=require('$OUT/deck.json');d.entries=d.entries.filter(e=>e.zone!=='character');require('fs').writeFileSync('$OUT/nochar.json',JSON.stringify(d))"
curl -s -o "$OUT/nochar.png" -w '%{http_code} %{size_download}\n' -H 'Authorization: Bearer local-dev-sheet-token' \
  -H 'Content-Type: application/json' --data @"$OUT/nochar.json" http://127.0.0.1:8080/render
echo "$OUT"
```

Expected: two `200` lines. Open `$OUT/sheet.png` and `$OUT/nochar.png` with the Read tool.

- [ ] **Step 3: Compare with mock B**

Check each item and note the result for the PR:
- The banner shows the crop on the right, fading to midnight on the left and at the
  bottom.
- The character card is at the left with a gold ring, and the name and eyebrow sit
  beside it.
- The makeup bar spans the content width with Lessons in gold, and the legend sits
  under it.
- Groups pack (Spells beside Items, as in the mock), landscape rows are short, copies
  are stacked, and the ×N chips are on the corners.
- The logo sits alone in the bottom-right corner.
- `nochar.png` shows the glow with no card slot, and the text starts at the left
  padding.
- **Crop resolution at 2x** (spec section 4): zoom into the banner art. If it reads as
  pixelated rather than soft, add `.blur(1.2)` after `.resize(rw, rh)` in
  `coverFocused`, re-run Step 2, and commit that change separately as
  `fix(sheet): soften the upscaled banner art`.

- [ ] **Step 4: Correct the spec and mark it implemented**

In the spec:
- Change `**Status:** draft, awaiting review` to `**Status:** implemented`.
- In section 6, replace "and the Dockerfile's build-stage boot check is unchanged" with
  "and the Dockerfile copies it into the runtime stage and checks it is non-empty, as it
  does the font".

- [ ] **Step 5: Commit**

```bash
git add ../docs/superpowers/specs/2026-10-06-deck-sheet-redesign-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(specs): mark the deck sheet redesign implemented"
```

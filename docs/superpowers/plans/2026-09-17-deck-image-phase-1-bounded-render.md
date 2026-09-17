# Deck Image Phase 1: Bounded Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/deck` renders in memory bounded by a constant instead of by deck size, and
every dropped card image leaves a log line.

**Architecture:** The bot's sheet renderer currently paints at `DECK_SHEET.scale` (2)
whatever the geometry says, so a 120-entry deck builds a 1960 x 9744 canvas and peaks at
478 MB RSS. This phase adds a pixel budget that scales the whole sheet down when the
geometry would exceed it - the same shape as the web painter's `MAX_CANVAS_DIM` clamp
(`web/src/lib/deck-png.ts:186`), driven by memory rather than by a browser limit. It also
replaces the two bare `catch { return null }` blocks with logged ones.

**Tech Stack:** TypeScript, `sharp` (libvips), vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-deck-image-delivery-design.md`

## Global Constraints

- All work is under `app/`; every command runs from there.
- `type` aliases, never `interface`. Type-only imports say `type`.
- Declaration order in a file: types -> constants -> helpers -> exported functions.
- Code comments are ASCII only. No em-dashes, no unicode arrows.
- Every user-facing string comes from `bot/src/i18n/{en,de}.json`. Log lines are not
  user-facing and stay in English in the source.
- Log lines name the card id and the failure reason, never the URL - the fetch base can be
  an internal hostname.
- Commits are Conventional Commits, `type(scope): subject`, scope `bot`. No tool
  attribution.

---

### Task 1: Scale the sheet to a pixel budget

The renderer hardcodes `const S = DECK_SHEET.scale` at module level and multiplies every
coordinate by it. Making the scale per-render means threading it through the four
functions that use `S`: `chromeSvg`, `badgeSvg`, `cardOverlays` and `textOverlays`.

**Files:**
- Modify: `app/bot/src/images/deck-image.ts`
- Test: `app/bot/test/deck-image.test.ts`

**Interfaces:**
- Consumes: `computeSheetGeometry`, `DECK_SHEET`, `SheetGeometry`, `PositionedSection`
  from `@revelio/core` (unchanged).
- Produces: `export function sheetScale(geom: SheetGeometry): number` - the device scale
  this sheet will be painted at, at most `DECK_SHEET.scale`. Phase 3 reuses it to decide
  the source image resolution, and the tests use it to predict output dimensions.

- [ ] **Step 1: Write the failing test**

Add to `app/bot/test/deck-image.test.ts`. The existing `deck` fixture is small, so build a
separate oversized one here rather than changing the shared fixture - the other tests
assert against `sheetSize()` and must keep passing untouched.

```ts
import { renderDeckImage, sheetScale } from '../src/images/deck-image'
import { MAX_SHEET_PIXELS } from '../src/images/deck-image'

// 200 distinct main-deck cards: far past the budget, so the clamp has to bite.
const hugeEntries: DeckCardView[] = Array.from({ length: 200 }, (_, i) =>
  view(`creature${i}`, 'main', ['creature']),
)
const hugeDeck: PublicDeck = { ...deck, entries: hugeEntries, mainCount: 400 }

function geomOf(entries: DeckCardView[], d: PublicDeck) {
  const labels = {
    formatLabel: { classic: '', revival: '' }, character: '', mainDeck: '', sideboard: '', group: () => '',
  }
  return computeSheetGeometry(layoutDeckSheet(d, entries, labels))
}

describe('sheetScale', () => {
  it('paints a normal deck at the full shared scale', () => {
    expect(sheetScale(geomOf(entries, deck))).toBe(DECK_SHEET.scale)
  })

  it('scales an oversized sheet down to the pixel budget', () => {
    const geom = geomOf(hugeEntries, hugeDeck)
    const scale = sheetScale(geom)
    expect(scale).toBeLessThan(DECK_SHEET.scale)
    expect(geom.width * scale * geom.height * scale).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
  })

  it('renders an oversized deck inside the budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await thumb(), { status: 200 })))
    const meta = await sharp(await renderDeckImage(hugeDeck, opts)).metadata()
    expect(meta.width! * meta.height!).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
    // Still the sheet's aspect ratio, not a clipped or letterboxed one.
    const geom = geomOf(hugeEntries, hugeDeck)
    expect(meta.width! / meta.height!).toBeCloseTo(geom.width / geom.height, 2)
  }, 60_000)
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts -t "sheetScale"
```

Expected: FAIL on the import - `sheetScale` and `MAX_SHEET_PIXELS` are not exported.

- [ ] **Step 3: Replace the module-level `S` with a per-render scale**

In `app/bot/src/images/deck-image.ts`, delete `const S = DECK_SHEET.scale` and add, in the
constants block:

```ts
// Upper bound on the painted sheet, in device pixels. Peak RSS measured on this
// renderer is about 200 MB plus 14.5 MB per megapixel of canvas, so 12 Mpx caps a
// render near 375 MB - see the spec's table. Past the budget the whole sheet scales
// down rather than clipping, which keeps a 200-card deck a readable picture instead
// of an OOM. Deliberately not a DECK_SHEET field: the web painter's cap
// (MAX_CANVAS_DIM in web/src/lib/deck-png.ts) is a browser limit at a different
// number, and one constant cannot mean both.
export const MAX_SHEET_PIXELS = 12_000_000
```

Add the exported helper, after the constants and before the other helpers:

```ts
/**
 * Device pixels per layout pixel for this sheet. DECK_SHEET.scale unless the
 * geometry would exceed MAX_SHEET_PIXELS, in which case both axes shrink by the
 * same factor so the picture keeps its proportions.
 */
export function sheetScale(geom: SheetGeometry): number {
  const budget = Math.sqrt(MAX_SHEET_PIXELS / (geom.width * geom.height))
  return Math.min(DECK_SHEET.scale, budget)
}
```

- [ ] **Step 4: Thread the scale through the four painters**

Give each of `chromeSvg`, `badgeSvg`, `cardOverlays` and `textOverlays` a trailing
`s: number` parameter and replace every `S` in their bodies with `s`. The signatures
become:

```ts
function chromeSvg(geom: SheetGeometry, s: number): Buffer
function badgeSvg(geom: SheetGeometry, s: number): Buffer
async function cardOverlays(sections: PositionedSection[], imageBase: string, s: number): Promise<OverlayOptions[]>
async function textOverlays(geom: SheetGeometry, title: string, s: number): Promise<OverlayOptions[]>
```

`PLACEHOLDER_INSET` stays in layout pixels and keeps being multiplied by the scale at its
use site, as it is today.

Then rewrite the exported entry point's body:

```ts
export async function renderDeckImage(deck: PublicDeck, opts: DeckImageOptions): Promise<Buffer> {
  const layout = layoutDeckSheet(deck, deck.entries, labelsFor(opts.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom)

  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s),
    textOverlays(geom, layout.title, s),
  ])

  return sharp(chromeSvg(geom, s))
    .composite([...cards, { input: badgeSvg(geom, s) }, ...text])
    .webp({ quality: 90 })
    .toBuffer()
}
```

Note the two SVG builders already compute `const w = geom.width * S` at the top; those
become `* s` and the rest of each body follows.

- [ ] **Step 5: Run the new tests**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts -t "sheetScale"
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole bot suite, including the pre-existing dimension assertions**

```bash
npm test -w @revelio/bot
```

Expected: PASS. `renders a WebP at twice the shared sheet geometry` must still pass - the
small fixture is far under the budget, so its scale is unchanged at 2. If it fails, the
threading in Step 4 dropped a multiplication.

- [ ] **Step 7: Prove the clamp bites, by mutation**

Temporarily change `MAX_SHEET_PIXELS` to `Number.MAX_SAFE_INTEGER` and re-run
`-t "sheetScale"`. Expected: the two oversized tests FAIL. Restore the constant.

This is the step that proves the test guards the behaviour rather than the arithmetic.
Record the result; it goes in the PR's `## Verification`.

- [ ] **Step 8: Typecheck and lint**

```bash
npm run typecheck
npm run lint -w @revelio/bot
```

- [ ] **Step 9: Commit**

```bash
git add app/bot/src/images/deck-image.ts app/bot/test/deck-image.test.ts
git commit -m "fix(bot): clamp the deck sheet to a pixel budget"
```

Body:

```
Peak RSS tracks canvas area at about 14.5 MB per megapixel, and nothing
bounded the area: a 120-entry deck built a 1960x9744 sheet and peaked at
478 MB, which is an OOM kill rather than a reply. Scale the whole sheet
down past 12 Mpx, the way web's deck-png.ts clamps to MAX_CANVAS_DIM.
```

---

### Task 2: Log every dropped card image

**Files:**
- Modify: `app/bot/src/images/deck-image.ts`
- Test: `app/bot/test/deck-image.test.ts`

**Interfaces:**
- Consumes: `sheetScale`, `MAX_SHEET_PIXELS` from Task 1.
- Produces: nothing new is exported. `renderDeckImage` gains a `console.warn` on each
  dropped image and one `console.warn` summary per render when any were dropped.

- [ ] **Step 1: Write the failing test**

```ts
describe('renderDeckImage logging', () => {
  it('names the card and the reason when a thumb cannot be fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    await renderDeckImage(deck, opts)
    const lines = warn.mock.calls.map((c) => c.join(' '))
    expect(lines.some((l) => l.includes('harry') && l.includes('ECONNREFUSED'))).toBe(true)
    // One summary line, so a fully broken host is not sixty lines.
    expect(lines.filter((l) => l.includes('deck image:')).length).toBe(1)
    warn.mockRestore()
  })

  it('never logs the image URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('nope') }))
    await renderDeckImage(deck, opts)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('img.test')
    warn.mockRestore()
  })

  it('stays silent when every image loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    await renderDeckImage(deck, opts)
    expect(warn.mock.calls.filter((c) => c.join(' ').includes('deck image:'))).toHaveLength(0)
    warn.mockRestore()
  })
})
```

Note the shared `deck` fixture has one card (`noimg`) with `imageVersion: null`. That is
not a failure and must not be logged or counted - it is a card that has no image, which is
what the placeholder box is for. The third test covers that: with every fetch succeeding,
`noimg` still draws a placeholder and nothing is warned.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts -t "logging"
```

Expected: FAIL - nothing is logged today, so the first two assertions are false.

- [ ] **Step 3: Give the fetch and decode helpers a reason**

Replace `fetchThumb` and `cardImage` with versions that report why they failed. Put the
result type with the other types at the top of the file:

```ts
// Why a card box has no picture. 'none' is a card with no stored image at all,
// which is normal and not worth a log line; the rest are failures.
type ImageFailure = 'none' | string
```

```ts
async function fetchThumb(
  card: DeckSheetCard,
  imageBase: string,
): Promise<{ body: Buffer } | { failure: ImageFailure }> {
  if (card.imageVersion == null) return { failure: 'none' }
  try {
    const res = await fetch(imageUrl(imageBase, thumbKey(card.cardId, card.imageVersion)), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return { failure: `HTTP ${res.status}` }
    return { body: Buffer.from(await res.arrayBuffer()) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}
```

`cardImage` keeps its signature and its `catch`, but returns the reason too:

```ts
async function cardImage(
  thumb: Buffer, w: number, h: number, upright: boolean,
): Promise<{ body: Buffer } | { failure: ImageFailure }> {
  try {
    const pipeline = sharp(thumb)
    if (upright) pipeline.rotate(90)
    return { body: await pipeline.resize(w, h, { fit: 'cover' }).png().toBuffer() }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Log at the one place that knows the card**

In `cardOverlays`, collect the failures and warn per card, then hand the count back so the
entry point can write the summary. Change its signature to return both:

```ts
async function cardOverlays(
  sections: PositionedSection[], imageBase: string, s: number,
): Promise<{ overlays: OverlayOptions[]; dropped: number }> {
```

Inside, where the overlay for each positioned card is built, replace the current
`const image = thumb ? await cardImage(...) : null` with the reason-carrying form, and
warn once per distinct card that actually failed:

```ts
  // Warned once per distinct card, not once per copy: a card in two zones is one
  // broken image, and a broken host should read as a list of cards, not of boxes.
  let dropped = 0
  for (const [id, result] of thumbById) {
    if ('body' in result || result.failure === 'none') continue
    dropped++
    console.warn(`deck image: no art for ${id}: ${result.failure}`)
  }
```

and in the per-box mapping, a decode failure warns with the same shape:

```ts
    if ('failure' in decoded && decoded.failure !== 'none') {
      console.warn(`deck image: could not decode ${pc.card.cardId}: ${decoded.failure}`)
    }
```

- [ ] **Step 5: Write the summary line in the entry point**

```ts
  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s),
    textOverlays(geom, layout.title, s),
  ])
  if (cards.dropped > 0) {
    // One line per render, so an unreachable image host is legible in the log
    // instead of being one entry per card in the deck.
    console.warn(`deck image: ${cards.dropped} of ${distinctCount} card images missing for deck ${deck.id}`)
  }
```

`distinctCount` comes back from `cardOverlays` alongside `dropped`; widen its return to
`{ overlays, dropped, distinct }` and use `cards.distinct` here. Update the composite call
to `[...cards.overlays, ...]`.

- [ ] **Step 6: Run the new tests**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts -t "logging"
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Run the whole bot suite**

```bash
npm test -w @revelio/bot
```

Expected: PASS. The pre-existing `still renders when every thumb fails to load` and
`treats a non-image response as a missing thumb` tests now emit warnings; they assert on
the rendered output, not on a clean console, so they keep passing. If vitest is configured
to fail on console output, silence it in those two with the same
`vi.spyOn(console, 'warn').mockImplementation(() => {})` the new tests use.

- [ ] **Step 8: Typecheck and lint**

```bash
npm run typecheck
npm run lint -w @revelio/bot
```

- [ ] **Step 9: Commit**

```bash
git add app/bot/src/images/deck-image.ts app/bot/test/deck-image.test.ts
git commit -m "fix(bot): log the cards a deck sheet could not draw"
```

Body:

```
Both the fetch and the decode ended in a bare catch returning null, so a
production render with every card missing produced no log line at all and
the cause had to be reconstructed from the picture. Report the card id and
the reason, once per distinct card, plus one summary line per render. A
card with no stored image is still not a failure.
```

---

## Self-Review

- **Spec coverage.** This plan covers the spec's goal "`/deck` cannot kill the gateway, at
  any deck size" (Task 1) and "Every dropped card image leaves a log line naming the card
  and the reason" (Task 2). The spec's remaining goals belong to Phases 2 and 3.
- **Deployment.** Neither task changes an env var or a migration. The spec's Deployment
  section still applies to the branch as a whole and belongs in the PR body: this phase
  bounds the peak at ~375 MB, and the pod limit has to be at least 640Mi for that to be
  affordable.
- **Not covered here on purpose.** `sheetScale` is exported because Phase 3 needs it to
  decide between the thumb and the full image; nothing else consumes it yet.

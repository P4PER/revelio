# Deck Image Phase 3: PNG and Full Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/deck` posts a PNG drawn from full-resolution card art, at a size that always
fits Discord's upload limit.

**Architecture:** Two independent quality changes, each guarded by the pixel budget Phase 1
established. The encoder moves from `webp({ quality: 90 })` to `png({ compressionLevel: 9 })`,
with a WebP fallback if a sheet somehow still exceeds the attachment limit. The image source
moves from `thumbKey` (300 x 419) to `imageKey` (744 x 1039), matching what the web export
already does and for the same stated reason.

**Tech Stack:** TypeScript, `sharp` (libvips), vitest, discord.js.

**Spec:** `docs/superpowers/specs/2026-09-17-deck-image-delivery-design.md`

## Global Constraints

- All work is under `app/`; every command runs from there.
- `type` aliases, never `interface`. Type-only imports say `type`.
- Declaration order in a file: types -> constants -> helpers -> exported functions.
- Code comments are ASCII only.
- `DECK_IMAGE_NAME` in `app/bot/src/discord/embeds/deck-embed.ts` is the single source for
  the attachment filename; both the command and the embed read it. Never write the name
  twice.
- Commits are Conventional Commits, scope `bot`. No tool attribution.

**Depends on:** Phases 1 and 2, merged. Phase 1's `MAX_SHEET_PIXELS` is what keeps the PNG
inside Discord's limit, and Phase 1's `sheetScale` is what Task 2 reads.

---

### Task 1: Encode PNG, with a size guard

**Files:**
- Modify: `app/bot/src/images/deck-image.ts`
- Modify: `app/bot/src/discord/embeds/deck-embed.ts:13`
- Test: `app/bot/test/deck-image.test.ts`
- Test: `app/bot/test/deck-embed.test.ts`

**Interfaces:**
- Consumes: `sheetScale`, `MAX_SHEET_PIXELS` from Phase 1 Task 1.
- Produces: `renderDeckImage` returns a PNG buffer under normal conditions.
  `DECK_IMAGE_NAME` becomes `'deck.png'`.

Measured on this renderer, a 60-entry sheet (1960 x 5102) encodes to 0.75 MB as webp q90
and 3.13 MB as PNG. At Phase 1's 12 Mpx ceiling PNG lands near 6 MB, inside Discord's 10 MB
non-boosted limit - but the margin is thin enough to be worth a guard rather than a comment.

- [ ] **Step 1: Write the failing test**

```ts
it('encodes the sheet as PNG', async () => {
  const body = await thumb()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
  const meta = await sharp(await renderDeckImage(deck, opts)).metadata()
  expect(meta.format).toBe('png')
  expect([meta.width, meta.height]).toEqual(sheetSize())
})

it('falls back to WebP rather than exceed the attachment limit', async () => {
  const body = await thumb()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
  // One byte of PNG is over the limit, so the fallback has to run on any deck.
  vi.spyOn(deckImageLimits, 'maxAttachmentBytes').mockReturnValue(1)
  const meta = await sharp(await renderDeckImage(deck, opts)).metadata()
  expect(meta.format).toBe('webp')
  expect([meta.width, meta.height]).toEqual(sheetSize())
})
```

The second test needs the limit to be injectable. Rather than a mockable module object,
prefer the simpler form: export the constant and have the test build a deck big enough to
trip it. That is slow and brittle. Use instead an optional field on the existing options
type, which is honest about being a seam and costs nothing:

```ts
export type DeckImageOptions = {
  imageBase: string
  locale: string
  // Test seam. Production never sets it; the default is Discord's practical
  // ceiling for a non-boosted guild, with headroom under the real 10 MB.
  maxAttachmentBytes?: number
}
```

and the test becomes:

```ts
it('falls back to WebP rather than exceed the attachment limit', async () => {
  const body = await thumb()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
  const buf = await renderDeckImage(deck, { ...opts, maxAttachmentBytes: 1 })
  const meta = await sharp(buf).metadata()
  expect(meta.format).toBe('webp')
  expect([meta.width, meta.height]).toEqual(sheetSize())
})
```

Also update the existing test `renders a WebP at twice the shared sheet geometry` - rename
it to `renders a PNG at twice the shared sheet geometry` and change its `expect(meta.format)`
to `'png'`. And in `deck-embed.test.ts`, any assertion on `attachment://deck.webp` becomes
`attachment://deck.png`; `grep -rn "deck.webp" app/bot/` finds them all.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts
```

Expected: FAIL - format is `webp`.

- [ ] **Step 3: Add the limit constant**

In the constants block of `app/bot/src/images/deck-image.ts`:

```ts
// Discord rejects an attachment over 10 MB in a non-boosted guild, and the whole
// interaction fails with it. Phase 1's pixel budget already puts the worst PNG
// near 6 MB, so this is a backstop rather than a working limit - but a failed
// upload costs the reply, and a re-encode costs a second.
const MAX_ATTACHMENT_BYTES = 9_000_000
```

- [ ] **Step 4: Encode PNG, re-encode on overflow**

Replace the tail of `renderDeckImage`:

```ts
  const sheet = sharp(chromeSvg(geom, s))
    .composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])

  // PNG so the file people pull out of Discord is lossless and ordinary. The
  // thumbs it is drawn from are already lossy, so webp q90 was a second
  // generation of loss on top of them for no gain.
  const png = await sheet.clone().png({ compressionLevel: 9 }).toBuffer()
  const limit = opts.maxAttachmentBytes ?? MAX_ATTACHMENT_BYTES
  if (png.length <= limit) return png

  console.warn(`deck image: ${png.length} byte PNG over the ${limit} byte limit, falling back to WebP`)
  return sheet.clone().webp({ quality: 90 }).toBuffer()
```

`clone()` matters: a sharp pipeline cannot be consumed twice, and without it the fallback
encodes an already-finished pipeline and throws.

- [ ] **Step 5: Rename the attachment**

In `app/bot/src/discord/embeds/deck-embed.ts`:

```ts
export const DECK_IMAGE_NAME = 'deck.png'
```

The comment above it already explains why both sides read it from here; leave it.

Note the fallback in Step 4 posts WebP bytes under a `.png` name. That is deliberate:
Discord and every client sniff the content, the embed references the attachment by the name
in `DECK_IMAGE_NAME`, and a second name would mean the embed and the upload could disagree.
Add that as a comment on the fallback branch.

- [ ] **Step 6: Run the tests**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts
npm test -w @revelio/bot -- test/deck-embed.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the whole bot suite, typecheck, lint**

```bash
npm test -w @revelio/bot
npm run typecheck
npm run lint -w @revelio/bot
```

- [ ] **Step 8: Commit**

```bash
git add app/bot/src/images/deck-image.ts app/bot/src/discord/embeds/deck-embed.ts \
        app/bot/test/deck-image.test.ts app/bot/test/deck-embed.test.ts
git commit -m "feat(bot): post the deck sheet as a PNG"
```

Body:

```
A PNG is the more useful file to pull out of Discord, and the thumbs the
sheet is drawn from are already lossy, so webp q90 added a second
generation of loss for nothing. The pixel budget keeps the worst case near
6 MB; a size guard re-encodes as WebP rather than lose the reply to a
rejected upload.
```

---

### Task 2: Draw from full-resolution card art

**Files:**
- Modify: `app/bot/src/images/deck-image.ts`
- Test: `app/bot/test/deck-image.test.ts`

**Interfaces:**
- Consumes: `imageKey` from `@revelio/core` (already exported alongside `thumbKey`).
- Produces: nothing new.

`web/src/lib/deck-png.ts:52-54` states the reason for the web export: "Full art (745px)
rather than the 300px thumbnail keeps the exported cards crisp on the 2x-scaled canvas."
The bot's card box is 264 x 370 device pixels at scale 2, so a 300 x 419 thumb is a 1:1
render of a lossy source with no headroom. The two painters should not disagree about this.

- [ ] **Step 1: Write the failing test**

```ts
it('requests full-resolution card images, not thumbs', async () => {
  const body = await thumb()
  const fetchMock = vi.fn(async (_url: string) => new Response(body, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await renderDeckImage(deck, opts)
  const urls = fetchMock.mock.calls.map(([url]) => String(url))
  expect(urls).toContain('https://img.test/cards/harry.1.webp')
  expect(urls.some((url) => url.includes('/cards/thumb/'))).toBe(false)
})
```

This replaces the existing `requests default-language thumbs and never fetches a card
without an image` test. Keep its second assertion - `noimg` must still never be fetched -
by folding it in:

```ts
  expect(urls.some((url) => url.includes('noimg'))).toBe(false)
```

and rename the test to `requests default-language card images and never fetches a card
without an image`.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts -t "card images"
```

Expected: FAIL - the URL is `https://img.test/cards/thumb/harry.1.webp`.

- [ ] **Step 3: Switch the key and raise the timeout**

In `app/bot/src/images/deck-image.ts`, change the import from `@revelio/core` to bring in
`imageKey` instead of `thumbKey`, and in `fetchThumb`:

```ts
    const res = await fetch(imageUrl(imageBase, imageKey(card.cardId, card.imageVersion)), {
```

Raise the timeout constant, and say why:

```ts
// Matches web's IMG_TIMEOUT_MS. The full card image is ~317 KB against a thumb's
// ~23 KB, so the 5s that covered a thumb does not cover this.
const FETCH_TIMEOUT_MS = 10_000
```

Rename `fetchThumb` to `fetchCardImage` and update its call site and its doc comment - the
function no longer fetches a thumb, and leaving the name would be the next reader's trap.
The `thumbById` map in `cardOverlays` becomes `imageById`.

- [ ] **Step 4: Update the renderer's doc comment**

The block comment on `renderDeckImage` currently says it "Renders from the 300px thumbs
rather than the full images the web export uses" and gives a reason that no longer holds.
Replace that paragraph:

```
 * Renders from the full card images, like the web export: the card box is
 * 264x370 device pixels at 2x, so a 300px thumb is a 1:1 render of an already
 * lossy source. An image that cannot be fetched or decoded leaves the
 * placeholder box with the card name, so a missing image never costs the whole
 * reply.
```

- [ ] **Step 5: Run the tests**

```bash
npm test -w @revelio/bot -- test/deck-image.test.ts
```

Expected: PASS.

- [ ] **Step 6: Check the concurrency test still means something**

`never has more than eight thumbs in flight` still passes, but its name now lies. Rename it
to `never has more than eight card images in flight`. `MAX_IN_FLIGHT` stays at 8: the
payload grew 13x but the fetches are in-cluster and the reply has a 15-minute budget, and
raising it would raise peak memory, which Phase 1 exists to bound.

- [ ] **Step 7: Measure the real cost before claiming it is fine**

Write a throwaway script under the scratchpad that renders a 60-entry deck against the
production image host and prints peak RSS, output size and elapsed time, the way the spec's
table was produced. Compare against the spec's 60-entry row (368 MB, 1.49 MB, 1140 ms).

Expected: elapsed time rises - roughly 13x the bytes over the wire - and peak RSS rises
somewhat. If peak RSS exceeds 400 MB at 60 entries, stop and lower `MAX_SHEET_PIXELS`
rather than shipping it: the whole point of Phase 1 is that this number is knowable, and a
quality change that quietly invalidates it is a regression.

Record the measured numbers. They go in the PR's `## Verification`.

- [ ] **Step 8: Run the whole bot suite, typecheck, lint**

```bash
npm test -w @revelio/bot
npm run typecheck
npm run lint -w @revelio/bot
```

- [ ] **Step 9: Commit**

```bash
git add app/bot/src/images/deck-image.ts app/bot/test/deck-image.test.ts
git commit -m "feat(bot): draw the deck sheet from full card art"
```

Body:

```
The card box is 264x370 device pixels at 2x, so the 300px thumb was a 1:1
render of an already lossy source with no headroom. web/src/lib/deck-png.ts
made the same call for the export and said so in a comment; the two
painters should not disagree about it. Full images are ~317 KB against
~23 KB, so the per-request timeout goes to 10s to match web's.
```

---

### Task 3: Update the documentation the change contradicts

**Files:**
- Modify: `CLAUDE.md` - the "Card images use `thumbKey` (300px), never the full `imageKey`"
  bullet under "Discord bot specifics"
- Modify: `docs/superpowers/plans/2026-09-17-bot-deck-image.md` - the "Thumbs, not full
  images, at 2x" and "Output WebP, quality 90" decisions
- Modify: the Discord docs page, if it states the format (`grep -rn "deck.webp\|WebP" docs/ app/web/content/`)

- [ ] **Step 1: Narrow the CLAUDE.md bullet to where it is still true**

The rule still holds for `/card`, `/search` and `/collection` embeds, which is what it was
written for. Only the deck sheet changed:

```markdown
- Card images in embeds use `thumbKey` (300px), never the full `imageKey`. The `/deck`
  sheet is the exception and draws from `imageKey`: its card box is 264x370 device pixels,
  which a 300px thumb covers with no headroom.
```

- [ ] **Step 2: Add a revision note to the original plan rather than editing its decisions**

`docs/superpowers/plans/2026-09-17-bot-deck-image.md` already carries a `## Revision`
section from its own first rewrite; append to it rather than rewriting history:

```markdown
Superseded on 2026-09-17 by
`docs/superpowers/specs/2026-09-17-deck-image-delivery-design.md`: the "Thumbs, not full
images, at 2x" and "Output WebP, quality 90" decisions above are both reversed there. The
thumb reasoning ("no visible gain in a chat column") did not survive contact with the
264x370 card box, and WebP was a second generation of loss on an already lossy source.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs(bot): record that the deck sheet is PNG from full art"
```

---

## Self-Review

- **Spec coverage.** Covers the spec's goals "`/deck` posts a PNG" (Task 1) and "Card art
  at least as crisp as the web export, within a bounded file size" (Task 2). The bounded
  part is Phase 1's `MAX_SHEET_PIXELS` plus Task 1's `MAX_ATTACHMENT_BYTES` guard.
- **Type consistency.** `DeckImageOptions` gains one optional field; `renderDeckImage`'s
  signature is otherwise unchanged, so Phase 2's call site in `deck.ts` needs no edit.
- **Ordering.** Task 1 before Task 2 on purpose: the PNG size guard has to exist before the
  source images get 13x bigger, so that if full art does push a sheet over the limit the
  fallback is already there to catch it.
- **The `## Deployment` line this phase forces into the PR body:** none of its own. The
  spec's pod memory limit (640Mi) is Phase 1's, and still required.

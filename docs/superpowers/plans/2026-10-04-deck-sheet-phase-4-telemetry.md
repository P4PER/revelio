# Deck Sheet Render Service - Phase 4 (Render Telemetry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every request to `POST /render` leaves one log line that says what was drawn, how long each phase took and whether the request was shed. That line is the evidence for deciding whether the caches in spec §5 are worth building.

**Architecture:** `renderSheet` times its two phases (fetch, then composite + encode) and returns the numbers with the rest of `SheetRender`. The server adds the time spent waiting in the queue, then writes one `sheet: render ...` line per request, whatever the outcome (`rendered`, `shed`, `failed`, `abandoned`). The same timings go to the caller as a standard `Server-Timing` header. A short digest of the parsed request goes on the line too, so repeat requests can be counted from logs without logging any deck content.

**Tech Stack:** TypeScript, Node 22 (`node:crypto`), sharp, vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-deck-sheet-render-service-design.md` (§5 for the deferred caches and the evidence that would bring them back, §11 for the log line)

## Why there is no cache in this phase

This phase originally built two disk caches: one for finished sheets and one for card art.
They were dropped (2026-10-05) because nothing has shown they are needed. A render takes about 3 s, and it only happens on an explicit export click or a `/deck` command, which both
callers already wait for (30 s and 75 s). Most sheet keys never repeat: any deck edit makes a new key, and web exports unsaved decks.
An art hit only saves one in-cluster GET; sharp still decodes the image.
Load is already bounded by web's per-IP rate limit and the queue's 503. A wrong cache is worse than none, and the
design needed a persistent volume, three env vars and a hand-written LRU. Spec §5 keeps the design and lists the log
evidence that would bring it back. This phase produces that evidence.

## Global Constraints

- **One line per request that reached the queue's admission check**, success or not. A request rejected earlier (bad token, bad JSON, oversized body) is not a render and keeps its current behaviour.
- **Logs name card ids and reasons, never URLs** (spec §10). The new line carries counts, timings and a digest, and no names, titles or hosts.
- **The digest is not reversible into deck content in any useful sense** and is truncated to 16 hex chars: it exists to count repeats, not to identify a deck.
- **No new env var, no new dependency, no behaviour change** to what is rendered or which status is returned.
- **Types:** `type` aliases only, `import type` for type-only imports, declaration order types -> constants -> helpers -> exported functions.
- **Comments are ASCII only.** Conventional Commits, scope `sheet`. No tool attribution.
- All commands run from `app/`.

---

### Task 1: Time the two render phases

**Files:**
- Modify: `sheet/src/render.ts` (`SheetRender`, `renderSheet`)
- Test: `sheet/test/render.test.ts`, `sheet/test/server-queue.test.ts` (its mocked `renderSheet` return)

**Interfaces:**
- Produces: `SheetRender.fetchMs: number` (the art fetch and decode plus the text overlays, which run together) and `SheetRender.encodeMs: number` (the composite and every encode, including the WebP fallback's second one when it runs). sharp composites lazily inside `toBuffer`, so composite time cannot be separated from encode time without paying for an extra raw encode, which the comment above `sheet` already rejects. Task 2 logs both.

- [ ] **Step 1: Write the failing test**

Append to the `renderSheet` describe block in `sheet/test/render.test.ts`:

```ts
  it('reports how long the fetch and the encode took', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    expect(out.fetchMs).toBeGreaterThanOrEqual(0)
    expect(out.encodeMs).toBeGreaterThan(0)
  })

  // The fallback is the slow path; a number that only covered the PNG would hide
  // exactly the render someone is asking about.
  it('counts both encodes when it falls back to WebP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await noisyArt(), { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Same fixture and ceiling as the fallback test above: the PNG overshoots,
    // the WebP fits.
    const png = await renderSheet(req, { ...opts, pixelBudget: 1_250_000 })
    const webp = await renderSheet({ ...req, maxBytes: 300_000 }, { ...opts, pixelBudget: 1_250_000 })
    expect(webp.contentType).toBe('image/webp')
    // Two encodes against one. Not a strict ratio - timing on a loaded CI box is
    // noisy - only that the second encode was not left out.
    expect(webp.encodeMs).toBeGreaterThan(png.encodeMs)
  })
```

If the last assertion flakes in CI, loosen it to `toBeGreaterThan(0)` rather than retry; the ordering is the intent, not a guarantee.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/render.test.ts`
Expected: FAIL - `fetchMs` and `encodeMs` are undefined.

- [ ] **Step 3: Measure in `renderSheet`**

In `sheet/src/render.ts`, add the two fields to `SheetRender`:

```ts
  // Wall clock, in ms. fetchMs covers the art fetch and decode and the text
  // overlays, which run together; encodeMs covers the composite and every encode,
  // because sharp composites lazily inside toBuffer and the two cannot be told
  // apart without paying for a raw encode.
  fetchMs: number
  encodeMs: number
```

and in `renderSheet`:

```ts
  const fetchStarted = performance.now()
  const [cards, text] = await Promise.all([ /* unchanged */ ])
  const fetchMs = Math.round(performance.now() - fetchStarted)
  opts.signal?.throwIfAborted()

  const sheet = sharp(/* unchanged */)
  const common = { /* unchanged */, fetchMs }
  const encodeStarted = performance.now()
  const encodeMs = () => Math.round(performance.now() - encodeStarted)

  const png = await sheet.clone().png({ compressionLevel: 6 }).toBuffer()
  if (req.maxBytes === undefined || png.length <= req.maxBytes) {
    return { body: png, contentType: 'image/png', ...common, encodeMs: encodeMs() }
  }
  // ... fallback unchanged ...
  return { body: webp, contentType: 'image/webp', ...common, encodeMs: encodeMs() }
```

`performance.now()` rather than `Date.now()`: it is monotonic, so a clock step during a render cannot produce a negative duration.

- [ ] **Step 4: Keep the queue test's mock honest**

`sheet/test/server-queue.test.ts` replaces `renderSheet` with a mock whose return type is `SheetRender`. Add `fetchMs: 0, encodeMs: 0` to that return so it still matches the type.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @revelio/sheet && npm run typecheck -w @revelio/sheet`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add sheet/src/render.ts sheet/test/render.test.ts sheet/test/server-queue.test.ts
git commit -m "feat(sheet): time the fetch and encode phases of a render"
```

---

### Task 2: One log line and a Server-Timing header per render

**Files:**
- Modify: `sheet/src/server.ts`
- Test: `sheet/test/server.test.ts`, `sheet/test/server-queue.test.ts`

**Interfaces:**
- Consumes: `SheetRender.fetchMs`, `SheetRender.encodeMs` (Task 1).
- Produces: a `sheet: render outcome=<rendered|shed|failed|abandoned> ...` line on stdout for every request that reached admission, and `Server-Timing: queue;dur=N, fetch;dur=N, encode;dur=N` on a 200.

The line, for a rendered sheet:

```
sheet: render outcome=rendered digest=3f9a0c51d2e4b788 entries=42 distinct=38 mpx=7.41 scale=1.640 art=full dropped=0 queueMs=0 fetchMs=812 encodeMs=401 bytes=11873310 type=png
```

`outcome=shed` carries `digest`, `entries` and `queued` (how many were admitted when it was turned away). `outcome=failed` and `outcome=abandoned` carry `digest`, `entries`, `queueMs` and the error message, which is already logged today and contains no URL. `abandoned` means the caller hung up or the deadline passed (the existing `abandon` signal fired); `failed` is any other throw.

- [ ] **Step 1: Write the failing tests**

In `sheet/test/server.test.ts`, extend `'renders a PNG and describes it in headers'`, or add beside it:

```ts
  it('reports the render phases in Server-Timing', async () => {
    const res = await post(body)
    const timing = res.headers.get('server-timing') ?? ''
    expect(timing).toMatch(/queue;dur=\d+/)
    expect(timing).toMatch(/fetch;dur=\d+/)
    expect(timing).toMatch(/encode;dur=\d+/)
  })

  it('logs one line per render, with no deck content in it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await post(body)
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sheet: render '))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/outcome=rendered digest=[0-9a-f]{16} entries=1 /)
    expect(lines[0]).toMatch(/fetchMs=\d+ encodeMs=\d+ bytes=\d+ type=png$/)
    // The deck title and the card name are user input.
    expect(lines[0]).not.toContain('Charms Aggro')
    expect(lines[0]).not.toContain('Harry Potter')
    log.mockRestore()
  })

  // The digest is what lets repeat requests be counted from the logs, which is
  // the evidence spec section 5 waits for before building a sheet cache.
  it('gives the same request the same digest and a different deck another', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await post(body)
    await post(body)
    await post({ ...body, deck: { ...body.deck, name: 'Other' } })
    const digests = log.mock.calls
      .map((c) => /digest=([0-9a-f]+)/.exec(String(c[0]))?.[1])
      .filter(Boolean)
    expect(digests).toHaveLength(3)
    expect(digests[0]).toBe(digests[1])
    expect(digests[2]).not.toBe(digests[0])
    log.mockRestore()
  })
```

Add `vi` to that file's vitest import. Also fix the stale comment on `body` there, which still says "Phase 4's cache tests override it where a fetch is the point". Nothing does now, so drop that sentence.

In `sheet/test/server-queue.test.ts`, add to the queue describe block, using the existing `gate` and `post`:

```ts
  // A shed request is the clearest sign the service is short of capacity, so it
  // has to show up in the same line as everything else.
  it('logs a shed request', async () => {
    gate.reset()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const flight = Array.from({ length: MAX_QUEUED + 1 }, post)
    await vi.waitFor(() => expect(gate.release.length).toBe(1))
    const shed = await post()
    expect(shed.status).toBe(503)
    expect(log.mock.calls.map((c) => String(c[0])).some((l) => /^sheet: render outcome=shed /.test(l))).toBe(true)
    gate.openAll()
    for (let i = 0; i < MAX_QUEUED; i += 1) {
      await vi.waitFor(() => expect(gate.release.length).toBe(1))
      gate.openAll()
    }
    await Promise.all(flight)
    log.mockRestore()
  })
```

Match the drain loop to the one the existing `'never has two renders in flight'` test uses. If that test drains the queue differently, copy its loop rather than this one.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/sheet -- test/server.test.ts test/server-queue.test.ts`
Expected: FAIL - no `server-timing` header, no `sheet: render` line.

- [ ] **Step 3: Write the digest and the log helper**

In `sheet/src/server.ts`, below the existing constants:

```ts
import { createHash } from 'node:crypto'

type RenderLog = Record<string, string | number | boolean>

// Counts repeats in the logs, which is the evidence for or against a sheet
// cache (spec section 5). Zod's parse output lists keys in schema order, so the
// same request from either caller stringifies the same way. Truncated: it only
// has to tell requests apart, not stand in for one.
function requestDigest(req: DeckSheetRequest): string {
  return createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0, 16)
}

// key=value, one line, so a log query can filter and aggregate on any field
// without parsing prose.
function logRender(fields: RenderLog): void {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`)
  console.log(`sheet: render ${parts.join(' ')}`)
}
```

`timingSafeEqual` is already imported from `node:crypto`. Add `createHash` to that import rather than writing a second one.

- [ ] **Step 4: Log at each outcome**

In `render()`, after `safeParse` succeeds:

```ts
    const digest = requestDigest(parsed.data)
    const entries = parsed.data.entries.length
```

At the shed branch, before `send(res, 503, ...)`:

```ts
      logRender({ outcome: 'shed', digest, entries, queued: admitted })
```

Before `enqueue`, `const admittedAt = performance.now()`. Inside the job, first statement, `const queueMs = Math.round(performance.now() - admittedAt)`. If the `res.closed` early return fires, log `{ outcome: 'abandoned', digest, entries, queueMs, reason: 'caller went away before its turn' }` before returning. That case is a queue that is too long for its callers, and it is evidence too.

On success, add the header and the line:

```ts
            'server-timing': `queue;dur=${queueMs}, fetch;dur=${out.fetchMs}, encode;dur=${out.encodeMs}`,
```

```ts
          logRender({
            outcome: 'rendered', digest, entries, distinct: out.distinct,
            mpx: (out.pixels / 1e6).toFixed(2), scale: out.scale.toFixed(3),
            art: out.fullArt ? 'full' : 'thumb', dropped: out.dropped,
            queueMs, fetchMs: out.fetchMs, encodeMs: out.encodeMs,
            bytes: out.body.length, type: out.contentType === 'image/png' ? 'png' : 'webp',
          })
```

In the `catch`, replace the existing `console.error('sheet: render failed:', ...)` with:

```ts
          const reason = err instanceof Error ? err.message : String(err)
          logRender({ outcome: abandon.signal.aborted ? 'abandoned' : 'failed', digest, entries, queueMs, reason: JSON.stringify(reason) })
```

`JSON.stringify` quotes the message so its spaces cannot break the key=value split. `console.log` rather than `console.error` for all four outcomes, so they land in one stream and one query; the existing `console.warn` lines in `render.ts` (per-card failures, the WebP fallback) stay as they are.

- [ ] **Step 5: Run everything**

Run: `npm test -w @revelio/sheet && npm run typecheck -w @revelio/sheet && npm run lint`
Expected: PASS and clean. If a pre-existing test asserted on the old `sheet: render failed:` text, update it to the new line rather than keep both.

- [ ] **Step 6: Check it against real art**

```bash
docker compose up -d --build rustfs sheet
curl -s -D - -o /dev/null -H 'authorization: Bearer local-dev-sheet-token' \
  -H 'content-type: application/json' --data @<deck.json> http://localhost:8080/render | grep -i server-timing
docker compose logs sheet | grep 'sheet: render' | tail -2
```

Build `<deck.json>` in the scratchpad from a real deck with real `cardId`/`imageVersion` values from the seeded stack (the body web's route posts). Expected: a `Server-Timing` header whose three numbers match the log line, `fetchMs` in the hundreds of ms for a full-art deck, and the same `digest` when the request is sent twice.

- [ ] **Step 7: Commit**

```bash
git add sheet/src/server.ts sheet/test/server.test.ts sheet/test/server-queue.test.ts
git commit -m "feat(sheet): log one line per render and send Server-Timing"
```

---

### Task 3: Documentation

**Files:**
- Modify: `CLAUDE.md` (the `@revelio/sheet` bullet)

- [ ] **Step 1: Extend the workspace bullet**

Append to the `@revelio/sheet` bullet:

```markdown
  Every request that reaches the queue logs one `sheet: render outcome=... ` key=value line
  (rendered / shed / failed / abandoned, with queue, fetch and encode ms and a 16-char request
  digest) and a 200 carries the same timings in `Server-Timing`. No cache, on purpose: spec
  section 5 keeps the design and names the log evidence that would justify building it.
```

- [ ] **Step 2: Full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green. Record the counts for the PR's `## Verification`. Mind that `npm test` wipes the dev Meilisearch indexes.

- [ ] **Step 3: Commit**

```bash
git add ../CLAUDE.md
git commit -m "docs(sheet): record the render log line"
```

---

## Phase 4 definition of done

- A rendered sheet answers with `Server-Timing: queue;dur=..., fetch;dur=..., encode;dur=...` and logs exactly one `sheet: render outcome=rendered` line whose numbers agree with it.
- A shed request, a failed render and a caller that hung up each log one line with their own `outcome`.
- No line contains a deck title, a card name or a URL.
- The same request sent twice logs the same `digest`.
- `npm test`, `npm run lint`, `npm run typecheck` green.
- The PR's `## Deployment` says: nothing to configure. No env var, no volume, no migration, no ingest run.

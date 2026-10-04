# Deck Sheet Render Service — Phase 4 (Caching and Telemetry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeat render of the same sheet costs no composite, a repeat fetch of the same card art costs no request, and every render leaves one line that says what it drew and why.

**Architecture:** One bounded disk LRU (`BlobCache`) serves two caches. The sheet cache is keyed on a SHA-256 of the canonical request plus the geometry constants and a painter version, so a geometry edit invalidates it by itself; a hit answers without entering the render queue at all. The art cache is keyed on the image key, which is immutable by construction - and the full-art corpus is 1098 cards at ~317 KB, so a 512 MB budget holds every card in the game.

**Tech Stack:** TypeScript, Node 22 (`node:fs/promises`, `node:crypto`), sharp, vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-deck-sheet-render-service-design.md`

## Global Constraints

- **Local disk, not the object store.** The `images` bucket policy is `s3:GetObject` for `Principal: *` on `bucket/*`, and web exports private and unsaved decks. `BlobCache` is the seam an object-store implementation would drop into if replica count ever exceeds 1.
- **Disk, not the heap.** The pod's 768Mi is sized for one 551 MB render; a cache in memory would compete with it.
- **A sheet drawn with missing art is never cached.** `dropped > 0` means a transient fetch failure is in the picture, and caching it would make a minutes-long outage last for as long as the entry does.
- **A cache hit does not enter the render queue.** It costs no composite, so it must not wait behind one.
- **Cache keys are hashes.** A key is attacker-influenced text (card names, deck titles); hashing is what keeps it out of the filesystem path.
- **`CACHE_DIR` unset disables both caches** and must stay a supported configuration - it is what the test suite and `npm run dev` run with.
- **Logs name card ids and reasons, never URLs.**
- **Types:** `type` aliases only, `import type` for type-only imports, declaration order types -> constants -> helpers -> exported functions.
- **Comments are ASCII only.** Conventional Commits, scope `sheet`. No tool attribution.
- All commands run from `app/`.

---

### Task 1: A bounded disk LRU

**Files:**
- Create: `sheet/src/cache.ts`, `sheet/test/cache.test.ts`

**Interfaces:**
- Produces:
  - `type BlobCache = { get(key: string): Promise<Buffer | null>; put(key: string, body: Buffer): Promise<void> }`
  - `createDiskCache(dir: string, maxBytes: number): Promise<BlobCache>`
  - `nullCache: BlobCache`

  Tasks 3 and 4 take a `BlobCache` each; Task 2 builds them from the env.

- [ ] **Step 1: Write the failing test**

`sheet/test/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiskCache, nullCache } from '../src/cache'

let dir = ''
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'sheet-cache-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const body = (n: number) => Buffer.alloc(n, 7)

describe('createDiskCache', () => {
  it('returns what it stored', async () => {
    const cache = await createDiskCache(dir, 1_000_000)
    await cache.put('a', body(10))
    expect((await cache.get('a'))?.length).toBe(10)
  })

  it('misses on an unknown key', async () => {
    const cache = await createDiskCache(dir, 1_000_000)
    expect(await cache.get('nope')).toBeNull()
  })

  it('evicts the least recently used entry to stay inside its budget', async () => {
    const cache = await createDiskCache(dir, 300)
    await cache.put('a', body(100))
    await cache.put('b', body(100))
    await cache.get('a')            // 'a' is now the more recently used of the two
    await cache.put('c', body(150)) // 350 > 300, so one has to go
    expect(await cache.get('b')).toBeNull()
    expect(await cache.get('a')).not.toBeNull()
    expect(await cache.get('c')).not.toBeNull()
  })

  it('refuses an entry larger than the whole budget rather than empty itself', async () => {
    const cache = await createDiskCache(dir, 100)
    await cache.put('big', body(500))
    expect(await cache.get('big')).toBeNull()
    expect(await readdir(dir)).toHaveLength(0)
  })

  // A key carries card names and deck titles. Writing one into a path is how a
  // cache becomes a file-write primitive.
  it('cannot be made to write outside its directory', async () => {
    const cache = await createDiskCache(dir, 1_000_000)
    await cache.put('../../escaped', body(10))
    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('finds entries a previous process left behind', async () => {
    const first = await createDiskCache(dir, 1_000_000)
    await first.put('a', body(10))
    const second = await createDiskCache(dir, 1_000_000)
    expect((await second.get('a'))?.length).toBe(10)
  })

  it('survives a directory it cannot read', async () => {
    const cache = await createDiskCache(join(dir, 'nested', 'deeper'), 1_000)
    await cache.put('a', body(10))
    expect((await cache.get('a'))?.length).toBe(10)
  })
})

describe('nullCache', () => {
  it('stores nothing and always misses', async () => {
    await nullCache.put('a', body(10))
    expect(await nullCache.get('a')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/cache.test.ts`
Expected: FAIL — `Cannot find module '../src/cache'`.

- [ ] **Step 3: Write the cache**

`sheet/src/cache.ts`:

```ts
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Read and written as bytes, keyed by an arbitrary string. Deliberately this
// small: it is the seam an object-store implementation would drop into if the
// service ever ran more than one replica, and anything richer would have to be
// implemented twice.
export type BlobCache = {
  get(key: string): Promise<Buffer | null>
  put(key: string, body: Buffer): Promise<void>
}

type Entry = { size: number; used: number }

// A cache that stores nothing, for CACHE_DIR unset - which is how the test suite
// and `npm run dev` run, and what a deployment with no disk gets.
export const nullCache: BlobCache = {
  get: async () => null,
  put: async () => {},
}

// Keys carry card names and deck titles. A hash is both the de-pathing and the
// length bound: no traversal, no reserved names, no case-folding surprises.
function fileFor(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * A bounded, least-recently-used cache on local disk. The index lives in memory
 * and is rebuilt from the directory on startup, so a restart keeps what the last
 * process wrote; a replaced pod does not, which costs one re-render per entry.
 *
 * Sizes come from the files themselves rather than from what a caller claimed,
 * so a crash between write and bookkeeping cannot leave the budget lying.
 */
export async function createDiskCache(dir: string, maxBytes: number): Promise<BlobCache> {
  const entries = new Map<string, Entry>()
  let total = 0
  let clock = 0

  await mkdir(dir, { recursive: true })
  for (const name of await readdir(dir).catch(() => [])) {
    const info = await stat(join(dir, name)).catch(() => null)
    if (!info?.isFile()) continue
    // Recovered entries all share the oldest tick: nothing is known about how
    // recently they were wanted, and the first hit fixes that.
    entries.set(name, { size: info.size, used: 0 })
    total += info.size
  }

  async function evictTo(budget: number): Promise<void> {
    const byAge = [...entries.entries()].sort((a, b) => a[1].used - b[1].used)
    for (const [name, entry] of byAge) {
      if (total <= budget) return
      await rm(join(dir, name), { force: true })
      entries.delete(name)
      total -= entry.size
    }
  }

  return {
    async get(key) {
      const name = fileFor(key)
      const entry = entries.get(name)
      if (!entry) return null
      const body = await readFile(join(dir, name)).catch(() => null)
      if (!body) {
        // Something removed the file underneath us; the index was the stale half.
        entries.delete(name)
        total -= entry.size
        return null
      }
      clock += 1
      entry.used = clock
      return body
    },

    async put(key, body) {
      // An entry that cannot fit on its own would evict everything and then still
      // not fit, so it is simply not cached.
      if (body.length > maxBytes) return
      const name = fileFor(key)
      const existing = entries.get(name)
      if (existing) total -= existing.size
      await evictTo(maxBytes - body.length)
      await writeFile(join(dir, name), body)
      clock += 1
      entries.set(name, { size: body.length, used: clock })
      total += body.length
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/sheet -- test/cache.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add sheet/src/cache.ts sheet/test/cache.test.ts
git commit -m "feat(sheet): add a bounded disk cache"
```

---

### Task 2: Configure the two caches

**Files:**
- Modify: `sheet/src/env.ts`, `sheet/.env.example`, `sheet/Dockerfile` (a writable cache dir), `docker-compose.yml` (volume + `CACHE_DIR`)
- Test: `sheet/test/env.test.ts`

**Interfaces:**
- Produces: `SheetEnv.CACHE_DIR: string | undefined`, `SheetEnv.SHEET_CACHE_BYTES: number`, `SheetEnv.ART_CACHE_BYTES: number`. Task 4 builds both caches from them.

- [ ] **Step 1: Write the failing test**

Append to `sheet/test/env.test.ts`:

```ts
describe('the caches', () => {
  it('are off when no directory is configured', () => {
    expect(parseEnv(base).CACHE_DIR).toBeUndefined()
  })

  it('default to 512 MB each', () => {
    const env = parseEnv({ ...base, CACHE_DIR: '/cache' })
    expect(env.SHEET_CACHE_BYTES).toBe(536_870_912)
    expect(env.ART_CACHE_BYTES).toBe(536_870_912)
  })

  it('take sizes from the environment', () => {
    const env = parseEnv({ ...base, CACHE_DIR: '/cache', SHEET_CACHE_BYTES: '1000', ART_CACHE_BYTES: '2000' })
    expect([env.SHEET_CACHE_BYTES, env.ART_CACHE_BYTES]).toEqual([1000, 2000])
  })

  // An env file ships the key blank, so an empty string has to mean "unset".
  it('treats a blank directory as unset', () => {
    expect(parseEnv({ ...base, CACHE_DIR: '' }).CACHE_DIR).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/env.test.ts`
Expected: FAIL — the three keys are not in `SheetEnv`.

- [ ] **Step 3: Add the variables**

In `sheet/src/env.ts`, inside `Env`:

```ts
  // Where the sheet and card-art caches live. Unset means no caching at all,
  // which is a supported configuration: every render is correct without them.
  // Blank is how "unset" reaches us from an env file and must mean the same.
  CACHE_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  // 512 MB each by default. The art budget is the one that pays: the full-art
  // corpus is 1098 cards at ~317 KB, so this holds every card in the game and the
  // steady state is a render with no outbound fetches.
  SHEET_CACHE_BYTES: z.coerce.number().int().min(0).default(536_870_912),
  ART_CACHE_BYTES: z.coerce.number().int().min(0).default(536_870_912),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/sheet -- test/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Give the container somewhere to write**

In `sheet/Dockerfile`, beside the fontconfig cache step:

```dockerfile
# The sheet and art caches live here when CACHE_DIR points at it. Created and
# owned at build time so a mounted volume or an emptyDir is writable without a
# root entrypoint.
RUN mkdir -p /cache && chown sheet:nodejs /cache
```

In `sheet/.env.example`:

```
# ---- Caches --------------------------------------------------------------
# Directory for the rendered-sheet and card-art caches. Leave blank to disable
# both; every render is correct without them, just slower. On disk rather than in
# memory on purpose - the process memory budget is sized for one render.
CACHE_DIR=
SHEET_CACHE_BYTES=536870912
ART_CACHE_BYTES=536870912
```

In `docker-compose.yml`, on the `sheet` service:

```yaml
    environment:
      IMAGE_BASE_URL: http://rustfs:9000/images
      SHEET_TOKEN: local-dev-sheet-token
      CACHE_DIR: /cache
    volumes:
      - sheetcache:/cache
```

and in the top-level `volumes` block:

```yaml
  sheetcache: {}
```

- [ ] **Step 6: Commit**

```bash
git add sheet/src/env.ts sheet/.env.example sheet/Dockerfile sheet/test/env.test.ts docker-compose.yml
git commit -m "feat(sheet): configure the sheet and art caches"
```

---

### Task 3: Cache card art

**Files:**
- Modify: `sheet/src/render.ts` (`fetchCardImage`, `cardOverlays`, `renderSheet`, `SheetRenderOptions`)
- Test: `sheet/test/render.test.ts`

**Interfaces:**
- Consumes: `BlobCache`, `nullCache` (Task 1).
- Produces: `SheetRenderOptions.art?: BlobCache`, and `SheetRender` gains `prepareMs: number` and `encodeMs: number`. Task 4 logs both.

- [ ] **Step 1: Write the failing test**

Append to the `renderSheet` describe block in `sheet/test/render.test.ts`:

```ts
  it('fetches each card image once and then reads it from the cache', async () => {
    const store = new Map<string, Buffer>()
    const art = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, b: Buffer) => { store.set(k, b) },
    }
    const urls = recordingFetch(await art_())
    await renderSheet(req, { ...opts, art })
    const first = urls.length
    expect(first).toBeGreaterThan(0)

    await renderSheet(req, { ...opts, art })
    // Second render of the same deck: nothing new is fetched.
    expect(urls).toHaveLength(first)
  })

  it('caches art by its own key, so another deck reuses it', async () => {
    const store = new Map<string, Buffer>()
    const art = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, b: Buffer) => { store.set(k, b) },
    }
    recordingFetch(await art_())
    await renderSheet(req, { ...opts, art })
    // The key is the image key, which is immutable: a new version is a new key.
    expect([...store.keys()]).toContain('cards/harry.1.webp')
  })

  it('never caches a failed fetch', async () => {
    const store = new Map<string, Buffer>()
    const art = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, b: Buffer) => { store.set(k, b) },
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderSheet(req, { ...opts, art })
    expect(store.size).toBe(0)
  })

  it('reports how long it spent preparing and encoding', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art_(), { status: 200 })))
    const out = await renderSheet(req, opts)
    expect(out.prepareMs).toBeGreaterThanOrEqual(0)
    expect(out.encodeMs).toBeGreaterThanOrEqual(0)
  })
```

Rename the existing `art()` fixture helper to `art_()` in that file first (a parameter named
`art` now shadows it in these tests), or rename the fixture to `cardArt()` throughout - either
way, one name per thing.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/render.test.ts`
Expected: FAIL — `art` is not a known option, `prepareMs` is undefined.

- [ ] **Step 3: Thread the cache through the fetch path**

In `sheet/src/render.ts`:

```ts
import { nullCache, type BlobCache } from './cache'

export type SheetRenderOptions = {
  imageBase: string
  // Fetched card art, keyed by image key. Immutable keys, so an entry never goes
  // stale: a re-uploaded image is a new version and a new key.
  art?: BlobCache
  // Test seam, so a test can spend the budget without waiting out FETCH_BUDGET_MS.
  fetchBudgetMs?: number
}
```

`fetchCardImage` takes the key it built and the cache:

```ts
async function fetchCardImage(
  card: DeckSheetCard,
  imageBase: string,
  fullArt: boolean,
  deadline: number,
  art: BlobCache,
): Promise<CardImageResult> {
  if (card.imageVersion == null) return { failure: null }
  const key = (fullArt ? imageKey : thumbKey)(card.cardId, card.imageVersion)
  const cached = await art.get(key)
  if (cached) return { body: cached }

  const left = deadline - Date.now()
  if (left <= 0) return { failure: BUDGET_SPENT }
  try {
    const res = await fetch(imageUrl(imageBase, key), {
      signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left)),
    })
    if (!res.ok) return { failure: `HTTP ${res.status}` }
    const body = Buffer.from(await res.arrayBuffer())
    // Only a success is stored: caching a 500 would make a transient outage
    // outlive itself.
    await art.put(key, body)
    return { body }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}
```

Note the ordering change: the cache is consulted **before** the budget check, because a hit
costs no wall clock and a deck whose art is all cached must render even with the budget spent.

`cardOverlays` takes and forwards the cache (add `art: BlobCache` to its parameters and pass it
into `fetchCardImage`), and `renderSheet` measures the two phases:

```ts
  const started = Date.now()
  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s, opts.fetchBudgetMs ?? FETCH_BUDGET_MS, opts.art ?? nullCache),
    textOverlays(geom, layout.title, s),
  ])
  const prepareMs = Date.now() - started
```

and the encode measured the same way, so the WebP fallback's second encode is counted too:

```ts
  const sheet = sharp(chromeSvg(geom, s)).composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])
  const encodeStarted = Date.now()
  const png = await sheet.clone().png({ compressionLevel: 9 }).toBuffer()
  const common = {
    pixels: w * h, scale: s, fullArt: usesFullArt(s), dropped: cards.dropped,
    distinct: cards.distinct, prepareMs,
  }
  if (req.maxBytes === undefined || png.length <= req.maxBytes) {
    return { body: png, contentType: 'image/png', ...common, encodeMs: Date.now() - encodeStarted }
  }
  // ... the WebP fallback, returning `encodeMs: Date.now() - encodeStarted` as well,
  // so the number covers both encodes when the fallback ran.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @revelio/sheet -- test/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sheet/src/render.ts sheet/test/render.test.ts
git commit -m "perf(sheet): read card art from a cache before fetching it"
```

---

### Task 4: Cache the sheet, and log what was drawn

**Files:**
- Modify: `sheet/src/server.ts`
- Create: `sheet/src/key.ts`, `sheet/test/key.test.ts`
- Test: `sheet/test/server.test.ts`

**Interfaces:**
- Produces: `PAINTER_VERSION: 1` and `sheetCacheKey(req: DeckSheetRequest): string` from `sheet/src/key.ts`; `createSheetServer(env: SheetEnv, caches?: { sheets: BlobCache; art: BlobCache }): Server`.

- [ ] **Step 1: Write the failing key test**

`sheet/test/key.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { DeckSheetRequest } from '@revelio/core'
import { sheetCacheKey } from '../src/key'

const req: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: 1, orientation: null,
  }],
}

describe('sheetCacheKey', () => {
  it('is stable for the same input', () => {
    expect(sheetCacheKey(req)).toBe(sheetCacheKey(structuredClone(req)))
  })

  it('does not depend on the order the JSON arrived in', () => {
    const reordered = JSON.parse(JSON.stringify({
      entries: req.entries.map((e) => ({ orientation: e.orientation, quantity: e.quantity, zone: e.zone, types: e.types, name: e.name, setCode: e.setCode, imageVersion: e.imageVersion, cardId: e.cardId })),
      deck: { format: req.deck.format, name: req.deck.name },
      locale: req.locale,
    })) as DeckSheetRequest
    expect(sheetCacheKey(reordered)).toBe(sheetCacheKey(req))
  })

  it('changes with anything that moves a pixel', () => {
    const base = sheetCacheKey(req)
    expect(sheetCacheKey({ ...req, locale: 'de' })).not.toBe(base)
    expect(sheetCacheKey({ ...req, maxBytes: 9_000_000 })).not.toBe(base)
    expect(sheetCacheKey({ ...req, deck: { ...req.deck, name: 'Other' } })).not.toBe(base)
    expect(sheetCacheKey({ ...req, deck: { ...req.deck, format: 'revival' } })).not.toBe(base)
    // A re-uploaded image is a new version, and a different picture.
    expect(sheetCacheKey({ ...req, entries: [{ ...req.entries[0], imageVersion: 2 }] })).not.toBe(base)
    expect(sheetCacheKey({ ...req, entries: [{ ...req.entries[0], quantity: 3 }] })).not.toBe(base)
    expect(sheetCacheKey({ ...req, entries: [{ ...req.entries[0], name: 'Harry Potter ' }] })).not.toBe(base)
    expect(sheetCacheKey({ ...req, entries: [{ ...req.entries[0], types: ['spell'] }] })).not.toBe(base)
    expect(sheetCacheKey({ ...req, entries: [{ ...req.entries[0], orientation: 'horizontal' }] })).not.toBe(base)
  })

  it('is a hex digest, not the request', () => {
    expect(sheetCacheKey(req)).toMatch(/^[0-9a-f]{64}$/)
  })
})

// The geometry constants are in the digest so that editing the layout in core
// invalidates every cached sheet without anyone remembering to bump a version.
describe('sheetCacheKey and the geometry', () => {
  it('changes when DECK_SHEET changes', async () => {
    const before = sheetCacheKey(req)
    vi.resetModules()
    vi.doMock('@revelio/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@revelio/core')>()
      return { ...actual, DECK_SHEET: { ...actual.DECK_SHEET, cardWidth: 999 } }
    })
    const { sheetCacheKey: withOtherGeometry } = await import('../src/key')
    expect(withOtherGeometry(req)).not.toBe(before)
    vi.doUnmock('@revelio/core')
    vi.resetModules()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/sheet -- test/key.test.ts`
Expected: FAIL — `Cannot find module '../src/key'`.

- [ ] **Step 3: Write the key**

`sheet/src/key.ts`:

```ts
import { createHash } from 'node:crypto'
import { DECK_SHEET, DECK_SHEET_COLORS, type DeckSheetRequest } from '@revelio/core'

// Bumped by hand when this service paints differently from the same input - a
// changed overlay, a different encoder setting, a fix to how text is placed. The
// geometry half below needs no bump, which is the half that would be forgotten.
export const PAINTER_VERSION = 1

// Layout and colour come from core, so a sheet drawn before an edit there is not
// the sheet drawn after it. Hashing the constants makes that invalidation
// automatic; re-ordering the fields in core changes the digest too, which costs
// one pass of cache misses and nothing else.
const GEOMETRY = createHash('sha256')
  .update(JSON.stringify([DECK_SHEET, DECK_SHEET_COLORS]))
  .digest('hex')

/**
 * The cache key for one rendered sheet: a digest of everything that reaches a
 * pixel. The request arrives as JSON, so every field is listed positionally
 * rather than trusted to arrive in a stable order - two callers posting the same
 * deck with their keys in a different order must hit the same entry.
 */
export function sheetCacheKey(req: DeckSheetRequest): string {
  const canonical = JSON.stringify([
    PAINTER_VERSION,
    GEOMETRY,
    req.locale,
    req.maxBytes ?? null,
    req.deck.name,
    req.deck.format,
    req.entries.map((e) => [
      e.cardId, e.zone, e.quantity, e.name, e.setCode,
      e.types.join('|'), e.imageVersion, e.orientation,
    ]),
  ])
  return createHash('sha256').update(canonical).digest('hex')
}
```

- [ ] **Step 4: Run the key tests**

Run: `npm test -w @revelio/sheet -- test/key.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing server tests**

Append to `sheet/test/server.test.ts`. The suite currently builds its server with no caches;
add a second server built with an in-memory pair:

```ts
import { createSheetServer } from '../src/server'
import type { BlobCache } from '../src/cache'

function memoryCache(): BlobCache & { store: Map<string, Buffer> } {
  const store = new Map<string, Buffer>()
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, b) => { store.set(k, b) },
  }
}

describe('the sheet cache', () => {
  it('answers a repeat request from the cache, without rendering', async () => {
    const sheets = memoryCache()
    const cached = createSheetServer(env, { sheets, art: memoryCache() })
    await new Promise<void>((resolve) => cached.listen(0, '127.0.0.1', resolve))
    const at = `http://127.0.0.1:${(cached.address() as AddressInfo).port}/render`
    const send = () => fetch(at, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SHEET_TOKEN}` },
      body: JSON.stringify(body),
    })

    const first = await send()
    expect(first.headers.get('x-sheet-cache')).toBe('miss')
    const firstBytes = Buffer.from(await first.arrayBuffer())

    const second = await send()
    expect(second.headers.get('x-sheet-cache')).toBe('hit')
    expect(second.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await second.arrayBuffer()).equals(firstBytes)).toBe(true)
    expect(sheets.store.size).toBe(1)

    await new Promise<void>((resolve) => cached.close(() => resolve()))
  })

  it('does not cache a sheet drawn with art missing', async () => {
    const sheets = memoryCache()
    const dropping = createSheetServer(
      { ...env, IMAGE_BASE_URL: 'http://127.0.0.1:1/images' }, // nothing listens there
      { sheets, art: memoryCache() },
    )
    await new Promise<void>((resolve) => dropping.listen(0, '127.0.0.1', resolve))
    const at = `http://127.0.0.1:${(dropping.address() as AddressInfo).port}/render`
    const res = await fetch(at, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SHEET_TOKEN}` },
      body: JSON.stringify({ ...body, entries: [{ ...body.entries[0], imageVersion: 1 }] }),
    })
    expect(res.status).toBe(200)
    expect(Number(res.headers.get('x-sheet-dropped'))).toBeGreaterThan(0)
    // A transient fetch failure is in that picture; caching it would make an
    // outage outlive itself.
    expect(sheets.store.size).toBe(0)

    await new Promise<void>((resolve) => dropping.close(() => resolve()))
  }, 60_000)
})
```

- [ ] **Step 6: Wire the caches and the log into the server**

In `sheet/src/server.ts`:

```ts
import { createDiskCache, nullCache, type BlobCache } from './cache'
import { sheetCacheKey } from './key'

export type SheetCaches = { sheets: BlobCache; art: BlobCache }

/**
 * Both caches, from the environment. CACHE_DIR unset gives two caches that store
 * nothing, which is a supported configuration - every render is correct without
 * them.
 */
export async function createCaches(env: SheetEnv): Promise<SheetCaches> {
  if (!env.CACHE_DIR) return { sheets: nullCache, art: nullCache }
  return {
    sheets: await createDiskCache(`${env.CACHE_DIR}/sheets`, env.SHEET_CACHE_BYTES),
    art: await createDiskCache(`${env.CACHE_DIR}/art`, env.ART_CACHE_BYTES),
  }
}

// PNG and WebP are the only two formats this service emits, and their magic
// bytes are unmistakable - which is cheaper than a sidecar file recording what a
// cached entry is.
function sniffType(body: Buffer): 'image/png' | 'image/webp' {
  return body.subarray(0, 4).toString('latin1') === 'RIFF' ? 'image/webp' : 'image/png'
}
```

`createSheetServer(env, caches = { sheets: nullCache, art: nullCache })` then, inside `render`
and immediately after the body parses:

```ts
    const key = sheetCacheKey(parsed.data)
    const hit = await caches.sheets.get(key)
    if (hit) {
      // A hit costs no composite, so it does not queue behind one.
      res.writeHead(200, {
        'content-type': sniffType(hit),
        'content-length': String(hit.length),
        'cache-control': 'no-store',
        'x-sheet-cache': 'hit',
      })
      res.end(hit)
      console.log(`sheet: cache=hit entries=${parsed.data.entries.length} bytes=${hit.length}`)
      return
    }
```

and in the success branch of the render, before writing the response:

```ts
        // Not cached when art is missing: a transient fetch failure is in that
        // picture, and the entry would outlive the outage.
        if (out.dropped === 0) await caches.sheets.put(key, out.body)
        console.log(
          `sheet: cache=miss entries=${parsed.data.entries.length} mpx=${(out.pixels / 1e6).toFixed(2)}` +
          ` scale=${out.scale.toFixed(3)} fullArt=${out.fullArt} dropped=${out.dropped}/${out.distinct}` +
          ` prepareMs=${out.prepareMs} encodeMs=${out.encodeMs} bytes=${out.body.length} type=${out.contentType}`,
        )
```

with `'x-sheet-cache': 'miss'` added to the existing response headers, and
`{ imageBase: env.IMAGE_BASE_URL, art: caches.art }` passed to `renderSheet`.

`sheet/src/main.ts` builds the caches and hands them over:

```ts
  const env = parseEnv()
  const caches = await createCaches(env)
  const server = createSheetServer(env, caches)
```

- [ ] **Step 7: Run everything**

Run: `npm test -w @revelio/sheet && npm run typecheck -w @revelio/sheet && npm run lint`
Expected: PASS and clean.

- [ ] **Step 8: Measure it end to end**

```bash
docker compose up -d --build rustfs sheet
# Render the same deck twice and compare.
time curl -s -D /tmp/h1 -o /tmp/s1.png -H 'authorization: Bearer local-dev-sheet-token' \
  -H 'content-type: application/json' --data @/tmp/deck.json http://localhost:8080/render
time curl -s -D /tmp/h2 -o /tmp/s2.png -H 'authorization: Bearer local-dev-sheet-token' \
  -H 'content-type: application/json' --data @/tmp/deck.json http://localhost:8080/render
grep -i x-sheet-cache /tmp/h1 /tmp/h2
cmp /tmp/s1.png /tmp/s2.png && echo identical
docker compose logs sheet | tail -4
```

Write `/tmp/deck.json` from a real deck first (the body the web route posts, or the one in
Phase 1 Task 6 Step 5 with a real `cardId` and `imageVersion` from the seeded stack). Expected:
`miss` then `hit`, identical bytes, a visibly faster second request, and two log lines whose
numbers agree with the headers.

- [ ] **Step 9: Commit**

```bash
git add sheet/src/server.ts sheet/src/main.ts sheet/src/key.ts sheet/test/key.test.ts sheet/test/server.test.ts
git commit -m "perf(sheet): serve a repeated sheet from cache and log every render"
```

---

### Task 5: Documentation and deployment notes

**Files:**
- Modify: `CLAUDE.md` (the `@revelio/sheet` bullet from Phase 1)

- [ ] **Step 1: Extend the workspace bullet**

Append to the `@revelio/sheet` bullet:

```markdown
  Two disk caches behind one `BlobCache` (`CACHE_DIR` unset disables both): rendered sheets
  keyed on a digest of the request plus `DECK_SHEET`/`DECK_SHEET_COLORS` and a painter version
  - so a geometry edit in `core` invalidates them by itself - and card art keyed on the image
  key, which is immutable. A sheet drawn with art missing (`dropped > 0`) is never cached, and
  a cache hit never enters the render queue. Not the object store: the `images` bucket is
  world-readable and the web export renders private decks.
```

- [ ] **Step 2: Full verification**

Run: `npm run check -w @revelio/db && npm run verify -w @revelio/db && npm run lint && npm run typecheck && npm test`
Expected: all green. Record the counts.

- [ ] **Step 3: Commit**

```bash
git add ../CLAUDE.md
git commit -m "docs(sheet): record the two caches and what invalidates them"
```

---

## Phase 4 definition of done

- The same deck rendered twice answers `X-Sheet-Cache: miss` then `hit`, with identical bytes and no second composite.
- Two different decks sharing cards fetch each card's art once.
- A render with an unreachable image host answers 200, reports `X-Sheet-Dropped` above zero, and caches nothing.
- `npm test`, `npm run lint`, `npm run typecheck` green.
- The PR body's `## Deployment` says: set `CACHE_DIR=/cache` on the sheet deployment and give it **1 Gi of ephemeral disk** mounted there (`SHEET_CACHE_BYTES` + `ART_CACHE_BYTES` default to 512 MB each, so the budget and the disk match). No migration, no ingest run. Leaving `CACHE_DIR` unset is a valid rollback: the service renders every sheet from scratch.

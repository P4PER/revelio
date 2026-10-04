# Deck Sheet Render Service — Phase 3 (Web Switchover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Export PNG" downloads the sheet the render service drew, and the browser painter is deleted.

**Architecture:** A route handler at `/api/deck-sheet` takes card ids, zones and quantities from the builder, resolves the painted metadata from Postgres with `getCardViews`, calls `@revelio/sheet` through a server-only client, and streams the image back. The export menu keeps its click-to-download shape and gains a loading toast. `web/src/lib/deck-png.ts`, `MAX_CANVAS_DIM` and the CORS workaround that existed for it go away.

**Tech Stack:** Next.js 16 App Router (route handler, `runtime: 'nodejs'`), React 19, next-intl, zod, `rate-limiter-flexible`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-deck-sheet-render-service-design.md`

## Global Constraints

- **Phase 1 must be merged and the service deployed.** Phase 2 is independent of this one; either order works.
- **The client is not trusted for anything that is painted.** It sends `{cardId, zone, quantity}`; names, types, image versions and orientation are resolved server-side. A client-supplied `name` would make the service draw arbitrary strings served from web's own origin.
- **The route must work without a session.** A public deck's overview offers the export to anonymous visitors today, and that keeps working. The per-IP budget and the service's own queue are the limits.
- **Every file in `lib/server/` starts with `import 'server-only'`** - a test enforces it.
- **Every user-facing string comes from `messages/{en,de}.json`.** One new key this phase, in both.
- **The export keeps its shape:** one menu item, one click, a file in the downloads folder, `export.pngError` on failure. Text and JSON export are pure `@revelio/core` and must not change.
- **Types:** `type` aliases only, `import type` for type-only imports, derive from Zod where a schema owns the shape.
- **Comments are ASCII only.** Conventional Commits, scope `web` or `deck`. No tool attribution.
- All commands run from `app/`.

---

### Task 1: The server-only sheet client

**Files:**
- Create: `web/src/lib/server/sheet.ts`, `web/src/lib/server/__tests__/sheet.test.ts`
- Modify: `web/.env.example`

**Interfaces:**
- Consumes: `DeckSheetRequest` from `@revelio/core`.
- Produces: `renderDeckSheet(req: DeckSheetRequest): Promise<RenderedSheet>`, `type RenderedSheet = { body: Buffer; contentType: string }`. Task 3's route handler calls it.

- [ ] **Step 1: Write the failing test**

`web/src/lib/server/__tests__/sheet.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { DeckSheetRequest } from '@revelio/core'
import { renderDeckSheet } from '../sheet'

const req: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: 1, orientation: null,
  }],
}

beforeEach(() => {
  vi.stubEnv('SHEET_SERVICE_URL', 'http://sheet:8080')
  vi.stubEnv('SHEET_TOKEN', 'a-token-at-least-16-chars')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('renderDeckSheet', () => {
  it('posts the request to the service and returns the bytes with their type', async () => {
    const fetchMock = vi.fn(async () => new Response('png-bytes', {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const out = await renderDeckSheet(req)
    expect(out.contentType).toBe('image/png')
    expect(out.body.toString()).toBe('png-bytes')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://sheet:8080/render')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer a-token-at-least-16-chars')
    // No byte ceiling: a browser download has none, so the service renders at
    // its full pixel cap.
    expect(JSON.parse(init.body as string).maxBytes).toBeUndefined()
  })

  it('throws when the service answers anything but 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    let thrown: unknown
    try { await renderDeckSheet(req) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toContain('503')
  })

  it('throws a configuration error rather than call an undefined host', async () => {
    vi.stubEnv('SHEET_SERVICE_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    let thrown: unknown
    try { await renderDeckSheet(req) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toContain('SHEET_SERVICE_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- src/lib/server/__tests__/sheet.test.ts`
Expected: FAIL — `Cannot find module '../sheet'`.

- [ ] **Step 3: Write the client**

`web/src/lib/server/sheet.ts`:

```ts
import 'server-only'
import type { DeckSheetRequest } from '@revelio/core'

// The export is a deliberate click, not a page render, so it can wait - but not
// forever: past this the user gets the error toast instead of a spinner that
// never resolves. The service queues one render at a time, so a queued request
// spends part of this waiting its turn.
const SHEET_TIMEOUT_MS = 30_000

export type RenderedSheet = { body: Buffer; contentType: string }

/**
 * The deck sheet as drawn by @revelio/sheet. Server-only: the token must never
 * reach a browser, and the service has no public ingress to reach from one.
 *
 * No byte ceiling is sent. Discord's attachment limit is the bot's constraint,
 * not a download's, so the service renders at its full pixel cap here - which
 * is what keeps the exported PNG as crisp as the old canvas one.
 */
export async function renderDeckSheet(req: DeckSheetRequest): Promise<RenderedSheet> {
  const base = process.env.SHEET_SERVICE_URL
  const token = process.env.SHEET_TOKEN
  if (!base || !token) throw new Error('SHEET_SERVICE_URL and SHEET_TOKEN are required to render a deck sheet')

  const res = await fetch(`${base.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`sheet service answered ${res.status}`)
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'image/png',
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web -- src/lib/server/__tests__/sheet.test.ts`
Expected: PASS (3 tests), and the `server-only-guard` test still passes - this file has the import.

- [ ] **Step 5: Document the variables**

In `web/.env.example`, under the runtime section:

```
# Deck sheet render service (server-only). The PNG export posts the deck to it
# and streams back the image; the token must match the one that service runs
# with. Locally, the compose `sheet` service on its published port.
SHEET_SERVICE_URL=http://localhost:8080
SHEET_TOKEN=local-dev-sheet-token
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/server/sheet.ts web/src/lib/server/__tests__/sheet.test.ts web/.env.example
git commit -m "feat(web): call the deck sheet render service from the server"
```

---

### Task 2: A shared client IP and a budget for the export

`clientIp` is a private helper in `contact-actions.ts` and this is its second consumer, so it moves to the module that owns per-IP budgets rather than being copied.

**Files:**
- Modify: `web/src/lib/server/rate-limit.ts`, `web/src/lib/actions/contact-actions.ts:21-33,56`
- Test: `web/src/lib/server/__tests__/rate-limit.test.ts`

**Interfaces:**
- Produces: `clientIp(h: Headers): string`, `SHEET_RATE = { points: 10, duration: 60 }`, `consumeSheetRateLimit(ip: string): Promise<boolean>`. Task 3's route uses both.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/server/__tests__/rate-limit.test.ts`:

```ts
import { clientIp, consumeSheetRateLimit, SHEET_RATE } from '../rate-limit'

describe('consumeSheetRateLimit', () => {
  it('allows a burst and then refuses', async () => {
    const ip = `sheet-test-${Math.random()}`
    for (let i = 0; i < SHEET_RATE.points; i += 1) {
      expect(await consumeSheetRateLimit(ip)).toBe(true)
    }
    expect(await consumeSheetRateLimit(ip)).toBe(false)
  })

  it('budgets each address separately', async () => {
    const a = `sheet-a-${Math.random()}`
    const b = `sheet-b-${Math.random()}`
    for (let i = 0; i < SHEET_RATE.points; i += 1) await consumeSheetRateLimit(a)
    expect(await consumeSheetRateLimit(a)).toBe(false)
    expect(await consumeSheetRateLimit(b)).toBe(true)
  })
})

describe('clientIp', () => {
  it('prefers x-real-ip, which only the proxy can set', () => {
    const h = new Headers({ 'x-real-ip': '10.0.0.9', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })
    expect(clientIp(h)).toBe('10.0.0.9')
  })

  it('takes the last forwarded hop when there is no x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('10.0.0.1')
  })

  it('shares one bucket for unknown addresses', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- src/lib/server/__tests__/rate-limit.test.ts`
Expected: FAIL — `clientIp`, `consumeSheetRateLimit` and `SHEET_RATE` are not exported.

- [ ] **Step 3: Move `clientIp` and add the sheet budget**

In `web/src/lib/server/rate-limit.ts`, after the contact limiter:

```ts
// The PNG export's per-IP budget. Each render is a bounded but real CPU cost on
// the render service, and the route is reachable without a session because a
// public deck's overview offers the export to anyone. Ten a minute is far above
// any human clicking Export and far below anything worth queueing.
export const SHEET_RATE = { points: 10, duration: 60 } as const

const sheetLimiter = new RateLimiterMemory({
  points: SHEET_RATE.points,
  duration: SHEET_RATE.duration,
})

/** True if the request is within budget; false once the per-IP window is spent. */
export async function consumeSheetRateLimit(ip: string): Promise<boolean> {
  try {
    await sheetLimiter.consume(ip)
    return true
  } catch {
    return false
  }
}

/**
 * The address a per-IP budget is counted against.
 *
 * The leftmost x-forwarded-for entry is CLIENT-CONTROLLED (a bot can send its own
 * header and rotate it to dodge the limit), so it is never trusted. Behind our
 * single reverse proxy the trustworthy value is x-real-ip (the proxy overwrites any
 * client-supplied one); failing that, the LAST x-forwarded-for entry is the hop our
 * proxy appended. Falls back to a constant so unknown-IP traffic still shares a bucket.
 */
export function clientIp(h: Headers): string {
  const realIp = h.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const fwd = h.get('x-forwarded-for')
  if (fwd) {
    const parts = fwd.split(',')
    return parts[parts.length - 1].trim()
  }
  return 'unknown'
}
```

In `web/src/lib/actions/contact-actions.ts`, delete the local `clientIp` function (lines 21-33)
and import it instead:

```ts
import { clientIp, consumeContactRateLimit } from '@/lib/server/rate-limit'
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w web -- src/lib/server/__tests__/rate-limit.test.ts src/lib/actions/__tests__`
Expected: PASS, contact-action tests included.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/server/rate-limit.ts web/src/lib/actions/contact-actions.ts web/src/lib/server/__tests__/rate-limit.test.ts
git commit -m "refactor(web): share the client-IP resolver with a sheet budget"
```

---

### Task 3: The route handler

**Files:**
- Create: `web/src/app/api/deck-sheet/route.ts`, `web/src/app/api/deck-sheet/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `renderDeckSheet` (Task 1), `clientIp`/`consumeSheetRateLimit` (Task 2), `getDb` from `@/lib/server/db`, `getCardViews` from `@revelio/db`, `pickSheetEntries`/`MAX_SHEET_ENTRIES`/`SHEET_LOCALES`/`DeckFormat`/`DeckZone` from `@revelio/core`.
- Produces: `POST(req: Request): Promise<Response>` at `/api/deck-sheet`. Task 4's menu calls it.

- [ ] **Step 1: Write the failing test**

`web/src/app/api/deck-sheet/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getCardViews = vi.fn()
const renderDeckSheet = vi.fn()

vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ getCardViews: (...args: unknown[]) => getCardViews(...args) }))
vi.mock('@/lib/server/sheet', () => ({ renderDeckSheet: (...args: unknown[]) => renderDeckSheet(...args) }))

const { POST } = await import('../route')

const meta = {
  name: 'Harry Potter', setCode: 'base', types: ['character'], imageVersion: 7,
  orientation: null, cost: 3, damage: null, number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  artCropVersion: null,
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request('http://localhost/api/deck-sheet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `test-${Math.random()}`, ...headers },
    body: JSON.stringify(body),
  }))
}

const body = {
  name: 'Charms Aggro', format: 'classic', locale: 'en',
  cards: [{ cardId: 'harry', zone: 'main', quantity: 2 }],
}

beforeEach(() => {
  getCardViews.mockResolvedValue({ harry: meta })
  renderDeckSheet.mockResolvedValue({ body: Buffer.from('png-bytes'), contentType: 'image/png' })
})
afterEach(() => { vi.clearAllMocks() })

describe('POST /api/deck-sheet', () => {
  it('resolves the painted metadata server-side and streams the image back', async () => {
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('png-bytes')

    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries).toEqual([{
      cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
      setCode: 'base', types: ['character'], imageVersion: 7, orientation: null,
    }])
    expect(sent.maxBytes).toBeUndefined()
  })

  it('ignores a name, an image version or types the client tried to supply', async () => {
    // The sheet paints names; a client-supplied one would have the service draw
    // whatever the caller asked for, served from this origin.
    await post({
      ...body,
      cards: [{ cardId: 'harry', zone: 'main', quantity: 2, name: 'Not A Card', imageVersion: 999, types: ['spell'] }],
    })
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries[0].name).toBe('Harry Potter')
    expect(sent.entries[0].imageVersion).toBe(7)
    expect(sent.entries[0].types).toEqual(['character'])
  })

  it('drops a card id the database does not know', async () => {
    getCardViews.mockResolvedValue({})
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(renderDeckSheet).not.toHaveBeenCalled()
  })

  it('rejects a malformed body without touching the database', async () => {
    expect((await post({ ...body, format: 'commander' })).status).toBe(400)
    expect((await post({ ...body, locale: 'fr' })).status).toBe(400)
    expect((await post({ ...body, cards: [] })).status).toBe(400)
    expect((await post({ ...body, cards: [{ cardId: 'x', zone: 'graveyard', quantity: 1 }] })).status).toBe(400)
    expect(getCardViews).not.toHaveBeenCalled()
  })

  it('refuses a deck past the entry cap', async () => {
    const cards = Array.from({ length: 401 }, (_, i) => ({ cardId: `c${i}`, zone: 'main', quantity: 1 }))
    expect((await post({ ...body, cards })).status).toBe(400)
  })

  it('answers 502 when the service cannot draw', async () => {
    renderDeckSheet.mockRejectedValue(new Error('sheet service answered 503'))
    const res = await post(body)
    expect(res.status).toBe(502)
  })

  it('spends a per-IP budget', async () => {
    const ip = `fixed-${Math.random()}`
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) statuses.push((await post(body, { 'x-real-ip': ip })).status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(10)
    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- src/app/api/deck-sheet/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Write the route**

`web/src/app/api/deck-sheet/route.ts`:

```ts
import { z } from 'zod'
import {
  DeckFormat, DeckZone, MAX_SHEET_ENTRIES, SHEET_LOCALES, pickSheetEntries,
  type DeckSheetEntry,
} from '@revelio/core'
import { getCardViews } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { clientIp, consumeSheetRateLimit } from '@/lib/server/rate-limit'
import { renderDeckSheet } from '@/lib/server/sheet'

// sharp lives on the other side of an HTTP call, but the handler still reads
// Postgres and streams a Buffer, so it is not an edge route.
export const runtime = 'nodejs'

/**
 * What the browser is allowed to say. Card ids, zones and quantities only: every
 * field that reaches a pixel - the name, the types, the image version, the
 * orientation - is resolved here from the database. A client-supplied name would
 * let anyone have the render service draw arbitrary text and serve it from this
 * origin.
 */
const SheetBody = z.object({
  name: z.string().min(1).max(300),
  format: DeckFormat,
  locale: z.enum(SHEET_LOCALES),
  cards: z.array(z.object({
    cardId: z.string().min(1).max(120),
    zone: DeckZone,
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(MAX_SHEET_ENTRIES),
})

export async function POST(req: Request): Promise<Response> {
  if (!(await consumeSheetRateLimit(clientIp(req.headers)))) {
    return new Response('too many requests', { status: 429 })
  }

  const payload = await req.json().catch(() => null)
  const parsed = SheetBody.safeParse(payload)
  if (!parsed.success) return new Response('bad request', { status: 400 })
  const { name, format, locale, cards } = parsed.data

  // One lookup for the distinct ids; a card can sit in two zones.
  const metaById = await getCardViews(getDb(), [...new Set(cards.map((c) => c.cardId))])
  const views: DeckSheetEntry[] = cards.flatMap((c) => {
    const meta = metaById[c.cardId]
    // An id with no card is simply dropped, the way deck import treats one: it
    // cannot be painted and it must not fail the other 59 cards.
    return meta ? [{ ...meta, zone: c.zone, quantity: c.quantity }] : []
  })
  if (views.length === 0) return new Response('no renderable cards', { status: 400 })

  try {
    const sheet = await renderDeckSheet({
      locale,
      deck: { name, format },
      entries: pickSheetEntries(views),
    })
    return new Response(new Uint8Array(sheet.body), {
      status: 200,
      headers: {
        'content-type': sheet.contentType,
        'content-length': String(sheet.body.length),
        // The sheet is a download, not a page asset, and a private deck's
        // picture must not sit in a shared cache.
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    // The service being down, full or slow is not this app's fault and not the
    // user's: the menu shows its error toast and the other exports still work.
    console.error('deck sheet render failed:', err instanceof Error ? err.message : err)
    return new Response('sheet service unavailable', { status: 502 })
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- src/app/api/deck-sheet/__tests__/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Confirm locale routing leaves the route alone**

`web/src/proxy.ts`'s matcher is `['/((?!api|_next|_vercel|.*\\..*).*)']`, so `/api/*` is already
excluded and needs no change. Verify by hand once the dev server is up (Task 4, Step 6): a POST
to `/api/deck-sheet` must not redirect to `/en/api/deck-sheet`.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/deck-sheet/route.ts web/src/app/api/deck-sheet/__tests__/route.test.ts
git commit -m "feat(web): serve the deck sheet from a route handler"
```

---

### Task 4: The export menu downloads what the server drew

**Files:**
- Modify: `web/src/components/deck/deck-export-menu.tsx:8,84-105`
- Modify: `web/messages/en.json`, `web/messages/de.json` (one key)
- Delete: `web/src/lib/deck-png.ts`, `web/src/lib/__tests__/deck-png-image.test.ts`
- Test: `web/src/components/deck/__tests__/deck-export-menu.test.tsx` (new)

**Interfaces:**
- Consumes: `POST /api/deck-sheet` (Task 3).
- Removes: `renderDeckPng`, `loadCardImage`, `MAX_CANVAS_DIM`.

- [ ] **Step 1: Add the one new string to both catalogs**

In `web/messages/en.json`, inside `decks.export`:

```json
    "pngPending": "Generating the PNG…",
```

In `web/messages/de.json`, the same key:

```json
    "pngPending": "PNG wird erstellt…",
```

- [ ] **Step 2: Write the failing test**

`web/src/components/deck/__tests__/deck-export-menu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { DeckExportMenu } from '../deck-export-menu'
import type { BuilderState } from '@/lib/deck-model'

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), error: (...a: unknown[]) => toastError(...a),
    loading: vi.fn(() => 'toast-id'), dismiss: vi.fn(),
  },
}))

const state: BuilderState = {
  name: 'Charms Aggro', format: 'classic', visibility: 'private',
  entries: [{
    cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null,
    damage: null, setCode: 'base', number: '1', lesson: null, isOfficial: true,
    legality: 'legal', isLesson: false, isStartingCharacter: true, imageVersion: 1,
    artCropVersion: null, orientation: null, types: ['character'],
  }],
}

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeckExportMenu state={state} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('DeckExportMenu PNG export', () => {
  it('posts ids, zones and quantities - never the painted fields', async () => {
    const fetchMock = vi.fn(async () => new Response('png', {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /export/i }))
    await userEvent.click(await screen.findByText(messages.decks.export.png))

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/deck-sheet')
    const sent = JSON.parse(init.body as string)
    expect(sent).toEqual({
      name: 'Charms Aggro', format: 'classic', locale: 'en',
      cards: [{ cardId: 'harry', zone: 'character', quantity: 1 }],
    })
  })

  it('shows the error toast when the route refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })))
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /export/i }))
    await userEvent.click(await screen.findByText(messages.decks.export.png))
    expect(toastError).toHaveBeenCalledWith(messages.decks.export.pngError)
  })
})
```

Trim the first test's opening to whatever the sibling tests in `web/src/components/deck/__tests__/`
do to open a dropdown - follow `deck-overview-actions.test.tsx`, which already drives this
Radix menu, rather than inventing a second way.

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w web -- src/components/deck/__tests__/deck-export-menu.test.tsx`
Expected: FAIL — the menu still calls `renderDeckPng`, so no fetch happens.

- [ ] **Step 4: Rewrite `exportPng`**

In `web/src/components/deck/deck-export-menu.tsx`, drop the `renderDeckPng` import, add
`useLocale` to the next-intl import, and replace `exportPng` with:

```tsx
  // The sheet is drawn by @revelio/sheet, through this app's own route handler:
  // only card ids, zones and quantities go up, and the route resolves the names
  // and image versions the picture is painted from. The builder's unsaved state
  // works the same as a saved deck - the request carries the deck, not an id.
  async function exportPng() {
    const pending = toast.loading(t('export.pngPending'))
    try {
      const res = await fetch('/api/deck-sheet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: state.name.trim() || t('namePlaceholder'),
          format: state.format,
          locale,
          cards: state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
        }),
      })
      if (!res.ok) throw new Error(`sheet route answered ${res.status}`)
      const blob = await res.blob()
      // The service answers WebP instead of PNG only when a byte ceiling forced
      // it to, which this path never sends - but name the file for what it is
      // rather than for what was asked for.
      const ext = blob.type === 'image/webp' ? 'webp' : 'png'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(state.name)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('export.pngError'))
    } finally {
      toast.dismiss(pending)
    }
  }
```

**No catalog key is removed.** The menu stops reading `panel.main`, `panel.sideboard`,
`panel.characterBadge`, `group.*` and `format.*`, but it was never their only reader:
`deck-panel.tsx`, `deck-gallery.tsx`, `lib/deck-groups.ts`, `deck-header.tsx`,
`deck-format-switch.tsx`, `deck-list.tsx` and `deck-card-browser.tsx` all still do. The sheet's
copy of them lives in `@revelio/core` now; web's copy belongs to web's own UI.

Add the locale hook beside the translations hook:

```tsx
  const t = useTranslations('decks')
  const locale = useLocale()
```

- [ ] **Step 5: Delete the browser painter**

```bash
git rm web/src/lib/deck-png.ts web/src/lib/__tests__/deck-png-image.test.ts
```

Then check nothing else referenced it:

```bash
grep -rn "deck-png\|renderDeckPng\|MAX_CANVAS_DIM" web/src web/e2e
```

Expected: no hits.

- [ ] **Step 6: Run the tests, then the app**

Run: `npm test -w web && npm run typecheck -w web && npm run lint -w web`
Expected: green, with two suites gone and one added.

Then by hand, with the stack and the service up:

```bash
docker compose up -d postgres meilisearch rustfs sheet
npm run dev -w web
```

Open a deck with cards, Export -> PNG, and confirm: the file downloads, the sheet shows real
card art (not placeholder boxes), the loading toast appears and clears, and the deck builder's
**unsaved** state exports too. Stop the `sheet` container and confirm the error toast appears
and the Text/JSON exports still work.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/deck/deck-export-menu.tsx web/messages/en.json web/messages/de.json web/src/components/deck/__tests__/deck-export-menu.test.tsx
git commit -m "feat(deck): download the sheet the render service draws"
```

---

### Task 5: Retire the CORS workaround and update the docs

The browser no longer fetches card art for the export, which is the only thing
`RUSTFS_CORS_ALLOWED_ORIGINS` and the `cache: 'reload'` read existed for.

**Files:**
- Modify: `docker-compose.yml` (the `rustfs` CORS comment), `CLAUDE.md`

- [ ] **Step 1: Rewrite the compose comment**

The `RUSTFS_CORS_ALLOWED_ORIGINS` env var stays (it costs nothing and a browser may still read
an image cross-origin), but its justification is gone. Replace the comment block above it with:

```yaml
      # Card images are public-read (see the bucket policy in
      # ingest/src/upload-images.ts); this makes RustFS answer with a CORS header
      # when a request carries an Origin. Nothing in the app depends on it any
      # more - the deck PNG export used to read the images back through a canvas
      # from the browser and needed it, and that painter now lives in
      # @revelio/sheet, which fetches server-side where CORS does not apply.
```

- [ ] **Step 2: Update `CLAUDE.md`**

1. In **Web app specifics**, the **Images** bullet keeps `NEXT_PUBLIC_IMAGE_BASE_URL` but gains
   the export's new shape:

```markdown
- **The deck sheet is not painted here.** "Export PNG" posts the deck (card ids, zones and
  quantities) to `/api/deck-sheet`, which resolves the painted fields with `getCardViews`,
  calls `@revelio/sheet` through `lib/server/sheet.ts` and streams the image back. The client
  sends no names and no image versions on purpose: the sheet paints names, and a
  client-supplied one would have the service draw arbitrary text served from this origin. The
  route needs no session - a public deck's overview offers the export to anyone - and carries
  a per-IP budget instead (`SHEET_RATE` in `lib/server/rate-limit.ts`).
```

2. In **Architecture**, the `@revelio/core` bullet mentions "the deck sheet layout
   (`deck-sheet.ts`, `deck-groups.ts`) that web's PNG export and the bot's `/deck` image are
   both painted from". Replace the tail with "that `@revelio/sheet` paints both of them from".

- [ ] **Step 3: Full verification**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green. Then the e2e suite, which must be unaffected (no spec drives the export):

Run: `E2E_PORT=3100 npm run e2e -w web`
Expected: the suite's usual 16/16.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml ../CLAUDE.md
git commit -m "docs(web): record that the sheet is drawn server-side"
```

---

## Phase 3 definition of done

- Export -> PNG downloads a sheet with real card art, from a saved deck and from unsaved builder state.
- With `sheet` stopped, the PNG export toasts an error and Text/JSON still work.
- `web/src/lib/deck-png.ts` is gone and nothing references `MAX_CANVAS_DIM`.
- `npm test`, `npm run lint`, `npm run typecheck` green; `E2E_PORT=3100 npm run e2e -w web` green.
- The PR body's `## Deployment` says: set `SHEET_SERVICE_URL` and `SHEET_TOKEN` on `web`. No migration, no ingest run.

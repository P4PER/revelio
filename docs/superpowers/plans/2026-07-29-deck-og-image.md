# Deck Open Graph Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a per-deck Open Graph image built around the starting-character art, deck name, format, and lesson icons — with private-deck safety and graceful fallbacks.

**Architecture:** Pure, tested helpers in a focused `src/lib/deck-og.ts` (pick starter art, derive lesson codes, fetch a remote image as a guarded data URI). A `renderDeckOgImage` in the existing `src/lib/og-image.tsx` reuses the shared font/mark/`clampOgTitle`. A `force-dynamic` route mirrors the set OG route: build-safe `generateImageMetadata`, private-deck-safe data load, and fallback to the default branded image whenever data is missing.

**Tech Stack:** Next.js 16 App Router, React 19, `next/og`, next-intl, TypeScript, vitest, Playwright.

## Global Constraints

- All commands run from `app/`. Web tests: `npm test -w web`; typecheck: `npm run typecheck`; build: `npm run build -w web`; e2e: `npm run e2e -w web`.
- `npm`/`gh` live at `/usr/local/bin` + `/opt/homebrew/bin` — prepend to `PATH` if missing.
- Conventional Commits. **No Claude attribution.** Commit with `git -c commit.gpgsign=false`.
- **Localize all user-facing strings** — read from `messages/en.json`/`de.json` via next-intl; never hardcode.
- **Private-deck safety is non-negotiable:** resolve decks with `getDeckForViewer(db, id, null)` (null viewer) so private/hidden decks never leak into an image.
- Reuse (don't duplicate) the OG infra already on `main`: `OG_SIZE`, `clampOgTitle`, `ogImageMetadata`, `ogImageAlt` (`@/lib/seo`); `renderDefaultOgImage`, the font loader, `MARK_DATA_URI` (`@/lib/og-image`).
- Working branch: `feat/deck-og-image` (already checked out, forked from up-to-date `main`).

## Verified facts

- `getDeckForViewer(db, id, viewerId)` → `{ deck: DeckDTO; userId; views: DeckCardView[]; viewCount } | null` (null for non-public when viewer isn't owner). From `@revelio/db`.
- `DeckCardView` has `isStartingCharacter: boolean`, `cardId: string`, `artCropVersion: number | null`, `lesson: string | null`. **`DeckDTO` has no `lessons`** — derive from `views[].lesson`.
- `artCropKey(id, version)`, `imageUrl(base, key)` from `@revelio/core`.
- Image base: `process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''`.
- Format label: `getTranslations('decks')` → ``t(`explore.format.${format}`)`` (same as `DeckHeroCard`).
- Lesson codes are slugs matching `web/public/lessons/<code>.svg` (`charms`, `potions`, `quidditch`, `transfiguration`, `care_of_magical_creatures`).

---

### Task 1: Deck OG data helpers (`src/lib/deck-og.ts`)

Pure/guarded helpers, no `next/og` import, fully unit-testable.

**Files:**
- Create: `app/web/src/lib/deck-og.ts`
- Test: `app/web/src/lib/__tests__/deck-og.test.ts`

**Interfaces:**
- Consumes: `artCropKey`, `imageUrl` from `@revelio/core`; `DeckCardView` type from `@revelio/core`.
- Produces:
  - `pickStarterArt(views: Pick<DeckCardView, 'isStartingCharacter' | 'cardId' | 'artCropVersion'>[], imageBase: string): string | null`
  - `deckLessonCodes(views: Pick<DeckCardView, 'lesson'>[]): string[]`
  - `fetchAsDataUri(url: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/deck-og.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickStarterArt, deckLessonCodes, fetchAsDataUri } from '../deck-og'

const starter = { isStartingCharacter: true, cardId: 'c1', artCropVersion: 3 }
const other = { isStartingCharacter: false, cardId: 'c2', artCropVersion: 9 }

describe('pickStarterArt', () => {
  it('builds the art-crop URL for the starting character', () => {
    const url = pickStarterArt([other, starter], 'https://img.example')
    expect(url).toContain('https://img.example')
    expect(url).toContain('c1')
  })
  it('returns null when there is no starting character', () => {
    expect(pickStarterArt([other], 'https://img.example')).toBeNull()
  })
  it('returns null when the starter has no art crop', () => {
    expect(pickStarterArt([{ ...starter, artCropVersion: null }], 'https://img.example')).toBeNull()
  })
  it('returns null when the image base is empty', () => {
    expect(pickStarterArt([starter], '')).toBeNull()
  })
})

describe('deckLessonCodes', () => {
  it('returns distinct, non-null lesson codes in order', () => {
    const views = [{ lesson: 'charms' }, { lesson: null }, { lesson: 'charms' }, { lesson: 'potions' }]
    expect(deckLessonCodes(views)).toEqual(['charms', 'potions'])
  })
})

describe('fetchAsDataUri', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('encodes a successful response as a data URI with its content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    })))
    const uri = await fetchAsDataUri('https://img.example/x')
    expect(uri).toMatch(/^data:image\/webp;base64,/)
  })
  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await fetchAsDataUri('https://img.example/x')).toBeNull()
  })
  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await fetchAsDataUri('https://img.example/x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/deck-og.test.ts`
Expected: FAIL — cannot resolve `../deck-og`.

- [ ] **Step 3: Write the implementation**

Create `app/web/src/lib/deck-og.ts`:

```ts
import { artCropKey, imageUrl, type DeckCardView } from '@revelio/core'

/**
 * URL of the starting character's art crop, or null when there is no starter,
 * the starter has no art crop, or no image base is configured.
 */
export function pickStarterArt(
  views: Pick<DeckCardView, 'isStartingCharacter' | 'cardId' | 'artCropVersion'>[],
  imageBase: string,
): string | null {
  if (!imageBase) return null
  const starter = views.find((v) => v.isStartingCharacter)
  if (!starter || starter.artCropVersion == null) return null
  return imageUrl(imageBase, artCropKey(starter.cardId, starter.artCropVersion))
}

/** Distinct, non-null lesson codes across a deck's card views, in first-seen order. */
export function deckLessonCodes(views: Pick<DeckCardView, 'lesson'>[]): string[] {
  return [...new Set(views.map((v) => v.lesson).filter((l): l is string => !!l))]
}

/**
 * Fetch a remote image and return it as a base64 data URI, or null on any
 * failure. Fetching here (rather than letting satori fetch inside the render)
 * lets the caller fall back cleanly instead of the image stream throwing.
 */
export async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
```

Note: verify `DeckCardView` is exported from `@revelio/core` (it is — `core/src/domain.ts`). If the type import path differs, import it from where `DeckDTO`/`DeckCardView` are declared.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/deck-og.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/src/lib/deck-og.ts web/src/lib/__tests__/deck-og.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add deck OG data helpers (starter art, lessons, data-uri fetch)"
```

---

### Task 2: Deck OG renderer (`renderDeckOgImage` in `src/lib/og-image.tsx`)

The branded full-bleed render. Verified by build + manual render (satori output isn't unit-tested, matching the existing OG renderers).

**Files:**
- Modify: `app/web/src/lib/og-image.tsx`

**Interfaces:**
- Consumes: `OG_SIZE`, `clampOgTitle` (`@/lib/seo`); the existing `loadFont`, `MARK_DATA_URI` in this file.
- Produces: `renderDeckOgImage(opts: { name: string; formatLabel: string; lessonCodes: string[]; artDataUri: string }): Promise<ImageResponse>`.

- [ ] **Step 1: Add a cached lesson-icon loader**

In `app/web/src/lib/og-image.tsx`, add to the imports at the top:

```ts
import { join } from 'node:path'
```

Add after the `loadFont` function:

```ts
// Lesson symbols are static public SVGs; read from disk and inline as data URIs
// (satori can't resolve a relative URL). Best-effort: a missing/unreadable icon
// resolves to null and is simply omitted — it never fails the image.
const lessonIconCache = new Map<string, string | null>()
async function loadLessonIcon(code: string): Promise<string | null> {
  const cached = lessonIconCache.get(code)
  if (cached !== undefined) return cached
  let uri: string | null = null
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'lessons', `${code}.svg`))
    uri = `data:image/svg+xml;base64,${buf.toString('base64')}`
  } catch {
    uri = null
  }
  lessonIconCache.set(code, uri)
  return uri
}
```

- [ ] **Step 2: Update the seo import to include `clampOgTitle`**

Ensure the existing seo import reads:

```ts
import { OG_SIZE, clampOgTitle } from '@/lib/seo'
```

(It already imports `clampOgTitle` — leave as-is if so.)

- [ ] **Step 3: Add `renderDeckOgImage`**

Append to `app/web/src/lib/og-image.tsx`:

```tsx
/**
 * Deck share card: full-bleed starting-character art with top/bottom scrims, the
 * revelio lockup, and the deck name + format + up to four lesson icons — the
 * DeckHeroCard aesthetic at 1200x630. `artDataUri` must already be resolved (the
 * route fetches it so a failure can fall back to the default image).
 */
export async function renderDeckOgImage(opts: {
  name: string
  formatLabel: string
  lessonCodes: string[]
  artDataUri: string
}): Promise<ImageResponse> {
  const font = await loadFont()
  const lessonUris = (await Promise.all(opts.lessonCodes.slice(0, 4).map(loadLessonIcon))).filter(
    (u): u is string => u != null,
  )
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Poppins' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={opts.artDataUri}
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          alt=""
        />
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 200, display: 'flex',
            alignItems: 'flex-start', padding: '40px 56px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_DATA_URI} width={44} height={44} alt="" />
            <span style={{ fontSize: 30, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
          </div>
        </div>
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column',
            gap: 16, padding: '140px 56px 56px 56px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.88) 45%, transparent)',
          }}
        >
          <span style={{ fontSize: 68, color: '#FBF3DC', lineHeight: 1.05 }}>{clampOgTitle(opts.name)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ fontSize: 32, color: '#E8B23A' }}>{opts.formatLabel}</span>
            {lessonUris.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                {lessonUris.map((uri, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={uri} width={40} height={40} alt="" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
    },
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/src/lib/og-image.tsx
git -c commit.gpgsign=false commit -m "feat(web): add deck OG renderer with starter art and lesson icons"
```

---

### Task 3: Deck OG route (`app/[locale]/decks/[id]/opengraph-image.tsx`)

Wires data → render, private-deck-safe and build-safe, mirroring the set route.

**Files:**
- Create: `app/web/src/app/[locale]/decks/[id]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `getDeckForViewer` (`@revelio/db`), `getDb` (`@/lib/db`), `ogImageMetadata`/`ogImageAlt` (`@/lib/seo`), `pickStarterArt`/`deckLessonCodes`/`fetchAsDataUri` (`@/lib/deck-og`), `renderDeckOgImage`/`renderDefaultOgImage` (`@/lib/og-image`).

- [ ] **Step 1: Write the route**

Create `app/web/src/app/[locale]/decks/[id]/opengraph-image.tsx`:

```tsx
import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { getDeckForViewer } from '@revelio/db'
import { getDb } from '@/lib/db'
import { ogImageMetadata, ogImageAlt } from '@/lib/seo'
import { pickStarterArt, deckLessonCodes, fetchAsDataUri } from '@/lib/deck-og'
import { renderDeckOgImage, renderDefaultOgImage } from '@/lib/og-image'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

// Rendered per request: reads the deck from the DB and resolves translations, so
// it must not be prerendered at build (no DB / request scope there).
export const dynamic = 'force-dynamic'

// viewerId = null: only public decks resolve, so a private/hidden deck never
// leaks its name or art into an OG image. cache() dedupes generateImageMetadata +
// the render within the image request.
const loadDeck = cache((id: string) => getDeckForViewer(getDb(), id, null))

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  // Next runs this at build time to collect page data, where there is no DB.
  // Guard so a build-time failure degrades to the generic alt; force-dynamic
  // re-runs it per request, where the DB yields the deck name.
  let name: string | null = null
  try {
    name = (await loadDeck(id))?.deck.name?.trim() || null
  } catch {
    name = null
  }
  return ogImageMetadata(name ?? ogImageAlt(locale))
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const res = await loadDeck(id)
  const artUrl = res ? pickStarterArt(res.views, IMAGE_BASE) : null
  // Any missing piece (private/not-found deck, no name, no starter art) falls
  // back to the default branded card — never a broken or leaking image.
  if (!res || !res.deck.name.trim() || !artUrl) return renderDefaultOgImage(locale)
  const artDataUri = await fetchAsDataUri(artUrl)
  if (!artDataUri) return renderDefaultOgImage(locale)
  const t = await getTranslations({ locale, namespace: 'decks' })
  return renderDeckOgImage({
    name: res.deck.name,
    formatLabel: t(`explore.format.${res.deck.format}`),
    lessonCodes: deckLessonCodes(res.views),
    artDataUri,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w web`
Expected: PASS. If next-intl rejects the dynamic ``t(`explore.format.${...}`)`` key, mirror `DeckHeroCard` exactly (it uses the same dynamic key); the `format` union guarantees a valid key at runtime.

- [ ] **Step 3: Build-safety gate (unreachable DB)**

Run: `DATABASE_URL="postgres://revelio:revelio@127.0.0.1:5433/revelio" npm run build -w web`
Expected: `Compiled successfully` and no `ECONNREFUSED` / "Failed to collect page data" — the guarded `generateImageMetadata` must not read the DB at build.

- [ ] **Step 4: Manual render check (dev)**

With a dev server running and a seeded public deck:
- Find a public deck id via `/en/decks`.
- Fetch `/en/decks/<id>` HTML, read `og:image` + `og:image:alt`.
- Fetch the `og:image` URL (following the locale redirect) → expect `200 image/png`, 1200×630, showing the starter art + deck name + format.
- Confirm a **private** deck (requested anonymously) returns the default branded image and a generic alt (no name leak).

- [ ] **Step 5: Commit**

```bash
cd app && git -c commit.gpgsign=false add "web/src/app/[locale]/decks/[id]/opengraph-image.tsx"
git -c commit.gpgsign=false commit -m "feat(web): generate per-deck Open Graph image from the starting character"
```

---

### Task 4: e2e coverage + final verification

**Files:**
- Modify: `app/web/e2e/og-and-icons.spec.ts`

- [ ] **Step 1: Add a deck OG e2e (skips without seeded decks)**

Append to `app/web/e2e/og-and-icons.spec.ts`:

```ts
test('a public deck OG image renders as a real PNG when decks exist', async ({ page, request }) => {
  await page.goto('/decks')
  const firstDeck = page.locator('a[href*="/decks/"]').first()
  if (!(await firstDeck.isVisible().catch(() => false))) {
    test.skip(true, 'No public decks seeded — run against a seeded stack to verify fully')
  }
  await firstDeck.click()
  await expect(page).toHaveURL(/\/decks\//)

  const ogUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogUrl, 'deck og:image is present').toBeTruthy()

  const res = await request.get(ogUrl!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')
  const body = await res.body()
  expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
})
```

- [ ] **Step 2: Run the e2e for this spec**

Run (from `app/web`, with a server available — Playwright reuses a running one or builds+starts): `npx playwright test og-and-icons --reporter=line`
Expected: PASS (the deck test passes with seeded decks, or skips cleanly).

- [ ] **Step 3: Full verification**

```bash
npm run typecheck
npm test -w web
npm run lint -w web
npm run build -w web
```

Expected: typecheck clean; all unit tests pass; lint 0 errors (pre-existing React-Compiler warnings only); build succeeds. Re-run the unreachable-DB build once more if any route changed.

- [ ] **Step 4: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/e2e/og-and-icons.spec.ts
git -c commit.gpgsign=false commit -m "test(web): e2e for the deck Open Graph image"
```

---

## Spec coverage check

- Starter-art-based deck OG (layout, art crop) → Tasks 2 + 3. ✅
- Private-deck safety (null viewer, fallback) → Task 3. ✅
- Lesson icons (Plan A, best-effort) → Task 2 (`loadLessonIcon`). ✅
- Fallbacks (private/no-starter/no-art/fetch-fail) → Task 3. ✅
- Localized format + alt → Task 3. ✅
- Build-safety → Task 3 Step 3. ✅
- Reuse of shared OG infra → Tasks 2–3 (imports, no duplication). ✅
- Testing (unit + e2e + build) → Tasks 1 + 4. ✅
- Out of scope: public decks listing OG — not touched. ✅

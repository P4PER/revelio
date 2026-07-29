# SEO & Apple Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the missing Safari/iOS icon and give every page a complete metadata + social-sharing footprint, including generated Open Graph images for pages that lack a natural image.

**Architecture:** All SEO logic that can be pure is centralized in a new, fully-testable `src/lib/seo.ts` (constants + metadata builders). The root `[locale]/layout.tsx` consumes it for site-wide defaults. Icons use Next.js App Router file conventions (`apple-icon.png`, `icon.svg`, `manifest.ts`). Generated share images use `next/og`'s `ImageResponse` through a single shared renderer, wired to routes via the `opengraph-image.tsx` file convention; card pages keep their existing real-artwork previews untouched.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, `next/og`, TypeScript, Tailwind v4, vitest.

## Global Constraints

- All commands run from `app/` (npm workspaces root; there is no root `package.json`).
- Web tests: `npm test -w web`; typecheck: `npm run typecheck`; build: `npm run build -w web`.
- Conventional Commits. Documentation filenames UPPERCASE (not applicable to code here).
- **Never add Claude/Claude Code attribution** to commits.
- Commit with GPG signing disabled: prefix commits with `git -c commit.gpgsign=false`.
- Brand name is `Revelio` (`@/lib/brand` → `BRAND_NAME`). Canonical origin is `SITE_URL` from `@/lib/site`.
- Brand colors (from `logos/BRAND-GUIDE.md`): Midnight `#13122A`, Badge bg `#181634`, Gold `#E8B23A`, Gold light `#F6D58B`, Indigo `#3B3194`, Parchment `#FBF3DC`.
- Working branch: `feat/seo-and-apple-icons` (already checked out).

---

### Task 1: SEO helper module (`src/lib/seo.ts`)

Pure, dependency-light module holding every SEO constant and metadata builder the rest of the plan consumes. No `next/og`, no `next-intl`, no I/O — so it is trivially unit-testable and safe to import anywhere.

**Files:**
- Create: `app/web/src/lib/seo.ts`
- Test: `app/web/src/lib/__tests__/seo.test.ts`

**Interfaces:**
- Consumes: `SITE_URL` from `@/lib/site`, `BRAND_NAME` from `@/lib/brand`.
- Produces:
  - `METADATA_BASE: URL`
  - `THEME_COLOR: '#13122A'`
  - `OG_SIZE: { width: 1200; height: 630 }`
  - `OG_CONTENT_TYPE: 'image/png'`
  - `buildSiteMetadata(opts: { locale: string; description: string }): Metadata`
  - `setOgSubtitle(set: { code: string; cardCount: number }): string`

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/seo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  METADATA_BASE,
  THEME_COLOR,
  OG_SIZE,
  OG_CONTENT_TYPE,
  buildSiteMetadata,
  setOgSubtitle,
} from '../seo'

describe('seo helpers', () => {
  it('exposes the canonical origin as metadataBase', () => {
    expect(METADATA_BASE).toBeInstanceOf(URL)
    // SITE_URL defaults to https://revelio.cards in tests
    expect(METADATA_BASE.origin).toBe('https://revelio.cards')
  })

  it('uses the brand midnight as the theme color', () => {
    expect(THEME_COLOR).toBe('#13122A')
  })

  it('uses the standard 1200x630 PNG social card', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
    expect(OG_CONTENT_TYPE).toBe('image/png')
  })

  it('builds site metadata with base, OG website + twitter card', () => {
    const meta = buildSiteMetadata({ locale: 'en', description: 'A test description.' })
    expect(meta.metadataBase).toBe(METADATA_BASE)
    expect(meta.description).toBe('A test description.')
    // title is a template so per-page titles render as "Card · Revelio"
    expect(meta.title).toEqual({ default: 'Revelio', template: '%s · Revelio' })
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Revelio',
      locale: 'en',
      description: 'A test description.',
    })
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', description: 'A test description.' })
  })

  it('formats a set OG subtitle as "CODE · N cards"', () => {
    expect(setOgSubtitle({ code: 'BASE', cardCount: 116 })).toBe('BASE · 116 cards')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/seo.test.ts`
Expected: FAIL — cannot resolve `../seo`.

- [ ] **Step 3: Write minimal implementation**

Create `app/web/src/lib/seo.ts`:

```ts
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'
import { BRAND_NAME } from '@/lib/brand'

/** Absolute origin used to resolve relative OG/icon URLs in metadata. */
export const METADATA_BASE = new URL(SITE_URL)

/** Brand midnight — used for the PWA theme color and manifest background. */
export const THEME_COLOR = '#13122A'

/** Standard Open Graph / Twitter large-image card dimensions. */
export const OG_SIZE = { width: 1200, height: 630 } as const

/** Content type emitted by the generated OG image routes. */
export const OG_CONTENT_TYPE = 'image/png'

/**
 * Site-wide default metadata. Per-page `generateMetadata` still overrides
 * title/description/openGraph.images as needed; this only supplies the shared
 * base (metadataBase, title template, OG website + twitter card defaults).
 */
export function buildSiteMetadata(opts: { locale: string; description: string }): Metadata {
  const { locale, description } = opts
  return {
    metadataBase: METADATA_BASE,
    title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
    description,
    openGraph: {
      type: 'website',
      siteName: BRAND_NAME,
      locale,
      title: BRAND_NAME,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: BRAND_NAME,
      description,
    },
  }
}

/** Subtitle line for a set's generated OG image, e.g. "BASE · 116 cards". */
export function setOgSubtitle(set: { code: string; cardCount: number }): string {
  return `${set.code} · ${set.cardCount} cards`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/seo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/src/lib/seo.ts web/src/lib/__tests__/seo.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add central SEO metadata helpers"
```

---

### Task 2: Apple/favicon icons + web manifest (the Safari fix)

Add the App Router icon file conventions so Next emits `apple-touch-icon`, an SVG favicon, and a web manifest. This is the headline fix — after this, Safari and iOS "Add to Home Screen" show the badge icon.

**Files:**
- Create (binary, copied): `app/web/src/app/apple-icon.png` ← `logos/revelio-icon-badge-180.png`
- Create (copied): `app/web/src/app/icon.svg` ← `logos/revelio-icon.svg`
- Create (binary, copied): `app/web/public/revelio-icon-badge-192.png`, `app/web/public/revelio-icon-badge-512.png`
- Create: `app/web/src/app/manifest.ts`
- Test: `app/web/src/app/__tests__/manifest.test.ts`
- Keep: `app/web/src/app/favicon.ico` (unchanged)

**Interfaces:**
- Consumes: `THEME_COLOR` from `@/lib/seo`, `BRAND_NAME` from `@/lib/brand`.
- Produces: default export `manifest(): MetadataRoute.Manifest`.

- [ ] **Step 1: Copy the icon assets from `logos/` into place**

Run (from repo root):

```bash
cp logos/revelio-icon-badge-180.png app/web/src/app/apple-icon.png
cp logos/revelio-icon.svg           app/web/src/app/icon.svg
cp logos/revelio-icon-badge-192.png app/web/public/revelio-icon-badge-192.png
cp logos/revelio-icon-badge-512.png app/web/public/revelio-icon-badge-512.png
```

Verify they are real binaries:

```bash
file app/web/src/app/apple-icon.png app/web/public/revelio-icon-badge-512.png
```

Expected: both report `PNG image data`, 180×180 and 512×512 respectively.

- [ ] **Step 2: Write the failing test**

Create `app/web/src/app/__tests__/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import manifest from '../manifest'
import { THEME_COLOR } from '@/lib/seo'

describe('web app manifest', () => {
  const m = manifest()

  it('names the app Revelio and runs standalone', () => {
    expect(m.name).toBe('Revelio')
    expect(m.short_name).toBe('Revelio')
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
  })

  it('uses the brand midnight for theme and background', () => {
    expect(m.theme_color).toBe(THEME_COLOR)
    expect(m.background_color).toBe(THEME_COLOR)
  })

  it('ships 192 and 512 png icons', () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe('image/png')
      expect(icon.src.startsWith('/')).toBe(true)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- src/app/__tests__/manifest.test.ts`
Expected: FAIL — cannot resolve `../manifest`.

- [ ] **Step 4: Write the manifest**

Create `app/web/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'
import { BRAND_NAME } from '@/lib/brand'
import { THEME_COLOR } from '@/lib/seo'

// Not localized: the manifest lives outside the [locale] segment, so it has no
// request locale. English description matches messages/en.json → meta.description.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: 'A searchable Harry Potter TCG card database.',
    start_url: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: '/revelio-icon-badge-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/revelio-icon-badge-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
```

Note: `purpose: 'any'` (not `maskable`) — the badge PNGs are full-bleed without a
maskable safe-zone, so declaring `maskable` could let Android crop the mark.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w web -- src/app/__tests__/manifest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/src/app/apple-icon.png web/src/app/icon.svg \
  web/public/revelio-icon-badge-192.png web/public/revelio-icon-badge-512.png \
  web/src/app/manifest.ts web/src/app/__tests__/manifest.test.ts
git -c commit.gpgsign=false commit -m "feat(web): add apple-touch-icon, svg favicon and web manifest"
```

---

### Task 3: Root layout metadata + viewport

Wire the site-wide defaults from Task 1 into the root layout, and add the `viewport` export carrying the theme color (Next 16 moved `themeColor` out of `metadata`).

**Files:**
- Modify: `app/web/src/app/[locale]/layout.tsx`
- Test: `app/web/src/app/[locale]/__tests__/layout-metadata.test.ts`

**Interfaces:**
- Consumes: `buildSiteMetadata`, `THEME_COLOR` from `@/lib/seo`.
- Produces: `export const viewport: Viewport` on the layout; extended `generateMetadata`.

- [ ] **Step 1: Write the failing test**

The layout's `generateMetadata` depends on `next-intl` request context, which is awkward to unit-test. Instead, extract the theme color into the `viewport` export and assert that, plus assert the layout re-uses `buildSiteMetadata` (covered by Task 1's tests). Create `app/web/src/app/[locale]/__tests__/layout-metadata.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { viewport } from '../layout'
import { THEME_COLOR } from '@/lib/seo'

describe('root layout viewport', () => {
  it('sets the browser theme color to the brand midnight', () => {
    expect(viewport.themeColor).toBe(THEME_COLOR)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/__tests__/layout-metadata.test.ts"`
Expected: FAIL — `viewport` is not exported from `../layout`.

- [ ] **Step 3: Update the layout**

In `app/web/src/app/[locale]/layout.tsx`:

Change the imports at the top — add `Viewport` to the `next` type import and import the seo helpers:

```ts
import type { Metadata, Viewport } from 'next'
```

Add after the existing imports (near the `BRAND_NAME` import):

```ts
import { buildSiteMetadata, THEME_COLOR } from '@/lib/seo'
```

Replace the body of `generateMetadata` (the `return { ... }` block) so it delegates to the shared builder:

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('meta')
  return buildSiteMetadata({ locale, description: t('description') })
}
```

Add the `viewport` export directly below `generateMetadata`:

```ts
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}
```

Leave the `poppins` font, `generateStaticParams`, and the `LocaleLayout` component unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- "src/app/[locale]/__tests__/layout-metadata.test.ts"`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
cd app && git -c commit.gpgsign=false add "web/src/app/[locale]/layout.tsx" \
  "web/src/app/[locale]/__tests__/layout-metadata.test.ts"
git -c commit.gpgsign=false commit -m "feat(web): set metadataBase, OG/twitter defaults and theme-color viewport"
```

---

### Task 4: Shared OG image renderer + default site OG image

Add a single branded `ImageResponse` renderer and the default `[locale]/opengraph-image.tsx`. By Next's file convention this image becomes the default social preview for every page under `[locale]` that doesn't supply its own (home, search, sets index, …). Card pages already set `openGraph.images` in their own `generateMetadata`, which overrides this — so card previews are unaffected.

**Files:**
- Create (binary, downloaded): `app/web/src/lib/fonts/Poppins-SemiBold.ttf`
- Create: `app/web/src/lib/og-image.tsx`
- Create: `app/web/src/app/[locale]/opengraph-image.tsx`
- Test: `app/web/src/lib/__tests__/og-image.test.ts`

**Interfaces:**
- Consumes: `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/seo`.
- Produces: `renderBrandOgImage(opts: { title: string; subtitle: string }): Promise<ImageResponse>` from `@/lib/og-image`.

- [ ] **Step 1: Vendor the Poppins font (one-time asset)**

The `ImageResponse` renderer needs a real font file; load it via the Next-traced
`new URL(..., import.meta.url)` pattern so it is bundled into the route. Poppins is
OFL-licensed (already the site's house font). Download the SemiBold weight:

```bash
mkdir -p app/web/src/lib/fonts
curl -fL -o app/web/src/lib/fonts/Poppins-SemiBold.ttf \
  https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-SemiBold.ttf
file app/web/src/lib/fonts/Poppins-SemiBold.ttf
```

Expected: `TrueType Font data`. (If the URL 404s, fetch `Poppins-SemiBold.ttf` from
https://fonts.google.com/specimen/Poppins and place it at the same path.)

- [ ] **Step 2: Write the failing test**

The full render needs the bundled font and satori, which are unreliable under vitest;
actual pixel output is verified by `npm run build` + manual check in this task's final
steps. The unit test pins the pure contract the routes re-export. Create
`app/web/src/lib/__tests__/og-image.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { OG_SIZE, OG_CONTENT_TYPE } from '../seo'

describe('og image contract', () => {
  it('routes advertise a 1200x630 PNG', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
    expect(OG_CONTENT_TYPE).toBe('image/png')
  })
})
```

- [ ] **Step 3: Run test to verify it fails or passes trivially**

Run: `npm test -w web -- src/lib/__tests__/og-image.test.ts`
Expected: PASS (this pins the contract Tasks 4–5 depend on; it fails only if `seo.ts` regresses).

- [ ] **Step 4: Write the shared renderer**

Create `app/web/src/lib/og-image.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { OG_SIZE } from '@/lib/seo'

// The wand-and-star mark, inlined from logos/revelio-icon.svg and embedded as a
// data URI so the renderer makes no external image request.
const MARK_SVG = `<svg width="80" height="80" viewBox="16 15 68 68" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-7,2.5)"><polygon points="26.51,72.70 33.49,79.30 65.16,41.10 62.84,38.90" fill="#3B3194"/><line x1="40.12" y1="73.30" x2="32.12" y2="65.74" stroke="#C8881E" stroke-width="2.6" stroke-linecap="round"/><path d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z" fill="#E8B23A"/><path d="M70,26 Q71.6,32.4 78,34 Q71.6,35.6 70,42 Q68.4,35.6 62,34 Q68.4,32.4 70,26 Z" fill="#F6D58B"/><path d="M52,14 Q53.2,18.8 58,20 Q53.2,21.2 52,26 Q50.8,21.2 46,20 Q50.8,18.8 52,14 Z" fill="#E8B23A"/><path d="M78,53.5 Q78.9,57.1 82.5,58 Q78.9,58.9 78,62.5 Q77.1,58.9 73.5,58 Q77.1,57.1 78,53.5 Z" fill="#E8B23A"/></g></svg>`
const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`

let fontPromise: Promise<ArrayBuffer> | null = null
function loadFont(): Promise<ArrayBuffer> {
  if (!fontPromise) {
    fontPromise = fetch(new URL('./fonts/Poppins-SemiBold.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    )
  }
  return fontPromise
}

/**
 * Renders a 1200x630 branded social card: the revelio lockup top-left, a large
 * `title`, and a smaller `subtitle`, on the gold-on-indigo scheme. Shared by the
 * default site OG image and per-set OG images.
 */
export async function renderBrandOgImage(opts: {
  title: string
  subtitle: string
}): Promise<ImageResponse> {
  const font = await loadFont()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #13122A 0%, #181634 60%, #3B3194 160%)',
          fontFamily: 'Poppins',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_DATA_URI} width={64} height={64} alt="" />
          <span style={{ fontSize: 40, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: 76, color: '#FBF3DC', lineHeight: 1.05 }}>{opts.title}</span>
          <span style={{ fontSize: 36, color: '#E8B23A' }}>{opts.subtitle}</span>
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

- [ ] **Step 5: Write the default OG image route**

Create `app/web/src/app/[locale]/opengraph-image.tsx`:

```tsx
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo'
import { renderBrandOgImage } from '@/lib/og-image'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Revelio — Harry Potter TCG card database'

export default async function Image() {
  return renderBrandOgImage({
    title: 'Reveal every Harry Potter TCG card.',
    subtitle: 'revelio.cards',
  })
}
```

- [ ] **Step 6: Verify tests, typecheck, and a real build**

```bash
npm test -w web -- src/lib/__tests__/og-image.test.ts
npm run typecheck
npm run build -w web
```

Expected: tests PASS, typecheck PASS, and the build compiles the
`/[locale]/opengraph-image` route with no font/satori errors. (The build is the real
render check for this task.)

- [ ] **Step 7: Manual render check (optional but recommended)**

```bash
npm run dev -w web
```

Open `http://localhost:3000/en/opengraph-image` — expect a 1200×630 PNG showing the
revelio lockup, the tagline, and `revelio.cards` in gold. Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
cd app && git -c commit.gpgsign=false add web/src/lib/fonts/Poppins-SemiBold.ttf \
  web/src/lib/og-image.tsx "web/src/app/[locale]/opengraph-image.tsx" \
  web/src/lib/__tests__/og-image.test.ts
git -c commit.gpgsign=false commit -m "feat(web): generate default branded Open Graph image"
```

---

### Task 5: Set-specific OG image route

Give each set page its own generated share image (set name + code + card count). Sits at a deeper segment than the default, so Next uses it in preference for `/sets/<code>` routes. Falls back to the default site card when the set is missing.

**Files:**
- Create: `app/web/src/app/[locale]/sets/[code]/opengraph-image.tsx`
- Test: `app/web/src/lib/__tests__/seo.test.ts` (extend — the `setOgSubtitle` contract this route relies on is already covered in Task 1; add an edge case)

**Interfaces:**
- Consumes: `getSetByCode` from `@revelio/db`, `getDb` from `@/lib/db`, `renderBrandOgImage` from `@/lib/og-image`, `OG_SIZE`, `OG_CONTENT_TYPE`, `setOgSubtitle` from `@/lib/seo`.
- Produces: the `sets/[code]/opengraph-image` route (no exported symbols consumed elsewhere).

- [ ] **Step 1: Add the failing edge-case test**

Append to `app/web/src/lib/__tests__/seo.test.ts` inside the existing `describe`:

```ts
  it('handles a single-card set subtitle', () => {
    expect(setOgSubtitle({ code: 'PROMO', cardCount: 1 })).toBe('PROMO · 1 cards')
  })
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/seo.test.ts`
Expected: PASS (`setOgSubtitle` already produces this; the test locks the format the route depends on).

- [ ] **Step 3: Write the set OG image route**

Create `app/web/src/app/[locale]/sets/[code]/opengraph-image.tsx`:

```tsx
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { OG_SIZE, OG_CONTENT_TYPE, setOgSubtitle } from '@/lib/seo'
import { renderBrandOgImage } from '@/lib/og-image'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Revelio card set'

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  const set = await getSetByCode(getDb(), code, locale)
  if (!set) {
    return renderBrandOgImage({
      title: 'Reveal every Harry Potter TCG card.',
      subtitle: 'revelio.cards',
    })
  }
  return renderBrandOgImage({ title: set.name, subtitle: setOgSubtitle(set) })
}
```

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck
npm run build -w web
```

Expected: PASS; the `/[locale]/sets/[code]/opengraph-image` route compiles.

- [ ] **Step 5: Manual render check (optional)**

With `npm run dev -w web` running, open `http://localhost:3000/en/sets/<code>/opengraph-image`
for a real set code (find one via `/en/sets`). Expect the set name as the title and
`<CODE> · <N> cards` in gold.

- [ ] **Step 6: Commit**

```bash
cd app && git -c commit.gpgsign=false add "web/src/app/[locale]/sets/[code]/opengraph-image.tsx" \
  web/src/lib/__tests__/seo.test.ts
git -c commit.gpgsign=false commit -m "feat(web): generate per-set Open Graph images"
```

---

## Final verification

- [ ] **Run the full web suite + typecheck + build**

```bash
npm test -w web
npm run typecheck
npm run build -w web
npm run lint -w web
```

Expected: all tests pass; typecheck clean; build succeeds; lint shows no new errors (the
repo has ~13 pre-existing React-Compiler warnings — those are unrelated).

- [ ] **Manual smoke of the emitted tags**

With `npm run dev -w web` running, `view-source` on `http://localhost:3000/en` and confirm:
- `<link rel="apple-touch-icon" .../>` is present (the Safari fix)
- `<link rel="manifest" href="/manifest.webmanifest"/>`
- `<link rel="icon" ... image/svg+xml>` and the theme-color `<meta name="theme-color" content="#13122A">`
- `og:title`, `og:description`, `og:site_name`, `og:image`, and `twitter:card` are present
- On a card page, `og:image` still points at the real card artwork (unchanged)

## Spec coverage check

- Part 1 (icons + Safari fix + manifest) → Task 2. ✅
- Part 2 (metadataBase + OG/Twitter defaults + theme-color viewport) → Tasks 1 + 3. ✅
- Part 3 (default OG image + set OG image; cards keep artwork) → Tasks 4 + 5. ✅
- JSON-LD → explicitly out of scope (cut). ✅

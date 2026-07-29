# SEO & Apple Icons — Design

**Date:** 2026-07-29
**Status:** Approved
**Workspace:** `@revelio/web` (`app/web/`)

## Problem

Two issues with the deployed site:

1. **Safari / iOS shows no icon.** Adding revelio.cards to the iOS/macOS home screen or
   bookmarks shows a blank or screenshot thumbnail instead of the brand mark. Root cause:
   Next.js App Router only emits `<link rel="apple-touch-icon">` when an `apple-icon` file
   exists in the app directory. The app has only `favicon.ico`, so no apple-touch-icon link
   is generated.
2. **SEO / social sharing is incomplete.** The site already has per-page canonical +
   `hreflang` alternates, `sitemap.ts`, `robots.ts`, and Open Graph images on card pages,
   but: there is no `metadataBase` (Next warns, relative OG/icon URLs don't fully resolve),
   no default Open Graph / Twitter card config (non-card pages share nothing rich on
   social), no web app manifest (theme color, PWA/home-screen), and no per-page share
   images for non-card pages.

## Goals

- Fix the Safari/iOS icon by adding the App Router icon file conventions.
- Establish a metadata foundation so **every** page (not just cards) has rich, correct
  Open Graph + Twitter previews.
- Generate branded social share images for pages that lack a natural image.

## Non-Goals

- **No JSON-LD / structured data.** Considered and cut — low payoff for a fan catalog, and
  `Product`/`Game` markup would risk a Google spam flag. Can be added later.
- **No change to card-page social previews.** Card pages already share the real card
  artwork, which is the best possible preview.
- No changes to `robots.ts`, `sitemap.ts`, or the existing per-page canonical/alternates
  logic — those are already correct.

## Existing assets

`logos/` already contains everything needed — no new artwork to design:

| File | Use |
|---|---|
| `revelio-icon-badge-180.png` | Apple touch icon (opaque badge, correct for iOS masking) |
| `revelio-icon-badge-192.png` / `-512.png` | Manifest / Android home-screen icons |
| `revelio-icon.svg` | Modern vector favicon (transparent mark) |
| `favicon.ico` | Legacy fallback (already wired) |
| `revelio-logo-dark-1200.png`, brand colors | OG image template |

Brand colors (from `logos/BRAND-GUIDE.md`): Gold `#E8B23A`, Midnight `#13122A`,
Badge background `#181634`, Indigo light `#6E66C9`, Parchment `#FBF3DC`.

## Part 1 — Icons (Safari fix + manifest)

App Router file conventions placed in `app/web/src/app/`:

| File | Source asset | Emitted tag |
|---|---|---|
| `apple-icon.png` | `logos/revelio-icon-badge-180.png` | `<link rel="apple-touch-icon" sizes="180x180">` — **the Safari/home-screen fix** |
| `icon.svg` | `logos/revelio-icon.svg` | `<link rel="icon" type="image/svg+xml">` |
| `favicon.ico` | *(unchanged)* | legacy `<link rel="icon">` |
| `manifest.ts` | — | `<link rel="manifest" href="/manifest.webmanifest">` |

`manifest.ts` returns a `MetadataRoute.Manifest`:

- `name: 'Revelio'`, `short_name: 'Revelio'`
- `description` from the `meta` translations
- `start_url: '/'`, `display: 'standalone'`
- `background_color: '#13122A'`, `theme_color: '#13122A'`
- `icons`: 192×192 and 512×512, both `purpose: 'any maskable'`, served from `public/`

Manifest PNG icons (`revelio-icon-badge-192.png`, `revelio-icon-badge-512.png`) are copied
into `app/web/public/` so they resolve at stable public URLs. The `apple-icon.png` and
`icon.svg` live in the app dir (they are metadata file conventions, not public assets).

**Note:** `apple-icon.png` must be a real binary PNG in the repo. Copy the existing
`logos/revelio-icon-badge-180.png` — do not hand-generate.

## Part 2 — Metadata foundation (root `[locale]/layout.tsx`)

Extend the existing `generateMetadata` in `app/web/src/app/[locale]/layout.tsx`:

- `metadataBase: new URL(SITE_URL)` — from `@/lib/site`. Silences Next's warning and lets
  relative OG/icon URLs resolve to absolute.
- Default `openGraph`:
  - `type: 'website'`, `siteName: BRAND_NAME`, `locale`
  - `title` (default = brand, template = `%s · Revelio`), `description` from `meta`
  - `url` = the locale home canonical
  - `images` come from the file-convention OG image (Part 3) — **not** hard-coded here.
- Default `twitter`: `card: 'summary_large_image'`, `title`, `description`.
- Add a `viewport` export (Next 16 moved `themeColor` out of `metadata`):
  `export const viewport: Viewport = { themeColor: '#13122A' }`.

Per-page `generateMetadata` (card, set, search, etc.) continues to override `title` /
`description` / `openGraph.images` as it does today. Card pages already set
`openGraph.images` to the real artwork, which overrides the inherited default image.

## Part 3 — Dynamic OG images (`next/og` `ImageResponse`)

Branded 1200×630 share images for pages without a natural image, via the
`opengraph-image.tsx` file convention.

- `app/web/src/app/[locale]/opengraph-image.tsx` — **default site template**. By file
  convention this image is inherited by every nested route that doesn't provide its own,
  so it covers home, search, sets index, and any future page. Content: the revelio mark +
  wordmark + tagline on the gold-on-indigo scheme, using brand colors above. Exports
  `size = { width: 1200, height: 630 }`, `contentType = 'image/png'`, and `alt`.
- `app/web/src/app/[locale]/sets/[code]/opengraph-image.tsx` — **set-specific**. Loads the
  set (same query the set page uses), renders set name + code + card count on the branded
  template. Falls back gracefully (returns the default look) if the set is missing.
- **Card pages: no OG-image file.** Their `generateMetadata` already sets
  `openGraph.images` to the real card artwork, which wins over the inherited default.

Implementation notes:

- Use `next/og`'s `ImageResponse`. Fonts: fetch the Poppins weight the template needs at
  build/runtime, or render with a system-safe fallback if font loading is out of scope for
  a first pass — the template must not throw if the font fetch fails.
- Embed the mark as inline SVG/JSX (from `revelio-icon.svg`) rather than an external image
  request, to keep the route self-contained.
- Runtime: default `nodejs` runtime is fine (the set variant needs a DB read); do not force
  `edge`.

## Testing

Pragmatic unit + smoke coverage (vitest):

- `manifest.ts` — asserts `name`, `theme_color`, and that 192 + 512 icons are present with
  correct sizes.
- Root layout metadata — asserts `metadataBase` is set to `SITE_URL`, and that default
  `openGraph`/`twitter` fields are present; `viewport.themeColor` is set.
- OG-image routes — smoke test: module exports a valid `size` (1200×630) and
  `contentType: 'image/png'`, and the default template renders (invoking the export) without
  throwing. No pixel comparison.
- No changes to existing `robots.test.ts` / `smoke.test.tsx` behavior; keep them green.

## Files touched (summary)

**New**
- `app/web/src/app/apple-icon.png` (copy of `logos/revelio-icon-badge-180.png`)
- `app/web/src/app/icon.svg` (copy of `logos/revelio-icon.svg`)
- `app/web/src/app/manifest.ts`
- `app/web/public/revelio-icon-badge-192.png`, `-512.png`
- `app/web/src/app/[locale]/opengraph-image.tsx`
- `app/web/src/app/[locale]/sets/[code]/opengraph-image.tsx`
- Tests: `manifest.test.ts`, layout-metadata test, OG-image smoke tests

**Modified**
- `app/web/src/app/[locale]/layout.tsx` (metadataBase, OG/Twitter defaults, `viewport`)

## Rollout / verification

- `npm run typecheck` and `npm test -w web` green.
- `npm run build -w web` succeeds (OG image routes compile).
- Manual: view-source on `/` shows `apple-touch-icon`, `manifest`, `og:*`, `twitter:*`
  tags; `/opengraph-image` and a set's `/sets/<code>/opengraph-image` return a 1200×630 PNG;
  iOS "Add to Home Screen" shows the badge icon.

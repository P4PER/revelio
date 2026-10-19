# Logo Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name every logo file by what it is and which background it is for, and show the dark-background variant wherever the logo sits on a dark surface: the three share images, the phone header icon, the home search icon and the Discord bot avatar.

**Architecture:** One rename commit across `logos/`, `app/web/public/` and `app/sheet/src/` with every reference, then one new icon file cut from the dark logo, then the call sites. The share images stop inlining a copy of the mark and typing the wordmark: they read the published SVGs from `public/`, so the site and the share images have one source.

**Tech Stack:** Next.js 16 (`next/image`, `next/og`/satori), Tailwind v4 `dark:` variants, Vitest, sharp (only to re-export PNGs, if any are regenerated - none are planned).

**Spec:** Approved in conversation on 2026-10-19 (follow-up to PR #179, the /discord share image). Stacked on `feat/discord-og-image`; the PR targets that branch and GitHub retargets it to `main` when #179 merges.

## Global Constraints

- Naming: `revelio-<part>-<background>`. Parts: `logo` (icon + wordmark), `icon` (wand + star), `wordmark` (text), `app-icon` (icon on its square tile). Background: `on-light` / `on-dark`.
- Rename map (both `logos/` and `app/web/public/` where the file exists there):

  | Now | New |
  |---|---|
  | `revelio-logo-primary.svg`, `revelio-logo-primary-1200.png` | `revelio-logo-on-light.svg`, `revelio-logo-on-light-1200.png` |
  | `revelio-logo-dark.svg`, `revelio-logo-dark-1200.png` | `revelio-logo-on-dark.svg`, `revelio-logo-on-dark-1200.png` |
  | `revelio-icon.svg`, `revelio-icon-{16,32,192,512}.png` | `revelio-icon-on-light.svg`, `revelio-icon-on-light-{16,32,192,512}.png` |
  | `revelio-icon-dark.svg` (parchment wand, sign-in card) | `revelio-icon-parchment.svg` |
  | `revelio-wordmark-dark.svg` | `revelio-wordmark-on-dark.svg` |
  | `revelio-icon-badge.svg`, `revelio-icon-badge-{180,192,512}.png` | `revelio-app-icon.svg`, `revelio-app-icon-{180,192,512}.png` |
  | `app/sheet/src/revelio-logo.svg` | `app/sheet/src/revelio-logo-on-dark.svg` |

- Not renamed: `revelio-logo-email.png` (its URL is in every email already sent), `app/web/src/app/{favicon.ico,icon.svg,apple-icon.png}` and `logos/favicon.ico` (Next file conventions / browser default).
- New file `revelio-icon-on-dark.svg` in `logos/` and `app/web/public/`: `revelio-icon-on-light.svg` byte for byte except the four colours, taken from the dark logo's mark: wand `#3B3194` -> `#6E66C9`, grip band `#C8881E` -> `#E8B23A`, inner glow `#F6D58B` -> `#FBF3DC` (star and sparks stay `#E8B23A`). No new design.
- Historical docs under `docs/superpowers/` keep the old names.
- Use `git mv` so history follows the files. Code comments ASCII-only.

## Review Focus

- A reference left on an old name 404s silently in the browser (a broken `<img>`), and no unit test renders real assets: after the rename, `git grep` for every old name outside `docs/superpowers/` must come back empty.
- The sheet Docker image copies the logo by name in `app/sheet/Dockerfile` and `build.mjs`; a miss there builds clean and fails the image's own `test -s` - the grep above covers it, and the sheet's `logo.test.ts` pins the copy.
- Light theme must not change: every `dark:` swap keeps the on-light variant as the default.
- A share image whose logo read fails must still render (omit the logo, as with lesson icons) and must not cache the failure.

---

### Task 1: Rename the logo files

**Files:**
- Move (git mv): every row of the rename map, in `logos/`, `app/web/public/`, `app/sheet/src/`
- Modify: `app/web/src/components/layout/brand-mark.tsx`, `header-brand-mark.tsx`, `app/web/src/components/search/home-search.tsx`, `app/web/src/components/discord/command-channel.tsx`, `app/web/src/components/auth/auth-card-fan.tsx`, `app/web/src/app/manifest.ts`, `app/web/src/components/legal/owl-post-emblem.tsx` (comment), `app/web/src/lib/og-image.tsx` (comment), `app/web/public/revelio-icon-parchment.svg` and `revelio-wordmark-on-dark.svg` (their own comments name siblings), `app/core/src/deck-sheet.ts` (comment), `app/sheet/src/render.ts`, `app/sheet/build.mjs`, `app/sheet/Dockerfile`, `logos/BRAND-GUIDE.md` (file table)
- Test: `app/web/src/components/layout/__tests__/header-brand-mark.test.tsx`, `app/web/src/components/auth/__tests__/auth-card-fan.test.tsx`, `app/sheet/test/logo.test.ts`

**Interfaces:**
- Produces: the new file names, used by Tasks 2-4.

- [ ] Update the three tests to the new names first; run `npm test -w web -- src/components/layout src/components/auth` and `npm test -w @revelio/sheet -- test/logo.test.ts`; expect FAIL (files/srcs not found).
- [ ] `git mv` per the map; update every reference listed above. BRAND-GUIDE file table gains a one-line legend of the naming scheme above the table.
- [ ] `git grep -n -E "revelio-(logo-(primary|dark)|icon-(dark|badge)|wordmark-dark|icon(-[0-9]+)?\.(svg|png))|sheet/dist/revelio-logo\.svg|'revelio-logo\.svg'" -- ':!docs/superpowers'` returns nothing.
- [ ] Tests pass. Commit `refactor: name logo files by part and background`.

### Task 2: Add the dark-background icon

**Files:**
- Create: `logos/revelio-icon-on-dark.svg`, `app/web/public/revelio-icon-on-dark.svg`
- Modify: `logos/BRAND-GUIDE.md` (one row)
- Test: `app/web/src/lib/__tests__/brand-assets.test.ts` (new)

- [ ] Test `brand-assets.test.ts`: for `revelio-logo-on-light.svg`, `revelio-logo-on-dark.svg`, `revelio-icon-on-light.svg`, `revelio-icon-on-dark.svg`, the `app/web/public/` copy equals the `logos/` file byte for byte (the sheet's `logo.test.ts` pattern); and `revelio-icon-on-dark.svg` with the three colour swaps reversed equals `revelio-icon-on-light.svg`.
- [ ] Run, expect FAIL (file missing).
- [ ] Create both copies per Global Constraints.
- [ ] Run, expect PASS. Commit `feat: add the dark-background icon`.

### Task 3: Dark variant in the web app

**Files:**
- Modify: `app/web/src/components/layout/header-brand-mark.tsx`, `app/web/src/components/search/home-search.tsx`, `app/web/src/components/discord/command-channel.tsx`
- Test: `header-brand-mark.test.tsx`, `app/web/src/components/search/__tests__/home-search.test.tsx`, `app/web/src/components/discord/__tests__/command-channel.test.tsx`

- [ ] Tests: header (off home) renders both icons, `revelio-icon-on-light.svg` with class `dark:hidden` and `revelio-icon-on-dark.svg` with `hidden` + `dark:block` (alongside the existing `min-[640px]:hidden`); home search renders the same pair, both `alt=""`; the bot avatar uses `revelio-icon-on-dark.svg` only.
- [ ] Run, expect FAIL.
- [ ] Header and search: render both variants and let CSS pick one, as `BrandMark` does. The header icon drops its `priority`, for the reason `BrandMark`'s comment gives (a preload on both copies spends one on the copy never painted; on one copy moves the cost to the other theme). Avatar: switch the src and update its comment, which says the midnight circle is there because the indigo mark would vanish.
- [ ] Run, expect PASS. Screenshot `/` and `/sets` at 390px in dark and light (Playwright, see memory recipe): dark shows the lighter wand in header and search, light is unchanged. Commit `fix(web): show the dark-background icon in dark mode`.

### Task 4: Real logo in the share images

**Files:**
- Modify: `app/web/src/lib/og-image.tsx`
- Test: `app/web/src/lib/__tests__/og-image.test.tsx`

**Interfaces:**
- Consumes: `public/revelio-logo-on-dark.svg` (262x78), `public/revelio-icon-on-dark.svg` (68x68 viewBox).

- [ ] Test: rendering `renderDefaultOgImage('en')` (via `renderBrandOgImage`), `renderDeckOgImage` and `renderDiscordOgImage('en')` each reads `revelio-logo-on-dark.svg` (assert on the existing `readFileMock` calls); the Discord render also reads `revelio-icon-on-dark.svg`; with the logo read failing once, all three still return a 1200x630 PNG and the next render reads the logo again.
- [ ] Run, expect FAIL.
- [ ] Replace `MARK_SVG`/`MARK_DATA_URI` and the typed "revelio" span with `loadPublicSvg(file: string): Promise<string | null>` - reads `join(process.cwd(), 'public', file)` (the path `loadLessonIcon` already relies on: standalone `server.js` chdirs to `web/`), returns a data URI, caches successes only. `loadLessonIcon` becomes a call to it with `lessons/${code}.svg`. Logo heights: 64px on the brand and Discord cards (width 215), 44px on the deck card (width 148). Discord avatar uses the on-dark icon.
- [ ] Run, expect PASS. Fetch `/opengraph-image/og`, `/discord/opengraph-image/og` and a public deck's image from the dev server and look at each. Commit `fix(web): draw the dark logo on the share images`.

### Task 5: Verify and open the PR

- [ ] From `app/`: `npm run typecheck`, `npm run lint`, `npm test -w web`, `npm test -w @revelio/sheet`; all pass.
- [ ] Push `feat/logo-variants`, open the PR against `feat/discord-og-image` with title `fix(web): use the dark-background logo on dark surfaces`; body links this plan and #179, `## Verification` lists the commands above with real results and the screenshots checked.

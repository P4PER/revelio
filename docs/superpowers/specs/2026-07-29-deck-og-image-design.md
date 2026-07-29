# Deck Open Graph Image — Design

**Date:** 2026-07-29
**Status:** Approved
**Workspace:** `@revelio/web` (`app/web/`)
**Builds on:** `2026-07-29-seo-and-apple-icons-design.md` (the OG image infrastructure)

## Problem

Deck detail pages (`/decks/[id]`) currently inherit the default branded site OG image.
Sharing a public deck should show something specific to that deck — its **starting
character** art and name — the way the on-site `DeckHeroCard` already presents decks.

## Goals

- A generated 1200×630 OG image per public deck, built around the starting-character art
  crop, with the deck name, format, and lesson icons.
- Reuse the OG infrastructure from the SEO branch (font loader, mark, `clampOgTitle`,
  `ogImageMetadata`, `renderDefaultOgImage`).
- Never leak a private/hidden deck's name or art.

## Non-Goals

- Public decks **listing** page (`/decks`) OG — stays on the default image (decided).
- Any change to the deck page itself, its `generateMetadata`, or deck data queries.

## Data available (verified)

- `getDeckForViewer(db, id, viewerId)` returns `null` when the deck is not public and the
  viewer isn't the owner. Passing **`viewerId = null`** (crawlers are anonymous) yields the
  private-deck safety for free — private/hidden decks return `null`.
- `views: DeckCardView[]` — each has `isStartingCharacter`, `cardId`, `artCropVersion`
  (`number | null`), `name`, `zone`. The starter is `views.find(v => v.isStartingCharacter)`.
- `deck.name`, `deck.format`, `deck.lessons: string[]` (lesson codes).
- Image URL: `imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL, artCropKey(cardId, artCropVersion))`
  (`artCropKey` / `imageUrl` from `@revelio/core`) — the same art crop `DeckHeroCard` shows.
- Format label: `getTranslations('decks')` → `t('explore.format.<format>')`.

## Layout

Full-bleed starter art crop + dark gradient scrim + overlaid text — matching the site's
`DeckHeroCard` aesthetic so on-site and shared cards read as one system:

```
+------------------------------------------+
| ✦ revelio                    (top-left)   |   <- brand lockup on a top scrim
|        [ starter art crop, cover ]        |
|        [ fills the full 1200×630  ]       |
|                                           |
|  Big Deck Name                 (clamped)  |   <- bottom scrim
|  Standard   🜂 🜄 🜁            (gold)     |   <- format + lesson icons
+------------------------------------------+
```

- Art: `<img>` at full size with `objectFit: 'cover'`.
- Scrims: top + bottom linear-gradient overlays (black → transparent) for legibility,
  same idea as `DeckHeroCard`.
- Brand lockup (mark + `revelio`) top-left, small, on the top scrim.
- Deck name: bottom, large, `clampOgTitle(deck.name)`, parchment `#FBF3DC`.
- Format + lessons: below the name, gold `#E8B23A`.

## Lesson icons (Plan A, with a text fallback)

Lessons are the HP TCG lesson types; each is a static SVG at `public/lessons/<code>.svg`
(`charms`, `potions`, `quidditch`, `transfiguration`, `care_of_magical_creatures`).

- **Plan A:** read each needed SVG from disk and inline it as a base64 `data:` URI `<img>`
  — the exact technique the wand mark already uses successfully in the current OG images.
  Cache the read per code. Show up to 4 icons.
- **Fallback:** the icons are best-effort. If a code has no SVG (or one fails to load), that
  icon is simply omitted; the deck name + format still render. The image never fails because
  of a lesson icon.

Risk is low — the mark is already an inline-SVG data URI that renders correctly, and these
SVGs are similarly small/simple.

## Fallback → default branded image (the safety rule)

Render `renderDefaultOgImage(locale)` when **any** of the following hold, so a private deck
never leaks and a data gap degrades gracefully:

- `getDeckForViewer(db, id, null)` returns `null` (private/hidden/not found).
- No starting-character view.
- The starter has no `artCropVersion` (no art crop to show).
- `NEXT_PUBLIC_IMAGE_BASE_URL` is unset.

## Structure & reuse

- **`renderDeckOgImage(opts)`** — new export in `src/lib/og-image.tsx`, alongside
  `renderBrandOgImage` / `renderDefaultOgImage`, sharing the font loader, mark, and
  `clampOgTitle`. Signature:
  `{ name: string; formatLabel: string; lessonCodes: string[]; artUrl: string } → Promise<ImageResponse>`.
- **Lesson SVG loader** — a small cached `readFile` + data-URI helper in `og-image.tsx`
  (mirrors `loadFont`), returning `null` for a missing/failed code.
- **Pure helper `pickStarterArt(views, imageBase)`** in `src/lib/seo.ts` (or a deck-scoped
  helper) → `string | null`: finds the starter view and builds the art URL, or `null`.
  Pure and unit-tested.
- **Route `app/[locale]/decks/[id]/opengraph-image.tsx`** — mirrors the set route:
  - `export const dynamic = 'force-dynamic'`.
  - `generateImageMetadata`: guarded (try/catch) so it never hits the DB at build; alt =
    deck name for a resolvable public deck, else `ogImageAlt(locale)`.
  - `Image`: resolve deck via `getDeckForViewer(getDb(), id, null)`; if any fallback
    condition holds → `renderDefaultOgImage(locale)`; else `renderDeckOgImage(...)`.
  - A per-request cached `loadDeck` (React `cache`) dedupes `generateImageMetadata` + the
    render within the image request, same as the set route.

## Alt text

Localized, same pattern as the set image: public deck → `deck.name`; private/missing →
`ogImageAlt(locale)`.

## Testing

- **Unit:** `pickStarterArt` (starter found → URL; no starter / no crop / no base → null).
- **e2e:** extend `web/e2e/og-and-icons.spec.ts` — find a public deck (via `/decks`), fetch
  its `og:image`, assert `200` + `image/png` + PNG signature. Skip gracefully if no seeded
  public decks (like the other specs).
- **Build safety:** re-verify `next build` passes with an unreachable `DATABASE_URL`
  (generateImageMetadata must not read the DB at build).
- Manual: render a public deck's OG in dev and confirm the art + name + lessons; confirm a
  private deck (as anonymous) yields the default branded image.

## Files

**New**
- `app/web/src/app/[locale]/decks/[id]/opengraph-image.tsx`
- Tests: `pickStarterArt` unit test; e2e extension

**Modified**
- `app/web/src/lib/og-image.tsx` (add `renderDeckOgImage` + lesson SVG loader)
- `app/web/src/lib/seo.ts` (add `pickStarterArt`)

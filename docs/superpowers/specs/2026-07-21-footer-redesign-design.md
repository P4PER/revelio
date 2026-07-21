# Footer Redesign — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Scope:** Redesign `SiteFooter` into a rich, multi-column footer with navigation
links, brand block, legal disclaimer, and a bottom bar. Footer only — the `/about`
and `/contact` destination pages are **out of scope** for this spec.

## Goal

Replace today's single-line disclaimer footer with a proper multi-column site
footer that improves navigation, reinforces the brand, keeps the legal
fan-project disclaimer prominent, and follows footer best practices
(semantics, a11y, responsive, i18n).

## Current state

`app/web/src/components/site-footer.tsx` renders one muted disclaimer block inside
`max-w-5xl`. It is placed in `src/app/[locale]/layout.tsx` below the main content
column. `footer.disclaimer` already exists in `messages/en.json` + `de.json`.
`site-footer.test.tsx` covers the current render.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✦ revelio               BROWSE          BUILD           ABOUT         │
│  A searchable database   Sets            Deck Builder    About         │
│  for the HP Trading      Discover decks  My Decks        Contact       │
│  Card Game.              Random card     Collection      GitHub  ↗     │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────   │
│  Unofficial, non-commercial fan project. Harry Potter, the Harry       │
│  Potter TCG, all card names, artwork and trademarks are the property   │
│  of Warner Bros. Entertainment Inc., Wizards of the Coast, and their   │
│  respective owners. Revelio is not affiliated with or endorsed by them.│
│                                                                        │
│  © 2026 Revelio                                          [EN / DE]  ↑  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Container width:** `max-w-[76rem]` to align with `SiteHeader` (changed from the
  current `max-w-5xl`).
- **Brand block** (col 1): reuse `BrandMark`, plus a one-line tagline.
- **Three link columns** (cols 2–4): BROWSE / BUILD / ABOUT. Each is a
  `<nav aria-label="…">` with a small uppercase heading and a vertical list of links.
- **Legal band:** a top divider (`border-t border-border/60`) then the full existing
  `footer.disclaimer` text, unchanged.
- **Bottom bar:** copyright left; `LanguageSwitcher` + back-to-top button right.

### Responsive behavior

CSS grid:
- Desktop (`lg`): 4 columns — brand + 3 nav columns.
- Tablet (`sm`): brand full-width row, then 3 nav columns.
- Mobile: single stacked column (brand, then each nav group).

Legal band and bottom bar are always full width and stack their inline items on
mobile.

## Link map

| Column | Label | Target | Kind |
|---|---|---|---|
| BROWSE | Sets | `/sets` | internal (locale-aware) |
| | Discover decks | `/decks` | internal |
| | Random card | `/random` | internal |
| BUILD | Deck Builder | `/decks/new` | internal (login-gated downstream) |
| | My Decks | `/decks/mine` | internal |
| | Collection | `/collection` | internal |
| ABOUT | About | `/about` | internal — **404 until page built (accepted)** |
| | Contact | `/contact` | internal — **404 until page built (accepted)** |
| | GitHub ↗ | `process.env.GITHUB_URL` | external, conditional |

- Internal links use the locale-aware `Link` from `@/../i18n/navigation`.
- GitHub uses `<a target="_blank" rel="noopener noreferrer">`, read server-side from
  `GITHUB_URL`. **If `GITHUB_URL` is unset, the GitHub list item is not rendered**
  (no dead external link). Documented in `.env.example`.

## Accessibility & best practices

- Semantic `<footer>`; each link column is a `<nav>` with a descriptive
  `aria-label`; column heading is a visible `<h2>`/`<p>` styled small + uppercase.
- Link contrast: `text-muted-foreground` → `hover:text-foreground`, meeting WCAG AA
  on the dark background (consistent with established dark-theme contrast tokens).
- External GitHub link: `rel="noopener noreferrer"`, `target="_blank"`, an ↗ glyph,
  and an `aria-label` indicating it opens in a new tab.
- Back-to-top: a real `<button>` with an accessible label (small client component
  calling `window.scrollTo({ top: 0, behavior: 'smooth' })`), or an `<a href="#top">`
  fallback. Icon has `aria-hidden`.
- Language switcher: reuse existing `LanguageSwitcher` component.

## i18n

Add keys under `footer` in `messages/en.json` and `messages/de.json`:

- `tagline`
- Column headings: `browse`, `build`, `about`
- Link labels: `sets`, `discoverDecks`, `randomCard`, `deckBuilder`, `myDecks`,
  `collection`, `aboutLink`, `contact`, `github`
- `copyright` — e.g. `"© {year} {brand}"`; `year` is computed server-side at render
  and passed in (avoid `Date` in blocked contexts).
- `backToTop` — accessible label.

Reuse `footer.disclaimer` unchanged. `BRAND_NAME` continues to be injected via the
`brand` param.

## Components

Build with existing shadcn primitives from `src/components/ui/` (shadcn + Radix +
Tailwind v4) — no bespoke elements where a primitive fits.

- **`site-footer.tsx`** — rewritten. Stays a Server Component (reads `GITHUB_URL`
  and computes the year server-side). Uses `useTranslations('footer')`.
- **Links** — render with shadcn `Button` (`variant="link"`, `size="sm"`, `asChild`)
  wrapping the locale-aware `Link` / external `<a>`, matching the header's use of
  `Button asChild`. Keeps focus rings, hover, and sizing consistent.
- **Dividers** — shadcn `Separator` (`src/components/ui/separator.tsx`, add via
  `npx shadcn add separator` if not already present) instead of raw `border-t`.
- **`back-to-top-button.tsx`** — tiny `'use client'` component using shadcn `Button`
  (`variant="ghost"`, `size="icon"`) for smooth scroll to top.
- **`footer-nav.tsx`** (optional small helper) — a column renderer taking a heading
  + list of `{ label, href }`, to keep the footer readable. Optional; inline is
  acceptable if it stays clear.
- Reuse: `BrandMark`, `LanguageSwitcher` (already shadcn `Select`-based), `Link`
  (i18n navigation), `BRAND_NAME`.

## Testing

Extend `site-footer.test.tsx`:
- Renders all three column headings and every internal link with the correct href.
- Disclaimer text still present.
- GitHub item **hidden** when `GITHUB_URL` unset; **shown** with correct href +
  `rel="noopener noreferrer"` + `target="_blank"` when set.
- Copyright renders with the injected year and brand.
- Back-to-top button and language switcher are present with accessible labels.

## Out of scope (future specs)

- `/about` page content.
- `/contact` page with a contact form (form UI + validation + server action +
  email delivery via the existing Nodemailer/react-email mailer + spam protection).
  Footer links to `/contact` now; the page is a separate spec/plan.

## Non-goals

- No changes to header, routing, or the mailer.
- No new external dependencies.

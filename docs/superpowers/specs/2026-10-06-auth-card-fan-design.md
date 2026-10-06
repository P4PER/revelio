# Sign-in and register redesign (card fan) - Design

**Date:** 2026-10-06
**Status:** approved, not implemented
**Workspaces:** `web` only (`components/auth`, `public/auth`, messages)
**Mock:** "B3 - Fan over the form" and "B3 - Phone" in the design study artifact
(https://claude.ai/artifact/95nJi3qhx8VBYbG95kPaMz), with the glow removed

## Problem

`/login` and `/register` are a bare `max-w-sm` column between the site header and footer
(`components/auth/auth-card.tsx`): a heading, a sentence and the form. Nothing on either
page says it belongs to a trading-card site, and the comment on `AuthCard` records that the
plain look was a deliberate first cut ("No card chrome, brand panel, or logo"), not a
decision anyone has defended since.

## Goal

Give both pages the site's identity without turning them into a landing page:

- real cards, the way the home page's constellation already uses them;
- the same centred single column as the home page, so the auth pages do not invent a
  layout nothing else uses;
- no change to the auth flow, its copy, its validation or its tests' behaviour.

## Design

### Layout

One centred column, `max-w-[430px]`, in the existing `<main>`:

1. **The fan** - three cards fanned left to right, decorative.
2. **The form card** (from `sm` up) - `rounded-xl border border-border bg-card p-8`,
   `relative z-10`, pulled up over the lower part of the fan, so the cards read as tucked
   behind it. A soft shadow on its top edge separates it from the cards it overlaps. Below
   `sm` there is no card: see **Phone**.
3. **The cross-link** ("Need an account? Register" / "Already have an account? Sign in"),
   below the card, as today.

Inside the card the heading block is centred: a small uppercase gold tagline, the existing
`h1` (`Sign in` / `Create account`) and the existing subtitle. Everything below it - the
fields, the terms notice, the button, the code step - is the current `AuthForm` markup,
unchanged.

### The fan

`components/auth/auth-card-fan.tsx`, three slots, back to front:

| Slot | Content | Rotation |
|---|---|---|
| left | Wingardium Leviosa! (`bs-111-wingardium-leviosa`) | -14deg |
| middle | Lumos! (`poa-71-lumos`) | -2deg |
| front | the Revelio card: a deep-indigo card, gold border, the wand-and-star mark | 11deg |

Both real cards are upright Charms spells; many cards are stored sideways (all characters,
and e.g. Norbert and Golden Snitch), which reads as a mistake in a fan. The front card is
the brand, not a card from the game, so it never depends on data.

- **Sizes:** cards are 136 x 190 px from `sm` up, with a 150 px fan box; the rest of each
  card sits behind the form card. Below `sm` they are 88 x 123 px and shown whole (see
  **Phone**).
- **Theme:** the real cards are images and look the same in both themes. The Revelio card
  uses the `--dark-*` tokens, which `:root` defines in every theme, so it looks the same on
  both: a face of 45% `--dark-brand-indigo` mixed into `--dark-background`, and a
  `--dark-primary` border. Not plain midnight: on the dark theme that is the page itself,
  and the card's face disappeared into it. Not full brand indigo either, which was too
  bright beside the card art. Its mark is `public/revelio-icon-dark.svg`, the icon for a
  dark background (named like `revelio-logo-dark.svg`): the app-icon badge's glyph
  (`logos/revelio-icon-badge.svg`) without the square, whose parchment wand reads on indigo
  where `revelio-icon.svg`'s indigo wand would vanish. No glow, no gradient.
- **Decorative only:** the fan's container is `aria-hidden`, its images have `alt=""`, it
  takes no pointer events and has no links, and it does not animate.

### Card images

The two card thumbnails are static files in `public/auth/`, as the Discord page's
sample card already is (`public/discord/alohomora-thumb.webp`): the 300 px thumbnails,
copied from the bucket once. The fan is a fixed decoration, so it needs no database read,
no cache, and no fallback for a read that failed. A first cut resolved the images at
request time through `getCardViews` and a day-long `unstable_cache`; that cached the
image's version in its url, and an editor replacing either card's image deletes the old
file, which left a broken image on both pages for up to a day. If a card's art is ever
re-scanned, the copy in `public/` simply stays on the old scan.

A random or daily pick, like the home page's constellation, is out of scope (see below).

### Copy

One new key, `auth.tagline`, in `messages/en.json` and `messages/de.json`:

- en: `Your collection, revealed`
- de: `Deine Sammlung, enthüllt`

Nothing else changes: the button labels stay `Login` / `Register`, and the headings,
subtitles, terms notice, code step and error strings stay as they are.

The form's inline links (the cross-link and the three links in the terms notice) take
the site's inline-link style, `text-primary-ink underline underline-offset-2`, as on the
About page and in the docs, instead of `text-foreground`, which drew them in the body
text's colour.

### Phone

Below `sm` the form card loses its chrome - no border, background, radius, padding or
shadow - and the form sits directly on the page, full width inside the page's own 16 px
gutter. A card on a phone only costs width: it adds a second gutter inside the page's, so
the fields and the terms notice wrap sooner, and its border frames a form that already
fills the screen. With no card edge to tuck behind, the fan is drawn whole and smaller,
above the heading, and does not overlap the form. A 1px `border-border` rule separates the
form from the cross-link below it.

This is a class change on one element (`sm:` prefixes on the card's chrome), not a second
layout: the DOM is the same at every width. At 390 px the register step, the tallest, fits
above the fold (mock "B3 - Phone").

## Out of scope

- The auth flow, its validation, rate limits and server actions.
- A per-day or random choice of fan cards. Most cards are stored sideways, so a pick would
  need an upright-only pool, and it would bring back the database read and the cache that
  static files remove. The home page already rotates cards; a sign-in page gains little
  from it.
- The site header and footer.

## Testing

- `components/auth/__tests__/auth-card-fan.test.tsx`: draws the two `public/auth`
  images in slot order, then the Revelio mark; the container is `aria-hidden`.
- `components/auth/__tests__/auth-card.test.tsx`: still renders the form for each mode, and
  now the fan.
- `components/auth/__tests__/auth-i18n.test.ts`: `tagline` exists in both locales.
- Existing `auth-form` tests stay green unchanged.
- The phone and desktop forms are one DOM, so no test is duplicated per breakpoint; the
  screenshot pass below covers the visual switch.
- `npm run typecheck`, `npm run lint`, and a Playwright screenshot of `/login` and
  `/register` in light and dark, at 1280 and 390 px wide, checked by eye.

## Deployment

Nothing outside the diff: no env var, no migration, no ingest run.

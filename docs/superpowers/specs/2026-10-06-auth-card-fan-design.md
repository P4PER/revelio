# Sign-in and register redesign (card fan) - Design

**Date:** 2026-10-06
**Status:** approved, not implemented
**Workspaces:** `web` only (`components/auth`, `lib/server`, the two auth pages, messages)
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
| front | the Revelio card: a midnight card, gold border, the wand-and-star mark | 11deg |

Both real cards are upright Charms spells; many cards are stored sideways (all characters,
and e.g. Norbert and Golden Snitch), which reads as a mistake in a fan. The front card is
the brand, not a card from the game, so it never depends on data.

- **Sizes:** cards are 136 x 190 px from `sm` up, with a 150 px fan box; the rest of each
  card sits behind the form card. Below `sm` they are 88 x 123 px and shown whole (see
  **Phone**).
- **Theme:** the real cards are images and look the same in both themes. The Revelio card
  uses the `--dark-background` and `--dark-primary` tokens, which `:root` defines in every
  theme, so it stays midnight and gold on the parchment light theme too, like the app icon.
  No glow, no gradient.
- **Decorative only:** the fan's container is `aria-hidden`, its images have `alt=""`, it
  takes no pointer events and has no links, and it does not animate.

### Card images

The pages are server components and already dynamic (they read `searchParams`). Each
resolves the two cards' images through a new server module, `lib/server/auth-fan.ts`:

- `getAuthFanCards()` calls the existing `getCardViews(db, ids)` for the two ids and builds
  `imageUrl(base, thumbKey(id, imageVersion))` with `NEXT_PUBLIC_IMAGE_BASE_URL`: the 300 px
  thumbnail, as everywhere else a card is displayed at this size.
- Wrapped in `unstable_cache` for a day, as `lib/server/showcase.ts` does: the images change
  only with an ingest run.
- **It never fails the page.** A card that is missing, or has no image (`imageVersion`
  null), is left out of the result; a database error is caught and yields an empty list.
  The fan then draws the slots it has; the Revelio card always draws. A sign-in page that
  500s because a decoration could not load would be the wrong trade.

The ids live in that module as a constant, with a comment saying why those two.

### Copy

One new key, `auth.tagline`, in `messages/en.json` and `messages/de.json`:

- en: `Your collection, revealed`
- de: `Deine Sammlung, enthüllt`

Nothing else changes: the button labels stay `Login` / `Register`, and the headings,
subtitles, terms notice, code step and error strings stay as they are.

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
- A per-day or random choice of fan cards. Two fixed cards keep the page stable and the
  query trivially cacheable; rotating them is a later, separate idea.
- The site header and footer.

## Testing

- `lib/server/__tests__/auth-fan.test.ts`: both cards present -> two URLs in slot order;
  a card with a null `imageVersion` -> left out; `getCardViews` throws -> `[]`.
- `components/auth/__tests__/auth-card-fan.test.tsx`: renders one image per card passed plus
  the Revelio card; zero cards -> only the Revelio card; the container is `aria-hidden`.
- `components/auth/__tests__/auth-card.test.tsx`: still renders the form for each mode, and
  now the fan.
- `components/auth/__tests__/auth-i18n.test.ts`: `tagline` exists in both locales.
- Existing `auth-form` tests stay green unchanged.
- The phone and desktop forms are one DOM, so no test is duplicated per breakpoint; the
  screenshot pass below covers the visual switch.
- `npm run typecheck`, `npm run lint`, and a Playwright screenshot of `/login` and
  `/register` in light and dark, at 1280 and 390 px wide, checked by eye.

## Deployment

Nothing outside the diff: no env var, no migration, no ingest run. Both cards and their
images already exist in production.

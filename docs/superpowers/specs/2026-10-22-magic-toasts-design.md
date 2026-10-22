# Magic toasts - design

## Why

Toasts render top-centre, which on desktop puts them over the navbar search, the one control
people are most likely to reach for next. And the toasts themselves are Sonner's stock
`richColors` boxes (filled green/red), which look borrowed next to the gold-on-indigo
Reveal-Glow brand.

## Goals

- Toasts never cover the navbar search.
- Toasts a regular user sees carry the brand: the "Lumos star" style (option B of the
  brainstorm mockups).
- Admin and editor toasts keep their current look; only their position changes.

## Non-goals / anti-goals

- No extra flourish for "big moments" (first deck, Discord linked): one style for all
  user-facing toasts.
- No sound, no particles or effects outside the toast's own box.
- A failure's second line names a fix that works for that failure: sign in again for an
  ended session, reload otherwise - never "check your connection" for an error that is not one.
- Nothing that slows a toast down: it must still read in about a second, and Sonner's
  `aria-live` announcement must keep working.
- An error must never be mistakable for a success because both are gold.

## The look (option B, "Lumos star")

- Surface: the theme's card colour (`--card` / `--card-foreground`), 1px `--border`, a soft
  drop shadow. Same in light and dark via the existing tokens.
- A 3px glowing bar down the left edge: gold (`--primary`) for success, info, warning, loading
  and plain toasts; `--destructive` for errors, with a weaker glow.
- Success icon: the brand's four-point star (lucide `Sparkle`, filled), coloured
  `--primary-ink` (gold in dark, the AA-safe dark gold in light) with a gold drop-shadow glow.
- Error icon in `--destructive`, as the success star is gold: colour and shape both carry it.
- A deletion is neither a win nor a failure, so it gets neither gold nor red: a plain toast on
  the `--muted` surface with a `--muted-foreground` bar, a trash icon and no glow (design D of
  the delete mockups). An Undo button belongs on it once the server can restore a deleted deck;
  until then it has none, since an Undo that cannot undo would promise a deck is safe when it is
  not. Every deletion goes through one helper (`toastRemoved`) so that Undo lands in one place.
- Title semibold, with an optional second line in `--muted-foreground`. A description is added
  only where it says what the title cannot: the deck a deck action touched, how many cards an
  import brought in, and what to do next after an error that blocks the user.
- Entrance: Sonner's own slide, plus the success star twinkling in (scale up from small with
  a slight rotation, ~0.7s, once). Nothing else animates. Under `prefers-reduced-motion` the
  twinkle is off.

## Position

- Top-centre on every viewport, pushed down below the site header so it no longer covers the
  search. Bottom is ruled out because the deck builder docks its sheet handle (deck name +
  count) along a phone's bottom edge. (Bottom-right and top-left were tried on desktop: the
  first went unnoticed, the second sat awkwardly over the deck builder's panes.)
- Applies to every toast, admin included.

## Admin / editor toasts

"Admin" means toasts fired on the admin pages (`/admin/...`) and the card editor
(`/card/<id>/edit`): user roles, bans, deletions, site settings, set forms, image uploads,
card edits. They keep Sonner's `richColors` look.

## Calls made during design (not asked of the user)

- Admin vs user is decided by **route**, not per call site: on an admin/editor path the
  Toaster turns `richColors` on, everywhere else the brand style applies. No call site changes.
- The `Sparkle` success icon is set on the Toaster, so admin success toasts get the star shape
  too (in their green). Sonner does not export its default icon to scope this per toast.

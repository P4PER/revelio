# Discord Hero CTA Implementation Plan

**Goal:** Make the `/discord` hero's install action read as one clear decision. Today the
"Add to Discord" button and the "See what it answers" outline button are both 36px and
of near-equal weight, and the three trust points sit below them as small muted lines
that read as a separate block rather than as reassurance at the click.

**Follows up on:** PR #183 (the hero fold), which set the hero's current layout.

## Decisions

- **One primary action.** The Discord button stays solid Discord blue (round two of the
  mockups tried brand gold, a blue tint and indigo; the blue won) and grows to Button's
  own `lg` (40px) with a 20px mark - not a custom height layered over the primitive. It is not full width and not animated: a pulsing or shimmering button
  keeps pulling the eye from the channel mock beside it, and no other button on the
  site animates. Hover and focus states stay the shadcn defaults.
- **The secondary action is a ghost button**, "See what it answers" with a down arrow,
  at the same `lg` size, so it no longer competes with the button but keeps the shared
  focus ring and hover. Same `#commands` target.
- **On a phone the two take a full-width row each.** From `md` they sit side by side
  once the copy column fits both (a container query, `@md`: German needs ~440px, and
  the column narrows again at `md`); below that they stack at their own width, with
  `-ml-4` pulling the ghost button's label out by its padding so it lines up with the
  button above.
- **The trust points take the /contact topic list's look**: a 36px `bg-muted` tile with
  an 18px `text-primary-ink` icon, the label beside it muted like the tagline above it
  (white labels outranked the tagline, which the trust points should not). Labels only:
  a one-line explanation under each was tried and was too much text for the hero.
  The tile becomes a shared `IconTile` at `components/` root (domain-free), used by
  both pages so the two lists cannot drift apart.
- **Only the hero's button grows.** `GetStarted` passes `size="sm"` on purpose (a
  narrow step column, a long German label), so `DiscordCta` gains a `lg` size instead
  of a new default.

## Tasks

1. `IconTile` in `components/icon-tile.tsx`; switch /contact's topic list to it (no
   visual change).
2. `DiscordCta` takes `size="lg"`, passed through to Button; mark `size-5` on lg.
3. `TrustRow` renders the tiles; the hero passes `size="lg"` and swaps the outline
   button for a ghost one with `ArrowDown`.
4. `npm test -w web`, `npm run typecheck`, `npm run lint`, the discord e2e spec on a
   free port (the fold and offset checks); screenshots of the hero at 1488x1200 and
   390x844 in both themes.

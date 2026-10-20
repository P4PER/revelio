# Discord Hero Fold Implementation Plan

**Goal:** Keep the `/discord` slash menu (the commands section's `#deck-talk` window)
out of the first screen. The hero is as tall as its channel mock (~1086px at desktop
widths), so on a window around 1200px tall the commands section's divider and the top
of its window peek in under the hero.

**Follows up on:** PR #182 (the hero rescale), which set the hero's current height.

## Decisions

- **The hero takes at least one viewport: `min-h-lvh`.** The site header sits above it,
  so the commands section then starts at least a header's height below the fold, with
  no hard-coded header height (the header has none; its height comes from its padding
  and content). `lvh` rather than `svh`, which would let the section's top show once a
  phone's toolbar collapses, or `dvh`, which would resize the hero mid-scroll.
- **Every width, not just `md:`, with `content-center`.** The stacked phone hero is
  already taller than a phone screen. On a tall narrow window it is not, and the
  default `align-content` would share the extra height between the two grid rows,
  opening a ~225px band between the CTAs and the mock at 600x1500; `content-center`
  keeps the rows packed at the grid's gap.
- The hero keeps `items-center`, so on a tall window both columns sit centred in the
  extra height instead of leaving it all below the mock.

## Tasks

1. Test first, in `e2e/discord.spec.ts` (jsdom cannot lay this out): `#commands`
   starts below the viewport at 1488x1200, 2560x1440 and 390x844, and at 600x1500 the
   stacked text column and mock sit 40px apart. Watch them fail.
2. Add `min-h-lvh content-center` to the hero section in `app/[locale]/discord/page.tsx`.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`, the e2e suite on a free port;
   screenshots of the first screen at 1488x1200 and 2560x1440 in both themes.

# Mobile Page Padding Implementation Plan

**Goal:** On phones, every page ends too close to the footer (16px under a card
detail's last row), and the `/discord` hero starts too far under the header (64px).
Give every page one bottom padding that is larger than its top, and pull the hero
pages' first content up on phones.

## Decisions

- **`page-y` becomes asymmetric, not per-page overrides.** Every page wrapper already
  takes its block padding from the one utility in `globals.css`, so the bottom gets
  larger there: 16px top / 48px bottom on phones, 32px / 64px from `md`. Content then
  ends with a clear gap before the footer's border, the same on every page.
- **Centred pages keep even padding from `sm`.** Login and contact centre their
  content in the viewport from `sm` up, so uneven padding would lift it off-centre;
  they take a `page-y-centered` sibling, the same as `page-y` on phones.
- **The hero pages move together.** `/about` and `/discord` share `pt-16 sm:pt-20`, and
  `e2e/discord.spec.ts` asserts both heroes start at the same offset under the header.
  Both go to `pt-8 sm:pt-20`, so the phone offset halves and from `sm` nothing changes.

## Tasks

1. `globals.css`: split `page-y` into `padding-top` / `padding-bottom` (4/12, md 8/16)
   and update its comment.
2. `app/[locale]/discord/page.tsx` and `app/[locale]/about/page.tsx`: `pt-16` -> `pt-8`.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`, the discord e2e spec on a
   free port; phone screenshots of a card detail and `/discord`.

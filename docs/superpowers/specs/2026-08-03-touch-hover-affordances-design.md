# Touch-accessible hover affordances

**Date:** 2026-08-03
**Status:** Design approved, pending spec review

## Problem

Several controls across the web app are hidden until hover, using the idiom
`opacity-0 … group-hover:opacity-100` (usually with a `focus-visible` /
`group-focus-within` fallback for keyboards). Touch devices have no hover, so on
phones/tablets these controls are invisible — and while some remain tappable,
users have no way to discover or reliably hit them.

The collection page has a related but distinct problem: its per-card quantity
steppers can be laid out as an **overlay** (hover-revealed, on the image) or a
**panel** (always visible, under the card). Overlay depends on hover, so on touch
the steppers are effectively unusable, and the panel/overlay selector is
meaningless.

## Goal

On touch devices (no hover capability):

1. Every hover-revealed control is reachable without hover.
2. The collection page always uses the **panel** (under-card) stepper layout and
   hides the panel/overlay selector entirely — the saved cookie preference is
   ignored on touch but not overwritten (a later desktop visit still honors it).

## Mechanism — two tools, by case

The correct primitive for hover-only affordances is the CSS media feature
`@media (hover: hover)` / `(hover: none)`. Using CSS where the difference is
**presentational** (show / hide / restyle) and JS only where it is **structural**
(a different DOM tree chosen at render time) is the best-practice split:

- CSS works during SSR with **no hydration flash, no layout shift**, and doesn't
  force components client-side.
- JS hover detection can't run on the server, so a hook-everywhere approach makes
  every touch user watch controls pop in after hydration — strictly worse for the
  same visual result.

### Tool 1 — a shared `touch:` Tailwind variant (all presentational reveals)

`globals.css` already defines custom variants (`@custom-variant dark …`). Add:

```css
@custom-variant touch (@media (hover: none));
```

Then each hover-revealed control gains `touch:opacity-100` (and
`touch:pointer-events-auto` where a wrapping element sets `pointer-events-none`).
On hover devices `(hover: none)` never matches, so existing hover behavior is
untouched; on touch devices the control is simply always visible.

**Ordering note (Tailwind v4).** The base `opacity-0` and `touch:opacity-100`
are the only rules that can both apply on a touch device; base utilities are
emitted before variant utilities, and media queries add no specificity, so
`touch:opacity-100` wins by source order. `group-hover:opacity-100` is wrapped in
`@media (hover: hover)` (v4 default) and thus never coexists with the `touch:`
rule on the same device — no conflict. Tailwind v4 has known variant-ordering
pitfalls, so verify visually on a touch viewport (or `(hover: none)` emulation)
during implementation rather than assuming the cascade.

Sites (presentational reveals):

| File | Line | Control | Change |
|---|---|---|---|
| `deck-card-browser.tsx` | 216 | hover scrim behind Add | leave hover-only — always-on would dim the whole browse grid on touch; the Add button's own shadow keeps it legible |
| `deck-card-browser.tsx` | 227 | **"Add to deck"** button | `touch:opacity-100` |
| `deck-card-browser.tsx` | 253 | info button | `touch:opacity-100` |
| `deck-panel.tsx` | 121 | card info button | `touch:opacity-100` |
| `deck-gallery.tsx` | 45 | card info button | `touch:opacity-100` |
| `card-rotate.tsx` | 92 | rotate button | `touch:opacity-100` |

### Tool 1b — uploaders (presentational, but the reveal is a full-image scrim)

`image-uploader.tsx:112` and `set-symbol-uploader.tsx:124` reveal a **full-image
dark overlay** ("Change image"). Always-showing that scrim on touch permanently
darkens the preview. Instead:

- Suppress the full dark scrim on touch: add `touch:hidden` to the existing
  overlay (keep its `group-hover` / `dragOver` behavior for hover devices).
- Add a small **persistent corner affordance** shown only on touch: a rounded
  icon button (`ImagePlus`) in a corner, `hidden touch:flex`, `bg-black/60`
  style, labeled for screen readers. It signals "tap to change" without hiding
  the image. Both uploaders' whole tile is already the tap target, so the corner
  button is an affordance hint, not a separate handler.

### Tool 2 — `useHasHover()` hook (the one structural case: collection tile)

The collection tile renders **different DOM** for panel vs overlay (panel: outer
card border + steppers in normal flow under the image; overlay: figure border +
absolutely-positioned steppers over the image). CSS can't switch DOM trees, so
this needs JS.

New hook `web/src/hooks/use-has-hover.ts`, mirroring the existing `useIsMac()` in
`components/ui/kbd-hint.tsx`:

```ts
'use client'
import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

// Whether the primary input can hover (mouse/trackpad). Server snapshot assumes
// yes (desktop) and the client corrects after hydration with no mismatch warning.
// Used to force touch-friendly layouts where a hover affordance is unusable.
export function useHasHover() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.matchMedia('(hover: hover)').matches,
    () => true,
  )
}
```

Rationale for the `useSyncExternalStore` + noop-subscribe + `true` server
snapshot: it is the pattern already proven in `kbd-hint.tsx`, hover capability
does not meaningfully change at runtime, and assuming desktop keeps the common
SSR case flash-free. The only flash is a touch user whose saved preference is
overlay seeing one frame before it snaps to panel — acceptable and owner-only.

`collection-view.tsx` changes:

- `const hasHover = useHasHover()`
- `const effectiveLayout = hasHover ? layout : 'panel'` → passed to every
  `CollectionCardTile` instead of `layout`.
- Selector wrapper gate becomes `{editable && hasHover && ( … )}`.

`collection-card-tile.tsx`, the cookie, and `collection-prefs.ts` are unchanged.
`collection-card-tile.tsx:75` (the overlay stepper reveal) needs **no** `touch:`
variant because on touch the overlay branch is never rendered.

## Placement & reuse

- The **`touch:` variant** is the broadly-reused piece (≈7 sites).
- The **hook** has a single consumer today (the collection) but lives in a shared
  `hooks/` location and is the sanctioned tool for any future structural
  hover/touch branch.

## Localization

The new uploader corner buttons need accessible labels. Reuse existing
`changeImage` / equivalent keys where present; if a new key is required, add it to
both `messages/en.json` and `messages/de.json` (never hardcode).

## Testing

- Typecheck + lint (web) must pass.
- Manual/visual check on a touch viewport (or `(hover: none)` emulation): Add /
  info / rotate buttons visible; collection uses panel layout and the selector is
  gone; uploaders show the corner button and not the full scrim.
- Confirm hover-device behavior is unchanged (controls still hidden until hover;
  collection selector still present and functional).
- If any existing component tests assert on these controls' visibility, update
  them; otherwise no new unit tests are warranted for CSS-only reveals.

## Out of scope

- Runtime hover-capability changes (e.g. attaching a mouse to a tablet mid-session)
  — matches the existing `useIsMac` limitation.
- Any redesign of the stepper layouts themselves.

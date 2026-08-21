# Appearance Theme Swatches — Design

**Date:** 2026-08-21
**Area:** `app/web` — `/settings/appearance`
**Status:** approved (direction B of three demoed)

## Problem

Two defects, one cosmetic and one substantive.

**1. The pane is the odd one out.** `ProfilePane`, `EmailPane`, `DataPane` and `DangerPane` each
render a `<section aria-labelledby="s-*">` wearing the shared card chrome
(`rounded-xl border border-border bg-card p-5`), with an `<h2 id>` and a
`mt-1 mb-5 text-sm text-muted-foreground` lead. `AppearanceForm` renders a bare `<section>` with
no card, no `id` on its `<h2>` and no `aria-labelledby`. Its heading sits directly on the page
ground while every sibling is boxed, so the pane reads as a different page — and it is the only
settings section that is not exposed as a named `region` to assistive tech.

**2. The one screen about how Revelio looks shows nothing.** The theme choice is three radio rows
whose captions promise "warm parchment" and "midnight and gold", and neither is anywhere on
screen. Choosing means picking a word, reloading the page, and deciding whether you liked it.

## Decision

Adopt the shared card chrome, and replace the radio rows with three selectable tiles, each
carrying a miniature of Revelio painted in that theme's own colours.

Two alternatives were demoed and rejected:

- **House style only** — card chrome, radio rows untouched. Fixes defect 1, leaves defect 2.
- **One large live preview** — a segmented control over a single wide panel. Bigger, but only
  the selected theme is ever on screen, so choosing stops being comparing; and "System" has no
  honest picture, since the panel can only show whichever the device currently is.

## The miniature

The miniature is a **card grid on a ground**, not generic browser chrome: a header strip with the
gold mark and a search field, three portrait cards with lesson-tinted art, and the gold primary
button. That is the screen a Revelio user actually looks at, so it is the honest sample.

The grid is **two rows of four**, cycling the five lesson tints. Three across read as three big
colour tiles rather than as a search grid; four across gives the density the real page has, and
eight cards is what fits two whole rows, so nothing is clipped by the bottom edge. Because the
grid then fills the box, the gold primary sits in the header strip rather than floating over the
last row.

Each tint is set at **5:7, the proportion of a real HP TCG card**, so the colour block reads as a
card rather than as a swatch; a landscape block reads as a paint chip and loses the connection to
the product. It stays inset inside the card's padding rather than bled to the edge, so the card
surface (parchment or midnight) frames it and is what actually carries the theme — a full-bleed
tint turns the miniature into a colour-chip row and buries the thing being chosen.

**The tints stay at full saturation.** Muting them was tried and rejected: in light they go
pastel, which reads as a faded *different* theme, and the swatch's whole job is to show what the
app actually looks like. Dropping colour entirely was also tried — it turns the tile into a
generic theme picker with nothing Revelio about it, and in dark the neutral cards sink into the
ground. The tints only read as too loud when the cards are too big, so the fix was the grid, not
the palette.

**System splits on a diagonal:** parchment above the anti-diagonal, midnight below, with a
brand-gold seam on the cut. "Follow your device setting" genuinely means both, and the seam says
it faster than the caption does. The seam is `#E8B23A` (`--dark-primary`, the Reveal-Glow brand
gold) because it belongs to neither half.

## Fixed palette (the load-bearing constraint)

The preview must **not** follow the live theme. A light swatch has to stay light while the page is
dark, or all three tiles render identically and the feature is pointless.

`globals.css` already declares every hex exactly once, as `--light-*` and `--dark-*` value sets on
`:root` that the theme alias blocks point at. Those raw sets are unconditional and never
reassigned, so reading them directly — `var(--light-card)`, `var(--dark-border)` — yields a
palette that is fixed by construction. No new CSS, no duplicated hexes, and the previews follow
any future palette edit for free.

The preview maps them onto a local `--p-*` set via an inline `style`, matching how `deck-art.tsx`
already composes `var()` values inline.

## Interaction and accessibility

- Still a `RadioGroup` / `RadioGroupItem`, still `Label`-wraps-the-tile. Arrow keys move between
  options, the whole tile is the click target, focus ring is the primitive's.
- **Selection reads twice:** the tile border and ring go `--primary`, and the radio dot fills.
  The demo used a check badge; the shipped control keeps the shadcn radio dot, which is the
  library default, already carries `data-[state=checked]:text-primary-ink`, and matches the radio
  styling used elsewhere in settings.
- The miniature is decorative — `aria-hidden`, so each radio's accessible name stays exactly the
  option name plus its hint ("Dark Midnight and gold").
- The section becomes a named `region`, matching its four siblings.
- Three columns from `sm` up, one column below; the tile stays a full-width row on phones.

## Out of scope

- No new copy. `settings.appearance` in `en.json` and `de.json` already carries every string, and
  the key set matches across both.
- No change to the save path: optimistic `<html>` paint, cookie write via `setTheme`, rollback and
  toast on failure all stay as they are.
- No change to the other four panes, the settings nav, or the theme tokens themselves.

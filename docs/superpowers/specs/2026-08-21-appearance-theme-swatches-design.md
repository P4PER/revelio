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
gold mark, a search field and nav links, over a grid of portrait cards with lesson-tinted art.
That is the screen a Revelio user actually looks at, so it is the honest sample.

The strip is proportioned off the real header measured at 1280px: mark at 4.4% and 9.4% wide, the
search field starting at 15.1% and running 35%, then five nav links out to 95.6%. **The mark is
the only gold up there** - the real Revelio header carries no primary button, so the miniature
does not invent one, and nothing else in the strip is tinted.

The grid is **two rows of four**, cycling the five lesson tints. Three across read as three big
colour tiles rather than as a search grid; four across gives the density the real page has, and
eight cards is what fits two whole rows, so nothing is clipped by the bottom edge.

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
  options and the whole tile is the click target.
- **The radio dot is `sr-only`, not dropped.** It stays the focusable, checkable control, so the
  roving tabindex, the accessible name and form semantics are all the primitive's. A visible dot
  next to a tile that is already a picture of the theme was redundant chrome; the demo's check
  badge was rejected for the same reason.
- **Selection is therefore the tile border alone**, which makes its colour load-bearing. It uses
  `--secondary-ink` - the token `deck-list`, `deck-hero-card` and `set-card` already use to
  emphasise a card border, which is the same shape this is. Three reasons it is not `--primary`:

  1. **Contrast.** In light, `--primary` is `#F0C458`: 1.6:1 on the card and 1.1:1 against a
     neighbouring tile's border, under the 3:1 WCAG 1.4.11 asks of a state indicator.
     `--secondary-ink` measures 10.1:1 light and 3.6:1 dark against the card.
  2. **Gold is inside the picture.** The miniature already paints gold - the header mark, the
     quidditch tint - so a gold frame competes with the swatch it is framing. Indigo appears
     nowhere in the miniature, so it reads unambiguously as chrome.
  3. **Focus is gold.** `--ring` is `#F0C458`/`#E8B23A`, gold in *both* themes. A gold selected
     border would say "selected" in the same colour the outline says "focused", on one box.

  `--primary-ink` was the first fix and clears the contrast bar too (5.7:1 / 8.8:1), but loses on
  points 2 and 3.
- The tile styles off the primitive's own `data-state` via `has-data-[state=checked]:`, so there
  is no second copy of the selection state to keep in sync.
- **Focus moves to the tile as an `outline`**, not a ring: the selected state already owns the
  ring, and two rings on one box fight. The sr-only dot cannot show a focus ring of its own.
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

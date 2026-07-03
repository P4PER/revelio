# Revelio – Logo & Brand Guide

**Name:** the product/brand is **Revelio**; **revelio.cards** is its domain. The logo
wordmark reads **revelio** (the `.cards` suffix is no longer part of the mark).

Concept: **Reveal-Glow.** The charm *Revelio* reveals what's hidden – so gold (the
revealing light) is the primary color and indigo/midnight is the hidden. The mark is a
wand with a spark.

---

## Typography

| Property | Value |
|---|---|
| Typeface | **Poppins** |
| Weight | SemiBold (600) |
| Font size (master SVG) | 54 px (at 180 px logo height) |
| Letter-spacing | −1 px |
| Casing | all lowercase: `revelio` |

Note: in the delivered SVG files the wordmark is already converted to **paths** – so
the logos render identically everywhere, even without Poppins installed. For other
text (website, headings) Poppins is the recommended house font (e.g. via Google Fonts).

---

## Colors

### Gold (primary – "the reveal")

| Color | Hex | Usage |
|---|---|---|
| Gold | `#E8B23A` | star, sparks, grip band (dark) |
| Gold dark | `#C8881E` | grip band (light logo) |
| Gold light | `#F6D58B` | inner star glow (light logo) |

### Indigo / midnight ("the hidden")

| Color | Hex | Usage |
|---|---|---|
| Indigo | `#3B3194` | wand (light logo) |
| Indigo light | `#6E66C9` | wand (dark logo) |
| Ink | `#1C1838` | wordmark "revelio" (light logo) |
| Midnight | `#13122A` | background of dark logo |
| Badge background | `#181634` | app-icon badge |

### Light / accent

| Color | Hex | Usage |
|---|---|---|
| Parchment | `#FBF3DC` | "revelio" (dark), inner star glow (dark), wand (badge) |
| White | `#FFFFFF` | inner star glow (badge) |
| Badge gold | `#F4C04A` | star in the app-icon badge |

---

## Construction (master SVG, 180 px height)

- Mark (wand + star) on the left, wordmark on the right, on one line.
- Gap between mark and wordmark: **15 px**.
- Mark position: `translate(12, 42)`; wordmark start: `x = 109`, baseline `y = 108`.
- The small spark at the lower right sits as "magic dust" in the gap between the star
  and the text.

---

## Files in the `logos/` folder

| File | Purpose |
|---|---|
| `revelio-logo-primary.svg` | Main logo, light background (vector) |
| `revelio-logo-dark.svg` | Logo for dark backgrounds (vector) |
| `revelio-icon.svg` | Mark only, transparent |
| `revelio-icon-badge.svg` | App icon with badge |
| `revelio-logo-primary-1200.png` | Main logo, 1200 px wide |
| `revelio-logo-dark-1200.png` | Dark logo, 1200 px wide |
| `revelio-icon-512/192/32/16.png` | Icon in several sizes |
| `revelio-icon-badge-512/192/180.png` | App icon (180 = Apple touch) |
| `favicon.ico` | Favicon (16/32/48 combined) |

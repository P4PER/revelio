# Light mode — design

**Date:** 2026-08-17
**Status:** Approved (brainstorm), pending implementation plan
**Area:** `app/web` (theme tokens, root layout, settings, ~15 components)

## Summary

Add a second colour theme to the web app: a **warm parchment** light palette alongside the
existing "Reveal-Glow" dark one.

Which theme a visitor sees is decided in this order:

1. An **explicit choice**, stored in the `revelio.theme` cookie (`light` | `dark`).
2. Otherwise the **OS setting**, via `prefers-color-scheme`.

The explicit choice is made on a new **`/settings/appearance`** page (System / Light / Dark),
which is the only settings section reachable without an account. There is no header toggle.

Theme resolution is server-rendered from the cookie and falls back to a pure CSS media query,
so there is **no flash of the wrong theme and no blocking inline script**.

## Goals / non-goals

**Goals**
- A light palette that reads as the same product, not a generic white theme.
- OS-driven by default; a remembered manual override.
- No theme flash on first paint, in either direction, with or without JS.
- Every existing `dark:` utility keeps working unchanged.
- Every **light-mode** colour pair meets WCAG AA for text. (Dark mode is carried over as-is;
  see "Pre-existing contrast gaps" below.)

**Non-goals**
- A header theme toggle (deliberately declined; settings page only).
- Per-account theme sync across devices — the cookie is per-browser. Theme is a device
  preference, not account data.
- Theming the OG images, the deck PNG export, or the transactional emails. Those render on
  the server to a fixed surface and stay dark permanently.
- A third theme, or user-customisable palettes.
- Changing any component's layout. This is a colour change only.

## Decisions taken during the brainstorm

These were settled by reviewing live renderings, and are inputs to the plan rather than open
questions:

| Decision | Outcome |
|---|---|
| Trigger | OS default + remembered manual override |
| Palette direction | Warm parchment (over clean neutral and cool indigo-tinted) |
| Light primary | `#F0C458` — the palest gold candidate |
| Button rim | **No rim.** Light mode matches dark's borderless treatment |
| Control placement | `/settings/appearance` only; no header control |

The rim was considered because `#F0C458` on `#FBF6EA` is only 1.53:1, so the button's edge is
weakly delineated against the page (WCAG 1.4.11 suggests 3:1 for control boundaries). It was
declined for visual consistency with dark mode, where the same gold sits at 9.5:1 against
midnight and needs no help. The control is still identified by its label at 10.30:1 and by a
drop shadow. **This is an accepted, deliberate trade-off, recorded here so it is not
"discovered" and silently reverted later.**

## Palette

Dark values are unchanged from what ships today. `destructive` is currently an `oklch()`
literal; it becomes a hex for consistency with every other token (same rendered colour).

| Token | Light (parchment) | Dark (current) |
|---|---|---|
| `background` | `#FBF6EA` | `#13122A` |
| `foreground` | `#1C1838` | `#FBF3DC` |
| `card`, `popover` | `#FFFDF7` | `#1C1838` |
| `card-foreground`, `popover-foreground` | `#1C1838` | `#FBF3DC` |
| `primary` | `#F0C458` | `#E8B23A` |
| `primary-foreground` | `#1C1838` | `#13122A` |
| `secondary` | `#3B3194` | `#3B3194` |
| `secondary-foreground` | `#FBF3DC` | `#FBF3DC` |
| `muted` | `#F1E9D6` | `#252246` |
| `muted-foreground` | `#5B5478` | `#C5BAA0` |
| `accent` | `#E7E0F7` | `#6E66C9` |
| `accent-foreground` | `#1C1838` | `#FBF3DC` |
| `destructive` | `#B3261E` | `#F26D6D` |
| `border` | `#E4D9C0` | `#2E2A50` |
| `input` | `#D8CBAA` | `#403A6E` |
| `input-fill` | `#FFFDF7` | `#201C3E` |
| `ring` | `#F0C458` | `#E8B23A` |
| `sidebar` | `#FFFDF7` | `#1C1838` |
| `sidebar-foreground` | `#1C1838` | `#FBF3DC` |
| `sidebar-primary` | `#F0C458` | `#E8B23A` |
| `sidebar-primary-foreground` | `#1C1838` | `#13122A` |
| `sidebar-accent` | `#F1E9D6` | `#252246` |
| `sidebar-accent-foreground` | `#1C1838` | `#FBF3DC` |
| `sidebar-border` | `#E4D9C0` | `#2E2A50` |
| `sidebar-ring` | `#F0C458` | `#E8B23A` |
| `chart-1`…`chart-5` | `#B8801C`, `#5B4FC0`, `#3B3194`, `#2E9455`, `#3F6FD8` | `#E8B23A`, `#6E66C9`, `#3B3194`, `#5CB878`, `#5B8DEF` |

Chart colours are graphical fills, so the relevant threshold is 3:1, not 4.5:1. Against the
light page they measure 3.17 / 5.86 / 9.49 / 3.55 / 4.35 — all clear it. (`chart-1` is
`#B8801C` rather than the brand `#C8881E`, which lands at 2.78 and would just miss.)

Measured contrast in light mode: body text 15.74:1, muted text 6.53:1 (6.92:1 on `card`),
primary button label 10.30:1, accent-hover label 13.26:1, destructive text 6.06:1, secondary
button label 9.23:1. All light lesson colours land between 4.82:1 and 6.97:1. Every
light-mode pair clears AA.

### Pre-existing contrast gaps in dark mode (found while measuring, out of scope)

Measuring the palette turned up three failures that exist **today**, unrelated to this change:

| Pair (dark mode, shipping today) | Ratio | AA needs |
|---|---|---|
| `lesson-charms` `#0069A9` on `background` | 3.13:1 | 4.5:1 |
| `lesson-care_of_magical_creatures` `#836444` on `background` | 3.37:1 | 4.5:1 |
| `lesson-transfiguration` `#BC3E4D` on `background` | 3.43:1 | 4.5:1 |
| `accent-foreground` on `accent` | 4.30:1 | 4.5:1 |

The lesson colours are the WotC card-frame colours, so changing them is a brand decision, not a
mechanical fix. **Deliberately not addressed here** — fixing them would mean shipping a visible
change to dark mode under a "add light mode" banner. Recorded so the contrast test added below
asserts AA for light mode only, with these four pairs explicitly listed as known exceptions
rather than silently skipped.

### `accent` changes role between themes

This is the one token whose *meaning* differs per theme, and it drives several downstream
fixes:

- **Dark:** a saturated indigo (`#6E66C9`) used as a hover fill and as a foreground colour.
- **Light:** a pale wash (`#E7E0F7`) with ink text, following the shadcn light convention.

A saturated accent with white text is illegible as a light-mode hover; a pale wash with ink
text is correct. Consequently any component that used `accent` as a *saturated* colour
(`text-accent`, gradient stops) needs its own token — see the sweep below.

### New token: `--hover-bg`

Dark mode dilutes the saturated accent for hover (`dark:hover:bg-accent/50`); light mode needs
it at full strength, because a pale wash at 40% opacity is indistinguishable from the page
(measured `#F4EFF0` against a `#FBF6EA` page). Rather than scatter per-theme opacity modifiers,
a single token carries it:

```css
/* dark  */ --hover-bg: color-mix(in srgb, var(--accent) 40%, transparent);
/* light */ --hover-bg: var(--accent);
```

### Lesson colours

The five lesson colours are currently fixed values in `@theme inline`. Three of them fail
contrast on a light background, so they become per-theme:

| Lesson | Light | Dark (current) |
|---|---|---|
| Care of Magical Creatures | `#6B4F35` | `#836444` |
| Charms | `#005A90` | `#0069A9` |
| Potions | `#00784A` | `#00A661` |
| Transfiguration | `#A32F3D` | `#BC3E4D` |
| Quidditch | `#8F6510` | `#E2AE37` |

They keep their `--color-lesson-*` names (so `text-lesson-charms` etc. still work) but resolve
through a per-theme variable rather than a literal.

## Theme resolution

### Cookie

```ts
// src/lib/theme.ts — plain module, no 'use client', so Server Components can read it
export const THEME_COOKIE = 'revelio.theme'
export type ThemeChoice = 'system' | 'light' | 'dark'
export function parseTheme(value: string | undefined): ThemeChoice
```

This mirrors `src/lib/collection-prefs.ts` exactly, including the reason that module carries a
comment: a `'use client'` export becomes a client reference on the server and silently breaks
`cookies().get(...)`. Cookie name follows the established `revelio.` prefix
(`revelio.locale`, `revelio.collection-stepper`).

`system` is represented by the **absence** of the cookie, not by the string `"system"` — that
way the CSS media-query fallback is the natural default and there is one less state to encode.

### Root layout

`src/app/[locale]/layout.tsx` already calls `getSession()`, so it is dynamic and reading a
cookie costs nothing. The hardcoded `className="dark"` on `<html>` is replaced by:

```tsx
const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
<html lang={locale} className={poppins.variable}
      data-theme={theme === 'system' ? undefined : theme}>
```

No attribute is emitted for `system`.

### CSS structure

Hex values are declared **once** per theme as namespaced sets, then aliased. This avoids the
current duplication (`:root` and `.dark` today hold two identical copies of the dark palette,
which can drift silently).

```css
:root {
  /* value sets — the only place a hex appears */
  --light-background: #FBF6EA;  --dark-background: #13122A;
  /* ...one pair per token... */

  /* default alias: light */
  --background: var(--light-background);
  /* ... */
}

/* no explicit choice -> follow the OS */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --background: var(--dark-background);
    /* ... */
  }
}

/* explicit choice wins over the OS, in both directions */
:root[data-theme='dark'] {
  --background: var(--dark-background);
  /* ... */
}
```

The two dark alias blocks are identical and cannot be merged (one is inside a media query).
A test asserts they stay in sync — see Testing.

### Tailwind `dark:` variant

The current `@custom-variant dark (&:is(.dark *))` no longer matches, since `.dark` is gone.
It must fire on both dark paths so the 17 existing `dark:` utilities keep working:

```css
@custom-variant dark {
  &:where([data-theme='dark'], [data-theme='dark'] *) { @slot }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme='light']), :root:not([data-theme='light']) *) { @slot }
  }
}
```

### No-flash guarantee

- **Cookie present:** the server emits `data-theme`, correct on first paint.
- **Cookie absent:** no attribute; the media query resolves before first paint.

Either way the first painted frame is correct, with no blocking inline script and no JS
requirement. This is the main reason for choosing cookie + media query over a
`localStorage` + inline-script approach.

### `theme-color` meta

`viewport.themeColor` is currently the single `THEME_COLOR` constant from `src/lib/seo.ts`.
It becomes a `generateViewport()` that emits the cookie's colour when set, and otherwise a
media-query pair so the browser chrome matches:

```ts
[{ media: '(prefers-color-scheme: light)', color: '#FBF6EA' },
 { media: '(prefers-color-scheme: dark)',  color: '#13122A' }]
```

## The control: `/settings/appearance`

A new settings section, and **the only one not behind `requireSettingsUser`** — theme is a
device preference, so gating it would leave signed-out visitors unable to override their OS
setting.

- **UI:** a shadcn `RadioGroup` with System / Light / Dark, each with a one-line description.
- **Behaviour:** on change, set `document.documentElement.dataset.theme` immediately (instant
  feedback, no reload), then persist via a `'use server'` action in
  `src/lib/theme-actions.ts` which writes the cookie (or deletes it for System).
- **`SettingsNav`:** currently a fixed `SECTIONS` array of four gated sections. It gains
  `appearance`, and must render **only** `appearance` for signed-out visitors — otherwise the
  nav would show links that bounce to `/login`. This makes `SettingsNav` session-aware; it is
  a client component, so the flag is passed down from the layout.
- **`SettingsLayout`:** the layout itself is not gated (each page gates itself), so it needs no
  change beyond passing that flag.
- **Discovery when signed out:** a link in `SiteFooter`, since there is no header control.
- **Strings:** `settings.appearance.*` in `messages/en.json` and `messages/de.json`.

## Component sweep

The app is almost entirely token-driven, so this list is short and specific.

### Must change

| File | Issue | Fix |
|---|---|---|
| `components/brand-mark.tsx` | hardcoded `/revelio-logo-dark.svg` | render both variants, hide one with `dark:` — CSS-only, so it works under the media query without JS |
| `components/star-field.tsx` | `COLORS` hex array, invisible on parchment | per-theme `--star-*` tokens |
| `components/error-card-state.tsx` | `text-accent` + hex; accent is a pale wash in light | switch to `text-secondary`; move hexes to tokens |
| `components/quick-filters.tsx:39` | `hover:bg-white/5` — invisible on light | `hover:bg-(--hover-bg) hover:text-accent-foreground` |
| `components/lesson-filter.tsx:38` | `hover:bg-white/5` — same | same |
| `components/lesson-curve.tsx:29` | `from-accent to-secondary` bar washes out | chart tokens (`--chart-*` already exist) |
| `components/collection-sidebar.tsx:37` | `from-accent/25 to-accent/10` on a pale accent is invisible | raise the stops or use `--hover-bg` |
| `components/settings/settings-nav.tsx:33` | same gradient pattern | same |
| `components/contact-form.tsx` | hardcoded hex | tokens |
| `lib/seo.ts` | single `THEME_COLOR` | export both, feed `generateViewport` |

### Deliberately unchanged

These use `text-white` / `bg-black/nn` **over card art or a modal scrim**, not over the page
background. They are theme-independent and correct in both themes. Listing them so the sweep
does not "fix" them:

`card-nav.tsx` (image scrims, and the `Kbd` on its scrim), `deck-hero-card.tsx`,
`deck-header.tsx` (banner overlay), `deck-gallery.tsx`, `card-rotate.tsx`,
`image-uploader.tsx`, `set-symbol-uploader.tsx`, `add-to-collection.tsx`,
`deck-card-browser.tsx`, `lesson-cost.tsx` (white on a lesson-coloured pill),
`ui/alert-dialog.tsx` + `ui/sheet.tsx` (`bg-black/50` modal overlays),
`ui/button.tsx` + `ui/badge.tsx` (`text-white` on `destructive`).

Also unchanged: `lib/og-image.tsx`, `lib/deck-png.ts`, `lib/email/*` — fixed-surface server
rendering, per non-goals.

## Testing

- **Token parity (vitest):** parse `globals.css`; assert the light alias block, the media-query
  dark block, and the `[data-theme='dark']` block all define the same token names, and that
  every `--light-*` has a `--dark-*` counterpart. This is the guard against a token being added
  to one theme only, and against the two dark blocks drifting.
- **Lesson colours (vitest):** extend the existing guard in `components/__tests__/theme.test.tsx`
  to cover both themes' values.
- **Cookie parsing (vitest):** `parseTheme` for `light` / `dark` / `undefined` / junk.
- **Contrast (vitest):** compute WCAG ratios for the pairs that matter (foreground/background,
  muted-foreground/background, primary-foreground/primary, accent-foreground/accent) and assert
  AA. Cheap, and it pins the palette against well-meaning tweaks.
- **e2e (Playwright):** three cases — cookie `light` renders the parchment background; cookie
  `dark` renders midnight; **no cookie** under `emulateMedia({ colorScheme: 'light' })` renders
  parchment, which is the case a cookie-only test would miss.
- **e2e (Playwright):** changing the radio on `/settings/appearance` updates the page without a
  reload and survives a reload; the page is reachable signed-out.

## Risks

- **The two dark alias blocks are duplicated.** Mitigated by the parity test; there is no
  CSS-level way to share a declaration block across a media-query boundary.
- **`accent` flipping role** is the subtlest part of this change. Any *future* component using
  `text-accent` will be wrong in light mode. The sweep fixes today's single occurrence; a lint
  rule is possible but is deferred as YAGNI.
- **Light-mode primary sits at 1.53:1 against the page** (see Decisions). Accepted.
- **Card images are light, warm scans.** On parchment they have less separation than on
  midnight. Mitigated by tiles using `card` (`#FFFDF7`) plus a border and shadow, which is how
  the reviewed renderings looked.

## Files

**New:** `src/lib/theme.ts`, `src/lib/theme-actions.ts`,
`src/app/[locale]/settings/appearance/page.tsx`, `src/components/settings/appearance-form.tsx`

**Changed:** `src/app/globals.css` (the bulk), `src/app/[locale]/layout.tsx`,
`src/lib/seo.ts`, `src/components/settings/settings-nav.tsx`, `src/components/site-footer.tsx`,
`messages/en.json`, `messages/de.json`, plus the ten components in the sweep table.

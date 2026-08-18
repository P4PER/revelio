# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a warm-parchment light theme to `app/web`, chosen by the OS setting and overridable on a new `/settings/appearance` page, with no flash of the wrong theme.

**Architecture:** All colours already flow through CSS custom properties. Hex values are declared once per theme as `--light-*` / `--dark-*` sets, then aliased into the real token names by three selectors: `:root` (light default), a `prefers-color-scheme: dark` media block (OS-driven), and `:root[data-theme='dark']` (explicit override). The root layout — already dynamic, because it calls `getSession()` — reads the `revelio.theme` cookie and stamps `data-theme` on `<html>`, or omits it to mean "follow the OS". No inline script, no `next-themes`, no client-side theme state.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme inline` + `@custom-variant`), next-intl, shadcn/Radix, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-light-mode-design.md`

## Status: complete, with post-review changes

All ten tasks were executed on `feat/light-mode`. The task bodies below are kept as the
**historical record of what was planned**; five follow-up commits then changed the palette and
fixed defects that only surfaced once the theme was rendered. Where the two disagree, **the
spec is authoritative** — it has been synced to the shipped code.

| Commit | Change | Why it was not in the plan |
|---|---|---|
| `6ed3996` | error card keeps its heavy shadow behind `dark:` | Task 6's token swap shifted dark; the plan's own "dark must stay pixel-identical" constraint won |
| `9a5d3a1` | Profile listed before Appearance; theme rows are full-width labels with a pointer | review feedback |
| `d711b9a` | warm neutrals desaturated ~40%; `--primary-ink` added and 50 `text-primary` sites swept | the first parchment read too yellow, and `--primary` is a *fill* — as text it measured 1.51:1 |
| `8044191` | collection copies badge `text-white` -> `text-foreground` | the plan listed `add-to-collection.tsx` as do-not-touch, assuming its `text-white` sat on card art; it sits on `bg-card` |
| `78531be` | error-card glyph gets `--secondary-ink` | Task 6's `text-accent` -> `text-secondary` swap fixed light but dropped dark to 1.66:1 |
| `ee72679` | light `secondary` becomes a quiet surface; `--brand-indigo` added | `#3B3194` in both themes inverted the fill hierarchy in light |

**Corrections to the task bodies below**, so they do not mislead on a re-read:

- **Palette hexes (Task 2) are superseded.** `background` is `#F8F5ED` (not `#FBF6EA`), and
  `muted`, `border`, `input`, `secondary`, `secondary-foreground` and the sidebar twins all
  moved. Three tokens the plan never had — `--primary-ink`, `--secondary-ink`, `--brand-indigo`
  — now exist. See the spec's palette table.
- **Contrast figures (Task 3) shifted** with the background; the spec carries the current ones.
- **No new dependency was needed (Task 8).** `@radix-ui/react-radio-group` was *not* installed:
  the `radix-ui` umbrella package already in the tree re-exports `RadioGroup`, which is what
  every other `ui/` primitive imports. The install was made and reverted.
- **`USER_SECTIONS` order (Task 8) is `['profile', 'appearance', ...]`**, so Profile stays the
  default landing section for signed-in users.
- **Two files the plan did not mention needed changes:** `app/global-error.tsx` (also hardcoded
  `className="dark"`, so it would have rendered light once `.dark` stopped being a selector) and
  `components/__tests__/header-brand-mark.test.tsx` (asserts which wordmark carries the alt text).
- **Known and not fixed:** the deck hero is washed out in light, because `bg-background/45`
  lightens the card art under white title text. Recorded in the spec's Risks.

**Task 10's verification stands:** dark mode is unchanged. The remaining screenshot diffs were
the random card-fan artwork (which differs against *itself* by ~100k px) and SVG antialiasing.

## Global Constraints

- **Working directory is `app/`** for every command. There is no root-level `package.json`.
- **Node/npm are not on PATH** — prefix with `/usr/local/bin/` (e.g. `/usr/local/bin/npm test -w web`).
- **Commit signing needs an explicit gpg path:** `git -c gpg.program=/opt/homebrew/bin/gpg commit -m "..."`.
- **Conventional Commits.** No Claude/Claude Code attribution in commit messages or PR bodies.
- **All user-facing strings are localised** in BOTH `web/messages/en.json` and `web/messages/de.json`. Never hardcode UI copy.
- **Code comments are ASCII-only** — no em-dashes, no unicode arrows.
- **`vitest`'s `rejects.toThrow` is broken in this workspace.** Catch rejections by hand.
- Branch is `feat/light-mode`, already created, with the spec committed as `d18cc91`.
- Dark-mode rendering must remain **pixel-identical**. Any diff in dark mode is a bug, except the `destructive` token changing from `oklch(0.704 0.191 22.216)` to its exact sRGB equivalent `#FF6467`.

---

### Task 1: Theme cookie module

**Files:**
- Create: `app/web/src/lib/theme.ts`
- Test: `app/web/src/lib/__tests__/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `THEME_COOKIE: 'revelio.theme'`, `type ThemeChoice = 'system' | 'light' | 'dark'`, `parseTheme(value: string | undefined): ThemeChoice`. Task 2 (layout), Task 4 (Toaster), Task 8 (action), Task 9 (page) all import from here.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'

describe('theme cookie', () => {
  it('uses the revelio. cookie prefix', () => {
    expect(THEME_COOKIE).toBe('revelio.theme')
  })

  it('parses the two explicit choices', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })

  it('treats a missing cookie as system', () => {
    expect(parseTheme(undefined)).toBe('system')
  })

  // The literal string "system" is never written to the cookie (absence means
  // system), but a stale or hand-edited cookie must not break rendering.
  it('treats junk and the literal "system" as system', () => {
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('DARK')).toBe('system')
    expect(parseTheme('<script>')).toBe('system')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/theme.test.ts`
Expected: FAIL — cannot resolve `@/lib/theme`.

- [ ] **Step 3: Write minimal implementation**

Create `app/web/src/lib/theme.ts`:

```ts
// Cookie that persists the colour theme. Plain (non-'use client') module so a
// Server Component can import the literal string and read it - a 'use client'
// export becomes a client reference on the server, which silently breaks
// cookies().get(THEME_COOKIE). Same shape as collection-prefs.ts.
export const THEME_COOKIE = 'revelio.theme'

// 'system' is represented by the ABSENCE of the cookie, so the CSS
// prefers-color-scheme fallback is the natural default.
export type ThemeChoice = 'system' | 'light' | 'dark'

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/theme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd app && git add web/src/lib/theme.ts web/src/lib/__tests__/theme.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add theme cookie module"
```

---

### Task 2: Palette tokens + theme resolution

This task must land as one commit: the moment `.dark` stops being the selector, the layout has to stop emitting `className="dark"`, or the app renders light for everyone.

**Files:**
- Modify: `app/web/src/app/globals.css` (replace the `@custom-variant dark` line and the whole `:root` + `.dark` block; add `--hover-bg`, per-theme lesson and star tokens)
- Modify: `app/web/src/app/[locale]/layout.tsx:63` (the `<html>` element)
- Test: `app/web/src/app/__tests__/theme-tokens.test.ts` (new)

**Interfaces:**
- Consumes: `THEME_COOKIE`, `parseTheme` from Task 1.
- Produces: the token names every later task styles against — `--hover-bg`, `--color-star-1`…`--color-star-5`, and per-theme `--color-lesson-*`. `<html>` carries `data-theme="light"|"dark"` or no attribute.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/app/__tests__/theme-tokens.test.ts`. This is the guard against a token existing in one theme only, and against the two dark alias blocks drifting apart:

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

let css = ''
beforeAll(async () => {
  css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
})

/**
 * Declarations of the block whose opening selector matches `opener`.
 * The selector must be matched as a rule opener, NOT by plain substring search:
 * `@custom-variant dark` mentions both `:root` and `:root:not([data-theme='light'])`
 * inside `&:where(...)`, and it appears earlier in the file.
 */
function block(opener: RegExp): string {
  const m = css.match(opener)
  expect(m, `no rule opener matched ${opener}`).not.toBeNull()
  const open = css.indexOf('{', m!.index!)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unbalanced braces after ${opener}`)
}

const LIGHT_DEFAULTS = /^:root\s*\{/m
const OS_DARK = /^\s+:root:not\(\[data-theme='light'\]\)\s*\{/m
const EXPLICIT_DARK = /^:root\[data-theme='dark'\]\s*\{/m

/** Token names assigned in a block, e.g. `--background` from `--background: var(...)`. */
function assigned(source: string): string[] {
  return [...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort()
}

/** The alias names: everything except the value sets and the non-colour --radius. */
function aliases(source: string): string[] {
  return assigned(source).filter(
    (t) => !t.startsWith('--light-') && !t.startsWith('--dark-') && t !== '--radius',
  )
}

describe('theme tokens', () => {
  it('declares a --dark-* counterpart for every --light-* value', () => {
    const root = block(LIGHT_DEFAULTS)
    const light = assigned(root).filter((t) => t.startsWith('--light-'))
    const dark = assigned(root).filter((t) => t.startsWith('--dark-'))
    expect(light.length).toBeGreaterThan(20)
    expect(light.map((t) => t.replace('--light-', ''))).toEqual(
      dark.map((t) => t.replace('--dark-', '')),
    )
  })

  it('aliases the same token names in the light default and both dark blocks', () => {
    const osDark = aliases(block(OS_DARK))
    const explicitDark = aliases(block(EXPLICIT_DARK))
    expect(osDark.length).toBeGreaterThan(20)
    expect(osDark).toEqual(explicitDark)
    expect(aliases(block(LIGHT_DEFAULTS))).toEqual(osDark)
  })

  it('resolves every alias through a --light-*/--dark-* value, never a raw hex', () => {
    expect(block(EXPLICIT_DARK)).not.toMatch(/:\s*#[0-9a-f]{3,8}/i)
    expect(block(OS_DARK)).not.toMatch(/:\s*#[0-9a-f]{3,8}/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- src/app/__tests__/theme-tokens.test.ts`
Expected: FAIL — `selector not found: :root:not([data-theme='light'])`.

- [ ] **Step 3: Replace the dark custom variant**

In `app/web/src/app/globals.css`, replace this line:

```css
@custom-variant dark (&:is(.dark *));
```

with:

```css
/* Fires on both dark paths: an explicit choice, and the OS setting when the
   visitor has not chosen. Keeps every existing dark: utility working. */
@custom-variant dark {
  &:where([data-theme='dark'], [data-theme='dark'] *) { @slot }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme='light']), :root:not([data-theme='light']) *) { @slot }
  }
}
```

- [ ] **Step 4: Point the lesson and star tokens at per-theme variables**

Still in `@theme inline`, replace the five `--color-lesson-*` literals with indirections and add the star tokens:

```css
  /* Lesson subject colors - bg-lesson-charms, text-lesson-charms, etc.
     Values are per-theme: the dark set is the WotC card-frame palette, the
     light set is darkened so it clears AA on parchment. */
  --color-lesson-care_of_magical_creatures: var(--lesson-cmc);
  --color-lesson-charms: var(--lesson-charms);
  --color-lesson-potions: var(--lesson-potions);
  --color-lesson-transfiguration: var(--lesson-transfiguration);
  --color-lesson-quidditch: var(--lesson-quidditch);

  /* Decorative star-field colors (see star-field.tsx). */
  --color-star-1: var(--star-1);
  --color-star-2: var(--star-2);
  --color-star-3: var(--star-3);
  --color-star-4: var(--star-4);
  --color-star-5: var(--star-5);
```

- [ ] **Step 5: Replace the `:root` and `.dark` blocks**

Delete the entire existing `:root { ... }` block AND the entire `.dark { ... }` block (including the comment above `.dark` about mirroring `:root`), and put this in their place:

```css
/* Palette. Every hex appears exactly once, in the value sets below; the
   alias blocks that follow only ever point at those values. */
:root {
  /* Reveal-Glow dark */
  --dark-background: #13122A;
  --dark-foreground: #FBF3DC;
  --dark-card: #1C1838;
  --dark-card-foreground: #FBF3DC;
  --dark-popover: #1C1838;
  --dark-popover-foreground: #FBF3DC;
  --dark-primary: #E8B23A;
  --dark-primary-foreground: #13122A;
  --dark-secondary: #3B3194;
  --dark-secondary-foreground: #FBF3DC;
  --dark-muted: #252246;
  --dark-muted-foreground: #C5BAA0;
  --dark-accent: #6E66C9;
  --dark-accent-foreground: #FBF3DC;
  --dark-hover-bg: color-mix(in srgb, var(--dark-accent) 40%, transparent);
  --dark-destructive: #FF6467;
  --dark-border: #2E2A50;
  --dark-input: #403A6E;
  --dark-input-fill: #201C3E;
  --dark-ring: #E8B23A;
  --dark-chart-1: #E8B23A;
  --dark-chart-2: #6E66C9;
  --dark-chart-3: #3B3194;
  --dark-chart-4: #5CB878;
  --dark-chart-5: #5B8DEF;
  --dark-sidebar: #1C1838;
  --dark-sidebar-foreground: #FBF3DC;
  --dark-sidebar-primary: #E8B23A;
  --dark-sidebar-primary-foreground: #13122A;
  --dark-sidebar-accent: #252246;
  --dark-sidebar-accent-foreground: #FBF3DC;
  --dark-sidebar-border: #2E2A50;
  --dark-sidebar-ring: #E8B23A;
  --dark-lesson-cmc: #836444;
  --dark-lesson-charms: #0069A9;
  --dark-lesson-potions: #00A661;
  --dark-lesson-transfiguration: #BC3E4D;
  --dark-lesson-quidditch: #E2AE37;
  --dark-star-1: #E8B23A;
  --dark-star-2: #6E66C9;
  --dark-star-3: #7B8FD4;
  --dark-star-4: #E0AEE0;
  --dark-star-5: #7BC96F;

  /* Warm parchment light */
  --light-background: #FBF6EA;
  --light-foreground: #1C1838;
  --light-card: #FFFDF7;
  --light-card-foreground: #1C1838;
  --light-popover: #FFFDF7;
  --light-popover-foreground: #1C1838;
  --light-primary: #F0C458;
  --light-primary-foreground: #1C1838;
  --light-secondary: #3B3194;
  --light-secondary-foreground: #FBF3DC;
  --light-muted: #F1E9D6;
  --light-muted-foreground: #5B5478;
  --light-accent: #E7E0F7;
  --light-accent-foreground: #1C1838;
  --light-hover-bg: var(--light-accent);
  --light-destructive: #B3261E;
  --light-border: #E4D9C0;
  --light-input: #D8CBAA;
  --light-input-fill: #FFFDF7;
  --light-ring: #F0C458;
  --light-chart-1: #B8801C;
  --light-chart-2: #5B4FC0;
  --light-chart-3: #3B3194;
  --light-chart-4: #2E9455;
  --light-chart-5: #3F6FD8;
  --light-sidebar: #FFFDF7;
  --light-sidebar-foreground: #1C1838;
  --light-sidebar-primary: #F0C458;
  --light-sidebar-primary-foreground: #1C1838;
  --light-sidebar-accent: #F1E9D6;
  --light-sidebar-accent-foreground: #1C1838;
  --light-sidebar-border: #E4D9C0;
  --light-sidebar-ring: #F0C458;
  --light-lesson-cmc: #6B4F35;
  --light-lesson-charms: #005A90;
  --light-lesson-potions: #00784A;
  --light-lesson-transfiguration: #A32F3D;
  --light-lesson-quidditch: #8F6510;
  --light-star-1: #C8881E;
  --light-star-2: #5B4FC0;
  --light-star-3: #4A63B8;
  --light-star-4: #B06BB0;
  --light-star-5: #3F9455;

  --radius: 0.6rem;

  /* Default aliases: light. */
  --background: var(--light-background);
  --foreground: var(--light-foreground);
  --card: var(--light-card);
  --card-foreground: var(--light-card-foreground);
  --popover: var(--light-popover);
  --popover-foreground: var(--light-popover-foreground);
  --primary: var(--light-primary);
  --primary-foreground: var(--light-primary-foreground);
  --secondary: var(--light-secondary);
  --secondary-foreground: var(--light-secondary-foreground);
  --muted: var(--light-muted);
  --muted-foreground: var(--light-muted-foreground);
  --accent: var(--light-accent);
  --accent-foreground: var(--light-accent-foreground);
  --hover-bg: var(--light-hover-bg);
  --destructive: var(--light-destructive);
  --border: var(--light-border);
  --input: var(--light-input);
  --input-fill: var(--light-input-fill);
  --ring: var(--light-ring);
  --chart-1: var(--light-chart-1);
  --chart-2: var(--light-chart-2);
  --chart-3: var(--light-chart-3);
  --chart-4: var(--light-chart-4);
  --chart-5: var(--light-chart-5);
  --sidebar: var(--light-sidebar);
  --sidebar-foreground: var(--light-sidebar-foreground);
  --sidebar-primary: var(--light-sidebar-primary);
  --sidebar-primary-foreground: var(--light-sidebar-primary-foreground);
  --sidebar-accent: var(--light-sidebar-accent);
  --sidebar-accent-foreground: var(--light-sidebar-accent-foreground);
  --sidebar-border: var(--light-sidebar-border);
  --sidebar-ring: var(--light-sidebar-ring);
  --lesson-cmc: var(--light-lesson-cmc);
  --lesson-charms: var(--light-lesson-charms);
  --lesson-potions: var(--light-lesson-potions);
  --lesson-transfiguration: var(--light-lesson-transfiguration);
  --lesson-quidditch: var(--light-lesson-quidditch);
  --star-1: var(--light-star-1);
  --star-2: var(--light-star-2);
  --star-3: var(--light-star-3);
  --star-4: var(--light-star-4);
  --star-5: var(--light-star-5);
}

/* No explicit choice: follow the OS. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --background: var(--dark-background);
    --foreground: var(--dark-foreground);
    --card: var(--dark-card);
    --card-foreground: var(--dark-card-foreground);
    --popover: var(--dark-popover);
    --popover-foreground: var(--dark-popover-foreground);
    --primary: var(--dark-primary);
    --primary-foreground: var(--dark-primary-foreground);
    --secondary: var(--dark-secondary);
    --secondary-foreground: var(--dark-secondary-foreground);
    --muted: var(--dark-muted);
    --muted-foreground: var(--dark-muted-foreground);
    --accent: var(--dark-accent);
    --accent-foreground: var(--dark-accent-foreground);
    --hover-bg: var(--dark-hover-bg);
    --destructive: var(--dark-destructive);
    --border: var(--dark-border);
    --input: var(--dark-input);
    --input-fill: var(--dark-input-fill);
    --ring: var(--dark-ring);
    --chart-1: var(--dark-chart-1);
    --chart-2: var(--dark-chart-2);
    --chart-3: var(--dark-chart-3);
    --chart-4: var(--dark-chart-4);
    --chart-5: var(--dark-chart-5);
    --sidebar: var(--dark-sidebar);
    --sidebar-foreground: var(--dark-sidebar-foreground);
    --sidebar-primary: var(--dark-sidebar-primary);
    --sidebar-primary-foreground: var(--dark-sidebar-primary-foreground);
    --sidebar-accent: var(--dark-sidebar-accent);
    --sidebar-accent-foreground: var(--dark-sidebar-accent-foreground);
    --sidebar-border: var(--dark-sidebar-border);
    --sidebar-ring: var(--dark-sidebar-ring);
    --lesson-cmc: var(--dark-lesson-cmc);
    --lesson-charms: var(--dark-lesson-charms);
    --lesson-potions: var(--dark-lesson-potions);
    --lesson-transfiguration: var(--dark-lesson-transfiguration);
    --lesson-quidditch: var(--dark-lesson-quidditch);
    --star-1: var(--dark-star-1);
    --star-2: var(--dark-star-2);
    --star-3: var(--dark-star-3);
    --star-4: var(--dark-star-4);
    --star-5: var(--dark-star-5);
  }
}

/* An explicit choice beats the OS, in both directions. Identical to the block
   above; CSS cannot share declarations across a media-query boundary, so
   theme-tokens.test.ts asserts the two stay in sync. */
:root[data-theme='dark'] {
  --background: var(--dark-background);
  --foreground: var(--dark-foreground);
  --card: var(--dark-card);
  --card-foreground: var(--dark-card-foreground);
  --popover: var(--dark-popover);
  --popover-foreground: var(--dark-popover-foreground);
  --primary: var(--dark-primary);
  --primary-foreground: var(--dark-primary-foreground);
  --secondary: var(--dark-secondary);
  --secondary-foreground: var(--dark-secondary-foreground);
  --muted: var(--dark-muted);
  --muted-foreground: var(--dark-muted-foreground);
  --accent: var(--dark-accent);
  --accent-foreground: var(--dark-accent-foreground);
  --hover-bg: var(--dark-hover-bg);
  --destructive: var(--dark-destructive);
  --border: var(--dark-border);
  --input: var(--dark-input);
  --input-fill: var(--dark-input-fill);
  --ring: var(--dark-ring);
  --chart-1: var(--dark-chart-1);
  --chart-2: var(--dark-chart-2);
  --chart-3: var(--dark-chart-3);
  --chart-4: var(--dark-chart-4);
  --chart-5: var(--dark-chart-5);
  --sidebar: var(--dark-sidebar);
  --sidebar-foreground: var(--dark-sidebar-foreground);
  --sidebar-primary: var(--dark-sidebar-primary);
  --sidebar-primary-foreground: var(--dark-sidebar-primary-foreground);
  --sidebar-accent: var(--dark-sidebar-accent);
  --sidebar-accent-foreground: var(--dark-sidebar-accent-foreground);
  --sidebar-border: var(--dark-sidebar-border);
  --sidebar-ring: var(--dark-sidebar-ring);
  --lesson-cmc: var(--dark-lesson-cmc);
  --lesson-charms: var(--dark-lesson-charms);
  --lesson-potions: var(--dark-lesson-potions);
  --lesson-transfiguration: var(--dark-lesson-transfiguration);
  --lesson-quidditch: var(--dark-lesson-quidditch);
  --star-1: var(--dark-star-1);
  --star-2: var(--dark-star-2);
  --star-3: var(--dark-star-3);
  --star-4: var(--dark-star-4);
  --star-5: var(--dark-star-5);
}
```

- [ ] **Step 6: Stamp the theme on `<html>`**

In `app/web/src/app/[locale]/layout.tsx`, add to the imports:

```tsx
import { cookies } from 'next/headers'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
```

Inside `LocaleLayout`, after `const messages = await getMessages()`:

```tsx
  // The layout is already dynamic (getSession), so reading a cookie is free.
  // No attribute means "follow the OS" - globals.css handles that in CSS, so
  // the first painted frame is correct without a blocking inline script.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
```

Replace the `<html>` element:

```tsx
    <html
      lang={locale}
      className={poppins.variable}
      data-theme={theme === 'system' ? undefined : theme}
    >
```

- [ ] **Step 7: Run the token test and the full suite**

Run: `cd app && /usr/local/bin/npm test -w web -- src/app/__tests__/theme-tokens.test.ts`
Expected: PASS, 3 tests.

Run: `cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck`
Expected: all green. If `components/__tests__/theme.test.tsx` fails on the lesson-colour regex, leave it — Task 3 rewrites it.

- [ ] **Step 8: Verify both themes render**

```bash
cd app && /usr/local/bin/npm run dev -w web
```

Open `http://localhost:3000/en`, then in DevTools set Rendering → "Emulate prefers-color-scheme: light" — the page must turn parchment. Set `document.documentElement.dataset.theme = 'dark'` in the console — it must go back to midnight while the emulation is still light.

- [ ] **Step 9: Commit**

```bash
cd app && git add web/src/app/globals.css web/src/app/\[locale\]/layout.tsx web/src/app/__tests__/theme-tokens.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add light palette and cookie-driven theme resolution"
```

---

### Task 3: Contrast + lesson-colour guards

The existing `theme.test.tsx` asserts lesson hexes that Task 2 moved behind a variable, so it needs rewriting; the contrast test pins the palette so a well-meaning tweak cannot quietly break AA.

**Files:**
- Modify: `app/web/src/components/__tests__/theme.test.tsx` (the second `it` block)
- Create: `app/web/src/app/__tests__/theme-contrast.test.ts`

**Interfaces:**
- Consumes: the `--light-*` / `--dark-*` value sets from Task 2.
- Produces: nothing other tasks import.

- [ ] **Step 1: Rewrite the lesson-colour guard**

In `app/web/src/components/__tests__/theme.test.tsx`, replace the whole `it('registers all five lesson colors as theme tokens', ...)` block with:

```tsx
  // Config guard: a typo in either theme's lesson palette fails here.
  it('registers all five lesson colors in both themes', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    const expected: Record<string, { light: string; dark: string }> = {
      cmc: { light: '#6B4F35', dark: '#836444' },
      charms: { light: '#005A90', dark: '#0069A9' },
      potions: { light: '#00784A', dark: '#00A661' },
      transfiguration: { light: '#A32F3D', dark: '#BC3E4D' },
      quidditch: { light: '#8F6510', dark: '#E2AE37' },
    }
    for (const [code, { light, dark }] of Object.entries(expected)) {
      expect(css).toMatch(new RegExp(`--light-lesson-${code}\\s*:\\s*${light}`, 'i'))
      expect(css).toMatch(new RegExp(`--dark-lesson-${code}\\s*:\\s*${dark}`, 'i'))
    }
  })
```

- [ ] **Step 2: Write the failing contrast test**

Create `app/web/src/app/__tests__/theme-contrast.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

let css = ''
beforeAll(async () => {
  css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
})

function hex(token: string): string {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})`, 'i'))
  expect(m, `no hex for ${token}`).not.toBeNull()
  return m![1]
}

function luminance(h: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('light theme contrast', () => {
  // AA for normal text. Light mode is held to this in full; dark mode is
  // carried over as-is and has four known pre-existing gaps documented in
  // docs/superpowers/specs/2026-08-17-light-mode-design.md.
  const AA = 4.5
  const pairs: [string, string, string][] = [
    ['body text', '--light-foreground', '--light-background'],
    ['muted text', '--light-muted-foreground', '--light-background'],
    ['muted text on card', '--light-muted-foreground', '--light-card'],
    ['primary button label', '--light-primary-foreground', '--light-primary'],
    ['secondary button label', '--light-secondary-foreground', '--light-secondary'],
    ['accent hover label', '--light-accent-foreground', '--light-accent'],
    ['destructive text', '--light-destructive', '--light-background'],
    ['lesson cmc', '--light-lesson-cmc', '--light-background'],
    ['lesson charms', '--light-lesson-charms', '--light-background'],
    ['lesson potions', '--light-lesson-potions', '--light-background'],
    ['lesson transfiguration', '--light-lesson-transfiguration', '--light-background'],
    ['lesson quidditch', '--light-lesson-quidditch', '--light-background'],
  ]

  for (const [label, fg, bg] of pairs) {
    it(`${label} clears AA`, () => {
      expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(AA)
    })
  }

  // Graphical fills only need 3:1 (WCAG 1.4.11).
  it('chart fills clear 3:1 against the page', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(contrast(hex(`--light-chart-${n}`), hex('--light-background'))).toBeGreaterThanOrEqual(3)
    }
  })
})
```

- [ ] **Step 3: Run both tests**

Run: `cd app && /usr/local/bin/npm test -w web -- theme`
Expected: PASS. The contrast values should be body 15.74, muted 6.53, primary label 10.30, accent label 13.26, lessons 4.82–6.97, charts 3.17–9.49.

- [ ] **Step 4: Commit**

```bash
cd app && git add web/src/components/__tests__/theme.test.tsx web/src/app/__tests__/theme-contrast.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "test(web): guard light palette contrast and per-theme lesson colors"
```

---

### Task 4: Browser chrome colour (viewport, manifest, Toaster)

**Files:**
- Modify: `app/web/src/lib/seo.ts:12`
- Modify: `app/web/src/app/[locale]/layout.tsx` (replace `export const viewport`)
- Modify: `app/web/src/components/ui/sonner.tsx`
- Modify: `app/web/src/app/[locale]/__tests__/layout-metadata.test.ts`
- Test: `app/web/src/lib/__tests__/seo.test.ts` (add one case)

**Interfaces:**
- Consumes: `parseTheme`, `THEME_COOKIE` (Task 1).
- Produces: `THEME_COLOR_LIGHT = '#FBF6EA'` from `@/lib/seo`. `Toaster` gains a required `theme` prop of type `ThemeChoice`.

- [ ] **Step 1: Write the failing tests**

In `app/web/src/lib/__tests__/seo.test.ts`, next to the existing `THEME_COLOR` assertion, add (and extend the import at the top of the file to include `THEME_COLOR_LIGHT`):

```ts
  it('exposes the light theme color', () => {
    expect(THEME_COLOR_LIGHT).toBe('#FBF6EA')
  })
```

Replace the body of `app/web/src/app/[locale]/__tests__/layout-metadata.test.ts`'s themeColor assertion with:

```ts
    const viewport = await generateViewport()
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR },
    ])
```

Adjust that file's imports to pull `generateViewport` from the layout and both constants from `@/lib/seo`. If the existing test imports `viewport` as a value, change it to import `generateViewport`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd app && /usr/local/bin/npm test -w web -- seo layout-metadata`
Expected: FAIL — `THEME_COLOR_LIGHT` is not exported, `generateViewport` is not exported.

- [ ] **Step 3: Add the light constant**

In `app/web/src/lib/seo.ts`, below the existing `THEME_COLOR`:

```ts
/** Parchment - the light theme's page background, for the PWA theme color. */
export const THEME_COLOR_LIGHT = '#FBF6EA'
```

Leave `THEME_COLOR` and `app/web/src/app/manifest.ts` alone. A PWA manifest carries a single
`theme_color`/`background_color` and cannot vary by media query, so the installed app keeps
the brand midnight. `manifest.test.ts` therefore needs no change.

- [ ] **Step 4: Swap the static viewport for `generateViewport`**

In `app/web/src/app/[locale]/layout.tsx`, delete:

```tsx
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}
```

and add (importing `THEME_COLOR_LIGHT` alongside the existing `THEME_COLOR`):

```tsx
// Browser chrome follows the OS setting. An explicit cookie choice is not
// reflected here: themeColor is static metadata, and the media-query pair is
// right for the overwhelmingly common case.
export function generateViewport(): Viewport {
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR },
    ],
  }
}
```

- [ ] **Step 5: Make the Toaster theme-aware**

Replace `app/web/src/components/ui/sonner.tsx` with:

```tsx
'use client'
import { Toaster as Sonner } from 'sonner'
import type { ThemeChoice } from '@/lib/theme'

// sonner paints its own surface, so it needs the resolved choice rather than
// our CSS tokens. 'system' makes it follow prefers-color-scheme, which matches
// what globals.css does when no cookie is set.
export function Toaster({ theme, ...props }: React.ComponentProps<typeof Sonner> & { theme: ThemeChoice }) {
  return <Sonner theme={theme} richColors position="top-center" {...props} />
}
```

In `app/web/src/app/[locale]/layout.tsx`, pass the resolved value:

```tsx
          <Toaster theme={theme} />
```

- [ ] **Step 6: Run the tests**

Run: `cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd app && git add web/src/lib/seo.ts web/src/app/\[locale\]/layout.tsx web/src/components/ui/sonner.tsx web/src/lib/__tests__/seo.test.ts web/src/app/\[locale\]/__tests__/layout-metadata.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): make browser chrome and toasts theme-aware"
```

---

### Task 5: Logo and star field

Both are decorative components that hardcode dark-mode colours. The logo swap must be CSS-only — a JS check would break under the media query when no cookie is set.

**Files:**
- Modify: `app/web/src/components/brand-mark.tsx`
- Modify: `app/web/src/components/star-field.tsx`
- Test: `app/web/src/components/__tests__/brand-mark.test.tsx` (new)

**Interfaces:**
- Consumes: `--color-star-1`…`--color-star-5` (Task 2).
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/brand-mark.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrandMark } from '@/components/brand-mark'

describe('BrandMark', () => {
  // Both variants are always in the DOM and CSS hides one, so the logo is
  // correct under prefers-color-scheme with no JS and no cookie.
  it('renders a dark-background and a light-background wordmark', () => {
    const { container } = render(<BrandMark />)
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs.some((s) => s?.includes('revelio-logo-dark'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-logo-primary'))).toBe(true)
  })

  it('exposes exactly one accessible name', () => {
    const { container } = render(<BrandMark />)
    const labelled = [...container.querySelectorAll('img')].filter(
      (i) => (i.getAttribute('alt') ?? '') !== '',
    )
    expect(labelled).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- brand-mark`
Expected: FAIL — only `revelio-logo-dark.svg` is rendered.

- [ ] **Step 3: Render both wordmarks**

Replace `app/web/src/components/brand-mark.tsx` with:

```tsx
import Image from 'next/image'
import { BRAND_NAME } from '@/lib/brand'

// Both variants ship and CSS picks one, so the right logo shows under
// prefers-color-scheme without JS. The hidden copy is aria-hidden with an
// empty alt so screen readers announce the brand once.
export function BrandMark() {
  return (
    <>
      <Image
        src="/revelio-logo-primary.svg"
        alt={BRAND_NAME}
        width={426}
        height={78}
        priority
        className="h-9 w-auto dark:hidden"
      />
      <Image
        src="/revelio-logo-dark.svg"
        alt=""
        aria-hidden
        width={426}
        height={78}
        priority
        className="hidden h-9 w-auto dark:block"
      />
    </>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `cd app && /usr/local/bin/npm test -w web -- brand-mark`
Expected: PASS, 2 tests.

- [ ] **Step 5: Move the star colours to tokens**

In `app/web/src/components/star-field.tsx`, replace the `COLORS` constant:

```tsx
// Per-theme via CSS custom properties: the dark set is bright on midnight, the
// light set is darker so the stars stay visible on parchment.
const COLORS = [
  'var(--color-star-1)',
  'var(--color-star-2)',
  'var(--color-star-3)',
  'var(--color-star-4)',
  'var(--color-star-5)',
]
```

No other change is needed — the value is already passed straight to `style={{ color: s.color }}`.

- [ ] **Step 6: Verify in the browser**

Run the dev server, open `/en`, and toggle DevTools' `prefers-color-scheme` emulation. The wordmark must swap between the indigo-on-light and parchment-on-dark variants, and the stars must stay visible in both.

- [ ] **Step 7: Run the full suite and commit**

Run: `cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web`

```bash
cd app && git add web/src/components/brand-mark.tsx web/src/components/star-field.tsx web/src/components/__tests__/brand-mark.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): swap logo and star colors per theme"
```

---

### Task 6: Component sweep

Six components assume a dark ground. Everything else in the app is already token-driven and must be left alone — in particular the `text-white` / `bg-black/nn` overlays that sit on **card art or a modal scrim**, which are correct in both themes.

**Do not touch:** `card-nav.tsx`, `deck-hero-card.tsx`, `deck-header.tsx`, `deck-gallery.tsx`, `card-rotate.tsx`, `image-uploader.tsx`, `set-symbol-uploader.tsx`, `add-to-collection.tsx`, `deck-card-browser.tsx`, `lesson-cost.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `ui/button.tsx`, `ui/badge.tsx`, `lib/og-image.tsx`, `lib/deck-png.ts`, `lib/email/*`.

**Files:**
- Modify: `app/web/src/components/quick-filters.tsx:39`
- Modify: `app/web/src/components/lesson-filter.tsx:38`
- Modify: `app/web/src/components/collection-sidebar.tsx:37`
- Modify: `app/web/src/components/settings/settings-nav.tsx:33`
- Modify: `app/web/src/components/lesson-curve.tsx:29`
- Modify: `app/web/src/components/error-card-state.tsx`
- Modify: `app/web/src/components/contact-form.tsx`
- Test: `app/web/src/components/__tests__/theme-sweep.test.tsx` (new)

**Interfaces:**
- Consumes: `--hover-bg`, `--chart-*`, `--color-star-*` (Task 2).
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing regression test**

Create `app/web/src/components/__tests__/theme-sweep.test.tsx`. It reads source rather than rendering, because these are class-string regressions and a render assertion would not catch a re-introduction elsewhere:

```tsx
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const read = (p: string) => readFile(resolve(process.cwd(), 'src/components', p), 'utf8')

describe('light-mode sweep', () => {
  // bg-white/5 is a dark-only wash: on parchment it is invisible.
  it.each(['quick-filters.tsx', 'lesson-filter.tsx'])('%s uses the hover token', async (file) => {
    const src = await read(file)
    expect(src).not.toMatch(/hover:bg-white\//)
    expect(src).toMatch(/hover:bg-\(--hover-bg\)/)
  })

  // accent is a pale wash in light mode, so text-accent is unreadable there.
  it('error-card-state does not colour text with accent', async () => {
    expect(await read('error-card-state.tsx')).not.toMatch(/text-accent\b/)
  })

  it.each(['contact-form.tsx', 'error-card-state.tsx'])(
    '%s has no hardcoded hex colours',
    async (file) => {
      expect(await read(file)).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    },
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- theme-sweep`
Expected: FAIL on all four cases.

- [ ] **Step 3: Fix the two invisible hover washes**

In `app/web/src/components/quick-filters.tsx:39`, replace `'text-muted-foreground hover:bg-white/5'` with:

```tsx
                  : 'text-muted-foreground hover:bg-(--hover-bg) hover:text-accent-foreground'
```

In `app/web/src/components/lesson-filter.tsx:38`, replace `className="hover:bg-white/5"` with:

```tsx
            className="hover:bg-(--hover-bg)"
```

- [ ] **Step 4: Raise the two accent gradients**

`from-accent/25 to-accent/10` is a visible tint over a saturated dark accent, but invisible over the pale light one. Use the hover token, which is already per-theme.

In `app/web/src/components/collection-sidebar.tsx:37`, replace `'bg-gradient-to-r from-accent/25 to-accent/10 shadow-[inset_3px_0_0_var(--color-primary)]'` with:

```tsx
                ? 'bg-gradient-to-r from-(--hover-bg) to-transparent shadow-[inset_3px_0_0_var(--color-primary)]'
```

In `app/web/src/components/settings/settings-nav.tsx:33`, replace `: 'bg-gradient-to-r from-accent/25 to-accent/10 shadow-[inset_3px_0_0_var(--color-primary)]'` with:

```tsx
                      : 'bg-gradient-to-r from-(--hover-bg) to-transparent shadow-[inset_3px_0_0_var(--color-primary)]',
```

In the same file, the sibling non-active branch uses `hover:bg-accent/50`; change it to `hover:bg-(--hover-bg)` so hover is legible in both themes.

- [ ] **Step 5: Fix the lesson-curve bars**

In `app/web/src/components/lesson-curve.tsx:29`, `from-accent to-secondary` washes out once accent is pale. Chart tokens are per-theme and meet 3:1 in both. Replace with:

```tsx
            className="relative min-h-1 flex-1 rounded-t-sm bg-gradient-to-b from-chart-2 to-chart-3"
```

- [ ] **Step 6: Fix error-card-state**

In `app/web/src/components/error-card-state.tsx`, make four edits. All are colour-only; leave
the structure, the gold `drop-shadow(...)` glows and the `rgba()` values alone.

In the `VARIANTS` map, `text-accent` is unreadable once accent is a pale wash:

```tsx
  missing: { symbol: '?', color: 'text-primary', mask: false },
  dissolving: { symbol: '✦', color: 'text-secondary', mask: true },
  dark: { symbol: '✦', color: 'text-secondary', mask: false },
```

The card motif's stripes are hardcoded dark indigo. Replace the `style` prop:

```tsx
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg,var(--color-muted) 0 9px,var(--color-card) 9px 18px)',
          }}
```

The heavy black drop shadow is built for a midnight page; swap it for the scale's own:

```tsx
            'relative grid aspect-[5/7] h-80 place-items-center overflow-hidden rounded-2xl border border-border',
            'shadow-xl',
```

The dashed inner border uses a literal:

```tsx
        <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-border" />
```

- [ ] **Step 7: Fix contact-form**

`app/web/src/components/contact-form.tsx:109` draws the envelope fold in ink on top of a
`currentColor` (gold) envelope. The colour that reads on gold in both themes is exactly what
`primary-foreground` means, so:

```tsx
              stroke="var(--color-primary-foreground)"
```

That is the file's only hardcoded hex.

- [ ] **Step 8: Run the sweep test and the suite**

Run: `cd app && /usr/local/bin/npm test -w web -- theme-sweep`
Expected: PASS.

Run: `cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web`
Expected: all green.

- [ ] **Step 9: Verify in the browser**

Dev server, `prefers-color-scheme: light`. Check `/en/search?q=harry` (type chips and lesson chips hover), `/en/settings/profile` (nav active state — signed in), a deck page (lesson curve), and `/en/contact`.

- [ ] **Step 10: Commit**

```bash
cd app && git add web/src/components
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(web): make hover washes, gradients and decorative colors theme-aware"
```

---

### Task 7: Theme server action

**Files:**
- Create: `app/web/src/lib/theme-actions.ts`
- Test: `app/web/src/lib/__tests__/theme-actions.test.ts`

**Interfaces:**
- Consumes: `THEME_COOKIE`, `parseTheme`, `ThemeChoice` (Task 1).
- Produces: `setTheme(choice: unknown): Promise<{ ok: true } | { ok: false; error: string }>`. Task 8's form calls it.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/theme-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = { set: vi.fn(), delete: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => store }))

const { setTheme } = await import('@/lib/theme-actions')

beforeEach(() => {
  store.set.mockClear()
  store.delete.mockClear()
})

describe('setTheme', () => {
  it('writes an explicit choice as a long-lived cookie', async () => {
    expect(await setTheme('dark')).toEqual({ ok: true })
    expect(store.set).toHaveBeenCalledOnce()
    const [name, value, opts] = store.set.mock.calls[0]
    expect(name).toBe('revelio.theme')
    expect(value).toBe('dark')
    expect(opts).toMatchObject({ path: '/', sameSite: 'lax', httpOnly: false })
    expect(opts.maxAge).toBeGreaterThan(60 * 60 * 24 * 300)
  })

  it('deletes the cookie for system, rather than writing "system"', async () => {
    expect(await setTheme('system')).toEqual({ ok: true })
    expect(store.delete).toHaveBeenCalledWith('revelio.theme')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('rejects anything else without touching the cookie', async () => {
    const result = await setTheme('mauve')
    expect(result.ok).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- theme-actions`
Expected: FAIL — cannot resolve `@/lib/theme-actions`.

- [ ] **Step 3: Write the action**

Create `app/web/src/lib/theme-actions.ts`:

```ts
'use server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { THEME_COOKIE } from '@/lib/theme'

const schema = z.enum(['system', 'light', 'dark'])

export type SetThemeResult = { ok: true } | { ok: false; error: string }

// The cookie is deliberately readable by JS (httpOnly: false): it is a display
// preference, not a credential, and the form mirrors it onto <html> for instant
// feedback. A year keeps the choice across sessions.
export async function setTheme(choice: unknown): Promise<SetThemeResult> {
  const parsed = schema.safeParse(choice)
  if (!parsed.success) return { ok: false, error: 'invalid_theme' }

  const store = await cookies()
  if (parsed.data === 'system') {
    store.delete(THEME_COOKIE)
  } else {
    store.set(THEME_COOKIE, parsed.data, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run the test**

Run: `cd app && /usr/local/bin/npm test -w web -- theme-actions`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd app && git add web/src/lib/theme-actions.ts web/src/lib/__tests__/theme-actions.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add theme preference server action"
```

---

### Task 8: Appearance settings page

**Files:**
- Create: `app/web/src/components/ui/radio-group.tsx` (shadcn primitive)
- Create: `app/web/src/components/settings/appearance-form.tsx`
- Create: `app/web/src/app/[locale]/settings/appearance/page.tsx`
- Modify: `app/web/src/components/settings/types.ts`
- Modify: `app/web/src/components/settings/settings-nav.tsx`
- Modify: `app/web/src/app/[locale]/settings/layout.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/__tests__/appearance-form.test.tsx`

**Interfaces:**
- Consumes: `setTheme` (Task 7), `ThemeChoice`, `THEME_COOKIE`, `parseTheme` (Task 1).
- Produces: `SettingsSection` gains `'appearance'`; `SettingsNav` takes `{ isLoggedIn: boolean }`.

- [ ] **Step 1: Add the Radix radio-group dependency and primitive**

```bash
# NOT NEEDED - see "Status" at the top. The `radix-ui` umbrella package already
# in the tree re-exports RadioGroup, and is what every other ui/ primitive imports.
# cd app && /usr/local/bin/npm i @radix-ui/react-radio-group -w web
```

Create `app/web/src/components/ui/radio-group.tsx` with the standard shadcn new-york implementation (`RadioGroup`, `RadioGroupItem` wrapping `RadioGroupPrimitive.Root` / `.Item` with an `Indicator` containing a `CircleIcon` from lucide). Match the local conventions in `src/components/ui/checkbox.tsx`: same `data-slot` attributes, same `cn()` import, same focus-visible ring classes, `bg-input-fill` for the unchecked surface.

- [ ] **Step 2: Add the strings**

In `app/web/messages/en.json`, add `"appearance"` to `settings.nav` and an `settings.appearance` block:

```json
    "nav": { "appearance": "Appearance", "profile": "Profile", "email": "Email", "data": "Your data", "danger": "Danger zone" },
    "appearance": {
      "title": "Appearance",
      "lead": "Choose how Revelio looks on this device. This setting is stored in your browser, not on your account.",
      "legend": "Theme",
      "system": "System",
      "systemHint": "Follow your device setting",
      "light": "Light",
      "lightHint": "Warm parchment",
      "dark": "Dark",
      "darkHint": "Midnight and gold",
      "saved": "Appearance saved",
      "error": "Could not save your appearance setting"
    },
```

In `app/web/messages/de.json`, the same keys:

```json
    "nav": { "appearance": "Darstellung", "profile": "Profil", "email": "E-Mail", "data": "Deine Daten", "danger": "Gefahrenzone" },
    "appearance": {
      "title": "Darstellung",
      "lead": "Lege fest, wie Revelio auf diesem Gerät aussieht. Diese Einstellung wird im Browser gespeichert, nicht in deinem Konto.",
      "legend": "Design",
      "system": "System",
      "systemHint": "Geräteeinstellung folgen",
      "light": "Hell",
      "lightHint": "Warmes Pergament",
      "dark": "Dunkel",
      "darkHint": "Mitternacht und Gold",
      "saved": "Darstellung gespeichert",
      "error": "Darstellung konnte nicht gespeichert werden"
    },
```

Keep the existing `nav` keys — only add `appearance`. Match each file's existing indentation.

- [ ] **Step 3: Write the failing form test**

Create `app/web/src/components/__tests__/appearance-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import messages from '../../../messages/en.json'
import { AppearanceForm } from '@/components/settings/appearance-form'

const setTheme = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/theme-actions', () => ({ setTheme: (c: unknown) => setTheme(c) }))

function renderForm(current: 'system' | 'light' | 'dark' = 'system') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppearanceForm current={current} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  setTheme.mockClear()
  delete document.documentElement.dataset.theme
})

describe('AppearanceForm', () => {
  it('marks the current choice as selected', () => {
    renderForm('dark')
    expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked()
  })

  it('persists the choice and mirrors it onto <html> straight away', async () => {
    renderForm('system')
    await userEvent.click(screen.getByRole('radio', { name: /light/i }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('removes the attribute for system, so the media query takes over', async () => {
    renderForm('dark')
    await userEvent.click(screen.getByRole('radio', { name: /system/i }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(setTheme).toHaveBeenCalledWith('system')
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd app && /usr/local/bin/npm test -w web -- appearance-form`
Expected: FAIL — cannot resolve `@/components/settings/appearance-form`.

- [ ] **Step 5: Write the form**

Create `app/web/src/components/settings/appearance-form.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { setTheme } from '@/lib/theme-actions'
import type { ThemeChoice } from '@/lib/theme'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

export function AppearanceForm({ current }: { current: ThemeChoice }) {
  const t = useTranslations('settings.appearance')
  const [choice, setChoice] = useState<ThemeChoice>(current)
  const [, startTransition] = useTransition()

  function apply(next: string) {
    const value = next as ThemeChoice
    setChoice(value)
    // Mirror onto <html> first so the page repaints instantly; the cookie
    // write is what makes it survive a reload. Removing the attribute hands
    // control back to the prefers-color-scheme media query.
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value

    startTransition(async () => {
      const result = await setTheme(value)
      if (result.ok) toast.success(t('saved'))
      else toast.error(t('error'))
    })
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <RadioGroup
        value={choice}
        onValueChange={apply}
        aria-label={t('legend')}
        className="mt-6 gap-3"
      >
        {CHOICES.map((value) => (
          <div key={value} className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value={value} id={`theme-${value}`} className="mt-0.5" />
            <Label htmlFor={`theme-${value}`} className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{t(value)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t(`${value}Hint`)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </section>
  )
}
```

- [ ] **Step 6: Run the test**

Run: `cd app && /usr/local/bin/npm test -w web -- appearance-form`
Expected: PASS, 3 tests.

- [ ] **Step 7: Add the page**

Create `app/web/src/app/[locale]/settings/appearance/page.tsx`. Note it does NOT call `requireSettingsUser` — this is the one public settings section, because theme is a device preference and gating it would leave signed-out visitors unable to override their OS:

```tsx
import { cookies } from 'next/headers'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
import { AppearanceForm } from '@/components/settings/appearance-form'

export const dynamic = 'force-dynamic'

export default async function AppearanceSettingsPage() {
  const current = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return <AppearanceForm current={current} />
}
```

- [ ] **Step 8: Make the nav session-aware**

In `app/web/src/components/settings/types.ts`:

```ts
export type SettingsSection = 'appearance' | 'profile' | 'email' | 'data' | 'danger'
```

In `app/web/src/components/settings/settings-nav.tsx`, replace the `SECTIONS` constant and thread a flag through both components:

```tsx
// Appearance is the only section that works signed out; showing the others to
// a guest would offer links that bounce straight to /login.
const GUEST_SECTIONS: SettingsSection[] = ['appearance']
// Shipped order is profile-first, so Profile stays the default landing section.
const USER_SECTIONS: SettingsSection[] = ['profile', 'appearance', 'email', 'data', 'danger']
```

`NavList` takes `{ isLoggedIn, onSelect }` and computes `const sections = isLoggedIn ? USER_SECTIONS : GUEST_SECTIONS`, then maps over `sections` instead of `SECTIONS`. Its `active` lookup becomes `sections.find(...) ?? sections[0]`. `SettingsNav` takes `{ isLoggedIn }: { isLoggedIn: boolean }` and passes it to both `rail` and `drawer` renders.

In `app/web/src/app/[locale]/settings/layout.tsx`, resolve the session and pass it down:

```tsx
import { getSession } from '@/lib/session'
```

```tsx
  const session = await getSession()
```

```tsx
        <SettingsNav isLoggedIn={!!session?.user} />
```

- [ ] **Step 9: Verify and commit**

Run: `cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web`

Start the dev server and, **signed out**, open `/en/settings/appearance`. It must render (not redirect to `/login`) and show only "Appearance" in the nav. Pick Light, then Dark, then System; the page must repaint immediately each time and keep the choice across a reload.

```bash
cd app && git add web/src/components/ui/radio-group.tsx web/src/components/settings web/src/app/\[locale\]/settings web/messages web/package.json ../package-lock.json web/src/components/__tests__/appearance-form.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add appearance settings page with theme picker"
```

---

### Task 9: Footer link and end-to-end coverage

Without a header control and with the other settings sections gated, a signed-out visitor has no path to the theme picker. The footer is that path.

**Files:**
- Modify: `app/web/src/components/site-footer.tsx` (the `about` column)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Create: `app/web/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Add the footer strings**

In `app/web/messages/en.json` under `footer`, add `"appearance": "Appearance"`. In `de.json`, `"appearance": "Darstellung"`.

- [ ] **Step 2: Add the link**

In `app/web/src/components/site-footer.tsx`, inside the `t('about')` column, after the `/contact` link:

```tsx
            <FooterLink href="/settings/appearance">{t('appearance')}</FooterLink>
```

- [ ] **Step 3: Write the e2e spec**

Create `app/web/e2e/theme.spec.ts`. The no-cookie case is the one a cookie-only test would miss, so it is covered explicitly:

```ts
import { test, expect } from '@playwright/test'

const PARCHMENT = 'rgb(251, 246, 234)' // #FBF6EA
const MIDNIGHT = 'rgb(19, 18, 42)' // #13122A

const pageBackground = () =>
  // eslint-disable-next-line no-undef
  getComputedStyle(document.body).backgroundColor

test.describe('theme', () => {
  test('follows the OS setting when no choice is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/en')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
    expect(await page.evaluate(pageBackground)).toBe(PARCHMENT)

    await page.emulateMedia({ colorScheme: 'dark' })
    expect(await page.evaluate(pageBackground)).toBe(MIDNIGHT)
  })

  test('an explicit choice beats the OS setting', async ({ page, context }) => {
    await context.addCookies([
      { name: 'revelio.theme', value: 'light', url: 'http://localhost:3000' },
    ])
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(pageBackground)).toBe(PARCHMENT)
  })

  test('the appearance page is reachable signed out and persists a choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/en/settings/appearance')
    await expect(page).toHaveURL(/\/settings\/appearance/)

    await page.getByRole('radio', { name: /light/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(pageBackground)).toBe(PARCHMENT)
  })
})
```

- [ ] **Step 4: Run the e2e suite**

Run: `cd app && /usr/local/bin/npm run e2e -w web -- theme.spec.ts`
Expected: 3 passing. This builds and boots a production server, so it takes a few minutes.

- [ ] **Step 5: Full verification**

Run every gate CI runs:

```bash
cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web && /usr/local/bin/npm run build -w web
```

Expected: all green. Confirm the output before claiming success.

- [ ] **Step 6: Commit**

```bash
cd app && git add web/src/components/site-footer.tsx web/messages web/e2e/theme.spec.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): link appearance settings from the footer and cover theming e2e"
```

---

### Task 10: Dark-mode regression check

The riskiest failure mode for this change is a silent shift in dark mode, which no unit test would catch.

**Files:** none (verification only, plus any fix it turns up).

- [ ] **Step 1: Capture the current branch's dark rendering**

```bash
cd app && /usr/local/bin/npm run dev -w web
```

With `prefers-color-scheme: dark` and no theme cookie, screenshot `/en`, `/en/search?q=harry`, a card detail page, `/en/decks`, and `/en/contact` using the repo's Playwright chromium (Chrome is not installed; run node from `app/`).

- [ ] **Step 2: Compare against main**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio && git stash list && git worktree add /tmp/revelio-main main
```

Run the same dev server and screenshots from the `main` worktree on a different port, then diff the image pairs. The only expected difference is anywhere `destructive` appears, and even that should be nil — `#FF6467` is the exact rasterisation of the old `oklch()` value.

- [ ] **Step 3: Fix any diff, then clean up**

```bash
git worktree remove /tmp/revelio-main
```

- [ ] **Step 4: Commit any fix**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "fix(web): restore dark-mode parity"
```

(Skip if there was no diff.)

---

## Done when

- `/en` renders parchment under `prefers-color-scheme: light` and midnight under dark, with no cookie set.
- `/en/settings/appearance` works signed out, repaints instantly, and survives a reload.
- Dark mode is visually unchanged from `main`.
- `npm test -w web`, `npm run typecheck`, `npm run lint -w web`, `npm run build -w web`, and `npm run e2e -w web` all pass.

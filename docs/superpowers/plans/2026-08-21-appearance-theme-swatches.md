# Appearance Theme Swatches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/settings/appearance` the same card chrome as its four sibling panes, and replace its three radio rows with three selectable tiles that each show a miniature of Revelio painted in that theme's own colours.

**Architecture:** A new decorative `ThemePreview` component renders a miniature Revelio (header strip with the gold mark, search field and nav links, over two rows of four lesson-tinted portrait cards - no primary button, because the real header has none) from a palette that is fixed rather than themed. It gets that palette by reading the raw `--light-*` / `--dark-*` value sets `globals.css` already declares on `:root` — those are unconditional and never reassigned, so the light swatch stays light while the page is dark, with no new CSS and no duplicated hexes. `AppearanceForm` keeps its `RadioGroup` and its whole save path; only the card chrome and the inside of each `Label` change.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (arbitrary custom properties via `bg-(--p-card)`), shadcn/Radix `RadioGroup`, next-intl, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-21-appearance-theme-swatches-design.md`

## Global Constraints

- **All commands run from `app/`.** There is no root-level `package.json`.
- **Toolchain is not on PATH:** prefix node/npm with `/usr/local/bin`, gh/gpg with `/opt/homebrew/bin`.
- **Commit signing:** use `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- **No Claude/Claude Code attribution** in commit messages or PR bodies.
- **Conventional Commits.**
- **Code comments are ASCII only** — no em-dashes, no unicode arrows.
- **No new user-facing strings.** `settings.appearance` in `messages/en.json` and `messages/de.json` already carries `title`, `lead`, `legend`, `system`, `systemHint`, `light`, `lightHint`, `dark`, `darkHint`, `saved`, `error`, and the key sets match. Anything that would need a new string is out of scope.
- **Do not touch** the other four settings panes, `settings-nav.tsx`, `globals.css`, or `theme-actions.ts`.
- **Tailwind v4 responsive variants:** use only the named `sm:` variant for the tile grid. Never mix named (`sm:`) and arbitrary (`min-[640px]:`) variants on the same property — the named one wins regardless of pixel value.
- **Web test files are not typechecked** (`npm run typecheck` skips them). A green typecheck says nothing about the test files; the vitest run is the only signal there.
- **`expect(...).rejects.toThrow()` is broken in `app/web`** — the matcher always errors. Catch the throw by hand if you need one.

## File Structure

| File | Responsibility |
|---|---|
| `web/src/components/settings/theme-preview.tsx` (create) | The decorative miniature. Owns the fixed `--p-*` palette map, the lesson art tints, the single-tone pane, and the diagonal split used for `system`. Exports one component keyed by `ThemeChoice`. |
| `web/src/components/settings/appearance-form.tsx` (modify) | Card chrome + `aria-labelledby`, and tiles instead of rows. Save path, optimistic paint, rollback and toast are untouched. |
| `web/src/components/settings/__tests__/theme-preview.test.tsx` (create) | Guards the load-bearing constraint: the palette is fixed, not themed. |
| `web/src/components/__tests__/appearance-form.test.tsx` (modify) | Keeps the three existing save-path tests; adds the named-region test and the accessible-name test. |

Note the two test directories are genuinely different: the existing appearance test lives in
`components/__tests__/`, while the other settings pane tests live in
`components/settings/__tests__/`. Leave the existing file where it is (moving it would bury the
real diff) and put the new one next to its siblings.

---

### Task 1: The fixed-palette miniature

**Files:**
- Create: `app/web/src/components/settings/theme-preview.tsx`
- Test: `app/web/src/components/settings/__tests__/theme-preview.test.tsx`

**Interfaces:**
- Consumes: `ThemeChoice` from `@/lib/theme` (existing: `'system' | 'light' | 'dark'`).
- Produces: `export function ThemePreview({ choice }: { choice: ThemeChoice })` — renders an `aria-hidden` 4:3 miniature. Task 2 places one inside each tile.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/settings/__tests__/theme-preview.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ThemePreview } from '@/components/settings/theme-preview'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('ThemePreview', () => {
  // The load-bearing constraint: a light swatch has to stay light while the
  // page is dark, or all three tiles render the same and the tile is pointless.
  it('paints from the fixed value sets, not the live theme aliases', () => {
    document.documentElement.dataset.theme = 'dark'
    const { container } = render(<ThemePreview choice="light" />)
    const pane = container.querySelector('[data-tone="light"]') as HTMLElement
    expect(pane.style.getPropertyValue('--p-bg')).toBe('var(--light-background)')
    expect(pane.style.getPropertyValue('--p-card')).toBe('var(--light-card)')
  })

  it('paints the dark preview from the dark value set', () => {
    const { container } = render(<ThemePreview choice="dark" />)
    const pane = container.querySelector('[data-tone="dark"]') as HTMLElement
    expect(pane.style.getPropertyValue('--p-bg')).toBe('var(--dark-background)')
  })

  // "Follow your device setting" means both, so the system tile shows both.
  it('renders both tones for system, with the dark half clipped', () => {
    const { container } = render(<ThemePreview choice="system" />)
    expect(container.querySelector('[data-tone="light"]')).not.toBeNull()
    const dark = container.querySelector('[data-tone="dark"]') as HTMLElement
    expect(dark.style.clipPath).toContain('polygon')
  })

  it('is hidden from assistive tech, so it cannot leak into a radio name', () => {
    const { container } = render(<ThemePreview choice="dark" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `/usr/local/bin/npm test -w web -- src/components/settings/__tests__/theme-preview.test.tsx`
Expected: FAIL — cannot resolve `@/components/settings/theme-preview`.

- [ ] **Step 3: Write the implementation**

Create `app/web/src/components/settings/theme-preview.tsx`:

```tsx
import type { CSSProperties } from 'react'
import type { ThemeChoice } from '@/lib/theme'

type Tone = 'light' | 'dark'

// The preview must not follow the live theme: a light swatch has to stay light
// while the page is dark. globals.css declares every hex exactly once, as
// --light-* and --dark-* value sets on :root that the theme alias blocks point
// at. Those sets are unconditional and never reassigned, so reading them
// directly gives a palette that is fixed by construction - and one that follows
// any future palette edit for free.
const PALETTE: Record<Tone, CSSProperties> = {
  light: {
    '--p-bg': 'var(--light-background)',
    '--p-card': 'var(--light-card)',
    '--p-ink': 'var(--light-foreground)',
    '--p-border': 'var(--light-border)',
    '--p-gold': 'var(--light-primary)',
    '--p-art-1': 'var(--light-lesson-charms)',
    '--p-art-2': 'var(--light-lesson-transfiguration)',
    '--p-art-3': 'var(--light-lesson-potions)',
  } as CSSProperties,
  dark: {
    '--p-bg': 'var(--dark-background)',
    '--p-card': 'var(--dark-card)',
    '--p-ink': 'var(--dark-foreground)',
    '--p-border': 'var(--dark-border)',
    '--p-gold': 'var(--dark-primary)',
    '--p-art-1': 'var(--dark-lesson-charms)',
    '--p-art-2': 'var(--dark-lesson-transfiguration)',
    '--p-art-3': 'var(--dark-lesson-potions)',
  } as CSSProperties,
}

const ART = [
  'var(--p-art-1)', 'var(--p-art-2)', 'var(--p-art-3)', 'var(--p-art-4)',
  'var(--p-art-5)', 'var(--p-art-1)', 'var(--p-art-2)', 'var(--p-art-3)',
]

// One miniature Revelio: the header strip with its gold mark, search field and
// nav links, over a grid of lesson-tinted cards. That is the screen a Revelio
// user actually looks at, so it is the honest sample of a theme. The mark is
// the only gold in the strip - the real header carries no primary button, so
// the miniature does not invent one.
//
// The card art is inset inside the card padding rather than bled to the edge,
// so the card surface - parchment or midnight - is what carries the swatch. A
// full-bleed tint turns the miniature into a row of colour chips and buries the
// thing being chosen.
function Pane({ tone, style }: { tone: Tone; style?: CSSProperties }) {
  return (
    <div
      data-tone={tone}
      style={{ ...PALETTE[tone], ...style }}
      className="absolute inset-0 flex flex-col bg-(--p-bg)"
    >
      <div className="flex h-[16%] shrink-0 items-center gap-1 border-b border-(--p-border) bg-(--p-card) px-1.5">
        <span className="size-[7px] shrink-0 rounded-full bg-(--p-gold)" />
        <span className="h-[3px] w-[22px] shrink-0 rounded-full bg-(--p-ink) opacity-55" />
        <span className="ml-auto h-[7px] w-[38%] rounded-full bg-(--p-ink) opacity-10" />
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-1.5 p-1.5">
        {ART.map((tint) => (
          <div
            key={tint}
            className="flex aspect-5/7 flex-col gap-0.5 rounded-[3px] border border-(--p-border) bg-(--p-card) p-0.5"
          >
            <span className="h-[52%] shrink-0 rounded-[2px] opacity-90" style={{ background: tint }} />
            <span className="mx-0.5 h-[2px] rounded-full bg-(--p-ink) opacity-30" />
            <span className="mx-0.5 h-[2px] w-[55%] rounded-full bg-(--p-ink) opacity-20" />
          </div>
        ))}
      </div>
      <span className="absolute right-2 bottom-2 h-2.5 w-8 rounded-[3px] bg-(--p-gold)" />
    </div>
  )
}

// The dark half is cut on the anti-diagonal, and the seam is a thin
// parallelogram clipped to hug that same edge - which lands exactly on the cut
// at any aspect ratio, unlike a linear-gradient angle. Brand gold (#E8B23A,
// --dark-primary) because the seam belongs to neither half.
const SPLIT_CLIP = 'polygon(100% 0, 100% 100%, 0 100%)'
const SEAM_CLIP = 'polygon(0 100%, 100% 0, 100% 2px, 0 calc(100% - 2px))'

export function ThemePreview({ choice }: { choice: ThemeChoice }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-4/3 overflow-hidden rounded-md border border-border"
    >
      <Pane tone={choice === 'dark' ? 'dark' : 'light'} />
      {choice === 'system' && (
        <>
          <Pane tone="dark" style={{ clipPath: SPLIT_CLIP }} />
          <span
            className="absolute inset-0"
            style={{ background: 'var(--dark-primary)', clipPath: SEAM_CLIP }}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `/usr/local/bin/npm test -w web -- src/components/settings/__tests__/theme-preview.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/settings/theme-preview.tsx \
        app/web/src/components/settings/__tests__/theme-preview.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add a fixed-palette theme preview miniature"
```

---

### Task 2: Card chrome and swatch tiles

**Files:**
- Modify: `app/web/src/components/settings/appearance-form.tsx`
- Test: `app/web/src/components/__tests__/appearance-form.test.tsx`

**Interfaces:**
- Consumes: `ThemePreview` from Task 1.
- Produces: nothing new. `AppearanceForm`'s props (`{ current: ThemeChoice }`) are unchanged, so `appearance/page.tsx` and `settings/__tests__/pages.test.tsx` need no edit.

- [ ] **Step 1: Write the failing tests**

Append two tests inside the existing `describe('AppearanceForm', ...)` block in
`app/web/src/components/__tests__/appearance-form.test.tsx`. Leave the three existing tests
exactly as they are — they cover the save path, which this task must not change.

```tsx
  // The other four settings panes each expose a named region; this one did not.
  it('exposes the pane as a named region, like its sibling panes', () => {
    renderForm('system')
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeInTheDocument()
  })

  // The miniature is decoration. If it ever leaked into the accessible name,
  // screen-reader users would hear the markup instead of the choice.
  it('keeps each radio named by its option and hint alone', () => {
    renderForm('system')
    expect(screen.getByRole('radio', { name: 'Dark Midnight and gold' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/usr/local/bin/npm test -w web -- src/components/__tests__/appearance-form.test.tsx`
Expected: the two new tests FAIL — no element with role `region` (the bare `<section>` has no
accessible name), and the radio's name is `Dark Midnight and gold` only by luck of the current
markup, so confirm which of the two actually fails before implementing. The three existing tests
PASS.

- [ ] **Step 3: Write the implementation**

Replace the `return (...)` block of `app/web/src/components/settings/appearance-form.tsx`. Every
line above it — the imports, `CHOICES`, `useState`, `useTransition`, `paint`, `apply` — stays
exactly as it is. Add the `ThemePreview` import alongside the existing ones.

```tsx
import { ThemePreview } from './theme-preview'
```

```tsx
  return (
    <section aria-labelledby="s-appearance" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-appearance" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <RadioGroup
        value={choice}
        onValueChange={apply}
        aria-label={t('legend')}
        className="mt-6 sm:grid-cols-3"
      >
        {/* The whole tile is the label, so the pointer and the click target
            cover the swatch rather than just the dot and its caption. */}
        {CHOICES.map((value) => (
          <Label
            key={value}
            htmlFor={`theme-${value}`}
            className="flex cursor-pointer flex-col items-stretch gap-2.5 rounded-xl border p-2.5 transition-colors hover:bg-(--hover-bg) has-data-[state=checked]:border-secondary-ink has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-secondary-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <RadioGroupItem value={value} id={`theme-${value}`} className="sr-only" />
            <ThemePreview choice={value} />
            <span className="flex items-start gap-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{t(value)}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {t(`${value}Hint`)}
                </span>
              </span>
              <RadioGroupItem value={value} id={`theme-${value}`} className="mt-0.5 ml-auto" />
            </span>
          </Label>
        ))}
      </RadioGroup>
    </section>
  )
```

Two things to be careful about:

1. `RadioGroup`'s primitive already applies `grid gap-3`, so the className only adds `mt-6` and
   `sm:grid-cols-3`. Do not add `grid` again and do not change the gap.
2. Keep `RadioGroupItem`, but `sr-only`. The demo used a check badge; a visible dot beside a
   tile that is already a picture of the theme is redundant chrome. Hiding rather than dropping
   it keeps the roving tabindex, the accessible name and the form semantics as the primitive's.
3. Because the dot is hidden, the tile border is the only selection cue, so style it off the
   primitive's own state with `has-data-[state=checked]:` - do not mirror `data-state` onto the
   `Label`, that is a second copy of the same state. Use `secondary-ink`, **not** `primary`:
   `--primary` is `#F0C458` in light, 1.6:1 on the card, under the 3:1 WCAG 1.4.11 asks of a
   state indicator; gold also appears inside the miniature, and `--ring` is gold in both themes,
   so a gold border would collide with the focus outline.
4. Focus goes on the `Label` as an `outline` (`has-[:focus-visible]:outline-*`), not a ring: the
   sr-only dot cannot show one, and the selected state already owns the ring.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/usr/local/bin/npm test -w web -- src/components/__tests__/appearance-form.test.tsx`
Expected: PASS, 5 tests. The three save-path tests must still pass untouched — if
`marks the current choice as selected` or either `setTheme` test broke, the `RadioGroup` wiring
was changed and must be put back.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/settings/appearance-form.tsx \
        app/web/src/components/__tests__/appearance-form.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): show each theme as a swatch on the appearance pane"
```

---

### Task 3: Verify in the real app, both themes and mobile

**Files:**
- No source changes expected. If this task finds a defect, fix it and fold the fix into its own commit.

**Interfaces:**
- Consumes: the shipped `/settings/appearance` route.
- Produces: nothing. This is the gate before the PR.

- [ ] **Step 1: Run the full quality gate**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint -w web
/usr/local/bin/npm test
```

Expected: all three clean. Baseline on `main` before this branch was 700 tests across 148 files;
this branch adds 6, so expect 706 across 149. A different baseline is fine — a *failure* is not.

- [ ] **Step 2: Screenshot the page in both themes**

There is no Chrome on this machine; use the repo's bundled chromium via `playwright`, and run
node from `app/` so module resolution finds `node_modules`. Requires a signed-in session, so
either drive the login flow or reuse an existing storage state.

Write `app/_verify.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme })
  await p.goto('http://localhost:3000/en/settings/appearance')
  await p.waitForTimeout(500)
  await p.screenshot({ path: `/tmp/appearance-${scheme}.png`, fullPage: true })
}
const m = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' })
await m.goto('http://localhost:3000/en/settings/appearance')
await m.waitForTimeout(500)
await m.screenshot({ path: '/tmp/appearance-mobile.png', fullPage: true })
await b.close()
```

Run: `cd app && /usr/local/bin/npm run dev -w web` in one shell, then
`cd app && /usr/local/bin/node _verify.mjs` in another. Delete `_verify.mjs` afterwards.

- [ ] **Step 3: Check the screenshots against these four claims**

1. The light swatch is parchment and the dark swatch is midnight **in both page themes**. If they
   look the same, the palette is following the alias tokens and Task 1's fix did not land.
2. The Appearance card sits flush with the Profile card above it — same border, same radius, same
   padding. Compare against `/en/settings/profile`.
3. The System tile's gold seam lands exactly on the boundary between the two halves, with no
   visible offset at either corner.
4. At 390px the tiles are one per row and nothing overflows horizontally.

- [ ] **Step 4: Commit any fix, then open the PR**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git push -u origin feat/appearance-theme-swatches
/opt/homebrew/bin/gh pr create --title "feat(web): show each theme as a swatch on the appearance pane" --body "<body>"
```

The PR body must state that the Appearance pane previously rendered a bare `<section>`, so this
also makes it a named `region` like its four siblings. No Claude attribution.

---

## Self-Review

**Spec coverage.** Card chrome + `aria-labelledby` — Task 2. Miniature as a card grid on a ground,
inset art — Task 1. Diagonal split with brand-gold seam — Task 1. Fixed palette from the raw
`--light-*` / `--dark-*` sets — Task 1, guarded by its first test. `RadioGroup` semantics and
`aria-hidden` decoration — Task 2, guarded by the accessible-name test. `sm:` breakpoint — Task 2.
No new copy — Global Constraints, verified against both locale files before this plan was written.

**Type consistency.** `ThemePreview({ choice }: { choice: ThemeChoice })` is defined in Task 1 and
called with exactly that prop in Task 2. `Tone` is internal to `theme-preview.tsx` and never
crosses the module boundary. `AppearanceForm`'s props do not change, so `appearance/page.tsx` and
`settings/__tests__/pages.test.tsx` stay valid.

**Known risk.** `bg-(--p-card)` and friends depend on Tailwind v4 resolving arbitrary custom
properties. The codebase already ships `hover:bg-(--hover-bg)` in this very file, so the syntax is
proven here; but the `--p-*` names are set inline on the same element that consumes them, which is
a pattern the codebase has not used before. If a swatch renders transparent, that is the cause —
move the `style` onto a wrapper element one level up from the consumers.

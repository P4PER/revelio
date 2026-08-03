# Touch-accessible hover affordances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every hover-revealed control reachable on touch devices, and force the collection page's under-card stepper layout (hiding its selector) on touch.

**Architecture:** Two mechanisms, by case. A shared CSS `touch:` Tailwind variant (`@media (hover: none)`) reveals presentational hover-only controls with zero JS and no SSR flash. A small `useHasHover()` React hook handles the one structural case — the collection tile, where panel vs overlay are different DOM trees chosen by a prop.

**Tech Stack:** Next.js 16 (App Router, React 19), Tailwind v4 (custom variants in `globals.css`), next-intl, Vitest + Testing Library (jsdom).

## Global Constraints

- All app commands run from `app/`. Node/npm are at `/usr/local/bin` (not on PATH); prefix as needed: `/usr/local/bin/npm`.
- User-facing strings come from `messages/en.json` + `messages/de.json` — never hardcode. (This plan adds no new strings; it reuses existing keys.)
- Tailwind v4 orders arbitrary/named responsive variants unusually; do not mix them on one property. For the `touch:` variant, verify the compiled result visually rather than assuming cascade order.
- Conventional Commits. No Claude/Claude Code attribution in commits or PRs.
- Commit signing may need: `git -c gpg.program=/opt/homebrew/bin/gpg commit …`.
- Work happens on branch `fix/touch-hover-affordances` (already created).

---

## File Structure

- `app/web/src/app/globals.css` — **modify**: add the `touch:` custom variant.
- `app/web/src/hooks/use-has-hover.ts` — **create**: `useHasHover()` hook.
- `app/web/src/hooks/__tests__/use-has-hover.test.tsx` — **create**: hook unit test.
- `app/web/src/components/deck-card-browser.tsx` — **modify**: Add + info buttons.
- `app/web/src/components/deck-panel.tsx` — **modify**: info button.
- `app/web/src/components/deck-gallery.tsx` — **modify**: info button.
- `app/web/src/components/card-rotate.tsx` — **modify**: rotate button.
- `app/web/src/components/image-uploader.tsx` — **modify**: scrim + corner hint.
- `app/web/src/components/set-symbol-uploader.tsx` — **modify**: scrim + corner hint.
- `app/web/src/components/collection-view.tsx` — **modify**: wire the hook.

---

## Task 1: Add the `touch:` variant and reveal presentational controls

Adds the shared variant, then makes every simple hover-reveal control always-visible on touch. Pure CSS/class changes — no unit test is meaningful; verification is typecheck + lint + a visual check under `(hover: none)` emulation.

**Files:**
- Modify: `app/web/src/app/globals.css` (custom-variant block, near line 5)
- Modify: `app/web/src/components/deck-card-browser.tsx:227,253`
- Modify: `app/web/src/components/deck-panel.tsx:121`
- Modify: `app/web/src/components/deck-gallery.tsx:45`
- Modify: `app/web/src/components/card-rotate.tsx:92`

**Interfaces:**
- Produces: a `touch:` Tailwind variant usable as `touch:<utility>` anywhere in the web app, compiling to `@media (hover: none) { … }`.

- [ ] **Step 1: Add the `touch:` custom variant**

In `globals.css`, directly below the existing `@custom-variant dark (&:is(.dark *));` line, add:

```css
/* Touch devices (no hover): reveal controls that are otherwise hover-only. */
@custom-variant touch (@media (hover: none));
```

- [ ] **Step 2: Reveal the deck browser "Add to deck" button**

In `deck-card-browser.tsx`, the Add button (currently line 227) className ends with
`… group-hover:opacity-100 data-[state=open]:opacity-100`. Append `touch:opacity-100`:

```tsx
className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
```

Leave the hover **scrim** at line ~216 (`bg-background/45 … group-hover:opacity-100`) unchanged: showing it on touch would permanently dim every card in the browse grid. The Add button carries its own `shadow`, so it stays legible over raw art.

- [ ] **Step 3: Reveal the deck browser info button**

In `deck-card-browser.tsx`, the info button (currently line 253) className ends with `… group-hover:opacity-100`. Append `touch:opacity-100`:

```tsx
className="absolute top-1.5 right-1.5 opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
```

- [ ] **Step 4: Reveal the deck-panel info button**

In `deck-panel.tsx` (currently line 121), append `touch:opacity-100` to the info button className:

```tsx
className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-primary focus-visible:opacity-100 touch:opacity-100"
```

- [ ] **Step 5: Reveal the deck-gallery info button**

In `deck-gallery.tsx` (currently line 45), append `touch:opacity-100`:

```tsx
className="absolute top-2 right-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
```

- [ ] **Step 6: Reveal the card-rotate button**

In `card-rotate.tsx` (currently line 92), append `touch:opacity-100`:

```tsx
className="absolute top-2 left-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
```

- [ ] **Step 7: Typecheck and lint**

Run: `/usr/local/bin/npm run typecheck` and `/usr/local/bin/npm run lint -w web`
Expected: both pass (lint may emit the repo's pre-existing warnings, no new errors).

- [ ] **Step 8: Visual verification under emulated touch**

Run: `/usr/local/bin/npm run dev -w web`. In the browser devtools, emulate `(hover: none)` (Rendering tab → "Emulate CSS media feature hover: none", or a mobile device profile). Confirm: on the deck browser the Add + info buttons are visible without hovering; card rotate and deck-gallery/deck-panel info buttons are visible. Toggle back to `hover: hover` and confirm they return to hover-reveal (hidden at rest). Note any case where `touch:opacity-100` did **not** win over `opacity-0` (a v4 ordering pitfall) and, if so, replace `touch:opacity-100` with the arbitrary form `[@media(hover:none)]:opacity-100` at that site.

- [ ] **Step 9: Commit**

```bash
git add app/web/src/app/globals.css app/web/src/components/deck-card-browser.tsx app/web/src/components/deck-panel.tsx app/web/src/components/deck-gallery.tsx app/web/src/components/card-rotate.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): reveal hover-only controls on touch via a touch: variant"
```

---

## Task 2: Touch-friendly uploader affordance

The uploaders reveal a full-image dark scrim ("Change image") on hover. Always-showing that scrim on touch would permanently darken the preview. Instead: hide the scrim on touch and show a small persistent corner icon. Both uploader tiles are already `role="button"` with an `aria-label` and a tap handler, so the corner icon is a purely visual hint (`aria-hidden`, `pointer-events-none`). No new strings. Verification is typecheck + lint + visual.

**Files:**
- Modify: `app/web/src/components/image-uploader.tsx:112-120`
- Modify: `app/web/src/components/set-symbol-uploader.tsx:124`

**Interfaces:**
- Consumes: the `touch:` variant from Task 1.

- [ ] **Step 1: Image uploader — hide scrim on touch**

In `image-uploader.tsx`, add `touch:hidden` to the scrim overlay `div` (currently line 112-116) so it never shows on touch. Its class string becomes:

```tsx
className={cn(
  'absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 touch:hidden',
  dragOver && 'opacity-100',
)}
```

- [ ] **Step 2: Image uploader — add the persistent corner hint**

Immediately after that scrim `div`'s closing `</div>` (after the `changeImage` span block, around line 120), add a touch-only corner badge:

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute right-2 bottom-2 hidden touch:flex items-center justify-center rounded-full bg-black/60 p-2 text-white shadow"
>
  <ImagePlus className="size-5" />
</div>
```

`ImagePlus` is already imported in this file. The tile's existing `aria-label={t('changeImage')}` covers the accessible name.

- [ ] **Step 3: Set-symbol uploader — hide scrim on touch**

In `set-symbol-uploader.tsx`, add `touch:hidden` to the scrim overlay `div` (currently line 124):

```tsx
<div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 touch:hidden">
  <ImagePlus className="size-5" />
</div>
```

- [ ] **Step 4: Set-symbol uploader — add the persistent corner hint**

Immediately after that scrim `div` (before the `busy` block, around line 126), add:

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute right-1.5 bottom-1.5 hidden touch:flex items-center justify-center rounded-full bg-black/60 p-1.5 text-white shadow"
>
  <ImagePlus className="size-4" />
</div>
```

`ImagePlus` is already imported. The tile's existing `aria-label={t('symbol')}` covers the accessible name.

- [ ] **Step 5: Typecheck and lint**

Run: `/usr/local/bin/npm run typecheck` and `/usr/local/bin/npm run lint -w web`
Expected: both pass with no new errors.

- [ ] **Step 6: Visual verification under emulated touch**

With `(hover: none)` emulated on the card edit page (image uploader) and the admin set form (symbol uploader): confirm the full dark "Change image" scrim does **not** cover the preview, the small corner `ImagePlus` badge is visible, and tapping the tile still opens the file picker. Toggle back to `hover: hover` and confirm the original hover scrim returns and the corner badge is gone.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/image-uploader.tsx app/web/src/components/set-symbol-uploader.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give uploaders a touch-friendly corner affordance"
```

---

## Task 3: `useHasHover()` hook

The one structural case (Task 4) needs to know hover capability in JS. Build the hook first, with a unit test. It mirrors the proven `useIsMac()` pattern in `components/ui/kbd-hint.tsx`.

**Files:**
- Create: `app/web/src/hooks/use-has-hover.ts`
- Create: `app/web/src/hooks/__tests__/use-has-hover.test.tsx`

**Interfaces:**
- Produces: `export function useHasHover(): boolean` — `true` when the primary input can hover (server/initial snapshot is `true`), `false` on touch after hydration.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/hooks/__tests__/use-has-hover.test.tsx`. jsdom has no `matchMedia`, so stub it per-test. A tiny probe component renders the hook's result.

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useHasHover } from '../use-has-hover'

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function Probe() {
  return <span>{useHasHover() ? 'hover' : 'touch'}</span>
}

afterEach(() => {
  // @ts-expect-error — remove the stub between tests
  delete window.matchMedia
})

describe('useHasHover', () => {
  it('reports hover when (hover: hover) matches', () => {
    stubMatchMedia(true)
    render(<Probe />)
    expect(screen.getByText('hover')).toBeInTheDocument()
  })

  it('reports touch when (hover: hover) does not match', () => {
    stubMatchMedia(false)
    render(<Probe />)
    expect(screen.getByText('touch')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `/usr/local/bin/npm test -w web -- src/hooks/__tests__/use-has-hover.test.tsx`
Expected: FAIL — cannot resolve `../use-has-hover`.

- [ ] **Step 3: Write the hook**

Create `app/web/src/hooks/use-has-hover.ts`:

```ts
'use client'
import { useSyncExternalStore } from 'react'

// Hover capability read via useSyncExternalStore, mirroring useIsMac() in
// components/ui/kbd-hint.tsx: the server snapshot assumes hover (desktop) and
// the client corrects to the real device after hydration without a mismatch
// warning. Hover capability doesn't change at runtime, so nothing to subscribe
// to. Used to force touch-friendly layouts where a hover affordance is unusable.
const noopSubscribe = () => () => {}

export function useHasHover() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.matchMedia('(hover: hover)').matches,
    () => true,
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `/usr/local/bin/npm test -w web -- src/hooks/__tests__/use-has-hover.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `/usr/local/bin/npm run typecheck`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/hooks/use-has-hover.ts app/web/src/hooks/__tests__/use-has-hover.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add useHasHover hook for touch-aware layout"
```

---

## Task 4: Force the collection panel layout and hide the selector on touch

Wire `useHasHover()` into `CollectionView`: derive an effective layout that is always `'panel'` on touch, and hide the panel/overlay selector on touch. The saved cookie is read/written unchanged (mobile ignores it without overwriting).

**Files:**
- Modify: `app/web/src/components/collection-view.tsx`

**Interfaces:**
- Consumes: `useHasHover()` from Task 3; the existing `layout` state and `StepperLayout` type.

- [ ] **Step 1: Import the hook**

In `collection-view.tsx`, add the import alongside the other `@/` imports:

```tsx
import { useHasHover } from '@/hooks/use-has-hover'
```

- [ ] **Step 2: Derive the effective layout**

After the existing `const [layout, setLayout] = useState<StepperLayout>(stepperLayout)` block (line ~45) and its `setLayoutPref`, add:

```tsx
// On touch there is no hover, so the overlay layout (hover-revealed steppers)
// is unusable — force the panel (under-card) layout and hide the selector. The
// cookie is left untouched, so a later desktop visit still honors the choice.
const hasHover = useHasHover()
const effectiveLayout: StepperLayout = hasHover ? layout : 'panel'
```

- [ ] **Step 3: Use the effective layout in the grid**

In the `grid` helper (line ~95), change the tile prop from `stepperLayout={layout}` to `stepperLayout={effectiveLayout}`:

```tsx
<CollectionCardTile card={c} quantities={quantities[c.id] ?? {}} editable={editable} locale={locale} stepperLayout={effectiveLayout} />
```

- [ ] **Step 4: Hide the selector on touch**

Change the selector gate (line ~107) from `{editable && (` to `{editable && hasHover && (`:

```tsx
{editable && hasHover && (
  <div className="flex items-center gap-1" role="group" aria-label={t('layoutLabel')}>
```

Leave the two `Button`s inside unchanged (they still call `setLayoutPref`).

- [ ] **Step 5: Typecheck and lint**

Run: `/usr/local/bin/npm run typecheck` and `/usr/local/bin/npm run lint -w web`
Expected: both pass with no new errors.

- [ ] **Step 6: Visual verification under emulated touch**

On a signed-in owner's collection page with `(hover: none)` emulated: the panel/overlay selector is absent, and steppers render **under** each card (panel layout) regardless of the saved preference. Toggle to `hover: hover`: the selector reappears and honors the cookie. Set the cookie preference to overlay on desktop, then emulate touch: layout falls back to panel and the cookie value is unchanged (re-check on desktop that overlay is still selected).

- [ ] **Step 7: Run the full web test suite**

Run: `/usr/local/bin/npm test -w web`
Expected: PASS (no regressions; the new hook test included).

- [ ] **Step 8: Commit**

```bash
git add app/web/src/components/collection-view.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): force under-card collection layout and hide selector on touch"
```

---

## Final verification

- [ ] Run `/usr/local/bin/npm run typecheck`, `/usr/local/bin/npm run lint -w web`, and `/usr/local/bin/npm test -w web` from `app/` — all green.
- [ ] Optionally `/usr/local/bin/npm run build -w web` to confirm the production build (and the new `touch:` variant) compiles.
- [ ] Push the branch and open a PR (Conventional Commit title, no Claude attribution).

---

## Self-Review

**Spec coverage:**
- `touch:` variant added (spec §Tool 1) → Task 1 Step 1. ✅
- Presentational reveals: deck Add/info, deck-panel info, deck-gallery info, card-rotate (spec §Tool 1 table) → Task 1 Steps 2–6. ✅ (The spec listed the deck-browser scrim at line 216; this plan intentionally leaves it hover-only to avoid dimming the whole browse grid on touch — noted in Task 1 Step 2. The spec table is updated to match.)
- Uploaders: hide scrim + persistent corner affordance (spec §Tool 1b) → Task 2. ✅ (The uploader *remove* buttons are already always-visible text buttons — verified — so no touch fix needed there.)
- `useHasHover()` hook mirroring `useIsMac()` (spec §Tool 2) → Task 3. ✅
- Collection: effective layout + hide selector, cookie untouched (spec §Tool 2) → Task 4. ✅
- Localization: no new strings; reuses `changeImage` / `symbol` aria-labels (spec §Localization) → Task 2. ✅
- Testing: hook unit test + visual checks on touch and hover (spec §Testing) → Tasks 3 & 4. ✅

**Placeholder scan:** No TBD/TODO; every code step shows the exact class string or code. ✅

**Type consistency:** `useHasHover(): boolean` defined in Task 3 and consumed in Task 4; `effectiveLayout` typed `StepperLayout` matching the existing `stepperLayout` prop. ✅

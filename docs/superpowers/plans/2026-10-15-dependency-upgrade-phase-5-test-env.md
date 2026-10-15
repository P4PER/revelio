# Dependency Upgrade Phase 5: Test Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move web's test DOM from jsdom 26 to 29.1.1 and jest-dom from 6 to 7.0.1, fixing the five tests jsdom 29 breaks, each at its real cause.

**Architecture:** Four distinct jsdom 29 changes, each diagnosed on 2026-10-15 by running the failing test under jsdom 29 against the current tree (see "Diagnosis" per task). One fix goes in the shared test setup, three in tests, and one in a component, where jsdom cannot represent the CSS it sets.

**Tech Stack:** jsdom 29, Vitest 5, Testing Library, React 19.

**Spec:** `docs/superpowers/specs/2026-10-15-dependency-upgrade-design.md`
**Prerequisite:** [Phase 1](2026-10-15-dependency-upgrade-phase-1-toolchain.md) merged. Branch `chore/upgrade-test-env` from `main`.

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH`.
- A test is changed only where jsdom 29 is closer to a browser than jsdom 26 was. A test is never loosened to make it pass. Each changed assertion keeps the behaviour it pinned.
- Code comments are ASCII-only.
- Commits: Conventional Commits, no attribution, `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- The `AnimationEvent` polyfill must run before `react-dom` is imported. React picks its animation event names once, at module load.
- The deck-sheet test must still catch the bug it was written for: the drag flag latching after a gesture with no click. Prove it by mutation.
- The filter-rail mask must look identical in a real browser after the move to custom properties. Check with a Playwright screenshot of `/en/search` at mobile width.
- The appearance-form name test must still fail if the preview's text leaks into the radio's name.
- jest-dom 7: matchers used across 1332 tests. A silently changed matcher would show as new failures, which must be zero.

---

### Task 1: Bump and confirm the five failures

**Files:**
- Modify: `app/web/package.json`, `app/package-lock.json`

- [ ] **Step 1:** `npm install jsdom@^29.1.1 @testing-library/jest-dom@^7.0.1 -w web --save-dev`
- [ ] **Step 2:** `npm test -w web 2>&1 | grep -E "^ +(Tests) | FAIL "`. Expected: exactly these 5 failures:
  - `card-nav.test.tsx` "fades the hint out when its animation ends..."
  - `deck-sheet.test.tsx` "still opens on the tap after a gesture that never produced a click"
  - `filter-rail.test.tsx` "fades only the end the lane continues past" and "drops the fade once the lane is wide enough to stop scrolling"
  - `appearance-form.test.tsx` "keeps each radio named by its option and hint alone"

  Any other failure is new, so diagnose it before going on.

### Task 2: AnimationEvent in the test window (card-nav)

**Diagnosis:** jsdom 29 still has no `AnimationEvent`, but its `CSSStyleDeclaration` now knows the `WebkitAnimation` property. React's `getVendorPrefixedEventName` drops the unprefixed `animation` candidate when `AnimationEvent` is missing and then picks the first remaining property present on a `div`'s style. Under jsdom 26 there was none, so React fell back to `animationend`. Under 29 it finds `WebkitAnimation`, so `onAnimationEnd` listens for `webkitAnimationEnd`, and the test's `animationend` is never heard. Every browser ships `AnimationEvent`. Verified: with the polyfill below, `card-nav.test.tsx` passes 16/16 under jsdom 29.

**Files:**
- Modify: `app/web/vitest.setup.ts` (top of file, before anything imports React)

- [ ] **Step 1: Add the polyfill** as the first statements of `vitest.setup.ts`. If the file starts with imports, put it in a new `vitest-stubs/animation-event.ts` and list that file **first** in `setupFiles` in `vitest.config.mts` instead. Static imports are hoisted, and the polyfill must run before `react-dom` loads.

```ts
// jsdom has no AnimationEvent, but since jsdom 29 its style object knows
// WebkitAnimation. React picks its animationend listener name once, at load:
// without AnimationEvent it skips the unprefixed name and, finding
// WebkitAnimation, listens for webkitAnimationEnd - so onAnimationEnd never
// fires for an "animationend". Every browser has AnimationEvent; this restores
// the browser's choice.
if (!('AnimationEvent' in window)) {
  class AnimationEvent extends Event {
    readonly animationName: string
    readonly elapsedTime: number
    readonly pseudoElement: string
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init)
      this.animationName = init.animationName ?? ''
      this.elapsedTime = init.elapsedTime ?? 0
      this.pseudoElement = init.pseudoElement ?? ''
    }
  }
  Object.defineProperty(window, 'AnimationEvent', { value: AnimationEvent, configurable: true, writable: true })
}
```

- [ ] **Step 2: Simplify the test's event.** With a real constructor, the comment and `defineProperty` workaround in `card-nav.test.tsx` can go:

```ts
    // Animation done: start fading (still mounted, now opacity-0).
    fireEvent(frame(container), new AnimationEvent('animationend', { bubbles: true, animationName: 'chevron-hint' }))
```

- [ ] **Step 3:** `npm test -w web -- card-nav`. Expected: 16 passed.
- [ ] **Step 4: Commit** `test(web): give the jsdom window an AnimationEvent`.

### Task 3: Drag the deck sheet the way that keeps it shut

**Diagnosis:** jsdom 29 implements `PointerEvent`, so `fireEvent.pointerMove(handle, { clientY: 300 })` now carries a real `clientY`. Under jsdom 26 the event was a plain `Event` and the move did not register as travel. The test drags **up** 100 px and cancels. `onPointerCancel` is `handlePointerUp` by design, so a real upward flick snaps the sheet open (`aria-expanded` is `true` after the cancel). The following tap then closes it. Verified: logging after the cancel prints `true`. With the drag pointed **down** (`clientY: 500`), it prints `false` and the test passes.

**Files:**
- Modify: `app/web/src/components/deck/__tests__/deck-sheet.test.tsx` (the "never produced a click" test)

- [ ] **Step 1: Point the drag down.** A collapsed sheet clamps there, so the gesture still latches the drag flag but cannot change state:

```tsx
    // A drag that is cancelled mid-gesture, with no click after it. Downward,
    // so the collapsed sheet clamps and stays shut: an upward flick snaps it
    // open on cancel (cancel ends a drag like pointerup does), and the tap
    // after it would then close the sheet for an unrelated reason.
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 500 })
    fireEvent.pointerCancel(handle, { pointerId: 1, clientY: 500 })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
```

- [ ] **Step 2:** `npm test -w web -- deck-sheet`. Expected: all pass.
- [ ] **Step 3: Mutation check.** In `deck-sheet.tsx`, comment out the `dragged.current = false` line in `handlePointerDown` (the one under "Clear here, not only in handleClick"). Run the test and expect it to FAIL on the final `aria-expanded` `'true'`. Restore the line and run it green again. Record this in the PR.
- [ ] **Step 4: Commit** `test(deck): drag the sheet down in the latched-flag test`.

### Task 4: Filter-rail fade through custom properties

**Diagnosis:** jsdom 29's CSS parser rejects a `calc()` colour-stop position inside a gradient. `linear-gradient(to right, transparent 0, #000 0px, #000 calc(100% - 2rem), transparent 100%)` sets to `""`, while the same gradient without `calc()` is kept, and is re-serialised with `#000` as `rgb(0, 0, 0)`. The CSS is valid and browsers accept it, so the component is right and jsdom cannot represent it. Custom properties are stored verbatim, so the varying stops move into two custom properties. The gradient becomes a static class that tests do not need to parse.

**Files:**
- Modify: `app/web/src/components/search/filter-rail.tsx` (the lane's `style`, around line 92)
- Modify: `app/web/src/components/search/__tests__/filter-rail.test.tsx`

- [ ] **Step 1: Rewrite the two tests first.**

```tsx
  it('fades only the end the lane continues past', () => {
    renderRail()
    const lane = screen.getByRole('group', { name: 'Type' })
    // Resting at the start: the far end is cut off, the near end is not.
    expect(lane.style.getPropertyValue('--lane-fade-start')).toBe('0px')
    expect(lane.style.getPropertyValue('--lane-fade-end')).toBe('calc(100% - 2rem)')

    lane.scrollLeft = 100
    fireEvent.scroll(lane)
    expect(lane.style.getPropertyValue('--lane-fade-start')).toBe('2rem')
    expect(lane.style.getPropertyValue('--lane-fade-end')).toBe('100%')
  })

  it('drops the fade once the lane is wide enough to stop scrolling', () => {
    renderRail()
    const lane = screen.getByRole('group', { name: 'Type' })
    expect(lane).toHaveClass('lane-fade')
    // What md does: the lane wraps instead of scrolling, so nothing overflows.
    lane.dataset.clientwidth = '400'
    act(() => resize?.())
    expect(lane).not.toHaveClass('lane-fade')
    expect(lane.style.getPropertyValue('--lane-fade-start')).toBe('')
  })
```

Run `npm test -w web -- filter-rail`. Expected: both FAIL (no custom properties yet).

- [ ] **Step 2: Move the gradient into CSS.** Add to `app/web/src/app/globals.css`, beside the other component utilities:

```css
/* Filter-rail lane fade. The two stops move with the scroll position and are set
   inline as custom properties by filter-rail.tsx; the gradient itself is static. */
@utility lane-fade {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--lane-fade-start),
    #000 var(--lane-fade-end),
    transparent 100%
  );
}
```

In `filter-rail.tsx`, replace the `style` prop and add the class:

```tsx
      className={cn(/* existing classes */, !fits && 'lane-fade')}
      style={
        fits
          ? undefined
          : ({
              '--lane-fade-start': atStart ? '0px' : '2rem',
              '--lane-fade-end': atEnd ? '100%' : 'calc(100% - 2rem)',
            } as React.CSSProperties)
      }
```

Keep the existing `cn(...)` arguments as they are. Only `!fits && 'lane-fade'` is appended.

- [ ] **Step 3:** `npm test -w web -- filter-rail`. Expected: all pass.
- [ ] **Step 4: Visual check** (Review Focus 3). Screenshot `/en/search` at 390x844, DPR 1, in light and dark, before (on `main`) and after, with the type lane scrolled to its start and to its middle. Use the repo's Playwright chromium by absolute path. Expected: identical fades. Stale Turbopack CSS: `rm -rf web/.next/dev` if the utility does not appear.
- [ ] **Step 5: Commit** `refactor(search): drive the filter-rail fade through custom properties`, with a body naming the jsdom 29 `calc()` gradient rejection as the reason.

### Task 5: Radio name without CSS layout (appearance-form)

**Diagnosis:** The radio's accessible name comes from its `<label>`'s content: `<span>Dark</span><span>Midnight and gold</span>` inside a `flex flex-col` span. In a browser, the flex column blockifies both spans and the name is "Dark Midnight and gold". jsdom loads no stylesheet. jsdom 26's `getComputedStyle(span).display` was `""` (verified), and dom-accessibility-api treats anything but `inline` as a block and inserts a space. jsdom 29 reports the real default, `inline` (verified), so the name is "DarkMidnight and gold". jsdom 29 is right about the default and cannot see Tailwind's `flex-col`.

**Files:**
- Modify: `app/web/src/components/settings/__tests__/appearance-form.test.tsx:52-55`

- [ ] **Step 1: Assert the name while tolerating the missing layout.** The test's point is "option and hint alone", so the anchors stay:

```tsx
  it('keeps each radio named by its option and hint alone', () => {
    renderForm('system')
    // A browser names it "Dark Midnight and gold": the flex column blockifies
    // both spans. jsdom loads no CSS, so it joins them without the space.
    expect(screen.getByRole('radio', { name: /^Dark ?Midnight and gold$/ })).toBeInTheDocument()
  })
```

- [ ] **Step 2:** `npm test -w web -- appearance-form`. Expected: pass.
- [ ] **Step 3: Mutation check.** In `appearance-form.tsx`, temporarily add `<span>Preview</span>` as the last child of the `<Label>`, so extra text enters the radio's name. Run the test and expect FAIL (the `$` anchor rejects it), then revert.
- [ ] **Step 4: Commit** `test(settings): accept jsdom 29's unstyled radio name`.

### Task 6: Full run and PR

- [ ] **Step 1:** `npm test -w web` (expected: 0 failures, count = phase 1 count), `npm run typecheck`, `npm run lint`. Re-run under Node 22: `PATH=/usr/local/n/versions/node/22.18.0/bin:$PATH /usr/local/n/versions/node/22.18.0/bin/npm test -w web`. jest-dom 7 requires Node >= 22.
- [ ] **Step 2:** Push, then `gh pr create --title "build(web): upgrade jsdom to 29 and jest-dom to 7"`. The body lists the four diagnoses, the two mutation checks and the screenshots under `## Verification`.

# Text-Safe Secondary Ink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `secondary-ink` safe to use as indigo text in both themes, so no component has to borrow another token or mix its own colour to get readable indigo on a dark surface.

**Architecture:** Split the indigo token by role, the way gold is already split (`primary` is the fill, `primary-ink` is the text). A new `secondary-border` takes over today's values for borders and rings, which only need 3:1. `secondary-ink` keeps its light value and gets the AA-safe dark value that `syntax-option` holds now. Then `syntax-option` and the colour-mix override in the deck import dialog both go away.

**Tech Stack:** Tailwind v4 `@theme` tokens in `app/web/src/app/globals.css`, Vitest.

**Spec:** None. This follows up the review of PR #167, which asked for a general-purpose indigo text colour instead of reusing `syntax-option` for the command-table badges. The background below stands in for a spec.

## Background

The suffix `-ink` already means "the text-safe variant" for the other two inks:

| Token | Light | Dark | Dark as text |
|---|---|---|---|
| `primary-ink` | `#875D0D` | `#E8B23A` | AA |
| `success-ink` | `#1E6B3D` | `#5CB878` | AA |
| `secondary-ink` | `#3B3194` | `#6E66C9` | **3.84 / 3.56 / 3.16:1** on background / card / muted |

`secondary-ink` breaks the convention. In dark mode it only does its graphic job (hover borders, the selected ring), and `theme-contrast.test.ts` only holds it to 3:1. Every place that wanted indigo *text* on a dark surface had to work around it:

| Site | Workaround | This plan |
|---|---|---|
| `docs/command-example.tsx` (option name) | a token of its own, `syntax-option` (`#A79FE8`) | → `secondary-ink` |
| `docs/command-table.tsx` (badges) | borrows `syntax-option` | → `secondary-ink` |
| `deck/deck-import-dialog.tsx:262` (zone headings) | an arbitrary `dark:text-[color-mix(...60%...foreground)]` | → plain `text-secondary-ink` |
| `docs/docs-sidebar.tsx:21` (active page) | swaps to gold in dark | **kept**: it's a deliberate hue swap (indigo on parchment, gold on midnight, the same pairing as `--heading`), made from tokens |
| `vanished-card.tsx:40` (symbol) | swaps to gold in dark | **kept**: same reason, and its comment explains why gold reads against the stripes |
| `discord/command-grid.tsx:26` (option chips) | chips instead of indigo text | **kept**: the chip also sets options apart from the prose below, which a colour alone would not do |

**Follow-up, not in this plan:** the sidebar and the vanished-card symbol pick their colour per theme with a `dark:` override in the component. They use the same indigo-on-light, gold-on-dark pairing as `--heading`. The token-system answer is one role token for that pairing, which `--heading` would also point at. It's left out because it is a different change from the one PR #167's review asked for.

Only the first three are contrast workarounds. The last three are design decisions built from proper tokens, and moving them to indigo would be a redesign, not a refactor.

Measured values (WCAG relative luminance):

- `#A79FE8` on dark background / card / muted: 7.64 / 7.09 / 6.28:1
- `#3B3194` on light background / card / muted: 9.39 / 10.06 / 8.29:1
- `#6E66C9` on dark card / muted: 3.56 / 3.16:1 (clears the 3:1 that borders and rings need)

## Global Constraints

- Every hex lives in the `--light-*` / `--dark-*` value sets of `globals.css`. The alias blocks only point at them with `var()`.
- A new token gets **four** alias lines: `@theme inline` (`--color-x`), `:root` (light), the `@media (prefers-color-scheme: dark)` block guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`.
- Code comments are ASCII only (no em-dashes, no arrows).
- No visual change to any border or ring. Every `secondary-border` value equals the `secondary-ink` value it replaces.
- Commits are Conventional Commits with no tool attribution. Work goes on branch `refactor/web-secondary-ink`, never on `main`.
- Commands run from `app/` with node and npm prefixed `/usr/local/bin/`.

## Review Focus

1. **A border that silently brightens.** If any border or ring site is missed in Task 1, Task 2 lifts it from `#6E66C9` to `#A79FE8` in dark mode. Expect the hover borders on set, deck and hero cards and the appearance tile's selected ring to look exactly as they do on `main`. Task 1's sweep test pins this.
2. **Light mode must not move at all.** Both light values stay `#3B3194`. The contrast suite's light rows pin it.
3. **The deck import dialog's headings shift a little in dark** (color-mix of `#6E66C9` and `#FBF3DC` at 60%, to `#A79FE8`). Expect a similar lilac. Check it with a dark-mode screenshot, not only the tests.
4. **Indigo text on the indigo fill.** `text-secondary-ink` on `bg-secondary` (`#3B3194` in dark) is not an approved pairing. Text on that fill is `secondary-foreground`. No site does this today. The `@theme` comment says so, so nobody reads "text-safe" as "safe on every surface".
5. **A `syntax-option` left behind** in a class string, test or comment would compile to nothing (Tailwind drops unknown utilities) and paint the inherited colour. Task 2 ends with a repo-wide grep that must come back empty.

---

### Task 0: Branch

- [ ] **Step 1:** `git switch -c refactor/web-secondary-ink` from an up-to-date `main`.

### Task 1: Add `secondary-border` and move every border and ring onto it

No pixel changes. After this task, `secondary-ink` has no non-text use left, so the next task can lift it safely.

**Files:**
- Modify: `app/web/src/app/globals.css` (lines 80, 164, 233, 308, 370, 434)
- Modify: `app/web/src/components/set/set-card.tsx:10`
- Modify: `app/web/src/components/deck/deck-list.tsx:136`
- Modify: `app/web/src/components/deck/deck-hero-card.tsx:16`
- Modify: `app/web/src/components/settings/appearance-form.tsx:62,68`
- Modify: `app/web/src/components/docs/docs-sidebar.tsx:21`
- Test: `app/web/src/app/__tests__/theme-contrast.test.ts`, `app/web/src/components/__tests__/theme-sweep.test.tsx`

**Interfaces:**
- Produces: the utilities `border-secondary-border`, `ring-secondary-border` and `from-secondary-border/10`, plus the CSS variables `--secondary-border`, `--light-secondary-border` and `--dark-secondary-border`.

- [ ] **Step 1: Write the failing tests**

In `theme-contrast.test.ts`, change the light row
`['hover border on card', '--light-secondary-ink', '--light-card']` to use `'--light-secondary-border'`. Then replace the dark `it('the error-card glyph and the hover border stay visible on a card', ...)` body so it asserts on the border token:

```ts
  it('the hover border and the selected ring stay visible on a card', () => {
    expect(contrast(hex('--dark-secondary-border'), hex('--dark-card'))).toBeGreaterThanOrEqual(GRAPHIC)
    expect(contrast(hex('--dark-secondary-border'), hex('--dark-muted'))).toBeGreaterThanOrEqual(GRAPHIC)
  })
```

Update the comment above it to say "The card-tile hover border" instead of "The same token is the card-tile hover border".

Append to the `light-mode sweep` describe in `theme-sweep.test.tsx`:

```ts
  // secondary-ink is the text token; a border or ring painted with it would
  // brighten the day the ink is tuned for text. Borders and rings take secondary-border.
  it.each([
    'set/set-card.tsx',
    'deck/deck-list.tsx',
    'deck/deck-hero-card.tsx',
    'settings/appearance-form.tsx',
    'docs/docs-sidebar.tsx',
  ])('%s draws its borders with secondary-border', async (file) => {
    const src = await read(file)
    expect(src).not.toMatch(/(?:border|ring|from)-secondary-ink/)
    expect(src).toMatch(/(?:border|ring)-secondary-border/)
  })
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `/usr/local/bin/npm test -w web -- src/app/__tests__/theme-contrast.test.ts src/components/__tests__/theme-sweep.test.tsx`
Expected: FAIL. The contrast test reports `no hex for --dark-secondary-border`, and the five sweep cases fail.

- [ ] **Step 3: Add the token**

In `globals.css`:

```css
/* @theme inline, after line 80 */
  --color-secondary-border: var(--secondary-border);

/* dark value set, after --dark-secondary-ink (line 164) */
  --dark-secondary-border: #6E66C9;

/* light value set, after --light-secondary-ink (line 233) */
  --light-secondary-border: #3B3194;

/* :root alias block, after line 308 */
  --secondary-border: var(--light-secondary-border);

/* both dark alias blocks, after lines 370 and 434 */
  --secondary-border: var(--dark-secondary-border);
```

Put this comment on `--dark-secondary-border`:

```css
  /* Indigo as a border or ring: hover borders on cards, the selected theme tile.
     Held to the 3:1 WCAG 1.4.11 asks of a graphic, not to text AA. Text takes
     secondary-ink. */
```

- [ ] **Step 4: Move the sites**

- `set-card.tsx:10`, `deck-list.tsx:136`, `deck-hero-card.tsx:16`: `hover:border-secondary-ink` becomes `hover:border-secondary-border`.
- `appearance-form.tsx:62`: `has-data-[state=checked]:border-secondary-ink` and `has-data-[state=checked]:ring-secondary-ink` become `...-secondary-border`. In the comment at line 68, change `secondary-ink, the same token deck-list, deck-hero-card and` to `secondary-border, the same token deck-list, deck-hero-card and`.
- `docs-sidebar.tsx:21`: `border-secondary-ink` becomes `border-secondary-border`, and `from-secondary-ink/10` becomes `from-secondary-border/10`. **Keep `text-secondary-ink`** (it is text) and every `dark:` class.

- [ ] **Step 5: Run the tests and confirm they pass**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/app/globals.css app/web/src/app/__tests__/theme-contrast.test.ts \
  app/web/src/components/__tests__/theme-sweep.test.tsx app/web/src/components/set/set-card.tsx \
  app/web/src/components/deck/deck-list.tsx app/web/src/components/deck/deck-hero-card.tsx \
  app/web/src/components/settings/appearance-form.tsx app/web/src/components/docs/docs-sidebar.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): give indigo borders and rings a token of their own"
```

### Task 2: Make `secondary-ink` text-safe in dark and retire `syntax-option`

**Files:**
- Modify: `app/web/src/app/globals.css` (lines 81, 164-169, 234, 309, 371, 435)
- Modify: `app/web/src/components/docs/command-example.tsx:76-77,89`
- Modify: `app/web/src/components/docs/command-table.tsx:71,126`
- Test: `app/web/src/app/__tests__/theme-contrast.test.ts`, `app/web/src/components/docs/__tests__/command-example.test.tsx:23`, `app/web/src/components/docs/__tests__/command-table.test.tsx:90-97`

**Interfaces:**
- Consumes: `secondary-border` from Task 1, which leaves `secondary-ink` with text uses only.
- Produces: `text-secondary-ink`, which clears AA on background, card and muted in both themes. `syntax-option` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `theme-contrast.test.ts`, add to the light `pairs` list:

```ts
    ['indigo ink on page', '--light-secondary-ink', '--light-background'],
    ['indigo ink on card', '--light-secondary-ink', '--light-card'],
    ['indigo ink on muted', '--light-secondary-ink', '--light-muted'],
```

Add to `describe('dark theme ink', ...)`:

```ts
  // secondary-ink is the indigo text token, so like primary-ink it has to read
  // on every ground text sits on. Its old dark value (#6E66C9) was the border
  // value at 3.16:1 on muted, which is why command-example grew syntax-option
  // and the deck import dialog mixed its own.
  it('indigo ink clears AA on the page, on cards and on muted', () => {
    for (const ground of ['--dark-background', '--dark-card', '--dark-muted']) {
      expect(contrast(hex('--dark-secondary-ink'), hex(ground))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('there is one indigo text token', () => {
    expect(css).not.toMatch(/syntax-option/)
  })
```

In `command-example.test.tsx:23`, change the expectation to `toHaveClass('text-secondary-ink')`. In `command-table.test.tsx`, replace lines 90-97 with:

```ts
  // The badges are indigo text at 0.68rem on the card, so they take the text
  // ink; theme-contrast.test.ts holds secondary-ink to AA there in both themes.
  it('draws the indigo badges in the indigo text ink', () => {
    renderTable('collection')
    expect(screen.getByText('Needs a linked account')).toHaveClass('text-secondary-ink')
    expect(screen.getByText('Autocompletes')).toHaveClass('text-secondary-ink')
  })
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `/usr/local/bin/npm test -w web -- src/app/__tests__/theme-contrast.test.ts src/components/docs/__tests__/command-example.test.tsx src/components/docs/__tests__/command-table.test.tsx`
Expected: FAIL. The dark AA case fails at 3.84 (background), the `syntax-option` guard fails, and the three class assertions fail.

- [ ] **Step 3: Change the tokens**

In `globals.css`:

- Set `--dark-secondary-ink: #A79FE8;` and put this comment above it:

  ```css
  /* Indigo as text. #6E66C9, the brand's mid indigo, is 3.16:1 on muted and
     stays the border value; this is the same hue lifted to 6.28:1 (7.09:1 on
     card). Text on the indigo FILL takes secondary-foreground, not this. */
  ```

- Delete the `syntax-option` comment and the `--dark-syntax-option`, `--light-syntax-option` and `--color-syntax-option` lines, plus all three `--syntax-option: var(...)` alias lines.

- [ ] **Step 4: Move the sites**

- `command-example.tsx:89`: `text-syntax-option` becomes `text-secondary-ink`. Replace the doc comment's last two sentences (lines 76-77) with: `The option name is secondary-ink, the indigo text token.`
- `command-table.tsx:71` and `:126`: `border-syntax-option/55 ... text-syntax-option` becomes `border-secondary-ink/55 ... text-secondary-ink`. The badge border is drawn in the text ink on purpose: it is the outline of a text pill and should carry the same colour as its label.

- [ ] **Step 5: Confirm nothing still names the old token**

Run: `grep -rn "syntax-option" /Users/timon.wegener/WebstormProjects/revelio/app --include='*.ts' --include='*.tsx' --include='*.css' --include='*.mdx' --exclude-dir=node_modules --exclude-dir=.next`
Expected: no output.

- [ ] **Step 6: Run the tests and confirm they pass**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/app/globals.css app/web/src/app/__tests__/theme-contrast.test.ts \
  app/web/src/components/docs/command-example.tsx app/web/src/components/docs/command-table.tsx \
  app/web/src/components/docs/__tests__/command-example.test.tsx \
  app/web/src/components/docs/__tests__/command-table.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): make secondary-ink text-safe in dark and drop syntax-option"
```

### Task 3: Drop the deck import dialog's colour-mix

**Files:**
- Modify: `app/web/src/components/deck/deck-import-dialog.tsx:250-262`
- Test: `app/web/src/components/__tests__/theme-sweep.test.tsx`

**Interfaces:**
- Consumes: the text-safe `secondary-ink` from Task 2.

- [ ] **Step 1: Write the failing test**

Append to the `light-mode sweep` describe in `theme-sweep.test.tsx`:

```ts
  // secondary-ink clears AA in both themes, so a dark: override that re-mixes
  // it is a stale workaround rather than a fix.
  it('deck-import-dialog paints its zone headings in plain secondary-ink', async () => {
    const src = await read('deck/deck-import-dialog.tsx')
    expect(src).toMatch(/font-medium text-secondary-ink"/)
    expect(src).not.toMatch(/color-mix\(in_srgb,var\(--secondary-ink\)/)
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `/usr/local/bin/npm test -w web -- src/components/__tests__/theme-sweep.test.tsx`
Expected: FAIL on the new case.

- [ ] **Step 3: Implement**

At `deck-import-dialog.tsx:262`, the span becomes `<span className="font-medium text-secondary-ink">`. In the comment above the `<pre>` (lines 250-255), delete the last two sentences ("The ink is brightened on dark, ... short of AA for 12px text.") so it ends at "...so it is the one that recedes."

- [ ] **Step 4: Run the test and confirm it passes**

Run the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Look at it**

Using the repo's Playwright chromium (see `web/e2e/` for how it is launched; there is no system Chrome), open the deck builder's import dialog with `data-theme="dark"` on `<html>` at DPR 1. Screenshot the format example on `main` and on the branch. Do the same for `/docs/discord/commands` (the badges and an example). Expected: the headings are a lilac close to the old one, the badges and the option names are unchanged, and the card hover borders are unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/deck/deck-import-dialog.tsx app/web/src/components/__tests__/theme-sweep.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(deck): drop the import dialog's hand-mixed indigo"
```

### Task 4: Full verification and PR

- [ ] **Step 1:** From `app/`, run `/usr/local/bin/npm test -w web`, `/usr/local/bin/npm run typecheck` and `/usr/local/bin/npm run lint`. All three must pass. Record the test count.
- [ ] **Step 2:** Push, then open the PR with `/opt/homebrew/bin/gh pr create`. Title: `refactor(web): make secondary-ink the indigo text token`. Body: prose first, linking PR #167's review and this plan. Then `## What changed` (the three-row "this plan" table from Background, including the three kept sites and why), `## Verification` (only the commands actually run, with their real results, plus the screenshots), and `## Notes for review` (Review Focus 1 and 3). No `## Deployment`: there is no env var, migration or ingest.

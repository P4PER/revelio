# Components By Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the 98 flat modules in `app/web/src/components` into eight domain folders, moving each of the 68 colocated tests with its subject, so the folder tree expresses the dependency structure the filenames already imply.

**Architecture:** One preparatory commit normalises all 39 sibling imports (`from './card-tile'`) to the alias form (`from '@/components/card-tile'`), so that after it every reference to every component is a single uniform string. Each following commit then moves one domain folder and rewrites that one string per module - a mechanical pass that leaves the suite green at every commit. `components/ui/`, `components/settings/` and `components/legal/` are the pattern being copied and are not touched, except that one stray test rejoins its siblings.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript path alias `@/* -> ./src/*`, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-21-web-source-layout-design.md`

## Global Constraints

- **All commands run from `app/`.** There is no root-level `package.json`.
- **Toolchain is not on PATH:** prefix node/npm with `/usr/local/bin`, gh/gpg with `/opt/homebrew/bin`.
- **Commit signing:** use `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- **No Claude/Claude Code attribution** in commit messages or PR bodies.
- **Conventional Commits.**
- **Code comments are ASCII only** - no em-dashes, no unicode arrows.
- **Branch:** create `refactor/components-by-domain` off `main` *after* the `refactor/lib-server-boundary` PR has merged. Never commit to `main`.
- **Zero behaviour change.** Every step is a file move plus an import rewrite. No JSX, no props, no styling changes. If a task tempts you to fix an unrelated defect you spot in a moved file, do not - note it and move on.
- **Move files with `git mv`,** never `rm` + `cat`, so git records renames and review stays readable.
- **Do not create barrel files.** No `components/deck/index.ts` and so on.
- **Do not touch** `components/ui/` (shadcn owns it and the CLI writes there), `components/legal/`, or the contents of `components/settings/`.
- **Web test files are not typechecked** (`npm run typecheck` skips them via `tsconfig.typecheck.json`). Only the vitest run covers them, so never treat a green typecheck as proof a test import resolved.
- **`expect(...).rejects.toThrow()` is broken in `app/web`** - the matcher always errors. Catch the throw by hand if you need one.

## File Structure

98 modules, no file deleted, no file created except folders:

| destination | count | modules |
|---|---|---|
| `components/layout/` | 14 | `account-menu`, `back-to-top-button`, `brand-mark`, `decks-menu`, `header-brand-mark`, `language-switcher`, `locale-switch.ts`, `mobile-nav`, `nav-links.ts`, `random-nav-button`, `site-footer`, `site-header`, `types.ts`, `use-sign-out.ts` |
| `components/card/` | 16 | `card-constellation`, `card-detail`, `card-detail-sheet`, `card-edit-form`, `card-finish-stepper`, `card-grid`, `card-image`, `card-info-button`, `card-nav`, `card-rotate`, `card-tile`, `image-uploader`, `lesson-cost`, `lightning-divider`, `localization-form`, `rulings-editor` |
| `components/deck/` | 21 | `deck-art`, `deck-browse`, `deck-builder`, `deck-card-browser`, `deck-discover-row`, `deck-export-menu`, `deck-filter-drawer`, `deck-gallery`, `deck-header`, `deck-hero-card`, `deck-import-dialog`, `deck-legality-bar`, `deck-like-button`, `deck-list`, `deck-list-skeleton`, `deck-overview`, `deck-overview-actions`, `deck-panel`, `deck-stats-panel`, `lesson-curve`, `lesson-icons` |
| `components/search/` | 16 | `active-filters`, `clear-filters`, `clear-filters-button`, `filter-drawer`, `filter-sheet`, `header-search`, `home-search`, `lesson-filter`, `pagination`, `pagination-nav`, `quick-filters`, `search-box`, `search-controls`, `search-field`, `search-hotkey`, `sort-select` |
| `components/collection/` | 10 | `add-to-collection`, `collection-card-tile`, `collection-filter-drawer`, `collection-set-nav`, `collection-sidebar`, `collection-skeleton`, `collection-summary`, `collection-view`, `collection-visibility-toggle`, `public-collection` |
| `components/admin/` | 9 | `admin-sets-table`, `admin-sidebar`, `admin-users-table`, `delete-set-button`, `delete-user-button`, `site-settings-form`, `subtype-translations-form`, `user-ban-form`, `user-role-form` |
| `components/set/` | 4 | `set-card`, `set-form`, `set-symbol`, `set-symbol-uploader` |
| `components/auth/` | 2 | `auth-card`, `auth-form` |
| stays at `components/` root | 5 | `date-picker`, `error-card-state`, `responsive-sidebar`, `signed-out-teaser`, `star-field` |

> Post-review amendment: `contact-form` was originally listed here, but a code review flagged
> that it sat at the root while its sibling `contact-email` lived in `legal/`. It now sits in
> `components/legal/` alongside `contact-email` and `prose-shell`, the folder that already owned
> the contact/imprint/privacy content pages. The root is five files, not six.

Placement rules worth stating, because several are not obvious from the filename:

- **`lesson-*` splits three ways.** `lesson-cost` is a card primitive (used by `card-detail` and
  `deck-panel`) so it goes to `card/`. `lesson-curve` and `lesson-icons` are used only by deck
  components, so they go to `deck/`. `lesson-filter` is a filter control shared by
  `quick-filters`, `deck-card-browser` and `deck-browse`, so it goes to `search/`.
- **The card editor lives with the card,** not with admin. `card-edit-form` is rendered by
  `app/[locale]/card/[id]/edit/page.tsx`, and `localization-form`, `rulings-editor` and
  `image-uploader` have no consumer other than `card-edit-form`. `admin/` is for the
  `/admin/*` routes only.
- **Cross-domain components live in their home domain, not a `shared/` folder.** `card-image`,
  `card-rotate`, `card-detail-sheet`, `card-info-button` and `card-finish-stepper` are imported
  by deck and collection components; they are still card primitives, and `deck/` importing
  `@/components/card/card-image` states that dependency plainly. Same for `set-symbol`, which
  five components across four domains use.
- **The five left at the root are genuinely domain-free** - a date picker, an error state, a
  responsive sidebar shell, a signed-out teaser and a decorative star field. A folder for each
  would be five folders of one.

**Tests move with their subjects.** All 68 files in `components/__tests__/` are named after
their subject and follow it, with these exceptions:

- `appearance-form.test.tsx` moves to `components/settings/__tests__/`, rejoining the pane it
  tests. It was left at the root by the appearance-swatches work to keep that diff readable;
  this is the right moment to correct it.
- `auth-i18n.test.ts` moves to `components/auth/__tests__/`. It asserts on `messages/*.json`
  rather than on a component, but it belongs to the auth surface.
- `card-detail-edit.test.tsx` moves to `components/card/__tests__/`.
- `deck-panel-quantity.test.tsx` and `deck-panel-readonly.test.tsx` move to `components/deck/__tests__/`.
- `theme.test.tsx` and `theme-sweep.test.tsx` **stay** in `components/__tests__/`. Both are
  cross-cutting sweeps over the whole component surface, not tests of one module.

**`theme-sweep.test.tsx` reads component source by path string** - `read()` resolves against
`src/components`, and it currently names `add-to-collection.tsx`, `contact-form.tsx`,
`error-card-state.tsx`, `lesson-filter.tsx` and `quick-filters.tsx`. Three of those five move,
so the strings must be updated in the task that moves them or the test fails with ENOENT.
(The post-review `legal/` move makes it four of five: `contact-form.tsx` became
`legal/contact-form.tsx`.)
`theme.test.tsx` only reads `src/app/globals.css` and is unaffected.

---

### Task 1: Normalise sibling imports to the alias form

Nothing moves here. This makes every reference to a top-level component one uniform string,
so each later task is a single `sed` per module instead of a mix of relative and alias forms.

**Files:**
- Modify: the 39 top-level components under `app/web/src/components/` that import a sibling relatively, plus the 4 test files in `components/__tests__/` that do

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the invariant every later task relies on - `'@/components/<name>'` is the *only* form in which a top-level component is referenced anywhere in `src/`.

- [ ] **Step 1: Record the baseline so you can prove nothing changed**

```bash
cd app && /usr/local/bin/npm test 2>&1 | tail -5
```

Write down the file and test counts. Every later verification step compares against them.

- [ ] **Step 2: Rewrite relative sibling imports in the components themselves**

Scoped to `components/*.tsx` and `components/*.ts` only, so the relative imports inside
`components/settings/` and `components/legal/` - which stay correct, being same-folder - are
left alone.

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
sed -i '' -E "s|from '\./([a-z0-9-]+)'|from '@/components/\1'|g" *.tsx *.ts
```

- [ ] **Step 3: Rewrite relative imports in the component tests**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
sed -i '' -E "s|from '\.\./([a-z0-9-]+)'|from '@/components/\1'|g" __tests__/*.tsx __tests__/*.ts
```

- [ ] **Step 4: Confirm no relative sibling import survives at the top level**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
grep -nE "from '\.\.?/[a-z0-9-]+'" *.tsx *.ts __tests__/*.tsx __tests__/*.ts
```

Expected: no output. Imports of `./ui/...` or `./settings/...` keep a slash and are not
matched by the pattern above, which is correct - those subfolders are not moving.

- [ ] **Step 5: Verify**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm test
/usr/local/bin/npm run lint -w web
```

Expected: clean, with the same counts you recorded in Step 1.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web/src/components
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): use the alias form for sibling component imports"
```

---

### Tasks 2-9: Move one domain folder at a time

Tasks 2 through 9 are the same five steps against a different module list. Run them in this
order - `layout`, `card`, `deck`, `search`, `collection`, `admin`, `set`, `auth` - and commit
after each, so a bisect lands on one domain rather than on the whole move.

The shared procedure, with `<domain>` and `<modules>` taken from the table below:

- [ ] **Step 1: Move the modules and their tests**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
mkdir -p <domain>/__tests__
for n in <modules>; do
  # each module is .tsx except locale-switch, nav-links, types, use-sign-out
  git mv "$n".tsx <domain>/ 2>/dev/null || git mv "$n".ts <domain>/
  [ -f __tests__/"$n".test.tsx ] && git mv __tests__/"$n".test.tsx <domain>/__tests__/
  [ -f __tests__/"$n".test.ts ]  && git mv __tests__/"$n".test.ts  <domain>/__tests__/
done
```

- [ ] **Step 2: Rewrite every reference**

The trailing quote is load-bearing: without it `@/components/pagination` would also match
`@/components/pagination-nav`, `@/components/card-detail` would swallow
`@/components/card-detail-sheet`, `@/components/set-symbol` would swallow
`@/components/set-symbol-uploader`, and `@/components/clear-filters` would swallow
`@/components/clear-filters-button`.

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in <modules>; do
  grep -rlF "'@/components/$n'" --include='*.ts' --include='*.tsx' src \
    | xargs -r sed -i '' "s|'@/components/$n'|'@/components/<domain>/$n'|g"
done
```

- [ ] **Step 3: Confirm no stale reference survives**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in <modules>; do grep -rn "'@/components/$n'" --include='*.ts' --include='*.tsx' src; done
```

Expected: no output.

- [ ] **Step 4: Verify**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm test
/usr/local/bin/npm run lint -w web
```

Expected: clean, same counts as the Task 1 baseline.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web/src
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): group <domain> components"
```

#### The eight module lists

**Task 2 - `layout`:**
```
account-menu back-to-top-button brand-mark decks-menu header-brand-mark language-switcher
locale-switch mobile-nav nav-links random-nav-button site-footer site-header types use-sign-out
```
`types.ts` moves here, so the four settings panes and the two email templates that import
`@/components/types` are rewritten to `@/components/layout/types` by Step 2 like anything else.

**Task 3 - `card`:**
```
card-constellation card-detail card-detail-sheet card-edit-form card-finish-stepper card-grid
card-image card-info-button card-nav card-rotate card-tile image-uploader lesson-cost
lightning-divider localization-form rulings-editor
```
After Step 1, also move the test that is not named after its module:
```bash
git mv __tests__/card-detail-edit.test.tsx card/__tests__/
```
`card-detail` and `card-detail-sheet` are both in this list. The quoted pattern in Step 2
keeps them apart regardless of order, because `'@/components/card-detail'` cannot match
`'@/components/card-detail-sheet'` - the trailing quote differs. Run the list as written.

**Task 4 - `deck`:**
```
deck-art deck-browse deck-builder deck-card-browser deck-discover-row deck-export-menu
deck-filter-drawer deck-gallery deck-header deck-hero-card deck-import-dialog
deck-legality-bar deck-like-button deck-list deck-list-skeleton deck-overview
deck-overview-actions deck-panel deck-stats-panel lesson-curve lesson-icons
```
After Step 1, also move the two tests not named after a module:
```bash
git mv __tests__/deck-panel-quantity.test.tsx __tests__/deck-panel-readonly.test.tsx deck/__tests__/
```

**Task 5 - `search`:**
```
active-filters clear-filters clear-filters-button filter-drawer filter-sheet header-search
home-search lesson-filter pagination pagination-nav quick-filters search-box search-controls
search-field search-hotkey sort-select
```
This task moves two of the five files `theme-sweep.test.tsx` reads by path string. Add a step
between Step 3 and Step 4:
```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
sed -i '' "s|'lesson-filter.tsx'|'search/lesson-filter.tsx'|;s|'quick-filters.tsx'|'search/quick-filters.tsx'|" __tests__/theme-sweep.test.tsx
```
`npm test` in Step 4 is what proves this landed - the test fails with ENOENT if it did not.

**Task 6 - `collection`:**
```
add-to-collection collection-card-tile collection-filter-drawer collection-set-nav
collection-sidebar collection-skeleton collection-summary collection-view
collection-visibility-toggle public-collection
```
This task moves the third file `theme-sweep.test.tsx` reads by path string. Add a step between
Step 3 and Step 4:
```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
sed -i '' "s|'add-to-collection.tsx'|'collection/add-to-collection.tsx'|" __tests__/theme-sweep.test.tsx
```
Note `collection-card-tile` is imported by two `lib/` modules (`collection-cards.ts` and
`lib/server/collection-page-data.ts`) for its exported `CollectionCard` type; Step 2 rewrites
those the same as any component consumer.

**Task 7 - `admin`:**
```
admin-sets-table admin-sidebar admin-users-table delete-set-button delete-user-button
site-settings-form subtype-translations-form user-ban-form user-role-form
```

**Task 8 - `set`:**
```
set-card set-form set-symbol set-symbol-uploader
```

**Task 9 - `auth`:**
```
auth-card auth-form
```
After Step 1, also move the test that is not named after a module:
```bash
git mv __tests__/auth-i18n.test.ts auth/__tests__/
```

---

### Task 10: Return the stray settings test, and confirm the shape

**Files:**
- Move: `app/web/src/components/__tests__/appearance-form.test.tsx` to `app/web/src/components/settings/__tests__/`

**Interfaces:**
- Consumes: the finished tree from Task 9.
- Produces: nothing code-facing.

- [ ] **Step 1: Move the test to its siblings**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
git mv __tests__/appearance-form.test.tsx settings/__tests__/
```

It already imports its subject as `@/components/settings/appearance-form`, so no rewrite is
needed.

- [ ] **Step 2: Confirm the root is down to the intended five components and two sweeps**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/components
ls -1 *.tsx *.ts && echo "---" && ls -1 __tests__/
```

Expected: exactly `date-picker.tsx`, `error-card-state.tsx`, `responsive-sidebar.tsx`,
`signed-out-teaser.tsx`, `star-field.tsx`; and `__tests__/` containing exactly
`date-picker.test.tsx`, `error-card-state.test.tsx`, `signed-out-teaser.test.tsx`,
`theme.test.tsx` and `theme-sweep.test.tsx`. (`contact-form` and its test moved on to
`legal/` after the post-review amendment above.)

- [ ] **Step 3: Confirm no reference to a moved component's old path survives anywhere**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
grep -rnE "@/components/(account-menu|card-|deck-|collection-|admin-|set-|auth-|search-|filter-|lesson-|site-header|site-footer|pagination)" \
  --include='*.ts' --include='*.tsx' src | grep -vE "@/components/(card|deck|collection|admin|set|auth|search|layout)/"
```

Expected: no output.

- [ ] **Step 4: Full verification**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm test
/usr/local/bin/npm run lint -w web
/usr/local/bin/npm run build -w web
/usr/local/bin/npm run e2e -w web
```

Expected: typecheck clean; the same test counts as the Task 1 baseline; lint clean; build
succeeds; Playwright green. The e2e run is worth the minutes here because it is the only check
that renders the real pages rather than isolated components.

- [ ] **Step 5: Update CLAUDE.md, then commit**

In the "Web app specifics" section, after the UI bullet
(`**UI**: shadcn + Radix + Tailwind v4. Shared primitives in `src/components/ui/`.`), add:

```markdown
- **`src/components` is grouped by domain.** `card/`, `deck/`, `collection/`, `search/`,
  `admin/`, `set/`, `auth/`, `layout/`, plus `settings/` and `legal/`. Cross-domain components
  live in the domain that owns them, not in a shared folder - `deck/` importing
  `@/components/card/card-image` is the intended shape. Only genuinely domain-free components
  (`date-picker`, `error-card-state`, `responsive-sidebar`, ...) sit at the root. No barrel
  files: import the leaf path. Each folder owns its `__tests__/` and, where two or more
  siblings share a type, its `types.ts`.
```

Then commit:

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web/src CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): colocate the settings pane test and document the layout"
```


---

### Task 11: Name the two test directories for what they are

`app/web` has three test directories and only one of them is obvious from its name. `e2e/`
holds the Playwright specs. `src/test/` holds `intl.tsx`, a `renderWithIntl` helper that 8
test files import as `@/test/intl`. `test/` holds two module *stubs* that never get imported
by anything - vitest swaps them in through `resolve.alias` for `server-only` and
`next/font/google`. The first two are fine; the third is named as though it held tests.

**Files:**
- Move: `app/web/test/` to `app/web/vitest-stubs/`
- Modify: `app/web/vitest.config.ts` (two alias lines)

**Interfaces:**
- Consumes: the finished tree from Task 10.
- Produces: nothing code-facing. `src/test/intl.tsx` and its `@/test/intl` import path are deliberately left alone - it is a real helper and its name is accurate.

- [ ] **Step 1: Rename the directory**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
git mv test vitest-stubs
```

- [ ] **Step 2: Point the two aliases at the new path**

In `app/web/vitest.config.ts`, inside `resolve.alias`:

```ts
      // server-only throws in non-Next.js environments (vitest/jsdom); stub it out.
      'server-only': fileURLToPath(new URL('./vitest-stubs/empty.ts', import.meta.url)),
      // next/font/google is an SWC build-time transform, not a runtime function;
      // stub it so components importing fonts can be tested.
      'next/font/google': fileURLToPath(new URL('./vitest-stubs/next-font-google.ts', import.meta.url)),
```

- [ ] **Step 3: Confirm nothing else referenced the old path**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
grep -rn "'./test/\|"./test/\|/test/empty\|/test/next-font" --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' . --exclude-dir=node_modules --exclude-dir=.next
```

Expected: no output.

- [ ] **Step 4: Verify**

```bash
cd app
/usr/local/bin/npm test
/usr/local/bin/npm run typecheck
```

Expected: same counts as the Task 1 baseline. If the `server-only` alias broke, every test
touching `lib/server` fails at once with "This module cannot be imported from a Client
Component" - that is the signal to check Step 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): rename the vitest stub directory"
```

---

### Task 12: Open the PR

**Files:**
- None. This task only pushes what Tasks 1-11 committed.

**Interfaces:**
- Consumes: the finished branch.
- Produces: the PR.

- [ ] **Step 1: Confirm the branch is clean and every task committed**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git status --short
git log --oneline main..HEAD
```

Expected: no uncommitted changes, and 12 commits - one per task from Task 1 through Task 11
(Tasks 2-9 contribute one each).

- [ ] **Step 2: Push and open the PR**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git push -u origin refactor/components-by-domain
/opt/homebrew/bin/gh pr create --title "refactor(web): group components by domain" --body "$(cat <<'BODY'
Groups the 98 flat modules in `app/web/src/components` into eight domain folders, following the
pattern `components/settings/` and `components/legal/` already set. 58 of the 98 had exactly one
consumer, so the flat list was a dependency tree flattened alphabetically.

- `card/` 16, `deck/` 21, `search/` 16, `layout/` 14, `collection/` 10, `admin/` 9, `set/` 4,
  `auth/` 2, and 6 genuinely domain-free components left at the root.
- All 68 colocated tests moved with their subjects. `appearance-form.test.tsx` rejoins
  `settings/__tests__/`, where its subject has always lived.
- First commit normalises sibling imports to the alias form so every later commit is one
  uniform rewrite per module.
- No barrel files, and `components/ui/` is untouched so the shadcn CLI keeps working.

Pure moves and import rewrites - no JSX, props, or styling changed. Verified with typecheck,
the full vitest suite, lint, `next build`, and the Playwright e2e run.

Spec: `docs/superpowers/specs/2026-08-21-web-source-layout-design.md`
Plan: `docs/superpowers/plans/2026-08-21-components-by-domain.md`
BODY
)"
```

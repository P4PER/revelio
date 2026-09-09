# Shared Attribute Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the attribute label catalog and `attrLabel` from `@revelio/web` down into `@revelio/core`, so a second consumer (the Discord bot) can localize lesson/type/rarity/finish/legality codes without importing from the web app.

**Architecture:** `attrLabel` is already a pure function - it reads the `attributes` subtree of `web/messages/{en,de}.json` and has no React or next-intl dependency. That subtree moves to `core/src/messages/{en,de}.json`, the function moves to `core/src/labels.ts`, and the ten web call sites import from `@revelio/core` instead. `web/src/lib/attribute-labels.ts` is deleted rather than left as a one-line re-export, because the repo forbids barrel files.

**Tech Stack:** TypeScript, Vitest. No runtime dependencies added.

**Spec:** `docs/superpowers/specs/2026-09-09-discord-bot-design.md` (section "Shared attribute labels").

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use `/usr/local/bin/npm` and `/usr/local/bin/node`.
- Run tests per workspace. Never run the bare `npm test` at the workspace root locally: `@revelio/ingest`'s `test/main.test.ts` deletes the dev `cards-en` / `cards-de` Meilisearch indexes.
- Code comments are ASCII only. No em-dashes, no unicode arrows.
- Conventional Commits. No Claude/Claude Code attribution in commit messages.
- No barrel files: import the leaf path. `@revelio/core` is a package entrypoint, not a barrel - importing from it is the established pattern (`app/web/src/lib/card-view.ts` already does).
- Branch: `feat/shared-attribute-labels`, created off `main`.
- Dependency direction is `core <- {search, db} <- {ingest, web, bot}`. `core` must not gain a dependency on anything.
- Vitest's `rejects.toThrow` is broken in `app/web`; if a test needs to assert a throw, catch it by hand. (Not expected here.)

---

## Design

### Why this is safe

Every consumer of the labels goes through `attrLabel`. No component reads
`attributes.*` through next-intl's `useTranslations` / `getTranslations`, so removing the
subtree from the web catalogs cannot break a rendered string. Verify before starting:

```bash
grep -rn "useTranslations('attributes\|getTranslations('attributes\|'attributes\." web/src
```

Expected: no output.

`web/src/lib/__tests__/message-key-parity.test.ts` compares `en.json` against `de.json`.
The subtree is removed from **both**, so parity holds.

### Where the JSON lives

`core/src/messages/{en,de}.json`, inside `src` rather than at the workspace root.
`core/tsconfig.json` has `"include": ["src", "test"]` and `tsconfig.base.json` already
sets `"resolveJsonModule": true`, so a file under `src` needs no config change.

The scopes sit at the top level of the file (no wrapping `attributes` key) because the
file is dedicated to them.

### Call sites to update

Ten files import `attrLabel`:

```
web/src/components/collection/add-to-collection.tsx
web/src/components/collection/collection-card-tile.tsx
web/src/components/card/card-detail.tsx
web/src/components/search/quick-filters.tsx
web/src/components/search/active-filters.tsx
web/src/components/search/lesson-filter-chips.tsx
web/src/components/search/filter-sheet.tsx
web/src/components/deck/deck-panel.tsx
web/src/components/deck/lesson-icons.tsx
web/src/components/deck/deck-stats-panel.tsx
```

---

## File Structure

**Create:**
- `app/core/src/messages/en.json` - English label catalog, five scopes
- `app/core/src/messages/de.json` - German label catalog, same keys
- `app/core/src/labels.ts` - `LabelScope` type and `attrLabel`
- `app/core/test/labels.test.ts` - moved from web, unchanged assertions

**Modify:**
- `app/core/src/index.ts` - export `./labels`
- The ten component files above - import from `@revelio/core`
- `app/web/messages/en.json`, `app/web/messages/de.json` - drop the `attributes` subtree

**Delete:**
- `app/web/src/lib/attribute-labels.ts`
- `app/web/src/lib/__tests__/attribute-labels.test.ts`

---

### Task 1: `attrLabel` in `@revelio/core`

**Files:**
- Create: `app/core/src/messages/en.json`, `app/core/src/messages/de.json`, `app/core/src/labels.ts`
- Modify: `app/core/src/index.ts`
- Test: `app/core/test/labels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type LabelScope = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'`
  - `function attrLabel(scope: LabelScope, code: string, locale: string): string`

  Both exported from `@revelio/core`. Task 2 and the Discord bot plans consume them.

- [ ] **Step 1: Write the failing test**

Create `app/core/test/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { attrLabel } from '../src/labels'

describe('attrLabel', () => {
  it('resolves English labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'en')).toBe('Charms')
    expect(attrLabel('rarities', 'rare', 'en')).toBe('Rare')
  })

  it('resolves German labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'de')).toBe('Zauberkunst')
    expect(attrLabel('types', 'creature', 'de')).toBe('Kreatur')
  })

  it('resolves legalities', () => {
    expect(attrLabel('legalities', 'banned', 'en')).toBe('Banned')
    expect(attrLabel('legalities', 'banned', 'de')).toBe('Verboten')
  })

  it('falls back to English for an unknown locale', () => {
    expect(attrLabel('finishes', 'foil', 'fr')).toBe('Foil')
  })

  it('falls back to the code for an unknown key', () => {
    expect(attrLabel('lessons', 'nope', 'en')).toBe('nope')
  })

  it('covers every curated attribute code in both locales', () => {
    const scopes = [
      ['types', TYPES], ['lessons', LESSONS], ['rarities', RARITIES],
      ['finishes', FINISHES], ['legalities', LEGALITIES],
    ] as const
    for (const [scope, metas] of scopes) {
      for (const m of metas) {
        for (const locale of ['en', 'de']) {
          expect(attrLabel(scope, m.code, locale), `${locale}/${scope}/${m.code}`)
            .not.toBe(m.code)
        }
      }
    }
  })
})
```

Add the import for the constants at the top of the file:

```ts
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES } from '../src/attributes'
```

The last test is new: it pins the catalogs to `attributes.ts`, so adding a lesson without
adding its two labels fails here rather than silently rendering a slug in Discord.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w @revelio/core
```

Expected: FAIL, `Failed to resolve import "../src/labels"`.

- [ ] **Step 3: Create the catalogs**

`app/core/src/messages/en.json`:

```json
{
  "types": {
    "character": "Character",
    "creature": "Creature",
    "spell": "Spell",
    "item": "Item",
    "lesson": "Lesson",
    "adventure": "Adventure",
    "location": "Location",
    "event": "Event",
    "match": "Match"
  },
  "lessons": {
    "care_of_magical_creatures": "Care of Magical Creatures",
    "charms": "Charms",
    "potions": "Potions",
    "transfiguration": "Transfiguration",
    "quidditch": "Quidditch"
  },
  "rarities": {
    "common": "Common",
    "uncommon": "Uncommon",
    "rare": "Rare",
    "lesson": "Lesson"
  },
  "finishes": {
    "normal": "Normal",
    "foil": "Foil",
    "holo": "Holo Portrait"
  },
  "legalities": {
    "legal": "Legal",
    "restricted": "Restricted",
    "banned": "Banned",
    "unknown": "Unknown"
  }
}
```

`app/core/src/messages/de.json`:

```json
{
  "types": {
    "character": "Charakter",
    "creature": "Kreatur",
    "spell": "Zauber",
    "item": "Gegenstand",
    "lesson": "Lektion",
    "adventure": "Abenteuer",
    "location": "Ort",
    "event": "Ereignis",
    "match": "Spiel"
  },
  "lessons": {
    "care_of_magical_creatures": "Pflege magischer Geschöpfe",
    "charms": "Zauberkunst",
    "potions": "Zaubertränke",
    "transfiguration": "Verwandlung",
    "quidditch": "Quidditch"
  },
  "rarities": {
    "common": "Häufig",
    "uncommon": "Ungewöhnlich",
    "rare": "Selten",
    "lesson": "Lektion"
  },
  "finishes": {
    "normal": "Normal",
    "foil": "Folie",
    "holo": "Holo-Porträt"
  },
  "legalities": {
    "legal": "Legal",
    "restricted": "Eingeschränkt",
    "banned": "Verboten",
    "unknown": "Unbekannt"
  }
}
```

These are copied verbatim from the `attributes` subtree of `app/web/messages/en.json` and
`app/web/messages/de.json`. Do not retranslate anything.

- [ ] **Step 4: Write `labels.ts`**

`app/core/src/labels.ts`:

```ts
import en from './messages/en.json'
import de from './messages/de.json'

export type LabelScope = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'

type Catalog = Record<string, Record<string, string>>
const MESSAGES: Record<string, Catalog> = { en: en as Catalog, de: de as Catalog }

// Attribute labels are keyed by the domain codes in attributes.ts, so they live here
// rather than in a consumer's message catalog: the web app and the Discord bot both
// render them. Kept as a plain function (not a next-intl hook) so it works in a server
// component, a client component and a plain Node process alike.
export function attrLabel(scope: LabelScope, code: string, locale: string): string {
  const catalog = MESSAGES[locale] ?? MESSAGES.en
  return catalog[scope]?.[code] ?? MESSAGES.en[scope]?.[code] ?? code
}
```

- [ ] **Step 5: Export it from the package entrypoint**

In `app/core/src/index.ts`, add after the `./attributes` line:

```ts
export * from './labels'
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w @revelio/core && /usr/local/bin/npm run typecheck -w @revelio/core
```

Expected: PASS, and a clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add app/core/src/labels.ts app/core/src/messages app/core/src/index.ts app/core/test/labels.test.ts
git commit -m "feat(core): move attribute labels into the domain layer"
```

---

### Task 2: Point web at core and delete the web module

**Files:**
- Modify: the ten component files listed under Design, plus `app/web/messages/en.json` and `app/web/messages/de.json`
- Delete: `app/web/src/lib/attribute-labels.ts`, `app/web/src/lib/__tests__/attribute-labels.test.ts`

**Interfaces:**
- Consumes: `attrLabel` from `@revelio/core` (Task 1).
- Produces: nothing new. Behavior is unchanged; this is a pure move.

- [ ] **Step 1: Confirm no next-intl consumer reads the subtree**

```bash
cd app && grep -rn "useTranslations('attributes\|getTranslations('attributes\|'attributes\." web/src
```

Expected: no output. If anything matches, stop - that consumer must be converted to
`attrLabel` first, and this plan needs a new task for it.

- [ ] **Step 2: Run the web suite to record a green baseline**

```bash
cd app && /usr/local/bin/npm test -w web
```

Expected: PASS. Note the test and file counts; Step 7 must match minus the one deleted file.

- [ ] **Step 3: Rewrite the ten imports**

In each of the ten files, replace

```ts
import { attrLabel } from '@/lib/attribute-labels'
```

with

```ts
import { attrLabel } from '@revelio/core'
```

Several of these files already import from `@revelio/core` (for example
`web/src/components/search/filter-sheet.tsx` imports `TYPES`, `LESSONS`, `RARITIES`,
`FINISHES`, `LEGALITIES`). Where that is the case, merge `attrLabel` into the existing
import statement rather than adding a second one, and drop the now-duplicate line.

Verify none are left:

```bash
cd app && grep -rn "@/lib/attribute-labels" web/src
```

Expected: no output.

- [ ] **Step 4: Delete the web module and its test**

```bash
cd app && rm web/src/lib/attribute-labels.ts web/src/lib/__tests__/attribute-labels.test.ts
```

The assertions live on in `app/core/test/labels.test.ts` from Task 1, so no coverage is lost.

- [ ] **Step 5: Drop the `attributes` subtree from both web catalogs**

Remove the entire top-level `"attributes": { ... }` object from `app/web/messages/en.json`
**and** from `app/web/messages/de.json`. Remove it from both, or
`web/src/lib/__tests__/message-key-parity.test.ts` will fail.

Verify:

```bash
cd app && /usr/local/bin/node -e "for (const l of ['en','de']) { const j = require('./web/messages/'+l+'.json'); console.log(l, 'attributes' in j) }"
```

Expected:

```
en false
de false
```

- [ ] **Step 6: Run typecheck and lint**

```bash
cd app && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web
```

Expected: both clean.

- [ ] **Step 7: Run the web and core suites**

```bash
cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm test -w @revelio/core
```

Expected: PASS. The web file count is one lower than the Step 2 baseline (the deleted
test); the test count drops by the five cases that moved to core.

- [ ] **Step 8: Commit**

```bash
git add app/web
git commit -m "refactor(web): source attribute labels from @revelio/core"
```

---

### Task 3: Verify the rendered output is unchanged

**Files:** none. This task is verification only - it is the gate that this refactor
changed no pixel.

**Interfaces:**
- Consumes: the merged result of Tasks 1 and 2.
- Produces: nothing.

- [ ] **Step 1: Build and start a production server**

```bash
cd app && /usr/local/bin/npm run build -w web
```

Expected: build succeeds. (A dev server would serve stale CSS after a branch switch; use
the production build for any visual check.)

- [ ] **Step 2: Check a card detail page in both locales**

With the local stack up (`docker compose up` from `app/`, seeded via
`docker compose run --rm ingest`), start the server and open a card that has a lesson, a
rarity and a legality, in English and in German:

```
http://localhost:3000/card/<id>
http://localhost:3000/de/card/<id>
```

Expected: the Lesson, Rarity, Type and Legality rows read exactly as before -
"Charms" / "Zauberkunst", "Rare" / "Selten", and so on. A slug appearing in place of a
label (`charms` instead of `Charms`) means a catalog key was mistyped in Task 1.

- [ ] **Step 3: Check the search filter sheet**

Open `/search`, open the Advanced filter sheet, and confirm the Type, Lesson, Rarity,
Finish and Legality groups all show localized labels in both locales.

- [ ] **Step 4: Commit nothing; open the PR**

```bash
git push -u origin feat/shared-attribute-labels
/opt/homebrew/bin/gh pr create --title "refactor: share attribute labels from @revelio/core" \
  --body "Moves the attribute label catalog and attrLabel from web into @revelio/core so a second consumer (the planned Discord bot) can localize attribute codes without depending on the web app. Pure move: no behavior change, no new dependency, no migration. Web call sites now import from @revelio/core and the web-local module is deleted (no barrel re-export)."
```

---

## Self-Review Notes

- **Spec coverage:** the spec's "Shared attribute labels" section is fully covered by
  Tasks 1 and 2; Task 3 is the no-behavior-change gate the spec implies by calling this a
  pure refactor.
- **Type consistency:** `LabelScope` and `attrLabel` keep the exact signatures the web
  module had, so the ten call sites compile unchanged apart from the import path.
- **Not in this plan:** `pickLocalization` (`web/src/lib/card-view.ts`) may also need to
  move to `core` for the bot's card embed. That is deliberately deferred to the Phase 1
  plan, where its first non-web consumer appears.

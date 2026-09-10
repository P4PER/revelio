# Split `@revelio/db` queries.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `app/db/src/queries.ts` (1193 lines, ~12 unrelated domains) into one focused module per domain under `app/db/src/queries/`, with no change to the public surface of `@revelio/db`.

**Architecture:** Pure code motion. Each domain moves verbatim into `queries/<domain>.ts` and is re-exported from the shrinking `queries.ts` while the split is in progress, so every intermediate commit compiles and every existing test passes. The final task deletes `queries.ts` and repoints `db/src/index.ts` at the leaf modules. Two types are shared by more than one sibling module (`Tx`, `SitemapEntry`) and move to a folder-scoped `queries/types.ts`, per the CLAUDE.md shared-types convention.

**Tech Stack:** TypeScript, Drizzle ORM over Postgres, Vitest (query tests live in `app/ingest/test/`, run against a live Postgres via Testcontainers).

**Spec:** None. This is a bounded refactor; the agreed design is restated under **Context** below and is the authority for this plan.

## Global Constraints

- **No behavior change and no signature change.** Function bodies move verbatim. Do not "improve" a query, rename a parameter, change a return type, or fix an unrelated bug while moving code. Anything tempting gets noted in the final report, not committed.
- **The public surface of `@revelio/db` must stay byte-identical.** 85 runtime exports and 15 exported types, all listed in `db/src/index.ts`. Task 1 captures the baseline; Task 8 diffs against it.
- **No consumer changes.** `web`, `bot`, and `ingest` import from `@revelio/db` only — nothing outside the package imports `./queries`. If a task makes you want to edit a file outside `app/db/`, stop and report instead.
- **Comments travel with their code.** The long explanatory comments on `getCardRulings`, `getDeckForViewer`, `setUserBan`, `unlinkProvider`, `cardViewMetaByIds`, `updateDeckMeta`, and `getDailyShowcaseCandidates` are the most valuable part of the file. Move them intact, above the same function.
- **Declaration order inside every new module: imports → types → constants → unexported helpers → exported functions** (CLAUDE.md, *Types*). This is the convention the current file violates and the main point of the exercise.
- **Types are `type` aliases, imports of types say `type`.** `@typescript-eslint/consistent-type-definitions` and `consistent-type-imports` are errors in the root ESLint config, which covers `db/`.
- **ASCII-only in comments.** No em-dashes, no unicode arrows. Existing comments already comply; keep it that way in anything you add.
- **Conventional Commits**, scope `db`: `refactor(db): extract the set queries into their own module`. No tool attribution, no `Co-authored-by`.
- **Do not run `npm test` from `app/`.** It runs `@revelio/ingest`'s `main.test.ts`, which deletes the `cards-en` / `cards-de` indexes on the developer's local Meilisearch. Use `npm test -w @revelio/ingest` for query tests (Docker must be running) and never the root alias.

## Context: the target file layout

`app/db/src/queries.ts` is deleted at the end. `app/db/src/queries/` replaces it:

| module | domain | approx. lines |
|---|---|---|
| `types.ts` | `Tx`, `SitemapEntry` — the only two types with more than one sibling consumer | 8 |
| `sets.ts` | `toSetDTO` (also used by `cards.ts`), set reads, set writes, set sitemap | 125 |
| `cards.ts` | card detail, rulings read, random, showcase, card sitemap, index data, finishes | 185 |
| `localizations.ts` | `upsertLocalization`, `setLocalizationImage` | 50 |
| `rulings.ts` | `saveRulings`, `listRulingSources` | 55 |
| `sub-types.ts` | sub-type labels and translation editing | 40 |
| `decks.ts` | deck CRUD, card views, name resolution | 230 |
| `deck-browse.ts` | likes, views, the public browse query | 130 |
| `users.ts` | admin user list/detail, roles, ban/unban, delete | 90 |
| `collection.ts` | collection read and write path, owner resolution | 115 |
| `user-export.ts` | `getUserExport` and its `UserExport` shape | 60 |
| `accounts.ts` | Discord account resolution, linked providers, unlink | 60 |
| `site-settings.ts` | the singleton settings row | 30 |

There is deliberately **no** `queries/index.ts` barrel. `db/src/index.ts` is already the package boundary; a second barrel behind it would just be indirection.

## Context: the temporary bridge

Tasks 2 through 7 each remove one or more domains from `queries.ts` and add a re-export line at the top of it:

```ts
export * from './queries/sets'
```

`db/src/index.ts` keeps importing from `./queries` untouched until Task 8, so the package surface never wobbles mid-refactor and every commit is green. Task 8 removes the bridge along with the file.

---

### Task 1: Capture the baseline and create the shared types module

**Files:**
- Create: `app/db/src/queries/types.ts`
- Modify: `app/db/src/queries.ts` (remove the `Tx` declaration, add the bridge re-export)
- Test: none new — `app/ingest/test/` is the existing oracle

**Interfaces:**
- Consumes: nothing.
- Produces: `app/db/src/queries/types.ts` exporting `type Tx` (the Drizzle transaction handle, consumed by `decks.ts` in Task 5 and `collection.ts` in Task 8) and `type SitemapEntry = { id: string; updatedAt: Date }` (consumed by `sets.ts` and `cards.ts` in Tasks 2 and 3, and re-exported from the package).

- [x] **Step 1: Record the export-surface baseline**

This is the oracle for the whole refactor. Run from `app/db`:

```bash
cd app/db
npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-before.txt
wc -l /tmp/db-exports-before.txt
```

Expected: `85 /tmp/db-exports-before.txt`. If it is not 85, stop — the working tree is not at the expected starting point.

- [x] **Step 2: Confirm the existing test suite is green before touching anything**

Docker must be running (the suite uses Testcontainers for Postgres).

```bash
cd app && npm test -w @revelio/ingest
```

Expected: all files pass. Record the file and test counts; Task 8 compares against them. If anything already fails, stop and report — do not refactor on top of a red suite.

- [x] **Step 3: Create `app/db/src/queries/types.ts`**

```ts
import type { DB } from '../client'

// The transaction handle drizzle passes into `db.transaction(async (tx) => ...)`.
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

// Minimal row for the XML sitemap: id/code + last-modified for <lastmod>.
export type SitemapEntry = { id: string; updatedAt: Date }
```

Note the `../client` path: modules under `queries/` are one directory deeper than the old file.

- [x] **Step 4: Remove the moved declarations from `queries.ts` and add the bridge**

In `app/db/src/queries.ts`:
- Delete lines 15-16 (the `// The transaction handle...` comment and the `type Tx = ...` line).
- Delete line 280, `export type SitemapEntry = { id: string; updatedAt: Date }`. Leave the `// Minimal rows for the XML sitemap...` comment on line 282 where it is: it documents `listCardsForSitemap`, not the type, and travels to `cards.ts` with that function in Task 3. `listCardsForSitemap` and `listSetsForSitemap` also stay put for now.
- Add these two lines immediately after the existing `import type { CardIndexData } from '@revelio/search'` line:

```ts
import type { Tx } from './queries/types'

export * from './queries/types'
```

`Tx` is still referenced by `replaceDeckCards` and `ensureCollection`, which have not moved yet, hence the import alongside the re-export. `SitemapEntry` needs no import: it is only used as a return type annotation on the two sitemap functions, and the `export *` brings it back into scope for them.

- [x] **Step 5: Verify the package still compiles and the surface is unchanged**

```bash
cd app && npm run typecheck
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
```

Expected: typecheck passes across all workspaces, and the diff prints `SURFACE UNCHANGED`.

- [x] **Step 6: Commit**

```bash
git add app/db/src/queries/types.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the shared query types into queries/types.ts"
```

The branch `refactor/split-db-queries` already exists and holds this plan document as its first commit.

---

### Task 2: Extract the set queries

**Files:**
- Create: `app/db/src/queries/sets.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: `type Tx`, `type SitemapEntry` from `./types` (Task 1).
- Produces: `app/db/src/queries/sets.ts` exporting `toSetDTO(row: SetRow, name?: string): SetDTO` (consumed by `cards.ts` in Task 3), plus `type SetForEdit`, `type SetWriteInput`, `listSets`, `getSetByCode`, `getSetForEdit`, `createSet`, `updateSet`, `deleteSet`, `setSetSymbolVersion`, `listSetsForSitemap`.

- [x] **Step 1: Move the set code into the new module**

Create `app/db/src/queries/sets.ts`. Move these declarations out of `queries.ts` verbatim, in this order (original line numbers at `main` are locators only; find them by name):

1. `type SetRow = typeof sets.$inferSelect` (line 11) — keep it unexported.
2. `type SetForEdit` (lines 51-59) and `type SetWriteInput` (lines 76-81) — moved up here, ahead of the functions, per the declaration-order convention.
3. `function toSetDTO` (lines 18-27) — **change it to `export function toSetDTO`**; `cards.ts` needs it in Task 3. This is the one signature line that changes, and only its visibility.
4. `listSets` (29-35), `getSetByCode` (37-49), `getSetForEdit` (61-74), `createSet` (83-97), `updateSet` (99-128), `deleteSet` (130-132), `setSetSymbolVersion` (134-136), `listSetsForSitemap` (287-289).

The import header for the new module:

```ts
import { eq, asc, sql, and } from 'drizzle-orm'
import type { DB } from '../client'
import { sets, setLocalizations } from '../schema'
import type { SetDTO } from '@revelio/core'
import type { SitemapEntry } from './types'
```

This import list is computed, not guaranteed. Step 3 is what proves it right: add anything the compiler asks for, and drop anything ESLint flags as unused.

- [x] **Step 2: Update `queries.ts`**

- Delete every declaration listed in Step 1 from `queries.ts`.
- Add `export * from './queries/sets'` directly under the `export * from './queries/types'` line.
- Add `import { toSetDTO } from './queries/sets'` to the import block — `getCardById` still calls it and has not moved yet.
- Do **not** prune `queries.ts`'s own import header yet; Task 8 does that when the file is deleted. Unused imports there are warnings, not errors, and pruning them each task invites churn.

- [x] **Step 3: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
```

Expected: typecheck passes; ESLint reports nothing for the new folder. `--max-warnings 0` is the part that catches an import you copied but do not use — `no-unused-vars` is only a warning in the root config, so a plain `npm run lint` would let it through.

- [x] **Step 4: Verify the surface and the tests**

```bash
cd app/db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- set-write.test.ts queries.test.ts set-localizations.test.ts
```

Expected: `SURFACE UNCHANGED`, and the three test files pass.

Note: `toSetDTO` is newly exported from `sets.ts`, but `db/src/index.ts` does not name it, so the package surface is unaffected and the diff still comes back clean. If the diff shows `toSetDTO` appearing, someone added it to `index.ts` — revert that.

- [x] **Step 5: Commit**

```bash
git add app/db/src/queries/sets.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the set queries into their own module"
```

---

### Task 3: Extract the card queries

**Files:**
- Create: `app/db/src/queries/cards.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: `toSetDTO` from `./sets` (Task 2), `type SitemapEntry` from `./types` (Task 1).
- Produces: `app/db/src/queries/cards.ts` exporting `type ShowcaseCandidate`, `getCardById`, `getCardRulings`, `getRandomCardId`, `getDailyShowcaseCandidates`, `listCardsForSitemap`, `getCardIndexData`, `getCardFinishes`.

- [x] **Step 1: Move the card code into the new module**

Create `app/db/src/queries/cards.ts` with, in order:

1. `type ShowcaseCandidate = { id: string; name: string; imageVersion: number }` (line 247), hoisted above the functions.
2. `getCardById` (138-205), `getCardRulings` (207-240, with its three-line comment), `getRandomCardId` (242-245), `getDailyShowcaseCandidates` (249-278, with its six-line comment), `listCardsForSitemap` (283-285), `getCardIndexData` (342-374), `getCardFinishes` (959-962).

`getCardFinishes` currently sits in the collection write section because that is who calls it, but it reads `cards.finishes` and takes no user — it belongs with the card reads. This is the one function that changes neighbourhood rather than just file.

The import header:

```ts
import { eq, ne, asc, sql, inArray, and, or, isNull, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { DB } from '../client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, subTypes, setLocalizations } from '../schema'
import type { CardLocalizationDTO, CardDetailDTO, RulingDTO, CardRulingsDTO, AdventureData, MatchData } from '@revelio/core'
import type { CardIndexData } from '@revelio/search'
import { toSetDTO } from './sets'
import type { SitemapEntry } from './types'
```

Same caveat as Task 2: the compiler and `--max-warnings 0` settle the final list.

- [x] **Step 2: Update `queries.ts`**

Delete the moved declarations, add `export * from './queries/cards'` under the previous bridge lines, and delete the now-unused `import { toSetDTO } from './queries/sets'` added in Task 2 (nothing left in `queries.ts` calls it).

- [x] **Step 3: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- queries.test.ts rulings.test.ts image-versions.test.ts reindex-card.test.ts
```

Expected: typecheck clean, ESLint silent, `SURFACE UNCHANGED`, all four test files pass.

- [x] **Step 4: Commit**

```bash
git add app/db/src/queries/cards.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the card queries into their own module"
```

---

### Task 4: Extract the editor write path — localizations, rulings, sub-types

**Files:**
- Create: `app/db/src/queries/localizations.ts`, `app/db/src/queries/rulings.ts`, `app/db/src/queries/sub-types.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `localizations.ts` exporting `upsertLocalization`, `setLocalizationImage`; `rulings.ts` exporting `saveRulings`, `listRulingSources`; `sub-types.ts` exporting `getSubTypeLabels`, `listSubTypesWithTranslations`, `saveSubTypeTranslations`.

These three are grouped into one task because each is under 60 lines with no shared code, and a reviewer would accept or reject them together.

- [x] **Step 1: Create `app/db/src/queries/localizations.ts`**

Move `upsertLocalization` (291-324) and `setLocalizationImage` (326-340).

```ts
import type { DB } from '../client'
import { cardLocalizations } from '../schema'
import type { AdventureData, MatchData } from '@revelio/core'
```

No `drizzle-orm` import: both functions are `.insert(...).onConflictDoUpdate(...)` and reference no operator.

- [x] **Step 2: Create `app/db/src/queries/rulings.ts`**

Move `saveRulings` (376-422) and `listRulingSources` (424-431).

```ts
import { eq, asc, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from '../client'
import { cardRulings, cardRulingLocalizations } from '../schema'
```

- [x] **Step 3: Create `app/db/src/queries/sub-types.ts`**

Move `getSubTypeLabels` (433-436), `listSubTypesWithTranslations` (438-450), `saveSubTypeTranslations` (452-472).

```ts
import { eq, asc, and } from 'drizzle-orm'
import type { DB } from '../client'
import { subTypes, subTypeLocalizations } from '../schema'
```

- [x] **Step 4: Update `queries.ts`**

Delete the moved declarations; add the three bridge lines:

```ts
export * from './queries/localizations'
export * from './queries/rulings'
export * from './queries/sub-types'
```

- [x] **Step 5: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- localization-write.test.ts rulings.test.ts subtype-translations.test.ts
```

Expected: all clean, `SURFACE UNCHANGED`, three test files pass.

- [x] **Step 6: Commit**

```bash
git add app/db/src/queries/localizations.ts app/db/src/queries/rulings.ts app/db/src/queries/sub-types.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the localization, ruling and sub-type queries"
```

---

### Task 5: Extract the deck queries

**Files:**
- Create: `app/db/src/queries/decks.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: `type Tx` from `./types` (Task 1).
- Produces: `app/db/src/queries/decks.ts` exporting `type DeckWriteInput`, `type DeckSummary`, `listDecksByUser`, `updateDeckMeta`, `getCardViews`, `getDeck`, `getDeckForViewer`, `createDeck`, `updateDeck`, `deleteDeck`, `resolveCardsByName`. `groupCodes`, `cardViewMetaByIds` and `replaceDeckCards` stay unexported inside it.

- [x] **Step 1: Move the deck code into the new module**

Create `app/db/src/queries/decks.ts` with, in declaration order:

1. Types: `type DeckWriteInput` (474-479), `type DeckSummary` (480-484).
2. Unexported helpers, each with its existing comment: `groupCodes` (636-641), `cardViewMetaByIds` (533-578, keep the three-line comment above it), `replaceDeckCards` (643-657).
3. Exported functions: `listDecksByUser` (486-519), `updateDeckMeta` (521-531, with its comment), `getCardViews` (580-585, with its comment), `getDeck` (587-620), `getDeckForViewer` (622-634, with its comment), `createDeck` (659-666), `updateDeck` (668-675), `deleteDeck` (677-679), `resolveCardsByName` (681-701).

Reordering matters here: `groupCodes` is currently declared at 637, *after* the `cardViewMetaByIds` at 536 that calls it, and between two exported functions. Hoisting both helpers above the exported functions is the declaration-order fix this refactor exists for. Function declarations hoist, so this is safe.

```ts
import { eq, desc, sql, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from '../client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, subTypes, decks, deckCards } from '../schema'
import { user } from '../auth-schema'
import type { DeckDTO, DeckCardView, DeckFormat, DeckVisibility } from '@revelio/core'
import { deckCardMeta } from '@revelio/core'
import type { Tx } from './types'
```

- [x] **Step 2: Update `queries.ts`**

Delete the moved declarations; add `export * from './queries/decks'`. `Tx` is still imported there for `ensureCollection`, so leave that import alone.

- [x] **Step 3: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- deck-write.test.ts deck-viewer.test.ts
```

Expected: all clean, `SURFACE UNCHANGED`, both test files pass. `deck-viewer.test.ts` is the one that covers the private-deck 404 path in `getDeckForViewer` — if it fails, the comment and the function got separated.

- [x] **Step 4: Commit**

```bash
git add app/db/src/queries/decks.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the deck queries into their own module"
```

---

### Task 6: Extract the public deck browse queries

**Files:**
- Create: `app/db/src/queries/deck-browse.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `app/db/src/queries/deck-browse.ts` exporting `type PublicDeckSort`, `type PublicDeckEntry`, `type ListPublicDecksInput`, `toggleLike`, `getDeckLikeState`, `recordView`, `listPublicDecks`. `PUBLIC_PAGE_SIZE` stays a module constant.

- [x] **Step 1: Move the browse code into the new module**

Create `app/db/src/queries/deck-browse.ts` with, in declaration order:

1. Types: `PublicDeckSort` (745), `PublicDeckEntry` (746-752), `ListPublicDecksInput` (753-756) — hoisted above everything.
2. Constant: `const PUBLIC_PAGE_SIZE = 24` (758).
3. Exported functions: `toggleLike` (705-722), `getDeckLikeState` (724-731), `recordView` (733-743), `listPublicDecks` (760-831).

The `// --- public deck browse: likes, views, and the browse query ---` divider on line 703 is dropped: the filename now says it.

```ts
import { eq, desc, sql, inArray, and, or, ilike, count, arrayOverlaps } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, decks, deckCards, deckLikes, deckViews } from '../schema'
import { user } from '../auth-schema'
import type { DeckFormat } from '@revelio/core'
```

- [x] **Step 2: Update `queries.ts`**

Delete the moved declarations and the section divider; add `export * from './queries/deck-browse'`.

- [x] **Step 3: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- deck-browse.test.ts
```

Expected: all clean, `SURFACE UNCHANGED`, `deck-browse.test.ts` passes.

- [x] **Step 4: Commit**

```bash
git add app/db/src/queries/deck-browse.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the public deck browse queries"
```

---

### Task 7: Extract the user queries — admin, accounts, export

**Files:**
- Create: `app/db/src/queries/users.ts`, `app/db/src/queries/accounts.ts`, `app/db/src/queries/user-export.ts`
- Modify: `app/db/src/queries.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `users.ts` exporting `type UserAdminRow`, `type UserAdminDetail`, `listUsersForAdmin`, `getUserForAdmin`, `countAdmins`, `countUserDecks`, `updateUserRole`, `setUserBan`, `clearUserBan`, `deleteUserById`; `accounts.ts` exporting `type UnlinkedAccount`, `getUserIdByDiscordAccount`, `getLinkedProviderIds`, `unlinkProvider`; `user-export.ts` exporting `type UserExport`, `getUserExport`.

- [x] **Step 1: Create `app/db/src/queries/users.ts`**

Types first — `UserAdminRow` (833-843), `UserAdminDetail` (845-848) — then `listUsersForAdmin` (850-863), `getUserForAdmin` (865-881), `countAdmins` (883-886), `countUserDecks` (888-891), `updateUserRole` (893-895), `setUserBan` (897-912, **with its six-line comment about Better Auth's session.create.before hook — that comment is the reason the function opens a transaction, and losing it invites someone to "simplify" the pairing away**), `clearUserBan` (914-918), `deleteUserById` (920-922).

```ts
import { eq, desc, count } from 'drizzle-orm'
import type { DB } from '../client'
import { decks } from '../schema'
import { user, session } from '../auth-schema'
```

- [x] **Step 2: Create `app/db/src/queries/accounts.ts`**

`type UnlinkedAccount` (13) moves here from the top of the old file. Then `getUserIdByDiscordAccount` (1105-1134, with its three-line comment), `getLinkedProviderIds` (1136-1142), `unlinkProvider` (1144-1162, **with its full eleven-line comment explaining why this is not Better Auth's `/unlink-account`** — that comment is load-bearing documentation of a deliberate deviation, mirrored in CLAUDE.md).

```ts
import { eq, sql, and, or, isNull, isNotNull } from 'drizzle-orm'
import type { DB } from '../client'
import { user, account } from '../auth-schema'
```

- [x] **Step 3: Create `app/db/src/queries/user-export.ts`**

`type UserExport` (1033-1042) then `getUserExport` (1044-1091, keeping its `/** Aggregate everything a user owns... */` docblock).

```ts
import { eq, asc, inArray } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, decks, deckCards, deckLikes, collections, userCards } from '../schema'
import { user, account } from '../auth-schema'
```

- [x] **Step 4: Update `queries.ts`**

Delete the moved declarations; add the three bridge lines:

```ts
export * from './queries/users'
export * from './queries/accounts'
export * from './queries/user-export'
```

- [x] **Step 5: Verify**

```bash
cd app && npm run typecheck
npx eslint db/src/queries --max-warnings 0
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
cd .. && npm test -w @revelio/ingest -- user-admin.test.ts discord-link.test.ts auth.test.ts
```

Expected: all clean, `SURFACE UNCHANGED`, three test files pass. `discord-link.test.ts` covers the ban check inside `getUserIdByDiscordAccount`; `user-admin.test.ts` covers the session revocation in `setUserBan`.

- [x] **Step 6: Commit**

```bash
git add app/db/src/queries/users.ts app/db/src/queries/accounts.ts app/db/src/queries/user-export.ts app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the admin, account and export user queries"
```

---

### Task 8: Extract collection and site settings, then delete `queries.ts`

**Files:**
- Create: `app/db/src/queries/collection.ts`, `app/db/src/queries/site-settings.ts`
- Delete: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts`

**Interfaces:**
- Consumes: `type Tx` from `./types` (Task 1).
- Produces: `collection.ts` exporting `setCardQuantity`, `setCollectionVisibility`, `getOwnedQuantities`, `getCollectionVisibility`, `getOwnedCardIds`, `getDuplicateCardIds`, `getCollectionSetProgress`, `getCollectionSummary`, `resolveCollectionOwner` (`ensureCollection` stays unexported); `site-settings.ts` exporting `type SiteSettings`, `type SiteSettingsInput`, `getSiteSettings`, `upsertSiteSettings` (`SITE_SETTINGS_ID` stays a module constant). After this task `db/src/index.ts` imports from the thirteen leaf modules and `queries.ts` no longer exists.

- [x] **Step 1: Create `app/db/src/queries/collection.ts`**

Helper first — `ensureCollection` (926-929, including the `// Ensure the per-user collection row exists...` comment on 926) — then `setCardQuantity` (931-949), `setCollectionVisibility` (951-957), `getOwnedQuantities` (964-976), `getCollectionVisibility` (978-982), `getOwnedCardIds` (986-990), `getDuplicateCardIds` (992-997), `getCollectionSetProgress` (999-1018), `getCollectionSummary` (1020-1031), `resolveCollectionOwner` (1093-1103).

`getCardFinishes` is **not** here — it went to `cards.ts` in Task 3. The `// --- collection: write path ---` and `// --- collection: read path ---` dividers are dropped; keep the write functions before the read functions so the order still reads that way.

```ts
import { eq, asc, sql, inArray, and, count } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, sets, collections, userCards } from '../schema'
import { user } from '../auth-schema'
import type { CollectionVisibility, OwnedQuantities, SetProgress, CollectionSummary } from '@revelio/core'
import type { Tx } from './types'
```

- [x] **Step 2: Create `app/db/src/queries/site-settings.ts`**

Types `SiteSettings` (1166) and `SiteSettingsInput` (1167-1174), then `const SITE_SETTINGS_ID = 'singleton'` (1164), then `getSiteSettings` (1176-1183) and `upsertSiteSettings` (1185-1193).

```ts
import { eq } from 'drizzle-orm'
import type { DB } from '../client'
import { siteSettings } from '../schema'
```

- [x] **Step 3: Delete `queries.ts`**

At this point it should contain nothing but its original import header and thirteen `export *` bridge lines. Confirm that before deleting:

```bash
cd app/db && grep -c "^export \*" src/queries.ts && grep -vc "^\(import\|export \*\|$\)" src/queries.ts
```

Expected: `13` bridge lines, and `0` other non-blank lines. **If the second number is not 0, something was never moved — find it and move it before continuing.** Then:

```bash
git rm app/db/src/queries.ts
```

- [x] **Step 4: Repoint `app/db/src/index.ts` at the leaf modules**

Replace the two `from './queries'` lines (12-13) with one grouped block per module. Leave lines 1-11 untouched.

```ts
export { listSets, getSetByCode, getSetForEdit, createSet, updateSet, deleteSet, setSetSymbolVersion, listSetsForSitemap } from './queries/sets'
export { getCardById, getCardRulings, getRandomCardId, getDailyShowcaseCandidates, listCardsForSitemap, getCardIndexData, getCardFinishes } from './queries/cards'
export { upsertLocalization, setLocalizationImage } from './queries/localizations'
export { saveRulings, listRulingSources } from './queries/rulings'
export { getSubTypeLabels, listSubTypesWithTranslations, saveSubTypeTranslations } from './queries/sub-types'
export { listDecksByUser, getDeck, getDeckForViewer, createDeck, updateDeck, updateDeckMeta, deleteDeck, resolveCardsByName, getCardViews } from './queries/decks'
export { toggleLike, recordView, getDeckLikeState, listPublicDecks } from './queries/deck-browse'
export { listUsersForAdmin, getUserForAdmin, countAdmins, countUserDecks, updateUserRole, setUserBan, clearUserBan, deleteUserById } from './queries/users'
export { getUserIdByDiscordAccount, getLinkedProviderIds, unlinkProvider } from './queries/accounts'
export { getUserExport } from './queries/user-export'
export { setCardQuantity, setCollectionVisibility, getOwnedQuantities, getCollectionVisibility, getOwnedCardIds, getDuplicateCardIds, getCollectionSetProgress, getCollectionSummary, resolveCollectionOwner } from './queries/collection'
export { getSiteSettings, upsertSiteSettings } from './queries/site-settings'

export type { SitemapEntry } from './queries/types'
export type { SetForEdit, SetWriteInput } from './queries/sets'
export type { ShowcaseCandidate } from './queries/cards'
export type { DeckWriteInput, DeckSummary } from './queries/decks'
export type { PublicDeckSort, PublicDeckEntry, ListPublicDecksInput } from './queries/deck-browse'
export type { UserAdminRow, UserAdminDetail } from './queries/users'
export type { UnlinkedAccount } from './queries/accounts'
export type { UserExport } from './queries/user-export'
export type { SiteSettings, SiteSettingsInput } from './queries/site-settings'
```

**`toSetDTO` is deliberately absent from the `./queries/sets` line above.** It is exported from `sets.ts` only so `cards.ts` can call it; it was never part of the package surface and adding it here would change it. Step 5 catches the mistake if it creeps in.

- [x] **Step 5: Verify the full surface, types included**

```bash
cd app && npm run typecheck
cd db && npx tsx -e "import * as db from './src/index.ts'; console.log(Object.keys(db).sort().join('\n'))" > /tmp/db-exports-after.txt
diff /tmp/db-exports-before.txt /tmp/db-exports-after.txt && echo "SURFACE UNCHANGED"
```

Expected: `SURFACE UNCHANGED` and a clean typecheck. The runtime diff covers the 85 values; `npm run typecheck` is what covers the 15 exported types, because `web`, `bot` and `ingest` all consume them and a dropped `export type` breaks their compile.

- [x] **Step 6: Full verification**

```bash
cd app
npm run lint
npx eslint db/src/queries --max-warnings 0
npm run typecheck
npm test -w @revelio/ingest
npm test -w @revelio/bot
npm test -w web
```

Expected: lint clean across all six workspaces, no warnings in the new folder, typecheck clean, and all three suites green with the same counts recorded in Task 1 Step 2. **Do not run bare `npm test`** — see Global Constraints.

- [x] **Step 7: Confirm the shape of the result**

```bash
cd app/db && wc -l src/queries/*.ts && ls src/queries.ts 2>&1
```

Expected: thirteen files, none much over 230 lines, and `ls: src/queries.ts: No such file or directory`.

- [x] **Step 8: Commit**

```bash
git add app/db/src/queries/collection.ts app/db/src/queries/site-settings.ts app/db/src/index.ts
git add -u app/db/src/queries.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(db): extract the collection and site settings queries and drop queries.ts"
```

---

### Task 9: Update CLAUDE.md and open the pull request

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the finished split from Task 8.
- Produces: nothing code-facing.

- [x] **Step 1: Update the `@revelio/db` bullet in CLAUDE.md**

Under **Architecture**, the bullet currently reads:

> - **`@revelio/db`** (`db/`) — Drizzle ORM over Postgres. `schema.ts` (card data) + `auth-schema.ts` (Better Auth tables), `queries.ts`, `client.ts`, and migration runners (`migrate.ts` / `migrate-cli.ts`). Migrations are checked-in SQL under `db/drizzle/`.

Replace `` `queries.ts` `` with a description of the new folder:

> - **`@revelio/db`** (`db/`) — Drizzle ORM over Postgres. `schema.ts` (card data) + `auth-schema.ts` (Better Auth tables), `client.ts`, and migration runners (`migrate.ts` / `migrate-cli.ts`). Queries live one module per domain under `src/queries/` (`sets`, `cards`, `decks`, `collection`, `users`, ...); `src/index.ts` is the only barrel and re-exports from the leaf modules, so nothing outside the package imports a query module directly. Migrations are checked-in SQL under `db/drizzle/`.

- [x] **Step 2: Commit**

```bash
git add CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe the split db query modules"
```

- [x] **Step 3: Push and open the pull request**

```bash
git push -u origin refactor/split-db-queries
```

Then open the PR with `/opt/homebrew/bin/gh pr create`. The title is a Conventional Commit line (`.github/workflows/pr-title.yml` fails otherwise):

`refactor(db): split queries.ts into one module per domain`

The body opens with one to three sentences of prose before any heading, then `## What changed`, `## Verification`, and `## Notes for review`. `## Verification` gets one bullet per command actually run with its real result — the export-surface diff, the lint and typecheck runs, and each test suite with its counts. There is no `## Deployment` section: no migration, no env var, no ingest run. Link this plan document.

---

## Notes for the executor

**If a task reveals that a function belongs somewhere other than where this plan puts it**, say so in your report and follow the plan anyway. Relitigating placement mid-refactor produces a half-and-half tree; a follow-up move is cheap once everything is green.

**If a moved function does not compile in its new home**, the usual cause is a missing import that the old file happened to have. Add it. The second most likely cause is `../` versus `./` on a relative path — every module under `queries/` reaches `client`, `schema` and `auth-schema` through `../`.

**Do not add tests.** The 27 files in `app/ingest/test/` already exercise these queries against a live Postgres and are the oracle for this refactor. A new test here would be testing that code motion is code motion.

**Do not prune `queries.ts`'s import header during Tasks 2 through 7.** It gets deleted in Task 8, and pruning it each round produces noisy diffs and merge pain for no benefit.

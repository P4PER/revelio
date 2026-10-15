# Dependency Upgrade Phase 3: meilisearch-js 0.62 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `@revelio/search` from meilisearch-js 0.45 to 0.62 and adapt every caller to the renamed client and the new task API.

**Architecture:** `createMeiliClient` in `search/src/client.ts` stays the single factory. Callers change only their type import (`MeiliSearch` to `Meilisearch`) and how they wait for tasks (`client.waitForTask(x.taskUid)` to `await x.waitTask()` on the enqueued-task promise). There is no index-settings change, so no reindex.

**Tech Stack:** meilisearch-js 0.62 against Meilisearch server v1.10 (compose and CI).

**Spec:** `docs/superpowers/specs/2026-10-15-dependency-upgrade-design.md`
**Prerequisite:** [Phase 1](2026-10-15-dependency-upgrade-phase-1-toolchain.md) merged. Independent of phase 2. Branch `chore/upgrade-meilisearch` from `main`.

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- Server stays `getmeili/meilisearch:v1.10`. The client must work against it, because federated multi-search needs >= 1.10.
- `CARD_INDEX_SETTINGS` is not edited. If it had to be, the PR would need an ingest run (see the `meili-index-settings-need-reindex` note).
- The bot uses `MEILI_SEARCH_KEY` only, and web's write path uses the scoped `MEILI_WRITE_KEY`. Neither changes.
- Test runs use the throwaway Meilisearch on `:7799`.
- Commits: Conventional Commits, no attribution, `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- Relevance ordering: a name hit must still outrank a text/flavor hit through the federated multi-search. `search/test/search.test.ts` pins it against a live server, so it must run, not skip.
- `estimatedTotalHits` and the paging the bot and web derive from it must keep their field names. A rename would type-error, but only if nothing is cast through `any`.
- `indexCards` must still wait for **both** tasks before returning. Ingest's `main.test.ts` reads the index straight after.
- Error handling that matches on `MeiliSearchApiError` / error `code` (e.g. `index_not_found` in the bot's autocomplete) must still match under the new error classes.
- `deleteIndex` in test `afterAll` hooks now returns an `EnqueuedTaskPromise`. Awaiting it still only enqueues, as before.

---

### Task 1: Bump and rename the client type

**Files:**
- Modify: `app/search/package.json`, `app/package-lock.json`
- Modify: `app/search/src/client.ts`, `app/search/src/documents.ts`, `app/search/src/search.ts`
- Modify: `app/ingest/src/index-cards.ts`
- Modify: `app/web/src/lib/card-neighbors.ts`, `app/web/src/lib/server/reindex.ts`, `app/web/src/lib/server/search-client.ts`, `app/web/src/lib/server/collection-page-data.ts`, `app/web/src/lib/__tests__/card-neighbors.test.ts`
- Modify: `app/bot/src/clients.ts`, `app/bot/src/data/cards.ts`

- [ ] **Step 1: Bump and see the break.**

```bash
npm install meilisearch@^0.62.0 -w @revelio/search
npm run typecheck
```

Expected: FAIL. `TS2724: '"meilisearch"' has no exported member named 'MeiliSearch'. Did you mean 'Meilisearch'?` in the files listed above.

- [ ] **Step 2: Rename.** Every `MeiliSearch` identifier imported from `meilisearch` becomes `Meilisearch`:

```bash
grep -rlE "\bMeiliSearch\b" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next search ingest web bot \
  | xargs sed -i '' -E 's/\bMeiliSearch\b/Meilisearch/g'
grep -rnE "MeiliSearch" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next search ingest web bot
```

The second grep must print nothing except error-class names (`MeiliSearchApiError`, `MeiliSearchError`), which the sed leaves alone because `\b` stops at `Api`/`Error`. Check each one against Task 3. `search/src/client.ts` becomes:

```ts
import { Meilisearch } from 'meilisearch'

export function createMeiliClient(host: string, apiKey: string): Meilisearch {
  return new Meilisearch({ host, apiKey })
}
```

- [ ] **Step 3: Typecheck.** Run `npm run typecheck`. Remaining errors are now real API changes, mainly `Property 'waitForTask' does not exist on type 'Meilisearch'`. Task 2 fixes them.

### Task 2: Wait on the enqueued task

**Files:**
- Modify: `app/ingest/src/index-cards.ts`
- Modify: `app/search/test/search.test.ts`, `app/search/test/reindex-card.test.ts`
- Modify: `app/web/src/lib/server/__tests__/search-client.test.ts`, `app/web/src/lib/__tests__/card-neighbors.integration.test.ts`

- [ ] **Step 1: Rewrite `indexCards`.**

```ts
import type { Meilisearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import { cardsIndex, CARD_INDEX_SETTINGS } from '@revelio/search'
import { buildDocuments } from './build-documents.js'

export async function indexCards(db: DB, client: Meilisearch): Promise<string[]> {
  const byLang = await buildDocuments(db)
  const langs = Object.keys(byLang)
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    // updateSettings auto-creates the index if it does not exist.
    await index.updateSettings(CARD_INDEX_SETTINGS).waitTask()
    await index.addDocuments(byLang[lang], { primaryKey: 'id' }).waitTask()
  }
  return langs
}
```

- [ ] **Step 2: Rewrite the test helpers the same way.** Each pair:

```ts
  const s = await client.index(uid).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(uid).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
```

becomes

```ts
  await client.index(uid).updateSettings(CARD_INDEX_SETTINGS).waitTask()
  await client.index(uid).addDocuments(docs, { primaryKey: 'id' }).waitTask()
```

and the single `await client.waitForTask(del.taskUid)` in `search/test/reindex-card.test.ts` becomes `.waitTask()` on the call that produced `del`. Find every site with:

```bash
grep -rn "waitForTask" --include="*.ts" --exclude-dir=node_modules search ingest web bot
```

Expected after edits: no output.

- [ ] **Step 3: Typecheck and lint.** Run `npm run typecheck && npm run lint`. Expected: exit 0. Any further error is a 0.62 type change on a search/response shape. Fix it at the call site using the type the error names. Do not cast to `any`.

- [ ] **Step 4: Run the suites against Meilisearch v1.10** (throwaway server on `:7799`):

```bash
for w in search ingest web bot; do npm test -w $w 2>&1 | grep -E "^ +(Test Files|Tests) |FAIL"; done
```

Expected: search 52, ingest 147, bot 402 and the web count from phase 1, all passed, with no skipped integration files (`grep -c skipped` on each log is 0 for the Meili suites).

- [ ] **Step 5: Commit.**

```bash
git add search ingest/src web/src bot/src package-lock.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(deps): upgrade meilisearch-js to 0.62" -m "The client class is now Meilisearch, and waiting moved onto the
enqueued-task promise (.waitTask()); client.waitForTask is gone."
```

### Task 3: Error-class matching

**Files:**
- Modify (only if a match is found): wherever the Step 1 grep points

- [ ] **Step 1: Find error matching.**

```bash
grep -rnE "MeiliSearch[A-Za-z]*Error|index_not_found|\.code ===|cause\.code" --include="*.ts" --exclude-dir=node_modules search web/src bot/src ingest/src
```

- [ ] **Step 2: For each hit, check the 0.62 shape** in `node_modules/meilisearch/dist/types/errors/`. If the class was renamed (e.g. `MeilisearchApiError`), rename the import. If `code` moved (to `cause.code`), update the read. A test that throws the real error class must cover each site. If none does, add one beside the existing tests for that module, constructing the error with the 0.62 constructor and asserting the handler's fallback (e.g. the bot autocomplete answers an empty list on `index_not_found`).

- [ ] **Step 3: Run the affected suites, then commit** with `fix(search): match meilisearch-js 0.62 error classes` (scope the workspace touched).

### Task 4: Build and PR

- [ ] **Step 1:** `npm run build -w web`. Then `docker build -f ingest/Dockerfile -t revelio-ingest:meili-check .` and the same for `bot`. Expected: exit 0.
- [ ] **Step 2: Live smoke.** With the dev stack up and `npm run dev -w web`, search `harry` on `/en/search` and confirm name matches come first. Then run `/card` autocomplete in the bot against the local stack (`npm run dev -w @revelio/bot`).
- [ ] **Step 3:** Push, then `gh pr create --title "build(deps): upgrade meilisearch-js to 0.62"`. `## Deployment`: none (no settings change, server unchanged).

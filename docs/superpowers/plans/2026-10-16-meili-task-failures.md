# Meilisearch Task Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a failed Meilisearch task an error, give ingest's bulk waits a timeout that fits a
whole corpus, and make the editor reindex work with the scoped write key it is documented to use.

**Why:** Three review findings on PR #172 (meilisearch-js 0.62), probed against Meilisearch
v1.10.3 on 2026-10-16:

- `waitTask()` resolves with `status: 'failed'` (an invalid document id gives
  `invalid_document_id`, a missing index under a key without `indexes.create` gives
  `index_not_found`). `indexCards` and `reindexCard` discard the task, so ingest and editor saves
  report success over a stale index.
- `waitTask()` times out after 5000 ms by default. A full language's `addDocuments`, or a settings
  update that re-indexes a populated index, can take longer on a cold or small host. Ingest would
  abort after enqueueing a task that later succeeds.
- `reindexCard` calls `updateSettings`, which a key with only `documents.add` cannot do
  (`invalid_api_key`). Waiting on any task polls `GET /tasks/:uid`, which needs `tasks.get`, so
  even a bare add-and-wait fails under the documented key. The recipe in `web/.env.example` is
  rejected outright on v1.10: `documents.update` is not an action. A key with
  `["documents.add", "tasks.get"]` on `cards-*` adds and waits successfully.

**Architecture:** One helper in `@revelio/search`, `waitForSuccess(enqueued, options?)`, waits on
an `EnqueuedTaskPromise` and throws when the task did not succeed. `reindexCard` and `indexCards`
use it. `reindexCard` stops applying settings: ingest owns `CARD_INDEX_SETTINGS` and creates every
language index, and the web write key should not be able to change ranking. Ingest passes
`INDEX_TASK_TIMEOUT_MS` (5 minutes) to its two waits. `CARD_INDEX_SETTINGS` is not edited, so no
reindex.

**Branch:** `fix/meili-task-failures`, stacked on `chore/upgrade-meilisearch` (#172), because
`.waitTask()` exists only from 0.62. Retarget the PR to `main` once #172 merges.

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- Meili-backed tests run against a throwaway `getmeili/meilisearch:v1.10` on `:7799`
  (`TEST_MEILI_HOST=http://localhost:7799 TEST_MEILI_KEY=masterKey`).
- Commits: Conventional Commits, no attribution, `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

---

### Task 1: `waitForSuccess` in `@revelio/search`

**Files:** Create `search/src/tasks.ts`, `search/test/tasks.test.ts`. Modify `search/src/index.ts`.

- [ ] **Step 1: Failing tests** (live server, fresh index per test via `uniqueLang`):
  - an `addDocuments` with document id `'bad id!'` rejects with an error whose message names
    `invalid_document_id` and the task uid;
  - a valid `addDocuments` resolves with the task, `status === 'succeeded'`.
- [ ] **Step 2: Run** `npm test -w search -- test/tasks.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**

```ts
import type { EnqueuedTaskPromise, Task, WaitOptions } from 'meilisearch'

// waitTask() resolves once a task stops running, whatever its outcome: a task
// Meilisearch rejected comes back with status 'failed' rather than as an error.
export async function waitForSuccess(enqueued: EnqueuedTaskPromise, options?: WaitOptions): Promise<Task> {
  const task = await enqueued.waitTask(options)
  if (task.status !== 'succeeded') {
    const reason = task.error ? `${task.error.code}: ${task.error.message}` : task.status
    throw new Error(`Meilisearch task ${task.uid} (${task.type}) ${task.status}: ${reason}`)
  }
  return task
}
```

  Export it from `search/src/index.ts`.
- [ ] **Step 4: Run** the file again. Expected: PASS 2/2.
- [ ] **Step 5: Commit** `feat(search): add a task wait that fails on a failed task`.

### Task 2: `reindexCard` under the scoped key

**Files:** Modify `search/src/documents.ts`, `search/test/reindex-card.test.ts`.

- [ ] **Step 1: Failing tests** in `reindex-card.test.ts`:
  - with a key created from the master key as `{"actions":["documents.add","tasks.get"],"indexes":["cards-*"]}`,
    `reindexCard` into an index that already exists resolves and the card is searchable;
    delete the key in `afterAll`;
  - a card whose id is `'bad id!'` makes `reindexCard` reject.
- [ ] **Step 2: Run** `npm test -w search -- test/reindex-card.test.ts`. Expected: FAIL. The
  scoped test rejects with `invalid_api_key` (from `updateSettings`); the bad-id test resolves.
- [ ] **Step 3: Implement.** Drop `updateSettings` from `reindexCard`; wrap `addDocuments` in
  `waitForSuccess`. Update its comment: settings are ingest's, and a failed task throws.
- [ ] **Step 4: Run** the file. Expected: PASS, including the two existing tests.
- [ ] **Step 5: Commit** `fix(search): reindex a card with only the scoped write key's rights`.

### Task 3: Ingest waits

**Files:** Modify `ingest/src/index-cards.ts`. Create `ingest/test/index-cards-waits.test.ts`.

- [ ] **Step 1: Failing tests** with `buildDocuments` mocked (`vi.mock('../src/build-documents.js')`
  returning one language) and a fake client whose `index().updateSettings()` / `addDocuments()`
  return an `EnqueuedTaskPromise`-shaped object recording the `waitTask` options:
  - a settings task that comes back `failed` makes `indexCards` reject;
  - both waits receive `{ timeout: INDEX_TASK_TIMEOUT_MS }`, and `INDEX_TASK_TIMEOUT_MS` is at
    least 60 s.
- [ ] **Step 2: Run** `npm test -w ingest -- test/index-cards-waits.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export `INDEX_TASK_TIMEOUT_MS = 5 * 60_000` from `index-cards.ts`
  with a comment on why; wrap both calls in `waitForSuccess(..., { timeout: INDEX_TASK_TIMEOUT_MS })`.
- [ ] **Step 4: Run** the file, then `npm test -w ingest`. Expected: PASS, 147 + new.
- [ ] **Step 5: Commit** `fix(ingest): fail on a rejected index task and wait out a full corpus`.

### Task 4: Key recipe and docs

**Files:** Modify `web/.env.example`, `web/src/lib/server/reindex.ts`, `CLAUDE.md`.

- [ ] **Step 1:** `.env.example` recipe becomes `"actions":["documents.add","tasks.get"]` with a
  line saying why `tasks.get` (the reindex waits for its task). The `reindex.ts` comment and
  CLAUDE.md's "Two Meilisearch keys" bullet say `documents.add` + `tasks.get`.
- [ ] **Step 2:** Run the recipe's curl against the throwaway server. Expected: a key is returned.
- [ ] **Step 3: Commit** `docs(web): give the scoped write key the actions a reindex needs`.

### Task 5: Verify and PR

- [ ] `npm run typecheck && npm run lint`; `npm test -w search`, `-w ingest`, `-w web`, `-w bot`.
- [ ] Push, `gh pr create --base chore/upgrade-meilisearch`. `## Deployment`: production's
  `MEILI_WRITE_KEY` must carry `documents.add` and `tasks.get` on `cards-*`; without `tasks.get`
  editor reindexes already fail today. No ingest run needed.

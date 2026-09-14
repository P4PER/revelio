# esbuild Build Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the esbuild `createRequire` banner out of three shell-escaped npm script strings into one `build.mjs` per workspace, so the reason the banner exists lives next to the code that needs it.

**Architecture:** `bot/build.mjs` and `ingest/build.mjs` each call esbuild's JS API with a named `banner` constant and a comment explaining the shim it satisfies. The `build` script in each `package.json` becomes `node build.mjs`. `ingest`'s two entrypoints collapse from `build:job` + `build:migrate` into one script that builds both. **No build output changes** - this is a pure refactor and the emitted bundles must be byte-identical to the current ones.

**Tech Stack:** esbuild 0.25.12 (root devDependency, hoisted to `app/node_modules`), Node 22 ESM, npm workspaces.

**Spec:** No separate spec doc. This came out of a direct review of the existing banner rather than a brainstorm, and the agreed scope is captured in "Context and rationale" below. The behaviour being preserved is documented in `CLAUDE.md` under **Image builds**.

## Global Constraints

- **The banner text does not change.** Byte-for-byte: `import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);`
- **All three bundles keep the banner**, including `migrate.mjs` where it currently emits no shim. That is a property of today's dependency tree, not of the entrypoint.
- **Do not add `__dirname` / `__filename`** to the banner. See "Rejected alternatives".
- **No Dockerfile changes.** `bot/Dockerfile:23` and `ingest/Dockerfile:22` copy the whole workspace directory, `.dockerignore` excludes only `**/dist` and `**/node_modules`, and both images invoke `npm run build -w <ws>` (`bot/Dockerfile:24`, `ingest/Dockerfile:23`), which is unchanged.
- **No new workspace and no shared build helper.** The dependency direction is `core <- {search, db} <- {ingest, web, bot}` and `core` is the framework-agnostic domain layer with no I/O; a build script has no correct home there.
- Comments stay ASCII-only, per repo convention.
- Conventional Commits: `refactor(build): ...`.

## Context and rationale

esbuild's ESM output emits a dynamic-require shim that gates on `typeof require !== "undefined"` (visible at `bot/dist/bot.mjs:9-12`). `discord.js` and parts of the ingest tree are CJS, so without a real `require` bound at module top level the bundle builds clean and throws `Dynamic require of "node:events" is not supported` at import time. The banner defines exactly that binding one line above the shim.

The banner is correct and load-bearing. What is not good practice is its packaging: three copies of an identical `\"`-escaped string across two `package.json` files, with nowhere to write down why it exists. The `__cr` alias is deliberate and must survive the move - banner text is prepended raw and is invisible to esbuild's scope tracking and renaming, so a bare `createRequire` could collide with a bundled identifier of the same name.

### Rejected alternatives

- **A shared build helper.** Would need a home; `core` is the wrong one. Two local files that each state their own reason beat one shared file nobody can place.
- **Adding `__dirname` / `__filename` to the banner.** The only unguarded call site is `@discordjs/ws`'s `resolveWorkerPath` (`bot/dist/bot.mjs:83706`), dead code under the bot's default sharding strategy. Defining `__dirname` resolves it to `/app`, where `defaultWorker.js` does not exist, turning a loud `ReferenceError` into a silent wrong path. The one site in `ingest` (`ingest/dist/ingest.mjs:12394`, AWS SDK) is already `typeof`-guarded.
- **Dropping the inert banner from `migrate.mjs`.** Plants a trap for whoever adds the next CJS dependency.
- **A vitest asserting the banner is present in the bundle.** The Dockerfile smoke tests (`bot/Dockerfile:30`, `ingest/Dockerfile:26-27`) already run each bundle and require it to reach its env guard, which is precisely the failure this would catch. A test that shells out to esbuild would be slow and duplicative.

## File Structure

| File | Responsibility |
| --- | --- |
| `app/bot/build.mjs` (create) | Bundles `src/main.ts` to `dist/bot.mjs`. Owns the banner constant and its explanation. |
| `app/ingest/build.mjs` (create) | Bundles `src/main.ts` to `dist/ingest.mjs` and `../db/src/migrate-cli.ts` to `dist/migrate.mjs` from one entry table. |
| `app/bot/package.json:9` (modify) | `build` becomes `node build.mjs`. |
| `app/ingest/package.json:7-9` (modify) | `build` becomes `node build.mjs`; `build:job` and `build:migrate` are deleted. |
| `CLAUDE.md` (modify) | The **Image builds** section points at `build.mjs`, not "the `build` script in `bot/package.json`". |

---

### Task 1: bot/build.mjs

**Files:**
- Create: `app/bot/build.mjs`
- Modify: `app/bot/package.json:9`
- Test: byte-identical bundle against the recorded baseline (no test file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `banner` shape `{ js: string }` and the option set (`bundle`, `platform: 'node'`, `target: 'node22'`, `format: 'esm'`, `logLevel: 'warning'`) that Task 2 repeats verbatim for its own two entrypoints.

- [ ] **Step 1: Record the baseline hash of the current bundle**

```bash
cd app
npm run build -w @revelio/bot
shasum -a 256 bot/dist/bot.mjs
```

Expected: `4e292b0783cf6bee229cf546970718cb6f4046e8c01e565cbc8c2da32835bb6f  bot/dist/bot.mjs`

If it differs, a dependency moved since this plan was written. Use the hash you just recorded as the baseline for Step 4 and note the discrepancy in the PR.

- [ ] **Step 2: Write `app/bot/build.mjs`**

```js
import * as esbuild from 'esbuild'

// esbuild's ESM output wraps dynamic requires in a shim that gates on
// `typeof require !== "undefined"` and otherwise throws
// 'Dynamic require of "node:events" is not supported'. discord.js is CJS, so
// without a real `require` bound at module top level the bundle builds clean
// and dies at import time. This banner defines that binding one line above the
// shim. It is aliased to __cr because banner text is prepended raw and is
// invisible to esbuild's renaming: a bare `createRequire` could collide with a
// bundled identifier of the same name.
const banner = {
  js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
}

await esbuild.build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/bot.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner,
  logLevel: 'warning',
})
```

- [ ] **Step 3: Point the npm script at it**

In `app/bot/package.json`, replace the `build` value with `node build.mjs`. The whole escaped esbuild invocation goes away.

- [ ] **Step 4: Rebuild and prove the output is byte-identical**

```bash
cd app
rm -rf bot/dist
npm run build -w @revelio/bot
shasum -a 256 bot/dist/bot.mjs
```

Expected: the exact hash from Step 1. A different hash means the option set drifted - diff the two bundles before going further.

- [ ] **Step 5: Confirm the banner is still the first line and the bundle boots**

```bash
cd app
head -1 bot/dist/bot.mjs
env -i node bot/dist/bot.mjs 2>&1 | grep -q 'bot failed to start:' && echo "smoke OK"
```

Expected: the banner line, then `smoke OK`. This is the same assertion `bot/Dockerfile:30` makes.

- [ ] **Step 6: Lint the new file**

```bash
cd app
npm run lint
```

Expected: clean. `app/eslint.config.mjs:13` already globs `{core,search,db,ingest,bot}/**/*.mjs`, so `build.mjs` is linted; the two type rules never fire on it.

- [ ] **Step 7: Commit**

```bash
git add app/bot/build.mjs app/bot/package.json
git commit -m "refactor(bot): move the esbuild banner into a build script"
```

---

### Task 2: ingest/build.mjs

**Files:**
- Create: `app/ingest/build.mjs`
- Modify: `app/ingest/package.json:7-9`
- Test: byte-identical bundles against the recorded baselines (no test file)

**Interfaces:**
- Consumes: the banner text and option set established in Task 1. They are repeated in full here rather than imported - the two workspaces stay independent.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Record the baseline hashes of the current bundles**

```bash
cd app
npm run build -w @revelio/ingest
shasum -a 256 ingest/dist/ingest.mjs ingest/dist/migrate.mjs
```

Expected:
```
8913b0596abd2040e4ca0d1993d95ca1853a0fe2b506b569e312c6907cdc4483  ingest/dist/ingest.mjs
42e1ece23b1ffdc1dd859dd20b571c99f118a0cfd83f233dfad6a443032c9a28  ingest/dist/migrate.mjs
```

- [ ] **Step 2: Write `app/ingest/build.mjs`**

Note `migrate-cli.ts` deliberately lives in `db` and is bundled from here: the ingest image ships the migration runner, and `db` has no build step of its own.

```js
import * as esbuild from 'esbuild'

// esbuild's ESM output wraps dynamic requires in a shim that gates on
// `typeof require !== "undefined"` and otherwise throws
// 'Dynamic require of "node:events" is not supported'. Parts of the ingest
// dependency tree are CJS, so without a real `require` bound at module top
// level the bundle builds clean and dies at import time. This banner defines
// that binding one line above the shim. It is aliased to __cr because banner
// text is prepended raw and is invisible to esbuild's renaming: a bare
// `createRequire` could collide with a bundled identifier of the same name.
//
// migrate.mjs emits no such shim today. It keeps the banner anyway - that is a
// property of the current dependency tree, not of the entrypoint.
const banner = {
  js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
}

// The migration runner lives in db/, which has no build step of its own; the
// ingest image is what ships it.
const entries = [
  { entryPoints: ['src/main.ts'], outfile: 'dist/ingest.mjs' },
  { entryPoints: ['../db/src/migrate-cli.ts'], outfile: 'dist/migrate.mjs' },
]

for (const entry of entries) {
  await esbuild.build({
    ...entry,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    banner,
    logLevel: 'warning',
  })
}
```

- [ ] **Step 3: Collapse the three npm scripts into one**

In `app/ingest/package.json`, set `build` to `node build.mjs` and delete both `build:job` and `build:migrate`. Nothing else references those two names - confirm with:

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
grep -rn "build:job\|build:migrate" --include='*.json' --include='*.yml' --include='Dockerfile*' --include='*.md' . | grep -v node_modules
```

Expected: no hits outside `ingest/package.json` itself and this plan.

- [ ] **Step 4: Rebuild and prove both outputs are byte-identical**

```bash
cd app
rm -rf ingest/dist
npm run build -w @revelio/ingest
shasum -a 256 ingest/dist/ingest.mjs ingest/dist/migrate.mjs
```

Expected: the two hashes from Step 1, unchanged.

- [ ] **Step 5: Confirm both bundles boot to their env guard**

```bash
cd app
env -i node ingest/dist/ingest.mjs  2>&1 | grep -q 'DATABASE_URL is required' \
 && env -i node ingest/dist/migrate.mjs 2>&1 | grep -q 'DATABASE_URL is required' \
 && echo "smoke OK"
```

Expected: `smoke OK`. Same assertion as `ingest/Dockerfile:26-27`.

- [ ] **Step 6: Lint**

```bash
cd app
npm run lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/ingest/build.mjs app/ingest/package.json
git commit -m "refactor(ingest): move the esbuild banner into a build script"
```

---

### Task 3: Point the docs at the build scripts

**Files:**
- Modify: `CLAUDE.md`, **Image builds** section
- Test: none (prose)

**Interfaces:**
- Consumes: the file names created in Tasks 1 and 2.
- Produces: nothing.

- [ ] **Step 1: Update the two sentences that name the old location**

The section currently says the bundle is produced by "The `build` script in `bot/package.json` and `ingest/package.json`", and that "The ESM bundles need the `createRequire` banner **in those build scripts**". Both now point at `bot/build.mjs` and `ingest/build.mjs`. Keep the explanation of *why* the banner is needed where it is - it is repeated in the scripts now, but CLAUDE.md is what a reader hits first.

- [ ] **Step 2: Leave the historical plan docs alone**

`docs/superpowers/plans/` records what was executed at the time. Do not rewrite the bundled-image plan to match the new file layout.

- [ ] **Step 3: Full verification sweep before the PR**

```bash
cd app
npm run typecheck
npm test
npm run lint
```

Expected: all clean. `tsconfig.typecheck.json` includes only `src` in both workspaces, so `build.mjs` is not typechecked - that is intended, it is a build script, not shipped code.

- [ ] **Step 4: Build one image end to end**

```bash
cd app
docker build -f bot/Dockerfile -t revelio-bot:refactor-check .
```

Expected: success, including the `RUN env -i node bot/dist/bot.mjs ... grep -q` layer at `bot/Dockerfile:30`. This is the real gate: it proves `build.mjs` reached the image and the banner still does its job inside it.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: point the image-build notes at the new build scripts"
```

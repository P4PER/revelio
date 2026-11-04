# Ingest Self-Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the ingest job build its own `/data` and `/assets` by running the `card-data/` Python scripts when those directories are empty, so it can run on Coolify with empty volumes.

**Architecture:** A new `provision.ts` in `@revelio/ingest` decides what is missing and spawns `build_dataset.py` then `accio_images.py --download` as subprocesses (injectable runner, so tests need no Python). `runIngest` calls it before `loadDist`. The ingest image gains Python, Pillow and git plus the `card-data/` sources, which moves its Docker build context to the repo root.

**Tech Stack:** Node 22 / TypeScript (esbuild bundle), Vitest, Python 3 + Pillow (existing scripts), Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-04-ingest-self-provisioning-design.md`

## Global Constraints

- Populated mounts win: with `/data` and `/assets` complete, nothing is spawned and behaviour is as today.
- Env vars: `PROVISION` (default `true`), `FORCE_PROVISION` (default `false`). `DATA_DIR`, `I18N_DIR`, `ASSETS_DIR` keep their meaning and defaults (`/data`, `/i18n`, `/assets`).
- Order is always data first, then assets (`accio_images.py` reads and rewrites `cards.json` / `sets.json`).
- A non-zero script exit rejects; `main.ts` already turns that into `seed failed:` + exit 1. Never continue on partial data.
- Python script defaults for local use must not change (`dist/` and `assets/` next to the script when the env overrides are unset).
- A module imported into the ingest bundle has no top-level side effect (CLAUDE.md).
- Declaration order per file: types, constants, helpers, exported functions. `type` aliases, `import type` for type-only imports.
- ASCII-only code comments. Commit messages are Conventional Commits with no tool attribution; sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Toolchain is not on PATH: prefix `/usr/local/bin` for node/npm/docker, `/opt/homebrew/bin` for gh/gpg.
- CI must never run the real scripts (network, 471 MB). Tests use the injected runner.
- Tests for `provision.ts` need no Docker; the existing ingest suite (Testcontainers, Meili, S3) must still pass unchanged.
- Do not run `npm test` against the dev Meilisearch you care about: `main.test.ts` and `index-cards.test.ts` delete `cards-en`/`cards-de`.

## Review Focus

1. A second run on a populated volume must spawn nothing and must not change any asset mtime. `fileVersion` stamps S3 keys from file mtime, so a script that rewrote files every run would mint new image keys every deploy. (`download_symbols` currently re-downloads every run; Task 1 fixes that, Task 2 tests that no runner is called.)
2. An interrupted first run (data present, some images missing) is completed on the next run without `FORCE_PROVISION`. (Task 2 test.)
3. `build_dataset.py` run with a fresh `dist/` leaves `image.url` unset until `accio_images.py` rewrites it, so after a data build the assets script must run even if the images already exist. (Task 2 test.)
4. A failing script (non-zero exit) aborts ingest with the script's name in the error and leaves nothing half-loaded in Postgres, since provisioning runs before `loadDist`. (Task 2 test.)
5. `PROVISION=false` with empty dirs behaves exactly as before (the loader's own ENOENT), and a read-only compose mount keeps working. (Tasks 2 and 4.)

---

### Task 1: Python scripts honour DIST_DIR / ASSETS_DIR and skip existing symbols

**Files:**
- Modify: `card-data/build_dataset.py:26` (the `DIST` constant)
- Modify: `card-data/accio_images.py:27-28` (the `DIST` and `ASSETS` constants), `download_symbols()` around line 169

**Interfaces:**
- Produces: both scripts read `DIST_DIR` (and `accio_images.py` also `ASSETS_DIR`) from the environment, defaulting to the current `HERE`-relative paths. Task 2 passes these when spawning.

- [ ] **Step 1: Write the failing check**

Run from `card-data/`:

```bash
DIST_DIR=/tmp/x-dist ASSETS_DIR=/tmp/x-assets python3 -c "import accio_images as a, build_dataset as b; print(a.DIST, a.ASSETS, b.DIST)"
```

Expected before the change: prints the `card-data/dist`, `card-data/assets`, `card-data/dist` paths (override ignored).

- [ ] **Step 2: Implement the overrides**

In both files replace the path constants with `os.environ.get("DIST_DIR") or os.path.join(HERE, "dist")` (and the same for `ASSETS_DIR` / `assets` in `accio_images.py`). Nothing else changes.

- [ ] **Step 3: Make `download_symbols` skip existing files**

In the loop, before the network request, skip a code whose `assets/symbols/<code>.webp` (or the non-Pillow extension variant) already exists, still setting `s["symbol"]` to the local path, and count it as skipped in the final print (`symbols: saved N, skipped M, failed K`). A re-run must make no network request and leave every symbol file untouched.

- [ ] **Step 4: Verify**

Re-run the Step 1 command: prints `/tmp/x-dist /tmp/x-assets /tmp/x-dist`. Then run `python3 -c "import accio_images as a; print(a.DIST, a.ASSETS)"` with no env: prints the original defaults.

Then, with network, one end-to-end run into scratch dirs, twice:

```bash
DIST_DIR=/tmp/x-dist python3 build_dataset.py /tmp/x-hpjson
DIST_DIR=/tmp/x-dist ASSETS_DIR=/tmp/x-assets python3 accio_images.py --download --workers 16
DIST_DIR=/tmp/x-dist ASSETS_DIR=/tmp/x-assets python3 accio_images.py --download
```

Expected: first run downloads, second prints `symbols: saved 0, skipped 14` and all cards `exists`; `find /tmp/x-assets -newer <marker>` after the second run lists nothing.

- [ ] **Step 5: Commit**

```bash
git add card-data/build_dataset.py card-data/accio_images.py
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(card-data): let DIST_DIR and ASSETS_DIR relocate the pipeline output"
```

---

### Task 2: `provision.ts`

**Files:**
- Create: `app/ingest/src/provision.ts`
- Test: `app/ingest/test/provision.test.ts`

**Interfaces:**
- Consumes: `loadDist(dataDir)` from `./load-dist.js` returning `{ sets, cards }` where each card has `id: string`.
- Produces:
  - `type ScriptRunner = (script: 'build_dataset.py' | 'accio_images.py', args: string[]) => Promise<void>`
  - `type ProvisionConfig = { enabled: boolean; force: boolean; cardDataDir: string; run?: ScriptRunner }`
  - `readProvisionConfig(env: NodeJS.ProcessEnv): ProvisionConfig` (reads `PROVISION`, `FORCE_PROVISION`, `CARD_DATA_DIR`; defaults `true`, `false`, `/app/card-data`; only the literal string `false` disables and only `true` forces)
  - `provision(dirs: { dataDir: string; assetsDir: string }, config: ProvisionConfig): Promise<void>`
  - The default runner spawns `python3 <cardDataDir>/<script> <args>` with `stdio: 'inherit'`, `cwd: cardDataDir`, and `DIST_DIR` / `ASSETS_DIR` set from `dirs`; a non-zero exit rejects with an `Error` whose message names the script and the exit code.

**Decision rules `provision` implements (from the spec):**
- `enabled: false` returns immediately, spawns nothing.
- Data is present when `cards.json` and `sets.json` both exist in `dataDir`. Missing, or `force`, runs `build_dataset.py` with args `[<os tmp dir>/hpjson]` (a scratch clone path the script removes itself).
- Assets script (`accio_images.py --download`) runs when `force`, or the data script just ran, or any card id from `loadDist(dataDir)` lacks `assetsDir/cards/<id>.webp`, or `assetsDir/symbols` has no file.
- Otherwise log one line saying inputs are present and spawn nothing.

- [ ] **Step 1: Write the failing tests** in `provision.test.ts`, using a temp dir, a fake runner that records `[script, args]`, and `cards.json` / `sets.json` copied from `test/fixtures/dataset`. Names and assertions:
  - `spawns nothing when disabled`: empty dirs, `enabled:false` -> runner calls `[]`.
  - `spawns nothing when data and assets are complete`: fixture data, a `cards/<id>.webp` for every fixture card id plus one file in `symbols/` -> calls `[]`.
  - `builds data then assets when both are empty`: calls equal `['build_dataset.py', 'accio_images.py']` in that order; second call args `['--download']`.
  - `runs the assets script after a data build even if images exist` (Review Focus 3): data missing, images complete -> both scripts.
  - `completes an interrupted image run` (Review Focus 2): data present, one card image missing -> only `accio_images.py`.
  - `force reruns both scripts on populated dirs`.
  - `rejects with the script name when a script fails` (Review Focus 4): runner throws for `build_dataset.py` -> `provision` rejects, message contains `build_dataset.py`, and `accio_images.py` was never called. Catch the rejection by hand; Vitest's `rejects.toThrow` is broken in this repo.
  - `readProvisionConfig defaults and parsing`: `{}` -> `{enabled:true, force:false, cardDataDir:'/app/card-data'}`; `PROVISION=false` -> disabled; `FORCE_PROVISION=true` -> forced; any other value of either leaves the default.
  - `default runner rejects on non-zero exit`: point `cardDataDir` at a temp dir containing a `build_dataset.py` that is `import sys; sys.exit(3)`, skip this test if `python3` is not on PATH; asserts the message contains `3`.

- [ ] **Step 2: Run to verify failure**

Run: `cd app && /usr/local/bin/npm test -w @revelio/ingest -- test/provision.test.ts`
Expected: FAIL, module `../src/provision.js` not found.

- [ ] **Step 3: Implement `provision.ts`** per the interfaces and rules above, following the file-order convention (types, constants, helpers, exports). Use `node:child_process` `spawn`, `node:fs/promises` `access`/`readdir`, and `node:os` `tmpdir`. No top-level side effects.

- [ ] **Step 4: Run to verify pass**

Run the Step 2 command. Expected: all `provision.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ingest/src/provision.ts app/ingest/test/provision.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(ingest): provision missing data and images with the card-data scripts"
```

---

### Task 3: Wire provisioning into `runIngest` and `main.ts`

**Files:**
- Modify: `app/ingest/src/main.ts`
- Test: no new test file; existing `app/ingest/test/main.test.ts` must stay green untouched.

**Interfaces:**
- Consumes: `provision`, `readProvisionConfig`, `ProvisionConfig` from Task 2.
- Produces: `runIngest` gains an optional `provision?: ProvisionConfig` option. Omitted means no provisioning, so every existing caller and test is unchanged. The CLI block builds it with `readProvisionConfig(process.env)`.

- [ ] **Step 1: Modify `runIngest`**: after `runMigrations(db)` and computing `assetsDir`, and before `loadDist`, `if (opts.provision) await provision({ dataDir: opts.dataDir, assetsDir }, opts.provision)`. Provisioning goes before `loadDist` so a failure leaves Postgres untouched beyond migrations.

- [ ] **Step 2: Modify the CLI block** to pass `provision: readProvisionConfig(process.env)` and log `provisioning inputs (set PROVISION=false to skip)` when enabled.

- [ ] **Step 3: Verify**

Run: `cd app && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint`
Expected: both clean.

Run: `cd app && /usr/local/bin/npm test -w @revelio/ingest -- test/provision.test.ts test/load-dist.test.ts test/upload-images.test.ts`
Expected: PASS. (The full ingest suite runs in Task 4's end-to-end check and in CI.)

- [ ] **Step 4: Commit**

```bash
git add app/ingest/src/main.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(ingest): provision inputs before loading the dataset"
```

---

### Task 4: Image, build context, compose and CI

**Files:**
- Modify: `app/ingest/Dockerfile`
- Create: `.dockerignore` (repo root)
- Modify: `app/docker-compose.yml` (`ingest` and `migrate` services)
- Modify: `.github/workflows/publish.yml` (ingest path filter, `build-ingest` context)
- Modify: `.github/workflows/ci.yml` only if it builds the ingest image (grep for `ingest/Dockerfile`)

**Interfaces:**
- Consumes: the `CARD_DATA_DIR` default `/app/card-data` from Task 2.
- Produces: an image that contains `python3`, Pillow with WebP, `git`, `ca-certificates`, and `/app/card-data` holding only the script sources, `card.schema.json`, `sets.schema.json`, `card_overrides.json`, `image_overrides.json`, `translations/`, and `i18n/` (also copied to `/i18n`).

- [ ] **Step 1: Change the build context to the repo root.** In the Dockerfile prefix every `COPY` source with `app/` (`COPY app/package.json app/package-lock.json ./`, `COPY app/core ./core`, ...). In `docker-compose.yml` set `context: ..` and `dockerfile: app/ingest/Dockerfile` for both `ingest` and `migrate` (they share the image tag). In `publish.yml` set `context: .` and keep `file: app/ingest/Dockerfile`.

- [ ] **Step 2: Add the repo-root `.dockerignore`.** Same entries as `app/.dockerignore`, but written for the new root (`**/node_modules`, `**/.next`, `**/dist` carved out so `card-data/dist` is excluded too, `.git`, `**/.env`, `**/.env.*`, `!**/.env.example`, `**/.DS_Store`), plus `card-data/assets`, `card-data/hpjson`, `**/__pycache__`. Leave `app/.dockerignore` in place for the other services.

- [ ] **Step 3: Runtime stage.** Add `RUN apk add --no-cache python3 py3-pillow git ca-certificates`, then copy the script sources and data files listed under Interfaces from `card-data/` to `/app/card-data` (explicit `COPY` lines, never the directory wholesale), `COPY card-data/i18n /i18n`, and `ENV CARD_DATA_DIR=/app/card-data`. After the existing bundle smoke test, add two runtime-stage proofs so a missing dependency fails the build: `RUN python3 -c "from PIL import features; assert features.check('webp')"` and `RUN cd /app/card-data && python3 -c "import accio_images, build_dataset"`.

- [ ] **Step 4: Compose.** On the `ingest` service add `PROVISION: "false"` to `environment` (it keeps its three read-only bind mounts). Add a comment that a service with a writable volume and no mounts needs `PROVISION` left at its default.

- [ ] **Step 5: publish.yml filter.** Add `- 'card-data/**'` to the `ingest:` filter list (the scripts and translations are now part of the image).

- [ ] **Step 6: Verify**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH docker build -f app/ingest/Dockerfile -t revelio-ingest:local .
docker image ls revelio-ingest:local --format '{{.Size}}'
```
Expected: build succeeds (the two Python assertions pass); size roughly 300 MB.

End to end, with the compose Postgres/Meili/RustFS up and throwaway Meili per the memory note (npm test wipes dev Meili): run the image with `-v` named empty volumes on `/data` and `/assets` and `PROVISION` unset, expect `seed complete`; run it again and expect the log line `inputs present` and no `accio` output, and confirm no asset file mtime changed (`docker run --rm -v <assets-vol>:/a alpine find /a -newer <marker>` lists nothing after run two).

Also run `docker compose run --rm --build migrate` and `docker compose run --rm --build ingest` from `app/` to prove the compose context change works with the bind-mounted, `PROVISION=false` path.

Full suite: `cd app && /usr/local/bin/npm test` with the CI-style Meili/RustFS up. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/ingest/Dockerfile .dockerignore app/docker-compose.yml .github/workflows/publish.yml
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(ingest): ship the card-data scripts and move the build context to the repo root"
```

---

### Task 5: Documentation

**Files:**
- Modify: `app/ingest/.env.example`
- Modify: `card-data/README.md` (Images & symbols section)
- Modify: `CLAUDE.md` (ingest workspace bullet and the Image builds section)

- [ ] **Step 1: `.env.example`.** Replace the "Dataset mounts" comment: the directories may now be empty volumes, the job fills them. Add `PROVISION=true` and `FORCE_PROVISION=false` with one comment each (first run downloads about 471 MB; `FORCE_PROVISION=true` after changing translations or overrides; `PROVISION=false` for read-only bind mounts). Add `CARD_DATA_DIR=/app/card-data` as an advanced override.

- [ ] **Step 2: `card-data/README.md`.** One paragraph under Images & symbols: `DIST_DIR` / `ASSETS_DIR` relocate the output, and the ingest image runs these scripts itself on empty volumes.

- [ ] **Step 3: `CLAUDE.md`.** In the ingest bullet, state that it provisions missing `/data` and `/assets` with the Python scripts. In Image builds, note that the ingest image carries Python, Pillow and `card-data/` sources (about 300 MB) and that its build context is the repo root, so Coolify's build settings must use the root as context with `app/ingest/Dockerfile`. Keep the existing bundle rules intact.

- [ ] **Step 4: Verify.** `grep -n "PROVISION" app/ingest/.env.example CLAUDE.md card-data/README.md` shows all three files; `cd app && /usr/local/bin/npm run lint` is clean.

- [ ] **Step 5: Commit**

```bash
git add app/ingest/.env.example card-data/README.md CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(ingest): document self-provisioning and the new build context"
```

---

## Deployment notes (for the PR body)

- Coolify: set the ingest application's build context to the repository root with dockerfile `app/ingest/Dockerfile`; mount persistent volumes at `/data` and `/assets` (about 600 MB free); leave `PROVISION` unset. The container needs outbound access to github.com and accio.cards on the first run.
- A fresh asset volume stamps new file mtimes, so the first Coolify ingest mints new image keys (`fileVersion` is mtime based). Subsequent runs on the same volume reuse them.
- Pushing to `main` rebuilds the ingest image for any `card-data/**` change.

## Self-review

- Spec coverage: behaviour table and variables (Tasks 2, 3), script overrides (Task 1), image, context, compose, `publish.yml` filter (Task 4), docs (Task 5), testing section (Tasks 2 and 4). `I18N_DIR` open point is resolved minimally: `card-data/i18n` is copied to `/i18n` and `loadLabels` is left alone.
- Spec nuance changed: with `PROVISION=false` the spec says "fails with the old clear message"; the old behaviour is the loader's own ENOENT, which this plan keeps rather than adding a new message. Flagged for review.
- Added beyond the spec: `download_symbols` skip-existing (needed so a re-run does not mint new image keys) and an assets-completeness check by card id (so an interrupted run recovers).
- Types and names are consistent across tasks: `ScriptRunner`, `ProvisionConfig`, `provision`, `readProvisionConfig`.

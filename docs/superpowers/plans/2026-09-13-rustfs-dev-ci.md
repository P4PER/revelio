# RustFS migration, phase 1: dev stack and CI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the archived MinIO image with RustFS in the local dev stack and in CI, leaving production untouched.

**Architecture:** A container swap, not a code change. `app/docker-compose.yml` gets a `rustfs` service in place of `minio` with a fresh volume; the CI `test` job starts the same pinned image; the docs stop naming MinIO. No application code, no schema, no migration - the S3 calls are identical and already covered by `ingest/test/upload-images.test.ts`.

**Tech Stack:** Docker Compose, GitHub Actions, `rustfs/rustfs:1.0.0-rc.6`, vitest, `@aws-sdk/client-s3`.

**Spec:** `docs/superpowers/specs/2026-09-13-rustfs-migration-design.md`

## Global Constraints

- Run every app command from `app/`. Prefix `npm` with `/usr/local/bin`, `gh` and `gpg` with `/opt/homebrew/bin`.
- Image pin is exactly `rustfs/rustfs:1.0.0-rc.6`. Never `latest`.
- S3 credentials stay `minioadmin`/`minioadmin` in dev and CI. Do not rename them.
- Code comments stay ASCII: no em-dashes, no unicode arrows.
- Conventional Commits, `type(scope): subject`, imperative, lower case, no trailing period, no tool attribution.
- Never run the full `@revelio/ingest` suite against the dev stack: `main.test.ts` and `index-cards.test.ts` delete the `cards-en`/`cards-de` Meilisearch indexes.
- Branch before committing. Never commit to `main`.

---

### Task 1: Swap the dev stack to RustFS

**Files:**
- Modify: `app/docker-compose.yml` (header comment; `ingest` service `S3_ENDPOINT`; the `minio` service block; the `volumes:` map)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a compose service named `rustfs` reachable at `http://rustfs:9000` inside the network and `http://localhost:9000` from the host, with its console at `http://localhost:9001/rustfs/console/`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git checkout main && git pull
git checkout -b feat/rustfs-dev-stack
```

- [ ] **Step 2: Replace the `minio` service block**

In `app/docker-compose.yml`, replace the whole `minio:` service (the Quay comment block through its `healthcheck:` retries line) with:

```yaml
  rustfs:
    # Replaces MinIO, whose community edition is archived (GitHub repo archived
    # 2026-04-24) and whose Docker Hub namespace was withdrawn. RustFS speaks the
    # same S3 API on the same ports, including the public-read bucket policy the
    # card images rely on. Pinned like postgres and meilisearch are.
    image: rustfs/rustfs:1.0.0-rc.6
    environment:
      RUSTFS_ACCESS_KEY: minioadmin
      RUSTFS_SECRET_KEY: minioadmin
    ports:
      - "127.0.0.1:9000:9000" # S3 API
      - "127.0.0.1:9001:9001" # console, at /rustfs/console/ (bare / answers S3)
    volumes:
      - rustfs:/data
    healthcheck:
      # Not /minio/health/live or /health: both answer 200 while the server still
      # reports "waiting for storage_quorum" on /. A ready S3 handler answers an
      # unsigned GET / with AccessDenied, so that is what we look for.
      test: ["CMD-SHELL", "curl -s http://localhost:9000/ | grep -q AccessDenied"]
      interval: 5s
      timeout: 5s
      retries: 10
```

- [ ] **Step 3: Repoint the `ingest` service and the volume map**

In the same file, in the `ingest` service `environment:` block change:

```yaml
      S3_ENDPOINT: http://minio:9000
```

to:

```yaml
      S3_ENDPOINT: http://rustfs:9000
```

and at the bottom of the file change the `volumes:` map from:

```yaml
volumes:
  pgdata: {}
  meili: {}
  minio: {}
```

to:

```yaml
volumes:
  pgdata: {}
  meili: {}
  rustfs: {}
```

- [ ] **Step 4: Fix the header comment**

The file's opening comment names the old test container. Change the line

```
# (revelio-testmeili:7700, revelio-testminio:9000) - stop those first.
```

so it reads `revelio-tests3:9000` instead of `revelio-testminio:9000`, and leave the rest of the header as it is. (`minioadmin` in the credentials line stays: that is still the literal credential.)

- [ ] **Step 5: Validate the compose file parses**

Run: `cd app && docker compose config -q`
Expected: no output, exit 0. Any `service "minio" refers to undefined volume` error means step 3 was missed.

- [ ] **Step 6: Bring the new service up**

```bash
cd app
docker compose rm -sf minio 2>/dev/null || true
docker compose up -d rustfs
docker inspect app-rustfs-1 --format '{{.State.Health.Status}}'
```

Expected: `healthy` within about 15 seconds. If it stays `starting`, run `docker logs app-rustfs-1` - `waiting for storage_quorum` that never clears means the volume is wrong.

- [ ] **Step 7: Run the S3 test suite against it**

Run: `/usr/local/bin/npm test -w @revelio/ingest -- test/upload-images.test.ts`
Expected: `3 passed`. The three cover signed writes under versioned keys, an **unsigned** public read (the browser's path), and the skip-on-re-run diff.

- [ ] **Step 8: Prove the real path end to end with a full ingest**

The dev bucket is empty - the new volume is blank and RustFS cannot read MinIO's format. Repopulate it, with Meilisearch on a throwaway port so the dev indexes survive:

```bash
cd app
docker run -d --rm --name revelio-tmpmeili -p 7799:7700 -e MEILI_MASTER_KEY=masterKey getmeili/meilisearch:v1.10
DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio \
DATA_DIR=../card-data/dist I18N_DIR=../card-data/i18n ASSETS_DIR=../card-data/assets \
MEILI_HOST=http://localhost:7799 MEILI_MASTER_KEY=masterKey \
S3_ENDPOINT=http://localhost:9000 S3_BUCKET=images \
S3_ACCESS_KEY=minioadmin S3_SECRET_KEY=minioadmin \
S3_REGION=eu-central-1 S3_FORCE_PATH_STYLE=true \
npx tsx ingest/src/main.ts
docker rm -f revelio-tmpmeili
```

Expected: a `seed complete: N sets, M cards imported (additive) + search indexed + images uploaded` line.

- [ ] **Step 9: Confirm the images are actually public**

```bash
KEY=$(curl -s --aws-sigv4 "aws:amz:eu-central-1:s3" -u minioadmin:minioadmin \
  "http://localhost:9000/images?list-type=2&max-keys=1&prefix=cards/" \
  | grep -o '<Key>[^<]*</Key>' | head -1 | sed 's|<Key>||; s|</Key>||')
echo "key=$KEY"
curl -s -o /dev/null -w "anon GET -> %{http_code}\n" "http://localhost:9000/images/$KEY"
```

Expected: a real key such as `cards/aah-1-albus-dumbledore.1783899598.webp`, then `anon GET -> 200`. That second request carries no credentials, which is exactly what the browser sends for a card image, so a `403` means `ensureBucket`'s public-read policy did not stick and the swap is not done.

Two traps this command already avoids, both hit while writing this plan: the **listing** must be signed (the bucket policy grants `s3:GetObject` only, so an unsigned list returns `AccessDenied` and leaves `$KEY` empty), and the `sed` must use two plain expressions - BSD `sed` on macOS does not understand `\?`, so `s|</\?Key>||g` silently leaves the tags in place and the GET 404s on a mangled key.

- [ ] **Step 10: Commit**

```bash
git add app/docker-compose.yml
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat: run the dev stack on RustFS instead of the archived MinIO"
```

---

### Task 2: Swap the CI service

**Files:**
- Modify: `.github/workflows/ci.yml:51-59` (the `Start MinIO` step and the MinIO half of `Wait for services`)

**Interfaces:**
- Consumes: the image pin and readiness probe established in Task 1.
- Produces: a CI `test` job that needs no Docker Hub MinIO image. `TEST_S3_ENDPOINT`, `TEST_S3_ACCESS_KEY` and `TEST_S3_SECRET_KEY` keep their current values.

- [ ] **Step 1: Replace the start step**

Change:

```yaml
      - name: Start MinIO
        run: docker run -d --name minio -p 9000:9000 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
```

to:

```yaml
      - name: Start RustFS
        run: docker run -d --name rustfs -p 9000:9000 -e RUSTFS_ACCESS_KEY=minioadmin -e RUSTFS_SECRET_KEY=minioadmin rustfs/rustfs:1.0.0-rc.6
```

Note there is no trailing `server /data`: RustFS takes its volume from `RUSTFS_VOLUMES`, which the image already defaults to `/data`.

- [ ] **Step 2: Replace the readiness loop**

In the `Wait for services` step, change the two MinIO lines:

```bash
          for i in $(seq 1 30); do curl -fsS http://localhost:9000/minio/health/live && break || sleep 2; done
          curl -fsS http://localhost:9000/minio/health/live || { echo "MinIO never became ready"; exit 1; }
```

to:

```bash
          for i in $(seq 1 30); do curl -s http://localhost:9000/ | grep -q AccessDenied && break || sleep 2; done
          curl -s http://localhost:9000/ | grep -q AccessDenied || { echo "RustFS never became ready"; exit 1; }
```

Leave the Meilisearch lines above them untouched.

- [ ] **Step 3: Check the workflow still parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "ci: start RustFS instead of MinIO for the test job"
```

CI itself is the verification here and cannot run locally; Task 4 checks it on the PR.

---

### Task 3: Stop the docs naming MinIO

**Files:**
- Modify: `README.md:35`, `README.md:41`, `README.md:50`
- Modify: `CLAUDE.md:45`, `CLAUDE.md:49`, `CLAUDE.md:60`, `CLAUDE.md:69`, `CLAUDE.md:85`
- Modify: `app/web/.env.example:21`, `app/web/.env.example:42`
- Modify: `app/ingest/.env.example:2`, `app/ingest/.env.example:30`, `app/ingest/.env.example:38`

**Interfaces:**
- Consumes: the service name `rustfs` from Task 1.
- Produces: nothing code-facing. No env var name or value changes - only prose.

- [ ] **Step 1: Rewrite the prose mentions**

Apply these, and change nothing else:

| File:line | From | To |
|---|---|---|
| `README.md:35` | `uploads card images to S3/MinIO.` | `uploads card images to S3/RustFS.` |
| `README.md:41` | `Meilisearch · S3/MinIO · Better Auth` | `Meilisearch · S3/RustFS · Better Auth` |
| `README.md:50` | `(postgres, meilisearch, minio)` | `(postgres, meilisearch, rustfs)` |
| `CLAUDE.md:45` | `spins up Meilisearch + MinIO in Docker` | `spins up Meilisearch + RustFS in Docker` |
| `CLAUDE.md:49` | `starts postgres, meilisearch, and minio.` | `starts postgres, meilisearch, and rustfs.` |
| `CLAUDE.md:60` | `` `postgres`, `meilisearch`, `minio` `` | `` `postgres`, `meilisearch`, `rustfs` `` |
| `CLAUDE.md:69` | `uploads card images to S3/MinIO.` | `uploads card images to S3/RustFS.` |
| `CLAUDE.md:85` | `stored in S3/MinIO with lang-aware keys` | `stored in S3/RustFS with lang-aware keys` |
| `app/web/.env.example:21` | `(MinIO/CDN)` | `(RustFS/CDN)` |
| `app/web/.env.example:42` | `# S3/MinIO write access for image upload (server-only)` | `# S3/RustFS write access for image upload (server-only)` |
| `app/ingest/.env.example:2` | `uploads card images to S3/MinIO.` | `uploads card images to S3/RustFS.` |
| `app/ingest/.env.example:30` | `# ---- S3 / MinIO image hosting ---...` | `# ---- S3 / RustFS image hosting ---...` (keep the dashes padding the line to the same width) |
| `app/ingest/.env.example:38` | `true for MinIO and other path-style hosts.` | `true for RustFS and other path-style hosts.` |

Leave `minioadmin` alone everywhere: it is a literal credential value, not a product reference. Leave `docs/superpowers/` and `docs/RUNBOOK-IMAGE-VERSIONING-ROLLOUT.md` alone - those are dated historical records. Leave `chisel/` alone: it describes production, which phase 2 owns.

- [ ] **Step 2: Add the local-infra note to CLAUDE.md**

Immediately after the `docker compose up` sentence at `CLAUDE.md:49`, add:

```
The object store is RustFS, not MinIO: MinIO's community edition was archived in 2026 and its Docker Hub image withdrawn. It serves the same S3 API on `localhost:9000`, and its console is at `http://localhost:9001/rustfs/console/` - bare `/` on 9001 answers an S3 `AccessDenied`, which is not a fault.
```

- [ ] **Step 3: Check nothing was missed**

Run: `grep -rniI "minio" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next . | grep -v "docs/superpowers" | grep -v "RUNBOOK-IMAGE-VERSIONING" | grep -v chisel/`
Expected: only lines containing `minioadmin`, and nothing else.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md app/web/.env.example app/ingest/.env.example
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: name RustFS as the object store instead of MinIO"
```

---

### Task 4: Verify the whole branch and open the PR

**Files:**
- None. This task only runs checks and opens the PR.

**Interfaces:**
- Consumes: all three commits from Tasks 1-3.
- Produces: a PR whose CI run is the proof the CI swap works on a clean runner.

- [ ] **Step 1: Run the checks that can run locally**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm test -w web
```

Expected: typecheck and lint clean; the web suite green. Record the real counts - they go in the PR body.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/rustfs-dev-stack
/opt/homebrew/bin/gh pr create --base main \
  --title "feat: run the dev stack and CI on RustFS instead of MinIO" \
  --body "..."
```

The body opens with one to three sentences of prose, then `## What changed`, `## Verification` (one bullet per command actually run, with its real result), and `## Notes for review`. Link the spec at `docs/superpowers/specs/2026-09-13-rustfs-migration-design.md`. State plainly that RustFS is at `1.0.0-rc.6` and that this PR puts it in dev and CI only - production still runs MinIO until phase 2.

No `## Deployment` section is needed: nothing here reaches a deployed service.

- [ ] **Step 3: Confirm CI is green before asking for review**

Run: `/opt/homebrew/bin/gh pr checks <number> --watch`
Expected: `check`, `test`, `build` and `lint` all pass. The `test` job is the one that matters - it proves `Start RustFS` works on a runner with no cached image.

If `test` fails on readiness, read the step log: `Start RustFS` succeeding while the wait loop times out means the AccessDenied probe needs longer than 60 seconds on a cold runner, not that the image is wrong.

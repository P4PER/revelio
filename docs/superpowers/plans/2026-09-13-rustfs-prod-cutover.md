# RustFS migration, phase 2: production cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move production card-image hosting off the archived MinIO onto RustFS, with no object copy and a rollback that is one env change.

**Architecture:** RustFS is stood up beside the running MinIO on a spare port, ingest repopulates it from `card-data` (the dataset is reproducible, so nothing is migrated), the web service is pointed at the new endpoint, and MinIO is decommissioned only after a soak. The repository deliverables are a runbook and the `chisel/` rename; the cutover itself happens on the production host, whose compose file lives outside this repository.

**Tech Stack:** Docker, `rustfs/rustfs:1.0.0-rc.6`, `@revelio/ingest` (GHCR image), chisel tunnel.

**Spec:** `docs/superpowers/specs/2026-09-13-rustfs-migration-design.md`

## Global Constraints

- Phase 1 (`docs/superpowers/plans/2026-09-13-rustfs-dev-ci.md`) must be merged first. It is what proves the image works against this codebase.
- Image pin is exactly `rustfs/rustfs:1.0.0-rc.6`. Never `latest`.
- Production credentials are NOT `minioadmin`. Generate real ones and put them in the host's secret store, never in this repository.
- Do not delete a single MinIO object until the soak in Task 4 passes. MinIO keeping its data intact is the entire rollback plan.
- Documentation filenames are UPPERCASE. Docs are English.
- Code comments stay ASCII: no em-dashes, no unicode arrows.
- Conventional Commits, `type(scope): subject`. Branch before committing; never commit to `main`.

## Decide before starting

RustFS is at `1.0.0-rc.6`, pre-1.0. Dev and CI can carry that risk; production is a judgement call between an archived-but-battle-tested MinIO and an actively developed release candidate. SeaweedFS (Apache-2.0, eleven years old) passed the identical probe and is the conservative alternative - every step below works for it unchanged apart from the image and its env var names. Make that call explicitly and record it in the runbook's opening paragraph before executing Task 3.

---

### Task 1: Write the cutover runbook

**Files:**
- Create: `docs/RUNBOOK-RUSTFS-CUTOVER.md`

**Interfaces:**
- Consumes: the service shape from phase 1 (`rustfs/rustfs:1.0.0-rc.6`, `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`, AccessDenied readiness probe).
- Produces: the document Task 3 executes step by step.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git checkout main && git pull
git checkout -b feat/rustfs-prod-cutover
```

- [ ] **Step 2: Write the runbook**

Create `docs/RUNBOOK-RUSTFS-CUTOVER.md` with these sections, in this order:

1. **Why** - MinIO's community edition is archived (repo archived 2026-04-24, Docker Hub namespace withdrawn); the production server will never receive another security fix. One paragraph, with the chosen replacement and the reason for choosing it.
2. **What does not move** - no objects are copied. Ingest regenerates every card image, thumbnail, art crop and set symbol from `card-data`, and rewrites the version columns and the search index as it goes. MinIO keeps its data untouched throughout, which is the rollback.
3. **Before you start** - record, in the ticket: the current `S3_ENDPOINT`, `S3_BUCKET`, `NEXT_PUBLIC_IMAGE_BASE_URL`, and the object count from MinIO. Note whether `NEXT_PUBLIC_IMAGE_BASE_URL` will change (see section 6).
4. **Stand RustFS up beside MinIO** - a second container on a spare port so nothing in production is touched yet:

   ```bash
   docker run -d --name rustfs --restart unless-stopped \
     -p 127.0.0.1:9100:9000 -p 127.0.0.1:9101:9001 \
     -e RUSTFS_ACCESS_KEY="$RUSTFS_ACCESS_KEY" \
     -e RUSTFS_SECRET_KEY="$RUSTFS_SECRET_KEY" \
     -v rustfs-data:/data \
     rustfs/rustfs:1.0.0-rc.6
   until curl -s http://localhost:9100/ | grep -q AccessDenied; do sleep 2; done
   ```

   Readiness is the AccessDenied probe, not `/minio/health/live` - RustFS answers that one 200 while still reporting `waiting for storage_quorum`.
5. **Recreate the credential** - IAM state does not migrate. Whatever user or service account backs the production `S3_ACCESS_KEY` has to be created again, through the console at `http://localhost:9101/rustfs/console/` (Access Keys) or the admin API. Warn that `mc admin ...` fails against RustFS, which serves its admin API under `/rustfs/admin/v3/` rather than MinIO's `/minio/admin/v3/`; `mc cp`/`ls`/`mirror` still work, being plain S3.
6. **Repopulate with ingest** - the normal ingest job pointed at the new endpoint. Spell out that this is the full job: it runs migrations, re-seeds Postgres additively and re-indexes Meilisearch as well as uploading images. `ensureBucket` creates the bucket and installs the public-read policy, so nothing has to be pre-created.

   ```bash
   docker run --rm --env-file ingest/.env \
     -e S3_ENDPOINT=http://localhost:9100 \
     -v /srv/card-data/dist:/data:ro \
     -v /srv/card-data/i18n:/i18n:ro \
     -v /srv/card-data/assets:/assets:ro \
     ghcr.io/p4per/revelio-ingest:<tag>
   ```

   Expected: a `seed complete: N sets, M cards imported (additive) + search indexed + images uploaded` line. Substitute the host's real dataset paths and tag.
7. **Verify before cutting over** - three checks, all against RustFS while production still serves from MinIO:
   - object count is within one of the MinIO count recorded in section 3 (a new ingest may add versions);
   - an unsigned `curl` of a known card thumbnail key returns 200 (this is the browser's exact request, and the only proof the public-read policy took);
   - the same key returns the same bytes as MinIO's copy (`curl -s ... | sha256sum` on both).
8. **Cut over** - point the web service's `S3_ENDPOINT` at RustFS and restart it. **The trap:** `NEXT_PUBLIC_IMAGE_BASE_URL` is inlined at `next build`, not read at runtime. If the public image URL changes, the web image must be **rebuilt**, not just restarted. Keeping the same public hostname in front of RustFS (reverse proxy, same DNS name) avoids the rebuild entirely and is the recommended route.
9. **Soak** - leave MinIO running and untouched for at least a week. Rollback in that window is one env change plus a restart, with no data to restore.
10. **Decommission** - stop and remove the MinIO container, then remove its volume. Update `chisel/.env` on operator machines to the value Task 2 renames.
11. **Rollback** - point `S3_ENDPOINT` back at MinIO and restart; rebuild the web image if step 8 required one. Valid for as long as section 10 has not run.

- [ ] **Step 3: Check the runbook against its own commands**

Read it back and confirm every command is copy-pasteable: no `<placeholder>` that is not explicitly called out as an operator substitution, no step that says "verify it works" without saying what to run and what the expected output is.

- [ ] **Step 4: Commit**

```bash
git add docs/RUNBOOK-RUSTFS-CUTOVER.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: add the RustFS production cutover runbook"
```

---

### Task 2: Rename the chisel tunnel's MinIO references

**Files:**
- Modify: `chisel/docker-compose.yml:14-15` (port comments), `chisel/docker-compose.yml:22-23` (the `${MINIO_HOST}` interpolations)
- Modify: `chisel/.env.example:7`

**Interfaces:**
- Consumes: nothing.
- Produces: `RUSTFS_HOST` as the variable name operators set in `chisel/.env`. This is a breaking change for anyone with an existing `chisel/.env` - it is gitignored, so it will not update itself.

- [ ] **Step 1: Rename the variable and fix the comments**

In `chisel/docker-compose.yml`, change:

```yaml
      - "9000:9000"  # MinIO S3 API
      - "9001:9001"  # MinIO console
```

to:

```yaml
      - "9000:9000"  # RustFS S3 API
      - "9001:9001"  # RustFS console, at /rustfs/console/
```

and change both interpolations:

```yaml
      - 9000:${MINIO_HOST}:9000
      - 9001:${MINIO_HOST}:9001
```

to:

```yaml
      - 9000:${RUSTFS_HOST}:9000
      - 9001:${RUSTFS_HOST}:9001
```

In `chisel/.env.example`, change `MINIO_HOST=minio.internal` to `RUSTFS_HOST=rustfs.internal`.

- [ ] **Step 2: Confirm no stale references remain**

Run: `grep -rn "MINIO_HOST\|minio" chisel/`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add chisel/docker-compose.yml chisel/.env.example
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "chore(chisel): tunnel to RUSTFS_HOST instead of MINIO_HOST"
```

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/rustfs-prod-cutover
/opt/homebrew/bin/gh pr create --base main \
  --title "docs: add the RustFS production cutover runbook" --body "..."
```

The body opens with prose, then `## What changed`, `## Verification` (for a docs PR: that the runbook's commands were read back against the real service shapes, plus the `grep` from Step 2), and a `## Deployment` section - this one does need it: merging changes the variable name operators must set in their local `chisel/.env`, and the cutover itself is Task 3.

---

### Task 3: Execute the cutover

**Files:**
- None in this repository. This task runs on the production host, following `docs/RUNBOOK-RUSTFS-CUTOVER.md`.

**Interfaces:**
- Consumes: the merged runbook from Task 1 and the phase 1 image pin.
- Produces: production serving card images from RustFS, with MinIO stopped but intact.

- [ ] **Step 1: Record the decision from "Decide before starting" in the runbook's opening paragraph.** If the answer was SeaweedFS rather than RustFS, stop and revise Task 1's document before going further - executing a runbook that names the wrong server is how the wrong container ends up in production.

- [ ] **Step 2: Work through the runbook sections 3 to 7.** Do not proceed past section 7 unless all three verification checks pass.

- [ ] **Step 3: Cut over (section 8) during a quiet window.** Confirm in a browser that a card detail page renders its image, and that the set grid renders thumbnails - those are the two surfaces that read `NEXT_PUBLIC_IMAGE_BASE_URL`.

- [ ] **Step 4: Start the soak (section 9).** Set a reminder for the decommission; do not remove MinIO in the same session.

- [ ] **Step 5: After the soak, decommission (section 10)** and confirm the freed disk.

---

### Task 4: Close the loop

**Files:**
- Modify: `docs/RUNBOOK-RUSTFS-CUTOVER.md` (add the outcome)

**Interfaces:**
- Consumes: the result of Task 3.
- Produces: a runbook that records what actually happened, so the next reader knows it was executed rather than merely planned.

- [ ] **Step 1: Append an outcome section**

Record the date of the cutover, the image tag actually deployed, the object count after the re-ingest, whether a web rebuild was needed, and anything that diverged from the plan.

- [ ] **Step 2: Commit**

```bash
git checkout -b docs/rustfs-cutover-outcome
git add docs/RUNBOOK-RUSTFS-CUTOVER.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: record the RustFS cutover outcome"
```

- [ ] **Step 3: Note the deferred follow-up**

The scoped-credential split (ingest keeps bucket admin, web gets object write on `images/*` only, mirroring the scoped `MEILI_WRITE_KEY`) is deliberately not part of this migration. Now that the production credential has been recreated once, open an issue for it rather than letting it be forgotten - right now a leaked web key can rewrite the bucket policy.

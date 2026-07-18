# GHCR Image Publish Pipeline — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorming)
**Scope:** Build the two deployable Docker images (`web`, `ingest`) in GitHub Actions and publish them to GitHub Container Registry (GHCR) as **private** packages. This is a **build-and-publish** pipeline only — it does not deploy or run the images anywhere.

## Goal

Produce two immutable, CI-gated Docker images on every merge to `main` (and on demand), so the hosting provider can pull and run the *exact* artifact CI tested:

- `ghcr.io/p4per/revelio-web` — the Next.js production app (`@revelio/web`).
- `ghcr.io/p4per/revelio-ingest` — the one-shot ingest/migration job (`@revelio/ingest`).

The images are **private** GHCR packages. Deployment (choosing a host, wiring runtime env, shipping the dataset to prod) is explicitly out of scope and handled separately.

## Deployment model (decided)

**Model 1 — build in GitHub → push to GHCR → host pulls the prebuilt image.**
Chosen over "host builds the Dockerfile from the repo" because:

- The deployed image is the exact artifact CI built and gated — what was tested is what runs.
- Rollback is repointing the host to a previous `sha-<short>` tag; no rebuild.
- The **ingest** job especially wants to be an immutable, versioned artifact run deterministically against production data.

Cost accepted: the host needs a read-only GHCR pull credential, and `NEXT_PUBLIC_*` values are baked at CI build time (see Web image).

## Prerequisite — Node 20 → Node 22 (step 0)

Bump the toolchain to Node 22 (current LTS) before adding the pipeline, so CI, Dockerfiles, and engines agree. Contained change; the only first-party references to `20` are:

- `.github/workflows/ci.yml` — 3× `node-version: 20` → `22`.
- `app/package.json` — `engines.node: ">=20"` → `">=22"`.
- `app/web/package.json` — `@types/node: "^20"` → `"^22"` (dev types).
- `app/ingest/Dockerfile` — `FROM node:20-alpine` → `node:22-alpine`.
- New Dockerfiles use `node:22-alpine`.

(The many `>=20` hits in `package-lock.json` are transitive dependency `engines` fields, satisfied by Node 22 — not edited.)

Verification for this step: `npm ci && npm run typecheck && npm test` locally / in CI on Node 22.

## Images

### 1. Web image — `app/web/Dockerfile` (new)

Next.js **standalone** production image.

- Enable `output: 'standalone'` in `app/web/next.config.ts` (bundles only the server + traced deps; required for a lean image).
- Multi-stage on `node:22-alpine`:
  1. **deps** — copy workspace manifests + `package-lock.json`, `npm ci` at the `app/` workspace root.
  2. **build** — copy source, `next build`. `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_IMAGE_BASE_URL` arrive as `ARG`s and are **baked** into the client bundle.
  3. **runtime** — copy `.next/standalone`, `.next/static`, and `public`; run as a non-root user; `EXPOSE 3000`; `CMD ["node", "server.js"]`.
- **Baked at build time (from GitHub secrets):** `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_IMAGE_BASE_URL`.
- **Supplied at runtime by the host (never baked):** `DATABASE_URL`, `MEILI_HOST`, `MEILI_SEARCH_KEY`, `MEILI_WRITE_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `S3_*`, `ADMIN_EMAILS`, etc.
- `sharp` is bundled for Next's image optimizer. If the alpine/musl `sharp` build misbehaves, switch the runtime stage to `node:22-slim` (documented fallback, not the default).

### 2. Ingest image — `app/ingest/Dockerfile` (reworked)

**Code-only** one-shot job image. The current Dockerfile is dev-shaped (`npm install`, ships everything); harden it:

- Multi-stage on `node:22-alpine`, `npm ci` (reproducible), ship only the workspace code + runtime deps + `tsx`.
- Keep the `tsx` runtime (packages ship raw TS) and the default `CMD` running `ingest/src/main.ts` (which runs migrations → seeds Postgres → indexes Meilisearch → uploads assets to S3).
- **Data is provided at runtime by mount** — `DATA_DIR` (`dist`), `I18N_DIR`, `ASSETS_DIR` (`assets`). It is *not* baked: `dist`/`assets` are gitignored (not in CI) and `assets` is ~424 MB. Running in prod = pull image + mount the dataset + set DB/Meili/S3 env. Producing and shipping that dataset to the host is out of scope (a deploy concern).
- The compose `migrate` service continues to reuse this image with an overridden command.

### Build context & `.dockerignore`

- Both build contexts are `app/` (the npm workspaces root, where `package-lock.json` lives). Web Dockerfile at `app/web/Dockerfile`, ingest at `app/ingest/Dockerfile`.
- Add `app/.dockerignore` excluding `**/node_modules`, `**/.next`, `**/test-results`, `**/*.tsbuildinfo`, `.git`, etc., to keep the build context small and builds fast.

## The pipeline — `publish` job in `.github/workflows/ci.yml`

Added as a fourth job to the existing workflow.

- **Gating:** `needs: [check, test, build]` — images publish only when CI is green.
- **Trigger:** runs only on `push` to `main`, or `workflow_dispatch`. Never on pull requests (`if:` guard on event/ref).
- **Permissions:** `contents: read`, `packages: write`. Auth via the auto-provided `GITHUB_TOKEN`.
- **Steps:**
  - `actions/checkout`.
  - `docker/login-action` → `ghcr.io` with `GITHUB_TOKEN`.
  - `docker/setup-buildx-action`.
  - `docker/metadata-action` to compute tags.
  - Two `docker/build-push-action` steps (web, ingest), each with `cache-from`/`cache-to: type=gha` for fast incremental builds. The web step passes the `NEXT_PUBLIC_*` build args from secrets.
- **Tags per image:**
  - `latest` (rolling — the current `main` build).
  - `sha-<short-commit>` (immutable pin / rollback target).
- **Platform:** `linux/amd64` (single platform; revisit if the host is arm64).

## GitHub configuration (one-time, manual)

- **Repository secrets:** `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_IMAGE_BASE_URL`.
- **Package visibility:** private — automatic if the repo is private; otherwise set each package to private once in its GHCR settings.
- No other secrets: `GITHUB_TOKEN` authorizes the push.

## Out of scope

- Deploying / running the images on any host.
- Provisioning runtime environment variables and secrets on the host.
- Producing the card dataset (`dist`/`assets`) and shipping it to production for the ingest job.
- Multi-arch images, image signing/attestation, vulnerability scanning (can be added later).

## Verification

- **Node 22 step:** `npm ci && npm run typecheck && npm test` pass on Node 22 (CI + local).
- **Web image:** `docker build` from `app/` using `web/Dockerfile` succeeds; `docker run` serves the app on `:3000` with runtime env supplied; baked `NEXT_PUBLIC_*` reflect the build args.
- **Ingest image:** `docker build` succeeds; `docker run` with the dataset mounted + DB/Meili/S3 env reproduces a successful ingest (mirrors the current compose `ingest` flow).
- **Pipeline:** a `workflow_dispatch` run (and a merge to `main`) publishes both images to GHCR with `latest` + `sha-<short>` tags, gated behind green check/test/build, and the packages are private.

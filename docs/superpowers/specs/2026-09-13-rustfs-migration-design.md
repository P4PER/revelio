# RustFS migration design

**Date:** 2026-09-13
**Status:** approved (brainstormed in session, bounded change)

## Why

MinIO's community edition is archived. The GitHub API reports `minio/minio`
with `archived: true` and a last push of 2026-04-24; the Docker Hub namespace
was withdrawn on or around 2026-09-13, which is how this surfaced (CI run
34776929607 failed on `Start MinIO` with `pull access denied`). PR #110 moved
the pull to `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`, which restores
the build but pins a frozen artifact of a dead project: no further security
fixes, and Quay can drop the namespace exactly as Docker Hub did.

Revelio is coupled to the S3 API, not to MinIO. The whole surface is eight
calls - `HeadBucket`, `CreateBucket`, `PutBucketPolicy`, `PutObject`,
`HeadObject`, `DeleteObject` from the app, plus `ListObjectsV2` and
`DeleteBucket` in test teardown - and anonymous public `GET` from the browser.
That makes the server a swappable dependency.

## Decision

Replace MinIO with **RustFS** (`rustfs/rustfs`, Apache-2.0, actively
developed) in the local dev stack and in CI. Production follows as a separate
phase: stand RustFS up, re-run ingest to repopulate, cut over, decommission
MinIO. No object copy - the dataset is reproducible from `card-data`.

### Why RustFS over the alternatives

Measured, not assumed. Both candidates were run locally and put through the
repository's own `ingest/test/upload-images.test.ts` plus a raw
`curl --aws-sigv4` probe of the full path:

| | createBucket | putPolicy | putObject | anon GET | ingest tests |
|---|---|---|---|---|---|
| MinIO (incumbent) | 200 | 204 | 200 | 200 | 3 passed |
| RustFS 1.0.0-rc.6 | 200 | 204 | 200 | 200 | 3 passed |
| SeaweedFS | 200 | 204 | 200 | 200 | 3 passed |

RustFS wins on being the deliberate MinIO-API drop-in: same `:9000` S3 port,
same `:9001` console port, and it even answers `/minio/health/live`. SeaweedFS
is the more conservative engineering choice (Apache-2.0, eleven years old) but
is a distributed filesystem with an S3 gateway bolted on - a heavier thing to
carry as a dev dependency.

**Known risk:** RustFS is at `1.0.0-rc.6`, pre-1.0. For dev and CI the blast
radius is a throwaway bucket. For production this is a real trade - an
archived-but-battle-tested server for a release candidate - and it is called
out again in the phase 2 plan rather than buried here.

## Design

### Dev stack (`app/docker-compose.yml`)

Service `minio` becomes `rustfs`, pinned to `rustfs/rustfs:1.0.0-rc.6`, with a
new named volume. RustFS cannot read MinIO's on-disk format, so the local
bucket is repopulated by re-running ingest - the same move production makes.

Three decisions worth recording:

- **Credentials stay `minioadmin`/`minioadmin`.** They are the hardcoded
  fallback in `ingest/test/s3-helpers.ts` and the committed value in both
  `.env.example` files and the CI env block. Renaming them touches six files
  and buys nothing in a stack that binds to loopback with dev credentials.
- **The service is renamed to `rustfs`**, so the compose `ingest` service
  reaches it at `http://rustfs:9000`. Leaving a service named `minio` running
  a different server is the kind of lie that costs someone an hour later.
- **The healthcheck changes.** RustFS answers both `/minio/health/live` and
  `/health` with 200 *while still reporting* `Service not ready: waiting for
  storage_quorum` on `/`, so neither is a readiness gate. A ready S3 handler
  answers an unsigned `GET /` with an `AccessDenied` XML body; that is the
  probe. Verified: the image ships busybox `curl`, so the check runs in-container.

The console survives at `http://localhost:9001/rustfs/console/` and is enabled
by default (verified with no `RUSTFS_CONSOLE_ENABLE` set). Bare `/` on 9001
answers S3 `AccessDenied`, so the port comment must name the path or the next
reader concludes the console is gone.

### CI (`.github/workflows/ci.yml`)

The `Start MinIO` step becomes `Start RustFS` with the same pinned image and
`RUSTFS_*` credentials. The readiness loop switches to the same AccessDenied
probe. The `TEST_S3_*` env block is unchanged.

### Existing coverage is sufficient

No new test is needed. `ingest/test/upload-images.test.ts` already asserts the
three behaviours that could differ between S3 implementations: versioned keys
land via a signed client, an **unsigned** `fetch` of a card image returns 200
with the right body (the browser's path, and the only proof the public-read
bucket policy took effect), and a second run skips what already exists. Its
`afterAll` exercises `ListObjectsV2`/`DeleteObject`/`DeleteBucket`. All three
tests pass against RustFS 1.0.0-rc.6.

### Credentials, and what does not change

There is no read/write key split on S3 and this migration does not introduce
one. A single `S3_ACCESS_KEY`/`S3_SECRET_KEY` pair serves both ingest (write +
bucket admin) and web (editor object writes); browser reads carry no key at
all. Splitting them - ingest keeps bucket admin, web gets object write on
`images/*` only, mirroring the scoped `MEILI_WRITE_KEY` - is a genuine
improvement and explicitly **out of scope**: it is a production credential
change, not a container swap, and it wants its own verification.

Production IAM state does not migrate. Whatever user or service account backs
the production `S3_ACCESS_KEY` must be recreated in RustFS through its console
or admin API. Note for whoever does it: RustFS serves its admin API under
`/rustfs/admin/v3/`, not MinIO's `/minio/admin/v3/`, so `mc admin ...` fails
against it. Object commands (`mc cp`, `mc ls`, `mc mirror`) work, being plain
S3. The repository uses `mc` nowhere, so this only affects manual ops.

## Phases

1. **Dev and CI swap** - `docs/superpowers/plans/2026-09-13-rustfs-dev-ci.md`
2. **Production cutover** - `docs/superpowers/plans/2026-09-13-rustfs-prod-cutover.md`

Phase 1 ships on its own and leaves production untouched and working.

## Out of scope

- Copying objects from MinIO to RustFS. Ingest regenerates them.
- Splitting the S3 credential into scoped ingest and web keys.
- `chisel/` port comments and `MINIO_HOST` - they describe production, so they
  move with phase 2.
- Choosing production's long-term object store. Phase 2's runbook works for
  RustFS or SeaweedFS; the decision is recorded there, not here.

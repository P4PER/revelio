# Ingest self-provisioning: design

Date: 2026-11-04. Status: draft, awaiting approval.

## Intent and why

`@revelio/ingest` is a one-shot job that reads three directories (`/data`, `/i18n`,
`/assets`), seeds Postgres, indexes Meilisearch and uploads card images to S3. All three
are produced on a developer machine by the Python scripts in `card-data/`
(`build_dataset.py`, `accio_images.py`) and are git-ignored, so they exist nowhere a
deployed container can reach.

On Coolify the ingest container's filesystem can only be reached while the service is
running, but ingest exits (exit 1) the moment it finds the directories empty. There is no
window in which files could be put there. Today ingest cannot be run on Coolify at all.

The fix is to let ingest produce its own inputs: when a directory is empty it runs the
same Python scripts, writing into the mounted volume. The volume then acts as a cache, so
only the first run pays for the roughly 471 MB image download.

## Goals

- `docker run revelio-ingest` on a host with empty volumes at `/data` and `/assets`
  completes a full ingest with no manual file upload.
- Later runs reuse what is on the volumes and only fetch what is missing (the image
  script already skips existing files).
- One image, one job. Ingest stays the single entry point on Coolify.
- Local dev, CI and the existing tests behave exactly as before: populated mounts win,
  and nothing is regenerated.
- A failed provisioning step stops the job with the script's own output. Ingest never
  proceeds on partial data.

## Non-goals

- No hosting or manifest of pre-built files, no archives, no download-from-URL mode.
- No change to what the scripts produce, to the dataset schema, or to image formats.
- No new orchestration (no separate "prepare" service or init container).
- No scheduling or automatic refresh. Re-provisioning is an explicit switch.

## Anti-goals (would make this a failure even if it technically works)

- Ingest silently continuing with a half-built `dist/` or half-filled `assets/`.
- Changing default behaviour of the Python scripts for local use.
- Baking `dist/` or `assets/` into the image (bloat, and leaks card art via the registry).

## Behaviour

Provisioning runs at the start of `runIngest`, before `loadDist`. Per directory:

| Directory | Considered present when | Provisioned by |
|---|---|---|
| `DATA_DIR` | `cards.json` and `sets.json` exist | `python3 build_dataset.py` (clones hpjson, builds, removes the clone) |
| `ASSETS_DIR` | has at least one file under `cards/` and `symbols/` | `python3 accio_images.py --download` (needs `DATA_DIR` built first, since it reads `cards.json`/`sets.json` and rewrites image URLs in them) |
| `I18N_DIR` | n/a | checked-in source, copied into the image, not generated (see open point below) |

- Order is always data first, then assets.
- `accio_images.py` is re-runnable and skips existing files, so a half-filled `/assets`
  (an interrupted first run) is simply completed. "Present" for assets therefore means
  "the script has nothing left to do", which is cheap to ask of the script itself; the
  builder may choose to always invoke it when `PROVISION_ASSETS` is on rather than
  guess from the directory.
- `FORCE_PROVISION=true` re-runs both scripts regardless of what exists (use after
  changing translations or `card_overrides.json`).
- `PROVISION=false` disables the step entirely, for local compose with bind mounts.
- Script stdout/stderr is streamed to the job log. A non-zero exit throws, and `main.ts`
  already turns that into `seed failed` + exit 1.
- Provisioning is skipped when the directory is populated, with one log line saying so.

## Changes by area

**`card-data/` scripts.** `DIST`, `ASSETS` (and the i18n path if it is read at all) become
overridable via `DIST_DIR`, `ASSETS_DIR`, defaulting to today's paths next to the script.
No other behaviour change.

**`app/ingest`.** New `provision.ts` that decides what is missing and spawns the scripts
(`child_process`, inherited stdio, explicit env). Called from `runIngest`. It must have no
top-level side effect (bundle rule in CLAUDE.md). The spawn function is injectable so
tests do not need Python.

**Image.** Runtime stage adds `python3`, Pillow with WebP support, `git` and `ca-certificates`,
and copies the script sources, translations and overrides from `card-data/` (not `dist/`,
`assets/`, `__pycache__`, `hpjson/`). Expect the image to grow from about 165 MB to
about 300 MB. The existing build-stage smoke test (bundle reaches its env guard) stays.

**Build context.** `card-data/` lives outside `app/`, which is the current Docker context
(`context: .` in `app/docker-compose.yml`, `context: app` in `publish.yml`). The context
must become the repository root, with the Dockerfile path and its `COPY` paths adjusted.
`publish.yml`'s path filter for ingest must also watch `card-data/**` (scripts and
translations), otherwise a script change would not rebuild the image. The Coolify
application's build settings need the same context change (a deployment note, not code).

**Compose.** The local `ingest` service currently mounts `../card-data/dist:/data:ro`.
That keeps working (populated, so no provisioning). Documentation notes `PROVISION=false`
as the explicit local choice.

**Docs.** `app/ingest/.env.example`, `card-data/README.md` and the CLAUDE.md ingest
paragraph describe the new variables and the volume-as-cache model.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `PROVISION` | `true` | Run the scripts for missing inputs. `false` restores today's behaviour (fail on missing). |
| `FORCE_PROVISION` | `false` | Run the scripts even when inputs exist. |

Existing `DATA_DIR`, `I18N_DIR`, `ASSETS_DIR` keep their meaning and defaults.

## Constraints and risks

- **Network at runtime.** First run needs GitHub (hpjson clone) and accio.cards. If either
  is down, ingest fails with the script's error; rerun later.
- **Volume permissions.** The scripts run as the container user and must be able to write
  to `/data` and `/assets`. The compose `:ro` mount is incompatible with provisioning
  by design.
- **Time and disk.** First run downloads and converts about 1,100 cards plus thumbnails
  (about 471 MB). Coolify volumes must have the space; the job may run for many minutes.
- **Legal.** Same fan-project position as `IMAGES-SOURCING.md`: this changes where the
  scripts run, not what they fetch.
- **hpjson clone is shallow and unpinned** (existing behaviour). A deployed run therefore
  builds from the head of the fork. Pinning is out of scope but worth knowing.

## Testing

- Unit: `provision.ts` with an injected spawn, covering: populated dirs spawn nothing;
  empty data spawns `build_dataset.py` before `accio_images.py`; `FORCE_PROVISION`;
  `PROVISION=false` fails with the old clear message; non-zero exit rejects.
- The existing ingest suite (Testcontainers Postgres, Meili, S3) is unchanged and must
  still pass with mounts populated.
- Manual: build the image from the new context, run it against empty temp volumes with
  the compose Postgres/Meili/RustFS and confirm `seed complete`, then run again and
  confirm no script is spawned.
- Note for CI: no job should run the real scripts (network and 471 MB).

## Left to the builder

- Exact "present" heuristics (see assets note above), provided the rules above hold.
- Whether the Python scripts are invoked as subprocesses (expected) or via a small
  wrapper script in `card-data/`.
- Image base and package choice (Alpine `py3-pillow` versus a pip wheel), provided WebP
  works; the build stage should prove it, in the spirit of the existing smoke tests.

## Open points for the owner

1. `I18N_DIR`: `runIngest` accepts `i18nDir`, and `load-labels.ts` defines `loadLabels`, but
   nothing calls it (grep over `app/ingest/src`, `app/ingest/test` and `app/db/src`). This spec treats the directory as vestigial and only
   copies `card-data/i18n` into the image. Say if it should be wired up or removed
   instead.
2. Deployment: the Coolify build context change (repo root) and volumes at `/data` and
   `/assets` are needed on the Coolify side.

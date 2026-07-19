# Runbook: image-versioning rollout

After deploying the timestamped-image-names change, existing MinIO objects are
unversioned (`cards/{id}.webp`, `symbols/{code}.webp`) and will 404 — the app now
requests versioned keys (`cards/{id}.{v}.webp`). Re-run ingest to repopulate
versioned objects + DB version columns + the search index, then purge the old
objects.

## 1. Apply the migration

Runs automatically at ingest start (`runMigrations`), or via the compose tools
profile:

    docker compose run --rm migrate

Migration `0011_*` drops `card_localizations.image_file`,
`card_localizations.image_url`, and `sets.symbol`, and adds
`card_localizations.image_version`, `cards.art_crop_version`, and
`sets.symbol_version`.

## 2. Re-run ingest (writes versioned objects, versions, reindex)

From the deployed ingest job / container, with `DATABASE_URL`, `ASSETS_DIR`,
`MEILI_HOST`, `MEILI_MASTER_KEY`, and the `S3_*` vars set:

    node dist/main.js   # or the container's normal entrypoint

Ingest uploads `cards/{id}.{mtime}.webp` (+ thumb/art-crop) and
`symbols/{code}.{mtime}.webp` with `Cache-Control: public, max-age=31536000,
immutable`, and writes `image_version` / `art_crop_version` / `symbol_version`
from the same file mtimes. `objectExists` diffing means a second run is a no-op.

## 3. Purge the old unversioned objects (optional cleanup)

Using the MinIO client (`mc`), remove the legacy flat objects whose stem has no
numeric version segment. **Dry-run first.** Versioned objects end in
`.<digits>.webp`; the legacy ones do not.

    # DANGER: inspect output before deleting.
    mc find myminio/images --regex 'cards/[^/]+\.webp$' --exec 'echo would-remove {}'
    mc find myminio/images --regex 'symbols/[^/]+\.webp$' --exec 'echo would-remove {}'
    # Tighten the regex to exclude versioned names, then re-run replacing
    # `echo would-remove` with `mc rm`.

When in doubt, leave the orphans — they are harmless (nothing references them).

## 4. Verify

- Open a card detail page; confirm the image loads from a `.<digits>.webp` URL.
- The image response carries `Cache-Control: public, max-age=31536000, immutable`.
- Re-upload a card image in the editor; confirm the URL's version segment
  changes and the new image shows immediately (no hard refresh).
- Re-upload a set symbol in admin; confirm the same version-bump behaviour.

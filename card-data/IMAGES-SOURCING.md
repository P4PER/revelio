# revelio.cards – Card Images & Set Symbols

## Source: accio.cards (self-hosted)

Our `localizations.en.image.file` IS the accio filename (both come from hpjson), so the
image URL is just a base + that filename — no Drive, no name matching. accio also
covers **every** set (incl. Chamber of Secrets).

- Card image base: `https://accio.cards/cardimages/<file>` — accio splits art across
  **three** folders, so on 404 the loader falls back to `cardimages2/` then
  `cardimages3/`.
- A few source filenames have typos/mismatches → `image_overrides.json` maps the
  card `id` to the correct accio filename (e.g. `Leakey`→`Leaky`, `&`→`And`).
- Set symbols: from the Revival site (`https://harrypottertcg.com/images/...`), all
  **PNG** (incl. HAH and QWF). Saved as `assets/symbols/<code>.png`.

## Download (run locally)

```bash
python3 -m pip install pillow        # optional, only for thumbnails
python3 build_dataset.py hpjson              # build dist/
python3 accio_images.py --download   # cards + set symbols -> assets/, rewrite dist URLs
```

`accio_images.py`:
- `--link` (no download): sets `image.url` to the remote accio URL (hotlink, instant).
- `--download`: saves each card as `assets/cards/<id>.png` (+ `thumb/<id>.jpg` if Pillow),
  downloads set symbols to `assets/symbols/<code>.png`, and rewrites `image.url` /
  `sets.symbol` to local paths. Re-runnable (skips existing); reports
  `downloaded / skipped / failed`.

File name is always the card **id** (e.g. `assets/cards/bs-8-harry-potter.png`).

## Storage

Keep images as files (DB stores only the path/URL). Local `assets/` for dev; for
production sync `assets/` to object storage + CDN and point the base URL there.
`assets/` is git-ignored.

## Legal

Card art and set symbols are © Warner Bros. (accio states this too). We operate as an
**unofficial fan project**: clear disclaimer, non-commercial, takedown readiness.
Self-hosting copies carries the same fan-project risk as accio; it is not "licensed".

## Other languages

`--download` fetches the English art (accio). Non-English scans, when sourced, go to
`assets/cards/<lang>/<id>.png` and set `localizations.<lang>.image.url`; until then the
UI falls back to the English image.

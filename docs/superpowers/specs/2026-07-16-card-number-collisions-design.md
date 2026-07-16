# Fix duplicate `(setCode, number)` collisions

**Date:** 2026-07-16
**Status:** Design — approved decisions, pending spec review
**Depends on:** the `finishes[]` model change (`feat/card-finishes-array`, PR #19) — same pipeline files; this branches off it.
**Relates to:** the "known follow-up" section of `2026-07-16-card-finishes-array-design.md`.

## Context & problem

After the finishes work, **10** `(setCode, number)` pairs still hold two card rows.
They are two different problems that need **opposite** fixes:

- **8 typo-twins** — one real card entered twice with a spelling typo. Fix = **merge**
  (drop the misspelled duplicate, keep the correct one). Renumbering one instead would
  invent a card that doesn't exist.
- **2 genuine collisions** — two *different* cards sharing a number because one has the
  **wrong number**. Fix = **renumber** the mis-numbered card (target verified free).
  Merging would destroy a real card.

Fixes must live in a curated override file, because `hpjson` (the English source) is
re-cloned on every build and can't be hand-edited persistently — the same reason
`image_overrides.json` exists.

## Goal

Every `(setCode, number)` maps to exactly one card. Dataset **1,031 → 1,023** cards.

## Resolution data

### 2 renumbers (targets confirmed free)

| card (current id) | change |
|---|---|
| `eotp-84-wizard-s-desk` (Wizard's Desk) | number → **85** (Sirius's Letter keeps #84) |
| `gof-56-skeeter-s-scoop` (Skeeter's Scoop) | number → **57** (Ron's Jealousy keeps #56) |

### 8 merges (keep canonical spelling, drop typo)

| # | keep id | drop id |
|---|---|---|
| AAH #59 | `aah-59-every-flavour-beans` (Every-Flavour Beans) | `aah-59-every-flavor-beans` |
| AAH #65 | `aah-65-manegro-potion` (Manegro Potion) | `aah-65-manegrow-potion` |
| GOF #19 | `gof-19-perfurmed-fire` (Perfurmed Fire) | `gof-19-perfumed-fire` |
| GOF #37 | `gof-37-fertiliser-from-norway` (Fertiliser from Norway) | `gof-37-fertilizer-from-norway` |
| GOF #99 | `gof-99-report-on-cauldron-thickness` (Report on Cauldron Thickness) | `gof-99-report-of-cauldron-thickness` |
| GOF #119 | `gof-119-divination-third-year` (Divination, Third Year) | `gof-119-divinatino-third-year` |
| POA #71 | `poa-71-lumos` (Lumos!) | `poa-71-lumos-2` |
| POA #72 | `poa-72-malicious-substitute` (Malicious Substitute) | `poa-72-malicious-subsitute` |

Canonical spellings follow the curated image filenames in `image_overrides.json`
(`EveryFlavourBeans.png`, `FertiliserFromNorway.png`, `ReportOnCauldronThickness.png`,
`DivinationThirdYear.png`, …); "Perfurmed Fire" and "Lumos!" per owner. Note several
image overrides currently sit on the **drop** id (e.g. `gof-19-perfumed-fire →
PerfumedSmoke.png`, `aah-65-manegrow-potion → ManegroPotion.png`), which the on-drop
image transfer (below) moves to the survivor.

## Approach — a `card_overrides.json`, applied in the pipeline

### 1. `card-data/card_overrides.json` (new curated source)

Keyed by the card's **current** id (the id as built from the source before any override),
mirroring `image_overrides.json`:

```json
{
  "eotp-84-wizard-s-desk":   { "number": "85" },
  "gof-56-skeeter-s-scoop":  { "number": "57" },
  "aah-59-every-flavor-beans":            { "drop": true },
  "aah-65-manegrow-potion":               { "drop": true },
  "gof-19-perfumed-fire":                 { "drop": true },
  "gof-37-fertilizer-from-norway":        { "drop": true },
  "gof-99-report-of-cauldron-thickness":  { "drop": true },
  "gof-119-divinatino-third-year":        { "drop": true },
  "poa-71-lumos-2":                       { "drop": true },
  "poa-72-malicious-subsitute":           { "drop": true }
}
```

Supported fields: `"drop": true` (remove the row) and `"number": "<str>"` (override the
collector number). `"name"` is intentionally **not** supported yet (YAGNI — every merge
keeps an already-correctly-spelled row, so no rename is needed).

### 2. Build application (`card-data/`)

- **`transform_hpjson.py`**: load `card_overrides.json` once. In `transform`, after
  computing the source id, look up the override; if `number` is set, replace `number`
  **before** the id is built (so the id re-derives to the new number, e.g.
  `eotp-85-wizard-s-desk`); carry a transient `_drop` flag when `drop` is true.
- **`build_dataset.py`**: extend the existing `drop_premium_duplicates` step (or add a
  sibling `apply_card_overrides`) to filter out `_drop` rows, then strip the transient
  flag. Then **validate**: assert every `(setCode, number)` is unique; fail the build
  otherwise (catches a renumber that lands on an occupied slot, or a missed duplicate).

### 3. Curated-file consistency (one-time hand edits, committed)

- **`translations/de.json`**: remove the 8 dropped ids' entries (they orphan, exactly like
  the premium-merge cleanup); rename the 2 renumbered keys to their new ids
  (`eotp-84-wizard-s-desk` → `eotp-85-wizard-s-desk`, `gof-56-skeeter-s-scoop` →
  `gof-57-skeeter-s-scoop`). Both renumbered ids are present in `de.json` today.
- **`image_overrides.json`** (consumed by `accio_images.py`, not the build): move each
  dropped id's override to the surviving sibling id, and rename the 2 renumbered keys to
  their new ids, so downloaded art attaches to the final id. (Wizard's Desk and Skeeter's
  Scoop have no image override today; the survivors that need a moved override are the 7
  merges whose override sits on the drop id — all except POA #71, which has none on either
  side.)

The build itself does not read `image_overrides.json`; keeping it correct matters only for
the image-download pipeline. `de.json` **is** read by the build, so its keys must be clean
(no orphan warnings).

## Downstream

Card data is reseeded by ingest from the clean `dist/`, so no DB migration is needed. The
`decks`/`deckCards` FK caveat from the finishes spec applies again: if a deployed deck
references one of the 8 dropped ids or a renumbered old id, ingest should remap it to the
survivor / new id (same setCode; number known). In practice these are obscure spell/item
commons; verify during ingest, don't over-engineer.

## Out of scope

- The `finishes[]` model (separate, merged/inflight spec).
- A `name` override field (add only when a merge needs a rename that a kept row can't
  already provide).

## Testing

- **Build**: `python3 build_dataset.py` → `cards: 1023`, `card errors=0`, **no
  `unknown id in de.json`** warnings.
- **Uniqueness assertion** (in the build): every `(setCode, number)` maps to exactly one
  row — 0 collisions.
- **Spot checks** (post-build dataset assertion):
  - `eotp-85-wizard-s-desk` exists, `eotp-84` has only Sirius's Letter.
  - `gof-57-skeeter-s-scoop` exists, `gof-56` has only Ron's Jealousy.
  - none of the 8 dropped ids exist; each survivor id exists.
- **Ingest** unchanged; existing ingest tests still pass.

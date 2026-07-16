# Fix duplicate `(setCode, number)` collisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `(setCode, number)` map to exactly one card by merging 8 typo-twin duplicates and renumbering 2 genuinely-different colliding cards, via a curated override applied in the build.

**Architecture:** A new `card-data/card_overrides.json` (keyed by card id, like `image_overrides.json`) with `drop`/`number` fields. `build_dataset.py` applies it after id-suffixing (drop rows; renumber + re-derive id) and asserts `(setCode, number)` uniqueness. Curated `translations/de.json` and `image_overrides.json` are updated to the surviving/renumbered ids. Card data is reseeded by ingest, so no DB migration.

**Tech Stack:** Python 3 (card-data build pipeline); TypeScript ingest (unchanged); Postgres/Meili for verification.

## Global Constraints

- **Fixes live in `card_overrides.json`, not the source** — `hpjson` is re-cloned each build.
- **Dataset outcome:** `dist/cards.json` **1,031 → 1,023** cards; every `(setCode, number)` unique; build reports `card errors=0` and **no `unknown id in de.json`** warnings.
- **Renumbers (targets confirmed free):** `eotp-84-wizard-s-desk` → number `85`; `gof-56-skeeter-s-scoop` → number `57`.
- **8 merges — keep id / drop id:**
  - AAH #59: keep `aah-59-every-flavour-beans`, drop `aah-59-every-flavor-beans`
  - AAH #65: keep `aah-65-manegro-potion`, drop `aah-65-manegrow-potion`
  - GOF #19: keep `gof-19-perfurmed-fire`, drop `gof-19-perfumed-fire`
  - GOF #37: keep `gof-37-fertiliser-from-norway`, drop `gof-37-fertilizer-from-norway`
  - GOF #99: keep `gof-99-report-on-cauldron-thickness`, drop `gof-99-report-of-cauldron-thickness`
  - GOF #119: keep `gof-119-divination-third-year`, drop `gof-119-divinatino-third-year`
  - POA #71: keep `poa-71-lumos`, drop `poa-71-lumos-2`
  - POA #72: keep `poa-72-malicious-substitute`, drop `poa-72-malicious-subsitute`
- **Conventional Commits.** Python commands run from `card-data/`; app commands from `app/`.

---

## File Structure

- `card-data/card_overrides.json` — **new** curated override (drop/number), keyed by current id.
- `card-data/build_dataset.py` — load overrides; `apply_card_overrides()` after suffixing; `assert_unique_numbers()` in `main`.
- `card-data/translations/de.json` — prune 8 dropped ids; rename 2 renumbered keys.
- `card-data/image_overrides.json` — move the 7 drop-id overrides to their survivor ids (consumed by `accio_images.py`, not the build).

---

## Task 1: Override mechanism + data + de.json cleanup → clean rebuild

**Files:**
- Create: `card-data/card_overrides.json`
- Modify: `card-data/build_dataset.py` (imports line 21; `build_cards` ends line ~75; `main` line 177)
- Modify: `card-data/translations/de.json`

**Interfaces:**
- Produces: `apply_card_overrides(cards: list[dict]) -> list[dict]` and `assert_unique_numbers(cards: list[dict]) -> None`; `dist/cards.json` with 1,023 unique-numbered cards.

- [ ] **Step 1: Create `card-data/card_overrides.json`**

```json
{
  "eotp-84-wizard-s-desk":  { "number": "85" },
  "gof-56-skeeter-s-scoop": { "number": "57" },

  "aah-59-every-flavor-beans":           { "drop": true },
  "aah-65-manegrow-potion":              { "drop": true },
  "gof-19-perfumed-fire":                { "drop": true },
  "gof-37-fertilizer-from-norway":       { "drop": true },
  "gof-99-report-of-cauldron-thickness": { "drop": true },
  "gof-119-divinatino-third-year":       { "drop": true },
  "poa-71-lumos-2":                      { "drop": true },
  "poa-72-malicious-subsitute":          { "drop": true }
}
```

- [ ] **Step 2: Import `slug` and load the overrides in `build_dataset.py`**

Change the import at line 21 from:
```python
from transform_hpjson import transform, SET_CODES, OFFICIAL
```
to:
```python
from transform_hpjson import transform, SET_CODES, OFFICIAL, slug
```

Then add, right after the `HERE = ...` line (line 23):
```python
_OV_PATH = os.path.join(HERE, "card_overrides.json")
CARD_OVERRIDES = json.load(open(_OV_PATH, encoding="utf-8")) if os.path.exists(_OV_PATH) else {}
```

- [ ] **Step 3: Add `apply_card_overrides` and call it at the end of `build_cards`**

Add this function just above `def build_cards` (line 60):
```python
def apply_card_overrides(cards):
    """Curated fixes keyed by the built card id: drop a misspelled duplicate, or
    override a wrong collector number (re-deriving the id from the new number)."""
    kept = []
    for c in cards:
        ov = CARD_OVERRIDES.get(c["id"])
        if ov:
            if ov.get("drop"):
                continue
            if "number" in ov:
                c["number"] = str(ov["number"])
                c["id"] = "-".join(filter(None, [slug(c["setCode"]), c["number"], slug(c["name"])]))
        kept.append(c)
    return kept
```

In `build_cards`, change the final `return cards` (line ~74) to:
```python
    return apply_card_overrides(cards)
```
(Overrides run **after** the duplicate-suffixing loop so the keys match the final ids — e.g. `poa-71-lumos-2`.)

- [ ] **Step 4: Add `assert_unique_numbers` and call it in `main`**

Add above `def validate` (line 147):
```python
def assert_unique_numbers(cards):
    by_key = {}
    for c in cards:
        by_key.setdefault((c["setCode"], c["number"]), []).append(c["id"])
    dups = {k: v for k, v in by_key.items() if len(v) > 1}
    if dups:
        lines = "\n".join(f"  {sc} #{n}: {ids}" for (sc, n), ids in sorted(dups.items()))
        sys.exit(f"duplicate (setCode, number) after overrides:\n{lines}")
    ids = [c["id"] for c in cards]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate card ids after overrides")
```

In `main`, immediately after line 188 (`cards = merge_overlays(build_cards(hp_cards))`), add:
```python
    assert_unique_numbers(cards)
```

- [ ] **Step 5: Update `translations/de.json` (prune 8 dropped, rename 2 renumbered)**

Run from `card-data/`:
```bash
python3 - <<'EOF'
import json
p = "translations/de.json"
raw = open(p, encoding="utf-8").read()
trailing_nl = raw.endswith("\n")
de = json.loads(raw)
drop = ["aah-59-every-flavor-beans","aah-65-manegrow-potion","gof-19-perfumed-fire",
        "gof-37-fertilizer-from-norway","gof-99-report-of-cauldron-thickness",
        "gof-119-divinatino-third-year","poa-71-lumos-2","poa-72-malicious-subsitute"]
rename = {"eotp-84-wizard-s-desk":"eotp-85-wizard-s-desk",
          "gof-56-skeeter-s-scoop":"gof-57-skeeter-s-scoop"}
for k in drop:
    de.pop(k, None)
for old, new in rename.items():
    if old in de:
        de[new] = de.pop(old)
out = json.dumps(de, indent=2, ensure_ascii=False) + ("\n" if trailing_nl else "")
open(p, "w", encoding="utf-8").write(out)
print("de.json entries now:", len(de))
EOF
```
Expected: `de.json entries now: 1023` (was 1031).

- [ ] **Step 6: Rebuild and verify the dataset**

Run: `python3 build_dataset.py`
Expected: prints `cards: 1023 | sets: 14 | ...`, `validation: card errors=0, set errors=0`, and **no `! unknown id in de.json`** lines. (If `assert_unique_numbers` fails, the build exits with the offending pairs — fix the override then rerun.)

Then assert the outcome:
```bash
python3 -c "
import json, collections
cards = json.load(open('dist/cards.json'))
assert len(cards) == 1023, len(cards)
g = collections.defaultdict(list)
for c in cards: g[(c['setCode'], c['number'])].append(c['id'])
dups = {k:v for k,v in g.items() if len(v) > 1}
assert not dups, dups
ids = {c['id'] for c in cards}
# renumbers applied
assert 'eotp-85-wizard-s-desk' in ids and 'eotp-84-wizard-s-desk' not in ids
assert 'gof-57-skeeter-s-scoop' in ids and 'gof-56-skeeter-s-scoop' not in ids
assert g[('EOTP','84')] == ['eotp-84-sirius-s-letter']
assert g[('GOF','56')] == ['gof-56-ron-s-jealousy']
# 8 typo duplicates gone; survivors present
for drop_id, keep_id in [
    ('aah-59-every-flavor-beans','aah-59-every-flavour-beans'),
    ('aah-65-manegrow-potion','aah-65-manegro-potion'),
    ('gof-19-perfumed-fire','gof-19-perfurmed-fire'),
    ('gof-37-fertilizer-from-norway','gof-37-fertiliser-from-norway'),
    ('gof-99-report-of-cauldron-thickness','gof-99-report-on-cauldron-thickness'),
    ('gof-119-divinatino-third-year','gof-119-divination-third-year'),
    ('poa-71-lumos-2','poa-71-lumos'),
    ('poa-72-malicious-subsitute','poa-72-malicious-substitute'),
]:
    assert drop_id not in ids, drop_id
    assert keep_id in ids, keep_id
print('OK 1023 cards, all (set,number) unique, renumbers + merges applied')
"
```
Expected: `OK 1023 cards, all (set,number) unique, renumbers + merges applied`.

- [ ] **Step 7: Commit**

```bash
git add card-data/card_overrides.json card-data/build_dataset.py card-data/translations/de.json
git commit -m "fix(card-data): resolve (set,number) collisions via card_overrides.json

Merge 8 typo-twin duplicates (drop the misspelled id) and renumber 2 genuinely
different cards (Wizard's Desk EOTP #84->#85, Skeeter's Scoop GOF #56->#57).
build applies card_overrides.json after id-suffixing and asserts (setCode,
number) uniqueness; de.json pruned/renamed to the final ids. 1031 -> 1023."
```

---

## Task 2: Point `image_overrides.json` at the surviving ids

7 of the 8 dropped ids currently carry the image override (the art filename is correct; the key is the typo id). Move each to its survivor so downloaded art attaches to the final id. POA #71 has no override on either side; the two renumbered cards have none either.

**Files:**
- Modify: `card-data/image_overrides.json`

- [ ] **Step 1: Move the 7 override keys to the survivor ids**

Run from `card-data/`:
```bash
python3 - <<'EOF'
import json
p = "image_overrides.json"
raw = open(p, encoding="utf-8").read()
trailing_nl = raw.endswith("\n")
ov = json.loads(raw)
moves = {
  "aah-59-every-flavor-beans":           "aah-59-every-flavour-beans",
  "aah-65-manegrow-potion":              "aah-65-manegro-potion",
  "gof-19-perfumed-fire":                "gof-19-perfurmed-fire",
  "gof-37-fertilizer-from-norway":       "gof-37-fertiliser-from-norway",
  "gof-99-report-of-cauldron-thickness": "gof-99-report-on-cauldron-thickness",
  "gof-119-divinatino-third-year":       "gof-119-divination-third-year",
  "poa-72-malicious-subsitute":          "poa-72-malicious-substitute",
}
for old, new in moves.items():
    if old in ov:
        ov[new] = ov.pop(old)
out = json.dumps(ov, indent=2, ensure_ascii=False) + ("\n" if trailing_nl else "")
open(p, "w", encoding="utf-8").write(out)
missing = [o for o in moves if o in ov]
print("moved:", len(moves), "| leftover old keys:", missing)
EOF
```
Expected: `moved: 7 | leftover old keys: []`.

- [ ] **Step 2: Sanity-check the overrides now key on ids that exist in `dist/`**

```bash
python3 -c "
import json
ov = json.load(open('image_overrides.json'))
ids = {c['id'] for c in json.load(open('dist/cards.json'))}
orphans = [k for k in ov if k not in ids]
print('override keys not in dist:', orphans)
assert not orphans, orphans
print('OK all image_overrides keys resolve to a card')
"
```
Expected: `OK all image_overrides keys resolve to a card`. (This validates the moved survivor ids exist; any pre-existing unrelated orphan would surface here — if so, it predates this change, note it and leave it.)

- [ ] **Step 3: Commit**

```bash
git add card-data/image_overrides.json
git commit -m "fix(card-data): repoint image overrides at surviving card ids after merge"
```

---

## Task 3: Live ingest verification (throwaway DB)

Mirror the finishes verification: seed a throwaway DB from the clean `dist/` and confirm the collisions are gone, without touching the real `revelio` dev DB.

**Files:** none (operational). Requires `docker compose` infra (postgres/meilisearch/minio) up.

- [ ] **Step 1: Ensure infra is up and dist is rebuilt**

```bash
cd app && docker compose up -d postgres meilisearch minio
cd ../card-data && python3 build_dataset.py 2>&1 | tail -3
```
Expected: `cards: 1023`, `card errors=0`.

- [ ] **Step 2: Seed a throwaway DB (no S3, no Meili needed)**

```bash
cd ../app
docker compose exec -T postgres psql -U revelio -d revelio -c "drop database if exists revelio_verify;"
docker compose exec -T postgres psql -U revelio -d revelio -c "create database revelio_verify;"
DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio_verify \
DATA_DIR=$(cd ../card-data/dist && pwd) \
npx tsx ingest/src/main.ts 2>&1 | tail -3
```
Expected: `seed complete: 14 sets, 1023 cards imported (additive)`.

- [ ] **Step 3: Verify uniqueness + the specific fixes in Postgres**

```bash
cd /Users/timon.wegener/Desktop/revelio.cards/app
docker compose exec -T postgres psql -U revelio -d revelio_verify -A -t -c \
  "select count(*) from cards;"
docker compose exec -T postgres psql -U revelio -d revelio_verify -A -t -c \
  "select set_code, number, count(*) from cards group by set_code, number having count(*) > 1;"
docker compose exec -T postgres psql -U revelio -d revelio_verify -A -t -c \
  "select id from cards where id in ('eotp-85-wizard-s-desk','gof-57-skeeter-s-scoop','eotp-84-wizard-s-desk','gof-56-skeeter-s-scoop') order by id;"
```
Expected: count `1023`; the duplicate query returns **no rows**; the id query returns exactly `eotp-85-wizard-s-desk` and `gof-57-skeeter-s-scoop` (the old ids absent).

- [ ] **Step 4: Clean up the throwaway DB**

```bash
docker compose exec -T postgres psql -U revelio -d revelio -c "drop database revelio_verify;"
```

---

## Self-Review

**1. Spec coverage:**
- `card_overrides.json` with drop/number → Task 1 Steps 1–3. ✔
- Build applies after suffixing + re-derives id → Task 1 Step 3. ✔
- `(setCode, number)` uniqueness assertion → Task 1 Step 4. ✔
- de.json prune 8 + rename 2 → Task 1 Step 5. ✔
- image_overrides moved to survivors → Task 2. ✔
- 8 merges + 2 renumbers, 1,031 → 1,023 → Global Constraints + Task 1 Step 6 asserts. ✔
- Downstream reseed (no migration) + throwaway-DB verification → Task 3. ✔
- Deck FK caveat: noted in spec; obscure commons, verified via the uniqueness/id checks; no code needed here. ✔

**2. Placeholder scan:** No TBD/TODO; every code and command step is concrete. The "on-drop image transfer" from the spec's prose is implemented as the Task 2 curated-file edit (the build never reads `image_overrides.json`), which achieves the same outcome — no orphaned art. ✔

**3. Type/name consistency:** `apply_card_overrides` and `assert_unique_numbers` are defined and called with matching names; `slug` is imported before use; the keep/drop/renumber ids in `card_overrides.json`, `de.json`, `image_overrides.json`, and the assertions all match the Global Constraints list. ✔

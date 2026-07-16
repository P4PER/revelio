# Card Finish Model (`finishes[]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-row scalar `cards.finish` with a derived `cards.finishes` string array, and drop the 4 duplicate premium rows the old model created — so a card's finish is an availability property, not an identity.

**Architecture:** Fix at the source: the `card-data` Python pipeline derives `finishes` from a `rarity`+`types` rule and drops premium-sourced rows that duplicate a normal row. The array is then threaded through `@revelio/core` (DTO), `@revelio/db` (schema + migration + queries), `@revelio/search` (Meilisearch document + filter), `@revelio/ingest` (loaders + document builder), and `@revelio/web` (search mapping + card-detail display). The DB column becomes `text[]`; Meilisearch treats array members as facet values so "contains" filtering works unchanged.

**Tech Stack:** Python 3 (build pipeline), TypeScript, Drizzle ORM + Postgres, Meilisearch, Next.js 16 + next-intl, Vitest.

## Global Constraints

- **The rule (authoritative, no overrides):** `Rare` + Character → `["normal","holo"]`; `Rare` + non-Character → `["normal","foil"]`; everything else → `["normal"]`. Array order: `normal` first.
- **Migrations are append-only.** Edit `app/db/src/schema.ts`, then `npm run generate` from `app/db`; never edit `drizzle/0000_*.sql` or regenerate the baseline. Commit the schema edit + generated migration together. `npm run verify -w @revelio/db` is CI-enforced.
- **All app commands run from `app/`** (npm workspaces root). Python commands run from `card-data/`.
- **Conventional Commits** for every commit.
- **URL query param stays `finish`** (public contract). Only the internal DB column, DTO, Meilisearch field, and `CardFilters` key are renamed to `finishes`.
- **Expected dataset outcome:** `dist/cards.json` goes from **1,035 → 1,031** cards; every card's `finishes` is non-empty and contains `"normal"`.

---

## File Structure

**card-data (Python, source of truth):**
- `card-data/transform_hpjson.py` — add `derive_finishes()`, emit `finishes` + transient `_premiumSource`, drop scalar `finish`.
- `card-data/build_dataset.py` — add `drop_premium_duplicates()`, strip the transient flag, update `slim()`.
- `card-data/card.schema.json` — `finish` enum → `finishes` array.
- `card-data/test_finishes.py` — **new** self-contained unit tests (no network).

**@revelio/core:** `app/core/src/domain.ts` — `CardDTO.finish` → `finishes: string[]`.

**@revelio/db:** `app/db/src/schema.ts` (column), `app/db/drizzle/NNNN_*.sql` (**generated**), `app/db/src/queries.ts` (two DTO mappers).

**@revelio/search:** `app/search/src/documents.ts`, `app/search/src/search.ts`, `app/search/src/__tests__/search.test.ts` (**new**).

**@revelio/ingest:** `app/ingest/src/types.ts`, `load-cards.ts`, `load-attributes.ts`, `build-documents.ts`.

**@revelio/web:** `app/web/src/lib/search-params.ts`, `app/web/src/components/card-detail.tsx`, `app/web/messages/en.json`, `app/web/messages/de.json`, plus test-fixture updates.

---

## Task 1: Pipeline — derive finishes in `transform_hpjson.py`

**Files:**
- Modify: `card-data/transform_hpjson.py` (`RARITY_FINISH`/`split_rarity` region ~75-85, `transform()` ~87-137)
- Test: `card-data/test_finishes.py` (create)

**Interfaces:**
- Produces: `derive_finishes(rarity: str | None, types: list[str]) -> list[str]`; `transform(c, lang)` now emits `"finishes": list[str]` and `"_premiumSource": bool`, and no longer emits `"finish"`.

- [ ] **Step 1: Write the failing test**

Create `card-data/test_finishes.py`:

```python
#!/usr/bin/env python3
"""Unit tests for the finishes derivation + premium dedup. Run: python3 test_finishes.py"""
from transform_hpjson import derive_finishes, transform

def test_derive_finishes_rule():
    assert derive_finishes("Rare", ["Character"]) == ["normal", "holo"]
    assert derive_finishes("Rare", ["Character", "Item"]) == ["normal", "holo"]
    assert derive_finishes("Rare", ["Spell"]) == ["normal", "foil"]
    assert derive_finishes("Common", ["Character"]) == ["normal"]   # non-rare char -> normal only
    assert derive_finishes("Uncommon", ["Spell"]) == ["normal"]
    assert derive_finishes("Lesson", ["Lesson"]) == ["normal"]
    assert derive_finishes(None, []) == ["normal"]

def test_transform_emits_finishes_and_provenance():
    normal = transform({"name": "A", "setName": "Base", "number": "1",
                        "type": ["Character"], "rarity": "Rare"})
    assert normal["finishes"] == ["normal", "holo"]
    assert normal["_premiumSource"] is False
    assert "finish" not in normal

    premium = transform({"name": "B", "setName": "Base", "number": "2",
                         "type": ["Character"], "rarity": "Holo Portrait Premium"})
    assert premium["rarity"] == "Rare"          # base rarity recovered
    assert premium["finishes"] == ["normal", "holo"]   # derived from rule, not source label
    assert premium["_premiumSource"] is True

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print(f"ok  {name}")
    print("all passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd card-data && python3 test_finishes.py`
Expected: FAIL — `ImportError: cannot import name 'derive_finishes'`.

- [ ] **Step 3: Add `derive_finishes` and wire it into `transform`**

In `card-data/transform_hpjson.py`, keep `RARITY_FINISH`/`split_rarity` (they still recover a base rarity for premium-only rows) and add below them:

```python
def derive_finishes(rarity, types):
    """A finish is an availability property derived from rarity + type.
    Rare characters can be holo; other rares can be foil; everything else is normal-only."""
    if rarity == "Rare":
        return ["normal", "holo"] if "Character" in (types or []) else ["normal", "foil"]
    return ["normal"]
```

In `transform()`, replace the rarity/finish line and the output field. Change line ~90:

```python
    rarity, finish = split_rarity(c.get("rarity"))
```
to:
```python
    rarity, _src_finish = split_rarity(c.get("rarity"))
    premium_source = c.get("rarity") in RARITY_FINISH
```

Then in the returned `out` dict, replace `"finish": finish,` (line ~123) with:

```python
        "finishes": derive_finishes(rarity, types),
        "_premiumSource": premium_source,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd card-data && python3 test_finishes.py`
Expected: `ok  test_derive_finishes_rule` / `ok  test_transform_emits_finishes_and_provenance` / `all passed`.

- [ ] **Step 5: Commit**

```bash
git add card-data/transform_hpjson.py card-data/test_finishes.py
git commit -m "feat(card-data): derive finishes[] from rarity+type in transform"
```

---

## Task 2: Pipeline — drop premium duplicates, update schema + slim, rebuild `dist/`

**Files:**
- Modify: `card-data/build_dataset.py` (`build_cards` ~43-52, `slim` ~99-112)
- Modify: `card-data/card.schema.json` (`required` line 7, `finish` property line 42)
- Test: `card-data/test_finishes.py` (extend)

**Interfaces:**
- Consumes: `transform()` output carrying `finishes` + `_premiumSource` (Task 1).
- Produces: `drop_premium_duplicates(cards: list[dict]) -> list[dict]`; `build_cards()` returns cards with `finishes` and **no** `_premiumSource` / `finish`; `dist/cards.json` with 1,031 cards.

- [ ] **Step 1: Write the failing test (extend `test_finishes.py`)**

Add to `card-data/test_finishes.py` (import line + new test):

```python
from build_dataset import drop_premium_duplicates

def test_drop_premium_duplicates():
    rows = [
        {"setCode": "QC", "number": "6", "_premiumSource": True,  "id": "a"},  # dup -> dropped
        {"setCode": "QC", "number": "6", "_premiumSource": False, "id": "b"},  # kept
        {"setCode": "AAH", "number": "9", "_premiumSource": True, "id": "c"},  # premium-only -> kept
        {"setCode": "GOF", "number": "5", "_premiumSource": False, "id": "d"},
        {"setCode": "GOF", "number": "5", "_premiumSource": False, "id": "e"},  # normal/normal -> untouched
    ]
    kept = [r["id"] for r in drop_premium_duplicates(rows)]
    assert kept == ["b", "c", "d", "e"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd card-data && python3 test_finishes.py`
Expected: FAIL — `ImportError: cannot import name 'drop_premium_duplicates'`.

- [ ] **Step 3: Implement `drop_premium_duplicates` + strip flag in `build_cards`**

In `card-data/build_dataset.py`, add near the top (after imports) and rewrite `build_cards`:

```python
from collections import defaultdict

def drop_premium_duplicates(cards):
    """Drop a premium-sourced row when a normal-sourced row shares its (setCode, number):
    the premium is now expressed via the surviving row's derived finishes[]. Premium-only
    rows (no normal sibling) are kept as ordinary cards."""
    groups = defaultdict(list)
    for c in cards:
        groups[(c["setCode"], c["number"])].append(c)
    kept = []
    for c in cards:
        siblings = groups[(c["setCode"], c["number"])]
        has_normal = any(not s.get("_premiumSource") for s in siblings)
        if c.get("_premiumSource") and has_normal:
            continue  # redundant premium duplicate
        kept.append(c)
    return kept

def build_cards(hp_cards):
    cards = drop_premium_duplicates([transform(c) for c in hp_cards])
    for c in cards:
        c.pop("_premiumSource", None)  # transient; never written to dist
    seen = {}
    for c in cards:
        if c["id"] in seen:
            seen[c["id"]] += 1
            c["id"] = f"{c['id']}-{seen[c['id']]}"
        else:
            seen[c["id"]] = 1
    return cards
```

- [ ] **Step 4: Update `slim()` to carry `finishes`**

In `card-data/build_dataset.py`, `slim()` line ~106, replace `"rarity": card["rarity"], "finish": card["finish"],` with:

```python
        "cost": card["cost"], "provides": card["provides"], "rarity": card["rarity"], "finishes": card["finishes"],
```

- [ ] **Step 5: Update `card.schema.json`**

Line 7 `required`: replace `"finish"` with `"finishes"`.
Line 42: replace the `finish` property with:

```json
    "finishes": { "type": "array", "items": { "type": "string", "enum": ["normal", "foil", "holo"] }, "minItems": 1, "description": "Available print finishes (availability, not identity). Always includes 'normal'; rare characters add 'holo', other rares add 'foil'." },
```

Also update the `rarity` description (line 41) — drop the "their foil/holo treatment is in 'finish'" clause; premium is now derived. Change it to:

```json
    "rarity": { "type": "string", "enum": ["Common", "Uncommon", "Rare", "Lesson"], "description": "Base rarity (UI translates). Available finishes are derived from rarity + type (see 'finishes'). NB: base rarity of premium-only cards isn't in the source and defaults to 'Rare'." },
```

- [ ] **Step 6: Run unit tests**

Run: `cd card-data && python3 test_finishes.py`
Expected: `all passed`.

- [ ] **Step 7: Rebuild `dist/` and verify the dataset**

Run: `cd card-data && python3 build_dataset.py`
Expected: prints `cards: 1031 | sets: 14 | ...` and `validation: card errors=0, set errors=0`.

Then verify the outcome:

```bash
cd card-data && python3 -c "
import json, collections
cards = json.load(open('dist/cards.json'))
assert len(cards) == 1031, len(cards)
assert all(c['finishes'] and 'normal' in c['finishes'] for c in cards), 'every card has normal'
assert all('finish' not in c and '_premiumSource' not in c for c in cards), 'transient keys stripped'
# the 4 typo-twins collapsed: each (set,number) below now has exactly one row
for k in [('QC','6'),('QC','7'),('DA','27'),('AAH','3')]:
    rows = [c for c in cards if (c['setCode'],c['number'])==k]
    assert len(rows) == 1, (k, len(rows))
# rule holds
fin = collections.Counter(tuple(c['finishes']) for c in cards)
print('OK', dict(fin))
"
```
Expected: `OK {('normal',): 702, ('normal', 'foil'): 222, ('normal', 'holo'): 107}` — from the full-set counts (702 normal-only, 225 rare non-character, 108 rare character) minus the 4 dropped premium duplicates: QC #6/#7 and DA #27 are non-character rares (foil: 225→222) and AAH #3 is a character (holo: 108→107); each surviving sibling still carries the finish. Total = 1,031. The hard asserts above are the gate; treat this line as the expected value.

- [ ] **Step 8: Commit**

```bash
git add card-data/build_dataset.py card-data/card.schema.json card-data/test_finishes.py
git commit -m "feat(card-data): drop duplicate premium rows; emit finishes[] (1035->1031)"
```

---

## Task 3: Thread `finishes[]` through DB, search, and ingest (atomic type migration)

This is one atomic change: the DB column rename forces every DTO/document type and mapper that reads it to change together. The gate is a green `verify` + `typecheck` + `test`. Land it as one commit.

**Files:**
- Modify: `app/db/src/schema.ts:81`; generate `app/db/drizzle/NNNN_*.sql`
- Modify: `app/db/src/queries.ts:184,279`
- Modify: `app/core/src/domain.ts:41`
- Modify: `app/search/src/documents.ts:16,49,71,97`; `app/search/src/search.ts:10,32`
- Modify: `app/ingest/src/types.ts:32`, `load-cards.ts:18`, `load-attributes.ts:29`, `build-documents.ts:57`
- Modify: `app/web/src/lib/search-params.ts:72`
- Modify (test fixtures): `app/web/src/lib/__tests__/search-client.test.ts:14-15`; `app/web/src/components/__tests__/{card-grid,card-tile,card-detail,card-detail-edit,deck-card-browser}.test.tsx`
- Create: `app/search/src/__tests__/search.test.ts`

**Interfaces:**
- Produces: `CardDTO.finishes: string[]`; `SearchDocument.finishes: string[]`; `CardIndexData.finishes: string[]`; `CardFilters.finishes?: string[]`; `DistCard.finishes: string[]`; `cards.finishes` column (`text[] not null default ['normal']`).

- [ ] **Step 1: Add the search-layer behavior test (new file)**

Create `app/search/src/__tests__/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFilter } from '../search'

describe('buildFilter — finishes facet', () => {
  it('filters on the finishes array field (Meili "contains")', () => {
    expect(buildFilter({ finishes: ['foil'] })).toEqual(['(finishes = "foil")'])
  })
  it('ORs multiple finish values within the facet', () => {
    expect(buildFilter({ finishes: ['foil', 'holo'] })).toEqual([
      '(finishes = "foil" OR finishes = "holo")',
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd app && npm test -w @revelio/search`
Expected: FAIL — type error / `finishes` not a key of `CardFilters`.

- [ ] **Step 3: Rename in `@revelio/search`**

`app/search/src/search.ts`:
- Line 10: `finish?: string[]` → `finishes?: string[]`
- Line 32 (`ARRAY_FACETS`): replace `'finish'` with `'finishes'`

`app/search/src/documents.ts`:
- Line 16 (`SearchDocument`): `finish: string | null` → `finishes: string[]`
- Line 49 (`filterableAttributes`): replace `'finish'` with `'finishes'`
- Line 71 (`CardIndexData`): `finish: string | null` → `finishes: string[]`
- Line 97 (`buildCardDocument` return): `finish: d.finish,` → `finishes: d.finishes,`

- [ ] **Step 4: Rename in `@revelio/core`**

`app/core/src/domain.ts:41`: `finish: string | null` → `finishes: string[]`

- [ ] **Step 5: Change the DB schema column + generate migration**

`app/db/src/schema.ts:81`: replace
```ts
  finish: text('finish').references(() => finishes.code),
```
with
```ts
  finishes: text('finishes').array().notNull().default(['normal']),
```
(The `finishes` vocabulary table stays — it is still seeded by ingest and used for label ordering. Postgres arrays can't carry an element FK, so the reference is dropped.)

Run: `cd app/db && npm run generate`
Review the generated `drizzle/NNNN_*.sql`: it should `DROP COLUMN finish` (removing its FK) and `ADD COLUMN finishes text[] NOT NULL DEFAULT '{normal}'`. Card rows are reseeded by ingest, so no data backfill is needed.

Run: `cd app && npm run verify -w @revelio/db`
Expected: PASS (schema ↔ migration in sync).

- [ ] **Step 6: Update the DB query mappers**

`app/db/src/queries.ts`:
- Line 184 (CardDTO builder): `finish: card.finish,` → `finishes: card.finishes,`
- Line 279 (CardIndexData builder): `finish: card.finish,` → `finishes: card.finishes,`

- [ ] **Step 7: Update `@revelio/ingest`**

`app/ingest/src/types.ts:32`: `finish: string | null` → `finishes: string[]`

`app/ingest/src/load-cards.ts:18`: replace
```ts
    finish: c.finish ? slugify(c.finish) : null,
```
with
```ts
    finishes: (c.finishes ?? ['normal']).map(slugify),
```

`app/ingest/src/load-attributes.ts:29`: replace
```ts
    if (c.finish) acc.finishes.add(slugify(c.finish))
```
with
```ts
    for (const f of c.finishes ?? []) acc.finishes.add(slugify(f))
```

`app/ingest/src/build-documents.ts:57`: `finish: c.finish,` → `finishes: c.finishes,`

- [ ] **Step 8: Update the web search mapping + test fixtures**

`app/web/src/lib/search-params.ts:72`: `if (state.finishes.length) filters.finish = state.finishes` → `if (state.finishes.length) filters.finishes = state.finishes`

Update these fixtures (SearchDocument shape → `finishes: ['normal']`; CardDTO/CardDetailDTO shape → `finishes: []`):
- `app/web/src/lib/__tests__/search-client.test.ts:14,15` — `finish: 'normal',` → `finishes: ['normal'],` (both docs)
- `app/web/src/components/__tests__/card-grid.test.tsx:17` — `finish: null,` → `finishes: [],`
- `app/web/src/components/__tests__/card-tile.test.tsx:12` — `finish: null,` → `finishes: [],`
- `app/web/src/components/__tests__/card-detail.test.tsx:23` — `finish: null,` → `finishes: [],`
- `app/web/src/components/__tests__/card-detail-edit.test.tsx:14` — `finish: null,` → `finishes: [],`
- `app/web/src/components/__tests__/deck-card-browser.test.tsx:28` — `finish: null,` → `finishes: [],`

- [ ] **Step 9: Catch any stragglers**

Run: `cd app && grep -rn "\.finish\b\|finish:" src ../core/src ../db/src ../search/src ../ingest/src | grep -v finishes | grep -v "'finish'" | grep -v '"finish"'`
Expected: no results referencing a scalar `.finish` property or `finish:` field (URL-param literals `'finish'`/`"finish"` are intentionally kept and filtered out). Fix any that remain.

- [ ] **Step 10: Verify typecheck + all tests**

Run: `cd app && npm run typecheck`
Expected: PASS.
Run: `cd app && npm test`
Expected: PASS (includes the new `@revelio/search` test and updated fixtures). Tests needing live Meili/Postgres are gated by env vars as usual.

- [ ] **Step 11: Commit**

```bash
git add app/core app/db app/search app/ingest app/web/src/lib/search-params.ts app/web/src/lib/__tests__ app/web/src/components/__tests__
git commit -m "feat: thread finishes[] through db, search, and ingest"
```

---

## Task 4: Web — show available finishes on the card detail page

**Files:**
- Modify: `app/web/src/components/card-detail.tsx` (~line 85, after the rarity line)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (`card` namespace)
- Test: `app/web/src/components/__tests__/card-detail.test.tsx`

**Interfaces:**
- Consumes: `CardDetailDTO.finishes: string[]` (from Task 3) and `attrLabel('finishes', code, locale)`.

- [ ] **Step 1: Write the failing test**

Add to `app/web/src/components/__tests__/card-detail.test.tsx` (a card with a premium finish shows it; a normal-only card does not render the line). Set `finishes: ['normal', 'foil']` on the existing test card, and add:

```tsx
it('lists available finishes when the card has a premium finish', () => {
  render(<CardDetail card={{ ...card, finishes: ['normal', 'foil'] }} locale="en" imageBase="" />)
  expect(screen.getByText(/Available finishes/i)).toBeInTheDocument()
  expect(screen.getByText(/Foil/)).toBeInTheDocument()
})

it('omits the finishes line for normal-only cards', () => {
  render(<CardDetail card={{ ...card, finishes: ['normal'] }} locale="en" imageBase="" />)
  expect(screen.queryByText(/Available finishes/i)).not.toBeInTheDocument()
})
```

(Match the existing `render(...)` prop signature used elsewhere in this test file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/card-detail.test.tsx`
Expected: FAIL — "Available finishes" text not found.

- [ ] **Step 3: Add the i18n keys**

In `app/web/messages/en.json`, inside the `card` object (near `"number"`), add:
```json
    "availableFinishes": "Available finishes",
```
In `app/web/messages/de.json`, inside the `card` object, add:
```json
    "availableFinishes": "Verfügbare Ausführungen",
```

- [ ] **Step 4: Render the finishes line**

In `app/web/src/components/card-detail.tsx`, immediately after the closing `</p>` of the set/number/rarity block (~line 85), add:

```tsx
        {card.finishes.some((f) => f !== 'normal') && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('availableFinishes')}:{' '}
            {card.finishes.map((f) => attrLabel('finishes', f, locale)).join(', ')}
          </p>
        )}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `cd app && npm test -w web -- src/components/__tests__/card-detail.test.tsx`
Expected: PASS.
Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/card-detail.tsx app/web/src/components/__tests__/card-detail.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): show available finishes on the card detail page"
```

---

## Task 5: End-to-end rebuild, migrate, ingest, reindex + manual verification

**Files:** none (operational). Requires local infra (`docker compose up` from `app/`) or the CI/staging equivalent.

**Interfaces:** consumes the clean `dist/` (Task 2) and the migrated schema (Task 3).

- [ ] **Step 1: Ensure the dataset is rebuilt**

Run: `cd card-data && python3 build_dataset.py`
Expected: `cards: 1031 | ...`, `card errors=0`.

- [ ] **Step 2: Start infra and run the migration**

Run: `cd app && docker compose up -d postgres meilisearch minio && docker compose run --rm migrate`
Expected: the new `NNNN_*.sql` applies cleanly (adds `cards.finishes`, drops `cards.finish`).

- [ ] **Step 3: Run ingest (seeds Postgres, indexes Meili, uploads images)**

Run: `cd app && npm run -w @revelio/ingest start` (or the documented ingest entrypoint, e.g. `tsx ingest/src/main.ts`).
Expected: completes without error; logs ~1,031 cards.

- [ ] **Step 4: Verify the DB column**

Run:
```bash
cd app && docker compose exec -T postgres psql -U postgres -d revelio -c \
  "select finishes, count(*) from cards group by finishes order by 2 desc;"
```
Expected: three groupings — `{normal}` (majority), `{normal,holo}`, `{normal,foil}`; no `{}` / null rows.

- [ ] **Step 5: Verify search faceting (Meilisearch reindexed by ingest)**

Drive the app (`npm run dev -w web`) and, on the search page, apply the **Foil** finish filter: results must be non-empty and every hit must be a rare non-character; apply **Holo**: every hit must be a rare character. Confirm a rare card's detail page shows the "Available finishes" line and a common card's does not.

- [ ] **Step 6: Final verification with the project verify skill**

Use the `verify` skill (or `/run`) to exercise the search-filter + card-detail flow end-to-end and confirm behavior, not just green tests.

- [ ] **Step 7: Push branch + open PR**

```bash
git push -u origin feat/card-finishes-array
gh pr create --fill --base main
```

---

## Self-Review

**1. Spec coverage:**
- Rule (rare char → holo, rare non-char → foil, else normal) → Task 1 `derive_finishes`. ✔
- Fix at import; drop 4 typo-twins; keep 22 premium-only → Task 2 `drop_premium_duplicates` + dataset asserts. ✔
- `card.schema.json` finish → finishes array → Task 2 Step 5. ✔
- DB `cards.finishes text[]` + migration + `verify` → Task 3 Step 5. ✔
- core DTO, db queries, search document + filter (contains facet), ingest loaders/documents → Task 3. ✔
- web filter mapping + card-detail display + reindex → Task 3 Step 8, Task 4, Task 5 Step 5. ✔
- Testing (pipeline rule, dedup, 1,031 count, schema validation, db verify, search filter, FINISHES vocab unchanged, card-detail render) → Tasks 1,2,3,4. ✔
- Rollout (rebuild → migrate → ingest → reindex) → Task 5. ✔
- Out-of-scope (10 wrong-number collisions, overrides file) → untouched by design. ✔

**2. Placeholder scan:** No TBD/TODO; every code step shows concrete code. The generated migration filename is `NNNN_*` because Drizzle assigns it — the review criteria are specified instead. ✔

**3. Type consistency:** `finishes` is `string[]` everywhere it is a value (`CardDTO`, `SearchDocument`, `CardIndexData`, `DistCard`) and `finishes?: string[]` on `CardFilters`; the DB column is `text[] not null default ['normal']`. The URL param remains the string literal `'finish'` intentionally (documented in Global Constraints). `derive_finishes(rarity, types)` and `drop_premium_duplicates(cards)` signatures match their call sites. ✔

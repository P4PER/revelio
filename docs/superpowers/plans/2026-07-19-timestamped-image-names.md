# Timestamped Image Names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every stored image a version segment in its S3 object key so a changed image gets a distinct, immutably-cacheable URL — busting browser/proxy caches on re-upload.

**Architecture:** Object keys become `cards/{id}[.{lang}].{v}.webp` (and thumb/art-crop/symbol equivalents), where `v` is an epoch-seconds integer. `v` is stored in Postgres (`card_localizations.image_version`, `cards.art_crop_version`, `sets.symbol_version`), travels to the browser through the Meili document and DB DTOs, and doubles as the "image exists" signal — replacing the dropped provenance columns `image_file`, `image_url`, `sets.symbol`. Ingest derives `v` from each asset file's mtime (idempotent re-runs); editor/admin uploads use `Date.now()`.

**Tech Stack:** TypeScript, npm workspaces (`core` → `{search, db}` → `{ingest, web}`), Drizzle ORM + Postgres, Meilisearch, S3/MinIO (`@aws-sdk/client-s3`), Next.js 16, Vitest, Testcontainers.

## Global Constraints

- All commands run from `app/` (npm workspaces root). No root `package.json`.
- Node 22.
- **Migrations are incremental and append-only.** Never `rm` or regenerate `db/drizzle/0000_*.sql`. To change schema: edit `db/src/schema.ts`, run `npm run generate` from `app/db`, review + commit the generated `drizzle/NNNN_*.sql` **with** the schema edit. `npm run verify -w @revelio/db` (CI-enforced) fails if the schema drifted from migrations.
- **Version type:** epoch **seconds** as a JS `number` (`Math.floor(ms / 1000)`). Rendered into keys with `String(v)`.
- **Immutable cache header constant** (verbatim): `public, max-age=31536000, immutable`.
- Two Meili keys are server-only; never send keys to the browser.
- `NEXT_PUBLIC_*` env vars are inlined at build time.
- Conventional Commits. All prose in English.
- Run `npm run typecheck` and `npm test` from `app/` before each commit; both must pass.

## File structure / decomposition

- `core/src/images.ts` — key builders gain a required `version` param (the single source of key shape).
- `core/src/domain.ts` — DTO shapes swap provenance fields for version fields.
- `search/src/documents.ts` — search document + `buildCardDocument` carry `imageVersion`.
- `db/src/schema.ts` (+ generated migration) — column swap.
- `db/src/queries.ts` — DTO reads, setters, and deck-view/version plumbing.
- `ingest/src/image-versions.ts` (new) — `fileVersion(path)` mtime helper.
- `ingest/src/{load-cards,load-sets,build-documents,upload-images,main}.ts` — write versions, upload versioned keys.
- `web/src/lib/{s3,image-actions,set-actions}.ts` — write paths + cache header.
- `web/src/components/*` + two `app/[locale]/card/[id]` pages — render sites pass versions.
- `docs/RUNBOOK-IMAGE-VERSIONING-ROLLOUT.md` (new) — re-ingest + purge steps.

---

## Task 1: Versioned key builders (`@revelio/core`)

**Files:**
- Modify: `app/core/src/images.ts`
- Test: `app/core/test/images.test.ts`

**Interfaces:**
- Produces:
  - `imageKey(id: string, version: number, lang?: string, defaultLang?: string): string`
  - `thumbKey(id: string, version: number, lang?: string, defaultLang?: string): string`
  - `artCropKey(id: string, version: number): string`
  - `symbolKey(code: string, version: number): string`
  - `imageUrl(base, key)` and `effectiveImageLang(...)` unchanged.
- Key shapes: `cards/{id}.{v}.webp`, `cards/{id}.{lang}.{v}.webp` (lang before version), `cards/thumb/{id}.{v}.webp`, `cards/thumb/{id}.{lang}.{v}.webp`, `cards/art-crop/{id}.{v}.webp`, `symbols/{code}.{v}.webp`.

- [ ] **Step 1: Rewrite the failing tests** in `app/core/test/images.test.ts` (replace the two `describe` blocks that assert key shapes; keep the `imageUrl` and `effectiveImageLang` assertions):

```ts
import { describe, it, expect } from 'vitest'
import { imageKey, thumbKey, symbolKey, imageUrl, artCropKey, effectiveImageLang } from '../src/images.js'

describe('image keys and urls', () => {
  it('builds versioned object keys', () => {
    expect(imageKey('bs-1-dean-thomas', 1721380000)).toBe('cards/bs-1-dean-thomas.1721380000.webp')
    expect(thumbKey('bs-1-dean-thomas', 1721380000)).toBe('cards/thumb/bs-1-dean-thomas.1721380000.webp')
    expect(symbolKey('BS', 1721380000)).toBe('symbols/BS.1721380000.webp')
    expect(artCropKey('bs-1-dean-thomas', 1721380000)).toBe('cards/art-crop/bs-1-dean-thomas.1721380000.webp')
  })

  it('joins base and key with a single slash', () => {
    expect(imageUrl('https://img.example.com', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
    expect(imageUrl('https://img.example.com/', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
  })
})

describe('language-aware versioned keys', () => {
  it('uses the shared key for the default language, a suffixed key otherwise', () => {
    expect(imageKey('x-1', 5, 'en', 'en')).toBe('cards/x-1.5.webp')
    expect(imageKey('x-1', 5, 'de', 'en')).toBe('cards/x-1.de.5.webp')
    expect(thumbKey('x-1', 5, 'en', 'en')).toBe('cards/thumb/x-1.5.webp')
    expect(thumbKey('x-1', 5, 'de', 'en')).toBe('cards/thumb/x-1.de.5.webp')
  })

  it('resolves the effective image language with fallback', () => {
    const has = (set: string[]) => (l: string) => set.includes(l)
    expect(effectiveImageLang(has(['de']), 'de', 'en')).toBe('de')
    expect(effectiveImageLang(has(['en']), 'de', 'en')).toBe('en')
    expect(effectiveImageLang(has([]), 'de', 'en')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -w @revelio/core -- images`
Expected: FAIL (arity/shape mismatch — current `imageKey` ignores the numeric arg).

- [ ] **Step 3: Rewrite the key builders** in `app/core/src/images.ts` (replace the four key functions; leave `imageUrl` and `effectiveImageLang` as-is):

```ts
function langSuffix(lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang ? `.${lang}` : ''
}

export function imageKey(id: string, version: number, lang?: string, defaultLang?: string): string {
  return `cards/${id}${langSuffix(lang, defaultLang)}.${version}.webp`
}

export function thumbKey(id: string, version: number, lang?: string, defaultLang?: string): string {
  return `cards/thumb/${id}${langSuffix(lang, defaultLang)}.${version}.webp`
}

// Deck-hero art crop: a pre-cropped, upright character image baked at ingest time.
// Default-language only (no lang suffix) — the deck hero always shows the en art.
export function artCropKey(id: string, version: number): string {
  return `cards/art-crop/${id}.${version}.webp`
}

export function symbolKey(code: string, version: number): string {
  return `symbols/${code}.${version}.webp`
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -w @revelio/core -- images`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/core/src/images.ts app/core/test/images.test.ts
git commit -m "feat(core): version segment in image object keys"
```

---

## Task 2: DTO type swaps (`@revelio/core`)

**Files:**
- Modify: `app/core/src/domain.ts`

**Interfaces:**
- Produces (consumed by db/web tasks):
  - `CardLocalizationDTO`: **drop** `imageFile`, `imageUrl`; **add** `imageVersion: number | null`.
  - `SetDTO`: **drop** `symbol`; **add** `symbolVersion: number | null`.
  - `CardDetailDTO`: **add** `artCropVersion: number | null`.
  - `DeckCardView`: **add** `imageVersion: number | null` and `artCropVersion: number | null`.

- [ ] **Step 1: Edit `CardLocalizationDTO`** in `app/core/src/domain.ts` — remove the `imageFile` and `imageUrl` lines, add `imageVersion`:

```ts
export type CardLocalizationDTO = {
  lang: string
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  imageVersion: number | null
  adventure: AdventureData | null
  match: MatchData | null
}
```

- [ ] **Step 2: Edit `SetDTO`** — replace `symbol: string | null` with `symbolVersion: number | null`:

```ts
export type SetDTO = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbolVersion: number | null
}
```

- [ ] **Step 3: Add `artCropVersion` to `CardDetailDTO`** — append to the superset type:

```ts
export type CardDetailDTO = CardDTO & {
  artist: string[]
  health: number | null
  damagePerTurn: number | null
  orientation: string | null
  defaultLanguage: string
  artCropVersion: number | null
  rulings: RulingDTO[]
  set: SetDTO
}
```

- [ ] **Step 4: Add version fields to `DeckCardView`** — append two fields:

```ts
export type DeckCardView = DeckCardDTO & {
  name: string
  cost: number | null
  damage: number | null
  types: string[]
  setCode: string
  number: string
  lesson: string | null
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
  orientation?: string | null
  imageVersion: number | null
  artCropVersion: number | null
}
```

- [ ] **Step 5: Verify it compiles (downstream will still error — that is expected and fixed in later tasks)**

Run: `npm run typecheck -w @revelio/core`
Expected: PASS (core has no internal consumers of the removed fields).

- [ ] **Step 6: Commit**

```bash
git add app/core/src/domain.ts
git commit -m "feat(core): swap image provenance DTO fields for version fields"
```

---

## Task 3: Search document carries `imageVersion` (`@revelio/search`)

**Files:**
- Modify: `app/search/src/documents.ts`
- Test: `app/search/test/documents.test.ts`

**Interfaces:**
- Consumes: `effectiveImageLang` (unchanged).
- Produces:
  - `SearchDocument` gains `imageVersion: number | null`.
  - `LocalizationFields` **drops** `imageFile`, **adds** `imageVersion: number | null`.
  - `CARD_INDEX_SETTINGS` unchanged (imageVersion is stored, not filterable/sortable).

- [ ] **Step 1: Update the `buildCardDocument` test** in `app/search/test/documents.test.ts` — change the sample localization and add an assertion:

```ts
describe('buildCardDocument', () => {
  it('carries orientation onto the built document', () => {
    const data = {
      id: 'bs-1', setCode: 'BS', number: '1', name: 'Harry',
      lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
      isOfficial: true, types: ['character'], subTypes: [], defaultLanguage: 'en',
      orientation: 'horizontal',
      localizations: { en: { name: 'Harry', text: null, flavorText: null, imageVersion: 42 } },
    }
    const doc = buildCardDocument(data, 'en')
    expect(doc.orientation).toBe('horizontal')
    expect(doc.imageLang).toBe('en')
    expect(doc.imageVersion).toBe(42)
  })

  it('reports no image version when the language has none', () => {
    const data = {
      id: 'bs-2', setCode: 'BS', number: '2', name: 'Ron',
      lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
      isOfficial: true, types: ['character'], subTypes: [], defaultLanguage: 'en',
      orientation: null,
      localizations: { en: { name: 'Ron', text: null, flavorText: null, imageVersion: null } },
    }
    const doc = buildCardDocument(data, 'en')
    expect(doc.imageLang).toBeNull()
    expect(doc.imageVersion).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -w @revelio/search -- documents`
Expected: FAIL (`imageVersion` missing on document / type error on `imageFile`).

- [ ] **Step 3: Edit `SearchDocument`** in `app/search/src/documents.ts` — add `imageVersion` after `imageLang`:

```ts
  imageLang: string | null
  imageVersion: number | null
  defaultLanguage: string
  orientation: string | null
```

- [ ] **Step 4: Edit `LocalizationFields`** — swap `imageFile` for `imageVersion`:

```ts
export type LocalizationFields = {
  name: string
  text: string | null
  flavorText: string | null
  imageVersion: number | null
}
```

- [ ] **Step 5: Edit `buildCardDocument`** — compute `imageLang` from the version predicate, then derive `imageVersion`:

```ts
export function buildCardDocument(d: CardIndexData, lang: string): SearchDocument {
  const loc = d.localizations[lang] ?? d.localizations[d.defaultLanguage]
  const imageLang = effectiveImageLang((l) => d.localizations[l]?.imageVersion != null, lang, d.defaultLanguage)
  return {
    id: d.id,
    setCode: d.setCode,
    number: d.number,
    numberSort: cardNumberSortKey(d.number),
    name: loc?.name || d.name,
    text: loc?.text ?? null,
    flavorText: loc?.flavorText ?? null,
    types: d.types,
    subTypes: d.subTypes,
    lesson: d.lesson,
    rarity: d.rarity,
    finishes: d.finishes,
    legality: d.legality,
    cost: d.cost,
    damage: d.damage,
    isOfficial: d.isOfficial,
    imageLang,
    imageVersion: imageLang ? d.localizations[imageLang]!.imageVersion : null,
    defaultLanguage: d.defaultLanguage,
    orientation: d.orientation,
  }
}
```

- [ ] **Step 6: Run tests + typecheck, verify pass**

Run: `npm test -w @revelio/search -- documents && npm run typecheck -w @revelio/search`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/search/src/documents.ts app/search/test/documents.test.ts
git commit -m "feat(search): carry imageVersion on the card document"
```

---

## Task 4: Schema column swap + migration (`@revelio/db`)

**Files:**
- Modify: `app/db/src/schema.ts`
- Create: `app/db/drizzle/NNNN_*.sql` (generated)
- Modify: `app/db/drizzle/meta/*` (generated)

**Interfaces:**
- Produces DB columns: `card_localizations.image_version` (`integer`, nullable), `cards.art_crop_version` (`integer`, nullable), `sets.symbol_version` (`integer`, nullable). **Dropped:** `card_localizations.image_file`, `card_localizations.image_url`, `sets.symbol`.

- [ ] **Step 1: Edit `sets` table** in `app/db/src/schema.ts` — replace `symbol: text('symbol'),` with:

```ts
  symbolVersion: integer('symbol_version'),
```

- [ ] **Step 2: Edit `cards` table** — add an `artCropVersion` column (place alongside the other card scalar columns):

```ts
  artCropVersion: integer('art_crop_version'),
```

- [ ] **Step 3: Edit `cardLocalizations` table** — replace the `imageFile` and `imageUrl` lines with:

```ts
  imageVersion: integer('image_version'),
```

- [ ] **Step 4: Confirm `integer` is imported** in `app/db/src/schema.ts` (it already is — `integer` is used by `cardCount`/`seq`). No import change needed.

- [ ] **Step 5: Generate the migration**

Run: `cd app && npm run db:generate`
Expected: a new `app/db/drizzle/NNNN_*.sql` containing `ALTER TABLE ... DROP COLUMN "image_file"`, `DROP COLUMN "image_url"`, `DROP COLUMN "symbol"`, and `ADD COLUMN "image_version" integer`, `ADD COLUMN "art_crop_version" integer`, `ADD COLUMN "symbol_version" integer`.

- [ ] **Step 6: Review the generated SQL** — open the new `drizzle/NNNN_*.sql`; confirm it only drops the three provenance columns and adds the three version columns, and does **not** touch `0000`.

- [ ] **Step 7: Verify schema/migration consistency**

Run: `cd app && npm run check -w @revelio/db && npm run verify -w @revelio/db`
Expected: PASS (no drift).

- [ ] **Step 8: Commit** (schema + generated migration together)

```bash
git add app/db/src/schema.ts app/db/drizzle
git commit -m "feat(db): replace image provenance columns with version columns"
```

---

## Task 5: DB queries — DTO reads, setters, deck versions (`@revelio/db`)

**Files:**
- Modify: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts` (export rename)
- Test: `app/db/test/queries.test.ts` (Testcontainers-backed; add cases)

**Interfaces:**
- Consumes: DTO types from Task 2 (`CardLocalizationDTO.imageVersion`, `SetDTO.symbolVersion`, `CardDetailDTO.artCropVersion`, `DeckCardView.imageVersion/artCropVersion`).
- Produces:
  - `toSetDTO` returns `symbolVersion`.
  - `SetForEdit.symbol` → `SetForEdit.symbolVersion`.
  - `getCardById` localizations carry `imageVersion`; result carries `artCropVersion`.
  - `getCardIndexData` localizations carry `imageVersion`.
  - `setLocalizationImage(db, cardId, lang, imageVersion: number | null)`.
  - **Rename** `setSymbolFile` → `setSetSymbolVersion(db, code, symbolVersion: number | null)`.
  - `cardViewMetaByIds` sets `imageVersion` (default-lang) and `artCropVersion` on each view.
  - `PublicDeckEntry` gains `starterArtCropVersion: number | null`.

- [ ] **Step 1: Update `toSetDTO`** in `app/db/src/queries.ts`:

```ts
function toSetDTO(row: SetRow, name: string = row.name): SetDTO {
  return {
    code: row.code,
    name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbolVersion: row.symbolVersion,
  }
}
```

- [ ] **Step 2: Update `SetForEdit`** type and `getSetForEdit` return — replace `symbol: string | null` with `symbolVersion: number | null`, and in the returned object replace `symbol: row.symbol,` with `symbolVersion: row.symbolVersion,`.

- [ ] **Step 3: Update `getCardById` localization mapping** — replace the `imageFile`/`imageUrl` line:

```ts
      text: l.text, flavorText: l.flavorText, imageVersion: l.imageVersion,
```

  and add `artCropVersion` to the returned `CardDetailDTO` (next to `orientation`):

```ts
    orientation: card.orientation,
    defaultLanguage: card.defaultLanguage,
    artCropVersion: card.artCropVersion,
    localizations,
```

- [ ] **Step 4: Update `getCardIndexData` localization mapping** — replace the loop body line:

```ts
    localizations[l.lang] = { name: l.name, text: l.text, flavorText: l.flavorText, imageVersion: l.imageVersion }
```

- [ ] **Step 5: Rewrite `setLocalizationImage`** to write the version:

```ts
export async function setLocalizationImage(
  db: DB,
  cardId: string,
  lang: string,
  imageVersion: number | null,
): Promise<void> {
  const now = new Date()
  await db
    .insert(cardLocalizations)
    .values({ cardId, lang, name: '', imageVersion, origin: 'user', updatedAt: now })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { imageVersion, origin: 'user', updatedAt: now },
    })
}
```

- [ ] **Step 6: Rename `setSymbolFile` → `setSetSymbolVersion`**:

```ts
export async function setSetSymbolVersion(db: DB, code: string, symbolVersion: number | null): Promise<void> {
  await db.update(sets).set({ symbolVersion, updatedAt: new Date() }).where(eq(sets.code, code))
}
```

- [ ] **Step 7: Thread versions through `cardViewMetaByIds`** — fetch default-lang localizations and set both version fields. Add a localization fetch after `cardRows`:

```ts
  const locRows = uniqueIds.length
    ? await db.select().from(cardLocalizations).where(inArray(cardLocalizations.cardId, uniqueIds))
    : []
  // cardId -> lang -> image_version, so we can read each card's default-language thumb version.
  const imgVerByCardLang = new Map<string, Map<string, number | null>>()
  for (const l of locRows) {
    const m = imgVerByCardLang.get(l.cardId) ?? new Map<string, number | null>()
    m.set(l.lang, l.imageVersion)
    imgVerByCardLang.set(l.cardId, m)
  }
```

  and in the `out.set(c.id, { ... })` object literal add:

```ts
      orientation: c.orientation ?? null,
      imageVersion: imgVerByCardLang.get(c.id)?.get(c.defaultLanguage) ?? null,
      artCropVersion: c.artCropVersion ?? null,
```

- [ ] **Step 8: Fill the two version fields on the `getDeckForViewer` fallback view** — in the `views` map (the `dcs.map(...)` that reads `metaById`), add to each returned object:

```ts
      orientation: meta?.orientation ?? null,
      imageVersion: meta?.imageVersion ?? null,
      artCropVersion: meta?.artCropVersion ?? null,
```

  (Apply the same two lines to any other place that builds a full `DeckCardView` from `metaById` — search the file for `isStartingCharacter: meta?.isStartingCharacter` to find them.)

- [ ] **Step 9: Add `starterArtCropVersion` to `PublicDeckEntry`** — extend the type:

```ts
  starterCardId: string | null
  starterArtCropVersion: number | null
```

  In `listPublicDecks`, change the `starters` query to also select the crop version, and build a version map:

```ts
  const starters = ids.length
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId, artCropVersion: cards.artCropVersion })
        .from(deckCards)
        .innerJoin(cards, eq(deckCards.cardId, cards.id))
        .where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
    : []
  const starterByDeck = new Map(starters.map((s) => [s.deckId, s.cardId]))
  const starterCropByDeck = new Map(starters.map((s) => [s.deckId, s.artCropVersion]))
```

  and in the `entries` map add:

```ts
    starterCardId: starterByDeck.get(r.id) ?? null,
    starterArtCropVersion: starterCropByDeck.get(r.id) ?? null,
```

- [ ] **Step 10: Update the export in `app/db/src/index.ts`** — replace `setSymbolFile` with `setSetSymbolVersion` in the export list.

- [ ] **Step 11: Add DB integration test cases** in `app/db/test/queries.test.ts` (follow the existing Testcontainers setup in that file):

```ts
it('stores and reads a localization image version', async () => {
  // seed a card + set first per the file's existing helpers, then:
  await setLocalizationImage(db, 'bs-1-dean-thomas', 'en', 1721380000)
  const card = await getCardById(db, 'bs-1-dean-thomas')
  expect(card?.localizations.en.imageVersion).toBe(1721380000)
  await setLocalizationImage(db, 'bs-1-dean-thomas', 'en', null)
  const cleared = await getCardById(db, 'bs-1-dean-thomas')
  expect(cleared?.localizations.en.imageVersion).toBeNull()
})

it('stores and reads a set symbol version', async () => {
  await setSetSymbolVersion(db, 'BS', 1721380000)
  const set = await getSetByCode(db, 'BS')
  expect(set?.symbolVersion).toBe(1721380000)
})
```

  (Adapt the seeding to whatever fixtures the test file already provides; import `setLocalizationImage`, `setSetSymbolVersion`, `getCardById`, `getSetByCode` at the top.)

- [ ] **Step 12: Run db tests + typecheck**

Run: `cd app && npm test -w @revelio/db && npm run typecheck -w @revelio/db`
Expected: PASS (Docker required for Testcontainers).

- [ ] **Step 13: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/db/test/queries.test.ts
git commit -m "feat(db): read/write image versions and thread them through deck views"
```

---

## Task 6: Ingest writes versions and uploads versioned keys (`@revelio/ingest`)

**Files:**
- Create: `app/ingest/src/image-versions.ts`
- Modify: `app/ingest/src/load-cards.ts`
- Modify: `app/ingest/src/load-sets.ts`
- Modify: `app/ingest/src/build-documents.ts`
- Modify: `app/ingest/src/upload-images.ts`
- Modify: `app/ingest/src/main.ts`
- Test: `app/ingest/test/image-versions.test.ts` (new)

**Interfaces:**
- Consumes: `imageKey/thumbKey/artCropKey/symbolKey` (Task 1), `setLocalizationImage`/schema (Tasks 4–5), `LocalizationFields.imageVersion` (Task 3).
- Produces: `fileVersion(path: string): number | null`. Ingest derives the **same** version for the DB column and the S3 key (both from the source asset file's mtime).

- [ ] **Step 1: Write `app/ingest/test/image-versions.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileVersion } from '../src/image-versions.js'

describe('fileVersion', () => {
  it('returns the file mtime in epoch seconds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iv-'))
    const p = join(dir, 'x.webp')
    writeFileSync(p, 'x')
    utimesSync(p, new Date(1_700_000_000_000), new Date(1_700_000_000_000))
    expect(fileVersion(p)).toBe(1_700_000_000)
  })

  it('returns null for a missing file', () => {
    expect(fileVersion('/nope/does-not-exist.webp')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -w @revelio/ingest -- image-versions`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `app/ingest/src/image-versions.ts`**

```ts
import { statSync } from 'node:fs'

// The version stamped into an image's object key and stored in Postgres. Using the
// source file's mtime (in epoch seconds) keeps re-ingest idempotent: unchanged
// files keep the same key, so upload diffing still skips them.
export function fileVersion(path: string): number | null {
  try {
    return Math.floor(statSync(path).mtimeMs / 1000)
  } catch (err) {
    if ((err as { code?: string })?.code === 'ENOENT') return null
    throw err
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -w @revelio/ingest -- image-versions`
Expected: PASS

- [ ] **Step 5: Thread versions into `load-cards.ts`** — the loader needs `assetsDir` to stat files. Change the signature and the per-localization / per-card mapping. Add imports and update `loadCards`:

```ts
import { resolve, join } from 'node:path'
import { fileVersion } from './image-versions.js'
```

  Change the signature to `export async function loadCards(db: DB, input: DistCard[], assetsDir: string): Promise<void>`.

  Add a helper inside the function to build the per-lang asset path (default lang → `{id}.webp`, otherwise `{id}.{lang}.webp`):

```ts
  const cardsDir = resolve(assetsDir, 'cards')
  const cardImageVersion = (id: string, lang: string, defaultLang: string): number | null =>
    fileVersion(join(cardsDir, lang === defaultLang ? `${id}.webp` : `${id}.${lang}.webp`))
  const artCropVersionOf = (id: string): number | null =>
    fileVersion(join(cardsDir, 'art-crop', `${id}.webp`))
```

  In the `cardRows` map add `artCropVersion: artCropVersionOf(c.id),`.

  In the `locRows` flatMap, replace `imageFile: l.image?.file ?? null,` / `imageUrl: l.image?.url ?? null,` with:

```ts
      imageVersion: cardImageVersion(c.id, lang, c.defaultLanguage),
```

- [ ] **Step 6: Thread the symbol version into `load-sets.ts`** — add imports and stat the symbol file:

```ts
import { resolve, join } from 'node:path'
import { fileVersion } from './image-versions.js'
```

  Change the signature to `export async function loadSets(db: DB, input: DistSet[], assetsDir: string): Promise<void>` and in the values map replace `symbol: s.symbol,` with:

```ts
      symbolVersion: fileVersion(join(resolve(assetsDir, 'symbols'), `${s.code}.webp`)),
```

- [ ] **Step 7: Update `build-documents.ts`** — swap `imageFile` for `imageVersion` in the assembled localization shape (two spots: the `localizations` type annotation and the assignment):

```ts
    const localizations: Record<string, { name: string; text: string | null; flavorText: string | null; imageVersion: number | null }> = {}
    if (perCard) {
      for (const [lang, loc] of perCard) {
        localizations[lang] = { name: loc.name, text: loc.text, flavorText: loc.flavorText, imageVersion: loc.imageVersion }
      }
    }
```

- [ ] **Step 8: Version the keys in `upload-images.ts`** — `collectUploads` must stamp each key with the source file's version, and thumbs reuse their full image's version. Add the import and rewrite `collectUploads`:

```ts
import { fileVersion } from './image-versions.js'
```

```ts
async function collectUploads(assetsDir: string): Promise<Upload[]> {
  const uploads: Upload[] = []
  const cardsDir = resolve(assetsDir, 'cards')
  for (const f of await readdirSafe(cardsDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(cardsDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `cards/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const thumbDir = resolve(cardsDir, 'thumb')
  for (const f of await readdirSafe(thumbDir)) {
    const c = classify(f)
    if (!c) continue
    // Thumb shares the full image's version so both URLs bust together.
    const v = fileVersion(join(cardsDir, f))
    if (v == null) continue
    uploads.push({ file: join(thumbDir, f), key: `cards/thumb/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const artCropDir = resolve(cardsDir, 'art-crop')
  for (const f of await readdirSafe(artCropDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(artCropDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `cards/art-crop/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const symbolsDir = resolve(assetsDir, 'symbols')
  for (const f of await readdirSafe(symbolsDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(symbolsDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `symbols/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  return uploads
}
```

  Note: `classify` already returns `id = basename(file, ext)`; for lang-suffixed card files that basename is `{id}.{lang}` which is exactly the key stem the web requests (`imageKey(id, v, lang, default)` → `cards/{id}.{lang}.{v}.webp`), so no lang parsing is needed here. `imageKey`/`thumbKey`/etc. are no longer imported in this file — remove the now-unused import of `imageKey, thumbKey, symbolKey, artCropKey`.

- [ ] **Step 9: Apply the immutable cache header on upload** in `uploadAssets` (`upload-images.ts`) — pass `CacheControl` on the `PutObjectCommand`:

```ts
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: u.key, Body: body, ContentType: u.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
```

- [ ] **Step 10: Wire `assetsDir` into the loaders in `main.ts`** — `loadSets` and `loadCards` now need `assetsDir`. Update the calls:

```ts
    const assetsDir = opts.assetsDir ?? '/assets'
    const { sets, cards } = await loadDist(opts.dataDir)
    await loadSets(db, sets, assetsDir)
    await loadAttributes(db, cards)
    await loadCards(db, cards, assetsDir)
```

- [ ] **Step 11: Typecheck + test the ingest workspace**

Run: `cd app && npm run typecheck -w @revelio/ingest && npm test -w @revelio/ingest`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add app/ingest/src app/ingest/test/image-versions.test.ts
git commit -m "feat(ingest): stamp mtime versions into keys and DB, drop provenance writes"
```

---

## Task 7: Web write paths — cache header + versioned upload/delete (`@revelio/web`)

**Files:**
- Modify: `app/web/src/lib/s3.ts`
- Modify: `app/web/src/lib/image-actions.ts`
- Modify: `app/web/src/lib/set-actions.ts`
- Test: `app/web/src/lib/__tests__/image-actions.test.ts` and `set-actions.test.ts` (extend existing)

**Interfaces:**
- Consumes: `imageKey/thumbKey/symbolKey` (Task 1), `setLocalizationImage`/`setSetSymbolVersion`/`getCardById`/`getSetByCode` (Task 5).
- Produces: `putObject(s3, key, body, contentType, cacheControl?: string)`.

- [ ] **Step 1: Add `cacheControl` to `putObject`** in `app/web/src/lib/s3.ts`:

```ts
export async function putObject(s3: S3Client, key: string, body: Buffer, contentType: string, cacheControl?: string) {
  await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }))
}
```

- [ ] **Step 2: Add a shared constant + rewrite `uploadCardImage`** in `app/web/src/lib/image-actions.ts`. At the top (after imports) add:

```ts
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
```

  In `uploadCardImage`, after loading `card` and before writing, read the previous version and delete the old objects; write the new versioned objects; store the version:

```ts
  const input = Buffer.from(await file.arrayBuffer())
  const full = await sharp(input).webp({ quality: 90 }).toBuffer()
  const thumb = await sharp(input).webp({ quality: 80 }).resize({ width: 300 }).toBuffer()

  const s3 = getS3()
  const prev = card.localizations[lang]?.imageVersion ?? null
  if (prev != null) {
    await deleteObject(s3, imageKey(cardId, prev, lang, card.defaultLanguage))
    await deleteObject(s3, thumbKey(cardId, prev, lang, card.defaultLanguage))
  }
  const version = Math.floor(Date.now() / 1000)
  await putObject(s3, imageKey(cardId, version, lang, card.defaultLanguage), full, 'image/webp', IMMUTABLE_CACHE)
  await putObject(s3, thumbKey(cardId, version, lang, card.defaultLanguage), thumb, 'image/webp', IMMUTABLE_CACHE)
  await setLocalizationImage(db, cardId, lang, version)
```

  (`card` is already fetched via `getCardById` above; it now carries `localizations[lang].imageVersion`.)

- [ ] **Step 3: Rewrite `removeCardImage`** in the same file to delete by stored version:

```ts
  const s3 = getS3()
  const prev = card.localizations[lang]?.imageVersion ?? null
  if (prev != null) {
    await deleteObject(s3, imageKey(cardId, prev, lang, card.defaultLanguage))
    await deleteObject(s3, thumbKey(cardId, prev, lang, card.defaultLanguage))
  }
  await setLocalizationImage(db, cardId, lang, null)
```

- [ ] **Step 4: Rewrite the symbol write paths** in `app/web/src/lib/set-actions.ts`. Update the import `setSymbolFile` → `setSetSymbolVersion`, add the constant, and rewrite `uploadSetSymbol`:

```ts
import { getSetByCode, setSetSymbolVersion, createSet, updateSet, deleteSet } from '@revelio/db'
```

```ts
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
```

```ts
export async function uploadSetSymbol(formData: FormData): Promise<SetActionResult> {
  await requireRole('editor')
  const code = String(formData.get('code') ?? '')
  const file = formData.get('file')
  if (!code || !(file instanceof File)) return { ok: false, error: 'invalid' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'type' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'size' }

  const db = getDb()
  const set = await getSetByCode(db, code)
  if (!set) return { ok: false, error: 'invalid' }

  const input = Buffer.from(await file.arrayBuffer())
  const webp = await sharp(input).webp({ quality: 90 }).toBuffer()
  const s3 = getS3()
  if (set.symbolVersion != null) await deleteObject(s3, symbolKey(code, set.symbolVersion))
  const version = Math.floor(Date.now() / 1000)
  await putObject(s3, symbolKey(code, version), webp, 'image/webp', IMMUTABLE_CACHE)
  await setSetSymbolVersion(db, code, version)

  revalidateSetSurfaces(code)
  return { ok: true }
}
```

  Rewrite `removeSetSymbol`:

```ts
export async function removeSetSymbol(code: string): Promise<SetActionResult> {
  await requireRole('editor')
  if (!code) return { ok: false, error: 'invalid' }
  const db = getDb()
  const set = await getSetByCode(db, code)
  if (set?.symbolVersion != null) await deleteObject(getS3(), symbolKey(code, set.symbolVersion))
  await setSetSymbolVersion(db, code, null)
  revalidateSetSurfaces(code)
  return { ok: true }
}
```

  In `deleteSetAction`, replace `await deleteObject(getS3(), symbolKey(code))` with a version-guarded delete:

```ts
  if (set.symbolVersion != null) await deleteObject(getS3(), symbolKey(code, set.symbolVersion))
```

- [ ] **Step 5: Update the existing action tests** in `app/web/src/lib/__tests__/set-actions.test.ts` and `image-actions.test.ts` — adjust any `symbolKey(code)`/`imageKey(id)` expectations to the versioned form and stub `getSetByCode`/`getCardById` to return `symbolVersion`/`imageVersion`. Add an assertion that upload calls `putObject` with the `IMMUTABLE_CACHE` string as the 5th arg. (Follow the mocking style already in those files.)

- [ ] **Step 6: Typecheck + test the web workspace**

Run: `cd app && npm run typecheck -w web && npm test -w web -- actions`
Expected: PASS (Meili/MinIO/Postgres services may be required by some tests per CLAUDE.md).

- [ ] **Step 7: Commit**

```bash
git add app/web/src/lib/s3.ts app/web/src/lib/image-actions.ts app/web/src/lib/set-actions.ts app/web/src/lib/__tests__
git commit -m "feat(web): versioned uploads with immutable cache header, delete prior version"
```

---

## Task 8: Card render sites pass the version (`@revelio/web`)

**Files:**
- Modify: `app/web/src/components/card-detail.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/page.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/edit/page.tsx`
- Modify: `app/web/src/components/card-tile.tsx`
- Modify: `app/web/src/lib/collection-cards.ts`

**Interfaces:**
- Consumes: `SearchDocument.imageVersion` (Task 3), `CardLocalizationDTO.imageVersion` (Task 2).

- [ ] **Step 1: `card-detail.tsx`** — the `effectiveImageLang` predicate and the `imageKey` call. Replace the predicate:

```ts
  const imgLang = effectiveImageLang(
    (l) => card.localizations[l]?.imageVersion != null,
    locale,
    card.defaultLanguage,
  )
```

  and the image `src` (guarded by `imgLang`, so the version is present):

```ts
            src={imageUrl(imageBase, imageKey(card.id, card.localizations[imgLang]!.imageVersion!, imgLang, card.defaultLanguage))}
```

- [ ] **Step 2: `card/[id]/page.tsx`** (OG image) — replace the predicate at line ~31 and the `imageKey` call at line ~42:

```ts
  const ogLang = effectiveImageLang((l) => card.localizations[l]?.imageVersion != null, locale, card.defaultLanguage)
```

```ts
        IMAGE_BASE && ogLang ? [imageUrl(IMAGE_BASE, imageKey(card.id, card.localizations[ogLang]!.imageVersion!, ogLang, card.defaultLanguage))] : [],
```

- [ ] **Step 3: `card/[id]/edit/page.tsx`** — replace the predicate (line ~77) and the `imageSrc` (line ~79):

```ts
  const imgLang = effectiveImageLang((l) => card.localizations[l]?.imageVersion != null, lang, card.defaultLanguage)
  const imageSrc = imgLang && imageBase ? imageUrl(imageBase, imageKey(id, card.localizations[imgLang]!.imageVersion!, imgLang, card.defaultLanguage)) : null
```

- [ ] **Step 4: `card-tile.tsx`** — the tile renders a Meili hit; guard already checks `hit.imageLang`, so `hit.imageVersion` is present. Replace the `src`:

```ts
              src={imageUrl(imageBase, thumbKey(hit.id, hit.imageVersion!, hit.imageLang, hit.defaultLanguage))}
```

- [ ] **Step 5: `collection-cards.ts`** — replace the `src` line:

```ts
    src: h.imageLang ? imageUrl(base, thumbKey(h.id, h.imageVersion!, h.imageLang, h.defaultLanguage)) : undefined,
```

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck -w web`
Expected: PASS (this task compiles; deck/symbol sites still error until Tasks 9–10 — if running incrementally, expect those specific errors only).

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/card-detail.tsx app/web/src/components/card-tile.tsx app/web/src/lib/collection-cards.ts "app/web/src/app/[locale]/card/[id]/page.tsx" "app/web/src/app/[locale]/card/[id]/edit/page.tsx"
git commit -m "feat(web): pass image version through card render sites"
```

---

## Task 9: Deck render sites pass the version (`@revelio/web`)

**Files:**
- Modify: `app/web/src/components/deck-art.tsx`
- Modify: `app/web/src/components/deck-gallery.tsx`
- Modify: `app/web/src/components/deck-card-browser.tsx`
- Modify: `app/web/src/components/deck-panel.tsx`
- Modify: `app/web/src/components/deck-discover-row.tsx`
- Modify: `app/web/src/components/deck-hero-card.tsx`

**Interfaces:**
- Consumes: `DeckCardView.imageVersion/artCropVersion` (Task 2/5), `PublicDeckEntry.starterArtCropVersion` (Task 5), `SearchDocument.imageVersion` (Task 3), `artCropKey(id, version)`/`thumbKey(...)` (Task 1).
- Produces: `DeckArt` gains a required `version: number | null` prop.

- [ ] **Step 1: `deck-art.tsx`** — add a `version` prop and use it; when null, skip the image (fall back to gradient). Update the prop type and the render guard:

```ts
export function DeckArt({
  cardId, version, lessons, imageBase, alt, className,
}: {
  cardId: string | null
  version: number | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(cardId && imageBase && version != null) && !errored
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {showImage ? (
        <img
          src={imageUrl(imageBase, artCropKey(cardId as string, version as number))}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <div data-slot="deck-art-fallback" className="absolute inset-0" style={{ background: lessonGradient(lessons) }} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: `deck-panel.tsx`** — the `DeckArt` at line ~150 renders a `DeckCardView` (`character`). Add the `version` prop:

```tsx
          <DeckArt
            cardId={character.cardId}
            version={character.artCropVersion}
            lessons={character.lesson ? [character.lesson] : []}
            imageBase={imageBase}
            alt={character.name}
            className="h-11 w-16 shrink-0 rounded-md"
          />
```

- [ ] **Step 3: `deck-discover-row.tsx`** — the `DeckArt` renders a `PublicDeckEntry` (`deck`). Add:

```tsx
      <DeckArt cardId={deck.starterCardId} version={deck.starterArtCropVersion} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="size-14 shrink-0 rounded" />
```

- [ ] **Step 4: `deck-hero-card.tsx`** — same shape (`deck.starterCardId`). Add:

```tsx
        <DeckArt cardId={deck.starterCardId} version={deck.starterArtCropVersion} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="h-full w-full" />
```

- [ ] **Step 5: `deck-gallery.tsx`** — the `GalleryTile` renders `thumbKey(entry.cardId)`; it must supply the version and skip when absent. Replace the tile body:

```tsx
      {broken || entry.imageVersion == null ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {entry.name}
        </div>
      ) : (
        <CardRotate
          src={imageUrl(imageBase, thumbKey(entry.cardId, entry.imageVersion))}
          alt={entry.name}
          orientation={entry.orientation}
          sizes="(max-width: 640px) 30vw, 160px"
          onError={() => setBroken(true)}
        />
      )}
```

- [ ] **Step 6: `deck-card-browser.tsx`** — two changes. In `toAddView(hit)`, populate the new fields (browser tiles show thumbs, not art-crop):

```ts
    isLesson: meta.isLesson,
    isStartingCharacter: meta.isStartingCharacter,
    imageVersion: hit.imageVersion,
    artCropVersion: null,
  }
```

  and the result tile `src` (guarded by `hit.imageLang`, so `hit.imageVersion` is present):

```tsx
                    src={imageUrl(imageBase, thumbKey(hit.id, hit.imageVersion!, hit.imageLang, hit.defaultLanguage))}
```

- [ ] **Step 7: Typecheck + run deck component tests**

Run: `cd app && npm run typecheck -w web && npm test -w web -- deck`
Expected: PASS. If `__tests__/deck-gallery.test.tsx` / `deck-overview.test.tsx` build `DeckCardView` fixtures, add `imageVersion: <n>` and `artCropVersion: null` to them.

- [ ] **Step 8: Commit**

```bash
git add app/web/src/components/deck-art.tsx app/web/src/components/deck-gallery.tsx app/web/src/components/deck-card-browser.tsx app/web/src/components/deck-panel.tsx app/web/src/components/deck-discover-row.tsx app/web/src/components/deck-hero-card.tsx app/web/src/components/__tests__
git commit -m "feat(web): pass image/art-crop version through deck render sites"
```

---

## Task 10: Symbol render sites pass the version (`@revelio/web`)

**Files:**
- Modify: `app/web/src/components/set-symbol.tsx`
- Modify: `app/web/src/components/collection-sidebar.tsx`
- Modify: `app/web/src/components/filter-sheet.tsx`
- Modify: `app/web/src/components/admin-sets-table.tsx`
- Modify: `app/web/src/components/set-card.tsx`
- Modify: `app/web/src/components/set-symbol-uploader.tsx`
- Modify: `app/web/src/app/[locale]/admin/sets/[code]/edit/page.tsx`

**Interfaces:**
- Consumes: `SetDTO.symbolVersion` (Task 2/5), `symbolKey(code, version)` (Task 1).
- Produces: `SetSymbol` gains a required `version: number` prop (only rendered when a symbol exists).

- [ ] **Step 1: `set-symbol.tsx`** — add a `version` prop and use it:

```ts
export function SetSymbol({
  code,
  version,
  base,
  className,
}: {
  code: string
  version: number
  base: string
  className?: string
}) {
  const url = imageUrl(base, symbolKey(code, version))
```

- [ ] **Step 2: `collection-sidebar.tsx`** — line ~39–40 already guards on `s.symbol`. Change the guard to `s.symbolVersion != null` and pass the version:

```tsx
                {s.symbolVersion != null && IMAGE_BASE
                  ? <SetSymbol code={s.code} version={s.symbolVersion} base={IMAGE_BASE} className="size-4" />
```

- [ ] **Step 3: `filter-sheet.tsx`** — line ~118–119:

```tsx
        {s.symbolVersion != null && IMAGE_BASE ? (
          <SetSymbol code={s.code} version={s.symbolVersion} base={IMAGE_BASE} className="h-4 w-4 shrink-0 text-foreground/80" />
```

- [ ] **Step 4: `admin-sets-table.tsx`** — line ~60–61:

```tsx
              {s.symbolVersion != null && imageBase ? (
                <SetSymbol code={s.code} version={s.symbolVersion} base={imageBase} className="h-5 w-5 text-foreground/80" />
```

- [ ] **Step 5: `set-card.tsx`** — line ~12–13:

```tsx
      {set.symbolVersion != null && imageBase ? (
        <SetSymbol code={set.code} version={set.symbolVersion} base={imageBase} className="h-10 w-10 text-foreground/80" />
```

- [ ] **Step 6: `set-symbol-uploader.tsx`** — it receives `hasSymbol` and renders `SetSymbol` at line ~118 for the current (server) symbol. Add a `symbolVersion` prop to the component and pass it through. Update the props type:

```ts
export function SetSymbolUploader({
  code,
  hasSymbol,
  symbolVersion,
  imageBase,
  // ...existing props
}: {
  code?: string
  hasSymbol?: boolean
  symbolVersion?: number | null
  imageBase?: string
  // ...existing prop types
}) {
```

  and the render (line ~117–118), which only runs when `hasSymbol` is true:

```tsx
        ) : hasSymbol && imageBase && symbolVersion != null ? (
          <SetSymbol code={code!} version={symbolVersion} base={imageBase} className="h-12 w-12 text-foreground/80" />
```

- [ ] **Step 7: `admin/sets/[code]/edit/page.tsx`** — the page passes `hasSymbol={!!set.symbol}`; switch to the version and pass it (line ~52):

```tsx
            <SetSymbolUploader code={set.code} hasSymbol={set.symbolVersion != null} symbolVersion={set.symbolVersion} imageBase={IMAGE_BASE} />
```

  (`set` here is a `SetForEdit`, which now exposes `symbolVersion` per Task 5.)

- [ ] **Step 8: Full web typecheck + lint + tests**

Run: `cd app && npm run typecheck -w web && npm run lint -w web && npm test -w web`
Expected: PASS. Fix any remaining fixtures that referenced `symbol`/`imageFile`.

- [ ] **Step 9: Full workspace verification**

Run: `cd app && npm run typecheck && npm test`
Expected: PASS across all workspaces.

- [ ] **Step 10: Commit**

```bash
git add app/web/src/components/set-symbol.tsx app/web/src/components/collection-sidebar.tsx app/web/src/components/filter-sheet.tsx app/web/src/components/admin-sets-table.tsx app/web/src/components/set-card.tsx app/web/src/components/set-symbol-uploader.tsx "app/web/src/app/[locale]/admin/sets/[code]/edit/page.tsx"
git commit -m "feat(web): pass symbol version through set-symbol render sites"
```

---

## Task 11: Rollout runbook

**Files:**
- Create: `docs/RUNBOOK-IMAGE-VERSIONING-ROLLOUT.md`

Existing MinIO objects are unversioned (`cards/{id}.webp`, `symbols/{code}.webp`), so after deploy the app requests versioned keys that 404 until ingest re-uploads. This task documents the operational steps; it ships no code.

- [ ] **Step 1: Write `docs/RUNBOOK-IMAGE-VERSIONING-ROLLOUT.md`**

```markdown
# Runbook: image-versioning rollout

After deploying the timestamped-image-names change, existing MinIO objects are
unversioned and will 404. Re-run ingest to repopulate versioned objects + DB
version columns + the search index, then purge the old objects.

## 1. Apply the migration
Runs automatically at ingest start (`runMigrations`), or via the compose tools
profile: `docker compose run --rm migrate`.

## 2. Re-run ingest (writes versioned objects, versions, reindex)
From the deployed ingest job / container, with DATABASE_URL, ASSETS_DIR,
MEILI_HOST, MEILI_MASTER_KEY, and the S3_* vars set:

    node dist/main.js   # or the container's normal entrypoint

Ingest uploads `cards/{id}.{mtime}.webp` (+ thumb/art-crop) and
`symbols/{code}.{mtime}.webp`, and writes image_version / art_crop_version /
symbol_version. `objectExists` diffing means a second run is a no-op.

## 3. Purge the old unversioned objects (optional cleanup)
Using the MinIO client (`mc`), remove objects whose stem has no numeric version
segment. Example — delete the legacy flat card/symbol objects:

    # DANGER: dry-run first. Match `cards/<stem>.webp` where <stem> has no `.<digits>` suffix.
    mc find myminio/images --regex 'cards/[^/]+\.webp$' --exec 'echo would-remove {}'
    # inspect output, then re-run replacing the echo with: mc rm {}

Versioned objects end in `.<digits>.webp` and are NOT matched by a plain
`.webp$` stem check only if you tighten the regex; verify against a sample
before deleting. When in doubt, leave the orphans — they are harmless.

## 4. Verify
- Open a card detail page; confirm the image loads from a `.<digits>.webp` URL.
- Response carries `Cache-Control: public, max-age=31536000, immutable`.
- Re-upload a card image in the editor; confirm the URL's version changes and
  the new image shows immediately (no hard refresh).
```

- [ ] **Step 2: Commit**

```bash
git add docs/RUNBOOK-IMAGE-VERSIONING-ROLLOUT.md
git commit -m "docs: rollout runbook for image versioning"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** key format (T1), DTO swaps (T2), Meili doc (T3), column swap/migration (T4), DB reads+setters+deck versions (T5), ingest mtime versions + versioned upload + immutable header + dropped provenance writes (T6), web upload/delete + cache header (T7), all render sites — card (T8), deck (T9), symbol (T10) — and rollout (T11). Every spec section maps to a task.
- **Existence signal:** `image_version != null` / `symbol_version != null` / `art_crop_version != null` replace the dropped `image_file` / `symbol` truthiness checks everywhere they were used.
- **Idempotency:** ingest versions come from file mtime; the DB version and the S3 key both derive from the same `fileVersion(...)` call, so they always agree.
- **Type consistency:** `imageVersion`, `symbolVersion`, `artCropVersion`, `starterArtCropVersion`, and `setSetSymbolVersion` are used with identical names/types across tasks.

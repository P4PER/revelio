# Deck Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Classic/Revival deck builder that works logged-out (build, validate, export/import — no save), lets logged-in users save named decks, manage them from a My Decks page, and export/import as text/JSON/PNG.

**Architecture:** A pure domain layer in `@revelio/core` (enums + DTOs, a legality engine, text/JSON serializers) is consumed by two new `@revelio/db` tables (`decks`, `deck_cards`) with CRUD queries, by `'use server'` deck actions in `web`, and by a two-pane "Workbench" builder UI whose card browser reuses the existing Meilisearch search. Guest decks live in `localStorage`; saved decks live in Postgres. Legality is always recomputed, never stored.

**Tech Stack:** TypeScript, Next.js 16 App Router + React 19, next-intl, Drizzle ORM (Postgres), Meilisearch, Zod, Better Auth, vitest, Testcontainers.

## Global Constraints

- All app commands run from `app/`. Workspaces: `core ← {search, db} ← {ingest, web}`; `core` has no I/O and may not import other workspaces.
- Migrations are **incremental and append-only**. To change the schema: edit `db/src/schema.ts`, run `npm run generate` from `app/db`, review the generated `drizzle/NNNN_*.sql`, commit schema + migration together. **Never** rm/regenerate `drizzle/` or `0000`. `npm run verify -w @revelio/db` (CI-enforced) fails if schema drifted from migrations.
- **GOTCHA (from prior migration work):** the `Write` tool has intermittently failed to persist files under `db/drizzle/`. After `npm run generate`, verify the `NNNN_*.sql` file and the `_journal.json` entry actually exist on disk (`ls db/drizzle`) before committing. Do **not** hand-edit `_journal.json`.
- Categoricals are `text` columns validated by **Zod enums** — no `pgEnum`. Zod enums shared across workspaces live in `core/src/schemas.ts`; DTO types live in `core/src/domain.ts` (zod-free).
- Server actions are `'use server'`, gate on auth, validate input with Zod, and never leak secrets to the client. Return a discriminated result (`{ ok: true } | { ok: false; error: string }`).
- ESM: intra-`core` test imports use `../src/x.js` (`.js` extension). Locale-aware links import `Link` from `@/../i18n/navigation`.
- Conventional Commits. Docs/prose in English. Run `npm run typecheck` and the relevant `npm test` before each commit.
- Card-pool filtering: **Classic** → `isOfficial = true`; **Revival** → all sets, `legality = 'banned'` cards blocked from being added.
- Deck rules: exactly 1 starting Character (type `character` + sub-type `witch`/`wizard`/`wizard_witch`); main deck exactly 60; sideboard ≤ 15; ≤ 4 copies per card across main+sideboard **except Lessons** (type `lesson`, unlimited).

---

## File Structure

**Create**
- `core/src/deck.ts` — deck domain: `DeckFormat`/`DeckVisibility`/`DeckZone` Zod enums, `DeckCardMeta`, `deckCardMeta()` helper, `STARTING_CHARACTER_SUBTYPES`.
- `core/src/deck-legality.ts` — `evaluateDeck()` + `Violation`/`DeckStatus` types.
- `core/src/deck-io.ts` — `toText()`, `toJson()`, `parseJson()`, `parseText()`.
- `core/test/deck-legality.test.ts`, `core/test/deck-io.test.ts`.
- `web/src/lib/deck-model.ts` — pure client deck reducer (add/remove/setQty/setFormat) + localStorage load/save.
- `web/src/lib/deck-actions.ts` — `'use server'` create/update/delete/duplicate.
- `web/src/lib/__tests__/deck-actions.test.ts`, `web/src/lib/__tests__/deck-model.test.ts`.
- `web/src/app/[locale]/decks/page.tsx` (My Decks), `web/src/app/[locale]/decks/new/page.tsx` (builder), `web/src/app/[locale]/decks/[id]/page.tsx` (edit).
- `web/src/components/deck-builder.tsx`, `deck-card-browser.tsx`, `deck-panel.tsx`, `legality-seal.tsx`, `lesson-curve.tsx`, `deck-export-menu.tsx`, `deck-import-dialog.tsx`, `deck-list.tsx`.
- `ingest/test/deck-write.test.ts` — DB query integration tests (Testcontainers).

**Modify**
- `core/src/schemas.ts` — re-export deck enums (or define here; see Task 1). `core/src/domain.ts` — `DeckDTO`, `DeckCardDTO`, `DeckCardView`. `core/src/index.ts` — export new modules.
- `db/src/schema.ts` — `decks`, `deckCards` tables. `db/src/index.ts` — export tables + query fns + `DeckWriteInput` type. `db/src/queries.ts` — deck queries.
- `web/src/components/account-menu.tsx` — add "My Decks" + "Deck Builder" links.
- `web/messages/en.json`, `web/messages/de.json` — `decks` namespace.

---

## Phase 1 — Core domain (pure, no I/O)

### Task 1: Deck enums, DTOs, and card-meta helper

**Files:**
- Create: `core/src/deck.ts`
- Modify: `core/src/domain.ts`, `core/src/schemas.ts`, `core/src/index.ts`
- Test: `core/test/deck.test.ts`

**Interfaces:**
- Produces:
  - `DeckFormat = z.enum(['classic','revival'])`, `DeckVisibility = z.enum(['private','public'])`, `DeckZone = z.enum(['character','main','sideboard'])` (values + `z.infer` types of the same name).
  - `STARTING_CHARACTER_SUBTYPES: readonly string[]` = `['witch','wizard','wizard_witch']`.
  - `type DeckCardMeta = { id: string; isOfficial: boolean; legality: string | null; isLesson: boolean; isStartingCharacter: boolean }`.
  - `deckCardMeta(c: { id: string; isOfficial: boolean; legality: string | null; types: string[]; subTypes: string[] }): DeckCardMeta`.
  - `type DeckCardDTO = { cardId: string; zone: DeckZone; quantity: number }`.
  - `type DeckDTO = { id: string; name: string; format: DeckFormat; visibility: DeckVisibility; cards: DeckCardDTO[]; createdAt: string; updatedAt: string }`.
  - `type DeckCardView = DeckCardDTO & { name: string; cost: number | null; setCode: string; lesson: string | null; isOfficial: boolean; legality: string | null; isLesson: boolean; isStartingCharacter: boolean }`.

- [ ] **Step 1: Write the failing test**

`core/test/deck.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { DeckFormat, DeckZone, deckCardMeta, STARTING_CHARACTER_SUBTYPES } from '../src/deck.js'

describe('deck enums', () => {
  it('accepts valid format and zone', () => {
    expect(DeckFormat.parse('revival')).toBe('revival')
    expect(DeckZone.parse('sideboard')).toBe('sideboard')
  })
  it('rejects unknown values', () => {
    expect(DeckFormat.safeParse('modern').success).toBe(false)
  })
})

describe('deckCardMeta', () => {
  const base = { id: 'bs-1', isOfficial: true, legality: 'legal' }
  it('flags a witch/wizard character as a starting character', () => {
    const m = deckCardMeta({ ...base, types: ['character'], subTypes: ['wizard', 'gryffindor'] })
    expect(m.isStartingCharacter).toBe(true)
    expect(m.isLesson).toBe(false)
  })
  it('does not flag a non-character wizard-subtype card', () => {
    const m = deckCardMeta({ ...base, types: ['creature'], subTypes: ['wizard'] })
    expect(m.isStartingCharacter).toBe(false)
  })
  it('flags a lesson card', () => {
    const m = deckCardMeta({ ...base, types: ['lesson'], subTypes: [] })
    expect(m.isLesson).toBe(true)
  })
  it('exposes the recognised starting-character subtypes', () => {
    expect(STARTING_CHARACTER_SUBTYPES).toContain('wizard_witch')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/core -- deck.test.ts`
Expected: FAIL — `Cannot find module '../src/deck.js'`.

- [ ] **Step 3: Write minimal implementation**

`core/src/deck.ts`:
```ts
import { z } from 'zod'

export const DeckFormat = z.enum(['classic', 'revival'])
export const DeckVisibility = z.enum(['private', 'public'])
export const DeckZone = z.enum(['character', 'main', 'sideboard'])
export type DeckFormat = z.infer<typeof DeckFormat>
export type DeckVisibility = z.infer<typeof DeckVisibility>
export type DeckZone = z.infer<typeof DeckZone>

// Slugified sub-type codes that qualify a `character` card as a starting character.
// Source strings 'Witch' / 'Wizard' / 'Wizard/Witch' slugify to these.
export const STARTING_CHARACTER_SUBTYPES = ['witch', 'wizard', 'wizard_witch'] as const

export type DeckCardMeta = {
  id: string
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
}

export function deckCardMeta(c: {
  id: string
  isOfficial: boolean
  legality: string | null
  types: string[]
  subTypes: string[]
}): DeckCardMeta {
  const isLesson = c.types.includes('lesson')
  const isStartingCharacter =
    c.types.includes('character') &&
    c.subTypes.some((s) => (STARTING_CHARACTER_SUBTYPES as readonly string[]).includes(s))
  return { id: c.id, isOfficial: c.isOfficial, legality: c.legality, isLesson, isStartingCharacter }
}
```

Add to `core/src/domain.ts` (after the existing imports section; it needs the enum types):
```ts
import type { DeckFormat, DeckVisibility, DeckZone } from './deck.js'

export type DeckCardDTO = { cardId: string; zone: DeckZone; quantity: number }

export type DeckDTO = {
  id: string
  name: string
  format: DeckFormat
  visibility: DeckVisibility
  cards: DeckCardDTO[]
  createdAt: string
  updatedAt: string
}

export type DeckCardView = DeckCardDTO & {
  name: string
  cost: number | null
  setCode: string
  lesson: string | null
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
}
```

Add to `core/src/schemas.ts` (single import surface for validators):
```ts
export { DeckFormat, DeckVisibility, DeckZone } from './deck.js'
```

Add to `core/src/index.ts`:
```ts
export * from './deck.js'
```
(Verify `domain.ts` is already re-exported by `index.ts`; if `index.ts` uses explicit exports, add the new type names there too.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @revelio/core -- deck.test.ts` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add app/core
git commit -m "feat(core): deck enums, DTOs, and card-meta helper"
```

---

### Task 2: Legality engine

**Files:**
- Create: `core/src/deck-legality.ts`
- Modify: `core/src/index.ts`
- Test: `core/test/deck-legality.test.ts`

**Interfaces:**
- Consumes: `DeckFormat`, `DeckCardMeta`, `DeckZone` from `./deck.js`.
- Produces:
  - `type DeckEntry = { cardId: string; zone: DeckZone; quantity: number }`
  - `type DeckStatus = 'legal' | 'incomplete' | 'illegal'`
  - `type Violation = { code: 'no_character' } | { code: 'multiple_characters' } | { code: 'invalid_character'; cardId: string } | { code: 'main_deck_size'; actual: number } | { code: 'sideboard_too_large'; actual: number } | { code: 'too_many_copies'; cardId: string; count: number } | { code: 'card_not_in_format'; cardId: string } | { code: 'banned_card'; cardId: string }`
  - `evaluateDeck(entries: DeckEntry[], format: DeckFormat, meta: Record<string, DeckCardMeta>): { status: DeckStatus; violations: Violation[] }`

- [ ] **Step 1: Write the failing test**

`core/test/deck-legality.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { evaluateDeck } from '../src/deck-legality.js'
import type { DeckCardMeta } from '../src/deck.js'

const meta = (over: Partial<DeckCardMeta> & { id: string }): DeckCardMeta => ({
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false, ...over,
})

// A helper that builds a legal 60-card deck: 1 char + 60 main (15 distinct × 4).
function legalDeck() {
  const m: Record<string, DeckCardMeta> = { HARRY: meta({ id: 'HARRY', isStartingCharacter: true }) }
  const entries = [{ cardId: 'HARRY', zone: 'character' as const, quantity: 1 }]
  for (let i = 0; i < 15; i++) {
    const id = `C${i}`
    m[id] = meta({ id })
    entries.push({ cardId: id, zone: 'main' as const, quantity: 4 })
  }
  return { entries, m }
}

describe('evaluateDeck', () => {
  it('legal: character + exactly 60 main + ≤4 copies', () => {
    const { entries, m } = legalDeck()
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('legal')
    expect(r.violations).toEqual([])
  })

  it('incomplete: no character, 59 cards', () => {
    const m = { A: meta({ id: 'A' }) }
    const r = evaluateDeck([{ cardId: 'A', zone: 'main', quantity: 59 }], 'revival', m)
    // 59 copies also trips the copy limit, so status is illegal; assert the incompleteness signals exist too.
    expect(r.violations).toContainEqual({ code: 'no_character' })
    expect(r.violations).toContainEqual({ code: 'main_deck_size', actual: 59 })
  })

  it('illegal: 5 copies of a non-lesson card', () => {
    const m = { A: meta({ id: 'A' }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'A', zone: 'main' as const, quantity: 5 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('illegal')
    expect(r.violations).toContainEqual({ code: 'too_many_copies', cardId: 'A', count: 5 })
  })

  it('lessons are exempt from the 4-copy limit', () => {
    const m = { L: meta({ id: 'L', isLesson: true }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'L', zone: 'main' as const, quantity: 60 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations.find((v) => v.code === 'too_many_copies')).toBeUndefined()
    expect(r.status).toBe('legal')
  })

  it('copies sum across main and sideboard', () => {
    const m = { A: meta({ id: 'A' }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'A', zone: 'main' as const, quantity: 3 },
      { cardId: 'A', zone: 'sideboard' as const, quantity: 2 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations).toContainEqual({ code: 'too_many_copies', cardId: 'A', count: 5 })
  })

  it('revival: banned card is illegal', () => {
    const { entries, m } = legalDeck()
    m.C0 = { ...m.C0, legality: 'banned' }
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('illegal')
    expect(r.violations).toContainEqual({ code: 'banned_card', cardId: 'C0' })
  })

  it('classic: non-official card is out of format; banned is ignored', () => {
    const { entries, m } = legalDeck()
    m.C0 = { ...m.C0, isOfficial: false, legality: 'banned' }
    const r = evaluateDeck(entries, 'classic', m)
    expect(r.violations).toContainEqual({ code: 'card_not_in_format', cardId: 'C0' })
    expect(r.violations.find((v) => v.code === 'banned_card')).toBeUndefined()
  })

  it('multiple characters, invalid character, oversize sideboard', () => {
    const m = {
      CH1: meta({ id: 'CH1', isStartingCharacter: true }),
      CH2: meta({ id: 'CH2', isStartingCharacter: true }),
      NOPE: meta({ id: 'NOPE', isStartingCharacter: false }),
      S: meta({ id: 'S' }),
    }
    const entries = [
      { cardId: 'CH1', zone: 'character' as const, quantity: 1 },
      { cardId: 'CH2', zone: 'character' as const, quantity: 1 },
      { cardId: 'S', zone: 'sideboard' as const, quantity: 16 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations).toContainEqual({ code: 'multiple_characters' })
    expect(r.violations).toContainEqual({ code: 'sideboard_too_large', actual: 16 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/core -- deck-legality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`core/src/deck-legality.ts`:
```ts
import type { DeckFormat, DeckCardMeta, DeckZone } from './deck.js'

export type DeckEntry = { cardId: string; zone: DeckZone; quantity: number }
export type DeckStatus = 'legal' | 'incomplete' | 'illegal'

export type Violation =
  | { code: 'no_character' }
  | { code: 'multiple_characters' }
  | { code: 'invalid_character'; cardId: string }
  | { code: 'main_deck_size'; actual: number }
  | { code: 'sideboard_too_large'; actual: number }
  | { code: 'too_many_copies'; cardId: string; count: number }
  | { code: 'card_not_in_format'; cardId: string }
  | { code: 'banned_card'; cardId: string }

const HARD: ReadonlySet<Violation['code']> = new Set([
  'multiple_characters', 'invalid_character', 'sideboard_too_large',
  'too_many_copies', 'card_not_in_format', 'banned_card',
])

export function evaluateDeck(
  entries: DeckEntry[],
  format: DeckFormat,
  meta: Record<string, DeckCardMeta>,
): { status: DeckStatus; violations: Violation[] } {
  const violations: Violation[] = []

  const chars = entries.filter((e) => e.zone === 'character')
  if (chars.length === 0) violations.push({ code: 'no_character' })
  if (chars.length > 1) violations.push({ code: 'multiple_characters' })
  for (const c of chars) {
    if (!meta[c.cardId]?.isStartingCharacter) violations.push({ code: 'invalid_character', cardId: c.cardId })
  }

  const mainCount = entries.filter((e) => e.zone === 'main').reduce((n, e) => n + e.quantity, 0)
  if (mainCount !== 60) violations.push({ code: 'main_deck_size', actual: mainCount })

  const sideCount = entries.filter((e) => e.zone === 'sideboard').reduce((n, e) => n + e.quantity, 0)
  if (sideCount > 15) violations.push({ code: 'sideboard_too_large', actual: sideCount })

  // Copy limit: sum main + sideboard per card; lessons exempt.
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.zone === 'character') continue
    counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.quantity)
  }
  for (const [cardId, count] of counts) {
    if (count > 4 && !meta[cardId]?.isLesson) violations.push({ code: 'too_many_copies', cardId, count })
  }

  // Format legality per distinct card in any zone.
  for (const cardId of new Set(entries.map((e) => e.cardId))) {
    const m = meta[cardId]
    if (!m) continue
    if (format === 'classic' && !m.isOfficial) violations.push({ code: 'card_not_in_format', cardId })
    if (format === 'revival' && m.legality === 'banned') violations.push({ code: 'banned_card', cardId })
  }

  const hasHard = violations.some((v) => HARD.has(v.code))
  const status: DeckStatus = hasHard ? 'illegal' : violations.length > 0 ? 'incomplete' : 'legal'
  return { status, violations }
}
```

Add to `core/src/index.ts`:
```ts
export * from './deck-legality.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @revelio/core -- deck-legality.test.ts` → PASS. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add app/core
git commit -m "feat(core): deck legality engine"
```

---

### Task 3: Deck export/import serializers

**Files:**
- Create: `core/src/deck-io.ts`
- Modify: `core/src/index.ts`
- Test: `core/test/deck-io.test.ts`

**Interfaces:**
- Consumes: `DeckDTO`, `DeckCardView` from `./domain.js`; `DeckFormat`, `DeckZone` from `./deck.js`.
- Produces:
  - `type DeckJson = { name: string; format: DeckFormat; character: string | null; main: { cardId: string; quantity: number }[]; sideboard: { cardId: string; quantity: number }[] }`
  - `toJson(deck: DeckDTO): DeckJson`
  - `parseJson(raw: unknown): DeckJson` (throws `Error` on invalid shape — validated with Zod)
  - `toText(deck: { name: string; format: DeckFormat }, views: DeckCardView[]): string`
  - `type ParsedTextLine = { quantity: number; name: string; setCode: string | null }`
  - `parseText(text: string): { lines: ParsedTextLine[]; unparsed: string[] }`

- [ ] **Step 1: Write the failing test**

`core/test/deck-io.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toJson, parseJson, toText, parseText } from '../src/deck-io.js'
import type { DeckDTO, DeckCardView } from '../src/domain.js'

const deck: DeckDTO = {
  id: 'd1', name: 'Charms Aggro', format: 'revival', visibility: 'private',
  createdAt: '', updatedAt: '',
  cards: [
    { cardId: 'HARRY', zone: 'character', quantity: 1 },
    { cardId: 'da-accio', zone: 'main', quantity: 4 },
    { cardId: 'bs-lumos', zone: 'sideboard', quantity: 2 },
  ],
}

describe('json round-trip', () => {
  it('exports then re-parses to the same shape', () => {
    const json = toJson(deck)
    expect(json).toEqual({
      name: 'Charms Aggro', format: 'revival', character: 'HARRY',
      main: [{ cardId: 'da-accio', quantity: 4 }],
      sideboard: [{ cardId: 'bs-lumos', quantity: 2 }],
    })
    expect(parseJson(JSON.parse(JSON.stringify(json)))).toEqual(json)
  })
  it('rejects malformed json', () => {
    expect(() => parseJson({ name: 'x' })).toThrow()
    expect(() => parseJson({ name: 'x', format: 'modern', character: null, main: [], sideboard: [] })).toThrow()
  })
})

describe('text export', () => {
  it('groups by zone with a header and counts', () => {
    const views: DeckCardView[] = [
      { cardId: 'HARRY', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, setCode: 'BS', lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true },
      { cardId: 'da-accio', zone: 'main', quantity: 4, name: 'Accio', cost: 2, setCode: 'DA', lesson: 'charms', isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false },
    ]
    const text = toText({ name: 'Charms Aggro', format: 'revival' }, views)
    expect(text).toContain('# Charms Aggro (Revival)')
    expect(text).toContain('Character: 1x Harry Potter (BS)')
    expect(text).toContain('4x Accio (DA)')
  })
})

describe('text import', () => {
  it('parses "4x Accio (DA)" and "4 Accio"', () => {
    const { lines, unparsed } = parseText('4x Accio (DA)\n4 Accio\n\n# comment')
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: 'DA' })
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: null })
    expect(unparsed).toEqual([])
  })
  it('collects unparseable lines', () => {
    const { lines, unparsed } = parseText('gibberish without a count')
    expect(lines).toEqual([])
    expect(unparsed).toEqual(['gibberish without a count'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/core -- deck-io.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

`core/src/deck-io.ts`:
```ts
import { z } from 'zod'
import { DeckFormat } from './deck.js'
import type { DeckDTO, DeckCardView } from './domain.js'

const qtySchema = z.object({ cardId: z.string(), quantity: z.number().int().positive() })
const deckJsonSchema = z.object({
  name: z.string(),
  format: DeckFormat,
  character: z.string().nullable(),
  main: z.array(qtySchema),
  sideboard: z.array(qtySchema),
})
export type DeckJson = z.infer<typeof deckJsonSchema>

export function toJson(deck: DeckDTO): DeckJson {
  const pick = (zone: 'main' | 'sideboard') =>
    deck.cards.filter((c) => c.zone === zone).map((c) => ({ cardId: c.cardId, quantity: c.quantity }))
  return {
    name: deck.name,
    format: deck.format,
    character: deck.cards.find((c) => c.zone === 'character')?.cardId ?? null,
    main: pick('main'),
    sideboard: pick('sideboard'),
  }
}

export function parseJson(raw: unknown): DeckJson {
  return deckJsonSchema.parse(raw)
}

const FORMAT_LABEL: Record<DeckJson['format'], string> = { classic: 'Classic', revival: 'Revival' }

export function toText(deck: { name: string; format: DeckJson['format'] }, views: DeckCardView[]): string {
  const line = (v: DeckCardView) => `${v.quantity}x ${v.name} (${v.setCode})`
  const out: string[] = [`# ${deck.name} (${FORMAT_LABEL[deck.format]})`, '']
  const char = views.find((v) => v.zone === 'character')
  if (char) out.push(`Character: ${line(char)}`, '')
  const main = views.filter((v) => v.zone === 'main')
  if (main.length) { out.push(`Main deck (${main.reduce((n, v) => n + v.quantity, 0)})`); main.forEach((v) => out.push(line(v))); out.push('') }
  const side = views.filter((v) => v.zone === 'sideboard')
  if (side.length) { out.push(`Sideboard (${side.reduce((n, v) => n + v.quantity, 0)})`); side.forEach((v) => out.push(line(v))) }
  return out.join('\n').trimEnd() + '\n'
}

export type ParsedTextLine = { quantity: number; name: string; setCode: string | null }

// Matches "4x Name (SET)", "4 Name", "4x Name". Ignores blank lines, comments, and section headers.
const LINE_RE = /^\s*(\d+)\s*x?\s+(.+?)\s*(?:\(([A-Za-z0-9]+)\)\s*)?$/

export function parseText(text: string): { lines: ParsedTextLine[]; unparsed: string[] } {
  const lines: ParsedTextLine[] = []
  const unparsed: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    if (/^(character|main deck|sideboard)\b/i.test(t) && !/\d/.test(t.split(/\s+/)[0])) continue
    const stripped = t.replace(/^character:\s*/i, '')
    const m = LINE_RE.exec(stripped)
    if (!m) { unparsed.push(raw); continue }
    lines.push({ quantity: Number(m[1]), name: m[2].trim(), setCode: m[3] ? m[3].toUpperCase() : null })
  }
  return { lines, unparsed }
}
```

Add to `core/src/index.ts`:
```ts
export * from './deck-io.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @revelio/core -- deck-io.test.ts` → PASS. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add app/core
git commit -m "feat(core): deck text/JSON export and import serializers"
```

---

## Phase 2 — Database

### Task 4: `decks` and `deck_cards` tables + migration

**Files:**
- Modify: `db/src/schema.ts`, `db/src/index.ts`
- Create (generated): `db/drizzle/NNNN_*.sql` + `db/drizzle/meta/*` (via `npm run generate`)

**Interfaces:**
- Produces: `decks`, `deckCards` Drizzle tables exported from `@revelio/db`.

- [ ] **Step 1: Add the tables to the schema**

In `db/src/schema.ts`, import `user` and add under `--- core tables ---`. At the top, extend the auth import:
```ts
import { user } from './auth-schema'
```
Then append (after `setLocalizations`):
```ts
export const decks = pgTable('decks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  visibility: text('visibility').notNull().default('private'),
  ...editable,
}, (t) => ({ byUser: index('decks_user_id_idx').on(t.userId) }))

export const deckCards = pgTable('deck_cards', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  zone: text('zone').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.deckId, t.cardId, t.zone] }) }))
```

- [ ] **Step 2: Generate the migration**

Run from `app/db`:
```bash
npm run generate
```
Then **verify on disk** (see Global Constraints GOTCHA):
```bash
ls db/drizzle | tail -3          # a new NNNN_*.sql must be present
```
Expected: a new `NNNN_<name>.sql` containing `CREATE TABLE "decks"` and `CREATE TABLE "deck_cards"` with the two FKs and the composite PK. Open it and confirm it is additive only (no DROP/ALTER of existing tables).

- [ ] **Step 3: Export the tables**

In `db/src/index.ts`, add `decks, deckCards` to the `from './schema'` export list.

- [ ] **Step 4: Verify schema/migration consistency**

Run from `app`:
```bash
npm run check -w @revelio/db
npm run verify -w @revelio/db
npm run typecheck
```
Expected: check passes; verify reports no drift (schema matches migrations); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add app/db/src/schema.ts app/db/src/index.ts app/db/drizzle
git commit -m "feat(db): decks and deck_cards tables"
```

---

### Task 5: Deck queries

**Files:**
- Modify: `db/src/queries.ts`, `db/src/index.ts`
- Test: `ingest/test/deck-write.test.ts`

**Interfaces:**
- Consumes: `DB` from `./client`; `decks`, `deckCards`, `cards`, `cardTypes`, `cardSubTypes` from `./schema`; `DeckDTO`, `DeckCardView`, `DeckFormat`, `DeckVisibility` from `@revelio/core`.
- Produces (exported from `@revelio/db`):
  - `type DeckWriteInput = { name: string; format: DeckFormat; visibility: DeckVisibility; cards: { cardId: string; zone: string; quantity: number }[] }`
  - `type DeckSummary = { id: string; name: string; format: DeckFormat; visibility: DeckVisibility; cardCount: number; updatedAt: string }`
  - `listDecksByUser(db: DB, userId: string): Promise<DeckSummary[]>`
  - `getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null>`
  - `createDeck(db: DB, userId: string, input: DeckWriteInput): Promise<string>` (returns new deck id)
  - `updateDeck(db: DB, id: string, input: DeckWriteInput): Promise<void>` (replaces name/format/visibility + all card rows)
  - `deleteDeck(db: DB, id: string): Promise<void>`
  - `resolveCardsByName(db: DB, names: { name: string; setCode: string | null }[]): Promise<Record<string, string | null>>` (maps `name|setCode` key → cardId or null)

- [ ] **Step 1: Write the failing test**

`ingest/test/deck-write.test.ts` (mirrors `set-write.test.ts` structure):
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  createDeck, getDeck, listDecksByUser, updateDeck, deleteDeck,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  // Seed a user, a set, and two cards the deck can reference.
  await ctx.db.insert(user).values({ id: 'u1', name: 'Tester', email: 't@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values({ code: 'BS', name: 'Base', isOfficial: true, cardCount: 2 })
  await ctx.db.insert(cards).values([
    { id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry Potter', defaultLanguage: 'en' },
    { id: 'bs-accio', setCode: 'BS', number: '2', name: 'Accio', defaultLanguage: 'en' },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('deck queries', () => {
  it('creates, reads, lists, updates and deletes a deck', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'My Deck', format: 'revival', visibility: 'private',
      cards: [
        { cardId: 'bs-harry', zone: 'character', quantity: 1 },
        { cardId: 'bs-accio', zone: 'main', quantity: 4 },
      ],
    })
    expect(id).toBeTruthy()

    const got = await getDeck(ctx.db, id)
    expect(got?.userId).toBe('u1')
    expect(got?.deck.name).toBe('My Deck')
    expect(got?.deck.cards).toHaveLength(2)
    expect(got?.views.find((v) => v.cardId === 'bs-accio')?.name).toBe('Accio')

    const list = await listDecksByUser(ctx.db, 'u1')
    expect(list).toHaveLength(1)
    expect(list[0].cardCount).toBe(5) // 1 char + 4 main

    await updateDeck(ctx.db, id, {
      name: 'Renamed', format: 'classic', visibility: 'public',
      cards: [{ cardId: 'bs-harry', zone: 'character', quantity: 1 }],
    })
    const after = await getDeck(ctx.db, id)
    expect(after?.deck.name).toBe('Renamed')
    expect(after?.deck.format).toBe('classic')
    expect(after?.deck.cards).toHaveLength(1)

    await deleteDeck(ctx.db, id)
    expect(await getDeck(ctx.db, id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (Docker required): `npm test -w @revelio/ingest -- deck-write.test.ts`
Expected: FAIL — `createDeck` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `db/src/queries.ts`. Extend the top imports to include `decks, deckCards` and (for views) `cardTypes, cardSubTypes`, plus `DeckDTO, DeckCardView, DeckFormat, DeckVisibility, deckCardMeta` from `@revelio/core`. Note `randomUUID` is already imported.

```ts
export type DeckWriteInput = {
  name: string
  format: DeckFormat
  visibility: DeckVisibility
  cards: { cardId: string; zone: string; quantity: number }[]
}
export type DeckSummary = {
  id: string; name: string; format: DeckFormat; visibility: DeckVisibility
  cardCount: number; updatedAt: string
}

export async function listDecksByUser(db: DB, userId: string): Promise<DeckSummary[]> {
  const rows = await db.select().from(decks).where(eq(decks.userId, userId)).orderBy(desc(decks.updatedAt))
  if (rows.length === 0) return []
  const counts = await db
    .select({ deckId: deckCards.deckId, total: sql<number>`sum(${deckCards.quantity})::int` })
    .from(deckCards)
    .where(inArray(deckCards.deckId, rows.map((r) => r.id)))
    .groupBy(deckCards.deckId)
  const byDeck = new Map(counts.map((c) => [c.deckId, c.total]))
  return rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat, visibility: r.visibility as DeckVisibility,
    cardCount: byDeck.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null> {
  const [row] = await db.select().from(decks).where(eq(decks.id, id)).limit(1)
  if (!row) return null
  const dcs = await db.select().from(deckCards).where(eq(deckCards.deckId, id))
  const ids = dcs.map((d) => d.cardId)
  const cardRows = ids.length ? await db.select().from(cards).where(inArray(cards.id, ids)) : []
  const typeRows = ids.length ? await db.select().from(cardTypes).where(inArray(cardTypes.cardId, ids)) : []
  const subRows = ids.length ? await db.select().from(cardSubTypes).where(inArray(cardSubTypes.cardId, ids)) : []
  const byId = new Map(cardRows.map((c) => [c.id, c]))
  const typesById = groupCodes(typeRows, (r) => r.cardId, (r) => r.typeCode)
  const subsById = groupCodes(subRows, (r) => r.cardId, (r) => r.subTypeCode)

  const views: DeckCardView[] = dcs.map((d) => {
    const c = byId.get(d.cardId)
    const m = deckCardMeta({
      id: d.cardId, isOfficial: c?.isOfficial ?? false, legality: c?.legality ?? null,
      types: typesById.get(d.cardId) ?? [], subTypes: subsById.get(d.cardId) ?? [],
    })
    return {
      cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity,
      name: c?.name ?? d.cardId, cost: c?.cost ?? null, setCode: c?.setCode ?? '',
      lesson: c?.lesson ?? null, isOfficial: m.isOfficial, legality: m.legality,
      isLesson: m.isLesson, isStartingCharacter: m.isStartingCharacter,
    }
  })
  const deck: DeckDTO = {
    id: row.id, name: row.name, format: row.format as DeckFormat,
    visibility: row.visibility as DeckVisibility,
    cards: dcs.map((d) => ({ cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity })),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
  return { deck, userId: row.userId, views }
}

// Small helper: group junction rows into a code[] per parent id.
function groupCodes<T>(rows: T[], key: (r: T) => string, code: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) { const k = key(r); const arr = m.get(k) ?? []; arr.push(code(r)); m.set(k, arr) }
  return m
}

async function replaceDeckCards(db: DB, id: string, cardsIn: DeckWriteInput['cards']): Promise<void> {
  await db.delete(deckCards).where(eq(deckCards.deckId, id))
  if (cardsIn.length) {
    await db.insert(deckCards).values(cardsIn.map((c) => ({ deckId: id, cardId: c.cardId, zone: c.zone, quantity: c.quantity })))
  }
}

export async function createDeck(db: DB, userId: string, input: DeckWriteInput): Promise<string> {
  const id = randomUUID()
  await db.insert(decks).values({ id, userId, name: input.name, format: input.format, visibility: input.visibility })
  await replaceDeckCards(db, id, input.cards)
  return id
}

export async function updateDeck(db: DB, id: string, input: DeckWriteInput): Promise<void> {
  await db.update(decks).set({
    name: input.name, format: input.format, visibility: input.visibility, updatedAt: new Date(),
  }).where(eq(decks.id, id))
  await replaceDeckCards(db, id, input.cards)
}

export async function deleteDeck(db: DB, id: string): Promise<void> {
  await db.delete(decks).where(eq(decks.id, id))
}

export async function resolveCardsByName(
  db: DB, names: { name: string; setCode: string | null }[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const n of names) {
    const key = `${n.name.toLowerCase()}|${n.setCode ?? ''}`
    if (key in out) continue
    const where = n.setCode
      ? and(sql`lower(${cards.name}) = ${n.name.toLowerCase()}`, eq(cards.setCode, n.setCode))
      : sql`lower(${cards.name}) = ${n.name.toLowerCase()}`
    const rows = await db.select({ id: cards.id }).from(cards).where(where).limit(2)
    out[key] = rows.length === 1 ? rows[0].id : null // ambiguous (>1) or missing (0) → null
  }
  return out
}
```
Add `desc` to the `drizzle-orm` import at the top of `queries.ts` (`import { eq, asc, desc, sql, inArray, and, isNotNull } from 'drizzle-orm'`).

In `db/src/index.ts`, add to the queries export line: `listDecksByUser, getDeck, createDeck, updateDeck, deleteDeck, resolveCardsByName` and to the type export line: `DeckWriteInput, DeckSummary`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @revelio/ingest -- deck-write.test.ts` → PASS. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/deck-write.test.ts
git commit -m "feat(db): deck CRUD queries + name resolution"
```

---

## Phase 3 — Server actions

### Task 6: Deck server actions

**Files:**
- Create: `web/src/lib/deck-actions.ts`, `web/src/lib/__tests__/deck-actions.test.ts`

**Interfaces:**
- Consumes: `getSession` from `@/lib/session`; `getDb` from `@/lib/db`; `createDeck, updateDeck, deleteDeck, getDeck` from `@revelio/db`; `DeckFormat, DeckVisibility, DeckZone` from `@revelio/core`.
- Produces:
  - `type DeckActionResult = { ok: true; id: string } | { ok: false; error: string }`
  - `createDeckAction(input: unknown): Promise<DeckActionResult>`
  - `updateDeckAction(id: string, input: unknown): Promise<DeckActionResult>`
  - `deleteDeckAction(id: string): Promise<DeckActionResult>`
  - `duplicateDeckAction(id: string): Promise<DeckActionResult>`

- [ ] **Step 1: Write the failing test**

`web/src/lib/__tests__/deck-actions.test.ts` — follow the mocking style of `set-actions.test.ts` (mock `@/lib/session`, `@/lib/db`, `@revelio/db`). Cover: (a) create rejects when logged out, (b) create passes the session user id through, (c) update/delete reject when the deck belongs to another user.
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const session = { user: { id: 'u1' } }
vi.mock('@/lib/session', () => ({ getSession: vi.fn(async () => session) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
const db = {
  createDeck: vi.fn(async () => 'new-id'),
  updateDeck: vi.fn(async () => {}),
  deleteDeck: vi.fn(async () => {}),
  getDeck: vi.fn(async () => ({ userId: 'u1', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } })),
}
vi.mock('@revelio/db', () => db)

import { createDeckAction, updateDeckAction, deleteDeckAction } from '../deck-actions'
import { getSession } from '@/lib/session'

const validInput = { name: 'D', format: 'revival', visibility: 'private', cards: [{ cardId: 'x', zone: 'main', quantity: 4 }] }

beforeEach(() => vi.clearAllMocks())

it('rejects create when logged out', async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null as never)
  expect(await createDeckAction(validInput)).toEqual({ ok: false, error: 'auth' })
})

it('creates with the session user id', async () => {
  const r = await createDeckAction(validInput)
  expect(r).toEqual({ ok: true, id: 'new-id' })
  expect(db.createDeck).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ name: 'D' }))
})

it('rejects invalid input', async () => {
  expect(await createDeckAction({ name: '', format: 'nope', cards: [] })).toEqual({ ok: false, error: 'invalid' })
})

it('rejects update on a deck owned by someone else', async () => {
  db.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await updateDeckAction('d1', validInput)).toEqual({ ok: false, error: 'forbidden' })
  expect(db.updateDeck).not.toHaveBeenCalled()
})

it('rejects delete on a deck owned by someone else', async () => {
  db.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await deleteDeckAction('d1')).toEqual({ ok: false, error: 'forbidden' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- deck-actions.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

`web/src/lib/deck-actions.ts`:
```ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { DeckFormat, DeckVisibility, DeckZone } from '@revelio/core'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { createDeck, updateDeck, deleteDeck, getDeck } from '@revelio/db'

export type DeckActionResult = { ok: true; id: string } | { ok: false; error: string }

const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  format: DeckFormat,
  visibility: DeckVisibility,
  cards: z.array(z.object({
    cardId: z.string().min(1),
    zone: DeckZone,
    quantity: z.number().int().positive(),
  })),
})

async function requireUserId(): Promise<string | null> {
  const s = await getSession()
  return s?.user?.id ?? null
}

export async function createDeckAction(input: unknown): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const id = await createDeck(getDb(), userId, parsed.data)
  revalidatePath('/decks')
  return { ok: true, id }
}

export async function updateDeckAction(id: string, input: unknown): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  await updateDeck(getDb(), id, parsed.data)
  revalidatePath('/decks')
  revalidatePath(`/decks/${id}`)
  return { ok: true, id }
}

export async function deleteDeckAction(id: string): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  await deleteDeck(getDb(), id)
  revalidatePath('/decks')
  return { ok: true, id }
}

export async function duplicateDeckAction(id: string): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  const { deck } = existing
  const newId = await createDeck(getDb(), userId, {
    name: `${deck.name} (copy)`, format: deck.format, visibility: deck.visibility, cards: deck.cards,
  })
  revalidatePath('/decks')
  return { ok: true, id: newId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- deck-actions.test.ts` → PASS. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/deck-actions.ts app/web/src/lib/__tests__/deck-actions.test.ts
git commit -m "feat(web): deck server actions with ownership guards"
```

---

## Phase 4 — Builder client + browse

### Task 7: Pure client deck model (reducer + localStorage)

**Files:**
- Create: `web/src/lib/deck-model.ts`, `web/src/lib/__tests__/deck-model.test.ts`

**Interfaces:**
- Consumes: `DeckFormat, DeckZone, DeckCardMeta, evaluateDeck, DeckCardView` from `@revelio/core`.
- Produces:
  - `type BuilderState = { name: string; format: DeckFormat; visibility: 'private' | 'public'; entries: DeckCardView[] }`
  - `emptyDeck(): BuilderState`
  - `addCard(state, view: Omit<DeckCardView,'zone'|'quantity'>, zone: DeckZone): BuilderState` — increments quantity; **refuses the 5th copy** of a non-lesson card (returns state unchanged + no throw); a `character` zone add replaces any existing character.
  - `setQuantity(state, cardId, zone, qty): BuilderState`
  - `removeCard(state, cardId, zone): BuilderState`
  - `setFormat(state, format): BuilderState`
  - `copyLimitReached(state, cardId, isLesson): boolean`
  - `loadDraft(): BuilderState | null`, `saveDraft(state): void`, `clearDraft(): void` (localStorage key `revelio.deck.draft`; guard `typeof window`).

- [ ] **Step 1: Write the failing test**

`web/src/lib/__tests__/deck-model.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { emptyDeck, addCard, copyLimitReached, setFormat } from '../deck-model'

const view = (id: string, over: Partial<Parameters<typeof addCard>[1]> = {}) => ({
  cardId: id, name: id, cost: 1, setCode: 'BS', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false, ...over,
})

describe('deck model', () => {
  it('adds and stacks copies', () => {
    let s = emptyDeck()
    s = addCard(s, view('accio'), 'main')
    s = addCard(s, view('accio'), 'main')
    expect(s.entries.find((e) => e.cardId === 'accio')?.quantity).toBe(2)
  })
  it('refuses the 5th copy of a non-lesson card', () => {
    let s = emptyDeck()
    for (let i = 0; i < 6; i++) s = addCard(s, view('accio'), 'main')
    expect(s.entries.find((e) => e.cardId === 'accio')?.quantity).toBe(4)
    expect(copyLimitReached(s, 'accio', false)).toBe(true)
  })
  it('allows unlimited lessons', () => {
    let s = emptyDeck()
    for (let i = 0; i < 9; i++) s = addCard(s, view('lesson', { isLesson: true }), 'main')
    expect(s.entries.find((e) => e.cardId === 'lesson')?.quantity).toBe(9)
  })
  it('replaces the starting character', () => {
    let s = emptyDeck()
    s = addCard(s, view('harry', { isStartingCharacter: true }), 'character')
    s = addCard(s, view('ron', { isStartingCharacter: true }), 'character')
    expect(s.entries.filter((e) => e.zone === 'character')).toHaveLength(1)
    expect(s.entries.find((e) => e.zone === 'character')?.cardId).toBe('ron')
  })
  it('setFormat changes the format', () => {
    expect(setFormat(emptyDeck(), 'classic').format).toBe('classic')
  })
})
```

- [ ] **Step 2: Run to verify it fails.** `npm test -w web -- deck-model.test.ts` → FAIL.

- [ ] **Step 3: Implement `web/src/lib/deck-model.ts`.** Pure functions over `BuilderState`; the copy-limit check sums main+sideboard quantities per card and blocks a non-lesson add at 4. `character` adds drop any existing character entry first. localStorage helpers guard `typeof window === 'undefined'`. (Full code follows the interface above; keep every function pure and return new arrays.)

```ts
import type { DeckFormat, DeckZone, DeckCardView } from '@revelio/core'

export type BuilderState = {
  name: string; format: DeckFormat; visibility: 'private' | 'public'; entries: DeckCardView[]
}
const KEY = 'revelio.deck.draft'

export function emptyDeck(): BuilderState {
  return { name: '', format: 'revival', visibility: 'private', entries: [] }
}

function copies(entries: DeckCardView[], cardId: string): number {
  return entries.filter((e) => e.cardId === cardId && e.zone !== 'character').reduce((n, e) => n + e.quantity, 0)
}
export function copyLimitReached(s: BuilderState, cardId: string, isLesson: boolean): boolean {
  return !isLesson && copies(s.entries, cardId) >= 4
}

export function addCard(s: BuilderState, view: Omit<DeckCardView, 'zone' | 'quantity'>, zone: DeckZone): BuilderState {
  if (zone === 'character') {
    const entries = s.entries.filter((e) => e.zone !== 'character')
    return { ...s, entries: [...entries, { ...view, zone, quantity: 1 }] }
  }
  if (copyLimitReached(s, view.cardId, view.isLesson)) return s
  const idx = s.entries.findIndex((e) => e.cardId === view.cardId && e.zone === zone)
  const entries = [...s.entries]
  if (idx >= 0) entries[idx] = { ...entries[idx], quantity: entries[idx].quantity + 1 }
  else entries.push({ ...view, zone, quantity: 1 })
  return { ...s, entries }
}

export function setQuantity(s: BuilderState, cardId: string, zone: DeckZone, qty: number): BuilderState {
  if (qty <= 0) return removeCard(s, cardId, zone)
  return { ...s, entries: s.entries.map((e) => (e.cardId === cardId && e.zone === zone ? { ...e, quantity: qty } : e)) }
}
export function removeCard(s: BuilderState, cardId: string, zone: DeckZone): BuilderState {
  return { ...s, entries: s.entries.filter((e) => !(e.cardId === cardId && e.zone === zone)) }
}
export function setFormat(s: BuilderState, format: DeckFormat): BuilderState { return { ...s, format } }

export function loadDraft(): BuilderState | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as BuilderState } catch { return null }
}
export function saveDraft(s: BuilderState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(s))
}
export function clearDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY)
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -w web -- deck-model.test.ts` → PASS. `npm run typecheck`.

- [ ] **Step 5: Commit.**
```bash
git add app/web/src/lib/deck-model.ts app/web/src/lib/__tests__/deck-model.test.ts
git commit -m "feat(web): pure deck builder model with copy-limit + draft persistence"
```

---

### Task 8: Builder components + `/decks/new` route

**Files:**
- Create: `web/src/components/legality-seal.tsx`, `lesson-curve.tsx`, `deck-card-browser.tsx`, `deck-panel.tsx`, `deck-builder.tsx`
- Create: `web/src/app/[locale]/decks/new/page.tsx`
- Modify: `web/messages/en.json`, `web/messages/de.json` (add `decks` namespace)

**Interfaces:**
- Consumes: `BuilderState` + model fns from `@/lib/deck-model`; `evaluateDeck`, `deckCardMeta`, `DeckCardView` from `@revelio/core`; `getSearchClient`, `runSearch` from `@/lib/search-client` (server) — see data flow below.
- Produces: `<DeckBuilder initial={BuilderState} deckId={string | null} loggedIn={boolean} sets={SetDTO[]} imageBase={string} />` (client component).

**Data flow:** `deck-card-browser.tsx` is a **client** component that fetches search results by calling a thin server action or route handler wrapping `runSearch`, passing `filters.isOfficial=true` when `format === 'classic'` and always sending the query/lesson/cost filters. Reuse the existing `SearchDocument` shape. Simplest wiring that matches the codebase: add a `searchDeckCards(state)` server action in `web/src/lib/deck-actions.ts` that calls `runSearch` and returns `SearchResult`; the browser calls it on query/filter/format change (debounced). Banned cards (Revival) render greyed with a "Banned" flag and their add button disabled.

- [ ] **Step 1:** Build `legality-seal.tsx` — a presentational client component taking `{ status, mainCount, violations }` and rendering the conic-gradient gauge + status pill from the approved mockup (tokens: `--primary`, `--muted`, semantic ok/warn/bad). Snapshot/RTL test: renders `60 / 60` and status text for each of the three states.

- [ ] **Step 2:** Build `lesson-curve.tsx` — takes the deck's main-zone `DeckCardView[]`, buckets by `cost` (0,1,2,3,4,5+), renders bars. Pure render; small RTL test asserting bar count.

- [ ] **Step 3:** Build `deck-panel.tsx` — takes `entries`, groups main by `lesson` (fallback by type for less/items), shows character slot, main groups with quantity steppers (`setQuantity`/`removeCard`), and sideboard. Emits change callbacks up to `deck-builder.tsx`.

- [ ] **Step 4:** Build `deck-card-browser.tsx` — search box + lesson/cost/set filter chips + result grid of card tiles with hover "+ Add". Calls the `searchDeckCards` action; converts each `SearchDocument` to the `Omit<DeckCardView,'zone'|'quantity'>` shape via `deckCardMeta(...)` + name/cost/setCode/lesson; disables add when `copyLimitReached` or (Revival) `legality==='banned'`.

- [ ] **Step 5:** Build `deck-builder.tsx` — owns `BuilderState` via `useState`, wires the command bar (editable name, format toggle calling `setFormat`, `LegalitySeal` fed by `evaluateDeck(entries → DeckEntry[], format, metaMap)`, Save button, Export/Import placeholders that Task 13 fills). On every state change, if `!deckId` and `!loggedIn` call `saveDraft`. Save button: if `loggedIn`, call `createDeckAction`/`updateDeckAction` and route to `/decks/{id}`; else render "Log in to save" linking to `/login`. Add `searchDeckCards` server action to `deck-actions.ts`:
```ts
export async function searchDeckCards(locale: string, state: unknown) {
  // validate minimal shape, then:
  return runSearch(getSearchClient(), locale, /* mapped SearchState with isOfficial when classic */)
}
```

- [ ] **Step 6:** Build `web/src/app/[locale]/decks/new/page.tsx` — server component: `setRequestLocale`, load `sets` via `listSets(getDb(), locale)`, read `getSession()` for `loggedIn`, render `<DeckBuilder initial={emptyDeck()} deckId={null} loggedIn={...} sets={sets} imageBase={IMAGE_BASE} />`. Add `decks` message keys used by the components to both `en.json` and `de.json`.

- [ ] **Step 7: Typecheck, lint, test, commit.**
```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components app/web/src/app/'[locale]'/decks/new app/web/src/lib/deck-actions.ts app/web/messages
git commit -m "feat(web): deck builder UI + /decks/new (guest, localStorage draft)"
```

---

## Phase 5 — Save, list, edit

### Task 9: My Decks list (`/decks`) + deck management

**Files:**
- Create: `web/src/app/[locale]/decks/page.tsx`, `web/src/components/deck-list.tsx`
- Modify: `web/src/components/account-menu.tsx`, `web/messages/*.json`

- [ ] **Step 1:** `decks/page.tsx` — server component. `getSession()`; if logged out, render a login CTA (link to `/login`) and a "Try the builder" link to `/decks/new`. If logged in, `listDecksByUser(getDb(), session.user.id)`, compute a legality badge per deck is optional here (cardCount + format shown; full status needs card views — show `cardCount/60` + format, defer full seal to the edit page). Render `<DeckList decks={summaries} />`.

- [ ] **Step 2:** `deck-list.tsx` — client component: grid of deck cards (name, format chip, `cardCount/60`, visibility toggle). Row actions: Open (`Link` to `/decks/{id}`), Duplicate (`duplicateDeckAction`), Delete (`deleteDeckAction` with a confirm), Rename (inline → `updateDeckAction` with unchanged cards is heavy; instead add a dedicated lightweight rename via `updateDeckAction` re-sending current summary — acceptable, or defer rename to the edit page). Visibility toggle calls `updateDeckAction`. Keep actions optimistic with `useTransition`.

- [ ] **Step 3:** `account-menu.tsx` — add two `Link`s: "Deck Builder" → `/decks/new`, "My Decks" → `/decks` (gated to show My Decks only when signed in, matching how the admin link is gated). Update the account-menu test if it asserts the item list.

- [ ] **Step 4:** Add `decks.list.*` message keys to `en.json`/`de.json`.

- [ ] **Step 5: Typecheck, lint, test, commit.**
```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/app/'[locale]'/decks/page.tsx app/web/src/components/deck-list.tsx app/web/src/components/account-menu.tsx app/web/messages
git commit -m "feat(web): My Decks list with duplicate/delete/visibility"
```

---

### Task 10: Edit a saved deck (`/decks/[id]`) + save-on-login

**Files:**
- Create: `web/src/app/[locale]/decks/[id]/page.tsx`
- Modify: `web/src/components/deck-builder.tsx` (save-on-login prompt)

- [ ] **Step 1:** `decks/[id]/page.tsx` — server component. `getSession()`; `getDeck(getDb(), id)`; if null → `notFound()`; if `existing.userId !== session?.user?.id` → `notFound()` (owner-only). Map `existing.views` into a `BuilderState` (name/format/visibility + entries=views) and render `<DeckBuilder initial={state} deckId={id} loggedIn sets={sets} imageBase={IMAGE_BASE} />`.

- [ ] **Step 2:** In `deck-builder.tsx`, when `loggedIn && !deckId && loadDraft()` returns a non-empty draft, show a one-time banner "Save this deck to your account?" → on accept call `createDeckAction(draft)` then `clearDraft()` and route to `/decks/{id}`.

- [ ] **Step 3:** Manual verification (see `/run` or the verify skill): build a deck logged out, refresh (draft persists), log in (prompt appears), save (lands on `/decks/{id}`), edit + save (persists), delete from `/decks`.

- [ ] **Step 4: Typecheck, lint, test, commit.**
```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/app/'[locale]'/decks/'[id]' app/web/src/components/deck-builder.tsx
git commit -m "feat(web): edit saved decks + save-guest-draft-on-login"
```

---

## Phase 6 — Export / Import

### Task 11: Export (text + JSON) and Import (text + JSON)

**Files:**
- Create: `web/src/components/deck-export-menu.tsx`, `web/src/components/deck-import-dialog.tsx`
- Modify: `web/src/components/deck-builder.tsx`, `web/src/lib/deck-actions.ts` (add `resolveImportNames` action)

**Interfaces:**
- Consumes: `toText, toJson, parseJson, parseText` from `@revelio/core`; `resolveCardsByName` from `@revelio/db`.

- [ ] **Step 1:** `deck-export-menu.tsx` — builds `toText({name,format}, entries)` and `toJson(deckDTO-from-state)`; offers copy-to-clipboard + download for `.txt` and `.json`. (PNG entry present but disabled until Task 12.)

- [ ] **Step 2:** Add `resolveImportNames(names)` server action wrapping `resolveCardsByName(getDb(), names)`; returns the name→cardId map. Needed because import name-resolution hits the DB.

- [ ] **Step 3:** `deck-import-dialog.tsx` — a textarea (paste) + file input. On import: JSON path → `parseJson` then load entries by cardId (fetch card views via a small `getCardViews(ids)` action or reuse `searchDeckCards`); Text path → `parseText`, call `resolveImportNames`, map resolved lines into entries, and **list unresolved/ambiguous lines** back to the user (never silently drop). Loads the result into the builder state.

- [ ] **Step 4:** Wire both into `deck-builder.tsx`'s command bar. Add `decks.export.*` / `decks.import.*` messages.

- [ ] **Step 5: Typecheck, lint, test, commit.**
```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/deck-export-menu.tsx app/web/src/components/deck-import-dialog.tsx app/web/src/components/deck-builder.tsx app/web/src/lib/deck-actions.ts app/web/messages
git commit -m "feat(web): deck export (text/JSON) and import (text/JSON)"
```

---

### Task 12: PNG export (isolated, last)

**Files:**
- Modify: `web/src/components/deck-export-menu.tsx`

- [ ] **Step 1:** Add a client-side PNG renderer: draw the decklist onto an offscreen `<canvas>` (title, format, character, grouped lines with counts) using the Reveal-Glow colors, then `canvas.toBlob` → download `deck.png`. No external libraries (CSP-safe). Keep layout simple and legible; wrap long lists into columns.

- [ ] **Step 2:** Enable the previously-disabled PNG menu entry.

- [ ] **Step 3:** Manual check: export a deck to PNG, confirm the image opens and is readable.

- [ ] **Step 4: Typecheck, lint, commit.**
```bash
npm run typecheck && npm run lint -w web
git add app/web/src/components/deck-export-menu.tsx
git commit -m "feat(web): PNG deck-sheet export"
```

---

## Self-Review (completed against the spec)

- **Classic/Revival filter** → Task 8 browser (`isOfficial` for classic; banned blocked for revival) + Task 2 engine. ✓
- **Rule enforcement** (hard copy-limit + soft completeness label) → Task 7 `addCard`/`copyLimitReached` + Task 2 `evaluateDeck` status. ✓
- **Guest localStorage + save-on-login** → Task 7 draft fns + Task 10 prompt. ✓
- **Character + main + sideboard** → schema `zone` (Task 4), engine zones (Task 2), panel (Task 8). ✓
- **Save / My Decks / edit** → Tasks 6, 9, 10. ✓
- **Export text/JSON/PNG + Import text/JSON** → Tasks 3, 11, 12. ✓
- **`visibility` column + toggle, public browsing deferred** → Task 4 column, Task 9 toggle; no public read surface. ✓
- **Enums in `schemas.ts`, DTOs in `domain.ts`, no `pgEnum`** → Task 1. ✓
- **Legality never stored** → computed in Tasks 2/5/8. ✓

**Deferred (spec, out of scope):** public deck browsing pages, cover images/descriptions/tags, versioning, playtesting.

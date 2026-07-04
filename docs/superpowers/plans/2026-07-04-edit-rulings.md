# Edit Rulings (Plan 4b-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the rulings schema (parent + per-language child, surrogate id) and let editors manage a card's rulings list (add/remove/reorder, edit date/source/text-per-language) as a section on the existing edit page.

**Architecture:** Split `card_rulings` (jsonb text) into `card_rulings` (id/cardId/seq/date/source) + `card_ruling_texts` (rulingId/lang/text). Ingest + `getCardById` adapt; `getCardById` assembles `RulingDTO.text` from child rows and exposes a stable `id`. A diff-based `saveRulings(db, cardId, lang, rows)` upserts only the active language's child row (other languages preserved), reassigns seq, deletes removed rulings. A gated server action + a `RulingsEditor` client component (bordered cards) drive it. No reindex (rulings aren't in the search doc).

**Tech Stack:** Drizzle/postgres-js, drizzle-kit, Next.js 16 (server actions), Zod, next-intl, Vitest.

## Global Constraints

- **Schema (normalized):** `card_rulings` = `id` (text PK, surrogate), `cardId` (text, FK `cards.id` ON DELETE CASCADE), `seq` (int, order only), `date` (text), `source` (text), `...editable`. New `card_ruling_texts` = `rulingId` (text, FK `card_rulings.id` ON DELETE CASCADE), `lang` (text), `text` (text NOT NULL), PK `(rulingId, lang)`. The old composite PK `(cardId, seq)` and the `text` jsonb column are removed.
- Ingest assigns ruling ids deterministically as `` `${cardId}-r${i}` ``; new rulings created at edit time get `` `${cardId}-r${randomUUID()}` ``.
- `RulingDTO` gains `id`: `{ id: string; seq: number; date: string | null; source: string | null; text: Record<string,string> }`. The public detail page is unaffected.
- **Save is diff-based** (not replace-the-set): editing one language upserts only its `(rulingId, lang)` child; other languages untouched. Empty active-language text deletes that child. Fully-empty rows dropped. All in a transaction.
- `origin: 'user'` + `updated_at` on every ruling write. `requireRole('editor')` gates the action. **No reindex.**
- Regenerating the migration needs a fresh DB / re-seed (project pattern). Tests use `withMigratedDb()` (fresh migrated DB per test) so they pick up the new schema automatically.
- Env quirk: `~/.npm` is root-owned → prefix installs with `NPM_CONFIG_CACHE=/private/tmp/claude-502/-Users-timon-wegener-Desktop-revelio-cards/5736844e-b47b-4a0f-87aa-027e73f7d8a9/scratchpad/npm-cache`. You should NOT need to install anything.
- Test infra: Postgres `localhost:55432` (`revelio-testpg`), Meili `localhost:7700` key `masterKey`. DB/ingest tests: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run`. Web: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run`.
- English identifiers; Conventional Commits.

## File Structure

```
app/db/src/schema.ts        # card_rulings reshaped + new cardRulingTexts table
app/db/src/index.ts         # export cardRulingTexts
app/db/src/queries.ts       # getCardById assembles rulings from parent+child; + saveRulings
app/db/drizzle/*            # regenerated migration
app/core/src/domain.ts      # RulingDTO gains id
app/ingest/src/load-cards.ts # write parent + child ruling rows
app/web/src/lib/rulings-actions.ts   # saveRulingsAction server action
app/web/src/components/rulings-editor.tsx  # bordered-cards list editor
app/web/src/app/[locale]/card/[id]/edit/page.tsx  # render RulingsEditor section
app/web/messages/{en,de}.json  # + edit keys for rulings
tests: app/ingest/test/load-cards.test.ts (extend), app/ingest/test/rulings.test.ts (saveRulings),
       app/web/src/lib/__tests__/rulings-actions.test.ts, app/web/src/components/__tests__/rulings-editor.test.tsx
```

---

### Task 1: Normalize the rulings schema + migration + ingest + getCardById

**Files:**
- Modify: `app/db/src/schema.ts`, `app/db/src/index.ts`, `app/db/src/queries.ts`, `app/core/src/domain.ts`, `app/ingest/src/load-cards.ts`
- Regenerate: `app/db/drizzle/*`
- Test: `app/ingest/test/load-cards.test.ts`

**Interfaces:**
- Produces: `cardRulingTexts` table (exported from `@revelio/db`); `card_rulings` reshaped (id PK); `RulingDTO { id, seq, date, source, text }`; `getCardById` returns rulings assembled from parent+child.

- [ ] **Step 1: Reshape the schema in `app/db/src/schema.ts`**

Replace the `cardRulings` table and add `cardRulingTexts` right after it:
```ts
export const cardRulings = pgTable('card_rulings', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  date: text('date'),
  source: text('source'),
  ...editable,
}, (t) => ({
  byCard: index('card_rulings_card_id_idx').on(t.cardId),
}))

export const cardRulingTexts = pgTable('card_ruling_texts', {
  rulingId: text('ruling_id').notNull().references(() => cardRulings.id, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  text: text('text').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.rulingId, t.lang] }),
}))
```
(`index` and `primaryKey` are already imported at the top of the file.)

- [ ] **Step 2: Export the new table from `app/db/src/index.ts`**

Add `cardRulingTexts` to the schema re-export list:
```ts
export {
  types, subTypes, lessons, rarities, finishes, legalities,
  sets, cards, cardTypes, cardSubTypes, cardRulings, cardRulingTexts, cardLocalizations,
} from './schema'
```

- [ ] **Step 3: `RulingDTO` gains `id` in `app/core/src/domain.ts`**

```ts
export type RulingDTO = {
  id: string
  seq: number
  date: string | null
  source: string | null
  text: Record<string, string>
}
```

- [ ] **Step 4: Rewrite the rulings write in `app/ingest/src/load-cards.ts`**

Add `cardRulingTexts` to the `@revelio/db` import. Replace the `rulingRows` block (the `const rulingRows = ...` through the `insert(cardRulings)` line) with parent + child inserts:
```ts
  const rulingParents = input.flatMap((c) =>
    (Array.isArray(c.rulings) ? (c.rulings as Ruling[]) : []).map((r, i) => ({
      id: `${c.id}-r${i}`,
      cardId: c.id,
      seq: i,
      date: r.date ?? null,
      source: r.source ?? null,
    })),
  )
  const rulingTexts = input.flatMap((c) =>
    (Array.isArray(c.rulings) ? (c.rulings as Ruling[]) : [])
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !!r.ruling)
      .map(({ r, i }) => ({ rulingId: `${c.id}-r${i}`, lang: c.defaultLanguage, text: r.ruling as string })),
  )
  if (rulingParents.length) await db.insert(cardRulings).values(rulingParents).onConflictDoNothing()
  if (rulingTexts.length) await db.insert(cardRulingTexts).values(rulingTexts).onConflictDoNothing()
```

- [ ] **Step 5: Assemble rulings in `getCardById` (`app/db/src/queries.ts`)**

Add `inArray` to the `drizzle-orm` import (currently `{ eq, asc, sql }`) and `cardRulingTexts` to the schema import. After the `Promise.all` that already fetches `rulingRows` (ordered by seq), fetch the child texts and build a map; then replace the `rulings:` mapping in the returned object:
```ts
  const rulingTextRows = rulingRows.length
    ? await db.select().from(cardRulingTexts).where(
        inArray(cardRulingTexts.rulingId, rulingRows.map((r) => r.id)),
      )
    : []
  const textsByRuling = new Map<string, Record<string, string>>()
  for (const t of rulingTextRows) {
    const m = textsByRuling.get(t.rulingId) ?? {}
    m[t.lang] = t.text
    textsByRuling.set(t.rulingId, m)
  }
```
Then:
```ts
    rulings: rulingRows.map((r) => ({
      id: r.id,
      seq: r.seq,
      date: r.date,
      source: r.source,
      text: textsByRuling.get(r.id) ?? {},
    })),
```

- [ ] **Step 6: Regenerate the migration**

```bash
cd app/db && rm -f drizzle/*.sql && rm -rf drizzle/meta && NPM_CONFIG_CACHE=<scratchpad>/npm-cache npx drizzle-kit generate
```
Confirm: `grep -l 'CREATE TABLE "card_ruling_texts"' drizzle/*.sql` and that `card_rulings` now has an `"id"` primary key.

- [ ] **Step 7: Write the failing test (extend `app/ingest/test/load-cards.test.ts`)**

The suite already runs `loadSets` + `loadCards` on the fixture dataset in `beforeAll` (`ctx`). The fixture card `bs-2-flobberworm` has one ruling `{ date: '2001-08-31', source: 'POJO', ruling: 'A ruling.' }`, defaultLanguage `en`. Add (import `cardRulings`, `cardRulingTexts`, `getCardById`, and `eq` if not present):
```ts
describe('rulings (normalized parent + child)', () => {
  it('loads a ruling into card_rulings + card_ruling_texts', async () => {
    const parents = await ctx.db.select().from(cardRulings)
    const flob = parents.find((r) => r.cardId === 'bs-2-flobberworm')!
    expect(flob.id).toBe('bs-2-flobberworm-r0')
    expect(flob.seq).toBe(0)
    expect(flob.date).toBe('2001-08-31')
    expect(flob.source).toBe('POJO')
    const texts = await ctx.db.select().from(cardRulingTexts)
    const t = texts.find((x) => x.rulingId === 'bs-2-flobberworm-r0')!
    expect(t.lang).toBe('en')
    expect(t.text).toBe('A ruling.')
  })

  it('getCardById assembles RulingDTO with id + text map', async () => {
    const card = await getCardById(ctx.db, 'bs-2-flobberworm')
    expect(card?.rulings).toEqual([
      { id: 'bs-2-flobberworm-r0', seq: 0, date: '2001-08-31', source: 'POJO', text: { en: 'A ruling.' } },
    ])
  })
})
```

- [ ] **Step 8: Run — RED then GREEN**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run load-cards`
Expected: the two new tests pass; the existing load-cards assertions still pass.

- [ ] **Step 9: Commit**

```bash
git add app/db/src/schema.ts app/db/src/index.ts app/db/src/queries.ts app/db/drizzle app/core/src/domain.ts app/ingest/src/load-cards.ts app/ingest/test/load-cards.test.ts
git commit -m "feat(db): normalize card_rulings into parent + per-language child (surrogate id); ingest + getCardById adapt"
```

---

### Task 2: `saveRulings` diff-based query

**Files:**
- Modify: `app/db/src/queries.ts`, `app/db/src/index.ts`
- Test: `app/ingest/test/rulings.test.ts`

**Interfaces:**
- Consumes: `cardRulings`, `cardRulingTexts`.
- Produces: `saveRulings(db, cardId, lang, rows): Promise<void>` where `rows: { id: string | null; date: string | null; source: string | null; text: string }[]`.

- [ ] **Step 1: Write the failing test**

`app/ingest/test/rulings.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { sets, cards, cardRulings, cardRulingTexts, saveRulings, getCardById } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values({ code: 'X', name: 'Xen', isOfficial: true })
  await ctx.db.insert(cards).values({ id: 'x-1', setCode: 'X', number: '1', name: 'Card', defaultLanguage: 'en' })
}, 60_000)
afterAll(async () => { await ctx.stop() })

describe('saveRulings', () => {
  it('inserts new rulings with seq by order, origin=user, and the active-language text', async () => {
    await saveRulings(ctx.db, 'x-1', 'en', [
      { id: null, date: '2001-08-31', source: 'POJO', text: 'first' },
      { id: null, date: null, source: null, text: 'second' },
    ])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(2)
    expect(parents.every((p) => p.origin === 'user')).toBe(true)
    expect(parents.map((p) => p.seq).sort()).toEqual([0, 1])
    const texts = await ctx.db.select().from(cardRulingTexts)
    expect(texts.map((t) => t.text).sort()).toEqual(['first', 'second'])
  })

  it('updates an existing ruling by id and preserves other-language text', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const first = card!.rulings.find((r) => r.text.en === 'first')!
    // seed a German text on that ruling
    await ctx.db.insert(cardRulingTexts).values({ rulingId: first.id, lang: 'de', text: 'erste' })
    // edit only the English text, keep both rulings
    const rows = card!.rulings.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text.en === 'first' ? 'FIRST' : r.text.en ?? '' }))
    await saveRulings(ctx.db, 'x-1', 'en', rows)
    const after = await getCardById(ctx.db, 'x-1')
    const edited = after!.rulings.find((r) => r.id === first.id)!
    expect(edited.text).toEqual({ en: 'FIRST', de: 'erste' })
  })

  it('deletes rulings removed from the list (cascade drops their texts)', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const keep = card!.rulings.find((r) => r.text.en === 'second')!
    await saveRulings(ctx.db, 'x-1', 'en', [{ id: keep.id, date: keep.date, source: keep.source, text: keep.text.en ?? '' }])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(1)
    const texts = await ctx.db.select().from(cardRulingTexts)
    // only the kept ruling's texts remain (the deleted ruling's en+de are gone)
    expect(texts.every((t) => t.rulingId === keep.id)).toBe(true)
  })

  it('drops fully-empty rows and deletes an emptied language text', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const only = card!.rulings[0]
    await saveRulings(ctx.db, 'x-1', 'en', [
      { id: only.id, date: only.date, source: only.source, text: '' }, // empties the en text
      { id: null, date: '', source: '', text: '' }, // fully-empty new row -> dropped
    ])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(1) // the empty new row was dropped; the kept row stays (has a date)
    const texts = await ctx.db.select().from(cardRulingTexts).where(eq(cardRulingTexts.rulingId, only.id))
    expect(texts.find((t) => t.lang === 'en')).toBeUndefined() // en text removed
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`saveRulings` not exported)

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run rulings`
Expected: FAIL.

- [ ] **Step 3: Implement `saveRulings` in `app/db/src/queries.ts`**

Add `and` and `inArray` to the `drizzle-orm` import (if not present) and `import { randomUUID } from 'node:crypto'` at the top. Append:
```ts
export async function saveRulings(
  db: DB,
  cardId: string,
  lang: string,
  rows: { id: string | null; date: string | null; source: string | null; text: string }[],
): Promise<void> {
  const clean = rows.filter(
    (r) => (r.date?.trim() || '') !== '' || (r.source?.trim() || '') !== '' || (r.text?.trim() || '') !== '',
  )
  const now = new Date()
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: cardRulings.id }).from(cardRulings).where(eq(cardRulings.cardId, cardId))
    const existingIds = new Set(existing.map((e) => e.id))
    const keptIds = new Set<string>()

    for (let i = 0; i < clean.length; i++) {
      const row = clean[i]
      const date = row.date?.trim() || null
      const source = row.source?.trim() || null
      const text = row.text?.trim() || ''
      let id = row.id
      if (id && existingIds.has(id)) {
        keptIds.add(id)
        await tx.update(cardRulings)
          .set({ date, source, seq: i, origin: 'user', updatedAt: now })
          .where(eq(cardRulings.id, id))
      } else {
        id = `${cardId}-r${randomUUID()}`
        await tx.insert(cardRulings).values({ id, cardId, seq: i, date, source, origin: 'user', updatedAt: now })
      }
      if (text) {
        await tx.insert(cardRulingTexts)
          .values({ rulingId: id, lang, text })
          .onConflictDoUpdate({ target: [cardRulingTexts.rulingId, cardRulingTexts.lang], set: { text } })
      } else {
        await tx.delete(cardRulingTexts).where(and(eq(cardRulingTexts.rulingId, id), eq(cardRulingTexts.lang, lang)))
      }
    }

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length) await tx.delete(cardRulings).where(inArray(cardRulings.id, toDelete))
  })
}
```

- [ ] **Step 4: Export it from `app/db/src/index.ts`**

Add `saveRulings` to the queries export line:
```ts
export { getCardById, listSets, getSetByCode, getRandomCardId, upsertLocalization, getCardIndexData, saveRulings } from './queries'
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run rulings`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/rulings.test.ts
git commit -m "feat(db): saveRulings — diff-based upsert of a card's rulings (per-language, preserves other langs)"
```

---

### Task 3: `saveRulingsAction` server action

**Files:**
- Create: `app/web/src/lib/rulings-actions.ts`
- Test: `app/web/src/lib/__tests__/rulings-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/session`), `getDb` (`@/lib/db`), `saveRulings` (`@revelio/db`), `routing` (`@/../i18n/routing`).
- Produces: `saveRulingsAction(input: unknown): Promise<RulingsSaveResult>` where `RulingsSaveResult = { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

`app/web/src/lib/__tests__/rulings-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  saveRulings: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ saveRulings: m.saveRulings }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { saveRulingsAction } from '../rulings-actions'

const valid = {
  cardId: 'x-1',
  lang: 'en',
  rulings: [{ id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' }],
}

beforeEach(() => {
  m.requireRole.mockReset(); m.saveRulings.mockReset(); m.revalidatePath.mockReset()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
})

describe('saveRulingsAction', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await saveRulingsAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.saveRulings).not.toHaveBeenCalled()
  })

  it('returns invalid and does not write on bad input', async () => {
    const res = await saveRulingsAction({ cardId: '', lang: 'en', rulings: [] })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveRulings).not.toHaveBeenCalled()
  })

  it('saves valid rulings, revalidates, returns ok', async () => {
    const res = await saveRulingsAction(valid)
    expect(m.saveRulings).toHaveBeenCalledWith({}, 'x-1', 'en', [
      { id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' },
    ])
    expect(m.revalidatePath).toHaveBeenCalledWith('/card/x-1')
    expect(res).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`../rulings-actions` missing)

Run: `cd app/web && npx vitest run rulings-actions`
Expected: FAIL.

- [ ] **Step 3: Implement `app/web/src/lib/rulings-actions.ts`**

```ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { saveRulings } from '@revelio/db'
import { routing } from '@/../i18n/routing'

const rulingRow = z.object({
  id: z.string().nullable(),
  date: z.string(),
  source: z.string(),
  text: z.string(),
})

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(routing.locales as unknown as [string, ...string[]]),
  rulings: z.array(rulingRow),
})

export type RulingsSaveResult = { ok: true } | { ok: false; error: string }

export async function saveRulingsAction(input: unknown): Promise<RulingsSaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, rulings } = parsed.data

  await saveRulings(
    getDb(),
    cardId,
    lang,
    rulings.map((r) => ({ id: r.id, date: r.date || null, source: r.source || null, text: r.text })),
  )
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return { ok: true }
}
```
Note: the test passes `date: '2001-08-31'` (non-empty) so `r.date || null` stays `'2001-08-31'` — matches the `toHaveBeenCalledWith` expectation.

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd app/web && npx vitest run rulings-actions` → 3 passed. Then `cd app/web && npx next build` → "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/rulings-actions.ts app/web/src/lib/__tests__/rulings-actions.test.ts
git commit -m "feat(web): saveRulingsAction server action (editor-gated, validated)"
```

---

### Task 4: RulingsEditor component + edit page section + i18n

**Files:**
- Create: `app/web/src/components/rulings-editor.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/edit/page.tsx`, `app/web/messages/{en,de}.json`
- Test: `app/web/src/components/__tests__/rulings-editor.test.tsx`

**Interfaces:**
- Consumes: `saveRulingsAction` (`@/lib/rulings-actions`), `AutoTextarea`, `Input`, `Button`, `toast`.
- Produces: `RulingsEditor` rendered as a section on the edit page.

- [ ] **Step 1: Add the `edit` message keys**

`app/web/messages/en.json` `"edit"` — add: `"rulings": "Rulings", "addRuling": "Add ruling", "rulingDate": "Date", "rulingSource": "Source", "rulingText": "Text", "moveUp": "Move up", "moveDown": "Move down", "removeRuling": "Remove", "saveRulings": "Save rulings", "rulingsSaved": "Rulings saved.", "rulingsFailed": "Could not save the rulings."`.
`app/web/messages/de.json` `"edit"` — German: `"rulings": "Rulings", "addRuling": "Ruling hinzufügen", "rulingDate": "Datum", "rulingSource": "Quelle", "rulingText": "Text", "moveUp": "Nach oben", "moveDown": "Nach unten", "removeRuling": "Entfernen", "saveRulings": "Rulings speichern", "rulingsSaved": "Rulings gespeichert.", "rulingsFailed": "Rulings konnten nicht gespeichert werden."`.

- [ ] **Step 2: Write the failing test**

`app/web/src/components/__tests__/rulings-editor.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveRulingsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/rulings-actions', () => ({ saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { RulingsEditor } from '../rulings-editor'
import en from '@/../messages/en.json'

function renderEditor(initial: { id: string; date: string; source: string; text: string }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RulingsEditor cardId="x-1" lang="en" initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => saveRulingsAction.mockClear())

describe('RulingsEditor', () => {
  it('adds and removes a ruling row', async () => {
    renderEditor()
    expect(screen.queryByLabelText(en.edit.rulingText)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    expect(screen.getByLabelText(en.edit.rulingText)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: en.edit.removeRuling }))
    expect(screen.queryByLabelText(en.edit.rulingText)).not.toBeInTheDocument()
  })

  it('submits rows with their ids and the active-language text', async () => {
    renderEditor([{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'old' }])
    const textField = screen.getByLabelText(en.edit.rulingText)
    await userEvent.clear(textField)
    await userEvent.type(textField, 'new')
    await userEvent.click(screen.getByRole('button', { name: en.edit.saveRulings }))
    expect(saveRulingsAction).toHaveBeenCalledWith({
      cardId: 'x-1',
      lang: 'en',
      rulings: [{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'new' }],
    })
  })
})
```

- [ ] **Step 3: Run it — expect FAIL** (`../rulings-editor` missing)

Run: `cd app/web && npx vitest run rulings-editor`
Expected: FAIL.

- [ ] **Step 4: Implement `app/web/src/components/rulings-editor.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { saveRulingsAction } from '@/lib/rulings-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'

type Row = { key: string; id: string | null; date: string; source: string; text: string }
type Initial = { id: string; date: string; source: string; text: string }

let counter = 0
const nextKey = () => `new-${counter++}`

export function RulingsEditor({
  cardId, lang, initial,
}: {
  cardId: string
  lang: string
  initial: Initial[]
}) {
  const t = useTranslations('edit')
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(
    initial.map((r) => ({ key: r.id, id: r.id, date: r.date, source: r.source, text: r.text })),
  )
  const [busy, setBusy] = useState(false)

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function move(index: number, delta: number) {
    setRows((rs) => {
      const next = [...rs]
      const j = index + delta
      if (j < 0 || j >= next.length) return rs
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  async function onSave() {
    setBusy(true)
    const res = await saveRulingsAction({
      cardId,
      lang,
      rulings: rows.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })),
    })
    setBusy(false)
    if (!res.ok) return toast.error(t('rulingsFailed'))
    toast.success(t('rulingsSaved'))
    router.refresh()
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('rulings')}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((rs) => [...rs, { key: nextKey(), id: null, date: '', source: '', text: '' }])}
        >
          {t('addRuling')}
        </Button>
      </div>

      {rows.map((r, i) => (
        <div key={r.key} className="space-y-3 rounded-md border p-4">
          <div className="flex items-start justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" aria-label={t('moveUp')} onClick={() => move(i, -1)}>
              <ChevronUp className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label={t('moveDown')} onClick={() => move(i, 1)}>
              <ChevronDown className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label={t('removeRuling')} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex gap-3">
            <label className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingDate')}</span>
              <Input value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} />
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingSource')}</span>
              <Input value={r.source} onChange={(e) => update(r.key, { source: e.target.value })} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('rulingText')}</span>
            <AutoTextarea aria-label={t('rulingText')} value={r.text} onChange={(e) => update(r.key, { text: e.target.value })} />
          </label>
        </div>
      ))}

      <Button type="button" disabled={busy} onClick={onSave}>{t('saveRulings')}</Button>
    </section>
  )
}
```
Note: for existing rows `key` is the ruling `id` (stable); new rows use `nextKey()`. The `<label>` wrapping gives the `Input`/`AutoTextarea` their accessible names; the remove test uses the button's `aria-label`. When there is exactly one row, `getByRole('button', { name: en.edit.removeRuling })` is unambiguous.

- [ ] **Step 5: Run the test — expect PASS**

Run: `cd app/web && npx vitest run rulings-editor` → 2 passed.

- [ ] **Step 6: Render the section on the edit page**

In `app/web/src/app/[locale]/card/[id]/edit/page.tsx`: import `RulingsEditor`, seed it from `card.rulings` for the active `lang`, and render it after `<LocalizationForm .../>`:
```tsx
import { RulingsEditor } from '@/components/rulings-editor'
```
Compute the initial rows (after the existing `initial` for the localization form):
```ts
  const rulingRows = card.rulings.map((r) => ({
    id: r.id,
    date: r.date ?? '',
    source: r.source ?? '',
    text: r.text[lang] ?? '',
  }))
```
Render (keep `key={lang}` so it re-seeds on language switch):
```tsx
      <LocalizationForm key={lang} cardId={id} lang={lang} initial={initial} kind={kind} />
      <RulingsEditor key={`rulings-${lang}`} cardId={id} lang={lang} initial={rulingRows} />
```

- [ ] **Step 7: Run tests + build**

Run: `cd app/web && npx vitest run rulings-editor` → pass. Then the full web suite: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run` → all green. Then `npx next build` → "Compiled successfully".

- [ ] **Step 8: Commit**

```bash
git add app/web/src/components/rulings-editor.tsx "app/web/src/app/[locale]/card/[id]/edit/page.tsx" app/web/messages "app/web/src/components/__tests__/rulings-editor.test.tsx"
git commit -m "feat(web): rulings editor section (bordered cards, add/remove/reorder, per-language) on the edit page"
```

---

## Self-Review

**Spec coverage:**
- Normalize schema (parent + per-language child, surrogate id, cascade) → Task 1 ✓
- Ingest writes parent + child (deterministic ids) → Task 1 Step 4 ✓
- `getCardById` assembles `RulingDTO` (with `id`) from parent+child → Task 1 Step 5 ✓
- `RulingDTO` gains `id`; detail page unaffected → Task 1 Step 3 ✓
- Diff-based `saveRulings` (update/insert by id, delete removed, per-lang upsert, empty→delete child, drop empty rows, seq by order, provenance, transaction) → Task 2 ✓
- Editor-gated action, no reindex → Task 3 ✓
- RulingsEditor bordered cards (add/remove/move, per-lang text, save+toast) on the edit page, shares `?lang` → Task 4 ✓
- Preserve other languages → Task 2 (per-lang upsert) + its test ✓
- Tests at every layer (ingest+assembly, saveRulings diff/preserve/delete/empty, action gating, editor add/remove/submit) → Tasks 1-4 ✓
- OUT of scope (images, searchable rulings, drag-drop, side-by-side langs) → not built ✓

**Placeholder scan:** No TBD/TODO. `<scratchpad>` in the migration command is the real cache path from Global Constraints. All code/tests are complete.

**Type consistency:** `RulingDTO { id, seq, date, source, text }` defined in Task 1, consumed by the edit page seeding (Task 4). `saveRulings(db, cardId, lang, rows: { id: string|null; date: string|null; source: string|null; text: string }[])` identical in Task 2 (def), Task 3 (action maps to it), and the action test. `saveRulingsAction(input)` → `RulingsSaveResult` used by the editor (Task 4). `cardRulingTexts` table name consistent across schema/index/queries/ingest. The editor submits `{ cardId, lang, rulings: [{id,date,source,text}] }` — matches the action's Zod schema and the action test's `toHaveBeenCalledWith`.

## Notes for later slices
Per the spec: 4b-5 (image upload — MinIO subsystem, re-indexes since `image_file` is in the search doc) gets its own spec → plan.

# Collection Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user collection tracker where every card is shown (owned in colour, unowned greyed), ownership is recorded per finish with quantities, editable from a dedicated collection page and the card detail page, with per-set completion, ownership filtering, and a private/public shareable view.

**Architecture:** Ownership lives entirely in Postgres (`collections` + `userCards`), never in Meilisearch. The collection page reuses the existing search/filter stack; the ownership filter is resolved from Postgres into a Meili `id IN / NOT IN` clause so search + pagination stay correct. Server actions mirror the decks write path (`requireUserId` → Zod → mutate → `revalidatePath`). UI is built from shadcn/Radix primitives.

**Tech Stack:** Next.js 16 App Router (React 19), Drizzle/Postgres, Meilisearch, Better Auth, next-intl, shadcn + Radix + Tailwind v4, Vitest (+ Testcontainers via ingest, testing-library where useful).

## Global Constraints

- All app commands run from `app/` (npm workspaces root). Tests: `npm test`; typecheck: `npm run typecheck`; web lint: `npm run lint -w web`.
- Dependency direction is strict: `core ← {search, db} ← {ingest, web}`. Never import upward.
- Migrations are **append-only**. Edit `app/db/src/schema.ts`, then `npm run generate` from `app/db`; commit the schema edit + generated `drizzle/NNNN_*.sql` together. Never edit/regenerate `0000`. CI `npm run verify -w @revelio/db` fails on drift.
- Postgres-backed query tests live in `app/ingest/test/*.test.ts` using the `withMigratedDb()` helper (`./helpers.js`). The `@revelio/db` workspace itself has no test runner.
- Finish values are `normal | foil | holo` (`app/core/src/attributes.ts` `FINISHES`). There is **no** finishes vocab table — `cards.finishes` is `text[]`; a finish is validated in code, not by an FK.
- Visibility values are `'private' | 'public'` (text column, default `'private'`), matching the decks convention.
- Conventional Commits. Docs/prose in English. Documentation filenames UPPERCASE.
- Ownership mutations write Postgres only — **no Meilisearch write, no reindex** in the write path.

---

## Task 1: Core — collection types, enums & finish validation

**Files:**
- Create: `app/core/src/collection.ts`
- Modify: `app/core/src/index.ts` (add `export * from './collection'`)
- Test: `app/core/test/collection.test.ts`

**Interfaces:**
- Consumes: `FINISHES` from `app/core/src/attributes.ts`.
- Produces:
  - `CollectionVisibility` (zod enum) + type `CollectionVisibility`
  - `OwnershipFilter = 'owned' | 'missing' | 'dupes'`
  - `type OwnedQuantities = Record<string, Record<string, number>>` (cardId → finish → quantity)
  - `type SetProgress = { setCode: string; owned: number; total: number }`
  - `type CollectionSummary = { distinctOwned: number; totalCards: number; totalCopies: number }`
  - `isFinishAllowed(cardFinishes: string[], finish: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// app/core/test/collection.test.ts
import { describe, it, expect } from 'vitest'
import { CollectionVisibility, isFinishAllowed } from '../src/collection'

describe('CollectionVisibility', () => {
  it('accepts private/public and rejects others', () => {
    expect(CollectionVisibility.parse('private')).toBe('private')
    expect(CollectionVisibility.parse('public')).toBe('public')
    expect(CollectionVisibility.safeParse('secret').success).toBe(false)
  })
})

describe('isFinishAllowed', () => {
  it('accepts a known finish present on the card', () => {
    expect(isFinishAllowed(['normal', 'holo'], 'holo')).toBe(true)
  })
  it('rejects a finish the card does not have', () => {
    expect(isFinishAllowed(['normal'], 'holo')).toBe(false)
  })
  it('rejects a finish not in the global FINISHES vocab', () => {
    expect(isFinishAllowed(['normal', 'sparkle'], 'sparkle')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/core -- collection`
Expected: FAIL — cannot resolve `../src/collection`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/core/src/collection.ts
import { z } from 'zod'
import { FINISHES } from './attributes'

export const CollectionVisibility = z.enum(['private', 'public'])
export type CollectionVisibility = z.infer<typeof CollectionVisibility>

export type OwnershipFilter = 'owned' | 'missing' | 'dupes'

// cardId -> finish -> quantity owned
export type OwnedQuantities = Record<string, Record<string, number>>

export type SetProgress = { setCode: string; owned: number; total: number }

export type CollectionSummary = {
  distinctOwned: number
  totalCards: number
  totalCopies: number
}

const FINISH_CODES = new Set(FINISHES.map((f) => f.code))

// A finish is writable for a card only if it is a real finish AND that card
// actually offers it (cards.finishes enumerates the ownable variants).
export function isFinishAllowed(cardFinishes: string[], finish: string): boolean {
  return FINISH_CODES.has(finish) && cardFinishes.includes(finish)
}
```

- [ ] **Step 4: Add the barrel export**

In `app/core/src/index.ts`, add after the existing exports:

```ts
export * from './collection'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @revelio/core -- collection`
Expected: PASS (3 suites green).

- [ ] **Step 6: Commit**

```bash
git add app/core/src/collection.ts app/core/src/index.ts app/core/test/collection.test.ts
git commit -m "feat(core): collection types, visibility enum and finish validation"
```

---

## Task 2: DB schema — `collections` and `userCards` tables + migration

**Files:**
- Modify: `app/db/src/schema.ts` (add two tables after `deckViews`)
- Generate: `app/db/drizzle/NNNN_*.sql` (via `npm run generate`)

**Interfaces:**
- Consumes: `user` (auth-schema), `cards` (schema), the `editable`/`index`/`primaryKey` helpers already imported in `schema.ts`.
- Produces: `collections` table (`userId` PK, `visibility`, `updatedAt`), `userCards` table (`userId`, `cardId`, `finish`, `quantity`; composite PK).

- [ ] **Step 1: Add the tables**

In `app/db/src/schema.ts`, immediately after the `deckViews` table definition and before the `export * from './auth-schema'` line, add:

```ts
// --- collections: one implicit collection per user, plus owned copies ---

// One row per user, created lazily on first write. Holds only the share flag;
// absence of a row == empty, private collection.
export const collections = pgTable('collections', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  visibility: text('visibility').notNull().default('private'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Owned copies, keyed per (user, card, finish). Rows exist only for quantity >= 1;
// decrementing to zero deletes the row. `finish` is validated in the write path
// (no finishes vocab table exists to FK against).
export const userCards = pgTable('user_cards', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  finish: text('finish').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.cardId, t.finish] }),
  byUser: index('user_cards_user_id_idx').on(t.userId),
  byUserCard: index('user_cards_user_card_idx').on(t.userId, t.cardId),
}))
```

- [ ] **Step 2: Generate the migration**

Run: `cd app && npm run generate`
Expected: a new `app/db/drizzle/NNNN_*.sql` creating `collections` and `user_cards` with the FKs, composite PK, and two indexes. Do **not** touch any existing migration file.

- [ ] **Step 3: Verify schema/migration are in sync**

Run: `cd app && npm run check -w @revelio/db && npm run verify -w @revelio/db`
Expected: both pass (no drift).

- [ ] **Step 4: Commit**

```bash
git add app/db/src/schema.ts app/db/drizzle/
git commit -m "feat(db): collections and user_cards tables"
```

---

## Task 3: DB write queries — set quantity, visibility, card finishes

**Files:**
- Modify: `app/db/src/queries.ts`
- Test: `app/ingest/test/collection-write.test.ts`

**Interfaces:**
- Consumes: `collections`, `userCards`, `cards` tables (Task 2); `DB` type; drizzle helpers already imported (`eq`, `and`, `sql`).
- Produces:
  - `setCardQuantity(db: DB, userId: string, cardId: string, finish: string, quantity: number): Promise<void>`
  - `setCollectionVisibility(db: DB, userId: string, visibility: CollectionVisibility): Promise<void>`
  - `getCardFinishes(db: DB, cardId: string): Promise<string[] | null>`

- [ ] **Step 1: Write the failing test**

```ts
// app/ingest/test/collection-write.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  setCardQuantity, setCollectionVisibility, getCardFinishes,
  getOwnedQuantities, getCollectionVisibility,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values({ id: 'u1', name: 'T', email: 't@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 2 }])
  await ctx.db.insert(cards).values([
    { id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry', defaultLanguage: 'en', finishes: ['normal', 'holo'] },
    { id: 'bs-accio', setCode: 'BS', number: '2', name: 'Accio', defaultLanguage: 'en', finishes: ['normal'] },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('collection write queries', () => {
  it('upserts a quantity and reads it back', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'normal', 2)
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'holo', 1)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry', 'bs-accio'])
    expect(q['bs-harry']).toEqual({ normal: 2, holo: 1 })
    expect(q['bs-accio']).toBeUndefined()
  })

  it('overwrites an existing quantity', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'normal', 5)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry'])
    expect(q['bs-harry'].normal).toBe(5)
  })

  it('deletes the row when quantity drops to zero', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'holo', 0)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry'])
    expect(q['bs-harry'].holo).toBeUndefined()
    expect(q['bs-harry'].normal).toBe(5)
  })

  it('lazily creates the collection row and toggles visibility', async () => {
    expect(await getCollectionVisibility(ctx.db, 'u1')).toBe('private')
    await setCollectionVisibility(ctx.db, 'u1', 'public')
    expect(await getCollectionVisibility(ctx.db, 'u1')).toBe('public')
  })

  it('returns a card finishes array, or null for a missing card', async () => {
    expect(await getCardFinishes(ctx.db, 'bs-harry')).toEqual(['normal', 'holo'])
    expect(await getCardFinishes(ctx.db, 'nope')).toBeNull()
  })
})
```

> Note: `getOwnedQuantities` and `getCollectionVisibility` are implemented in Task 4; this test file imports them so run the full file only after Task 4. To keep this task independently runnable, temporarily assert only the `setCardQuantity`/`getCardFinishes`/`setCollectionVisibility` behaviours by reading `userCards` directly. Simpler: implement Task 4's read helpers is a prerequisite import — so **Task 3 and Task 4 share this test file**; write the file now, expect the reads to be added in Task 4. Run the finish/visibility assertions here, the quantity read-backs after Task 4.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/ingest -- collection-write`
Expected: FAIL — `setCardQuantity` is not exported.

- [ ] **Step 3: Write the write queries**

In `app/db/src/queries.ts`, first extend the schema import to include the new tables:

```ts
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, subTypes, subTypeLocalizations, setLocalizations, decks, deckCards, deckLikes, deckViews, collections, userCards } from './schema'
```

Add the `CollectionVisibility` type to the `@revelio/core` type import at the top of the file:

```ts
import type { SetDTO, CardLocalizationDTO, CardDetailDTO, AdventureData, MatchData, DeckDTO, DeckCardView, DeckFormat, DeckVisibility, CollectionVisibility, OwnedQuantities, SetProgress, CollectionSummary } from '@revelio/core'
```

Then append (near the deck queries):

```ts
// --- collection: write path ---

// Ensure the per-user collection row exists (holds the visibility flag).
async function ensureCollection(tx: Tx | DB, userId: string): Promise<void> {
  await tx.insert(collections).values({ userId }).onConflictDoNothing()
}

export async function setCardQuantity(
  db: DB, userId: string, cardId: string, finish: string, quantity: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ensureCollection(tx, userId)
    if (quantity <= 0) {
      await tx.delete(userCards).where(and(
        eq(userCards.userId, userId), eq(userCards.cardId, cardId), eq(userCards.finish, finish),
      ))
      return
    }
    await tx.insert(userCards)
      .values({ userId, cardId, finish, quantity })
      .onConflictDoUpdate({
        target: [userCards.userId, userCards.cardId, userCards.finish],
        set: { quantity },
      })
  })
}

export async function setCollectionVisibility(
  db: DB, userId: string, visibility: CollectionVisibility,
): Promise<void> {
  await db.insert(collections)
    .values({ userId, visibility })
    .onConflictDoUpdate({ target: collections.userId, set: { visibility, updatedAt: new Date() } })
}

export async function getCardFinishes(db: DB, cardId: string): Promise<string[] | null> {
  const [row] = await db.select({ finishes: cards.finishes }).from(cards).where(eq(cards.id, cardId)).limit(1)
  return row ? row.finishes : null
}
```

- [ ] **Step 4: Add barrel re-export check**

Confirm `app/db/src/index.ts` re-exports everything from `./queries` (it does — `export * from './queries'` per existing pattern). No change needed if the wildcard is present; otherwise add it.

- [ ] **Step 5: Run the finish/visibility assertions**

Run: `npm test -w @revelio/ingest -- collection-write -t "finishes array"`
Run: `npm test -w @revelio/ingest -- collection-write -t "visibility"`
Expected: PASS. (The quantity read-back tests pass after Task 4.)

- [ ] **Step 6: Commit**

```bash
git add app/db/src/queries.ts app/ingest/test/collection-write.test.ts
git commit -m "feat(db): collection write queries (set quantity, visibility, card finishes)"
```

---

## Task 4: DB read queries — ownership, progress, summary, viewer resolution

**Files:**
- Modify: `app/db/src/queries.ts`
- Test: `app/ingest/test/collection-read.test.ts`

**Interfaces:**
- Consumes: `collections`, `userCards`, `cards`, `sets`, `user` tables; `SetProgress`, `CollectionSummary`, `OwnedQuantities`, `CollectionVisibility` types.
- Produces:
  - `getOwnedCardIds(db, userId): Promise<string[]>`
  - `getDuplicateCardIds(db, userId): Promise<string[]>` (any finish with quantity > 1)
  - `getOwnedQuantities(db, userId, cardIds): Promise<OwnedQuantities>`
  - `getCollectionSetProgress(db, userId): Promise<SetProgress[]>`
  - `getCollectionSummary(db, userId): Promise<CollectionSummary>`
  - `getCollectionVisibility(db, userId): Promise<CollectionVisibility>`
  - `resolveCollectionOwner(db, key): Promise<{ userId: string; username: string | null } | null>`

- [ ] **Step 1: Write the failing test**

```ts
// app/ingest/test/collection-read.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  setCardQuantity, getOwnedCardIds, getDuplicateCardIds, getCollectionSetProgress,
  getCollectionSummary, resolveCollectionOwner,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values({ id: 'u1', name: 'Ann', username: 'ann', email: 'a@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values([
    { code: 'BS', name: 'Base', isOfficial: true, cardCount: 3 },
    { code: 'PR', name: 'Promo', isOfficial: false, cardCount: 1 },
  ])
  await ctx.db.insert(cards).values([
    { id: 'bs-1', setCode: 'BS', number: '1', name: 'A', defaultLanguage: 'en', finishes: ['normal', 'holo'] },
    { id: 'bs-2', setCode: 'BS', number: '2', name: 'B', defaultLanguage: 'en', finishes: ['normal'] },
    { id: 'bs-3', setCode: 'BS', number: '3', name: 'C', defaultLanguage: 'en', finishes: ['normal'] },
    { id: 'pr-1', setCode: 'PR', number: '1', name: 'D', defaultLanguage: 'en', finishes: ['normal'] },
  ])
  await setCardQuantity(ctx.db, 'u1', 'bs-1', 'normal', 3) // duplicate (>1)
  await setCardQuantity(ctx.db, 'u1', 'bs-1', 'holo', 1)
  await setCardQuantity(ctx.db, 'u1', 'bs-2', 'normal', 1)
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('collection read queries', () => {
  it('lists distinct owned card ids', async () => {
    expect((await getOwnedCardIds(ctx.db, 'u1')).sort()).toEqual(['bs-1', 'bs-2'])
  })

  it('lists cards with a duplicate finish', async () => {
    expect(await getDuplicateCardIds(ctx.db, 'u1')).toEqual(['bs-1'])
  })

  it('computes per-set completion (distinct owned / cardCount)', async () => {
    const p = await getCollectionSetProgress(ctx.db, 'u1')
    expect(p.find((s) => s.setCode === 'BS')).toEqual({ setCode: 'BS', owned: 2, total: 3 })
    expect(p.find((s) => s.setCode === 'PR')).toEqual({ setCode: 'PR', owned: 0, total: 1 })
  })

  it('summarises distinct owned, total cards, and physical copies', async () => {
    const s = await getCollectionSummary(ctx.db, 'u1')
    expect(s).toEqual({ distinctOwned: 2, totalCards: 4, totalCopies: 5 }) // 3 + 1 + 1
  })

  it('resolves an owner by username, case-insensitively, else null', async () => {
    expect(await resolveCollectionOwner(ctx.db, 'ann')).toEqual({ userId: 'u1', username: 'ann' })
    expect(await resolveCollectionOwner(ctx.db, 'ANN')).toEqual({ userId: 'u1', username: 'ann' })
    expect(await resolveCollectionOwner(ctx.db, 'ghost')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/ingest -- collection-read`
Expected: FAIL — `getOwnedCardIds` not exported.

- [ ] **Step 3: Write the read queries**

Append to `app/db/src/queries.ts`:

```ts
// --- collection: read path ---

export async function getOwnedCardIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ cardId: userCards.cardId })
    .from(userCards).where(eq(userCards.userId, userId))
  return rows.map((r) => r.cardId)
}

export async function getDuplicateCardIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ cardId: userCards.cardId })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), sql`${userCards.quantity} > 1`))
  return rows.map((r) => r.cardId)
}

export async function getOwnedQuantities(
  db: DB, userId: string, cardIds: string[],
): Promise<OwnedQuantities> {
  if (cardIds.length === 0) return {}
  const rows = await db.select({ cardId: userCards.cardId, finish: userCards.finish, quantity: userCards.quantity })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, cardIds)))
  const out: OwnedQuantities = {}
  for (const r of rows) {
    ;(out[r.cardId] ??= {})[r.finish] = r.quantity
  }
  return out
}

export async function getCollectionSetProgress(db: DB, userId: string): Promise<SetProgress[]> {
  // For every set, count distinct owned cards (left join so empty sets show 0),
  // against the set's cardCount. `count(distinct uc.card_id)` ignores the finish
  // dimension → completion is finish-agnostic.
  const rows = await db
    .select({
      setCode: sets.code,
      total: sets.cardCount,
      owned: sql<number>`count(distinct ${userCards.cardId})`,
    })
    .from(sets)
    .leftJoin(cards, eq(cards.setCode, sets.code))
    .leftJoin(
      userCards,
      and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId)),
    )
    .groupBy(sets.code, sets.cardCount, sets.releaseDate)
    .orderBy(asc(sets.releaseDate), asc(sets.code))
  return rows.map((r) => ({ setCode: r.setCode, owned: Number(r.owned), total: r.total }))
}

export async function getCollectionSummary(db: DB, userId: string): Promise<CollectionSummary> {
  const [distinct] = await db.select({ n: sql<number>`count(distinct ${userCards.cardId})` })
    .from(userCards).where(eq(userCards.userId, userId))
  const [copies] = await db.select({ n: sql<number>`coalesce(sum(${userCards.quantity}), 0)` })
    .from(userCards).where(eq(userCards.userId, userId))
  const [total] = await db.select({ n: count(cards.id) }).from(cards)
  return {
    distinctOwned: Number(distinct?.n ?? 0),
    totalCards: Number(total?.n ?? 0),
    totalCopies: Number(copies?.n ?? 0),
  }
}

export async function getCollectionVisibility(db: DB, userId: string): Promise<CollectionVisibility> {
  const [row] = await db.select({ visibility: collections.visibility })
    .from(collections).where(eq(collections.userId, userId)).limit(1)
  return (row?.visibility as CollectionVisibility) ?? 'private'
}

export async function resolveCollectionOwner(
  db: DB, key: string,
): Promise<{ userId: string; username: string | null } | null> {
  // Prefer username (case-insensitive), fall back to a raw user id.
  const [byName] = await db.select({ userId: user.id, username: user.username })
    .from(user).where(sql`lower(${user.username}) = lower(${key})`).limit(1)
  if (byName) return { userId: byName.userId, username: byName.username }
  const [byId] = await db.select({ userId: user.id, username: user.username })
    .from(user).where(eq(user.id, key)).limit(1)
  return byId ? { userId: byId.userId, username: byId.username } : null
}
```

- [ ] **Step 4: Run both collection test files to verify they pass**

Run: `npm test -w @revelio/ingest -- collection-read`
Run: `npm test -w @revelio/ingest -- collection-write`
Expected: both PASS (the quantity read-backs in collection-write now resolve).

- [ ] **Step 5: Commit**

```bash
git add app/db/src/queries.ts app/ingest/test/collection-read.test.ts
git commit -m "feat(db): collection read queries (ownership, progress, summary, owner resolution)"
```

---

## Task 5: Search — id-based filter for ownership

**Files:**
- Modify: `app/search/src/search.ts` (`CardFilters`, `buildFilter`)
- Modify: `app/search/src/documents.ts` (`filterableAttributes`)
- Test: `app/search/test/search.test.ts`

**Interfaces:**
- Consumes: existing `CardFilters` / `buildFilter`.
- Produces: `CardFilters.ids?: string[]` and `CardFilters.excludeIds?: string[]`, emitted as `id IN [...]` / `id NOT IN [...]`.

- [ ] **Step 1: Write the failing test**

Add to `app/search/test/search.test.ts` (import `buildFilter` if not already):

```ts
import { buildFilter } from '../src/search'

describe('buildFilter id ownership clauses', () => {
  it('emits an IN clause for ids', () => {
    expect(buildFilter({ ids: ['a', 'b'] })).toContain('id IN ["a","b"]')
  })
  it('emits a NOT IN clause for excludeIds', () => {
    expect(buildFilter({ excludeIds: ['a'] })).toContain('id NOT IN ["a"]')
  })
  it('emits nothing for empty id arrays', () => {
    expect(buildFilter({ ids: [], excludeIds: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @revelio/search -- search`
Expected: FAIL — no `id IN` clause emitted.

- [ ] **Step 3: Implement**

In `app/search/src/search.ts`, extend the type and function:

```ts
export type CardFilters = {
  setCode?: string[]
  types?: string[]
  subTypes?: string[]
  lesson?: string[]
  rarity?: string[]
  finishes?: string[]
  legality?: string[]
  isOfficial?: boolean
  costMin?: number
  costMax?: number
  ids?: string[]        // restrict to these card ids (ownership: owned/dupes)
  excludeIds?: string[] // exclude these card ids (ownership: missing)
}
```

At the end of `buildFilter`, before `return clauses`:

```ts
  if (f.ids && f.ids.length) {
    clauses.push(`id IN [${f.ids.map((v) => JSON.stringify(v)).join(',')}]`)
  }
  if (f.excludeIds && f.excludeIds.length) {
    clauses.push(`id NOT IN [${f.excludeIds.map((v) => JSON.stringify(v)).join(',')}]`)
  }
```

In `app/search/src/documents.ts`, add `'id'` to `filterableAttributes`:

```ts
  filterableAttributes: [
    'id', 'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality', 'cost', 'isOfficial',
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @revelio/search -- search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/search/src/search.ts app/search/src/documents.ts app/search/test/search.test.ts
git commit -m "feat(search): id IN/NOT IN filter for ownership queries"
```

> **Deployment note (not a code step):** making `id` filterable requires re-applying `CARD_INDEX_SETTINGS` to the live indexes (`index.updateSettings(CARD_INDEX_SETTINGS)` — run the ingest job or a settings sync). No document reindex is needed.

---

## Task 6: Web — ownership search params & filter translation

**Files:**
- Create: `app/web/src/lib/collection-search.ts`
- Test: `app/web/src/lib/__tests__/collection-search.test.ts`

**Interfaces:**
- Consumes: `OwnershipFilter` from `@revelio/core`; `SearchState` / `toSearchOptions` from `./search-params`; `SearchOptions` from `@revelio/search`.
- Produces:
  - `parseOwnership(sp: URLSearchParams): OwnershipFilter | null` (from `?owned=owned|missing|dupes`)
  - `applyOwnership(options: SearchOptions, ownership: OwnershipFilter | null, ownedIds: string[], dupeIds: string[]): SearchOptions`

- [ ] **Step 1: Write the failing test**

```ts
// app/web/src/lib/__tests__/collection-search.test.ts
import { describe, it, expect } from 'vitest'
import { parseOwnership, applyOwnership } from '../collection-search'

describe('parseOwnership', () => {
  it('reads a valid value', () => {
    expect(parseOwnership(new URLSearchParams('owned=missing'))).toBe('missing')
  })
  it('returns null for absent/invalid', () => {
    expect(parseOwnership(new URLSearchParams(''))).toBeNull()
    expect(parseOwnership(new URLSearchParams('owned=nope'))).toBeNull()
  })
})

describe('applyOwnership', () => {
  const base = { filters: {}, page: 1, hitsPerPage: 24 }
  it('owned -> ids', () => {
    const o = applyOwnership(base, 'owned', ['a', 'b'], ['a'])
    expect(o.filters?.ids).toEqual(['a', 'b'])
  })
  it('missing -> excludeIds', () => {
    const o = applyOwnership(base, 'missing', ['a', 'b'], [])
    expect(o.filters?.excludeIds).toEqual(['a', 'b'])
  })
  it('dupes -> ids from duplicates', () => {
    const o = applyOwnership(base, 'dupes', ['a', 'b'], ['b'])
    expect(o.filters?.ids).toEqual(['b'])
  })
  it('null -> unchanged', () => {
    expect(applyOwnership(base, null, ['a'], ['a']).filters?.ids).toBeUndefined()
  })
  it('owned with nothing owned -> impossible match (empty ids kept as [""]-style guard)', () => {
    const o = applyOwnership(base, 'owned', [], [])
    expect(o.filters?.ids).toEqual([' ']) // sentinel: matches no card
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- collection-search`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/web/src/lib/collection-search.ts
import type { OwnershipFilter } from '@revelio/core'
import type { SearchOptions } from '@revelio/search'

const VALUES: OwnershipFilter[] = ['owned', 'missing', 'dupes']

export function parseOwnership(sp: URLSearchParams): OwnershipFilter | null {
  const v = sp.get('owned')
  return VALUES.includes(v as OwnershipFilter) ? (v as OwnershipFilter) : null
}

// A sentinel id that matches no card, so "owned" with an empty collection
// returns zero hits rather than silently dropping the filter (which would show
// everything). "missing" with nothing owned correctly excludes nothing.
const NONE = ' '

export function applyOwnership(
  options: SearchOptions,
  ownership: OwnershipFilter | null,
  ownedIds: string[],
  dupeIds: string[],
): SearchOptions {
  if (!ownership) return options
  const filters = { ...(options.filters ?? {}) }
  if (ownership === 'owned') filters.ids = ownedIds.length ? ownedIds : [NONE]
  else if (ownership === 'dupes') filters.ids = dupeIds.length ? dupeIds : [NONE]
  else if (ownership === 'missing') filters.excludeIds = ownedIds
  return { ...options, filters }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- collection-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/collection-search.ts app/web/src/lib/__tests__/collection-search.test.ts
git commit -m "feat(web): ownership search-param parsing and filter translation"
```

---

## Task 7: Web — collection server actions

**Files:**
- Create: `app/web/src/lib/collection-actions.ts`
- Test: `app/web/src/lib/__tests__/collection-actions.test.ts`

**Interfaces:**
- Consumes: `getSession` (`@/lib/session`), `getDb` (`@/lib/db`), `setCardQuantity`, `setCollectionVisibility`, `getCardFinishes` (`@revelio/db`), `CollectionVisibility`, `isFinishAllowed` (`@revelio/core`), `revalidatePath`.
- Produces:
  - `type CollectionActionResult = { ok: true } | { ok: false; error: string }`
  - `setCardQuantityAction(cardId: string, finish: string, quantity: number): Promise<CollectionActionResult>`
  - `setCollectionVisibilityAction(visibility: unknown): Promise<CollectionActionResult>`

- [ ] **Step 1: Write the failing test**

```ts
// app/web/src/lib/__tests__/collection-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1' } })),
  getCardFinishes: vi.fn(async () => ['normal', 'holo']),
  setCardQuantity: vi.fn(async () => {}),
  setCollectionVisibility: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getCardFinishes: m.getCardFinishes,
  setCardQuantity: m.setCardQuantity,
  setCollectionVisibility: m.setCollectionVisibility,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { setCardQuantityAction, setCollectionVisibilityAction } from '../collection-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1' } })
  m.getCardFinishes.mockResolvedValue(['normal', 'holo'])
})

describe('setCardQuantityAction', () => {
  it('rejects an unauthenticated user before writing', async () => {
    m.getSession.mockResolvedValueOnce(null)
    expect(await setCardQuantityAction('bs-1', 'normal', 1)).toEqual({ ok: false, error: 'auth' })
    expect(m.setCardQuantity).not.toHaveBeenCalled()
  })

  it('rejects a finish the card does not offer', async () => {
    m.getCardFinishes.mockResolvedValueOnce(['normal'])
    expect(await setCardQuantityAction('bs-1', 'holo', 1)).toEqual({ ok: false, error: 'finish' })
    expect(m.setCardQuantity).not.toHaveBeenCalled()
  })

  it('rejects an unknown card', async () => {
    m.getCardFinishes.mockResolvedValueOnce(null)
    expect(await setCardQuantityAction('nope', 'normal', 1)).toEqual({ ok: false, error: 'invalid' })
  })

  it('clamps negative quantity to zero and writes', async () => {
    expect(await setCardQuantityAction('bs-1', 'normal', -3)).toEqual({ ok: true })
    expect(m.setCardQuantity).toHaveBeenCalledWith({}, 'u1', 'bs-1', 'normal', 0)
    expect(m.revalidatePath).toHaveBeenCalledWith('/collection')
  })

  it('writes a valid quantity', async () => {
    expect(await setCardQuantityAction('bs-1', 'holo', 2)).toEqual({ ok: true })
    expect(m.setCardQuantity).toHaveBeenCalledWith({}, 'u1', 'bs-1', 'holo', 2)
  })
})

describe('setCollectionVisibilityAction', () => {
  it('rejects an invalid visibility', async () => {
    expect(await setCollectionVisibilityAction('secret')).toEqual({ ok: false, error: 'invalid' })
  })
  it('sets a valid visibility', async () => {
    expect(await setCollectionVisibilityAction('public')).toEqual({ ok: true })
    expect(m.setCollectionVisibility).toHaveBeenCalledWith({}, 'u1', 'public')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- collection-actions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/web/src/lib/collection-actions.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { CollectionVisibility, isFinishAllowed } from '@revelio/core'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getCardFinishes, setCardQuantity, setCollectionVisibility } from '@revelio/db'

export type CollectionActionResult = { ok: true } | { ok: false; error: string }

async function requireUserId(): Promise<string | null> {
  const s = await getSession()
  return s?.user?.id ?? null
}

const qtySchema = z.object({
  cardId: z.string().min(1),
  finish: z.string().min(1),
  quantity: z.number().int(),
})

export async function setCardQuantityAction(
  cardId: string, finish: string, quantity: number,
): Promise<CollectionActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = qtySchema.safeParse({ cardId, finish, quantity })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const finishes = await getCardFinishes(getDb(), cardId)
  if (!finishes) return { ok: false, error: 'invalid' }
  if (!isFinishAllowed(finishes, finish)) return { ok: false, error: 'finish' }

  await setCardQuantity(getDb(), userId, cardId, finish, Math.max(0, quantity))
  revalidatePath('/collection')
  revalidatePath(`/card/${cardId}`)
  return { ok: true }
}

export async function setCollectionVisibilityAction(visibility: unknown): Promise<CollectionActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = CollectionVisibility.safeParse(visibility)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  await setCollectionVisibility(getDb(), userId, parsed.data)
  revalidatePath('/collection')
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- collection-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/collection-actions.ts app/web/src/lib/__tests__/collection-actions.test.ts
git commit -m "feat(web): collection server actions (set quantity, visibility)"
```

---

## Task 8: Web — finish stepper + card ownership overlay components

**Files:**
- Create: `app/web/src/components/card-finish-stepper.tsx`
- Create: `app/web/src/components/collection-card-tile.tsx`
- Test: `app/web/src/components/__tests__/collection-card-tile.test.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (add `collection` namespace)

**Interfaces:**
- Consumes: `setCardQuantityAction` (Task 7); `attrLabel` (`@/lib/attribute-labels`); shadcn `ui/button`, `ui/badge`. A card-view shape `{ id: string; name: string; finishes: string[]; thumbKey?: string; imageUrl?: string; orientation?: string }` (subset of the existing `CardView` used by `CardTile`).
- Produces:
  - `CardFinishStepper({ cardId, finish, label, quantity, editable }): JSX` — a `− n +` row; on change calls `setCardQuantityAction(cardId, finish, next)` and shows optimistic state.
  - `CollectionCardTile({ card, quantities, editable })` — greys the art when `sum(quantities)===0`, shows a total-owned `ui/badge`, and on hover reveals a `CardFinishStepper` per `card.finishes`.

- [ ] **Step 1: Add i18n keys**

In `app/web/messages/en.json`, add a top-level `"collection"` object:

```json
"collection": {
  "title": "My Collection",
  "owned": "{count} owned",
  "ofTotal": "{owned} / {total}",
  "copies": "{count} copies",
  "distinct": "{owned} / {total} cards",
  "browseAll": "Browse all",
  "bySets": "By set",
  "addToCollection": "Add to collection",
  "inCollection": "In collection",
  "ownership": "Ownership",
  "filterOwned": "Owned",
  "filterMissing": "Missing",
  "filterDupes": "Duplicates",
  "visibility": "Collection visibility",
  "private": "Private",
  "public": "Public",
  "shareLink": "Copy share link",
  "empty": "You don't own any cards yet."
}
```

Add the same keys to `app/web/messages/de.json` with German values (`"title": "Meine Sammlung"`, `"owned": "{count} im Besitz"`, `"ofTotal": "{owned} / {total}"`, `"copies": "{count} Exemplare"`, `"distinct": "{owned} / {total} Karten"`, `"browseAll": "Alle durchsuchen"`, `"bySets": "Nach Set"`, `"addToCollection": "Zur Sammlung hinzufügen"`, `"inCollection": "In Sammlung"`, `"ownership": "Besitz"`, `"filterOwned": "Im Besitz"`, `"filterMissing": "Fehlt"`, `"filterDupes": "Duplikate"`, `"visibility": "Sichtbarkeit der Sammlung"`, `"private": "Privat"`, `"public": "Öffentlich"`, `"shareLink": "Freigabelink kopieren"`, `"empty": "Du besitzt noch keine Karten."`).

- [ ] **Step 2: Write the failing test**

```tsx
// app/web/src/components/__tests__/collection-card-tile.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CollectionCardTile } from '../collection-card-tile'

vi.mock('@/lib/collection-actions', () => ({ setCardQuantityAction: vi.fn(async () => ({ ok: true })) }))

const messages = { collection: { owned: '{count} owned' }, filters: {}, card: {} }
const card = { id: 'bs-1', name: 'Harry', finishes: ['normal', 'holo'] }

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>)
}

describe('CollectionCardTile', () => {
  it('marks a card with zero owned as not-owned', () => {
    wrap(<CollectionCardTile card={card} quantities={{}} editable />)
    expect(screen.getByTestId('card-tile-bs-1').dataset.owned).toBe('false')
  })
  it('marks a card with any owned copy as owned and shows the total badge', () => {
    wrap(<CollectionCardTile card={card} quantities={{ normal: 2, holo: 1 }} editable />)
    const tile = screen.getByTestId('card-tile-bs-1')
    expect(tile.dataset.owned).toBe('true')
    expect(screen.getByTestId('owned-badge-bs-1').textContent).toBe('3')
  })
  it('renders one stepper per card finish', () => {
    wrap(<CollectionCardTile card={card} quantities={{}} editable />)
    expect(screen.getAllByTestId(/^stepper-bs-1-/)).toHaveLength(2)
  })
  it('hides steppers when not editable', () => {
    wrap(<CollectionCardTile card={card} quantities={{ normal: 1 }} editable={false} />)
    expect(screen.queryByTestId(/^stepper-bs-1-/)).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- collection-card-tile`
Expected: FAIL — components not found.

- [ ] **Step 4: Implement the stepper**

```tsx
// app/web/src/components/card-finish-stepper.tsx
'use client'
import { useState, useTransition } from 'react'
import { Minus, Plus } from 'lucide-react'
import { setCardQuantityAction } from '@/lib/collection-actions'
import { cn } from '@/lib/utils'

export function CardFinishStepper({
  cardId, finish, label, quantity, editable = true,
}: {
  cardId: string
  finish: string
  label: string
  quantity: number
  editable?: boolean
}) {
  const [qty, setQty] = useState(quantity)
  const [pending, start] = useTransition()

  function commit(next: number) {
    const target = Math.max(0, next)
    setQty(target) // optimistic
    start(async () => {
      const res = await setCardQuantityAction(cardId, finish, target)
      if (!res.ok) setQty(quantity) // revert on failure
    })
  }

  return (
    <div
      data-testid={`stepper-${cardId}-${finish}`}
      className={cn('flex items-center justify-between gap-2 rounded-md border border-input bg-background/70 px-2 py-1', qty > 0 && 'border-primary')}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      {editable ? (
        <span className="flex items-center gap-1.5">
          <button aria-label={`decrement ${label}`} disabled={pending || qty === 0}
            onClick={() => commit(qty - 1)}
            className="grid size-5 place-items-center rounded border border-input disabled:opacity-40">
            <Minus className="size-3" />
          </button>
          <span className="min-w-4 text-center text-sm font-semibold tabular-nums">{qty}</span>
          <button aria-label={`increment ${label}`} disabled={pending}
            onClick={() => commit(qty + 1)}
            className="grid size-5 place-items-center rounded bg-primary text-primary-foreground">
            <Plus className="size-3" />
          </button>
        </span>
      ) : (
        <span className="text-sm font-semibold tabular-nums">{qty}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement the tile**

```tsx
// app/web/src/components/collection-card-tile.tsx
'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { CardRotate } from '@/components/card-rotate'
import { Badge } from '@/components/ui/badge'
import { CardFinishStepper } from '@/components/card-finish-stepper'
import { attrLabel } from '@/lib/attribute-labels'
import { cn } from '@/lib/utils'

export type CollectionCard = {
  id: string
  name: string
  finishes: string[]
  thumbKey?: string
  imageUrl?: string
  orientation?: string
}

export function CollectionCardTile({
  card, quantities, editable, locale = 'en',
}: {
  card: CollectionCard
  quantities: Record<string, number>
  editable: boolean
  locale?: string
}) {
  const t = useTranslations('collection')
  const total = Object.values(quantities).reduce((a, b) => a + b, 0)
  const owned = total > 0

  return (
    <div data-testid={`card-tile-${card.id}`} data-owned={owned} className="group relative">
      <Link href={`/card/${card.id}`} className={cn('block overflow-hidden rounded-lg', !owned && 'opacity-45 grayscale')}>
        <CardRotate imageUrl={card.imageUrl} thumbKey={card.thumbKey} alt={card.name} orientation={card.orientation} />
      </Link>
      {owned && (
        <Badge data-testid={`owned-badge-${card.id}`} className="absolute right-1.5 top-1.5 shadow">
          {total}
        </Badge>
      )}
      {editable && (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 flex flex-col gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          {card.finishes.map((f) => (
            <CardFinishStepper key={f} cardId={card.id} finish={f}
              label={attrLabel('finishes', f, locale)} quantity={quantities[f] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}
```

> If `CardRotate`'s prop names differ from the above, match its actual signature (see `app/web/src/components/card-rotate.tsx`) — it already renders the thumbnail with orientation used by `CardTile`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w web -- collection-card-tile`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/card-finish-stepper.tsx app/web/src/components/collection-card-tile.tsx app/web/src/components/__tests__/collection-card-tile.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): finish stepper and collection card tile with ownership overlay"
```

---

## Task 9: Web — "Add to collection" popover on the card detail page

**Files:**
- Create: `app/web/src/components/add-to-collection-popover.tsx`
- Modify: `app/web/src/components/card-detail.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/page.tsx`

**Interfaces:**
- Consumes: `CardFinishStepper` (Task 8); shadcn `ui/popover`, `ui/button`; `getOwnedQuantities`, `getCardFinishes` via the page (server). `attrLabel`.
- Produces: `AddToCollectionPopover({ cardId, finishes, quantities, locale })` — the option-C control (button → popover of steppers).

- [ ] **Step 1: Ensure the shadcn popover primitive exists**

Check for `app/web/src/components/ui/popover.tsx`. If absent, add it: `cd app && npx shadcn@latest add popover -c web` (writes `ui/popover.tsx`). Commit the generated file with this task.

- [ ] **Step 2: Implement the popover**

```tsx
// app/web/src/components/add-to-collection-popover.tsx
'use client'
import { useTranslations } from 'next-intl'
import { Library } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CardFinishStepper } from '@/components/card-finish-stepper'
import { attrLabel } from '@/lib/attribute-labels'

export function AddToCollectionPopover({
  cardId, finishes, quantities, locale,
}: {
  cardId: string
  finishes: string[]
  quantities: Record<string, number>
  locale: string
}) {
  const t = useTranslations('collection')
  const total = Object.values(quantities).reduce((a, b) => a + b, 0)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={total > 0 ? 'secondary' : 'default'} size="sm" className="gap-1.5">
          <Library className="size-3.5" />
          {total > 0 ? `${t('inCollection')} · ${total}` : t('addToCollection')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2">
        {finishes.map((f) => (
          <CardFinishStepper key={f} cardId={cardId} finish={f}
            label={attrLabel('finishes', f, locale)} quantity={quantities[f] ?? 0} />
        ))}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3: Wire it into `card-detail.tsx`**

Add props to the `CardDetail` component signature:

```tsx
export function CardDetail({
  card, locale, imageBase, canEdit = false, subTypeLabels = {},
  canCollect = false, ownedQuantities = {},
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
  canEdit?: boolean
  subTypeLabels?: Record<string, string>
  canCollect?: boolean
  ownedQuantities?: Record<string, number>
}) {
```

Add the import at the top:

```tsx
import { AddToCollectionPopover } from '@/components/add-to-collection-popover'
```

In the action area (the `flex items-start justify-between` block that currently holds only the edit button), render the popover before/after the edit button. Replace the `{canEdit && (...)}` region with:

```tsx
<div className="flex shrink-0 items-center gap-2">
  {canCollect && (
    <AddToCollectionPopover cardId={card.id} finishes={card.finishes}
      quantities={ownedQuantities} locale={locale} />
  )}
  {canEdit && (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/card/${card.id}/edit`}>
        <Pencil className="size-3.5" />
        {tEdit('button')}
      </Link>
    </Button>
  )}
</div>
```

- [ ] **Step 4: Feed the data from the page**

In `app/web/src/app/[locale]/card/[id]/page.tsx`, where `session` and `canEdit` are computed, add:

```tsx
import { getDb } from '@/lib/db'
import { getOwnedQuantities } from '@revelio/db'
// ...
const userId = session?.user?.id
const ownedQuantities = userId
  ? (await getOwnedQuantities(getDb(), userId, [card.id]))[card.id] ?? {}
  : {}
```

And pass to the component:

```tsx
<CardDetail
  card={card} locale={locale} imageBase={imageBase} canEdit={canEdit}
  subTypeLabels={subTypeLabels}
  canCollect={!!userId} ownedQuantities={ownedQuantities}
/>
```

- [ ] **Step 5: Verify typecheck + build**

Run: `cd app && npm run typecheck && npm run lint -w web`
Expected: PASS. Then manually drive it (Task 14 covers full end-to-end verification): the detail page shows "Add to collection", increments persist after reload.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/add-to-collection-popover.tsx app/web/src/components/card-detail.tsx app/web/src/app/[locale]/card/[id]/page.tsx app/web/src/components/ui/popover.tsx
git commit -m "feat(web): add-to-collection popover on the card detail page"
```

---

## Task 10: Web — sidebar, summary, and set progress components

**Files:**
- Create: `app/web/src/components/collection-summary.tsx`
- Create: `app/web/src/components/collection-sidebar.tsx`
- Test: `app/web/src/components/__tests__/collection-sidebar.test.tsx`

**Interfaces:**
- Consumes: `SetProgress`, `CollectionSummary`, `SetDTO` (`@revelio/core`); next-intl navigation `Link`; shadcn `ui/progress` (add via CLI if missing).
- Produces:
  - `CollectionSummary({ summary })` — totals header (`distinctOwned / totalCards`, `totalCopies`).
  - `CollectionSidebar({ sets, progress, selected, hrefFor })` — set list with `ui/progress` bars and `owned/total`; highlights `selected`; each row links to `hrefFor(setCode)`.

- [ ] **Step 1: Ensure `ui/progress` exists**

Check `app/web/src/components/ui/progress.tsx`. If absent: `cd app && npx shadcn@latest add progress -c web`.

- [ ] **Step 2: Write the failing test**

```tsx
// app/web/src/components/__tests__/collection-sidebar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CollectionSidebar } from '../collection-sidebar'

const messages = { collection: { ofTotal: '{owned} / {total}' } }
const sets = [
  { code: 'BS', name: 'Base', releaseDate: null, isOfficial: true, cardCount: 3, symbol: null },
  { code: 'PR', name: 'Promo', releaseDate: null, isOfficial: false, cardCount: 1, symbol: null },
]
const progress = [
  { setCode: 'BS', owned: 2, total: 3 },
  { setCode: 'PR', owned: 0, total: 1 },
]

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>)
}

describe('CollectionSidebar', () => {
  it('lists every set with its owned/total count', () => {
    wrap(<CollectionSidebar sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?set=${c}`} />)
    expect(screen.getByText('Base')).toBeTruthy()
    expect(screen.getByText('2 / 3')).toBeTruthy()
    expect(screen.getByText('0 / 1')).toBeTruthy()
  })
  it('marks the selected set active', () => {
    wrap(<CollectionSidebar sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?set=${c}`} />)
    expect(screen.getByTestId('set-row-BS').dataset.active).toBe('true')
    expect(screen.getByTestId('set-row-PR').dataset.active).toBe('false')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- collection-sidebar`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the summary**

```tsx
// app/web/src/components/collection-summary.tsx
import { useTranslations } from 'next-intl'
import type { CollectionSummary as Summary } from '@revelio/core'

export function CollectionSummary({ summary }: { summary: Summary }) {
  const t = useTranslations('collection')
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="text-base font-semibold text-foreground">
        {t('distinct', { owned: summary.distinctOwned, total: summary.totalCards })}
      </span>
      <span>{t('copies', { count: summary.totalCopies })}</span>
    </div>
  )
}
```

- [ ] **Step 5: Implement the sidebar**

```tsx
// app/web/src/components/collection-sidebar.tsx
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Progress } from '@/components/ui/progress'
import { SetSymbol } from '@/components/set-symbol'
import type { SetDTO, SetProgress } from '@revelio/core'
import { cn } from '@/lib/utils'

export function CollectionSidebar({
  sets, progress, selected, hrefFor,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
}) {
  const t = useTranslations('collection')
  const byCode = new Map(progress.map((p) => [p.setCode, p]))
  return (
    <nav className="flex flex-col gap-1">
      {sets.map((s) => {
        const p = byCode.get(s.code) ?? { owned: 0, total: s.cardCount }
        const pct = p.total > 0 ? Math.round((p.owned / p.total) * 100) : 0
        const active = s.code === selected
        return (
          <Link key={s.code} href={hrefFor(s.code)}
            data-testid={`set-row-${s.code}`} data-active={active}
            className={cn('rounded-lg px-3 py-2 transition-colors hover:bg-accent/50', active && 'bg-accent')}>
            <div className="flex items-center gap-2">
              <SetSymbol code={s.code} symbol={s.symbol} className="size-4 shrink-0" />
              <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('ofTotal', { owned: p.owned, total: p.total })}
              </span>
            </div>
            <Progress value={pct} className="mt-1.5 h-1" />
          </Link>
        )
      })}
    </nav>
  )
}
```

> Match `SetSymbol`'s real props (see `app/web/src/components/set-symbol.tsx`); pass whatever it needs to render a set's symbol.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w web -- collection-sidebar`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/collection-summary.tsx app/web/src/components/collection-sidebar.tsx app/web/src/components/__tests__/collection-sidebar.test.tsx app/web/src/components/ui/progress.tsx
git commit -m "feat(web): collection summary and set-progress sidebar"
```

---

## Task 11: Web — collection filter drawer (ownership group)

**Files:**
- Modify: `app/web/src/components/filter-sheet.tsx` (add optional ownership group)
- Create: `app/web/src/components/collection-filter-drawer.tsx`

**Interfaces:**
- Consumes: `FilterSheet` (`filter-sheet.tsx`), `FilterSelection`; `OwnershipFilter` (`@revelio/core`); the URL-adapter pattern from `filter-drawer.tsx`.
- Produces: `CollectionFilterDrawer` — a URL-bound adapter that renders `FilterSheet` plus an Ownership radio group (`Owned / Missing / Duplicates`), writing `?owned=` to the URL.

- [ ] **Step 1: Extend `FilterSheet` with an optional ownership slot**

In `app/web/src/components/filter-sheet.tsx`, add to the `show` prop and render an ownership radio group only when provided. Add to the props type:

```tsx
  show?: { lessons?: boolean; official?: boolean }
  ownership?: {
    value: '' | 'owned' | 'missing' | 'dupes'
    onChange: (v: '' | 'owned' | 'missing' | 'dupes') => void
  }
```

Then, inside the sheet body (near the other groups), add:

```tsx
{ownership && (
  <div className="space-y-2">
    <p className="text-sm font-medium">{t('ownership')}</p>
    <div className="flex flex-wrap gap-2">
      {(['owned', 'missing', 'dupes'] as const).map((v) => (
        <Button key={v} type="button" size="sm"
          variant={ownership.value === v ? 'default' : 'outline'}
          onClick={() => ownership.onChange(ownership.value === v ? '' : v)}>
          {t(v === 'owned' ? 'filterOwned' : v === 'missing' ? 'filterMissing' : 'filterDupes')}
        </Button>
      ))}
    </div>
  </div>
)}
```

Add `const t = useTranslations('filters')` already exists; the ownership labels live under `collection` — either add these three keys to the `filters` namespace too, or use a second `const tc = useTranslations('collection')` and call `tc(...)`. Use `tc` to avoid duplicating keys:

```tsx
const tc = useTranslations('collection')
// ...use tc('ownership'), tc('filterOwned') etc.
```

- [ ] **Step 2: Create the URL adapter**

Model this on the existing `filter-drawer.tsx` (read it first for the exact URL read/write helpers). It should read the current `FilterSelection` from the URL, read `?owned=`, and on apply push both the standard params and `owned`:

```tsx
// app/web/src/components/collection-filter-drawer.tsx
'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { FilterSheet, type FilterSelection } from '@/components/filter-sheet'
import { useState } from 'react'
import type { SetDTO } from '@revelio/core'

export function CollectionFilterDrawer({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [owned, setOwned] = useState<'' | 'owned' | 'missing' | 'dupes'>(
    (sp.get('owned') as '' | 'owned' | 'missing' | 'dupes') ?? '',
  )

  // Build FilterSelection from the URL exactly as FilterDrawer does.
  const value: FilterSelection = {
    types: sp.getAll('type'), lessons: sp.getAll('lesson'), rarities: sp.getAll('rarity'),
    finishes: sp.getAll('finish'), legalities: sp.getAll('legality'),
    set: sp.get('set') ?? '', costMin: sp.get('costMin') ?? '', costMax: sp.get('costMax') ?? '',
    official: sp.get('official') ?? '',
  }

  function apply(next: FilterSelection) {
    const p = new URLSearchParams()
    next.types.forEach((v) => p.append('type', v))
    next.lessons.forEach((v) => p.append('lesson', v))
    next.rarities.forEach((v) => p.append('rarity', v))
    next.finishes.forEach((v) => p.append('finish', v))
    next.legalities.forEach((v) => p.append('legality', v))
    if (next.set) p.set('set', next.set)
    if (next.costMin) p.set('costMin', next.costMin)
    if (next.costMax) p.set('costMax', next.costMax)
    if (next.official) p.set('official', next.official)
    if (owned) p.set('owned', owned)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <FilterSheet sets={sets} value={value} locale={locale} onApply={apply}
      show={{ lessons: true, official: true }}
      ownership={{ value: owned, onChange: setOwned }} />
  )
}
```

> Read `filter-drawer.tsx` first and reuse its exact param names/helpers; the block above is the shape, not a licence to diverge from the established URL contract.

- [ ] **Step 3: Verify typecheck + existing filter tests still pass**

Run: `cd app && npm run typecheck && npm test -w web -- filter`
Expected: PASS (adding an optional prop must not break `/search` or the deck builder).

- [ ] **Step 4: Commit**

```bash
git add app/web/src/components/filter-sheet.tsx app/web/src/components/collection-filter-drawer.tsx
git commit -m "feat(web): collection filter drawer with ownership group"
```

---

## Task 12: Web — owner collection page (`/collection`)

**Files:**
- Create: `app/web/src/app/[locale]/collection/page.tsx`
- Create: `app/web/src/components/collection-view.tsx`
- Create: `app/web/src/components/collection-visibility-toggle.tsx`

**Interfaces:**
- Consumes: session (`getSession`), `getDb`; DB reads `getCollectionSetProgress`, `getCollectionSummary`, `getOwnedQuantities`, `getOwnedCardIds`, `getDuplicateCardIds`, `getCollectionVisibility`, `listSets`; search via `getSearchClient`/`runSearch`; `parseSearchParams`, `toSearchOptions`; `parseOwnership`, `applyOwnership`; components from Tasks 8–11; shadcn `ui/tabs`.
- Produces: the owner-editable collection page. Two modes via `ui/tabs`: **By set** (sidebar + right-pane grid, driven by `?set=`) and **Browse all** (flat grid + `CollectionFilterDrawer`, driven by search params incl. `?owned=`).

- [ ] **Step 1: Ensure `ui/tabs` exists**

`ui/tabs` was added in PR #18 (`app/web/src/components/ui/tabs.tsx`). Confirm it's present; if not, `cd app && npx shadcn@latest add tabs -c web`.

- [ ] **Step 2: Build the shared view component**

```tsx
// app/web/src/components/collection-view.tsx
'use client'
import { useTranslations } from 'next-intl'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CollectionSidebar } from '@/components/collection-sidebar'
import { CollectionCardTile, type CollectionCard } from '@/components/collection-card-tile'
import { CollectionFilterDrawer } from '@/components/collection-filter-drawer'
import type { SetDTO, SetProgress, OwnedQuantities } from '@revelio/core'

export function CollectionView({
  sets, progress, selectedSet, cards, quantities, editable, locale, mode, browseCards,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selectedSet: string
  cards: CollectionCard[]           // cards of the selected set (By set mode)
  browseCards: CollectionCard[]     // flat search results (Browse all mode)
  quantities: OwnedQuantities
  editable: boolean
  locale: string
  mode: 'sets' | 'browse'
}) {
  const t = useTranslations('collection')
  const grid = (list: CollectionCard[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {list.map((c) => (
        <li key={c.id}>
          <CollectionCardTile card={c} quantities={quantities[c.id] ?? {}} editable={editable} locale={locale} />
        </li>
      ))}
    </ul>
  )
  return (
    <Tabs defaultValue={mode}>
      <TabsList>
        <TabsTrigger value="sets">{t('bySets')}</TabsTrigger>
        <TabsTrigger value="browse">{t('browseAll')}</TabsTrigger>
      </TabsList>
      <TabsContent value="sets">
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <aside className="hidden md:block"><CollectionSidebar sets={sets} progress={progress} selected={selectedSet} hrefFor={(c) => `?tab=sets&set=${c}`} /></aside>
          <div className="md:hidden"><CollectionSidebar sets={sets} progress={progress} selected={selectedSet} hrefFor={(c) => `?tab=sets&set=${c}`} /></div>
          <section className="hidden md:block">{grid(cards)}</section>
        </div>
      </TabsContent>
      <TabsContent value="browse">
        <div className="mb-4"><CollectionFilterDrawer sets={sets} locale={locale} /></div>
        {browseCards.length ? grid(browseCards) : <p className="text-muted-foreground">{t('empty')}</p>}
      </TabsContent>
    </Tabs>
  )
}
```

> On mobile the By-set tab shows only the set list; selecting a set sets `?set=` and the right pane (rendered below on `md:`) reflects it. If you prefer a distinct mobile route push, that's an acceptable refinement — the data contract is unchanged.

- [ ] **Step 3: Build the visibility toggle**

```tsx
// app/web/src/components/collection-visibility-toggle.tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setCollectionVisibilityAction } from '@/lib/collection-actions'

export function CollectionVisibilityToggle({ initial, shareUrl }: { initial: 'private' | 'public'; shareUrl: string }) {
  const t = useTranslations('collection')
  const [vis, setVis] = useState(initial)
  const [pending, start] = useTransition()
  function toggle() {
    const next = vis === 'public' ? 'private' : 'public'
    setVis(next)
    start(async () => {
      const res = await setCollectionVisibilityAction(next)
      if (!res.ok) setVis(vis)
    })
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
        {vis === 'public' ? t('public') : t('private')}
      </Button>
      {vis === 'public' && (
        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(shareUrl)}>
          {t('shareLink')}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build the page (server component)**

```tsx
// app/web/src/app/[locale]/collection/page.tsx
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import {
  listSets, getCollectionSetProgress, getCollectionSummary, getOwnedQuantities,
  getOwnedCardIds, getDuplicateCardIds, getCollectionVisibility,
} from '@revelio/db'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toSearchOptions } from '@/lib/search-params'
import { parseOwnership, applyOwnership } from '@/lib/collection-search'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'
import { CollectionVisibilityToggle } from '@/components/collection-visibility-toggle'
import { toCollectionCards } from '@/lib/collection-cards'

export default async function CollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const { locale } = await params
  const session = await getSession()
  const userId = session?.user?.id
  if (!userId) redirect(`/${locale}/login`)

  const db = getDb()
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
    else sp.set(k, v)
  }
  const tab = sp.get('tab') === 'browse' ? 'browse' : 'sets'

  const [sets, progress, summary, visibility] = await Promise.all([
    listSets(db, locale),
    getCollectionSetProgress(db, userId),
    getCollectionSummary(db, userId),
    getCollectionVisibility(db, userId),
  ])

  const selectedSet = sp.get('set') ?? sets[0]?.code ?? ''

  // By-set grid: the selected set's cards via Meili.
  const client = getSearchClient()
  const setState = { ...parseSearchParams(new URLSearchParams()), set: selectedSet, page: 1 }
  const setRes = await runSearch(client, locale, toSearchOptions(setState))

  // Browse grid: full search + ownership filter.
  const state = parseSearchParams(sp)
  const ownership = parseOwnership(sp)
  const [ownedIds, dupeIds] = await Promise.all([getOwnedCardIds(db, userId), getDuplicateCardIds(db, userId)])
  const { query, options } = toSearchOptions(state)
  const browseRes = tab === 'browse'
    ? await runSearch(client, locale, { query, options: applyOwnership(options, ownership, ownedIds, dupeIds) })
    : { hits: [] as typeof setRes.hits }

  const allHits = [...setRes.hits, ...browseRes.hits]
  const quantities = await getOwnedQuantities(db, userId, allHits.map((h) => h.id))

  const t = await getTranslations({ locale, namespace: 'collection' })
  const shareUrl = session.user.username ? `/collection/${session.user.username}` : `/collection/u/${userId}`

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
          <CollectionSummary summary={summary} />
        </div>
        <CollectionVisibilityToggle initial={visibility} shareUrl={shareUrl} />
      </div>
      <CollectionView
        sets={sets} progress={progress} selectedSet={selectedSet}
        cards={toCollectionCards(setRes.hits)} browseCards={toCollectionCards(browseRes.hits)}
        quantities={quantities} editable locale={locale} mode={tab}
      />
    </main>
  )
}
```

- [ ] **Step 5: Add the search-hit → CollectionCard mapper**

```tsx
// app/web/src/lib/collection-cards.ts
import type { SearchDocument } from '@revelio/search'
import { imageUrl, imageKey } from '@revelio/core'
import type { CollectionCard } from '@/components/collection-card-tile'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export function toCollectionCards(hits: SearchDocument[]): CollectionCard[] {
  return hits.map((h) => ({
    id: h.id,
    name: h.name,
    finishes: h.finishes ?? ['normal'],
    orientation: h.orientation,
    imageUrl: h.thumbKey ? imageUrl(IMAGE_BASE, h.thumbKey) : undefined,
  }))
}
```

> Match `SearchDocument`'s real field names for the thumbnail/orientation (see `app/search/src/documents.ts`); the mapper is the single place that adapts a hit to the tile.

- [ ] **Step 6: Verify**

Run: `cd app && npm run typecheck && npm run lint -w web`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/app/[locale]/collection/page.tsx app/web/src/components/collection-view.tsx app/web/src/components/collection-visibility-toggle.tsx app/web/src/lib/collection-cards.ts
git commit -m "feat(web): owner collection page (by-set + browse, visibility toggle)"
```

---

## Task 13: Web — public shared collection view + navbar entry

**Files:**
- Create: `app/web/src/app/[locale]/collection/[username]/page.tsx`
- Create: `app/web/src/app/[locale]/collection/u/[userId]/page.tsx`
- Create: `app/web/src/lib/collection-page-data.ts` (shared loader, DRY between owner/public — refactor Task 12 to use it)
- Modify: `app/web/src/components/site-header.tsx` (add "Collection" link for logged-in users)

**Interfaces:**
- Consumes: `resolveCollectionOwner`, `getCollectionVisibility`, plus the same reads as Task 12; `getSession`.
- Produces: read-only public pages (404 when private and not owner) rendering `CollectionView` with `editable={false}`.

- [ ] **Step 1: Extract a shared loader**

Create `app/web/src/lib/collection-page-data.ts` exporting `loadCollectionPage(db, client, locale, ownerId, sp, tab)` returning `{ sets, progress, summary, selectedSet, setCards, browseCards, quantities }` — move the data-loading body from Task 12's page into it and have both the owner page and public page call it. (This is a refactor of Task 12; keep behaviour identical, verified by `npm run typecheck`.)

- [ ] **Step 2: Public username page**

```tsx
// app/web/src/app/[locale]/collection/[username]/page.tsx
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { resolveCollectionOwner, getCollectionVisibility } from '@revelio/db'
import { getSearchClient } from '@/lib/search-client'
import { loadCollectionPage } from '@/lib/collection-page-data'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'

export default async function PublicCollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; username: string }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const { locale, username } = await params
  const db = getDb()
  const owner = await resolveCollectionOwner(db, decodeURIComponent(username))
  if (!owner) notFound()

  const session = await getSession()
  const isOwner = session?.user?.id === owner.userId
  const visibility = await getCollectionVisibility(db, owner.userId)
  if (visibility !== 'public' && !isOwner) notFound()

  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x)); else sp.set(k, v)
  }
  const tab = sp.get('tab') === 'browse' ? 'browse' : 'sets'
  const data = await loadCollectionPage(db, getSearchClient(), locale, owner.userId, sp, tab)
  const t = await getTranslations({ locale, namespace: 'collection' })

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <h1 className="text-2xl font-semibold text-primary">{owner.username ?? t('title')}</h1>
      <CollectionSummary summary={data.summary} />
      <div className="mt-6">
        <CollectionView
          sets={data.sets} progress={data.progress} selectedSet={data.selectedSet}
          cards={data.setCards} browseCards={data.browseCards} quantities={data.quantities}
          editable={false} locale={locale} mode={tab}
        />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Public userId fallback page**

Create `app/web/src/app/[locale]/collection/u/[userId]/page.tsx` — identical to Step 2 but resolve via `resolveCollectionOwner(db, userId)` using the `userId` param (the resolver already falls back to id lookup). Render the same way.

- [ ] **Step 4: Navbar entry**

In `app/web/src/components/site-header.tsx`, add a "Collection" link visible to logged-in users, next to the existing nav links, using the next-intl `Link` to `/collection` and the `collection.title` label. Follow the file's existing session/link pattern (read it first).

- [ ] **Step 5: Verify**

Run: `cd app && npm run typecheck && npm run lint -w web && npm test -w web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/app/[locale]/collection app/web/src/lib/collection-page-data.ts app/web/src/components/site-header.tsx
git commit -m "feat(web): public shared collection view and navbar entry"
```

---

## Task 14: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full workspace gate**

Run: `cd app && npm run typecheck && npm run lint -w web && npm test`
Expected: all green. (Ingest tests need Docker for Testcontainers.)

- [ ] **Step 2: DB check/verify**

Run: `cd app && npm run check -w @revelio/db && npm run verify -w @revelio/db`
Expected: PASS (no schema drift).

- [ ] **Step 3: Drive the app (use the `run`/`verify` skills)**

Start infra + app (`docker compose up`, `docker compose run --rm migrate`, `npm run dev -w web`), sign in, then confirm end-to-end:
  - Card detail page shows "Add to collection"; incrementing a finish and reloading persists the count; the badge total matches.
  - A finish not offered by a card cannot be added (only the card's finishes appear).
  - `/collection` By-set: sidebar lists all sets with progress; selecting a set shows its cards; owned in colour, unowned greyed; steppers persist.
  - `/collection` Browse all: search + advanced filters work; Ownership → Missing shows only unowned; Duplicates shows only cards with a finish quantity > 1.
  - Toggle visibility to Public, copy the share link, open `/collection/<username>` in a logged-out session → read-only (no steppers); set to Private → the same URL 404s for a logged-out viewer but still renders for the owner.

- [ ] **Step 4: Commit any fixes, then finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** sidebar/flat/detail surfaces (Tasks 8–13), per-finish quantities + only-available finishes (Tasks 1,7,8,9), grey unowned (Task 8), per-set completion (Tasks 4,10), ownership filter owned/missing/dupes (Tasks 5,6,11,12), private/public share with no likes/views/discover (Tasks 3,4,7,12,13), shadcn primitives (Tasks 8–12), Postgres-only writes/no reindex (Task 7). All covered.
- **Type consistency:** `setCardQuantity`/`setCardQuantityAction`, `getOwnedQuantities` → `OwnedQuantities` (cardId→finish→qty), `SetProgress`, `CollectionSummary`, `OwnershipFilter`, `CollectionVisibility`, `CollectionCard`, `applyOwnership` signature are used identically across tasks.
- **Deployment caveat surfaced:** making `id` filterable requires re-applying `CARD_INDEX_SETTINGS` (Task 5 note); no document reindex.
- **Assumed-but-verify at implementation time:** exact prop signatures of `CardRotate`, `SetSymbol`, `SearchDocument` field names, and the URL helpers in `filter-drawer.tsx` / `site-header.tsx` session pattern — each flagged inline to match the real file rather than diverge.

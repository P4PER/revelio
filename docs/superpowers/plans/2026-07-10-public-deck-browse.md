# Public Deck Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, searchable/filterable browse list of all published decks at `/decks` (showing author, name, lesson icons, likes, views), moving the private list to `/decks/mine`.

**Architecture:** New `deck_likes` / `deck_views` tables (both `(deck_id, user_id)` PK) are the source of truth; cached `like_count` / `view_count` / `lessons[]` columns on `decks` (maintained in existing write transactions) keep the browse query a plain indexed `WHERE … ORDER BY … LIMIT/OFFSET`. Views are recorded logged-in-only via a server action fired from the overview page on mount (no cookies). The browse page is a Server Component reading URL query state; a client component renders the List/Grid entries, lesson SVGs, like toggle, and page-number pagination.

**Tech Stack:** Next.js 16 App Router (React 19), next-intl, Drizzle ORM over Postgres, Better Auth, shadcn/Radix/Tailwind v4, Vitest (+ Testcontainers Postgres for DB tests).

## Global Constraints

- **All commands run from `app/`** (npm workspaces root). There is no root `package.json`.
- **Migrations are append-only.** Never `rm drizzle/` or regenerate `0000`. Edit `db/src/schema.ts`, run `npm run generate` from `app/db`, review the generated `drizzle/NNNN_*.sql`, commit schema + migration together. `npm run verify` (CI) fails if schema drifted from migrations.
- **Server Actions** (`web/src/lib/*-actions.ts`) are `'use server'` and must never leak secrets to the client.
- **DeckFormat** = `'classic' | 'revival'`. **DeckVisibility** = `'private' | 'public'`. **DeckZone** = `'character' | 'main' | 'sideboard'`. (from `@revelio/core`, `core/src/deck.ts`).
- **Lessons** (codes) = `care_of_magical_creatures`, `charms`, `potions`, `transfiguration`, `quidditch`; SVGs live at `web/public/lessons/<code>.svg`. Palette/colors in `core/src/attributes.ts` (`LESSONS`); hex tint via `web/src/lib/lesson-colors.ts` `lessonColor(code)`.
- **DB query tests live in `app/ingest/test/*.test.ts`** using `withMigratedDb()` from `ingest/test/helpers.js` (Testcontainers or `TEST_DATABASE_URL`). The `db` workspace itself has no test runner.
- **next-intl:** use `Link`/`useRouter` from `@/../i18n/navigation`, not bare `next/link`. Add copy to **both** `web/messages/en.json` and `web/messages/de.json`.
- **Conventional Commits** for every commit.
- Migration timestamps use Drizzle default `timestamp DEFAULT now() NOT NULL` (matching existing `decks` columns), not `timestamptz`.

---

## File Structure

**Create:**
- `web/src/lib/browse-params.ts` — URL query ⇄ `BrowseState` for the browse page.
- `web/src/components/lesson-icons.tsx` — fixed-size row of lesson SVGs with `+N` overflow.
- `web/src/components/deck-browse.tsx` — client: filters, List/Grid toggle, entries, pagination.
- `web/src/components/deck-like-button.tsx` — client: optimistic like toggle / sign-in gate.
- `web/src/app/[locale]/decks/mine/page.tsx` — the old private "My Decks" page (moved).
- `app/ingest/test/deck-browse.test.ts` — DB tests for browse/like/view/lessons.
- `web/src/lib/__tests__/browse-params.test.ts` — URL-state parsing tests.

**Modify:**
- `db/src/schema.ts` — `deckLikes`, `deckViews` tables; `likeCount`/`viewCount`/`lessons` on `decks`.
- `db/src/queries.ts` — `replaceDeckCards` (maintain `lessons`), new `toggleLike`, `recordView`, `listPublicDecks`.
- `db/src/index.ts` — export the new tables/queries/types.
- `web/src/lib/deck-actions.ts` — `toggleLikeAction`, `recordViewAction`.
- `web/src/app/[locale]/decks/page.tsx` — replace with the public browse Server Component.
- `web/src/components/deck-overview.tsx` — fire `recordViewAction` on mount when logged in.
- `web/src/components/site-header.tsx` — add "Browse decks" nav link.
- `web/messages/en.json`, `web/messages/de.json` — `nav.browse`, `decks.browse.*`.

---

## Task 1: DB schema — like/view tables + cached columns + migration

**Files:**
- Modify: `db/src/schema.ts:145-159` (decks/deckCards block)
- Modify: `db/src/index.ts`
- Create: `db/drizzle/NNNN_*.sql` (generated)

**Interfaces:**
- Produces: `decks.likeCount` (int), `decks.viewCount` (int), `decks.lessons` (text[]); tables `deckLikes(deckId,userId)`, `deckViews(deckId,userId)`; exports `deckLikes`, `deckViews`.

- [ ] **Step 1: Add columns + tables to the schema**

In `db/src/schema.ts`, extend the `decks` table and add two tables after `deckCards`. The existing `decks` already has `origin`; keep it. Ensure `text` and array support are imported (add `import { ... } from 'drizzle-orm/pg-core'` members as needed — `text` is already imported).

```ts
export const decks = pgTable('decks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  visibility: text('visibility').notNull().default('private'),
  likeCount: integer('like_count').notNull().default(0),
  viewCount: integer('view_count').notNull().default(0),
  lessons: text('lessons').array().notNull().default(sql`'{}'::text[]`),
  ...editable,
}, (t) => ({
  byUser: index('decks_user_id_idx').on(t.userId),
  byVisibility: index('decks_visibility_idx').on(t.visibility),
  byLikeCount: index('decks_like_count_idx').on(t.likeCount),
  byViewCount: index('decks_view_count_idx').on(t.viewCount),
  byLessons: index('decks_lessons_gin_idx').using('gin', t.lessons),
}))

export const deckCards = pgTable('deck_cards', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  zone: text('zone').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.deckId, t.cardId, t.zone] }) }))

export const deckLikes = pgTable('deck_likes', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.deckId, t.userId] }),
  byUser: index('deck_likes_user_id_idx').on(t.userId),
}))

export const deckViews = pgTable('deck_views', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.deckId, t.userId] }),
}))
```

Confirm the top of `schema.ts` imports `sql` from `drizzle-orm` and `timestamp`, `integer`, `index`, `primaryKey` from `drizzle-orm/pg-core`. Add any missing import (e.g. `import { sql } from 'drizzle-orm'`).

- [ ] **Step 2: Export the new tables**

In `db/src/index.ts`, add `deckLikes, deckViews` to the re-export from `./schema`:

```ts
export {
  types, subTypes, lessons, rarities, finishes, legalities,
  sets, cards, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, cardLocalizations,
  subTypeLocalizations, setLocalizations, decks, deckCards, deckLikes, deckViews,
} from './schema'
```

- [ ] **Step 3: Generate the migration**

Run from `app/db`:

```bash
npm run generate
```

Expected: a new `db/drizzle/NNNN_*.sql` creating `deck_likes`, `deck_views`, the three `decks` columns, the four new indexes, and the GIN index. Review it — it must be **additive only** (no drop of `decks`, `deck_cards`, or `0000`).

- [ ] **Step 4: Verify schema/migration consistency**

Run from `app`:

```bash
npm run check -w @revelio/db && npm run verify -w @revelio/db
```

Expected: both PASS (no drift, journal consistent).

- [ ] **Step 5: Typecheck**

Run from `app`:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/src/schema.ts db/src/index.ts db/drizzle/
git commit -m "feat(db): deck_likes/deck_views tables + cached like/view/lessons columns"
```

---

## Task 2: Maintain `decks.lessons` on deck save

**Files:**
- Modify: `db/src/queries.ts` (`replaceDeckCards`, ~line 505)
- Test: `app/ingest/test/deck-browse.test.ts` (create)

**Interfaces:**
- Consumes: `deckLikes`/`deckViews` exports (Task 1), `cards.lesson` column.
- Produces: after `createDeck`/`updateDeck`, `decks.lessons` holds the deck's distinct non-null lesson codes.

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/deck-browse.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import { and, eq } from 'drizzle-orm'
import { createDeck, updateDeck, decks, user, sets, cards } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values([
    { id: 'u1', name: 'Alice', username: 'alice', email: 'a@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'u2', name: 'Bob', username: 'bob', email: 'b@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ])
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 3 }])
  await ctx.db.insert(cards).values([
    { id: 'c-charms', setCode: 'BS', number: '1', name: 'Charm Card', defaultLanguage: 'en', lesson: 'charms' },
    { id: 'c-potions', setCode: 'BS', number: '2', name: 'Potion Card', defaultLanguage: 'en', lesson: 'potions' },
    { id: 'c-nolesson', setCode: 'BS', number: '3', name: 'Neutral', defaultLanguage: 'en', lesson: null },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('decks.lessons maintenance', () => {
  it('computes distinct non-null lesson codes on create', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'D', format: 'revival', visibility: 'public',
      cards: [
        { cardId: 'c-charms', zone: 'main', quantity: 2 },
        { cardId: 'c-potions', zone: 'main', quantity: 1 },
        { cardId: 'c-nolesson', zone: 'character', quantity: 1 },
      ],
    })
    const [row] = await ctx.db.select({ lessons: decks.lessons }).from(decks).where(eq(decks.id, id))
    expect([...row.lessons].sort()).toEqual(['charms', 'potions'])
  })

  it('recomputes lessons on update', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'D2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await updateDeck(ctx.db, id, {
      name: 'D2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-potions', zone: 'main', quantity: 1 }],
    })
    const [row] = await ctx.db.select({ lessons: decks.lessons }).from(decks).where(eq(decks.id, id))
    expect(row.lessons).toEqual(['potions'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `app`:

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `lessons` is `[]` because `replaceDeckCards` doesn't populate it yet.

- [ ] **Step 3: Populate `lessons` in `replaceDeckCards`**

In `db/src/queries.ts`, update `replaceDeckCards` (add `isNotNull` to the `drizzle-orm` import at the top of the file if absent):

```ts
async function replaceDeckCards(tx: Tx, id: string, cardsIn: DeckWriteInput['cards']): Promise<void> {
  await tx.delete(deckCards).where(eq(deckCards.deckId, id))
  if (cardsIn.length) {
    await tx.insert(deckCards).values(cardsIn.map((c) => ({ deckId: id, cardId: c.cardId, zone: c.zone, quantity: c.quantity })))
  }
  // Cache the deck's distinct lesson codes for the public browse filter (GIN),
  // recomputed on every save so decks.lessons is always derived from the cards.
  const cardIds = [...new Set(cardsIn.map((c) => c.cardId))]
  const lessonRows = cardIds.length
    ? await tx.selectDistinct({ lesson: cards.lesson }).from(cards)
        .where(and(inArray(cards.id, cardIds), isNotNull(cards.lesson)))
    : []
  const deckLessons = lessonRows.map((r) => r.lesson!).filter(Boolean)
  await tx.update(decks).set({ lessons: deckLessons }).where(eq(decks.id, id))
}
```

`createDeck` inserts the `decks` row before calling `replaceDeckCards`, so the `update` always targets an existing row for both create and update.

- [ ] **Step 4: Run the test to verify it passes**

Run from `app`:

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add db/src/queries.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): cache distinct lesson codes on decks.lessons at save time"
```

---

## Task 3: `toggleLike` query

**Files:**
- Modify: `db/src/queries.ts`, `db/src/index.ts`
- Test: `app/ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces: `toggleLike(db: DB, deckId: string, userId: string): Promise<{ liked: boolean; likeCount: number }>` — exported from `@revelio/db`.

- [ ] **Step 1: Write the failing test**

Append to `app/ingest/test/deck-browse.test.ts` (add `toggleLike` to the import from `@revelio/db`):

```ts
describe('toggleLike', () => {
  it('inserts a like and increments the counter, toggling off on repeat', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'L', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    const on = await toggleLike(ctx.db, id, 'u2')
    expect(on).toEqual({ liked: true, likeCount: 1 })

    const off = await toggleLike(ctx.db, id, 'u2')
    expect(off).toEqual({ liked: false, likeCount: 0 })
  })

  it('counts distinct users independently', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'L2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await toggleLike(ctx.db, id, 'u1')
    const second = await toggleLike(ctx.db, id, 'u2')
    expect(second).toEqual({ liked: true, likeCount: 2 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `toggleLike` is not exported.

- [ ] **Step 3: Implement `toggleLike`**

In `db/src/queries.ts`, add (ensure `deckLikes`, `deckViews` are imported from `./schema` at the top of the file alongside `decks, deckCards`, and `sql` from `drizzle-orm`):

```ts
export async function toggleLike(db: DB, deckId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ deckId: deckLikes.deckId }).from(deckLikes)
      .where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId))).limit(1)
    let liked: boolean
    if (existing.length) {
      await tx.delete(deckLikes).where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId)))
      await tx.update(decks).set({ likeCount: sql`${decks.likeCount} - 1` }).where(eq(decks.id, deckId))
      liked = false
    } else {
      await tx.insert(deckLikes).values({ deckId, userId })
      await tx.update(decks).set({ likeCount: sql`${decks.likeCount} + 1` }).where(eq(decks.id, deckId))
      liked = true
    }
    const [row] = await tx.select({ likeCount: decks.likeCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
    return { liked, likeCount: row?.likeCount ?? 0 }
  })
}
```

Add `export { …, toggleLike } from './queries'` to `db/src/index.ts`.

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/src/queries.ts db/src/index.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): toggleLike query with cached like_count"
```

---

## Task 4: `recordView` query

**Files:**
- Modify: `db/src/queries.ts`, `db/src/index.ts`
- Test: `app/ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces: `recordView(db: DB, deckId: string, userId: string): Promise<{ viewCount: number }>` — exported from `@revelio/db`. Increments only on the first view per `(deck, user)`.

- [ ] **Step 1: Write the failing test**

Append (add `recordView` to the `@revelio/db` import):

```ts
describe('recordView', () => {
  it('increments once per user and dedupes repeats', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'V', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    expect(await recordView(ctx.db, id, 'u2')).toEqual({ viewCount: 1 })
    expect(await recordView(ctx.db, id, 'u2')).toEqual({ viewCount: 1 }) // dedupe
    expect(await recordView(ctx.db, id, 'u1')).toEqual({ viewCount: 2 }) // distinct user
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `recordView` not exported.

- [ ] **Step 3: Implement `recordView`**

In `db/src/queries.ts`:

```ts
export async function recordView(db: DB, deckId: string, userId: string): Promise<{ viewCount: number }> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(deckViews).values({ deckId, userId })
      .onConflictDoNothing().returning({ deckId: deckViews.deckId })
    if (inserted.length) {
      await tx.update(decks).set({ viewCount: sql`${decks.viewCount} + 1` }).where(eq(decks.id, deckId))
    }
    const [row] = await tx.select({ viewCount: decks.viewCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
    return { viewCount: row?.viewCount ?? 0 }
  })
}
```

Add `recordView` to the `db/src/index.ts` queries export.

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/src/queries.ts db/src/index.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): recordView query with unique-per-user dedupe"
```

---

## Task 5: `listPublicDecks` browse query

**Files:**
- Modify: `db/src/queries.ts`, `db/src/index.ts`
- Test: `app/ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces:
```ts
export type PublicDeckSort = 'likes' | 'views' | 'newest' | 'updated'
export type PublicDeckEntry = {
  id: string; name: string; format: DeckFormat; author: string
  lessons: string[]; likeCount: number; viewCount: number
  cardCount: number; updatedAt: string; likedByViewer: boolean
}
export type ListPublicDecksInput = {
  search?: string; lessons?: string[]; format?: DeckFormat | null
  sort?: PublicDeckSort; page?: number; viewerId?: string | null
}
export async function listPublicDecks(db: DB, input: ListPublicDecksInput): Promise<{
  entries: PublicDeckEntry[]; total: number; page: number; pageCount: number
}>
```

- [ ] **Step 1: Write the failing test**

Append (import `listPublicDecks`, `toggleLike` already imported):

```ts
describe('listPublicDecks', () => {
  it('returns only public decks with author, counts, lessons, and liked flag', async () => {
    const pub = await createDeck(ctx.db, 'u1', {
      name: 'Charms Aggro', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await createDeck(ctx.db, 'u1', {
      name: 'Secret', format: 'revival', visibility: 'private',
      cards: [{ cardId: 'c-potions', zone: 'main', quantity: 1 }],
    })
    await toggleLike(ctx.db, pub, 'u2')

    const res = await listPublicDecks(ctx.db, { viewerId: 'u2' })
    const found = res.entries.find((e) => e.id === pub)!
    expect(found.author).toBe('alice')
    expect(found.lessons).toEqual(['charms'])
    expect(found.likeCount).toBe(1)
    expect(found.likedByViewer).toBe(true)
    expect(res.entries.some((e) => e.name === 'Secret')).toBe(false)
  })

  it('filters by lesson (array overlap) and by author search (@handle)', async () => {
    const byLesson = await listPublicDecks(ctx.db, { lessons: ['charms'] })
    expect(byLesson.entries.every((e) => e.lessons.includes('charms'))).toBe(true)

    const byAuthor = await listPublicDecks(ctx.db, { search: '@alice' })
    expect(byAuthor.entries.every((e) => e.author === 'alice')).toBe(true)
    expect(byAuthor.total).toBeGreaterThan(0)
  })

  it('paginates with a stable page count', async () => {
    const res = await listPublicDecks(ctx.db, { page: 1 })
    expect(res.page).toBe(1)
    expect(res.pageCount).toBe(Math.max(1, Math.ceil(res.total / 24)))
    expect(res.entries.length).toBeLessThanOrEqual(24)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: FAIL — `listPublicDecks` not exported.

- [ ] **Step 3: Implement `listPublicDecks`**

In `db/src/queries.ts` (add `arrayOverlaps`, `ilike`, `or`, `desc`, `count` to the `drizzle-orm` import; `user` is already exported from schema — import it here from `./auth-schema` or `./schema` re-export). Use a two-step query: page of deck rows (index-friendly), then card-count sum for just those ids (same pattern as `listDecksByUser`).

```ts
const PUBLIC_PAGE_SIZE = 24

export async function listPublicDecks(db: DB, input: ListPublicDecksInput): Promise<{
  entries: PublicDeckEntry[]; total: number; page: number; pageCount: number
}> {
  const page = input.page && input.page >= 1 ? Math.floor(input.page) : 1
  const conds = [eq(decks.visibility, 'public')]

  const search = input.search?.trim()
  if (search) {
    if (search.startsWith('@')) {
      const handle = `%${search.slice(1)}%`
      conds.push(ilike(user.username, handle))
    } else {
      const q = `%${search}%`
      conds.push(or(ilike(decks.name, q), ilike(user.username, q))!)
    }
  }
  if (input.lessons?.length) conds.push(arrayOverlaps(decks.lessons, input.lessons))
  if (input.format) conds.push(eq(decks.format, input.format))
  const where = and(...conds)

  const [{ total }] = await db.select({ total: count() }).from(decks)
    .innerJoin(user, eq(user.id, decks.userId)).where(where)
  const pageCount = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE))

  const order =
    input.sort === 'views' ? [desc(decks.viewCount), desc(decks.createdAt)]
    : input.sort === 'newest' ? [desc(decks.createdAt)]
    : input.sort === 'updated' ? [desc(decks.updatedAt)]
    : [desc(decks.likeCount), desc(decks.createdAt)] // default: likes

  const rows = await db.select({
    id: decks.id, name: decks.name, format: decks.format,
    lessons: decks.lessons, likeCount: decks.likeCount, viewCount: decks.viewCount,
    updatedAt: decks.updatedAt, username: user.username, displayName: user.name,
    likedByViewer: input.viewerId
      ? sql<boolean>`EXISTS (SELECT 1 FROM ${deckLikes} WHERE ${deckLikes.deckId} = ${decks.id} AND ${deckLikes.userId} = ${input.viewerId})`
      : sql<boolean>`false`,
  }).from(decks).innerJoin(user, eq(user.id, decks.userId))
    .where(where).orderBy(...order)
    .limit(PUBLIC_PAGE_SIZE).offset((page - 1) * PUBLIC_PAGE_SIZE)

  const ids = rows.map((r) => r.id)
  const counts = ids.length
    ? await db.select({ deckId: deckCards.deckId, total: sql<number>`sum(${deckCards.quantity})::int` })
        .from(deckCards).where(inArray(deckCards.deckId, ids)).groupBy(deckCards.deckId)
    : []
  const byDeck = new Map(counts.map((c) => [c.deckId, c.total]))

  const entries: PublicDeckEntry[] = rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat,
    author: r.username ?? r.displayName ?? '—',
    lessons: r.lessons, likeCount: r.likeCount, viewCount: r.viewCount,
    cardCount: byDeck.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
    likedByViewer: Boolean(r.likedByViewer),
  }))
  return { entries, total, page, pageCount }
}
```

Add the three exported types and `listPublicDecks` to `db/src/index.ts` (`export type { …, PublicDeckSort, PublicDeckEntry, ListPublicDecksInput }` and add `listPublicDecks` to the queries `export`).

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w @revelio/ingest -- deck-browse
```

Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add db/src/queries.ts db/src/index.ts ingest/test/deck-browse.test.ts
git commit -m "feat(db): listPublicDecks browse query (search/lesson/format/sort/paginate)"
```

---

## Task 6: Server actions — `toggleLikeAction`, `recordViewAction`

**Files:**
- Modify: `web/src/lib/deck-actions.ts`
- Test: `web/src/lib/__tests__/deck-actions.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Consumes: `toggleLike`, `recordView`, `getDeckForViewer` from `@revelio/db`; `requireUserId()` (already in the file).
- Produces:
```ts
export type LikeActionResult = { ok: true; liked: boolean; likeCount: number } | { ok: false; error: string }
export async function toggleLikeAction(deckId: string): Promise<LikeActionResult>
export async function recordViewAction(deckId: string): Promise<void>
```

- [ ] **Step 1: Write the failing test**

The actions depend on `getSession`/`getDb`. Mirror the mocking style already used in the web workspace's action tests (mock `@/lib/session` and `@/lib/db`, and `@revelio/db`). Create `web/src/lib/__tests__/deck-actions.test.ts` if none exists:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
const getSession = vi.fn()
vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
const toggleLike = vi.fn()
const recordView = vi.fn()
const getDeckForViewer = vi.fn()
vi.mock('@revelio/db', () => ({ toggleLike: (...a: unknown[]) => toggleLike(...a), recordView: (...a: unknown[]) => recordView(...a), getDeckForViewer: (...a: unknown[]) => getDeckForViewer(...a) }))

import { toggleLikeAction, recordViewAction } from '@/lib/deck-actions'

beforeEach(() => { vi.clearAllMocks() })

describe('toggleLikeAction', () => {
  it('rejects when logged out', async () => {
    getSession.mockResolvedValue(null)
    expect(await toggleLikeAction('d1')).toEqual({ ok: false, error: 'auth' })
    expect(toggleLike).not.toHaveBeenCalled()
  })

  it('rejects a deck the viewer cannot see', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    getDeckForViewer.mockResolvedValue(null)
    expect(await toggleLikeAction('d1')).toEqual({ ok: false, error: 'invalid' })
  })

  it('toggles a like for a visible deck', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    getDeckForViewer.mockResolvedValue({ userId: 'u2', deck: { visibility: 'public' } })
    toggleLike.mockResolvedValue({ liked: true, likeCount: 5 })
    expect(await toggleLikeAction('d1')).toEqual({ ok: true, liked: true, likeCount: 5 })
  })
})

describe('recordViewAction', () => {
  it('is a no-op when logged out', async () => {
    getSession.mockResolvedValue(null)
    await recordViewAction('d1')
    expect(recordView).not.toHaveBeenCalled()
  })

  it('records for a logged-in viewer', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    recordView.mockResolvedValue({ viewCount: 3 })
    await recordViewAction('d1')
    expect(recordView).toHaveBeenCalledWith(expect.anything(), 'd1', 'u1')
  })
})
```

If `@revelio/db` is already imported elsewhere in the file under test, extend the existing `vi.mock('@revelio/db', …)` in that test module instead of redefining it.

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- deck-actions
```

Expected: FAIL — `toggleLikeAction`/`recordViewAction` not exported.

- [ ] **Step 3: Implement the actions**

In `web/src/lib/deck-actions.ts`, add `toggleLike, recordView, getDeckForViewer` to the `@revelio/db` import and append:

```ts
export type LikeActionResult = { ok: true; liked: boolean; likeCount: number } | { ok: false; error: string }

export async function toggleLikeAction(deckId: string): Promise<LikeActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  // Only likeable if the viewer can see the deck (own or public); this also
  // 404-guards against liking arbitrary/private deck ids.
  const existing = await getDeckForViewer(getDb(), deckId, userId)
  if (!existing) return { ok: false, error: 'invalid' }
  const res = await toggleLike(getDb(), deckId, userId)
  revalidatePath('/decks')
  return { ok: true, ...res }
}

// Best-effort, logged-in-only view record. Fired from the overview page on
// mount; failures are swallowed (a missed view must never break the page).
export async function recordViewAction(deckId: string): Promise<void> {
  const userId = await requireUserId()
  if (!userId) return
  try {
    await recordView(getDb(), deckId, userId)
  } catch {
    // ignore — vanity counter, not worth surfacing
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- deck-actions
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/deck-actions.ts web/src/lib/__tests__/deck-actions.test.ts
git commit -m "feat(web): toggleLikeAction + recordViewAction server actions"
```

---

## Task 7: `browse-params.ts` URL state

**Files:**
- Create: `web/src/lib/browse-params.ts`
- Test: `web/src/lib/__tests__/browse-params.test.ts`

**Interfaces:**
- Consumes: `PublicDeckSort` from `@revelio/db`, `DeckFormat` from `@revelio/core`.
- Produces:
```ts
export type BrowseState = { q: string; lessons: string[]; format: DeckFormat | null; sort: PublicDeckSort; page: number }
export function parseBrowseParams(sp: URLSearchParams): BrowseState
export function browseToQuery(state: Partial<BrowseState>): Record<string, string> // omits defaults/empties
```

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/__tests__/browse-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseBrowseParams, browseToQuery } from '@/lib/browse-params'

describe('parseBrowseParams', () => {
  it('defaults to empty query, no filters, likes sort, page 1', () => {
    expect(parseBrowseParams(new URLSearchParams())).toEqual({
      q: '', lessons: [], format: null, sort: 'likes', page: 1,
    })
  })

  it('parses q, repeated + comma lesson params, format, sort, page', () => {
    const sp = new URLSearchParams('q=aggro&lesson=charms,potions&lesson=quidditch&format=revival&sort=views&page=3')
    expect(parseBrowseParams(sp)).toEqual({
      q: 'aggro', lessons: ['charms', 'potions', 'quidditch'], format: 'revival', sort: 'views', page: 3,
    })
  })

  it('rejects invalid sort/format/page', () => {
    const sp = new URLSearchParams('sort=bogus&format=bogus&page=0')
    const s = parseBrowseParams(sp)
    expect(s.sort).toBe('likes')
    expect(s.format).toBeNull()
    expect(s.page).toBe(1)
  })
})

describe('browseToQuery', () => {
  it('omits defaults and empty values', () => {
    expect(browseToQuery({ q: '', lessons: [], format: null, sort: 'likes', page: 1 })).toEqual({})
  })
  it('serializes set values', () => {
    expect(browseToQuery({ q: 'x', lessons: ['charms', 'potions'], format: 'classic', sort: 'newest', page: 2 })).toEqual({
      q: 'x', lesson: 'charms,potions', format: 'classic', sort: 'newest', page: '2',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- browse-params
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `browse-params.ts`**

```ts
import type { DeckFormat } from '@revelio/core'
import type { PublicDeckSort } from '@revelio/db'

export type BrowseState = {
  q: string
  lessons: string[]
  format: DeckFormat | null
  sort: PublicDeckSort
  page: number
}

const SORTS: PublicDeckSort[] = ['likes', 'views', 'newest', 'updated']
const FORMATS: DeckFormat[] = ['classic', 'revival']

export function parseBrowseParams(sp: URLSearchParams): BrowseState {
  const lessons = sp.getAll('lesson').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  const sort = sp.get('sort') as PublicDeckSort | null
  const format = sp.get('format') as DeckFormat | null
  const page = Math.floor(Number(sp.get('page') ?? '1'))
  return {
    q: sp.get('q') ?? '',
    lessons,
    format: format && FORMATS.includes(format) ? format : null,
    sort: sort && SORTS.includes(sort) ? sort : 'likes',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

// Serializes only non-default state so shared URLs stay clean.
export function browseToQuery(state: Partial<BrowseState>): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.q) out.q = state.q
  if (state.lessons && state.lessons.length) out.lesson = state.lessons.join(',')
  if (state.format) out.format = state.format
  if (state.sort && state.sort !== 'likes') out.sort = state.sort
  if (state.page && state.page > 1) out.page = String(state.page)
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- browse-params
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/browse-params.ts web/src/lib/__tests__/browse-params.test.ts
git commit -m "feat(web): browse-params URL state for public deck browse"
```

---

## Task 8: `LessonIcons` component

**Files:**
- Create: `web/src/components/lesson-icons.tsx`
- Test: `web/src/components/__tests__/lesson-icons.test.tsx` (create; follow the workspace's existing testing-library setup)

**Interfaces:**
- Produces: `export function LessonIcons({ codes, size = 18, max = 4 }: { codes: string[]; size?: number; max?: number }): JSX.Element` — renders `<img src="/lessons/<code>.svg">` per code, with a `+N` overflow chip when `codes.length > max`. Plain (non-`'use client'`) so both server and client entries can use it.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonIcons } from '@/components/lesson-icons'

describe('LessonIcons', () => {
  it('renders one image per lesson code', () => {
    render(<LessonIcons codes={['charms', 'potions']} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByAltText('potions')).toHaveAttribute('src', '/lessons/potions.svg')
  })

  it('caps icons and shows a +N overflow chip', () => {
    render(<LessonIcons codes={['charms', 'potions', 'quidditch', 'transfiguration', 'care_of_magical_creatures']} max={3} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<LessonIcons codes={[]} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -w web -- lesson-icons
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lesson-icons.tsx`**

```tsx
// Fixed-size row of lesson symbols for deck list entries. Plain component (no
// 'use client') so it renders in both the server browse page and client entries.
// Uses a plain <img> (SVGs are static public assets) to keep it framework-light.
export function LessonIcons({
  codes,
  size = 18,
  max = 4,
}: {
  codes: string[]
  size?: number
  max?: number
}) {
  if (!codes.length) return null
  const shown = codes.slice(0, max)
  const overflow = codes.length - shown.length
  return (
    <span className="inline-flex items-center gap-1" aria-label="Lessons">
      {shown.map((code) => (
        <img
          key={code}
          src={`/lessons/${code}.svg`}
          alt={code}
          width={size}
          height={size}
          className="inline-block"
          style={{ width: size, height: size }}
        />
      ))}
      {overflow > 0 && (
        <span className="rounded bg-muted px-1 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -w web -- lesson-icons
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/lesson-icons.tsx web/src/components/__tests__/lesson-icons.test.tsx
git commit -m "feat(web): LessonIcons component with overflow chip"
```

---

## Task 9: Like button (client, optimistic)

**Files:**
- Create: `web/src/components/deck-like-button.tsx`

**Interfaces:**
- Consumes: `toggleLikeAction` from `@/lib/deck-actions`; `useRouter` from `@/../i18n/navigation`.
- Produces: `export function DeckLikeButton({ deckId, initialLiked, initialCount, loggedIn }: { deckId: string; initialLiked: boolean; initialCount: number; loggedIn: boolean }): JSX.Element`.

- [ ] **Step 1: Implement the component**

No dedicated unit test (thin interaction wrapper; covered by manual verification in Task 11). Create `web/src/components/deck-like-button.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { toggleLikeAction } from '@/lib/deck-actions'
import { cn } from '@/lib/utils'

export function DeckLikeButton({
  deckId,
  initialLiked,
  initialCount,
  loggedIn,
}: {
  deckId: string
  initialLiked: boolean
  initialCount: number
  loggedIn: boolean
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, startTransition] = useTransition()

  function onClick(e: React.MouseEvent) {
    e.preventDefault() // entry is wrapped in a link — don't navigate
    e.stopPropagation()
    if (!loggedIn) {
      router.push('/login')
      return
    }
    // Optimistic flip, rolled back on failure.
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount((c) => c + (nextLiked ? 1 : -1))
    startTransition(async () => {
      const res = await toggleLikeAction(deckId)
      if (!res.ok) {
        setLiked(!nextLiked)
        setCount((c) => c + (nextLiked ? -1 : 1))
        toast.error(t('browse.likeError'))
      } else {
        setLiked(res.liked)
        setCount(res.likeCount)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={liked}
      aria-label={t('browse.likeLabel')}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      <Heart className={cn('size-4', liked && 'fill-current text-primary')} />
      {count}
    </button>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/deck-like-button.tsx
git commit -m "feat(web): optimistic DeckLikeButton"
```

---

## Task 10: Browse UI + route move + nav + i18n

**Files:**
- Create: `web/src/app/[locale]/decks/mine/page.tsx`
- Modify: `web/src/app/[locale]/decks/page.tsx` (replace with browse Server Component)
- Create: `web/src/components/deck-browse.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/messages/en.json`, `web/messages/de.json`

**Interfaces:**
- Consumes: `listPublicDecks` (`@revelio/db`), `parseBrowseParams`/`browseToQuery` (`@/lib/browse-params`), `LessonIcons`, `DeckLikeButton`, `DECK_VIEW_COOKIE`/`DeckView` (`@/lib/deck-view`).

- [ ] **Step 1: Move the private list to `/decks/mine`**

Create `web/src/app/[locale]/decks/mine/page.tsx` with the **current** contents of `web/src/app/[locale]/decks/page.tsx` verbatim (the `listDecksByUser` "My Decks" page, including its logged-out empty state). Its internal `Link href="/decks/new"` stays; the back-link target in `deck-overview.tsx` will be updated in Task 11.

- [ ] **Step 2: Add i18n copy**

Add to `web/messages/en.json` — under `nav`, add `"browse": "Browse decks"`; add a `decks.browse` block:

```json
"browse": {
  "title": "Browse decks",
  "subtitle": "Discover public decks from the community",
  "searchPlaceholder": "Search decks or @author…",
  "sort": { "label": "Sort", "likes": "Most liked", "views": "Most viewed", "newest": "Newest", "updated": "Recently updated" },
  "format": { "label": "Format", "all": "All formats", "classic": "Classic", "revival": "Revival" },
  "lessonsLabel": "Lessons",
  "clear": "Clear filters",
  "count": "{count} decks",
  "empty": "No decks match your filters.",
  "by": "by @{author}",
  "cards": "{count} cards",
  "views": "{count} views",
  "likeLabel": "Like this deck",
  "likeError": "Could not update your like. Please try again.",
  "views_page": "Views",
  "prev": "Previous",
  "next": "Next",
  "pageOf": "Page {page} of {total}"
}
```

Add the matching German translations to `web/messages/de.json` (same keys; e.g. `"browse": "Decks entdecken"`, `"title": "Decks entdecken"`, `"subtitle": "Entdecke öffentliche Decks der Community"`, `"searchPlaceholder": "Decks oder @Autor suchen…"`, `sort`: `"Beliebteste" / "Meistgesehen" / "Neueste" / "Kürzlich aktualisiert"`, `format.all`: `"Alle Formate"`, `clear`: `"Filter zurücksetzen"`, `count`: `"{count} Decks"`, `empty`: `"Keine Decks entsprechen deinen Filtern."`, `by`: `"von @{author}"`, `cards`: `"{count} Karten"`, `likeError`: `"Like konnte nicht gespeichert werden. Bitte versuche es erneut."`, `pageOf`: `"Seite {page} von {total}"`).

- [ ] **Step 3: Add the nav link**

In `web/src/components/site-header.tsx`, add a "Browse decks" link before the Deck Builder link (import an icon, e.g. `LibraryBig` from `lucide-react`):

```tsx
<Button variant="ghost" size="sm" asChild>
  <Link href="/decks"><LibraryBig className="size-4 opacity-70" />{t('browse')}</Link>
</Button>
```

- [ ] **Step 4: Implement the browse Server Component**

Replace `web/src/app/[locale]/decks/page.tsx` entirely:

```tsx
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { listPublicDecks } from '@revelio/db'
import { parseBrowseParams } from '@/lib/browse-params'
import { DeckBrowse } from '@/components/deck-browse'
import { DECK_VIEW_COOKIE } from '@/lib/deck-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('decks')
  return { title: t('browse.title') }
}

export default async function DecksBrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x))
    else if (v != null) usp.set(k, v)
  }
  const state = parseBrowseParams(usp)

  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  const viewerId = session?.user?.id ?? null
  const result = await listPublicDecks(getDb(), {
    search: state.q, lessons: state.lessons, format: state.format,
    sort: state.sort, page: state.page, viewerId,
  })

  const savedView = cookieStore.get(DECK_VIEW_COOKIE)?.value
  const initialView = savedView === 'gallery' || savedView === 'list' ? savedView : undefined

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <DeckBrowse
        state={state}
        entries={result.entries}
        total={result.total}
        pageCount={result.pageCount}
        loggedIn={!!session?.user}
        initialView={initialView}
      />
    </main>
  )
}
```

- [ ] **Step 5: Implement the `DeckBrowse` client component**

Create `web/src/components/deck-browse.tsx`. It owns the filter controls (search, lesson chips, format select, sort select, clear), the List/Grid toggle (persisted via `DECK_VIEW_COOKIE`, same pattern as `deck-overview.tsx`), the entries in both layouts, and page-number pagination. Filter changes push a new URL via `useRouter` + `browseToQuery` (resetting `page` to 1); pagination preserves the other params. Use the `LESSONS` palette (`@revelio/core`) for the lesson chip pips and `lessonColor` for tint.

```tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'
import { LayoutGrid, List, Eye } from 'lucide-react'
import { LESSONS } from '@revelio/core'
import type { PublicDeckEntry, PublicDeckSort } from '@revelio/db'
import type { DeckFormat } from '@revelio/core'
import { Link, useRouter } from '@/../i18n/navigation'
import { type BrowseState, browseToQuery } from '@/lib/browse-params'
import { DECK_VIEW_COOKIE, type DeckView } from '@/lib/deck-view'
import { LessonIcons } from '@/components/lesson-icons'
import { DeckLikeButton } from '@/components/deck-like-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const SORTS: PublicDeckSort[] = ['likes', 'views', 'newest', 'updated']
const FORMATS: DeckFormat[] = ['classic', 'revival']

export function DeckBrowse({
  state, entries, total, pageCount, loggedIn, initialView,
}: {
  state: BrowseState
  entries: PublicDeckEntry[]
  total: number
  pageCount: number
  loggedIn: boolean
  initialView?: DeckView
}) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const router = useRouter()
  const view = initialView ?? 'gallery' // default Grid for discovery

  function push(next: Partial<BrowseState>) {
    const merged = { ...state, ...next, page: next.page ?? 1 }
    const q = new URLSearchParams(browseToQuery(merged)).toString()
    router.push(`/decks${q ? `?${q}` : ''}`)
  }

  function setView(next: DeckView) {
    document.cookie = `${DECK_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  function toggleLesson(code: string) {
    const has = state.lessons.includes(code)
    push({ lessons: has ? state.lessons.filter((l) => l !== code) : [...state.lessons, code] })
  }

  const hasFilters = state.q || state.lessons.length || state.format || state.sort !== 'likes'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">{t('browse.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('browse.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          defaultValue={state.q}
          placeholder={t('browse.searchPlaceholder')}
          className="max-w-xs"
          onKeyDown={(e) => { if (e.key === 'Enter') push({ q: (e.target as HTMLInputElement).value }) }}
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={state.sort}
          onChange={(e) => push({ sort: e.target.value as PublicDeckSort })}
        >
          {SORTS.map((s) => <option key={s} value={s}>{t(`browse.sort.${s}`)}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={state.format ?? ''}
          onChange={(e) => push({ format: (e.target.value || null) as DeckFormat | null })}
        >
          <option value="">{t('browse.format.all')}</option>
          {FORMATS.map((f) => <option key={f} value={f}>{t(`browse.format.${f}`)}</option>)}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push('/decks')}>{t('browse.clear')}</Button>
        )}
      </div>

      {/* Lesson chips */}
      <div className="flex flex-wrap items-center gap-2" aria-label={t('browse.lessonsLabel')}>
        {LESSONS.map((l) => {
          const active = state.lessons.includes(l.code)
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => toggleLesson(l.code)}
              aria-pressed={active}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
            >
              <span className="inline-block size-3 rounded-full" style={{ backgroundColor: l.color }} />
              <img src={`/lessons/${l.code}.svg`} alt="" width={16} height={16} />
            </button>
          )
        })}
      </div>

      {/* Header row: count + view toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('browse.count', { count: total })}</span>
        <div className="flex gap-1">
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} aria-label="List view">
            <List className="size-4" />
          </Button>
          <Button variant={view === 'gallery' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('gallery')} aria-label="Grid view">
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('browse.empty')}</p>
      ) : view === 'list' ? (
        <ul className="space-y-2">
          {entries.map((d) => (
            <li key={d.id}>
              <Link href={`/decks/${d.id}`} className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <LessonIcons codes={d.lessons} size={18} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t('browse.by', { author: d.author })} · {t(`browse.format.${d.format}`)} · {t('browse.cards', { count: d.cardCount })}
                  </div>
                </div>
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  <DeckLikeButton deckId={d.id} initialLiked={d.likedByViewer} initialCount={d.likeCount} loggedIn={loggedIn} />
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Eye className="size-4" />{d.viewCount}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((d) => (
            <li key={d.id}>
              <Link href={`/decks/${d.id}`} className="flex h-full flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
                <div>
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t('browse.by', { author: d.author })}</div>
                </div>
                <LessonIcons codes={d.lessons} size={20} />
                <div className="text-xs text-muted-foreground">{t(`browse.format.${d.format}`)} · {t('browse.cards', { count: d.cardCount })}</div>
                <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3" onClick={(e) => e.stopPropagation()}>
                  <DeckLikeButton deckId={d.id} initialLiked={d.likedByViewer} initialCount={d.likeCount} loggedIn={loggedIn} />
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Eye className="size-4" />{d.viewCount}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={state.page <= 1} onClick={() => push({ page: state.page - 1 })}>{t('browse.prev')}</Button>
          <span className="text-sm text-muted-foreground">{t('browse.pageOf', { page: state.page, total: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={state.page >= pageCount} onClick={() => push({ page: state.page + 1 })}>{t('browse.next')}</Button>
        </div>
      )}
    </div>
  )
}
```

If `LESSONS` isn't exported from `@revelio/core`'s package entry, import it from the same path the existing lesson UI uses (check `web/src/lib/lesson-colors.ts`, which already imports `LESSONS`). Reuse `Input` from `@/components/ui/input`; if the project has no such primitive, use a plain `<input className="...">` matching the existing search input styling.

- [ ] **Step 6: Typecheck, lint, and run web tests**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/[locale]/decks/page.tsx web/src/app/[locale]/decks/mine/page.tsx web/src/components/deck-browse.tsx web/src/components/site-header.tsx web/messages/en.json web/messages/de.json
git commit -m "feat(web): public deck browse page at /decks, My Decks moved to /decks/mine"
```

---

## Task 11: Record views on the overview + fix back-link

**Files:**
- Modify: `web/src/components/deck-overview.tsx`

**Interfaces:**
- Consumes: `recordViewAction` from `@/lib/deck-actions`.

- [ ] **Step 1: Fire `recordViewAction` on mount + point the back-link at `/decks/mine`**

In `web/src/components/deck-overview.tsx`, add `useEffect` to the imports (`import { useEffect, useState } from 'react'`) and, inside the `DeckOverview` component body, record a view once on mount for logged-in viewers:

```tsx
useEffect(() => {
  if (loggedIn) void recordViewAction(deckId)
  // deckId is stable for a mounted overview; record exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [deckId])
```

Add the import: `import { recordViewAction } from '@/lib/deck-actions'`. Update the existing back-link (the `Link href="/decks"` labelled `overview.backToDecks`) to `href="/decks/mine"` so "back to my decks" still lands on the personal list rather than the new public browse.

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npm run lint -w web
```

Expected: PASS.

- [ ] **Step 3: Manual end-to-end verification**

Start local infra and dev server (see `CLAUDE.md` / `app/.env.example`):

```bash
docker compose up -d
docker compose run --rm migrate   # applies the new migration
npm run dev -w web
```

Verify:
- `/decks` shows public decks; search, `@author`, lesson chips, format, sort, and pagination all update results.
- Grid/List toggle switches layout and persists across reload.
- Logged-in: clicking ♥ toggles fill + count optimistically and survives reload; opening a deck's overview increments 👁 once (a second visit by the same account does not).
- Logged-out: ♥ routes to sign-in; opening an overview does not change 👁.
- `/decks/mine` shows the personal list; the overview "back" link returns there.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/deck-overview.tsx
git commit -m "feat(web): record deck views on overview mount; back-link to /decks/mine"
```

---

## Self-Review

**Spec coverage:**
- Public browse at `/decks`, personal at `/decks/mine` → Tasks 10, 11. ✓
- Search over name + `@author` → Tasks 5, 7, 10. ✓
- Lesson + format filter, sort (likes/views/newest/updated) → Tasks 5, 7, 10. ✓
- Likes: login-gated toggle, one per account, cached count → Tasks 3, 6, 9. ✓
- Views: unique per logged-in account, no cookies, recorded on overview mount → Tasks 4, 6, 11. ✓
- List ↔ Grid toggle w/ cookie pref, lesson SVGs in both, no strip → Tasks 8, 10. ✓
- Classic page-number pagination (24/page) → Tasks 5, 10. ✓
- Scale-ready cached columns + GIN/btree indexes → Task 1. ✓
- Two new tables + migration, append-only, `verify` passes → Task 1. ✓
- Tests: db (browse/like/view/lessons), params, LessonIcons, actions → Tasks 2–8. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `PublicDeckEntry.author` used consistently (Task 5 defines `author`, Tasks 10 consumes `d.author`); `toggleLike`/`recordView`/`listPublicDecks` signatures match between db (Tasks 3–5) and actions/pages (Tasks 6, 10); `BrowseState`/`browseToQuery` match between Task 7 and Task 10; `likedByViewer`/`likeCount`/`viewCount` names consistent across db → entry → UI. ✓

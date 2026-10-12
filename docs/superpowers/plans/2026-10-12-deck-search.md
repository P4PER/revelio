# Deck Search in Discord Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/deck` finds decks by name through autocomplete (public decks plus the caller's own private ones when linked), resolves free text by name, and never posts a private deck without its owner's explicit choice.

**Architecture:** Two new Postgres queries in `@revelio/db` (`suggestDecks`, `getDeckAccess`) feed a bot data layer (`resolveDeckRef`, `findDecks`, `suggestionLabel`). `/deck` reads first, then either defers publicly (public deck) or answers ephemerally with a prompt: buttons for an own private deck, a select menu for an ambiguous name. Both prompts are answered through `awaitMessageComponent` on the prompt message, with no global component router.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), discord.js 14.27, Vitest, Testcontainers (via `ingest/test/helpers.ts`), next-intl message catalogs and MDX docs for the web.

**Spec:** `docs/superpowers/specs/2026-10-12-deck-search-design.md`

## Global Constraints

- All commands run from `app/`. Prefix tools with their absolute paths: `/usr/local/bin/npm`, `/usr/local/bin/npx`, `/usr/local/bin/docker`; commit with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Work on branch `feat/deck-search` (already created, spec already committed). Never commit to `main`.
- Conventional Commits, scope = workspace (`db`, `bot`, `core`, `web`), or `docs` for prose. No tool attribution, no `Co-authored-by`.
- Every user-facing bot string comes from `bot/src/i18n/{en,de}.json`; both catalogs hold the same keys (`test/catalog-parity.test.ts`).
- Code comments are ASCII only: no em-dashes, no unicode arrows. Literal non-ASCII is allowed only inside string values (the lock emoji and the middle dot in labels).
- `type` aliases, not `interface`; type-only imports say `type`; declaration order in a file is types, constants, helpers, exported functions.
- Discord limits: autocomplete and select menus take at most 25 choices; a choice label is at most 100 characters (`clampLabel` in `bot/src/data/cards.ts`).
- Replies must not ping: the client already sets `allowedMentions: { parse: [] }`. Do not override it on any new reply or follow-up.
- `/deck` never calls `getDeck` directly. Every deck load goes through `getDeckForViewer`.
- The bot is read-only and never imports from `web`.

## Review Focus

1. **Whitespace-only input** (`deck:"   "`) must answer "not found", not a 25-deck menu of everything visible. Pinned in Task 2 (`resolveDeckRef` blank test).
2. **A deck name containing `/`** (`Aggro/Control`): `parseDeckRef` cuts it at the slash for the id lookup, so the name search must use the full trimmed input. Pinned in Task 2.
3. **Another user's private deck by exact id** must get the same ephemeral "not found" as an unknown id, and nothing public. Pinned in Task 4.
4. **A deck deleted or made private between the prompt and the click** must edit the prompt to "not found" and send no public follow-up. Pinned in Task 4.
5. **The user dismisses the ephemeral prompt before it times out**: the expiry `editReply` rejects, and the command must still resolve cleanly instead of surfacing as a command failure. Pinned in Task 4.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `app/db/src/queries/deck-browse.ts` | modify | `deckSearchCondition` (extracted), `suggestDecks`, `getDeckAccess` |
| `app/db/src/index.ts` | modify | re-export the two queries and their types |
| `app/ingest/test/deck-suggest.test.ts` | create | live-Postgres tests for both queries |
| `app/bot/src/data/decks.ts` | modify | `getPublicDeck` becomes `getDeckView(db, ref, viewerId)`; `PublicDeck` becomes `DeckView`; add `findDecks`, `accessOf`, `suggestionLabel`, `resolveDeckRef` |
| `app/bot/src/data/sheet.ts`, `app/bot/src/discord/embeds/deck-embed.ts` | modify | type rename only |
| `app/bot/test/decks.test.ts` | modify | rename, plus resolver/label tests |
| `app/bot/src/discord/components/deck-prompts.ts` | create | prompt builders, custom ids, timeout, `awaitChoice` |
| `app/bot/test/deck-prompts.test.ts` | create | prompt shape and collector filter |
| `app/bot/src/discord/commands/deck.ts` | modify | autocomplete and the new execute flow |
| `app/bot/test/commands.test.ts` | modify | `/deck` suite rewritten for the new flow, autocomplete tests |
| `app/bot/test/command-manifest.test.ts` | modify | `/deck` defer check gets a public deck to defer for |
| `app/core/src/bot-commands.ts` | modify | `deck` option `autocomplete: true` |
| `app/bot/src/i18n/en.json`, `de.json` | modify | new and reworded keys |
| `app/web/content/docs/discord-{commands,privacy,troubleshooting,linking}.{en,de}.mdx` | modify | user docs |
| `app/web/messages/en.json`, `de.json` | modify | command reference strings for `/deck` |
| `CLAUDE.md` | modify | `/deck` exception to "every command defers first" |

---

### Task 1: Deck suggestion and access queries (`@revelio/db`)

**Files:**
- Modify: `app/db/src/queries/deck-browse.ts`
- Modify: `app/db/src/index.ts:18,29`
- Test: `app/ingest/test/deck-suggest.test.ts` (new file, own fixture so ordering assertions are not disturbed by the decks other suites create)

**Interfaces:**
- Produces:
  - `type DeckSuggestion = { id: string; name: string; format: DeckFormat; author: string; visibility: DeckVisibility; isOwn: boolean }`
  - `type SuggestDecksInput = { query: string; viewerId: string | null; limit?: number }`
  - `type DeckAccess = { access: 'public' | 'own-private'; name: string }`
  - `suggestDecks(db: DB, input: SuggestDecksInput): Promise<DeckSuggestion[]>`
  - `getDeckAccess(db: DB, id: string, viewerId: string | null): Promise<DeckAccess | null>`

Note on the spec: the spec has `getDeckAccess` return a bare `'public' | 'own-private' | null`. This plan returns `{ access, name }` so the private-deck prompt can name the deck without a second read.

- [ ] **Step 1: Write the failing tests**

Create `app/ingest/test/deck-suggest.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { withMigratedDb } from './helpers.js'
import { createDeck, decks, suggestDecks, getDeckAccess, user } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ctx = await withMigratedDb()
  const now = new Date()
  await ctx.db.insert(user).values([
    { id: 'u1', name: 'Alice', username: 'alice', displayUsername: 'Alice_HP', email: 'a@e.com', emailVerified: true, createdAt: now, updatedAt: now },
    { id: 'u2', name: 'Bob', username: 'bob', email: 'b@e.com', emailVerified: true, createdAt: now, updatedAt: now },
  ])
  const make = async (key: string, userId: string, name: string, visibility: 'public' | 'private') => {
    ids[key] = await createDeck(ctx.db, userId, { name, format: 'classic', visibility, cards: [] })
  }
  await make('alicePublic', 'u1', 'Gryffindor Aggro', 'public')
  await make('alicePrivate', 'u1', 'Secret Charms', 'private')
  await make('bobPublic', 'u2', 'Slytherin Control', 'public')
  await make('bobPrivate', 'u2', 'Bob Hidden Aggro', 'private')
  await make('bobPopular', 'u2', 'Hufflepuff Aggro', 'public')
  await ctx.db.update(decks).set({ likeCount: 9 }).where(eq(decks.id, ids.bobPopular))
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('suggestDecks', () => {
  it('returns only public decks to a null viewer', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: null })
    expect(rows.map((r) => r.id).sort())
      .toEqual([ids.alicePublic, ids.bobPublic, ids.bobPopular].sort())
    expect(rows.every((r) => !r.isOwn)).toBe(true)
  })

  it('adds the viewer\'s own private decks, and never someone else\'s', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: 'u1' })
    const got = rows.map((r) => r.id)
    expect(got).toContain(ids.alicePrivate)
    expect(got).not.toContain(ids.bobPrivate)
  })

  it('lists own decks first, then public decks by likes', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: 'u1' })
    expect(rows.slice(0, 2).every((r) => r.isOwn)).toBe(true)
    expect(rows[2].id).toBe(ids.bobPopular)
  })

  it('matches the deck name or the author, case-insensitively', async () => {
    const byName = await suggestDecks(ctx.db, { query: 'aggro', viewerId: null })
    expect(byName.map((r) => r.id).sort()).toEqual([ids.alicePublic, ids.bobPopular].sort())
    const byAuthor = await suggestDecks(ctx.db, { query: 'bob', viewerId: null })
    expect(byAuthor.map((r) => r.id).sort()).toEqual([ids.bobPublic, ids.bobPopular].sort())
  })

  it('matches only the author for an @handle', async () => {
    const rows = await suggestDecks(ctx.db, { query: '@ali', viewerId: null })
    expect(rows.map((r) => r.id)).toEqual([ids.alicePublic])
  })

  it('reports the cased display handle as the author', async () => {
    const [row] = await suggestDecks(ctx.db, { query: '@alice', viewerId: null })
    expect(row.author).toBe('Alice_HP')
  })

  it('respects the limit', async () => {
    expect(await suggestDecks(ctx.db, { query: '', viewerId: null, limit: 2 })).toHaveLength(2)
  })
})

describe('getDeckAccess', () => {
  it('reports a public deck to anyone', async () => {
    expect(await getDeckAccess(ctx.db, ids.bobPublic, null))
      .toEqual({ access: 'public', name: 'Slytherin Control' })
  })

  it('reports the owner\'s own private deck', async () => {
    expect(await getDeckAccess(ctx.db, ids.alicePrivate, 'u1'))
      .toEqual({ access: 'own-private', name: 'Secret Charms' })
  })

  it('hides another user\'s private deck exactly like an unknown id', async () => {
    expect(await getDeckAccess(ctx.db, ids.bobPrivate, 'u1')).toBeNull()
    expect(await getDeckAccess(ctx.db, ids.bobPrivate, null)).toBeNull()
    expect(await getDeckAccess(ctx.db, 'no-such-deck', 'u1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/usr/local/bin/npm test -w @revelio/ingest -- test/deck-suggest.test.ts` (Docker must be running for Testcontainers)
Expected: FAIL, `suggestDecks` / `getDeckAccess` are not exported from `@revelio/db`.

- [ ] **Step 3: Implement the queries**

In `app/db/src/queries/deck-browse.ts`, change the imports and add the types next to the existing ones:

```ts
import { eq, desc, sql, inArray, and, or, ilike, count, arrayOverlaps, type SQL } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, decks, deckCards, deckLikes, deckViews } from '../schema'
import { user } from '../auth-schema'
import type { DeckFormat, DeckVisibility } from '@revelio/core'
```

```ts
export type DeckSuggestion = {
  id: string; name: string; format: DeckFormat; author: string
  visibility: DeckVisibility; isOwn: boolean
}

export type SuggestDecksInput = { query: string; viewerId: string | null; limit?: number }

// What a viewer may do with one deck id. Never a third "exists but private"
// state: someone else's private deck reads as null, exactly like a deck that
// does not exist, so a caller cannot use it to probe ids.
export type DeckAccess = { access: 'public' | 'own-private'; name: string }
```

Below `PUBLIC_PAGE_SIZE`, add the constant and the shared helper:

```ts
// Discord's autocomplete ceiling, and the default for the bot's suggestions.
const SUGGEST_LIMIT = 25

// The browse page's matching rule, shared so the web and the bot can never
// disagree on what a search finds: "@handle" narrows to the author, anything
// else matches the deck name or the author.
function deckSearchCondition(search: string): SQL | undefined {
  const s = search.trim()
  if (!s) return undefined
  if (s.startsWith('@')) return ilike(user.username, `%${s.slice(1)}%`)
  const q = `%${s}%`
  return or(ilike(decks.name, q), ilike(user.username, q))
}
```

In `listPublicDecks`, replace the whole `const search = ...; if (search) { ... }` block with:

```ts
  const match = deckSearchCondition(input.search ?? '')
  if (match) conds.push(match)
```

Append the two queries at the end of the file:

```ts
export async function suggestDecks(db: DB, input: SuggestDecksInput): Promise<DeckSuggestion[]> {
  const { viewerId } = input
  const own = viewerId ? sql<boolean>`${decks.userId} = ${viewerId}` : sql<boolean>`false`
  const visible = viewerId
    ? or(eq(decks.visibility, 'public'), eq(decks.userId, viewerId))!
    : eq(decks.visibility, 'public')
  const match = deckSearchCondition(input.query)

  const rows = await db.select({
    id: decks.id, name: decks.name, format: decks.format, visibility: decks.visibility,
    displayUsername: user.displayUsername, username: user.username, displayName: user.name,
    isOwn: own,
  }).from(decks).innerJoin(user, eq(user.id, decks.userId))
    .where(match ? and(visible, match) : visible)
    // Own decks first, most recently edited first; then public decks by likes.
    // NULLS LAST matters: Postgres sorts NULL first under DESC, which would put
    // every public deck's null "own updated" key ahead of the own decks.
    .orderBy(
      sql`${own} desc`,
      sql`case when ${own} then ${decks.updatedAt} end desc nulls last`,
      desc(decks.likeCount),
      desc(decks.createdAt),
    )
    .limit(input.limit ?? SUGGEST_LIMIT)

  return rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat,
    visibility: r.visibility as DeckVisibility,
    author: r.displayUsername ?? r.username ?? r.displayName ?? '—',
    isOwn: Boolean(r.isOwn),
  }))
}

// One primary-key read, cheap enough to run before a Discord interaction is
// acknowledged: /deck needs the answer to decide whether its first reply is
// public or ephemeral.
export async function getDeckAccess(
  db: DB, id: string, viewerId: string | null,
): Promise<DeckAccess | null> {
  const [row] = await db.select({ name: decks.name, visibility: decks.visibility, userId: decks.userId })
    .from(decks).where(eq(decks.id, id)).limit(1)
  if (!row) return null
  if (row.visibility === 'public') return { access: 'public', name: row.name }
  if (viewerId && row.userId === viewerId) return { access: 'own-private', name: row.name }
  return null
}
```

In `app/db/src/index.ts` change lines 18 and 29 to:

```ts
export { toggleLike, recordView, getDeckLikeState, listPublicDecks, suggestDecks, getDeckAccess } from './queries/deck-browse'
```

```ts
export type { PublicDeckSort, PublicDeckEntry, ListPublicDecksInput, DeckSuggestion, SuggestDecksInput, DeckAccess } from './queries/deck-browse'
```

- [ ] **Step 4: Run the new tests and the existing browse suite**

Run: `/usr/local/bin/npm test -w @revelio/ingest -- test/deck-suggest.test.ts test/deck-browse.test.ts`
Expected: PASS for both files. `deck-browse.test.ts` passing proves the `deckSearchCondition` extraction did not change `listPublicDecks`.

- [ ] **Step 5: Typecheck and commit**

Run: `/usr/local/bin/npm run typecheck`
Expected: no errors.

```bash
git add app/db/src/queries/deck-browse.ts app/db/src/index.ts app/ingest/test/deck-suggest.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): suggest decks by name and read one deck's access"
```

---

### Task 2: Bot deck data layer (resolver, labels, viewer-aware load)

**Files:**
- Modify: `app/bot/src/data/decks.ts`
- Modify: `app/bot/src/data/sheet.ts:3,61` (type rename)
- Modify: `app/bot/src/discord/embeds/deck-embed.ts:3,54` (type rename)
- Modify: `app/bot/src/discord/commands/deck.ts:3,40` (call rename only; Task 4 rewrites the rest)
- Modify: `app/bot/src/i18n/en.json`, `de.json` (no new keys; labels reuse `deck.format.*`)
- Test: `app/bot/test/decks.test.ts`, `app/bot/test/deck-embed.test.ts`, `app/bot/test/sheet.test.ts` (rename references)

**Interfaces:**
- Consumes: `suggestDecks`, `getDeckAccess`, `DeckSuggestion` from Task 1.
- Produces:
  - `type DeckView` (the old `PublicDeck`, unchanged shape)
  - `type DeckRef = { kind: 'deck'; id: string; name: string; access: 'public' | 'own-private' } | { kind: 'ambiguous'; options: DeckSuggestion[] } | { kind: 'none' }`
  - `getDeckView(db: DB, ref: string, viewerId: string | null): Promise<DeckView | null>`
  - `findDecks(db: DB, query: string, viewerId: string | null): Promise<DeckSuggestion[]>`
  - `accessOf(s: DeckSuggestion): 'public' | 'own-private'`
  - `suggestionLabel(s: DeckSuggestion, locale: string): string`
  - `resolveDeckRef(db: DB, input: string, viewerId: string | null): Promise<DeckRef>`

- [ ] **Step 1: Rename `getPublicDeck` / `PublicDeck` everywhere**

Run from `app/`:

```bash
grep -rln "getPublicDeck\|PublicDeck\b" bot/src bot/test
```

In every file listed, replace `getPublicDeck` with `getDeckView` and the type `PublicDeck` with `DeckView`. Leave `PublicDeckEntry` / `PublicDeckSort` alone: those are `@revelio/db` names for the web browse page. In `bot/test/decks.test.ts`, every `getDeckView({} as never, 'x')` call gains a third argument `null`. Replace the test `'reads through getDeckForViewer with a null viewer'` with:

```ts
  it('reads through getDeckForViewer with the viewer it was given', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    await getDeckView({} as never, 'https://revelio.cards/decks/abc123', 'user-1')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', 'user-1')
  })
```

Also rename the two `describe('getPublicDeck...')` titles to `getDeckView`.

- [ ] **Step 2: Write the failing resolver and label tests**

Append to `app/bot/test/decks.test.ts` (and add `resolveDeckRef, suggestionLabel, findDecks` to the import from `../src/data/decks`):

```ts
const suggestion = (over: Partial<dbModule.DeckSuggestion> = {}): dbModule.DeckSuggestion => ({
  id: 'd1', name: 'Gryffindor Aggro', format: 'classic', author: 'seeker',
  visibility: 'public', isOwn: false, ...over,
})

describe('suggestionLabel', () => {
  it('reads name, author and format', () => {
    expect(suggestionLabel(suggestion(), 'en')).toBe('Gryffindor Aggro · @seeker · Classic')
  })

  it('marks a private deck with a lock', () => {
    expect(suggestionLabel(suggestion({ visibility: 'private', isOwn: true }), 'en'))
      .toBe('🔒 Gryffindor Aggro · @seeker · Classic')
  })

  it('clamps to Discord\'s 100 character limit', () => {
    expect(suggestionLabel(suggestion({ name: 'x'.repeat(200) }), 'en').length).toBe(100)
  })
})

describe('findDecks', () => {
  it('asks for at most 25 suggestions for the given viewer', async () => {
    const spy = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    await findDecks({} as never, 'aggro', 'user-1')
    expect(spy).toHaveBeenCalledWith({}, { query: 'aggro', viewerId: 'user-1', limit: 25 })
  })
})

describe('resolveDeckRef', () => {
  it('takes an id the viewer may see', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'D' })
    expect(await resolveDeckRef({} as never, 'abc123', null))
      .toEqual({ kind: 'deck', id: 'abc123', name: 'D', access: 'public' })
  })

  it('takes a link, keyed by the id inside it', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'own-private', name: 'D' })
    const ref = await resolveDeckRef({} as never, 'https://revelio.cards/de/decks/abc123', 'u1')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', 'u1')
    expect(ref).toEqual({ kind: 'deck', id: 'abc123', name: 'D', access: 'own-private' })
  })

  it('falls back to a name search with the whole input', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([suggestion({ id: 'd9', name: 'Aggro/Control' })])
    const ref = await resolveDeckRef({} as never, '  Aggro/Control ', null)
    expect(search).toHaveBeenCalledWith({}, { query: 'Aggro/Control', viewerId: null, limit: 25 })
    expect(ref).toEqual({ kind: 'deck', id: 'd9', name: 'Aggro/Control', access: 'public' })
  })

  it('picks the one exact name among several partial matches', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([
      suggestion({ id: 'a', name: 'Aggro Deluxe' }),
      suggestion({ id: 'b', name: 'aggro', visibility: 'private', isOwn: true }),
    ])
    expect(await resolveDeckRef({} as never, 'Aggro', 'u1'))
      .toEqual({ kind: 'deck', id: 'b', name: 'aggro', access: 'own-private' })
  })

  it('reports several matches as ambiguous', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const options = [suggestion({ id: 'a', name: 'Aggro One' }), suggestion({ id: 'b', name: 'Aggro Two' })]
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue(options)
    expect(await resolveDeckRef({} as never, 'aggro', null)).toEqual({ kind: 'ambiguous', options })
  })

  it('reports no match as none', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    expect(await resolveDeckRef({} as never, 'nothing', null)).toEqual({ kind: 'none' })
  })

  // An empty query matches every visible deck, so a blank input reaching the
  // name search would come back as a 25-deck menu of everything.
  it('treats blank input as none without reading anything', async () => {
    const access = vi.spyOn(dbModule, 'getDeckAccess')
    const search = vi.spyOn(dbModule, 'suggestDecks')
    expect(await resolveDeckRef({} as never, '   ', null)).toEqual({ kind: 'none' })
    expect(access).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/decks.test.ts`
Expected: FAIL, `resolveDeckRef` / `suggestionLabel` / `findDecks` are not exported. The renamed `getDeckView` tests fail too until Step 4 adds the third parameter.

- [ ] **Step 4: Implement**

In `app/bot/src/data/decks.ts`, replace the imports with:

```ts
import {
  getDeckAccess,
  getDeckForViewer,
  suggestDecks,
  type DB,
  type DeckSuggestion,
} from '@revelio/db'
import {
  evaluateDeck,
  type DeckCardMeta,
  type DeckCardView,
  type DeckFormat,
  type DeckStatus,
} from '@revelio/core'
import { t } from '../i18n/t'
import { clampLabel, MAX_CHOICES } from './cards'
```

Rename `export type PublicDeck = {` to `export type DeckView = {`. After it, add:

```ts
// What /deck was asked for, once the input has been read. A picked suggestion
// always arrives as an id, so it lands on 'deck'; only typed free text can be
// 'ambiguous'.
export type DeckRef =
  | { kind: 'deck'; id: string; name: string; access: 'public' | 'own-private' }
  | { kind: 'ambiguous'; options: DeckSuggestion[] }
  | { kind: 'none' }
```

Replace `getPublicDeck` with this signature and opening, keeping the rest of the body unchanged:

```ts
// The viewer decides what is visible: null sees public decks only, an owner
// also sees their own private ones. getDeckForViewer is what enforces that;
// never call getDeck directly.
export async function getDeckView(db: DB, ref: string, viewerId: string | null): Promise<DeckView | null> {
  const res = await getDeckForViewer(db, parseDeckRef(ref), viewerId)
```

Append:

```ts
export function findDecks(db: DB, query: string, viewerId: string | null): Promise<DeckSuggestion[]> {
  return suggestDecks(db, { query, viewerId, limit: MAX_CHOICES })
}

// suggestDecks only returns public decks and the viewer's own, so a private
// suggestion is always the viewer's own.
export function accessOf(s: DeckSuggestion): 'public' | 'own-private' {
  return s.visibility === 'public' ? 'public' : 'own-private'
}

// Shared by autocomplete and the "did you mean" menu, so a deck reads the same
// in both. Only the person typing sees either, so naming their own private
// deck here leaks nothing.
export function suggestionLabel(s: DeckSuggestion, locale: string): string {
  const lock = s.visibility === 'public' ? '' : '🔒 '
  return clampLabel(`${lock}${s.name} · @${s.author} · ${t(locale, `deck.format.${s.format}`)}`)
}

export async function resolveDeckRef(db: DB, input: string, viewerId: string | null): Promise<DeckRef> {
  const id = parseDeckRef(input)
  if (!id) return { kind: 'none' }
  const hit = await getDeckAccess(db, id, viewerId)
  if (hit) return { kind: 'deck', id, ...hit }

  // The whole input, not the parsed id: parseDeckRef cuts at the first "/",
  // which would turn a deck called "Aggro/Control" into "Aggro".
  const query = input.trim()
  const matches = await findDecks(db, query, viewerId)
  if (matches.length === 0) return { kind: 'none' }
  const wanted = query.toLowerCase()
  const exact = matches.filter((m) => m.name.toLowerCase() === wanted)
  const one = matches.length === 1 ? matches[0] : exact.length === 1 ? exact[0] : null
  if (one) return { kind: 'deck', id: one.id, name: one.name, access: accessOf(one) }
  return { kind: 'ambiguous', options: matches }
}
```

In `app/bot/src/discord/commands/deck.ts`, change the import to `getDeckView` and line 40 to `const deck = await getDeckView(deps.db, ref, null)`. This keeps today's behaviour until Task 4.

- [ ] **Step 5: Run the bot suite**

Run: `/usr/local/bin/npm test -w @revelio/bot`
Expected: PASS, every file.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `/usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint`
Expected: no errors.

```bash
git add app/bot/src app/bot/test
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): resolve a deck by id, link or name for a given viewer"
```

---

### Task 3: Autocomplete on `/deck`

**Files:**
- Modify: `app/bot/src/discord/commands/deck.ts`
- Modify: `app/core/src/bot-commands.ts:72`
- Modify: `app/bot/src/i18n/en.json:24-25`, `app/bot/src/i18n/de.json:24-25`
- Test: `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: `findDecks`, `suggestionLabel` (Task 2), `resolveLinkedUser` from `bot/src/data/link.ts`.
- Produces: `autocomplete(interaction: AutocompleteInteraction, deps: Deps): Promise<void>` exported from `commands/deck.ts`.

- [ ] **Step 1: Write the failing tests**

In `app/bot/test/commands.test.ts`, give `fakeAutocomplete` a user. Change its returned object to:

```ts
  return {
    locale,
    user: { id: '111' },
    respond: vi.fn().mockResolvedValue(undefined),
    options: { getFocused: () => focused, getSubcommand: () => null },
  }
```

Append a suite:

```ts
describe('/deck autocomplete', () => {
  const row = (over: Partial<dbModule.DeckSuggestion>): dbModule.DeckSuggestion => ({
    id: 'd1', name: 'Gryffindor Aggro', format: 'classic', author: 'seeker',
    visibility: 'public', isOwn: false, ...over,
  })

  it('suggests decks for the linked viewer, valued by deck id', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([
      row({ id: 'mine', name: 'Secret', visibility: 'private', isOwn: true }),
      row({ id: 'pub' }),
    ])
    const interaction = fakeAutocomplete('gry')
    await COMMANDS.get('deck')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(search).toHaveBeenCalledWith({}, { query: 'gry', viewerId: 'user-1', limit: 25 })
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: '🔒 Secret · @seeker · Classic', value: 'mine' },
      { name: 'Gryffindor Aggro · @seeker · Classic', value: 'pub' },
    ])
  })

  it('searches public decks only for an unlinked user', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    await COMMANDS.get('deck')!.autocomplete!(fakeAutocomplete('') as never, fakeDeps([], 0) as never)
    expect(search).toHaveBeenCalledWith({}, { query: '', viewerId: null, limit: 25 })
  })

  it('answers an empty list rather than throwing when the query fails', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeAutocomplete('x')
    await COMMANDS.get('deck')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/commands.test.ts test/command-manifest.test.ts`
Expected: FAIL. `autocomplete` is undefined on `/deck`, and the manifest test still passes because nothing has changed yet.

- [ ] **Step 3: Implement**

In `app/bot/src/discord/commands/deck.ts`, add `type AutocompleteInteraction` to the `discord.js` import and these imports:

```ts
import { findDecks, getDeckView, suggestionLabel } from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
```

Add `.setAutocomplete(true)` to the `deck` option, after `.setRequired(true)`. Append:

```ts
// Runs on every keystroke inside a 3 second budget with no defer, so a failure
// degrades to an empty list - free text still works - rather than an error.
// resolveLinkedUser is one indexed read and also enforces a ban: a banned
// user is treated as unlinked and sees public decks only.
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const locale = toRevelioLocale(interaction.locale)
  try {
    const viewerId = await resolveLinkedUser(deps.db, interaction.user.id)
    const decks = await findDecks(deps.db, interaction.options.getFocused(), viewerId)
    await interaction.respond(decks.map((d) => ({ name: suggestionLabel(d, locale), value: d.id })))
  } catch (err) {
    console.error('deck autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}
```

In `app/core/src/bot-commands.ts`, line 72 becomes:

```ts
      { name: 'deck', type: 'string', required: true, autocomplete: true },
```

In `app/bot/src/i18n/en.json`:

```json
  "command.deck.description": "Find a deck by name, or paste its link",
  "command.deck.option.deck": "Deck name, link or id",
```

In `app/bot/src/i18n/de.json`:

```json
  "command.deck.description": "Ein Deck per Name finden oder seinen Link einfügen",
  "command.deck.option.deck": "Deckname, Link oder ID",
```

- [ ] **Step 4: Run the bot suite**

Run: `/usr/local/bin/npm test -w @revelio/bot`
Expected: PASS. `command-manifest.test.ts` now checks `autocomplete: true` against the builder.

- [ ] **Step 5: Commit**

```bash
git add app/bot/src/discord/commands/deck.ts app/bot/src/i18n app/bot/test/commands.test.ts app/core/src/bot-commands.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): suggest decks by name as /deck is typed"
```

---

### Task 4: Execute flow with private-deck and "did you mean" prompts

**Files:**
- Create: `app/bot/src/discord/components/deck-prompts.ts`
- Modify: `app/bot/src/discord/commands/deck.ts` (rewrite `execute`)
- Modify: `app/bot/src/i18n/en.json`, `de.json`
- Test: `app/bot/test/deck-prompts.test.ts` (new), `app/bot/test/commands.test.ts` (`/deck` suite), `app/bot/test/command-manifest.test.ts`

**Interfaces:**
- Consumes: `resolveDeckRef`, `getDeckView`, `accessOf`, `suggestionLabel`, `DeckRef`, `DeckView` (Task 2); `DeckSuggestion` (Task 1).
- Produces (in `deck-prompts.ts`):
  - `POST_ID = 'deck:post'`, `SELF_ID = 'deck:self'`, `PICK_ID = 'deck:pick'`, `PROMPT_TIMEOUT_MS = 60_000`
  - `type DeckPrompt = { content: string; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] }`
  - `visibilityPrompt(name: string, locale: string): DeckPrompt`
  - `pickPrompt(options: DeckSuggestion[], locale: string): DeckPrompt`
  - `awaitChoice(message: Message, userId: string): Promise<MessageComponentInteraction | null>`

The flow, as `execute` implements it:

```
resolveLinkedUser -> resolveDeckRef
  none              -> reply ephemeral notFound
  deck / public     -> deferReply (public) -> getDeckView -> deliver via editReply
  deck / own-private-> reply ephemeral visibilityPrompt -> awaitChoice
                         post -> deferUpdate, followUp (public), prompt := posted
                         self -> deferUpdate, editReply replaces prompt
  ambiguous         -> reply ephemeral pickPrompt -> awaitChoice
                         public pick  -> as "post" above
                         private pick -> update to visibilityPrompt -> awaitChoice -> as above
  any awaitChoice timeout -> interaction.editReply(expired, no components), errors swallowed
```

- [ ] **Step 1: Add the i18n keys**

In `app/bot/src/i18n/en.json`, replace `deck.notFound` and add the new keys after it:

```json
  "deck.notFound": "No deck matched that name, link or id.",
  "deck.ambiguous": "Several decks match. Which one did you mean?",
  "deck.pick.placeholder": "Pick a deck",
  "deck.private.prompt": "**{name}** is private. Post it to the channel, or show it only to you?",
  "deck.private.post": "Post publicly",
  "deck.private.self": "Only show me",
  "deck.posted": "Posted to the channel.",
  "deck.prompt.expired": "This choice expired. Run /deck again.",
```

In `app/bot/src/i18n/de.json`:

```json
  "deck.notFound": "Zu diesem Namen, Link oder dieser ID passt kein Deck.",
  "deck.ambiguous": "Mehrere Decks passen. Welches meinst du?",
  "deck.pick.placeholder": "Deck auswählen",
  "deck.private.prompt": "**{name}** ist privat. Im Kanal posten oder nur dir zeigen?",
  "deck.private.post": "Öffentlich posten",
  "deck.private.self": "Nur mir zeigen",
  "deck.posted": "Im Kanal gepostet.",
  "deck.prompt.expired": "Diese Auswahl ist abgelaufen. Führe /deck erneut aus.",
```

- [ ] **Step 2: Write the failing prompt tests**

Create `app/bot/test/deck-prompts.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { DeckSuggestion } from '@revelio/db'
import {
  awaitChoice, pickPrompt, visibilityPrompt, PICK_ID, POST_ID, PROMPT_TIMEOUT_MS, SELF_ID,
} from '../src/discord/components/deck-prompts'

const suggestion = (id: string): DeckSuggestion => ({
  id, name: `Deck ${id}`, format: 'classic', author: 'seeker', visibility: 'public', isOwn: false,
})

describe('visibilityPrompt', () => {
  it('names the deck and offers post and self buttons', () => {
    const prompt = visibilityPrompt('Secret Charms', 'en')
    expect(prompt.content).toContain('Secret Charms')
    const ids = prompt.components[0].toJSON().components.map((c) => (c as { custom_id: string }).custom_id)
    expect(ids).toEqual([POST_ID, SELF_ID])
  })
})

describe('pickPrompt', () => {
  it('offers at most 25 decks, valued by id', () => {
    const prompt = pickPrompt(Array.from({ length: 30 }, (_, i) => suggestion(String(i))), 'en')
    const menu = prompt.components[0].toJSON().components[0] as { custom_id: string; options: { value: string }[] }
    expect(menu.custom_id).toBe(PICK_ID)
    expect(menu.options).toHaveLength(25)
    expect(menu.options[0].value).toBe('0')
  })
})

describe('awaitChoice', () => {
  it('accepts only the user who ran the command, within the timeout', async () => {
    const awaitMessageComponent = vi.fn().mockResolvedValue({ customId: POST_ID })
    await awaitChoice({ awaitMessageComponent } as never, '111')
    const { filter, time } = awaitMessageComponent.mock.calls[0][0]
    expect(time).toBe(PROMPT_TIMEOUT_MS)
    expect(filter({ user: { id: '111' } })).toBe(true)
    expect(filter({ user: { id: '222' } })).toBe(false)
  })

  it('returns null when the collector times out', async () => {
    const awaitMessageComponent = vi.fn().mockRejectedValue(new Error('time'))
    expect(await awaitChoice({ awaitMessageComponent } as never, '111')).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/deck-prompts.test.ts`
Expected: FAIL, module `../src/discord/components/deck-prompts` not found.

- [ ] **Step 4: Implement `deck-prompts.ts`**

Create `app/bot/src/discord/components/deck-prompts.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Message,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
} from 'discord.js'
import type { DeckSuggestion } from '@revelio/db'
import { suggestionLabel } from '../../data/decks'
import { t } from '../../i18n/t'

export type DeckPrompt = {
  content: string
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
}

// Plain constants, nothing encoded: the collector's closure already holds the
// deck id, so a custom id only has to say which control was used.
export const POST_ID = 'deck:post'
export const SELF_ID = 'deck:self'
export const PICK_ID = 'deck:pick'

// Long enough to read a yes/no prompt, short enough that an abandoned one does
// not hold a collector open. A bot restart inside this window leaves the
// buttons dead; that was accepted over a stateless router that would have to
// re-authorize every click (spec section 5).
export const PROMPT_TIMEOUT_MS = 60_000

const MAX_OPTIONS = 25

export function visibilityPrompt(name: string, locale: string): DeckPrompt {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(POST_ID).setLabel(t(locale, 'deck.private.post')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(SELF_ID).setLabel(t(locale, 'deck.private.self')).setStyle(ButtonStyle.Secondary),
  )
  return { content: t(locale, 'deck.private.prompt', { name }), components: [row] }
}

export function pickPrompt(options: DeckSuggestion[], locale: string): DeckPrompt {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PICK_ID)
    .setPlaceholder(t(locale, 'deck.pick.placeholder'))
    .addOptions(options.slice(0, MAX_OPTIONS).map((o) => ({ label: suggestionLabel(o, locale), value: o.id })))
  return {
    content: t(locale, 'deck.ambiguous'),
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  }
}

// The prompt is ephemeral, but the filter is the guarantee: only the person
// who ran /deck can answer it. A timeout (or any collector error) is null.
export async function awaitChoice(
  message: Message,
  userId: string,
): Promise<MessageComponentInteraction | null> {
  try {
    return await message.awaitMessageComponent({
      filter: (i) => i.user.id === userId,
      time: PROMPT_TIMEOUT_MS,
    })
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the prompt tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/deck-prompts.test.ts`
Expected: PASS.

- [ ] **Step 6: Rewrite the `/deck` suite in `commands.test.ts` (failing first)**

Replace `fakeInteraction` in `app/bot/test/commands.test.ts` with a version that also carries a user and an ephemeral `reply` whose message exposes a collector:

```ts
function fakeInteraction(
  options: Record<string, string | number | null>,
  locale = 'en',
  awaitMessageComponent = vi.fn().mockRejectedValue(new Error('time')),
) {
  return {
    locale,
    user: { id: '111' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({ resource: { message: { awaitMessageComponent } } }),
    options: {
      getString: (name: string) => (options[name] as string) ?? null,
      getInteger: (name: string) => (options[name] as number) ?? null,
    },
  }
}

// A button or select click on the prompt. message.awaitMessageComponent is
// what a select pick hands on to the visibility prompt that replaces it.
function fakeComponent(
  customId: string,
  values: string[] = [],
  next = vi.fn().mockRejectedValue(new Error('time')),
) {
  return {
    customId,
    values,
    user: { id: '111' },
    isStringSelectMenu: () => values.length > 0,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    message: { awaitMessageComponent: next },
  }
}

const access = (value: dbModule.DeckAccess | null) =>
  vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(value)
const viewer = (id: string | null) =>
  vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(id)
```

At the top of the `/deck` describe block, add a `beforeEach` that makes the existing tests run as an unlinked user looking at a public deck:

```ts
  beforeEach(() => {
    viewer(null)
    access({ access: 'public', name: 'Charms Aggro' })
  })
```

Keep every existing `/deck` test as it is, except the miss test. Replace `'replies with a localized miss for a private or unknown deck'` with the tests below, all inside the same describe:

```ts
  it('answers an unknown deck ephemerally, without a public defer', async () => {
    access(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    const interaction = fakeInteraction({ deck: 'nope' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'No deck matched that name, link or id.',
      flags: MessageFlags.Ephemeral,
    })
  })

  // Review focus 3: someone else's private deck is indistinguishable from a
  // deck that does not exist.
  it('answers another user\'s private deck exactly like an unknown one', async () => {
    viewer('user-1')
    access(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    const interaction = fakeInteraction({ deck: 'bobs-private-id' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply.mock.calls[0][0].content).toBe('No deck matched that name, link or id.')
  })

  it('loads a public deck with the linked viewer', async () => {
    viewer('user-1')
    const load = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith()
    expect(load).toHaveBeenCalledWith({}, 'abc123', 'user-1')
  })

  // The leak regression: an own private deck must never start with a public
  // defer, whatever happens afterwards.
  it('asks privately before showing an own private deck', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    const prompt = interaction.reply.mock.calls[0][0]
    expect(prompt.flags).toBe(MessageFlags.Ephemeral)
    expect(prompt.content).toContain('Secret Charms')
    expect(prompt.components).toHaveLength(1)
  })

  it('posts publicly only after "Post publicly"', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const click = fakeComponent('deck:post')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deferUpdate).toHaveBeenCalled()
    const posted = click.followUp.mock.calls[0][0]
    expect(posted.flags).toBeUndefined()
    expect(posted.embeds[0].toJSON().title).toBe('Charms Aggro')
    expect(click.editReply).toHaveBeenCalledWith({ content: 'Posted to the channel.', components: [] })
  })

  it('never posts publicly for "Only show me"', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const click = fakeComponent('deck:self')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.followUp).not.toHaveBeenCalled()
    const shown = click.editReply.mock.calls[0][0]
    expect(shown.content).toBe('')
    expect(shown.components).toEqual([])
    expect(shown.embeds[0].toJSON().title).toBe('Charms Aggro')
  })

  // Review focus 4: the deck vanished or went private between prompt and click.
  it('reports a deck that disappeared before the click, and posts nothing', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    const click = fakeComponent('deck:post')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.followUp).not.toHaveBeenCalled()
    expect(click.editReply).toHaveBeenCalledWith({
      content: 'No deck matched that name, link or id.', components: [],
    })
  })

  it('strips the buttons when the prompt times out', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'This choice expired. Run /deck again.', components: [],
    })
  })

  // Review focus 5: the user dismissed the ephemeral prompt, so the expiry
  // edit has nothing left to edit.
  it('survives a dismissed prompt at timeout', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    interaction.editReply.mockRejectedValue(new Error('Unknown Message'))
    await expect(
      COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never),
    ).resolves.toBeUndefined()
  })

  describe('an ambiguous name', () => {
    const options: dbModule.DeckSuggestion[] = [
      { id: 'pub', name: 'Aggro One', format: 'classic', author: 'seeker', visibility: 'public', isOwn: false },
      { id: 'mine', name: 'Aggro Two', format: 'classic', author: 'me', visibility: 'private', isOwn: true },
    ]
    beforeEach(() => {
      viewer('user-1')
      access(null)
      vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue(options)
      vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    })

    it('asks which deck was meant, privately', async () => {
      const interaction = fakeInteraction({ deck: 'aggro' })
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(interaction.deferReply).not.toHaveBeenCalled()
      const prompt = interaction.reply.mock.calls[0][0]
      expect(prompt.flags).toBe(MessageFlags.Ephemeral)
      expect(prompt.content).toBe('Several decks match. Which one did you mean?')
    })

    it('posts a picked public deck to the channel', async () => {
      const pick = fakeComponent('deck:pick', ['pub'])
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(pick.followUp).toHaveBeenCalled()
      expect(pick.editReply).toHaveBeenCalledWith({ content: 'Posted to the channel.', components: [] })
    })

    it('asks again before showing a picked private deck', async () => {
      const click = fakeComponent('deck:self')
      const pick = fakeComponent('deck:pick', ['mine'], vi.fn().mockResolvedValue(click))
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(pick.followUp).not.toHaveBeenCalled()
      expect(pick.update.mock.calls[0][0].content).toContain('Aggro Two')
      expect(click.followUp).not.toHaveBeenCalled()
      expect(click.editReply.mock.calls[0][0].embeds[0].toJSON().title).toBe('Charms Aggro')
    })
  })
```

Add `MessageFlags` to the test file's imports: `import { MessageFlags } from 'discord.js'`. Also change the existing `'never records a view'` test so it still runs under the new `beforeEach` (no edit needed beyond the shared setup).

In `app/bot/test/command-manifest.test.ts`, `deferOf` passes no deck, which now resolves to the ephemeral "not found". Give `/deck` a public deck to defer for. Change the getter in `deferOf` to `options: { getString: (n: string) => (n === 'deck' ? 'abc123' : null), getInteger: () => null },` and add `reply: vi.fn().mockResolvedValue(undefined),` to the fake interaction. In the "defers ephemerally / in the channel" loop, before calling `deferOf`, add:

```ts
      // /deck's first reply depends on the deck. A public one is what the
      // manifest's "in the channel" claim is about.
      if (command.name === 'deck') {
        vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
        vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'D' })
        vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
      }
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/commands.test.ts test/command-manifest.test.ts`
Expected: FAIL. The new `/deck` tests fail against the old execute: no `reply`, no prompt, wrong miss text.

- [ ] **Step 7: Rewrite `execute` in `commands/deck.ts`**

The full file after this step (it keeps Task 3's builder and autocomplete):

```ts
import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type MessageComponentInteraction,
} from 'discord.js'
import type { DeckSuggestion } from '@revelio/db'
import type { Deps } from '../../clients'
import {
  accessOf,
  findDecks,
  getDeckView,
  resolveDeckRef,
  suggestionLabel,
  type DeckView,
} from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { requestDeckSheet } from '../../data/sheet'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import {
  awaitChoice,
  pickPrompt,
  POST_ID,
  visibilityPrompt,
} from '../components/deck-prompts'
import { deckEmbed } from '../embeds/deck-embed'

type DeckPayload = { embeds: EmbedBuilder[]; files?: AttachmentBuilder[]; components: [] }

type DeckContext = { deps: Deps; locale: string; viewerId: string | null; listOnly: boolean }

// 'post' sends a public follow-up and marks the prompt as done; 'self' turns
// the ephemeral prompt itself into the deck.
type Delivery = 'post' | 'self'

export const data = new SlashCommandBuilder()
  .setName('deck')
  .setDescription(t('en', 'command.deck.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.deck.description') })
  .addStringOption((o) =>
    o.setName('deck')
      .setDescription(t('en', 'command.deck.option.deck'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.deck') })
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o.setName('view')
      .setDescription(t('en', 'command.deck.option.view'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.view') })
      .addChoices(
        ...(['image', 'list'] as const).map((value) => ({
          name: t('en', `command.deck.view.${value}`),
          name_localizations: { de: t('de', `command.deck.view.${value}`) },
          value,
        })),
      ),
  )

// A deck with no cards has no picture worth posting, and a sheet that cannot
// be had must not cost the answer: both fall back to the list the embed can
// always draw from the data already in hand. The bot draws nothing itself -
// @revelio/sheet is the only process that paints a deck. `send` is whichever
// call puts the answer where it belongs: the deferred reply, a public
// follow-up, or the ephemeral prompt being replaced.
async function deliverDeck(
  send: (payload: DeckPayload) => Promise<unknown>,
  deck: DeckView,
  ctx: DeckContext,
): Promise<void> {
  const { locale } = ctx
  const siteBase = ctx.deps.env.SITE_BASE_URL
  if (!ctx.listOnly && deck.entries.length > 0) {
    try {
      const sheet = await requestDeckSheet(deck, locale, ctx.deps.env)
      await send({
        embeds: [deckEmbed(deck, { locale, siteBase, view: 'image', imageName: sheet.name })],
        files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
        components: [],
      })
      return
    } catch (err) {
      console.error('deck sheet render failed:', err)
    }
  }
  await send({ embeds: [deckEmbed(deck, { locale, siteBase, view: 'list' })], components: [] })
}

// Answers a click on the prompt. The deck is loaded again here rather than
// carried from before the prompt: it may have been deleted or made private in
// the meantime, and getDeckForViewer is the check that has to run last.
async function deliverChoice(
  component: MessageComponentInteraction,
  deckId: string,
  delivery: Delivery,
  ctx: DeckContext,
): Promise<void> {
  await component.deferUpdate()
  try {
    const deck = await getDeckView(ctx.deps.db, deckId, ctx.viewerId)
    if (!deck) {
      await component.editReply({ content: t(ctx.locale, 'deck.notFound'), components: [] })
      return
    }
    if (delivery === 'post') {
      await deliverDeck((p) => component.followUp(p), deck, ctx)
      await component.editReply({ content: t(ctx.locale, 'deck.posted'), components: [] })
    } else {
      await deliverDeck((p) => component.editReply({ ...p, content: '' }), deck, ctx)
    }
  } catch (err) {
    console.error('deck prompt failed:', err)
    await component
      .editReply({ content: t(ctx.locale, 'error.generic'), embeds: [], components: [] })
      .catch(() => {})
  }
}

async function expire(interaction: ChatInputCommandInteraction, locale: string): Promise<void> {
  // The user may have dismissed the ephemeral prompt already, in which case
  // there is nothing left to edit and nothing to report.
  await interaction
    .editReply({ content: t(locale, 'deck.prompt.expired'), components: [] })
    .catch(() => {})
}

async function answerPick(
  interaction: ChatInputCommandInteraction,
  pick: MessageComponentInteraction,
  options: DeckSuggestion[],
  ctx: DeckContext,
): Promise<void> {
  const chosen = pick.isStringSelectMenu() ? options.find((o) => o.id === pick.values[0]) : undefined
  if (!chosen) {
    await pick.update({ content: t(ctx.locale, 'deck.notFound'), components: [] })
    return
  }
  if (accessOf(chosen) === 'public') {
    await deliverChoice(pick, chosen.id, 'post', ctx)
    return
  }
  await pick.update(visibilityPrompt(chosen.name, ctx.locale))
  const click = await awaitChoice(pick.message, interaction.user.id)
  if (!click) {
    await expire(interaction, ctx.locale)
    return
  }
  await deliverChoice(click, chosen.id, click.customId === POST_ID ? 'post' : 'self', ctx)
}

// The one command that does not defer first. Whether its first reply is public
// or ephemeral depends on the deck, and Discord cannot make a public reply
// ephemeral afterwards. So it does at most three indexed reads first (linked
// user, deck access, and a name search when the input is not an id); the
// sheet render, the slow part, still runs after a defer.
export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  const locale = toRevelioLocale(interaction.locale)
  const viewerId = await resolveLinkedUser(deps.db, interaction.user.id)
  const ctx: DeckContext = {
    deps, locale, viewerId, listOnly: interaction.options.getString('view') === 'list',
  }
  const ref = await resolveDeckRef(deps.db, interaction.options.getString('deck') ?? '', viewerId)

  if (ref.kind === 'none') {
    // One message for "no such deck" and "someone else's private deck":
    // telling them apart would confirm a deck its owner chose not to share.
    await interaction.reply({ content: t(locale, 'deck.notFound'), flags: MessageFlags.Ephemeral })
    return
  }

  if (ref.kind === 'deck' && ref.access === 'public') {
    await interaction.deferReply()
    const deck = await getDeckView(deps.db, ref.id, viewerId)
    if (!deck) {
      await interaction.editReply({ content: t(locale, 'deck.notFound') })
      return
    }
    await deliverDeck((p) => interaction.editReply(p), deck, ctx)
    return
  }

  // Everything left is private to the caller until they say otherwise: their
  // own private deck, or a list of names to choose from.
  const prompt = ref.kind === 'ambiguous'
    ? pickPrompt(ref.options, locale)
    : visibilityPrompt(ref.name, locale)
  const response = await interaction.reply({ ...prompt, flags: MessageFlags.Ephemeral, withResponse: true })
  const message = response.resource?.message
  if (!message) {
    console.warn(`deck prompt has no message to collect on (${interaction.id})`)
    return
  }

  const choice = await awaitChoice(message, interaction.user.id)
  if (!choice) {
    await expire(interaction, locale)
    return
  }
  if (ref.kind === 'deck') {
    await deliverChoice(choice, ref.id, choice.customId === POST_ID ? 'post' : 'self', ctx)
    return
  }
  await answerPick(interaction, choice, ref.options, ctx)
}

// Runs on every keystroke inside a 3 second budget with no defer, so a failure
// degrades to an empty list - free text still works - rather than an error.
// resolveLinkedUser is one indexed read and also enforces a ban: a banned
// user is treated as unlinked and sees public decks only.
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const locale = toRevelioLocale(interaction.locale)
  try {
    const viewerId = await resolveLinkedUser(deps.db, interaction.user.id)
    const decks = await findDecks(deps.db, interaction.options.getFocused(), viewerId)
    await interaction.respond(decks.map((d) => ({ name: suggestionLabel(d, locale), value: d.id })))
  } catch (err) {
    console.error('deck autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}
```

If TypeScript rejects `interaction.editReply(p)` / `component.followUp(p)` because `components: []` is typed as an empty tuple, change `DeckPayload.components` to `never[]`. Do not add a cast at the call site.

The existing `'falls back to the list when Discord rejects the upload'` test still holds: `deliverDeck` keeps the image `send` inside the `try`.

- [ ] **Step 8: Run the whole bot suite**

Run: `/usr/local/bin/npm test -w @revelio/bot`
Expected: PASS, including `catalog-parity.test.ts` (both catalogs carry the new keys) and `command-manifest.test.ts`.

- [ ] **Step 9: Mutation check on the leak test**

Temporarily change the own-private branch so it goes through the public path: in `execute`, replace `ref.access === 'public'` with `true`. Run `/usr/local/bin/npm test -w @revelio/bot -- test/commands.test.ts -t "asks privately"`. Expected: FAIL (deferReply was called). Revert the change and re-run. Expected: PASS. Record this in the PR's Verification section.

- [ ] **Step 10: Typecheck, lint, commit**

Run: `/usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint`
Expected: no errors.

```bash
git add app/bot/src app/bot/test
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): ask before posting a private deck and resolve deck names"
```

---

### Task 5: Docs, command reference and CLAUDE.md

**Files:**
- Modify: `app/web/content/docs/discord-commands.en.mdx`, `discord-commands.de.mdx` (section "Deck lookup" / "Deck nachschlagen")
- Modify: `app/web/content/docs/discord-privacy.en.mdx`, `discord-privacy.de.mdx` ("What the bot can read", "Where answers appear")
- Modify: `app/web/content/docs/discord-troubleshooting.en.mdx`, `discord-troubleshooting.de.mdx` ("A deck is not found")
- Modify: `app/web/content/docs/discord-linking.en.mdx`, `discord-linking.de.mdx` ("What linking is for")
- Modify: `app/web/messages/en.json:828,925`, `app/web/messages/de.json:780,877`
- Modify: `CLAUDE.md` (Discord bot specifics)

**Interfaces:**
- Consumes: the behaviour shipped in Tasks 3-4. The manifest (`autocomplete: true`) already drives the `<CommandTable name="deck" />` columns.

- [ ] **Step 1: `discord-commands.en.mdx`**

Replace the paragraph under `## Deck lookup` (from "Shows a public deck by link or id" through "listed by `/mydecks`.") with:

```mdx
Finds a deck by name and shows it as a picture of its cards - the same deck
sheet the builder's "Export PNG" downloads, grouped by card type with a copy
count on each card. The embed above it carries the character, format and
legality. `view:list` answers with a text list instead, which is easier to read
on a slow connection and can be copied.

Start typing and Discord suggests matching decks: every public deck, plus your
own private decks if your account is linked, marked with a lock. Start with `@`
to search by author. A pasted deck link or id works too. If you send a name
without picking a suggestion and more than one deck matches, the bot asks you
privately which one you meant.

Your own private decks are never posted without asking. The bot first answers
only you, with **Post publicly** and **Only show me**; the buttons stop working
after a minute.
```

Add a name example above the two existing ones:

```mdx
<CommandExample>/deck deck:Gryffindor Aggro</CommandExample>
```

- [ ] **Step 2: `discord-commands.de.mdx`**

Replace the paragraph under `## Deck nachschlagen` with:

```mdx
Findet ein Deck per Name und zeigt es als Bild seiner Karten - dasselbe
Deck-Blatt, das im Deck-Builder unter "PNG exportieren" herauskommt, nach
Kartentyp gruppiert und mit der Anzahl auf jeder Karte. Das Embed darüber nennt
Charakter, Format und Legalität. Mit `view:list` kommt stattdessen eine
Textliste, die sich auf einer langsamen Verbindung besser liest und kopieren
lässt.

Beim Tippen schlägt Discord passende Decks vor: alle öffentlichen und, wenn dein
Konto verknüpft ist, auch deine eigenen privaten, mit einem Schloss markiert.
Mit `@` am Anfang suchst du nach Autor. Ein eingefügter Deck-Link oder eine ID
funktioniert ebenfalls. Schickst du einen Namen ab, ohne einen Vorschlag zu
wählen, und passen mehrere Decks, fragt der Bot dich privat, welches du meinst.

Deine eigenen privaten Decks werden nie ohne Nachfrage gepostet. Der Bot
antwortet zuerst nur dir, mit **Öffentlich posten** und **Nur mir zeigen**; die
Buttons funktionieren eine Minute lang.
```

Add `<CommandExample>/deck deck:Gryffindor Aggro</CommandExample>` above the existing examples.

- [ ] **Step 3: `discord-privacy.en.mdx` / `.de.mdx`**

English, "What the bot can read": replace the paragraph starting "For `/collection` and `/mydecks` it also reads your own Revelio data" so its first sentence reads:

```mdx
For `/collection` and `/mydecks`, and for your own private decks in `/deck`, it
also reads your own Revelio data, resolved through the Discord account you
linked yourself.
```

Keep the rest of that paragraph ("It reaches that data directly ...") unchanged.

English, "Where answers appear": after the paragraph ending "They are about the game, not about you.", add:

```mdx
The one exception is your own private deck. `/deck` first asks you, privately,
whether to post it to the channel or show it only to you, and nothing reaches
the channel until you choose.
```

German, the matching first sentence:

```mdx
Für `/collection` und `/mydecks` sowie für deine eigenen privaten Decks in
`/deck` liest er zusätzlich deine eigenen Revelio-Daten, die er über das von dir
selbst verknüpfte Discord-Konto auflöst.
```

German, after "Es geht dabei um das Spiel, nicht um dich.":

```mdx
Die eine Ausnahme ist dein eigenes privates Deck. `/deck` fragt dich zuerst
privat, ob es im Kanal gepostet oder nur dir gezeigt werden soll, und im Kanal
erscheint nichts, bevor du dich entschieden hast.
```

- [ ] **Step 4: `discord-troubleshooting.en.mdx` / `.de.mdx`**

English, replace the body of `## A deck is not found` (both paragraphs) with:

```mdx
`/deck` finds public decks, and your own private decks once your Discord account
is linked. Someone else's private deck is not found, and the reply does not say
whether it exists.

If you typed a name, pick it from the suggestions rather than sending the text:
a picked suggestion is always the exact deck. Otherwise, paste the whole deck
link rather than retyping the id by hand; the full link cannot be mistyped.
```

German:

```mdx
`/deck` findet öffentliche Decks und, sobald dein Discord-Konto verknüpft ist,
auch deine eigenen privaten. Das private Deck von jemand anderem wird nicht
gefunden, und die Antwort verrät nicht, ob es existiert.

Hast du einen Namen getippt, wähle ihn aus den Vorschlägen, statt den Text
abzuschicken: Ein gewählter Vorschlag ist immer genau das Deck. Ansonsten füge
lieber den ganzen Deck-Link ein, statt die ID von Hand abzutippen; beim
vollständigen Link kann man sich nicht vertippen.
```

- [ ] **Step 5: `discord-linking.en.mdx` / `.de.mdx`**

English, under "What linking is for", after "`/card`, `/search` and `/deck` work for anyone in the server, linked or not.", add the sentence:

```mdx
Linking only adds your own private decks to what `/deck` can find.
```

German, after "und `/deck` funktionieren für alle im Server, verknüpft oder nicht.":

```mdx
Eine Verknüpfung fügt nur deine eigenen privaten Decks zu dem hinzu, was `/deck`
finden kann.
```

- [ ] **Step 6: Command reference strings**

`app/web/messages/en.json`, the `deck` entry near line 828:

```json
        "description": "Any deck you can see, found by name, link or id, as a picture of its cards or as a text list."
```

and the `deck` options entry near line 925:

```json
          "deck": "A deck name, link or id. Discord suggests public decks as you type, plus your own private decks when your account is linked; a private one is only posted if you choose to.",
```

`app/web/messages/de.json` near line 780:

```json
        "description": "Jedes Deck, das du sehen darfst, per Name, Link oder ID - als Bild seiner Karten oder als Textliste."
```

near line 877:

```json
          "deck": "Ein Deckname, Link oder eine ID. Beim Tippen schlägt Discord öffentliche Decks vor und, wenn dein Konto verknüpft ist, auch deine eigenen privaten; ein privates wird nur gepostet, wenn du es so wählst.",
```

- [ ] **Step 7: Catch any remaining "public decks only" claims**

Run from the repo root:

```bash
grep -rn -i "public deck\|öffentliche Deck\|only public\|nur öffentliche" app/web/content/docs app/web/messages CLAUDE.md app/bot/README.md 2>/dev/null
```

Expected: every remaining hit is correct as written (for example the web browse page or `/mydecks`). Fix any that still claims `/deck` is limited to public decks.

- [ ] **Step 8: CLAUDE.md**

Under "### Discord bot specifics", replace the bullet `- **Every command defers first** (...)` with:

```markdown
- **Every command defers first** (`interaction.deferReply()`), then edits — a deferred reply has 15 minutes against Discord's 3-second initial budget. **`/deck` is the one exception**: whether its first reply is public or ephemeral depends on the deck, and Discord cannot make a public reply ephemeral afterwards, so it does at most three indexed reads (linked user, `getDeckAccess`, a name search) before answering. The sheet render still runs after a defer.
- **A private deck is never posted without its owner's say-so.** An own private deck (and an ambiguous name) gets an ephemeral prompt answered through `awaitMessageComponent` on that message, 60 s, filtered to the caller (`bot/src/discord/components/deck-prompts.ts`); only **Post publicly** sends a public follow-up. There is no global component router in `main.ts`, so a bot restart leaves an open prompt's buttons dead, which is accepted.
```

- [ ] **Step 9: Verify the web side**

Run: `/usr/local/bin/npm test -w web -- src/components/docs src/lib/docs`
Expected: PASS (`command-table.test.tsx` reads the manifest; `content-render.test.tsx` renders the MDX).

Run: `/usr/local/bin/npm run lint -w web`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add app/web/content/docs app/web/messages CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe deck search and the private-deck prompt in /deck"
```

---

### Task 6: Full verification and a manual Discord run

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full checks**

Run from `app/`, one at a time, and note each result for the PR:

```bash
/usr/local/bin/npm run check -w @revelio/db
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm test -w @revelio/ingest -- test/deck-suggest.test.ts test/deck-browse.test.ts test/deck-viewer.test.ts
/usr/local/bin/npm test -w web
```

Expected: all green. Do not run the whole ingest suite against the dev stack: `main.test.ts` and `index-cards.test.ts` wipe the dev Meilisearch indexes. No migration is part of this change, so `npm run verify -w @revelio/db` must also stay clean.

- [ ] **Step 2: Manual run against the local stack**

Start the stack (`/usr/local/bin/docker compose up -d` from `app/`) and the bot (`/usr/local/bin/npm run dev -w @revelio/bot`; it registers commands on boot). With a Discord account linked on the local site, check by hand in a test server:

1. `/deck deck:` with nothing typed lists your own decks first, private ones with the lock.
2. Picking a public deck posts it in the channel as before.
3. Picking your own private deck shows an ephemeral prompt. **Only show me** turns the prompt into the deck, and nothing appears in the channel. Run it again: **Post publicly** posts the deck in the channel and the prompt reads "Posted to the channel."
4. Typing a partial name shared by several decks and pressing Enter without picking shows the ephemeral select menu.
5. Leaving a prompt for over a minute changes it to the expiry message, with no buttons.
6. From a second, unlinked Discord account: no lock entries in suggestions, and pasting the first account's private deck id gives the ephemeral "No deck matched".

Item 3's "Post publicly" is the one behaviour unit tests cannot prove: that Discord accepts a public `followUp` from a component on an ephemeral message. If it comes back ephemeral or errors, stop and report it rather than working around it.

- [ ] **Step 3: Hand off**

Nothing to commit if everything passed. The PR (title `feat(bot): find decks by name in /deck`) links the spec and this plan. Its `## Verification` section lists the commands from Step 1 with their real results, the mutation check from Task 4 Step 9, and the manual items from Step 2. It needs no `## Deployment` section: there is no migration, no env var and no reindex. Command registration happens on the bot's next boot.

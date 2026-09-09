# Discord Bot Deck Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/deck <id-or-url>` renders a public deck - its starting character, main deck, sideboard, lesson mix and legality - from a pasted revelio.cards link or a bare deck id.

**Architecture:** One Postgres read through the existing `getDeckForViewer(db, id, null)`, which already refuses any deck that is not public. Legality reuses `evaluateDeck` from `@revelio/core`, the same function the web deck builder uses, so Discord and the site can never disagree about whether a deck is legal.

**Tech Stack:** discord.js 14, Drizzle via `@revelio/db`, `@revelio/core` deck legality, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-discord-bot-design.md`.

## Global Constraints

- All commands run from `app/`. Use `/usr/local/bin/npm`; `gh` and `gpg` live at `/opt/homebrew/bin/`.
- Run tests per workspace. Never run the bare root `npm test` locally.
- Every user-facing string comes from `bot/src/i18n/en.json` **and** `bot/src/i18n/de.json`; `test/catalog-parity.test.ts` enforces the pair.
- Code comments are ASCII only. Conventional Commits. No Claude attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`.
- Branch: `feat/discord-bot-deck-lookup`, off `main`.
- **The bot is read-only.** It must not call `recordView`, `toggleLike`, or any write. A Discord lookup is not a site visit and must not inflate a deck's view count.
- **Visibility is not the bot's decision.** Always call `getDeckForViewer` with `viewerId = null` in this phase. Never call `getDeck` directly - it returns private decks.
- Embed limits, hard: description 4096 characters, field value 1024, at most 25 fields.

## Prerequisites

`feat/discord-bot-autocomplete` merged (or at minimum `feat/discord-bot-foundation`; this
plan touches no autocomplete code, but the task numbering assumes the foundation exists).

---

## Design

### Accepting whatever the user pastes

People paste links, not ids. `parseDeckRef` accepts all of:

```
7f3c2a91-...                              bare id
https://revelio.cards/decks/7f3c2a91-...  English URL
https://revelio.cards/de/decks/7f3c...    German URL
http://localhost:3000/decks/7f3c...       any host, for local testing
.../decks/7f3c...?utm_source=x            with a query string
```

It takes the segment after `/decks/`, or the whole trimmed input when there is no
`/decks/` in it. It does not validate the id's shape - an unknown id is a lookup miss,
which already has a localized reply, and shape-guessing would break the day the id format
changes.

### Legality

`getDeckForViewer` returns `views: DeckCardView[]`, and `DeckCardView` already carries
`isLesson`, `isStartingCharacter`, `isOfficial` and `legality` - the exact fields
`DeckCardMeta` needs. So the meta map is built straight from the views, with no second
query and no reimplementation of `deckCardMeta`'s rules.

`evaluateDeck` returns `{ status, violations }`. The embed shows the status word only.
Rendering each violation would need a localized string per violation code plus card-name
resolution, which is a deck-builder concern; on Discord, "incomplete" plus a link to the
deck is the honest amount of detail.

### What the embed shows

| Element | Source |
|---|---|
| Title, URL | `deck.name`, `deckUrl(siteBase, id, locale)` |
| Accent colour | the deck's most-used lesson, via `LESSONS` |
| Starting character | the `character` zone entry's name |
| Main deck | `Nx Name` lines, cost then name, clamped to the field limit |
| Sideboard | same, omitted when empty |
| Format, Legality | `deck.format`, `evaluateDeck(...).status` |
| Footer | owner username and card counts |

---

## File Structure

**Create:**
- `app/bot/src/data/decks.ts` - `parseDeckRef`, `getPublicDeck`
- `app/bot/src/discord/embeds/deck-embed.ts`
- `app/bot/src/discord/commands/deck.ts`
- `app/bot/test/decks.test.ts`, `app/bot/test/deck-embed.test.ts`

**Modify:**
- `app/bot/src/links.ts` - add `deckUrl`
- `app/bot/src/discord/commands/index.ts` - register `deck`
- `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`
- `app/bot/test/commands.test.ts`, `app/bot/test/links.test.ts`

---

### Task 1: Deck reference parsing and the public-deck read

**Files:**
- Create: `app/bot/src/data/decks.ts`
- Modify: `app/bot/src/links.ts`
- Test: `app/bot/test/decks.test.ts`, `app/bot/test/links.test.ts`

**Interfaces:**
- Consumes: `getDeckForViewer`, `DB` from `@revelio/db`; `evaluateDeck`, `deckCardMeta` types from `@revelio/core`.
- Produces:
  - `function parseDeckRef(input: string): string`
  - `type DeckEntryView = { name: string; quantity: number; cost: number | null; lesson: string | null }`
  - `type PublicDeck = { id: string; name: string; format: DeckFormat; ownerUsername: string | null; character: DeckEntryView | null; main: DeckEntryView[]; sideboard: DeckEntryView[]; mainCount: number; sideboardCount: number; topLesson: string | null; status: DeckStatus }`
  - `function getPublicDeck(db: DB, ref: string): Promise<PublicDeck | null>`
  - `function deckUrl(siteBase: string, id: string, locale: string): string`

- [ ] **Step 1: Write the failing tests**

`app/bot/test/decks.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { parseDeckRef, getPublicDeck } from '../src/data/decks'

afterEach(() => vi.restoreAllMocks())

describe('parseDeckRef', () => {
  it('accepts a bare id', () => {
    expect(parseDeckRef('abc123')).toBe('abc123')
  })

  it('accepts an English deck URL', () => {
    expect(parseDeckRef('https://revelio.cards/decks/abc123')).toBe('abc123')
  })

  it('accepts a locale-prefixed deck URL', () => {
    expect(parseDeckRef('https://revelio.cards/de/decks/abc123')).toBe('abc123')
  })

  it('accepts a localhost URL', () => {
    expect(parseDeckRef('http://localhost:3000/decks/abc123')).toBe('abc123')
  })

  it('drops a query string and a trailing slash', () => {
    expect(parseDeckRef('https://revelio.cards/decks/abc123/?utm_source=x')).toBe('abc123')
  })

  it('trims surrounding whitespace', () => {
    expect(parseDeckRef('  abc123  ')).toBe('abc123')
  })
})

const views = [
  { cardId: 'c1', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, lesson: null, types: ['character'], subTypes: ['wizard'], isLesson: false, isStartingCharacter: true, isOfficial: true, legality: 'legal' },
  { cardId: 'c2', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms', types: ['spell'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c3', zone: 'main', quantity: 8, name: 'Charms Lesson', cost: 0, lesson: 'charms', types: ['lesson'], subTypes: [], isLesson: true, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c4', zone: 'sideboard', quantity: 2, name: 'Nimbus 2000', cost: 4, lesson: 'quidditch', types: ['item'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
]

function stubDeck() {
  return {
    deck: {
      id: 'abc123', name: 'Charms Aggro', format: 'classic', visibility: 'public',
      cards: views.map((v) => ({ cardId: v.cardId, zone: v.zone, quantity: v.quantity })),
      createdAt: '2026-01-01', updatedAt: '2026-01-02',
    },
    userId: 'u1',
    views,
    viewCount: 7,
    ownerUsername: 'seeker',
  }
}

describe('getPublicDeck', () => {
  it('reads through getDeckForViewer with a null viewer', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    await getPublicDeck({} as never, 'https://revelio.cards/decks/abc123')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', null)
  })

  it('returns null for a deck that is not public', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    expect(await getPublicDeck({} as never, 'abc123')).toBeNull()
  })

  it('splits the zones and counts each one', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getPublicDeck({} as never, 'abc123')
    expect(deck!.character?.name).toBe('Harry Potter')
    expect(deck!.mainCount).toBe(12)
    expect(deck!.sideboardCount).toBe(2)
    expect(deck!.sideboard.map((c) => c.name)).toEqual(['Nimbus 2000'])
  })

  it('orders the main deck by cost, then by name', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getPublicDeck({} as never, 'abc123')
    expect(deck!.main.map((c) => c.name)).toEqual(['Charms Lesson', 'Alohomora'])
  })

  it('reports the most-used lesson', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getPublicDeck({} as never, 'abc123'))!.topLesson).toBe('charms')
  })

  it('evaluates legality with the shared rules', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    // 12 main-deck cards is short of 60, so the shared evaluator says incomplete.
    expect((await getPublicDeck({} as never, 'abc123'))!.status).toBe('incomplete')
  })

  it('carries the owner username through', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getPublicDeck({} as never, 'abc123'))!.ownerUsername).toBe('seeker')
  })
})
```

Append to `app/bot/test/links.test.ts`:

```ts
import { deckUrl } from '../src/links'

describe('deckUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(deckUrl('https://revelio.cards', 'abc123', 'en'))
      .toBe('https://revelio.cards/decks/abc123')
  })

  it('prefixes non-default locales', () => {
    expect(deckUrl('https://revelio.cards', 'abc123', 'de'))
      .toBe('https://revelio.cards/de/decks/abc123')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL on the unresolved `../src/data/decks` import and the missing `deckUrl`.

- [ ] **Step 3: Add `deckUrl`**

In `app/bot/src/links.ts`, beside `cardUrl`:

```ts
export function deckUrl(siteBase: string, id: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/decks/${id}`
}
```

- [ ] **Step 4: Write `data/decks.ts`**

```ts
import { getDeckForViewer, type DB } from '@revelio/db'
import { evaluateDeck, type DeckCardMeta, type DeckFormat, type DeckStatus } from '@revelio/core'

export type DeckEntryView = {
  name: string
  quantity: number
  cost: number | null
  lesson: string | null
}

export type PublicDeck = {
  id: string
  name: string
  format: DeckFormat
  ownerUsername: string | null
  character: DeckEntryView | null
  main: DeckEntryView[]
  sideboard: DeckEntryView[]
  mainCount: number
  sideboardCount: number
  topLesson: string | null
  status: DeckStatus
}

// People paste links, not ids. Take the segment after /decks/ when there is one,
// otherwise treat the whole input as an id. No shape validation: an unknown id
// is already a lookup miss with its own reply, and guessing the id format would
// break the day that format changes.
export function parseDeckRef(input: string): string {
  const trimmed = input.trim()
  const match = /\/decks\/([^/?#]+)/.exec(trimmed)
  if (match) return match[1]
  return trimmed.replace(/[/?#].*$/, '')
}

function byCostThenName(a: DeckEntryView, b: DeckEntryView): number {
  const ac = a.cost ?? Number.MAX_SAFE_INTEGER
  const bc = b.cost ?? Number.MAX_SAFE_INTEGER
  return ac !== bc ? ac - bc : a.name.localeCompare(b.name)
}

export async function getPublicDeck(db: DB, ref: string): Promise<PublicDeck | null> {
  // Always a null viewer here: this phase serves public decks only, and
  // getDeckForViewer is what enforces that. Never call getDeck directly.
  const res = await getDeckForViewer(db, parseDeckRef(ref), null)
  if (!res) return null
  const { deck, views, ownerUsername } = res

  const toEntry = (v: (typeof views)[number]): DeckEntryView => ({
    name: v.name, quantity: v.quantity, cost: v.cost, lesson: v.lesson,
  })
  const main = views.filter((v) => v.zone === 'main').map(toEntry).sort(byCostThenName)
  const sideboard = views.filter((v) => v.zone === 'sideboard').map(toEntry).sort(byCostThenName)
  const character = views.find((v) => v.zone === 'character')

  const copies = (list: DeckEntryView[]) => list.reduce((n, c) => n + c.quantity, 0)

  // Most-used lesson by copies, for the embed's accent colour.
  const lessonCopies = new Map<string, number>()
  for (const v of views) {
    if (!v.lesson) continue
    lessonCopies.set(v.lesson, (lessonCopies.get(v.lesson) ?? 0) + v.quantity)
  }
  const topLesson = [...lessonCopies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // DeckCardView already carries every field DeckCardMeta needs, so legality
  // reuses the same evaluator the deck builder runs - the two can never disagree.
  const meta: Record<string, DeckCardMeta> = {}
  for (const v of views) {
    meta[v.cardId] = {
      id: v.cardId,
      isOfficial: v.isOfficial,
      legality: v.legality,
      isLesson: v.isLesson,
      isStartingCharacter: v.isStartingCharacter,
    }
  }
  const { status } = evaluateDeck(
    views.map((v) => ({ cardId: v.cardId, zone: v.zone, quantity: v.quantity })),
    deck.format,
    meta,
  )

  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    ownerUsername,
    character: character ? toEntry(character) : null,
    main,
    sideboard,
    mainCount: copies(main),
    sideboardCount: copies(sideboard),
    topLesson,
    status,
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS. If `vi.spyOn` on the `@revelio/db` export fails under the ESM transform,
apply the same fix the foundation plan describes: accept the query function as an optional
last parameter defaulting to the real import.

- [ ] **Step 6: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): read public decks and evaluate their legality"
```

---

### Task 2: The deck embed and the `/deck` command

**Files:**
- Create: `app/bot/src/discord/embeds/deck-embed.ts`, `app/bot/src/discord/commands/deck.ts`
- Modify: `app/bot/src/discord/commands/index.ts`, `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`
- Test: `app/bot/test/deck-embed.test.ts`, `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: `PublicDeck` from Task 1.
- Produces: `function deckEmbed(deck: PublicDeck, opts: { locale: string; siteBase: string }): EmbedBuilder`, and a `deck` entry in `COMMANDS`.

- [ ] **Step 1: Add the strings**

To `app/bot/src/i18n/en.json`:

```json
  "command.deck.description": "Look up a public deck",
  "command.deck.option.deck": "Deck link or id",
  "deck.notFound": "No public deck matched that link. Private decks cannot be shown here.",
  "deck.field.character": "Starting character",
  "deck.field.main": "Main deck ({count})",
  "deck.field.sideboard": "Sideboard ({count})",
  "deck.field.format": "Format",
  "deck.field.legality": "Legality",
  "deck.footer": "by {owner}",
  "deck.footer.anonymous": "shared on revelio.cards",
  "deck.status.legal": "Legal",
  "deck.status.incomplete": "Incomplete",
  "deck.status.illegal": "Illegal",
  "deck.format.classic": "Classic",
  "deck.format.revival": "Revival",
  "deck.more": "... and {count} more"
```

To `app/bot/src/i18n/de.json`:

```json
  "command.deck.description": "Ein öffentliches Deck nachschlagen",
  "command.deck.option.deck": "Deck-Link oder ID",
  "deck.notFound": "Zu diesem Link gibt es kein öffentliches Deck. Private Decks können hier nicht gezeigt werden.",
  "deck.field.character": "Startcharakter",
  "deck.field.main": "Hauptdeck ({count})",
  "deck.field.sideboard": "Seitendeck ({count})",
  "deck.field.format": "Format",
  "deck.field.legality": "Legalität",
  "deck.footer": "von {owner}",
  "deck.footer.anonymous": "geteilt auf revelio.cards",
  "deck.status.legal": "Legal",
  "deck.status.incomplete": "Unvollständig",
  "deck.status.illegal": "Illegal",
  "deck.format.classic": "Classic",
  "deck.format.revival": "Revival",
  "deck.more": "... und {count} weitere"
```

- [ ] **Step 2: Write the failing tests**

`app/bot/test/deck-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deckEmbed } from '../src/discord/embeds/deck-embed'
import type { PublicDeck } from '../src/data/decks'

const deck: PublicDeck = {
  id: 'abc123',
  name: 'Charms Aggro',
  format: 'classic',
  ownerUsername: 'seeker',
  character: { name: 'Harry Potter', quantity: 1, cost: null, lesson: null },
  main: [
    { name: 'Charms Lesson', quantity: 8, cost: 0, lesson: 'charms' },
    { name: 'Alohomora', quantity: 4, cost: 2, lesson: 'charms' },
  ],
  sideboard: [{ name: 'Nimbus 2000', quantity: 2, cost: 4, lesson: 'quidditch' }],
  mainCount: 12,
  sideboardCount: 2,
  topLesson: 'charms',
  status: 'incomplete',
}

const opts = { locale: 'en', siteBase: 'https://revelio.cards' }

describe('deckEmbed', () => {
  it('titles with the deck name and links to the deck page', () => {
    const json = deckEmbed(deck, opts).toJSON()
    expect(json.title).toBe('Charms Aggro')
    expect(json.url).toBe('https://revelio.cards/decks/abc123')
  })

  it('tints with the most-used lesson colour', () => {
    expect(deckEmbed(deck, opts).toJSON().color).toBe(0x0069a9)
  })

  it('lists the main deck as quantity-prefixed lines', () => {
    const field = deckEmbed(deck, opts).toJSON().fields?.find((f) => f.name.startsWith('Main deck'))
    expect(field?.name).toBe('Main deck (12)')
    expect(field?.value).toContain('8x Charms Lesson')
    expect(field?.value).toContain('4x Alohomora')
  })

  it('shows the starting character', () => {
    const json = deckEmbed(deck, opts).toJSON()
    expect(json.fields?.find((f) => f.name === 'Starting character')?.value).toBe('Harry Potter')
  })

  it('omits the sideboard field when the sideboard is empty', () => {
    const json = deckEmbed({ ...deck, sideboard: [], sideboardCount: 0 }, opts).toJSON()
    expect(json.fields?.some((f) => f.name.startsWith('Sideboard'))).toBe(false)
  })

  it('localizes the format and legality', () => {
    const json = deckEmbed(deck, { ...opts, locale: 'de' }).toJSON()
    expect(json.fields?.find((f) => f.name === 'Legalität')?.value).toBe('Unvollständig')
  })

  it('credits the owner in the footer, or says shared when anonymous', () => {
    expect(deckEmbed(deck, opts).toJSON().footer?.text).toBe('by seeker')
    expect(deckEmbed({ ...deck, ownerUsername: null }, opts).toJSON().footer?.text)
      .toBe('shared on revelio.cards')
  })

  it('truncates a long card list with a remainder line, inside the 1024 limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Card number ${i}`, quantity: 1, cost: i, lesson: 'charms',
    }))
    const json = deckEmbed({ ...deck, main: many, mainCount: 200 }, opts).toJSON()
    const field = json.fields?.find((f) => f.name.startsWith('Main deck'))!
    expect(field.value.length).toBeLessThanOrEqual(1024)
    expect(field.value).toContain('and')
    expect(field.value).toContain('more')
  })
})
```

Append to `app/bot/test/commands.test.ts`:

```ts
describe('/deck', () => {
  it('replies with an embed for a public deck', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'https://revelio.cards/decks/abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Charms Aggro')
  })

  it('replies with a localized miss for a private or unknown deck', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    const interaction = fakeInteraction({ deck: 'nope' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Private decks') }),
    )
  })

  it('never records a view', async () => {
    const record = vi.spyOn(dbModule, 'recordView')
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(record).not.toHaveBeenCalled()
  })
})
```

Import `stubDeck` by exporting it from `test/decks.test.ts`, or duplicate the fixture in
`commands.test.ts` - duplicating a fixture across two test files is fine and keeps each
readable.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL.

- [ ] **Step 4: Write the embed**

`app/bot/src/discord/embeds/deck-embed.ts`:

```ts
import { EmbedBuilder } from 'discord.js'
import { LESSONS } from '@revelio/core'
import type { DeckEntryView, PublicDeck } from '../../data/decks'
import { t } from '../../i18n/t'
import { deckUrl } from '../../links'

const FIELD_LIMIT = 1024
const FALLBACK_COLOR = 0x2b2d31

function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

// Fill the field with whole lines, then say how many were left out. A truncated
// card name would read as a data bug; an explicit remainder reads as a summary.
function cardList(entries: DeckEntryView[], locale: string): string {
  const lines: string[] = []
  let used = 0
  for (let i = 0; i < entries.length; i++) {
    const line = `${entries[i].quantity}x ${entries[i].name}`
    const remainder = t(locale, 'deck.more', { count: entries.length - i })
    if (used + line.length + 1 + remainder.length + 1 > FIELD_LIMIT) {
      lines.push(remainder)
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

export type DeckEmbedOptions = { locale: string; siteBase: string }

export function deckEmbed(deck: PublicDeck, opts: DeckEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const embed = new EmbedBuilder()
    .setTitle(deck.name)
    .setURL(deckUrl(opts.siteBase, deck.id, locale))
    .setColor(lessonColor(deck.topLesson))
    .setFooter({
      text: deck.ownerUsername
        ? t(locale, 'deck.footer', { owner: deck.ownerUsername })
        : t(locale, 'deck.footer.anonymous'),
    })

  if (deck.character) {
    embed.addFields({
      name: t(locale, 'deck.field.character'),
      value: deck.character.name,
      inline: true,
    })
  }
  embed.addFields(
    { name: t(locale, 'deck.field.format'), value: t(locale, `deck.format.${deck.format}`), inline: true },
    { name: t(locale, 'deck.field.legality'), value: t(locale, `deck.status.${deck.status}`), inline: true },
  )
  if (deck.main.length) {
    embed.addFields({
      name: t(locale, 'deck.field.main', { count: deck.mainCount }),
      value: cardList(deck.main, locale),
    })
  }
  if (deck.sideboard.length) {
    embed.addFields({
      name: t(locale, 'deck.field.sideboard', { count: deck.sideboardCount }),
      value: cardList(deck.sideboard, locale),
    })
  }
  return embed
}
```

- [ ] **Step 5: Write the command**

`app/bot/src/discord/commands/deck.ts`:

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { getPublicDeck } from '../../data/decks'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { deckEmbed } from '../embeds/deck-embed'

export const data = new SlashCommandBuilder()
  .setName('deck')
  .setDescription(t('en', 'command.deck.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.deck.description') })
  .addStringOption((o) =>
    o.setName('deck')
      .setDescription(t('en', 'command.deck.option.deck'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.deck') })
      .setRequired(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const ref = interaction.options.getString('deck') ?? ''

  const deck = await getPublicDeck(deps.db, ref)
  if (!deck) {
    // One message for "no such deck" and "that deck is private": telling them
    // apart would confirm the existence of a deck its owner chose not to share.
    await interaction.editReply({ content: t(locale, 'deck.notFound') })
    return
  }

  await interaction.editReply({
    embeds: [deckEmbed(deck, { locale, siteBase: deps.env.SITE_BASE_URL })],
  })
}
```

- [ ] **Step 6: Register it**

In `app/bot/src/discord/commands/index.ts`, add the import and extend the array:

```ts
import * as deck from './deck'
...
export const COMMANDS: Map<string, BotCommand> = new Map(
  [card, search, deck].map((c) => [c.data.name, c as BotCommand]),
)
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck
```

Expected: PASS, including `catalog-parity`.

- [ ] **Step 8: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add the /deck command"
```

---

### Task 3: Acceptance in the test guild

**Files:** none. Verification only.

- [ ] **Step 1: Create the fixtures**

On the local site (`npm run dev -w web`), sign in and create two decks: one **public** with
a starting character, a full-ish main deck and a sideboard, and one **private**. Note both
URLs.

- [ ] **Step 2: Restart the bot and run the checklist**

- [ ] `/deck deck:<public URL>` renders the deck: title links to the deck page, starting character, format, legality, main deck list, sideboard list.
- [ ] The same with a bare id works identically.
- [ ] A URL with `?utm_source=x` appended works identically.
- [ ] A German-client lookup shows German field names and a German legality word.
- [ ] `/deck deck:<private URL>` returns the "no public deck matched" line - it must not reveal the deck's name or that it exists.
- [ ] `/deck deck:nonsense` returns the same line.
- [ ] A 60-card deck's main-deck field ends in a "... and N more" line rather than being cut mid-name.
- [ ] Reload the deck page on the site: the view count is unchanged by the Discord lookups.
- [ ] The embed's accent colour matches the deck's dominant lesson.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/discord-bot-deck-lookup
/opt/homebrew/bin/gh pr create --title "feat(bot): /deck lookup for public decks" \
  --body "Adds /deck, accepting a pasted revelio.cards link or a bare id. Reads through getDeckForViewer with a null viewer, so private decks are refused by the same code path the site uses, and reuses evaluateDeck from @revelio/core so Discord and the deck builder cannot disagree about legality. The bot stays read-only: no recordView, no likes."
```

---

## Self-Review Notes

- **Spec coverage:** covers the spec's Phase 3 line, and honours its "the bot is read-only"
  and "deck lookups use getDeckForViewer" statements, each with a test.
- **Type consistency:** `DeckEntryView` and `PublicDeck` are defined once in
  `src/data/decks.ts` and consumed by `deck-embed.ts`; `lessonColor` is duplicated from
  `card-embed.ts` deliberately - two five-line functions with different fallbacks are
  clearer than a shared helper, but if a third embed needs it, extract then.
- **Deliberately not shown:** individual legality violations. Rendering them needs a
  localized string per violation code plus card-name resolution, which is deck-builder
  work; the status word plus a link is the honest level of detail for a chat embed.

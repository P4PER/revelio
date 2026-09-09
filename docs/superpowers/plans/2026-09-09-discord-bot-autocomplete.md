# Discord Bot Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest card names as the user types `/card name:`, and add a set filter to `/search` whose values are suggested the same way, so neither command depends on the user knowing an exact string.

**Architecture:** Discord's autocomplete interaction has a hard 3-second budget and cannot be deferred, so every suggestion path is a single Meilisearch call or an in-memory read of the already-cached set list. `/card` gains a fast path: when the submitted value is a card id (which is what a chosen suggestion sends), it fetches that document directly instead of re-running a text search.

**Tech Stack:** discord.js 14 autocomplete interactions, Meilisearch, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-discord-bot-design.md`.

## Global Constraints

- All commands run from `app/`. Use `/usr/local/bin/npm` and `/usr/local/bin/node`; `gh` and `gpg` live at `/opt/homebrew/bin/`.
- Run tests per workspace. Never run the bare root `npm test` locally - `@revelio/ingest`'s `test/main.test.ts` deletes the dev `cards-en` / `cards-de` indexes.
- Every user-facing string comes from `bot/src/i18n/en.json` **and** `bot/src/i18n/de.json`. `test/catalog-parity.test.ts` enforces the pair.
- Code comments are ASCII only. Conventional Commits. No Claude attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`.
- Branch: `feat/discord-bot-autocomplete`, off `main`.
- **Discord's autocomplete limits, all hard:** at most **25** choices per response; a choice `name` is at most **100** characters; a choice `value` is at most **100** characters; the response must be sent within **3 seconds** and `deferReply` is not available. Breaking any of these makes the suggestion list silently vanish for the user.

## Prerequisites

`feat/discord-bot-foundation` merged. This plan extends `src/data/cards.ts`,
`src/data/sets.ts`, `src/discord/commands/*` and `src/main.ts`.

---

## Design

### Why the id fast path

Today `/card name:Nimbus 2000` runs a text search and takes hit one. Once suggestions
exist, the user usually picks an exact card, and the choice's `value` is what Discord
submits. Sending the card **id** as the value turns the submit into a primary-key lookup:
exact, one round trip, and immune to a second card outranking the chosen one.

Typed free text must still work - a user can ignore the suggestions and press enter. So
`/card` branches: if the value matches a document id, fetch it; otherwise fall back to the
existing search. `getDocument` throwing for a miss is treated as "not an id", not an error.

### Set option, suggested not enumerated

`/search` gains a `set` option. It is not a static choice list: `SlashCommandBuilder`
choices are baked into the registered command, so a new set would need a redeploy, and
there is no guarantee the set count stays under 25. Autocomplete against the cached set
list solves both.

### Where the suggestion budget goes

| Path | Work |
|---|---|
| `/card name` | one `searchCards` call, `hitsPerPage: 25`, `attributesToRetrieve` unrestricted |
| `/search set` | in-memory filter over the TTL-cached set list; a cache miss costs one `listSets` |

Neither touches rulings or the set-name lookup, so both stay far inside 3 seconds.

---

## File Structure

**Modify:**
- `app/bot/src/data/cards.ts` - add `suggestCards`, `findCardById`
- `app/bot/src/data/sets.ts` - add `all(locale)` to the `SetNames` interface
- `app/bot/src/discord/commands/index.ts` - `BotCommand` gains an optional `autocomplete`
- `app/bot/src/discord/commands/card.ts` - autocomplete handler, id fast path
- `app/bot/src/discord/commands/search.ts` - `set` option, autocomplete handler, filter
- `app/bot/src/main.ts` - route autocomplete interactions
- `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json` - the `set` option description

**Test:**
- `app/bot/test/suggest.test.ts` (new)
- `app/bot/test/cards.test.ts`, `app/bot/test/sets.test.ts`, `app/bot/test/commands.test.ts` (extended)

---

### Task 1: Suggestion queries in the data layer

**Files:**
- Modify: `app/bot/src/data/cards.ts`, `app/bot/src/data/sets.ts`
- Test: `app/bot/test/suggest.test.ts`

**Interfaces:**
- Consumes: `searchCards`, `cardsIndex` from `@revelio/search`.
- Produces:
  - `const MAX_CHOICES = 25`
  - `type CardSuggestion = { id: string; label: string }`
  - `function suggestCards(meili: MeiliSearch, input: { query: string; locale: string }): Promise<CardSuggestion[]>`
  - `function findCardById(meili: MeiliSearch, id: string, locale: string): Promise<SearchDocument | null>`
  - `SetNames` gains `all(locale: string): Promise<{ code: string; name: string }[]>`

- [ ] **Step 1: Write the failing tests**

`app/bot/test/suggest.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import { suggestCards, findCardById, MAX_CHOICES } from '../src/data/cards'

function hit(n: number, name = `Card ${n}`) {
  return { id: `base-${n}`, name, setCode: 'base', number: String(n) }
}

function stubMeili(hits: unknown[]) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: hits.length })
  const getDocument = vi.fn()
  const index = vi.fn().mockReturnValue({ search, getDocument })
  return { client: { index } as unknown as MeiliSearch, index, search, getDocument }
}

describe('suggestCards', () => {
  it('labels a suggestion with the name, set and number', async () => {
    const { client } = stubMeili([hit(12, 'Nimbus 2000')])
    const out = await suggestCards(client, { query: 'nim', locale: 'en' })
    expect(out).toEqual([{ id: 'base-12', label: 'Nimbus 2000 (base #12)' }])
  })

  it('queries the locale index and asks for at most 25 hits', async () => {
    const { client, index, search } = stubMeili([])
    await suggestCards(client, { query: 'x', locale: 'de' })
    expect(index).toHaveBeenCalledWith('cards-de')
    expect(search).toHaveBeenCalledWith('x', expect.objectContaining({ limit: MAX_CHOICES }))
  })

  it('never returns more than 25 suggestions', async () => {
    const { client } = stubMeili(Array.from({ length: 40 }, (_, i) => hit(i)))
    expect((await suggestCards(client, { query: 'c', locale: 'en' })).length).toBe(MAX_CHOICES)
  })

  it('keeps every label inside Discord\'s 100 character limit', async () => {
    const { client } = stubMeili([hit(1, 'z'.repeat(200))])
    const [only] = await suggestCards(client, { query: 'z', locale: 'en' })
    expect(only.label.length).toBeLessThanOrEqual(100)
  })

  it('returns an empty list for an empty query rather than calling Meilisearch', async () => {
    const { client, search } = stubMeili([])
    expect(await suggestCards(client, { query: '   ', locale: 'en' })).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })
})

describe('findCardById', () => {
  it('returns the document for a known id', async () => {
    const { client, getDocument } = stubMeili([])
    getDocument.mockResolvedValue(hit(12, 'Nimbus 2000'))
    const doc = await findCardById(client, 'base-12', 'en')
    expect(doc).toMatchObject({ id: 'base-12' })
  })

  it('returns null when the id is not a document', async () => {
    const { client, getDocument } = stubMeili([])
    getDocument.mockRejectedValue(new Error('Document `nope` not found.'))
    expect(await findCardById(client, 'nope', 'en')).toBeNull()
  })
})
```

Extend `app/bot/test/sets.test.ts` with:

```ts
it('lists every set for a locale', async () => {
  vi.spyOn(dbModule, 'listSets').mockResolvedValue([
    { code: 'base', name: 'Base Set' },
    { code: 'qui', name: 'Quidditch Cup' },
  ] as never)
  const sets = createSetNames({} as never)
  expect(await sets.all('en')).toEqual([
    { code: 'base', name: 'Base Set' },
    { code: 'qui', name: 'Quidditch Cup' },
  ])
})

it('shares one cache read between all() and name()', async () => {
  const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
    { code: 'base', name: 'Base Set' },
  ] as never)
  const sets = createSetNames({} as never)
  await sets.all('en')
  await sets.name('base', 'en')
  expect(listSets).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL - `suggestCards`, `findCardById` and `MAX_CHOICES` are not exported.

- [ ] **Step 3: Extend `data/cards.ts`**

Add to the imports:

```ts
import { cardsIndex } from '@revelio/search'
```

Append:

```ts
// Discord's hard ceilings for an autocomplete response. Exceeding either one
// makes the whole suggestion list silently disappear for the user.
export const MAX_CHOICES = 25
const MAX_LABEL = 100

export type CardSuggestion = { id: string; label: string }

function clampLabel(value: string): string {
  return value.length <= MAX_LABEL ? value : `${value.slice(0, MAX_LABEL - 1)}…`
}

// Autocomplete cannot be deferred and must answer inside 3 seconds, so this is
// deliberately one Meilisearch call and nothing else.
export async function suggestCards(
  meili: MeiliSearch,
  input: { query: string; locale: string },
): Promise<CardSuggestion[]> {
  const query = input.query.trim()
  if (!query) return []
  const res = await searchCards(meili, input.locale, query, { hitsPerPage: MAX_CHOICES })
  return res.hits.slice(0, MAX_CHOICES).map((hit) => ({
    id: hit.id,
    label: clampLabel(`${hit.name} (${hit.setCode} #${hit.number})`),
  }))
}

// A chosen suggestion submits the card id, which makes the lookup a primary-key
// read rather than a second text search. A miss means the user typed free text
// instead, so it is a null, not an error.
export async function findCardById(
  meili: MeiliSearch,
  id: string,
  locale: string,
): Promise<SearchDocument | null> {
  try {
    return (await meili.index(cardsIndex(locale)).getDocument(id)) as SearchDocument
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Extend `data/sets.ts`**

Widen the type and return one more method, reusing the existing `namesFor` cache:

```ts
export type SetEntry = { code: string; name: string }

export type SetNames = {
  name(setCode: string, locale: string): Promise<string>
  all(locale: string): Promise<SetEntry[]>
}
```

and inside `createSetNames`, alongside the existing `name`:

```ts
    async all(locale) {
      const names = await namesFor(locale)
      return [...names].map(([code, name]) => ({ code, name }))
    },
```

`namesFor` already returns an insertion-ordered `Map` built from `listSets`, which orders
by release date, so `all` preserves that order.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add card and set suggestion queries"
```

---

### Task 2: Autocomplete routing and the `/card` id fast path

**Files:**
- Modify: `app/bot/src/discord/commands/index.ts`, `app/bot/src/discord/commands/card.ts`, `app/bot/src/main.ts`
- Test: `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: `suggestCards`, `findCardById` from Task 1.
- Produces: `BotCommand` gains `autocomplete?(interaction: AutocompleteInteraction, deps: Deps): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `app/bot/test/commands.test.ts`:

```ts
function fakeAutocomplete(focused: string, locale = 'en') {
  return {
    locale,
    respond: vi.fn().mockResolvedValue(undefined),
    options: { getFocused: () => focused, getSubcommand: () => null },
  }
}

describe('/card autocomplete', () => {
  it('responds with name/value pairs where the value is the card id', async () => {
    const interaction = fakeAutocomplete('nim')
    await COMMANDS.get('card')!.autocomplete!(interaction as never, fakeDeps([doc], 1) as never)
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Nimbus 2000 (base #12)', value: 'base-12' },
    ])
  })

  it('responds with an empty list for an empty query', async () => {
    const interaction = fakeAutocomplete('  ')
    await COMMANDS.get('card')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })

  it('answers with an empty list rather than throwing when Meilisearch fails', async () => {
    const interaction = fakeAutocomplete('nim')
    const deps = { meili: { index: () => ({ search: vi.fn().mockRejectedValue(new Error('down')) }) } }
    await COMMANDS.get('card')!.autocomplete!(interaction as never, deps as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})

describe('/card id fast path', () => {
  it('fetches by id when the submitted value is a document id', async () => {
    const interaction = fakeInteraction({ name: 'base-12' })
    const getDocument = vi.fn().mockResolvedValue(doc)
    const search = vi.fn()
    const deps = {
      meili: { index: () => ({ getDocument, search }) },
      db: {},
      sets: { name: vi.fn().mockResolvedValue('Base Set') },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)
    expect(getDocument).toHaveBeenCalledWith('base-12')
    expect(search).not.toHaveBeenCalled()
  })

  it('falls back to a text search when the value is not an id', async () => {
    const interaction = fakeInteraction({ name: 'nimbus' })
    const getDocument = vi.fn().mockRejectedValue(new Error('not found'))
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const deps = {
      meili: { index: () => ({ getDocument, search }) },
      db: {},
      sets: { name: vi.fn().mockResolvedValue('Base Set') },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)
    expect(search).toHaveBeenCalled()
  })
})
```

`fakeDeps`, `fakeInteraction` and `doc` already exist in this file from the foundation plan.
Note `getCardRulings` reads Postgres through the mocked `@revelio/db`; the fake `db: {}` is
enough because those tests already stub `getCardById`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot -- commands
```

Expected: FAIL - `autocomplete` is undefined on the command.

- [ ] **Step 3: Widen `BotCommand`**

In `app/bot/src/discord/commands/index.ts`:

```ts
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js'

export type BotCommand = {
  data: SlashCommandOptionsOnlyBuilder
  execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void>
  autocomplete?(interaction: AutocompleteInteraction, deps: Deps): Promise<void>
}
```

The rest of the file is unchanged: `[card, search].map(...)` still builds the map, and a
module without an `autocomplete` export simply has the optional property missing.

- [ ] **Step 4: Add autocomplete and the id fast path to `/card`**

In `app/bot/src/discord/commands/card.ts`, mark the option as autocompleting:

```ts
  .addStringOption((o) =>
    o.setName('name')
      .setDescription(t('en', 'command.card.option.name'))
      .setDescriptionLocalizations({ de: t('de', 'command.card.option.name') })
      .setRequired(true)
      .setAutocomplete(true),
  )
```

Add the handler:

```ts
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const focused = interaction.options.getFocused()
  try {
    const suggestions = await suggestCards(deps.meili, {
      query: focused,
      locale: toRevelioLocale(interaction.locale),
    })
    await interaction.respond(suggestions.map((s) => ({ name: s.label, value: s.id })))
  } catch (err) {
    // A failed suggestion must not surface as an error banner mid-typing; an
    // empty list degrades to plain free-text entry.
    console.error('card autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}
```

Replace the lookup inside `execute` with the branch:

```ts
  const name = interaction.options.getString('name') ?? ''
  // A chosen suggestion submits the card id; typed free text does not.
  const doc = (await findCardById(deps.meili, name, locale))
    ?? (await findOneCard(deps.meili, { query: name, locale }))
```

Update the imports at the top of the file:

```ts
import { SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js'
import { findCardById, findOneCard, getCardRulings, suggestCards } from '../../data/cards'
```

- [ ] **Step 5: Route autocomplete interactions in `main.ts`**

Replace the guard at the top of `handle`:

```ts
async function handle(interaction: Interaction, deps: Deps): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = COMMANDS.get(interaction.commandName)
    // Autocomplete has a 3 second budget and no defer, so failures are swallowed
    // inside the handler rather than routed through the reply-based error path
    // below, which does not apply to an autocomplete interaction.
    await command?.autocomplete?.(interaction, deps)
    return
  }
  if (!interaction.isChatInputCommand()) return
  const command = COMMANDS.get(interaction.commandName)
  if (!command) return
  try {
    // ... unchanged
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): suggest card names and look up a chosen card by id"
```

---

### Task 3: A suggested `set` filter on `/search`

**Files:**
- Modify: `app/bot/src/discord/commands/search.ts`, `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`
- Test: `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: `SetNames.all` from Task 1, the `autocomplete` slot from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Add the strings**

`app/bot/src/i18n/en.json`: `"command.search.option.set": "Set"`
`app/bot/src/i18n/de.json`: `"command.search.option.set": "Set"`

(The German label is deliberately the same word; it is the term the German UI already uses.)

- [ ] **Step 2: Write the failing tests**

Append to `app/bot/test/commands.test.ts`:

```ts
describe('/search set filter', () => {
  it('passes the chosen set code into the Meilisearch filter', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const deps = {
      meili: { index: () => ({ search }) },
      db: {},
      sets: { name: vi.fn(), all: vi.fn() },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    const interaction = fakeInteraction({ query: 'broom', set: 'base' })
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    const [, options] = search.mock.calls[0]
    expect(options.filter).toContain('setCode = "base"')
  })

  it('suggests sets matching the typed fragment, by code or by name', async () => {
    const all = vi.fn().mockResolvedValue([
      { code: 'base', name: 'Base Set' },
      { code: 'qui', name: 'Quidditch Cup' },
    ])
    const interaction = fakeAutocomplete('quid')
    await COMMANDS.get('search')!.autocomplete!(interaction as never, { sets: { all } } as never)
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Quidditch Cup', value: 'qui' },
    ])
  })

  it('never suggests more than 25 sets', async () => {
    const all = vi.fn().mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ code: `s${i}`, name: `Set ${i}` })),
    )
    const interaction = fakeAutocomplete('set')
    await COMMANDS.get('search')!.autocomplete!(interaction as never, { sets: { all } } as never)
    expect(interaction.respond.mock.calls[0][0]).toHaveLength(25)
  })
})
```

The filter assertion goes through `buildFilter` in `app/search/src/search.ts`, which emits
`(setCode = "base")` for a single-value `setCode` facet - hence `toContain` rather than an
exact match.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot -- commands
```

Expected: FAIL.

- [ ] **Step 4: Add the option, the filter and the handler**

In `app/bot/src/discord/commands/search.ts`, add the option to the builder, before `page`:

```ts
  .addStringOption((o) =>
    o.setName('set')
      .setDescription(t('en', 'command.search.option.set'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.set') })
      .setAutocomplete(true),
  )
```

In `execute`, read it and add it to the filters:

```ts
  const set = interaction.options.getString('set')
  ...
  if (set) filters.setCode = [set]
```

Add the handler:

```ts
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const focused = interaction.options.getFocused().trim().toLowerCase()
  try {
    const sets = await deps.sets.all(toRevelioLocale(interaction.locale))
    const matches = sets
      .filter((s) => !focused
        || s.code.toLowerCase().includes(focused)
        || s.name.toLowerCase().includes(focused))
      .slice(0, MAX_CHOICES)
    await interaction.respond(matches.map((s) => ({ name: s.name, value: s.code })))
  } catch (err) {
    console.error('search autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}
```

Update the imports:

```ts
import { SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js'
import { findCards, MAX_CHOICES } from '../../data/cards'
```

Only one option on `/search` autocompletes, so the handler does not need to branch on
`interaction.options.getFocused(true).name`. If a second autocompleting option is ever
added here, that branch becomes mandatory - note it in the code review at that point.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck
```

Expected: PASS, including `catalog-parity`.

- [ ] **Step 6: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add a suggested set filter to /search"
```

---

### Task 4: Acceptance in the test guild

**Files:** none. Verification only.

- [ ] **Step 1: Restart the bot against the seeded local stack**

```bash
cd app && docker compose up -d postgres meilisearch minio
DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio \
  MEILI_HOST=http://localhost:7700 MEILI_SEARCH_KEY=masterKey \
  IMAGE_BASE_URL=http://localhost:9000/images SITE_BASE_URL=http://localhost:3000 \
  /usr/local/bin/npm run start -w @revelio/bot
```

Commands re-register on boot, so the new `set` option and the two autocomplete flags
publish automatically. If the option does not appear in Discord, the client is showing a
cached command list: reload it with Ctrl+R.

- [ ] **Step 2: Acceptance checklist**

- [ ] Typing `/card name:nim` shows a suggestion list within about a second.
- [ ] Each suggestion reads `Name (set #number)`.
- [ ] Choosing a suggestion and submitting returns exactly that card, including for a card whose name is a prefix of another card's name.
- [ ] Typing a name in full and submitting **without** choosing a suggestion still returns a card.
- [ ] Typing gibberish shows an empty suggestion list, not an error, and submitting it returns the localized "no card matched" line.
- [ ] With the client in German, suggestions show German card names.
- [ ] `/search query:broom set:` shows the set list; typing a fragment narrows it by code and by name.
- [ ] Choosing a set narrows the result total.
- [ ] Stopping Meilisearch (`docker compose stop meilisearch`) makes suggestions come back empty rather than showing an error banner; restart it afterwards.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/discord-bot-autocomplete
/opt/homebrew/bin/gh pr create --title "feat(bot): card-name and set autocomplete" \
  --body "Adds autocomplete to /card name and a new suggested set filter on /search. A chosen suggestion submits the card id, so the lookup becomes a primary-key read instead of a second text search; typed free text still falls back to search. Every suggestion path is a single Meilisearch call or an in-memory read, to stay inside Discord's 3 second, no-defer autocomplete budget."
```

---

## Self-Review Notes

- **Spec coverage:** covers the spec's Phase 2 line in full, plus the `set` option the
  foundation plan explicitly deferred here.
- **Type consistency:** `MAX_CHOICES` is defined once in `src/data/cards.ts` and imported by
  `search.ts`; `SetNames` gains `all` in one place and both the interface and the
  implementation are updated together.
- **Limits are tested, not assumed:** the 25-choice cap and the 100-character label cap each
  have a test, because Discord fails them silently rather than loudly.

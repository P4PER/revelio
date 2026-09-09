# Discord Bot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Discord bot that answers `/card <name>` with a card embed and `/search <query>` with a paged result list, deployed as a third container beside `web` and `ingest`.

**Architecture:** A new `@revelio/bot` workspace holding a discord.js gateway client. It imports `@revelio/search`, `@revelio/db` and `@revelio/core` directly and talks to Meilisearch and Postgres on the private network - there is no HTTP API between it and the web app. Card text comes from the Meilisearch document, which already carries the language-resolved name, text, flavour text and image version; Postgres supplies only the localized set name and the card's rulings.

**Tech Stack:** Node 22, TypeScript, discord.js 14, Zod, Vitest, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-discord-bot-design.md`.

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use `/usr/local/bin/npm` and `/usr/local/bin/node`. `gh` and `gpg` are at `/opt/homebrew/bin/`.
- Run tests per workspace locally. Never run the bare root `npm test`: `@revelio/ingest`'s `test/main.test.ts` deletes the dev `cards-en` / `cards-de` Meilisearch indexes.
- Dependency direction is `core <- {search, db} <- {ingest, web, bot}`. The bot must never import from `web`.
- Every user-facing string comes from the bot's own catalogs, `bot/src/i18n/en.json` **and** `bot/src/i18n/de.json`. Never hardcode copy in a command or embed.
- Attribute codes are rendered with `attrLabel` from `@revelio/core`. This requires `docs/superpowers/plans/2026-09-09-shared-attribute-labels.md` to be merged first.
- Card images use `thumbKey` (300px), never the full `imageKey`.
- Code comments are ASCII only. No em-dashes, no unicode arrows.
- Conventional Commits. No Claude/Claude Code attribution in commit messages.
- No barrel files: import the leaf path within the workspace.
- Commit signing needs an explicit gpg path: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`.
- Branch: `feat/discord-bot-foundation`, created off `main`.
- The bot requests **no privileged intents**. `GatewayIntentBits.Guilds` only - no Message Content, no Guild Members.
- Secrets (`DISCORD_TOKEN`) never appear in a log line, an embed, or a commit.

## Prerequisites

1. `feat/shared-attribute-labels` merged (`attrLabel` importable from `@revelio/core`).
2. A Discord application created at <https://discord.com/developers/applications>, with a
   bot user. Record the **application id** (`DISCORD_CLIENT_ID`) and the **bot token**
   (`DISCORD_TOKEN`).
3. A private test guild, with the bot invited using scopes `bot` + `applications.commands`
   and no permissions beyond sending messages and embedding links. Record its id
   (`DISCORD_GUILD_ID`).

---

## Design

### Where each field comes from

`SearchDocument` (`app/search/src/documents.ts`) is already per-language: `buildCardDocument`
resolves `name`, `text`, `flavorText` against the requested language with a fallback to the
card's `defaultLanguage`, and resolves `imageLang` / `imageVersion` through
`effectiveImageLang`. So the whole card embed except two fields is one Meilisearch read.

| Embed element | Source |
|---|---|
| Title, description, flavour | `SearchDocument.name` / `.text` / `.flavorText` |
| Types, sub-types, lesson, rarity, cost, damage, legality | `SearchDocument` + `attrLabel` |
| Thumbnail | `thumbKey(id, imageVersion, imageLang, defaultLanguage)` + `imageUrl` |
| Accent colour | `LESSONS` from `@revelio/core`, by `doc.lesson` |
| Set name | Postgres `listSets(db, locale)`, cached with a TTL |
| Rulings | Postgres `getCardById(db, id, locale)` |

### Two clients, one process

Postgres via `createClient(DATABASE_URL)` from `@revelio/db` and Meilisearch via
`createMeiliClient(MEILI_HOST, MEILI_SEARCH_KEY)` from `@revelio/search` - the same read
key the web app uses. The bot never writes, so it never touches `MEILI_WRITE_KEY` or the
master key.

### Set-name cache

A bot process runs for days, so a boot-time snapshot would miss a set added by a later
ingest run. Cache `listSets` per locale behind a 15-minute TTL.

### Interaction flow

Every command defers first (`interaction.deferReply()`), then edits. Meilisearch is fast,
but a cold Postgres connection plus a rulings read can brush Discord's 3-second initial
response budget, and a deferred reply has 15 minutes.

`/search` renders one page of ten hits as a description list, not ten embeds. Paging is a
`page` option rather than buttons: buttons need a component collector and state, and the
page option costs nothing. Buttons can come later if the option proves clumsy.

### Errors

A thrown command is caught in one place, logged with the command name and the interaction
id (never the token), and answered with an ephemeral localized apology. An unknown card
name is a normal outcome, not an error: it gets its own localized "no card matched" reply.

---

## File Structure

**Create:**

```
app/bot/package.json                    workspace manifest
app/bot/tsconfig.json                   extends ../tsconfig.base.json, include src + test
app/bot/tsconfig.typecheck.json         src only, mirrors ingest
app/bot/Dockerfile                      cloned from ingest/Dockerfile
app/bot/src/env.ts                      Zod-validated process env
app/bot/src/clients.ts                  pg + Meilisearch construction, one Deps object
app/bot/src/i18n/en.json                bot-owned strings, English
app/bot/src/i18n/de.json                bot-owned strings, German
app/bot/src/i18n/t.ts                   flat-key lookup with {var} interpolation
app/bot/src/i18n/locale.ts              Discord locale -> Revelio locale
app/bot/src/links.ts                    site URLs for a card
app/bot/src/data/cards.ts               findCards, findOneCard, getCardRulings
app/bot/src/data/sets.ts                TTL-cached set-name lookup
app/bot/src/discord/embeds/card-embed.ts     SearchDocument -> EmbedBuilder
app/bot/src/discord/embeds/search-embed.ts   result page -> EmbedBuilder
app/bot/src/discord/commands/card.ts    /card
app/bot/src/discord/commands/search.ts  /search
app/bot/src/discord/commands/index.ts   the command registry (a map, not a barrel)
app/bot/src/discord/register.ts         REST command registration
app/bot/src/main.ts                     entrypoint
app/bot/test/*.test.ts                  one file per module under test
```

**Modify:**
- `app/package.json` - add `"bot"` to `workspaces`
- `app/docker-compose.yml` - a `bot` service behind a `bot` profile
- `app/.env.example` - the four new variables
- `.github/workflows/publish.yml` - `bot` paths filter and a `build-bot` job

`.github/workflows/ci.yml` needs **no** change: `check` runs `npm run typecheck` and
`test` runs `npm test`, both of which are already `--workspaces`. The bot's tests must
therefore run with no live Meilisearch or Postgres - they use stub clients.

---

### Task 1: Workspace scaffold and validated environment

**Files:**
- Create: `app/bot/package.json`, `app/bot/tsconfig.json`, `app/bot/tsconfig.typecheck.json`, `app/bot/src/env.ts`
- Modify: `app/package.json`, `app/.env.example`
- Test: `app/bot/test/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BotEnv = { DISCORD_TOKEN: string; DISCORD_CLIENT_ID: string; DISCORD_GUILD_ID?: string; DATABASE_URL: string; MEILI_HOST: string; MEILI_SEARCH_KEY: string; IMAGE_BASE_URL: string; SITE_BASE_URL: string }`
  - `function parseEnv(source?: Record<string, string | undefined>): BotEnv` - throws with every missing key named at once.

- [ ] **Step 1: Create the workspace manifest**

`app/bot/package.json`:

```json
{
  "name": "@revelio/bot",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "register": "tsx src/discord/register.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "@revelio/core": "*",
    "@revelio/db": "*",
    "@revelio/search": "*",
    "discord.js": "^14.27.0",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0"
  }
}
```

`app/bot/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`app/bot/tsconfig.typecheck.json`:

```json
{ "extends": "./tsconfig.json", "include": ["src"] }
```

In `app/package.json`, change the workspaces array to:

```json
"workspaces": ["core", "db", "ingest", "search", "web", "bot"],
```

- [ ] **Step 2: Install**

```bash
cd app && /usr/local/bin/npm install
```

Expected: `app/package-lock.json` gains discord.js and its transitive deps, and
`app/node_modules/@revelio/bot` becomes a symlink to `app/bot`.

- [ ] **Step 3: Write the failing test**

`app/bot/test/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/env'

const complete = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123',
  DATABASE_URL: 'postgres://revelio:revelio@localhost:5432/revelio',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_SEARCH_KEY: 'key',
  IMAGE_BASE_URL: 'http://localhost:9000/images',
  SITE_BASE_URL: 'https://revelio.cards',
}

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const env = parseEnv(complete)
    expect(env.DISCORD_TOKEN).toBe('token')
    expect(env.SITE_BASE_URL).toBe('https://revelio.cards')
  })

  it('treats DISCORD_GUILD_ID as optional', () => {
    expect(parseEnv(complete).DISCORD_GUILD_ID).toBeUndefined()
    expect(parseEnv({ ...complete, DISCORD_GUILD_ID: '999' }).DISCORD_GUILD_ID).toBe('999')
  })

  it('defaults MEILI_SEARCH_KEY to an empty string', () => {
    const { MEILI_SEARCH_KEY, ...withoutKey } = complete
    expect(parseEnv(withoutKey).MEILI_SEARCH_KEY).toBe('')
  })

  it('names every missing variable in one message', () => {
    let message = ''
    try {
      parseEnv({ MEILI_SEARCH_KEY: 'key' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('DISCORD_TOKEN')
    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('SITE_BASE_URL')
  })

  it('never puts a secret value in the error message', () => {
    let message = ''
    try {
      parseEnv({ DISCORD_TOKEN: 'super-secret-token' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toContain('super-secret-token')
  })
})
```

The last two cases matter: a bot that dies on a missing variable should say which ones in
one go, and must never echo a token into container logs.

Note: `vitest`'s `rejects.toThrow` is broken in this repo's setup, hence the hand-rolled
try/catch above. Keep that shape for any future throw assertion.

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL, `Failed to resolve import "../src/env"`.

- [ ] **Step 5: Write `env.ts`**

`app/bot/src/env.ts`:

```ts
import { z } from 'zod'

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  // Set to register commands into one guild, which is instant. Unset registers
  // globally, which Discord can take up to an hour to propagate.
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  MEILI_HOST: z.string().url(),
  MEILI_SEARCH_KEY: z.string().default(''),
  IMAGE_BASE_URL: z.string().url(),
  SITE_BASE_URL: z.string().url(),
})

export type BotEnv = z.infer<typeof Env>

// Reports every problem at once and quotes only variable names, never values:
// this message is the first thing a container log shows, and DISCORD_TOKEN
// must never reach it.
export function parseEnv(source: Record<string, string | undefined> = process.env): BotEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid bot environment:\n  ${problems.join('\n  ')}`)
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: 5 passing, clean typecheck.

- [ ] **Step 7: Document the variables**

Append to `app/.env.example`:

```
# --- Discord bot (@revelio/bot) ---
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
# Optional: register slash commands into a single guild for instant iteration.
DISCORD_GUILD_ID=
# The bot renders absolute URLs, so it needs its own copies of these two.
IMAGE_BASE_URL=http://localhost:9000/images
SITE_BASE_URL=http://localhost:3000
```

- [ ] **Step 8: Commit**

```bash
git add app/bot app/package.json app/package-lock.json app/.env.example
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): scaffold the @revelio/bot workspace"
```

---

### Task 2: Locale mapping, i18n, and card links

**Files:**
- Create: `app/bot/src/i18n/locale.ts`, `app/bot/src/i18n/t.ts`, `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`, `app/bot/src/links.ts`
- Test: `app/bot/test/i18n.test.ts`, `app/bot/test/links.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function toRevelioLocale(discordLocale: string | null | undefined): string` - returns `'en'` or `'de'`
  - `function t(locale: string, key: string, vars?: Record<string, string | number>): string`
  - `function cardUrl(siteBase: string, id: string, locale: string): string`
  - `function searchUrl(siteBase: string, query: string, locale: string): string`

- [ ] **Step 1: Write the failing tests**

`app/bot/test/i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toRevelioLocale } from '../src/i18n/locale'
import { t } from '../src/i18n/t'

describe('toRevelioLocale', () => {
  it('maps a supported base language', () => {
    expect(toRevelioLocale('de')).toBe('de')
    expect(toRevelioLocale('en-US')).toBe('en')
    expect(toRevelioLocale('en-GB')).toBe('en')
  })

  it('falls back to English for anything else', () => {
    expect(toRevelioLocale('fr')).toBe('en')
    expect(toRevelioLocale(null)).toBe('en')
    expect(toRevelioLocale(undefined)).toBe('en')
  })
})

describe('t', () => {
  it('resolves a key in the requested locale', () => {
    expect(t('en', 'card.notFound', { name: 'Nimbus' }))
      .toBe('No card matched "Nimbus".')
    expect(t('de', 'card.notFound', { name: 'Nimbus' }))
      .toBe('Keine Karte passt zu "Nimbus".')
  })

  it('falls back to English for an unknown locale', () => {
    expect(t('fr', 'card.notFound', { name: 'x' })).toBe('No card matched "x".')
  })

  it('returns the key itself when it is missing everywhere', () => {
    expect(t('en', 'nope.nope')).toBe('nope.nope')
  })

  it('leaves an unsupplied placeholder visible rather than printing undefined', () => {
    expect(t('en', 'card.notFound')).toBe('No card matched "{name}".')
  })
})
```

`app/bot/test/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cardUrl, searchUrl } from '../src/links'

describe('cardUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(cardUrl('https://revelio.cards', 'base-12', 'en'))
      .toBe('https://revelio.cards/card/base-12')
  })

  it('prefixes non-default locales', () => {
    expect(cardUrl('https://revelio.cards', 'base-12', 'de'))
      .toBe('https://revelio.cards/de/card/base-12')
  })

  it('tolerates a trailing slash on the base', () => {
    expect(cardUrl('https://revelio.cards/', 'base-12', 'en'))
      .toBe('https://revelio.cards/card/base-12')
  })
})

describe('searchUrl', () => {
  it('encodes the query', () => {
    expect(searchUrl('https://revelio.cards', 'harry potter', 'en'))
      .toBe('https://revelio.cards/search?q=harry+potter')
  })

  it('prefixes non-default locales', () => {
    expect(searchUrl('https://revelio.cards', 'nimbus', 'de'))
      .toBe('https://revelio.cards/de/search?q=nimbus')
  })
})
```

The English-has-no-prefix rule mirrors `web/i18n/routing.ts`, which sets
`localePrefix: 'as-needed'` with `defaultLocale: 'en'`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL on the unresolved imports.

- [ ] **Step 3: Write the locale mapper**

`app/bot/src/i18n/locale.ts`:

```ts
// Mirrors web/i18n/routing.ts. Discord sends tags like 'en-US' or 'de'; Revelio
// indexes and message catalogs are keyed by the bare language.
export const LOCALES = ['en', 'de'] as const
export const DEFAULT_LOCALE = 'en'

export function toRevelioLocale(discordLocale: string | null | undefined): string {
  const base = (discordLocale ?? DEFAULT_LOCALE).split('-')[0].toLowerCase()
  return (LOCALES as readonly string[]).includes(base) ? base : DEFAULT_LOCALE
}
```

- [ ] **Step 4: Write the catalogs**

`app/bot/src/i18n/en.json`:

```json
{
  "command.card.description": "Look up a Harry Potter TCG card",
  "command.card.option.name": "Card name",
  "command.search.description": "Search the Harry Potter TCG card database",
  "command.search.option.query": "Search terms",
  "command.search.option.lesson": "Lesson",
  "command.search.option.type": "Card type",
  "command.search.option.page": "Page number",
  "card.notFound": "No card matched \"{name}\".",
  "card.field.type": "Type",
  "card.field.lesson": "Lesson",
  "card.field.cost": "Cost",
  "card.field.damage": "Damage per turn",
  "card.field.rarity": "Rarity",
  "card.field.legality": "Legality",
  "card.field.rulings": "Rulings",
  "card.footer": "{setName} · #{number}",
  "search.noResults": "Nothing matched that search.",
  "search.title": "{total} cards",
  "search.footer": "Page {page} of {pages} · view all on revelio.cards",
  "search.line": "**{name}** · {setCode} #{number}",
  "search.pageOutOfRange": "That page does not exist. This search has {pages} page(s).",
  "error.generic": "Something went wrong. Please try again in a moment."
}
```

`app/bot/src/i18n/de.json`:

```json
{
  "command.card.description": "Eine Harry-Potter-TCG-Karte nachschlagen",
  "command.card.option.name": "Kartenname",
  "command.search.description": "Die Harry-Potter-TCG-Kartendatenbank durchsuchen",
  "command.search.option.query": "Suchbegriffe",
  "command.search.option.lesson": "Lektion",
  "command.search.option.type": "Kartentyp",
  "command.search.option.page": "Seitenzahl",
  "card.notFound": "Keine Karte passt zu \"{name}\".",
  "card.field.type": "Typ",
  "card.field.lesson": "Lektion",
  "card.field.cost": "Kosten",
  "card.field.damage": "Schaden pro Zug",
  "card.field.rarity": "Seltenheit",
  "card.field.legality": "Legalität",
  "card.field.rulings": "Regelklärungen",
  "card.footer": "{setName} · #{number}",
  "search.noResults": "Zu dieser Suche gibt es keine Treffer.",
  "search.title": "{total} Karten",
  "search.footer": "Seite {page} von {pages} · alle Treffer auf revelio.cards",
  "search.line": "**{name}** · {setCode} #{number}",
  "search.pageOutOfRange": "Diese Seite gibt es nicht. Diese Suche hat {pages} Seite(n).",
  "error.generic": "Da ist etwas schiefgelaufen. Bitte versuche es gleich noch einmal."
}
```

Both files must hold the identical key set. Task 7 adds a test that enforces it.

- [ ] **Step 5: Write the lookup**

`app/bot/src/i18n/t.ts`:

```ts
import en from './en.json'
import de from './de.json'
import { DEFAULT_LOCALE } from './locale'

type Catalog = Record<string, string>
const CATALOGS: Record<string, Catalog> = { en, de }

// Flat keys, {name} placeholders. An unsupplied placeholder is left in place
// rather than rendered as "undefined", so a missing variable is obvious in the
// channel instead of silently reading as real copy.
export function t(
  locale: string,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE]
  const template = catalog[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
```

- [ ] **Step 6: Write the link builders**

`app/bot/src/links.ts`:

```ts
import { DEFAULT_LOCALE } from './i18n/locale'

// web/i18n/routing.ts uses localePrefix 'as-needed' with 'en' as the default,
// so English URLs carry no prefix and every other locale does.
function localeRoot(siteBase: string, locale: string): string {
  const base = siteBase.replace(/\/$/, '')
  return locale === DEFAULT_LOCALE ? base : `${base}/${locale}`
}

export function cardUrl(siteBase: string, id: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/card/${id}`
}

export function searchUrl(siteBase: string, query: string, locale: string): string {
  const params = new URLSearchParams({ q: query })
  return `${localeRoot(siteBase, locale)}/search?${params.toString()}`
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add locale mapping, message catalogs and card links"
```

---

### Task 3: The card and set data layer

**Files:**
- Create: `app/bot/src/data/cards.ts`, `app/bot/src/data/sets.ts`
- Test: `app/bot/test/cards.test.ts`, `app/bot/test/sets.test.ts`

**Interfaces:**
- Consumes: `searchCards`, `CardFilters`, `SearchDocument` from `@revelio/search`; `getCardById`, `listSets`, `DB` from `@revelio/db`.
- Produces:
  - `type CardPage = { hits: SearchDocument[]; total: number; page: number; pageSize: number; pages: number }`
  - `function findCards(meili: MeiliSearch, input: { query: string; locale: string; filters?: CardFilters; page?: number; pageSize?: number }): Promise<CardPage>`
  - `function findOneCard(meili: MeiliSearch, input: { query: string; locale: string }): Promise<SearchDocument | null>`
  - `type CardRuling = { date: string | null; source: string | null; text: string }`
  - `function getCardRulings(db: DB, cardId: string, locale: string): Promise<CardRuling[]>`
  - `type SetNames = { name(setCode: string, locale: string): Promise<string> }`
  - `function createSetNames(db: DB, ttlMs?: number): SetNames`

  These are the discord.js-free functions the spec requires: a future
  `web/src/app/api/v1` route calls them unchanged.

- [ ] **Step 1: Write the failing tests**

`app/bot/test/cards.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import { findCards, findOneCard, getCardRulings } from '../src/data/cards'

function stubMeili(hits: unknown[], estimatedTotalHits: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits })
  const index = vi.fn().mockReturnValue({ search })
  return { client: { index } as unknown as MeiliSearch, index, search }
}

const doc = { id: 'base-12', name: 'Nimbus 2000', setCode: 'base', number: '12' }

describe('findCards', () => {
  it('queries the locale index and reports page arithmetic', async () => {
    const { client, index, search } = stubMeili([doc], 25)
    const page = await findCards(client, { query: 'nimbus', locale: 'de', page: 2, pageSize: 10 })

    expect(index).toHaveBeenCalledWith('cards-de')
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 10, offset: 10 }))
    expect(page).toMatchObject({ total: 25, page: 2, pageSize: 10, pages: 3 })
    expect(page.hits).toHaveLength(1)
  })

  it('reports one page when there are no results', async () => {
    const { client } = stubMeili([], 0)
    const page = await findCards(client, { query: 'zzz', locale: 'en' })
    expect(page).toMatchObject({ total: 0, page: 1, pages: 1 })
    expect(page.hits).toEqual([])
  })

  it('clamps a page below one', async () => {
    const { client, search } = stubMeili([], 5)
    await findCards(client, { query: 'x', locale: 'en', page: 0 })
    expect(search).toHaveBeenCalledWith('x', expect.objectContaining({ offset: 0 }))
  })
})

describe('findOneCard', () => {
  it('returns the single best hit', async () => {
    const { client, search } = stubMeili([doc], 4)
    const hit = await findOneCard(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 1 }))
    expect(hit).toMatchObject({ id: 'base-12' })
  })

  it('returns null when nothing matches', async () => {
    const { client } = stubMeili([], 0)
    expect(await findOneCard(client, { query: 'zzz', locale: 'en' })).toBeNull()
  })
})
```

Add the rulings block to the same file:

```ts
import * as dbModule from '@revelio/db'

describe('getCardRulings', () => {
  const card = {
    defaultLanguage: 'en',
    rulings: [
      { id: 'r1', seq: 1, date: '2001-11-01', source: 'WotC', text: { en: 'English text', de: 'Deutscher Text' } },
      { id: 'r2', seq: 2, date: null, source: null, text: { en: 'Only English' } },
      { id: 'r3', seq: 3, date: null, source: null, text: {} },
    ],
  }

  it('picks the requested language, falling back to the card default', async () => {
    vi.spyOn(dbModule, 'getCardById').mockResolvedValue(card as never)
    const rulings = await getCardRulings({} as never, 'base-12', 'de')
    expect(rulings.map((r) => r.text)).toEqual(['Deutscher Text', 'Only English'])
  })

  it('drops rulings with no text in any language', async () => {
    vi.spyOn(dbModule, 'getCardById').mockResolvedValue(card as never)
    const rulings = await getCardRulings({} as never, 'base-12', 'en')
    expect(rulings).toHaveLength(2)
  })

  it('returns an empty list for a card that does not exist', async () => {
    vi.spyOn(dbModule, 'getCardById').mockResolvedValue(null)
    expect(await getCardRulings({} as never, 'nope', 'en')).toEqual([])
  })
})
```

`app/bot/test/sets.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { createSetNames } from '../src/data/sets'

afterEach(() => vi.restoreAllMocks())

describe('createSetNames', () => {
  it('resolves a code to its localized name', async () => {
    vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Basis-Set' },
    ] as never)
    const sets = createSetNames({} as never)
    expect(await sets.name('base', 'de')).toBe('Basis-Set')
  })

  it('falls back to the raw code for an unknown set', async () => {
    vi.spyOn(dbModule, 'listSets').mockResolvedValue([] as never)
    const sets = createSetNames({} as never)
    expect(await sets.name('mystery', 'en')).toBe('mystery')
  })

  it('reads the database once per locale within the TTL', async () => {
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never)
    await sets.name('base', 'en')
    await sets.name('base', 'en')
    expect(listSets).toHaveBeenCalledTimes(1)
  })

  it('caches each locale separately', async () => {
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never)
    await sets.name('base', 'en')
    await sets.name('base', 'de')
    expect(listSets).toHaveBeenCalledTimes(2)
  })

  it('re-reads once the TTL has expired', async () => {
    vi.useFakeTimers()
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never, 1000)
    await sets.name('base', 'en')
    vi.advanceTimersByTime(1001)
    await sets.name('base', 'en')
    expect(listSets).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL on the unresolved `../src/data/*` imports.

- [ ] **Step 3: Write `data/cards.ts`**

```ts
import type { MeiliSearch } from 'meilisearch'
import { searchCards, type CardFilters, type SearchDocument } from '@revelio/search'
import { getCardById, type DB } from '@revelio/db'

export const DEFAULT_PAGE_SIZE = 10

export type CardPage = {
  hits: SearchDocument[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export type CardSearchInput = {
  query: string
  locale: string
  filters?: CardFilters
  page?: number
  pageSize?: number
}

export async function findCards(meili: MeiliSearch, input: CardSearchInput): Promise<CardPage> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const res = await searchCards(meili, input.locale, input.query, {
    filters: input.filters,
    page,
    hitsPerPage: pageSize,
  })
  // At least one page even when empty, so "page 1 of 1" reads sensibly rather
  // than "page 1 of 0".
  const pages = Math.max(1, Math.ceil(res.total / pageSize))
  return { hits: res.hits, total: res.total, page, pageSize, pages }
}

export async function findOneCard(
  meili: MeiliSearch,
  input: { query: string; locale: string },
): Promise<SearchDocument | null> {
  const res = await searchCards(meili, input.locale, input.query, { hitsPerPage: 1 })
  return res.hits[0] ?? null
}

export type CardRuling = { date: string | null; source: string | null; text: string }

// Rulings carry one text per language. Prefer the reader's language, fall back
// to the card's default, then to any translation that exists; a ruling with no
// text at all is dropped rather than rendered as an empty bullet.
export async function getCardRulings(
  db: DB,
  cardId: string,
  locale: string,
): Promise<CardRuling[]> {
  const card = await getCardById(db, cardId, locale)
  if (!card) return []
  const out: CardRuling[] = []
  for (const r of card.rulings) {
    const text = r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0]
    if (!text) continue
    out.push({ date: r.date, source: r.source, text })
  }
  return out
}
```

- [ ] **Step 4: Write `data/sets.ts`**

```ts
import { listSets, type DB } from '@revelio/db'

// A bot process runs for days, so a boot-time snapshot would miss a set added by
// a later ingest run. Short TTL instead: cheap query, bounded staleness.
const DEFAULT_TTL_MS = 15 * 60 * 1000

export type SetNames = { name(setCode: string, locale: string): Promise<string> }

export function createSetNames(db: DB, ttlMs: number = DEFAULT_TTL_MS): SetNames {
  const cache = new Map<string, { at: number; names: Map<string, string> }>()

  async function namesFor(locale: string): Promise<Map<string, string>> {
    const cached = cache.get(locale)
    if (cached && Date.now() - cached.at < ttlMs) return cached.names
    const sets = await listSets(db, locale)
    const names = new Map(sets.map((s) => [s.code, s.name]))
    cache.set(locale, { at: Date.now(), names })
    return names
  }

  return {
    async name(setCode, locale) {
      const names = await namesFor(locale)
      return names.get(setCode) ?? setCode
    },
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS. If `vi.spyOn(dbModule, 'getCardById')` fails because the module export is
read-only under the ESM transform, switch those two files to inject the query function
instead: give `getCardRulings` and `createSetNames` an optional last parameter defaulting
to the real import, and pass a stub from the test. Do not weaken the assertions.

- [ ] **Step 6: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add the card and set data layer"
```

---

### Task 4: The card embed

**Files:**
- Create: `app/bot/src/discord/embeds/card-embed.ts`
- Test: `app/bot/test/card-embed.test.ts`

**Interfaces:**
- Consumes: `SearchDocument` from `@revelio/search`; `CardRuling` from `src/data/cards`; `attrLabel`, `LESSONS`, `thumbKey`, `imageUrl` from `@revelio/core`; `t` from `src/i18n/t`; `cardUrl` from `src/links`.
- Produces:
  - `function cardEmbed(doc: SearchDocument, opts: { locale: string; setName: string; imageBase: string; siteBase: string; rulings: CardRuling[] }): EmbedBuilder`

- [ ] **Step 1: Write the failing test**

`app/bot/test/card-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SearchDocument } from '@revelio/search'
import { cardEmbed } from '../src/discord/embeds/card-embed'

const doc: SearchDocument = {
  id: 'base-12',
  setCode: 'base',
  number: '12',
  numberSort: '0:000012',
  name: 'Nimbus 2000',
  text: 'Whenever you play a Quidditch card, draw a card.',
  flavorText: 'The fastest broom on the market.',
  types: ['item'],
  subTypes: ['broom'],
  lesson: 'quidditch',
  rarity: 'rare',
  finishes: ['normal'],
  legality: 'legal',
  cost: 4,
  damage: null,
  isOfficial: true,
  imageLang: 'en',
  imageVersion: 3,
  artCropVersion: null,
  defaultLanguage: 'en',
  orientation: null,
}

const opts = {
  locale: 'en',
  setName: 'Base Set',
  imageBase: 'https://img.revelio.cards',
  siteBase: 'https://revelio.cards',
  rulings: [],
}

describe('cardEmbed', () => {
  it('titles the embed with the card name and links to the card page', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.title).toBe('Nimbus 2000')
    expect(json.url).toBe('https://revelio.cards/card/base-12')
  })

  it('uses the 300px thumbnail, not the full image', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.thumbnail?.url).toBe('https://img.revelio.cards/cards/thumb/base-12.3.webp')
  })

  it('omits the thumbnail when the card has no image', () => {
    const json = cardEmbed({ ...doc, imageLang: null, imageVersion: null }, opts).toJSON()
    expect(json.thumbnail).toBeUndefined()
  })

  it('tints the embed with the lesson colour', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.color).toBe(0xe2ae37)
  })

  it('renders localized attribute labels', () => {
    const en = cardEmbed(doc, opts).toJSON()
    expect(en.fields?.find((f) => f.name === 'Lesson')?.value).toBe('Quidditch')
    const de = cardEmbed(doc, { ...opts, locale: 'de', setName: 'Basis-Set' }).toJSON()
    expect(de.fields?.find((f) => f.name === 'Typ')?.value).toBe('Gegenstand')
  })

  it('puts the set name and card number in the footer', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.footer?.text).toBe('Base Set · #12')
  })

  it('omits a field the card has no value for', () => {
    const json = cardEmbed({ ...doc, cost: null, damage: null }, opts).toJSON()
    expect(json.fields?.some((f) => f.name === 'Cost')).toBe(false)
    expect(json.fields?.some((f) => f.name === 'Damage per turn')).toBe(false)
  })

  it('renders rulings when present', () => {
    const json = cardEmbed(doc, {
      ...opts,
      rulings: [{ date: '2001-11-01', source: 'WotC', text: 'It stacks.' }],
    }).toJSON()
    expect(json.fields?.find((f) => f.name === 'Rulings')?.value).toContain('It stacks.')
  })

  it('keeps the description inside Discord\'s 4096 character limit', () => {
    const long = 'x'.repeat(5000)
    const json = cardEmbed({ ...doc, text: long }, opts).toJSON()
    expect((json.description ?? '').length).toBeLessThanOrEqual(4096)
  })

  it('keeps every field value inside Discord\'s 1024 character limit', () => {
    const rulings = Array.from({ length: 30 }, (_, i) => ({
      date: null, source: null, text: 'y'.repeat(200) + i,
    }))
    const json = cardEmbed(doc, { ...opts, rulings }).toJSON()
    for (const field of json.fields ?? []) {
      expect(field.value.length).toBeLessThanOrEqual(1024)
    }
  })
})
```

The two length tests are the ones that matter operationally: Discord rejects the whole
interaction response if an embed exceeds its limits, so a wordy card would otherwise take
the command down with a 400 rather than degrade.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the embed builder**

`app/bot/src/discord/embeds/card-embed.ts`:

```ts
import { EmbedBuilder } from 'discord.js'
import type { SearchDocument } from '@revelio/search'
import { attrLabel, imageUrl, thumbKey, LESSONS } from '@revelio/core'
import type { CardRuling } from '../../data/cards'
import { t } from '../../i18n/t'
import { cardUrl } from '../../links'

// Discord rejects the entire response if an embed breaks a limit, so clamp
// rather than risk a 400 on a wordy card.
const DESCRIPTION_LIMIT = 4096
const FIELD_LIMIT = 1024
const FALLBACK_COLOR = 0x2b2d31

function clamp(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

export type CardEmbedOptions = {
  locale: string
  setName: string
  imageBase: string
  siteBase: string
  rulings: CardRuling[]
}

export function cardEmbed(doc: SearchDocument, opts: CardEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const embed = new EmbedBuilder()
    .setTitle(doc.name)
    .setURL(cardUrl(opts.siteBase, doc.id, locale))
    .setColor(lessonColor(doc.lesson))
    .setFooter({ text: t(locale, 'card.footer', { setName: opts.setName, number: doc.number }) })

  const body = [doc.text, doc.flavorText ? `*${doc.flavorText}*` : null]
    .filter(Boolean)
    .join('\n\n')
  if (body) embed.setDescription(clamp(body, DESCRIPTION_LIMIT))

  if (doc.imageLang && doc.imageVersion != null) {
    const key = thumbKey(doc.id, doc.imageVersion, doc.imageLang, doc.defaultLanguage)
    embed.setThumbnail(imageUrl(opts.imageBase, key))
  }

  // Sub-types are not curated in attributes.ts (they self-extend from card data),
  // so they are appended raw after the localized types.
  const typeLabel = [
    ...doc.types.map((code) => attrLabel('types', code, locale)),
    ...doc.subTypes,
  ].join(', ')
  if (typeLabel) {
    embed.addFields({ name: t(locale, 'card.field.type'), value: typeLabel, inline: true })
  }
  if (doc.lesson) {
    embed.addFields({
      name: t(locale, 'card.field.lesson'),
      value: attrLabel('lessons', doc.lesson, locale),
      inline: true,
    })
  }
  if (doc.cost != null) {
    embed.addFields({ name: t(locale, 'card.field.cost'), value: String(doc.cost), inline: true })
  }
  if (doc.damage != null) {
    embed.addFields({ name: t(locale, 'card.field.damage'), value: String(doc.damage), inline: true })
  }
  if (doc.rarity) {
    embed.addFields({
      name: t(locale, 'card.field.rarity'),
      value: attrLabel('rarities', doc.rarity, locale),
      inline: true,
    })
  }
  if (doc.legality) {
    embed.addFields({
      name: t(locale, 'card.field.legality'),
      value: attrLabel('legalities', doc.legality, locale),
      inline: true,
    })
  }
  if (opts.rulings.length) {
    const value = opts.rulings
      .map((r) => (r.date ? `- ${r.date}: ${r.text}` : `- ${r.text}`))
      .join('\n')
    embed.addFields({ name: t(locale, 'card.field.rulings'), value: clamp(value, FIELD_LIMIT) })
  }

  return embed
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): render a card as a Discord embed"
```

---

### Task 5: The `/card` and `/search` commands

**Files:**
- Create: `app/bot/src/discord/embeds/search-embed.ts`, `app/bot/src/discord/commands/card.ts`, `app/bot/src/discord/commands/search.ts`, `app/bot/src/discord/commands/index.ts`, `app/bot/src/clients.ts`
- Test: `app/bot/test/search-embed.test.ts`, `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2, 3 and 4.
- Produces:
  - `type Deps = { meili: MeiliSearch; db: DB; sets: SetNames; env: BotEnv }`
  - `function createDeps(env: BotEnv): { deps: Deps; close(): Promise<void> }`
  - `type BotCommand = { data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder; execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void> }`
  - `const COMMANDS: Map<string, BotCommand>`
  - `function searchEmbed(page: CardPage, opts: { locale: string; query: string; siteBase: string }): EmbedBuilder`

  Task 6 consumes `COMMANDS`, `createDeps` and `Deps`.

- [ ] **Step 1: Write the failing tests**

`app/bot/test/search-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SearchDocument } from '@revelio/search'
import { searchEmbed } from '../src/discord/embeds/search-embed'

function hit(n: number): SearchDocument {
  return {
    id: `base-${n}`, setCode: 'base', number: String(n), numberSort: `0:${n}`,
    name: `Card ${n}`, text: null, flavorText: null, types: [], subTypes: [],
    lesson: null, rarity: null, finishes: [], legality: null, cost: null,
    damage: null, isOfficial: true, imageLang: null, imageVersion: null,
    artCropVersion: null, defaultLanguage: 'en', orientation: null,
  }
}

const opts = { locale: 'en', query: 'card', siteBase: 'https://revelio.cards' }

describe('searchEmbed', () => {
  it('lists one line per hit', () => {
    const page = { hits: [hit(1), hit(2)], total: 2, page: 1, pageSize: 10, pages: 1 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.description).toContain('**Card 1** · base #1')
    expect(json.description).toContain('**Card 2** · base #2')
  })

  it('reports the total and links to the full search', () => {
    const page = { hits: [hit(1)], total: 42, page: 1, pageSize: 10, pages: 5 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.title).toBe('42 cards')
    expect(json.url).toBe('https://revelio.cards/search?q=card')
  })

  it('shows the page position in the footer', () => {
    const page = { hits: [hit(1)], total: 42, page: 3, pageSize: 10, pages: 5 }
    const json = searchEmbed(page, opts).toJSON()
    expect(json.footer?.text).toContain('Page 3 of 5')
  })

  it('keeps the description inside the 4096 character limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...hit(i), name: 'z'.repeat(600) }))
    const page = { hits: many, total: 10, page: 1, pageSize: 10, pages: 1 }
    const json = searchEmbed(page, opts).toJSON()
    expect((json.description ?? '').length).toBeLessThanOrEqual(4096)
  })
})
```

`app/bot/test/commands.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { COMMANDS } from '../src/discord/commands/index'

function fakeInteraction(options: Record<string, string | number | null>, locale = 'en') {
  return {
    locale,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: (name: string) => (options[name] as string) ?? null,
      getInteger: (name: string) => (options[name] as number) ?? null,
    },
  }
}

function fakeDeps(hits: unknown[], total: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: total })
  return {
    meili: { index: () => ({ search }) },
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}

const doc = {
  id: 'base-12', setCode: 'base', number: '12', numberSort: '0:12', name: 'Nimbus 2000',
  text: null, flavorText: null, types: [], subTypes: [], lesson: null, rarity: null,
  finishes: [], legality: null, cost: null, damage: null, isOfficial: true,
  imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en',
  orientation: null,
}

describe('/card', () => {
  it('defers, then replies with an embed for the best hit', async () => {
    const interaction = fakeInteraction({ name: 'nimbus' })
    const deps = fakeDeps([doc], 1)
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)

    expect(interaction.deferReply).toHaveBeenCalled()
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Nimbus 2000')
  })

  it('replies with a localized miss when nothing matches', async () => {
    const interaction = fakeInteraction({ name: 'zzz' }, 'de')
    await COMMANDS.get('card')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Keine Karte passt zu "zzz".' }),
    )
  })
})

describe('/search', () => {
  it('replies with a result page', async () => {
    const interaction = fakeInteraction({ query: 'nimbus', page: 1 })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([doc], 1) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().description).toContain('Nimbus 2000')
  })

  it('tells the user when the requested page is past the end', async () => {
    const interaction = fakeInteraction({ query: 'nimbus', page: 9 })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([doc], 1) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('1 page') }),
    )
  })

  it('replies with a localized empty state', async () => {
    const interaction = fakeInteraction({ query: 'zzz' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Nothing matched that search.' }),
    )
  })
})

describe('the command registry', () => {
  it('keys each command by its own builder name', () => {
    for (const [key, command] of COMMANDS) {
      expect(command.data.name).toBe(key)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL on the unresolved imports.

- [ ] **Step 3: Write the search embed**

`app/bot/src/discord/embeds/search-embed.ts`:

```ts
import { EmbedBuilder } from 'discord.js'
import type { CardPage } from '../../data/cards'
import { t } from '../../i18n/t'
import { searchUrl } from '../../links'

const DESCRIPTION_LIMIT = 4096
const BRAND_GOLD = 0xd4a83a

export type SearchEmbedOptions = { locale: string; query: string; siteBase: string }

export function searchEmbed(page: CardPage, opts: SearchEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const lines: string[] = []
  for (const hit of page.hits) {
    const line = t(locale, 'search.line', {
      name: hit.name, setCode: hit.setCode, number: hit.number,
    })
    // Stop before the limit rather than truncating mid-line: a half-rendered
    // card name reads as a bug.
    if (lines.join('\n').length + line.length + 1 > DESCRIPTION_LIMIT) break
    lines.push(line)
  }
  return new EmbedBuilder()
    .setTitle(t(locale, 'search.title', { total: page.total }))
    .setURL(searchUrl(opts.siteBase, opts.query, locale))
    .setColor(BRAND_GOLD)
    .setDescription(lines.join('\n'))
    .setFooter({ text: t(locale, 'search.footer', { page: page.page, pages: page.pages }) })
}
```

- [ ] **Step 4: Write `clients.ts`**

`app/bot/src/clients.ts`:

```ts
import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient } from '@revelio/search'
import { createClient, type DB } from '@revelio/db'
import { createSetNames, type SetNames } from './data/sets'
import type { BotEnv } from './env'

export type Deps = { meili: MeiliSearch; db: DB; sets: SetNames; env: BotEnv }

// MEILI_SEARCH_KEY is the same read-only key the web app uses. The bot never
// writes, so it never sees MEILI_WRITE_KEY or the master key.
export function createDeps(env: BotEnv): { deps: Deps; close(): Promise<void> } {
  const meili = createMeiliClient(env.MEILI_HOST, env.MEILI_SEARCH_KEY)
  const { db, sql } = createClient(env.DATABASE_URL)
  return {
    deps: { meili, db, sets: createSetNames(db), env },
    close: async () => { await sql.end() },
  }
}
```

- [ ] **Step 5: Write `/card`**

`app/bot/src/discord/commands/card.ts`:

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { findOneCard, getCardRulings } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { cardEmbed } from '../embeds/card-embed'

export const data = new SlashCommandBuilder()
  .setName('card')
  .setDescription(t('en', 'command.card.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.card.description') })
  .addStringOption((o) =>
    o.setName('name')
      .setDescription(t('en', 'command.card.option.name'))
      .setDescriptionLocalizations({ de: t('de', 'command.card.option.name') })
      .setRequired(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const name = interaction.options.getString('name') ?? ''

  const doc = await findOneCard(deps.meili, { query: name, locale })
  if (!doc) {
    await interaction.editReply({ content: t(locale, 'card.notFound', { name }) })
    return
  }

  const [setName, rulings] = await Promise.all([
    deps.sets.name(doc.setCode, locale),
    getCardRulings(deps.db, doc.id, locale),
  ])

  await interaction.editReply({
    embeds: [cardEmbed(doc, {
      locale,
      setName,
      rulings,
      imageBase: deps.env.IMAGE_BASE_URL,
      siteBase: deps.env.SITE_BASE_URL,
    })],
  })
}
```

- [ ] **Step 6: Write `/search`**

`app/bot/src/discord/commands/search.ts`:

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import type { CardFilters } from '@revelio/search'
import type { Deps } from '../../clients'
import { findCards } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { searchEmbed } from '../embeds/search-embed'

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription(t('en', 'command.search.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.search.description') })
  .addStringOption((o) =>
    o.setName('query')
      .setDescription(t('en', 'command.search.option.query'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.query') })
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('lesson')
      .setDescription(t('en', 'command.search.option.lesson'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.lesson') })
      .addChoices(...LESSONS.map((l) => ({
        name: attrLabel('lessons', l.code, 'en'),
        name_localizations: { de: attrLabel('lessons', l.code, 'de') },
        value: l.code,
      }))),
  )
  .addStringOption((o) =>
    o.setName('type')
      .setDescription(t('en', 'command.search.option.type'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.type') })
      .addChoices(...TYPES.map((ty) => ({
        name: attrLabel('types', ty.code, 'en'),
        name_localizations: { de: attrLabel('types', ty.code, 'de') },
        value: ty.code,
      }))),
  )
  .addIntegerOption((o) =>
    o.setName('page')
      .setDescription(t('en', 'command.search.option.page'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.page') })
      .setMinValue(1),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const query = interaction.options.getString('query') ?? ''
  const lesson = interaction.options.getString('lesson')
  const type = interaction.options.getString('type')
  const requestedPage = interaction.options.getInteger('page') ?? 1

  const filters: CardFilters = {}
  if (lesson) filters.lesson = [lesson]
  if (type) filters.types = [type]

  const page = await findCards(deps.meili, { query, locale, filters, page: requestedPage })

  if (page.total === 0) {
    await interaction.editReply({ content: t(locale, 'search.noResults') })
    return
  }
  if (page.page > page.pages) {
    await interaction.editReply({
      content: t(locale, 'search.pageOutOfRange', { pages: page.pages }),
    })
    return
  }

  await interaction.editReply({
    embeds: [searchEmbed(page, { locale, query, siteBase: deps.env.SITE_BASE_URL })],
  })
}
```

Note the `search.pageOutOfRange` copy must render "1 page(s)" for the test's
`stringContaining('1 page')` to hold. It does: `'That page does not exist. This search has
{pages} page(s).'` with `pages: 1`.

- [ ] **Step 7: Write the registry**

`app/bot/src/discord/commands/index.ts`:

```ts
import type { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { Deps } from '../../clients'
import * as card from './card'
import * as search from './search'

export type BotCommand = {
  data: SlashCommandOptionsOnlyBuilder
  execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void>
}

// A registry, not a barrel: main.ts routes an interaction by name through this
// map, and register.ts publishes every entry's builder to Discord.
export const COMMANDS: Map<string, BotCommand> = new Map(
  [card, search].map((c) => [c.data.name, c as BotCommand]),
)
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add the /card and /search commands"
```

---

### Task 6: Entrypoint and command registration

**Files:**
- Create: `app/bot/src/discord/register.ts`, `app/bot/src/main.ts`
- Test: `app/bot/test/catalog-parity.test.ts`

**Interfaces:**
- Consumes: `COMMANDS`, `createDeps`, `parseEnv`.
- Produces: `function registerCommands(env: BotEnv): Promise<number>` - returns the number of commands published.

- [ ] **Step 1: Write the catalog parity test**

`app/bot/test/catalog-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import en from '../src/i18n/en.json'
import de from '../src/i18n/de.json'

describe('bot message catalogs', () => {
  it('define the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort())
  })

  it('leave no value empty', () => {
    for (const [key, value] of Object.entries({ ...en, ...de })) {
      expect(value, key).not.toBe('')
    }
  })
})
```

This mirrors `web/src/lib/__tests__/message-key-parity.test.ts` and is what stops a later
phase from adding an English string and forgetting the German one.

- [ ] **Step 2: Run it to verify it passes**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot -- catalog-parity
```

Expected: PASS (the Task 2 catalogs are already in parity). If it fails, fix the catalogs
before continuing - do not weaken the test.

- [ ] **Step 3: Write the registrar**

`app/bot/src/discord/register.ts`:

```ts
import { REST, Routes } from 'discord.js'
import { parseEnv, type BotEnv } from '../env'
import { COMMANDS } from './commands/index'

// Guild-scoped registration is instant, which is what you want while iterating.
// Global registration can take up to an hour to propagate, so it is the
// production path only.
export async function registerCommands(env: BotEnv): Promise<number> {
  const body = [...COMMANDS.values()].map((c) => c.data.toJSON())
  const rest = new REST().setToken(env.DISCORD_TOKEN)
  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID)
  await rest.put(route, { body })
  return body.length
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
  const env = parseEnv()
  registerCommands(env)
    .then((n) => {
      const scope = env.DISCORD_GUILD_ID ? `guild ${env.DISCORD_GUILD_ID}` : 'globally'
      console.log(`registered ${n} commands ${scope}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('command registration failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Write the entrypoint**

`app/bot/src/main.ts`:

```ts
import { Client, GatewayIntentBits, MessageFlags, type Interaction } from 'discord.js'
import { parseEnv } from './env'
import { createDeps, type Deps } from './clients'
import { COMMANDS } from './discord/commands/index'
import { registerCommands } from './discord/register'
import { toRevelioLocale } from './i18n/locale'
import { t } from './i18n/t'

async function handle(interaction: Interaction, deps: Deps): Promise<void> {
  if (!interaction.isChatInputCommand()) return
  const command = COMMANDS.get(interaction.commandName)
  if (!command) return
  try {
    await command.execute(interaction, deps)
  } catch (err) {
    // Log the command and interaction id, never the token or the raw options.
    console.error(`command ${interaction.commandName} failed (${interaction.id}):`, err)
    const content = t(toRevelioLocale(interaction.locale), 'error.generic')
    // The command may or may not have deferred before throwing.
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {})
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    }
  }
}

async function main(): Promise<void> {
  const env = parseEnv()
  const { deps, close } = createDeps(env)

  // Guilds only. Reading message content or member lists would need privileged
  // intents and Discord verification; slash commands need neither.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', (c) => console.log(`logged in as ${c.user.tag}`))
  client.on('interactionCreate', (i) => { void handle(i, deps) })

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`)
    await client.destroy()
    await close()
    process.exit(0)
  }
  process.on('SIGTERM', () => { void shutdown('SIGTERM') })
  process.on('SIGINT', () => { void shutdown('SIGINT') })

  const n = await registerCommands(env)
  console.log(`registered ${n} commands`)
  await client.login(env.DISCORD_TOKEN)
}

main().catch((err) => {
  console.error('bot failed to start:', err)
  process.exit(1)
})
```

Registering on every boot is deliberate: Discord's `PUT` is a full replace, so the
published set always matches the deployed code, and there is no separate release step to
forget.

- [ ] **Step 5: Run the suite and typecheck**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck
```

Expected: PASS across all workspaces.

- [ ] **Step 6: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add the gateway entrypoint and command registration"
```

---

### Task 7: Container, compose service and publish pipeline

**Files:**
- Create: `app/bot/Dockerfile`
- Modify: `app/docker-compose.yml`, `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: the working bot from Task 6.
- Produces: a `ghcr.io/<owner>/revelio-bot` image built on every push to `main` that touches the bot or a shared workspace.

- [ ] **Step 1: Write the Dockerfile**

`app/bot/Dockerfile`, cloned from `app/ingest/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (tsx is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
COPY bot/package.json ./bot/package.json
RUN npm ci

# --- runtime: long-running gateway process, no mounted data ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY bot ./bot

CMD ["npx", "tsx", "bot/src/main.ts"]
```

Every workspace `package.json` is copied in the deps stage because `npm ci` validates the
whole workspace tree against the lockfile; only the workspaces the bot actually imports
are copied into the runtime stage.

- [ ] **Step 2: Add the compose service**

In `app/docker-compose.yml`, add after the `ingest` service:

```yaml
  bot:
    image: revelio-bot:local
    build:
      context: .
      dockerfile: bot/Dockerfile
    # Not started by a bare `docker compose up`: it needs a real Discord token,
    # which most local work does not have. Start it with
    # `docker compose --profile bot up bot`.
    profiles: ["bot"]
    depends_on:
      postgres:
        condition: service_healthy
      meilisearch:
        condition: service_healthy
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      DISCORD_GUILD_ID: ${DISCORD_GUILD_ID}
      DATABASE_URL: postgres://revelio:revelio@postgres:5432/revelio
      MEILI_HOST: http://meilisearch:7700
      MEILI_SEARCH_KEY: masterKey
      IMAGE_BASE_URL: http://localhost:9000/images
      SITE_BASE_URL: http://localhost:3000
    restart: unless-stopped
```

`IMAGE_BASE_URL` points at the host-published MinIO port, not the compose hostname:
Discord fetches the thumbnail from the public internet, so in a real deployment this must
be the same public bucket URL the web app uses. Locally the images simply will not render,
which is expected.

- [ ] **Step 3: Extend the publish workflow**

In `.github/workflows/publish.yml`:

Add `bot` to the `changes` job outputs:

```yaml
    outputs:
      web: ${{ steps.filter.outputs.web }}
      ingest: ${{ steps.filter.outputs.ingest }}
      bot: ${{ steps.filter.outputs.bot }}
```

Add a `bot` entry to the paths filter, beside `web` and `ingest`:

```yaml
            bot:
              - *shared
              - 'app/bot/**'
```

Add a `build-bot` job, copying `build-ingest` and changing the image name, Dockerfile and
cache scope:

```yaml
  build-bot:
    needs: changes
    if: needs.changes.outputs.bot == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/revelio-bot
          tags: |
            type=raw,value=latest
            type=sha,prefix=sha-,format=short

      - uses: docker/build-push-action@v6
        with:
          context: app
          file: app/bot/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=bot
          cache-to: type=gha,mode=max,scope=bot

      # Same redeploy hook build-web uses. A push that changes both web and bot
      # fires it twice; the redeploy is idempotent, so that is harmless.
      - name: Trigger redeploy webhook
        env:
          DEPLOY_WEBHOOK_URL: ${{ secrets.DEPLOY_WEBHOOK_URL }}
        run: |
          if [ -z "$DEPLOY_WEBHOOK_URL" ]; then
            echo "::notice::DEPLOY_WEBHOOK_URL not set; skipping redeploy webhook."
            exit 0
          fi
          curl -fsS -X POST --max-time 30 --retry 3 --retry-all-errors "$DEPLOY_WEBHOOK_URL"
```

`.github/workflows/ci.yml` needs no change: `npm run typecheck` and `npm test` are already
`--workspaces`, so the bot joins both automatically.

- [ ] **Step 4: Build the image locally**

```bash
cd app && docker build -f bot/Dockerfile -t revelio-bot:local .
```

Expected: the build succeeds. A failure in the deps stage usually means a workspace
`package.json` is missing from the COPY list.

- [ ] **Step 5: Commit**

```bash
git add app/bot/Dockerfile app/docker-compose.yml .github/workflows/publish.yml
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(bot): containerize the bot and publish it to GHCR"
```

---

### Task 8: End-to-end acceptance in a test guild

**Files:** none. Verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Bring up the local stack and seed it**

```bash
cd app && docker compose up -d postgres meilisearch minio
docker compose run --rm migrate
docker compose run --rm ingest
```

Expected: `seed complete: N sets, M cards imported`.

- [ ] **Step 2: Run the bot against the test guild**

Put `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` in `app/.env`, then:

```bash
cd app && DATABASE_URL=postgres://revelio:revelio@localhost:5432/revelio \
  MEILI_HOST=http://localhost:7700 MEILI_SEARCH_KEY=masterKey \
  IMAGE_BASE_URL=http://localhost:9000/images SITE_BASE_URL=http://localhost:3000 \
  /usr/local/bin/npm run start -w @revelio/bot
```

Expected log lines: `registered 2 commands`, then `logged in as <bot>#0000`.

- [ ] **Step 3: Acceptance checklist**

In the test guild, confirm each:

- [ ] `/card name:Nimbus` returns an embed with the card name as a clickable title, the rules text, a lesson-tinted left border, and the set name plus number in the footer.
- [ ] The same command with the Discord client set to German returns German field labels (Typ, Lektion, Seltenheit) and, for a card with a German localization, German rules text.
- [ ] `/card` on a card that has **no** German localization falls back to the English text rather than rendering an empty description.
- [ ] `/card name:zzzzz` returns the localized "no card matched" line, not an error.
- [ ] `/card` on a card with a ruling shows the Rulings field.
- [ ] `/search query:broom` returns a numbered-looking list with a total in the title and "Page 1 of N" in the footer, and the title links to `/search?q=broom`.
- [ ] `/search query:broom lesson:Quidditch` returns a strictly smaller total than without the filter.
- [ ] `/search query:broom page:99` returns the out-of-range message rather than an empty embed.
- [ ] Every reply arrives in under three seconds.
- [ ] The bot's console shows no token, in any log line, at any point.

- [ ] **Step 4: Confirm CI is green, then open the PR**

```bash
cd app && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint -w web
git push -u origin feat/discord-bot-foundation
/opt/homebrew/bin/gh pr create --title "feat(bot): Discord bot with /card and /search" \
  --body "Adds the @revelio/bot workspace: a discord.js gateway bot that imports @revelio/search, @revelio/db and @revelio/core directly, with no HTTP API in between (see docs/superpowers/specs/2026-09-09-discord-bot-design.md). Ships /card and /search, plus the Dockerfile, compose service and GHCR publish job.

Deployment note: the VPS needs DISCORD_TOKEN, DISCORD_CLIENT_ID, IMAGE_BASE_URL and SITE_BASE_URL set, and DISCORD_GUILD_ID left unset so commands register globally."
```

---

## Self-Review Notes

- **Spec coverage:** the spec's "Two clients, one process", "Locale", "Images", "Interaction
  flow" and "Errors" sections are covered by Tasks 3-6; the workspace layout by Task 1;
  deployment by Task 7. The spec's account linking and deck sections belong to later plans.
- **Type consistency:** `Deps` is defined once in `src/clients.ts` and consumed by both
  commands and `main.ts`. `CardPage` is defined in `src/data/cards.ts` and consumed by
  `search-embed.ts`. `BotCommand.data` is typed `SlashCommandOptionsOnlyBuilder` because
  both commands add options; a future sub-command group would widen it.
- **Deliberately deferred:** card-name autocomplete (Phase 2 plan), a `set` filter option
  on `/search` (Phase 2, where autocomplete makes free-text set entry workable), deck
  lookup (Phase 3), account linking (Phase 4).
- **Known limitation:** the bot reads whatever the Meilisearch index holds. Card edits made
  in the web editor re-index immediately, but a newly added set needs an ingest run before
  the bot can see it - the same constraint the web app has.

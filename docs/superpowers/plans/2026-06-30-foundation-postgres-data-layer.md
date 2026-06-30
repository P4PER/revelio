# Foundation + Postgres Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `app/` workspace and load the built card dataset (`card-data/dist/`) into PostgreSQL via an idempotent ingest job, runnable locally with `docker compose up`.

**Architecture:** An npm-workspaces root (`app/`) with two packages: `@revelio/db` (Drizzle schema + migrations + client) and `@revelio/ingest` (a one-shot Node/TypeScript loader). The loader reads `dist/sets.json` + `dist/cards.json` from `DATA_DIR`, runs migrations, then upserts `sets`, `cards`, and `card_localizations`. Integration tests run against a throwaway Postgres via Testcontainers.

**Tech Stack:** Node 20, TypeScript (ESM), npm workspaces, Drizzle ORM + drizzle-kit, `postgres` (postgres.js) driver, Vitest, `@testcontainers/postgresql`, Docker Compose.

## Global Constraints

- Node **20+**, TypeScript, ESM (`"type": "module"`) everywhere.
- Config is **env-driven only — no hardcoded hosts**. This plan uses `DATABASE_URL` and `DATA_DIR` (default `/data`).
- Ingest is **idempotent**: every load uses upsert (`INSERT ... ON CONFLICT DO UPDATE`); re-running changes nothing.
- All prose, comments, identifiers, and commit messages in **English**.
- Commit messages follow **Conventional Commits** (`feat:`, `chore:`, `test:`, `docs:`).
- Postgres is the serving source-of-truth. **No `tsvector` column** — full-text search is Meilisearch's job (later plan).
- `number` is a **string** (`"3a"`), not an integer. `cost`, `health`, `damagePerTurn`, `draftValue` are nullable integers.
- New code lives under `app/`. `card-data/` and `logos/` are untouched.

---

## File Structure

```
app/
  package.json                     # workspaces root: ["db","ingest"]
  tsconfig.base.json
  .gitignore
  .env.example
  docker-compose.yml               # base: postgres service + volume
  docker-compose.override.yml      # dev: ingest built from source, bind-mounts ../card-data
  db/
    package.json                   # @revelio/db
    tsconfig.json
    drizzle.config.ts
    src/
      schema.ts                    # sets, cards, card_localizations
      client.ts                    # createClient(databaseUrl)
      migrate.ts                   # migrationsDir export + runMigrations()
      index.ts                     # re-exports
    drizzle/                       # GENERATED migrations (committed)
  ingest/
    package.json                   # @revelio/ingest
    tsconfig.json
    Dockerfile
    src/
      types.ts                     # TS types for dist JSON
      load-dist.ts                 # read+parse dist files from DATA_DIR
      load-sets.ts                 # upsert sets
      load-cards.ts                # upsert cards + localizations
      main.ts                      # entrypoint: migrate + load
    test/
      fixtures/dist/sets.json
      fixtures/dist/cards.json
      helpers.ts                   # Testcontainers Postgres + migrated client
      load-dist.test.ts
      load-sets.test.ts
      load-cards.test.ts
      main.test.ts
```

---

### Task 1: Workspace + `@revelio/db` schema and initial migration

**Files:**
- Create: `app/package.json`, `app/tsconfig.base.json`, `app/.gitignore`, `app/.env.example`
- Create: `app/db/package.json`, `app/db/tsconfig.json`, `app/db/drizzle.config.ts`
- Create: `app/db/src/schema.ts`, `app/db/src/client.ts`, `app/db/src/migrate.ts`, `app/db/src/index.ts`
- Generated: `app/db/drizzle/*` (via drizzle-kit)

**Interfaces:**
- Produces:
  - `schema.sets`, `schema.cards`, `schema.cardLocalizations` (Drizzle pgTable objects)
  - `createClient(databaseUrl: string): { db: DB, sql: Sql }` from `@revelio/db`
  - `migrationsDir: string` and `runMigrations(db: DB): Promise<void>` from `@revelio/db`
  - `type DB` (Drizzle database type) from `@revelio/db`

- [ ] **Step 1: Create the workspace root files**

`app/package.json`:
```json
{
  "name": "revelio-app",
  "private": true,
  "type": "module",
  "workspaces": ["db", "ingest"],
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "db:generate": "npm run generate -w @revelio/db"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@testcontainers/postgresql": "^10.13.0",
    "drizzle-kit": "^0.30.0"
  }
}
```

`app/tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

`app/.gitignore`:
```
node_modules/
dist/
.env
```

`app/.env.example`:
```
# Postgres connection used by ingest and (later) web
DATABASE_URL=postgres://revelio:revelio@postgres:5432/revelio
# Directory the ingest job reads the built dataset from
DATA_DIR=/data
```

- [ ] **Step 2: Create the `@revelio/db` package files**

`app/db/package.json`:
```json
{
  "name": "@revelio/db",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0"
  }
}
```

`app/db/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`app/db/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
```

- [ ] **Step 3: Write the schema**

`app/db/src/schema.ts`:
```ts
import {
  pgTable, text, integer, boolean, jsonb, primaryKey, index,
} from 'drizzle-orm/pg-core'

export const sets = pgTable('sets', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  releaseDate: text('release_date'),
  isOfficial: boolean('is_official').notNull().default(false),
  cardCount: integer('card_count').notNull().default(0),
  symbol: text('symbol'),
})

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  setCode: text('set_code').notNull().references(() => sets.code),
  number: text('number').notNull(),
  name: text('name').notNull(),
  types: text('types').array().notNull().default([]),
  subTypes: text('sub_types').array().notNull().default([]),
  lesson: text('lesson'),
  cost: integer('cost'),
  provides: jsonb('provides'),
  rarity: text('rarity'),
  finish: text('finish'),
  artist: text('artist').array().notNull().default([]),
  health: integer('health'),
  damagePerTurn: integer('damage_per_turn'),
  orientation: text('orientation'),
  legality: text('legality'),
  draftValue: integer('draft_value'),
  rulings: jsonb('rulings'),
  defaultLanguage: text('default_language').notNull(),
  languages: text('languages').array().notNull().default([]),
}, (t) => ({
  setCodeIdx: index('cards_set_code_idx').on(t.setCode),
}))

export const cardLocalizations = pgTable('card_localizations', {
  cardId: text('card_id').notNull().references(() => cards.id),
  lang: text('lang').notNull(),
  name: text('name').notNull(),
  status: text('status'),
  source: text('source'),
  text: text('text'),
  flavorText: text('flavor_text'),
  adventure: jsonb('adventure'),
  match: jsonb('match'),
  imageFile: text('image_file'),
  imageUrl: text('image_url'),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.lang] }),
}))
```

- [ ] **Step 4: Write the client and migrate helpers**

`app/db/src/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

export type DB = ReturnType<typeof createClient>['db']
```

`app/db/src/migrate.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { DB } from './client.js'

const here = dirname(fileURLToPath(import.meta.url))
export const migrationsDir = resolve(here, '../drizzle')

export async function runMigrations(db: DB): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsDir })
}
```

`app/db/src/index.ts`:
```ts
export * as schema from './schema.js'
export { sets, cards, cardLocalizations } from './schema.js'
export { createClient } from './client.js'
export type { DB } from './client.js'
export { migrationsDir, runMigrations } from './migrate.js'
```

- [ ] **Step 5: Install dependencies and generate the migration**

Run:
```bash
cd app && npm install
npm run db:generate
```
Expected: drizzle-kit writes `app/db/drizzle/0000_*.sql` (containing `CREATE TABLE "sets"`, `"cards"`, `"card_localizations"`) plus `app/db/drizzle/meta/`.

- [ ] **Step 6: Verify the migration SQL contains the three tables**

Run:
```bash
grep -l 'CREATE TABLE "card_localizations"' app/db/drizzle/0000_*.sql
```
Expected: prints the migration filename (non-empty). If empty, the schema was not picked up — recheck `drizzle.config.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/tsconfig.base.json app/.gitignore app/.env.example app/db
git commit -m "feat: add app workspace and Postgres schema with initial migration"
```

---

### Task 2: Dist file types and parser (`load-dist`)

**Files:**
- Create: `app/ingest/package.json`, `app/ingest/tsconfig.json`
- Create: `app/ingest/src/types.ts`, `app/ingest/src/load-dist.ts`
- Create: `app/ingest/test/fixtures/dist/sets.json`, `app/ingest/test/fixtures/dist/cards.json`
- Test: `app/ingest/test/load-dist.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type DistSet = { code: string; name: string; releaseDate: string | null; isOfficial: boolean; cardCount: number; symbol: string | null }`
  - `type DistLocalization = { name: string; status: string | null; source: string | null; text: string | null; flavorText: string | null; adventure: unknown | null; match: unknown | null; image: { file: string | null; url: string | null } | null }`
  - `type DistCard = { id: string; name: string; setCode: string; number: string; types: string[]; subTypes: string[]; lesson: string | null; cost: number | null; provides: unknown | null; rarity: string | null; finish: string | null; artist: string[]; stats: { health: number | null; damagePerTurn: number | null } | null; orientation: string | null; legality: string | null; draftValue: number | null; rulings: unknown[]; defaultLanguage: string; languages: string[]; localizations: Record<string, DistLocalization> }`
  - `loadDist(dataDir: string): Promise<{ sets: DistSet[]; cards: DistCard[] }>`

- [ ] **Step 1: Create the ingest package scaffold**

`app/ingest/package.json`:
```json
{
  "name": "@revelio/ingest",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@revelio/db": "*",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0"
  }
}
```

`app/ingest/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 2: Create the test fixtures**

`app/ingest/test/fixtures/dist/sets.json`:
```json
{
  "BS": { "code": "BS", "name": "Base", "releaseDate": "08-2001", "isOfficial": true, "cardCount": 2, "symbol": "http://example/bs.png" },
  "QC": { "code": "QC", "name": "Quidditch Cup", "releaseDate": "11-2001", "isOfficial": true, "cardCount": 1, "symbol": null }
}
```

`app/ingest/test/fixtures/dist/cards.json`:
```json
[
  {
    "id": "bs-1-dean-thomas", "name": "Dean Thomas", "setCode": "BS", "number": "1",
    "types": ["Character"], "subTypes": ["Wizard", "Gryffindor"], "lesson": null, "cost": null,
    "provides": null, "rarity": "Rare", "finish": "holo", "artist": ["Jon Foster"],
    "stats": null, "orientation": "horizontal", "legality": "unknown", "draftValue": null,
    "rulings": [], "defaultLanguage": "en", "languages": ["en", "de"],
    "localizations": {
      "en": { "name": "Dean Thomas", "status": "official", "source": "WotC", "text": "Draw 3 cards.", "flavorText": "Flavor.", "adventure": null, "match": null, "image": { "file": "DeanThomas.png", "url": null } },
      "de": { "name": "Dean Thomas", "status": "machine", "source": "Claude", "text": "Ziehe 3 Karten.", "flavorText": "Aroma.", "adventure": null, "match": null, "image": { "file": null, "url": null } }
    }
  },
  {
    "id": "bs-2-flobberworm", "name": "Flobberworm", "setCode": "BS", "number": "2",
    "types": ["Creature"], "subTypes": [], "lesson": null, "cost": 2,
    "provides": [{ "lesson": "Charms", "amount": 1 }], "rarity": "Common", "finish": "normal", "artist": ["Artist A"],
    "stats": { "health": 6, "damagePerTurn": null }, "orientation": "vertical", "legality": "legal", "draftValue": 3,
    "rulings": [{ "date": "2001-08-31", "source": "POJO", "ruling": "A ruling." }],
    "defaultLanguage": "en", "languages": ["en"],
    "localizations": {
      "en": { "name": "Flobberworm", "status": "official", "source": "WotC", "text": null, "flavorText": null, "adventure": null, "match": null, "image": { "file": "Flobberworm.png", "url": null } }
    }
  },
  {
    "id": "qc-1-the-snitch", "name": "The Snitch", "setCode": "QC", "number": "1",
    "types": ["Match"], "subTypes": [], "lesson": null, "cost": null,
    "provides": null, "rarity": "Uncommon", "finish": "normal", "artist": [],
    "stats": null, "orientation": "horizontal", "legality": "legal", "draftValue": null,
    "rulings": [], "defaultLanguage": "en", "languages": ["en"],
    "localizations": {
      "en": { "name": "The Snitch", "status": "official", "source": "WotC", "text": null, "flavorText": null, "adventure": null, "match": { "toWin": "Do 10 damage.", "prize": "Draw cards." }, "image": { "file": "Snitch.png", "url": null } }
    }
  }
]
```

- [ ] **Step 3: Write the failing test**

`app/ingest/test/load-dist.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadDist } from '../src/load-dist.js'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dist')

describe('loadDist', () => {
  it('parses sets keyed object into an array', async () => {
    const { sets } = await loadDist(fixtureDir)
    expect(sets).toHaveLength(2)
    expect(sets.find((s) => s.code === 'BS')?.name).toBe('Base')
  })

  it('parses the cards array with nested localizations', async () => {
    const { cards } = await loadDist(fixtureDir)
    expect(cards).toHaveLength(3)
    const dean = cards.find((c) => c.id === 'bs-1-dean-thomas')!
    expect(dean.localizations.de.text).toBe('Ziehe 3 Karten.')
    expect(dean.number).toBe('1')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd app && npm install && npx vitest run -w @revelio/ingest`
Expected: FAIL — `Cannot find module '../src/load-dist.js'`.

- [ ] **Step 5: Write the types and parser**

`app/ingest/src/types.ts`:
```ts
export type DistSet = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
}

export type DistLocalization = {
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  adventure: unknown | null
  match: unknown | null
  image: { file: string | null; url: string | null } | null
}

export type DistCard = {
  id: string
  name: string
  setCode: string
  number: string
  types: string[]
  subTypes: string[]
  lesson: string | null
  cost: number | null
  provides: unknown | null
  rarity: string | null
  finish: string | null
  artist: string[]
  stats: { health: number | null; damagePerTurn: number | null } | null
  orientation: string | null
  legality: string | null
  draftValue: number | null
  rulings: unknown[]
  defaultLanguage: string
  languages: string[]
  localizations: Record<string, DistLocalization>
}
```

`app/ingest/src/load-dist.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DistSet, DistCard } from './types.js'

export async function loadDist(
  dataDir: string,
): Promise<{ sets: DistSet[]; cards: DistCard[] }> {
  const setsRaw = JSON.parse(
    await readFile(resolve(dataDir, 'sets.json'), 'utf8'),
  ) as Record<string, DistSet>
  const cards = JSON.parse(
    await readFile(resolve(dataDir, 'cards.json'), 'utf8'),
  ) as DistCard[]
  return { sets: Object.values(setsRaw), cards }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd app && npx vitest run -w @revelio/ingest`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add app/ingest
git commit -m "feat: add dist dataset types and loader"
```

---

### Task 3: Test helper + upsert `sets`

**Files:**
- Create: `app/ingest/test/helpers.ts`
- Create: `app/ingest/src/load-sets.ts`
- Test: `app/ingest/test/load-sets.test.ts`

**Interfaces:**
- Consumes: `loadDist`, `DistSet`, `@revelio/db` (`createClient`, `runMigrations`, `sets`).
- Produces:
  - `loadSets(db: DB, sets: DistSet[]): Promise<void>`
  - test helper `withMigratedDb(): Promise<{ db, sql, container, stop() }>`

- [ ] **Step 1: Write the test helper**

`app/ingest/test/helpers.ts`:
```ts
import { PostgreSQLContainer } from '@testcontainers/postgresql'
import { createClient, runMigrations } from '@revelio/db'

export async function withMigratedDb() {
  const container = await new PostgreSQLContainer('postgres:16-alpine').start()
  const { db, sql } = createClient(container.getConnectionUri())
  await runMigrations(db)
  return {
    db,
    sql,
    async stop() {
      await sql.end()
      await container.stop()
    },
  }
}
```

- [ ] **Step 2: Write the failing test**

`app/ingest/test/load-sets.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets } from '@revelio/db'
import { loadSets } from '../src/load-sets.js'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => { ctx = await withMigratedDb() }, 120_000)
afterAll(async () => { await ctx.stop() })

const sample = [
  { code: 'BS', name: 'Base', releaseDate: '08-2001', isOfficial: true, cardCount: 2, symbol: 'x' },
  { code: 'QC', name: 'Quidditch Cup', releaseDate: '11-2001', isOfficial: true, cardCount: 1, symbol: null },
]

describe('loadSets', () => {
  it('inserts all sets', async () => {
    await loadSets(ctx.db, sample)
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.code === 'BS')?.name).toBe('Base')
  })

  it('is idempotent and updates on re-run', async () => {
    await loadSets(ctx.db, [{ ...sample[0], name: 'Base Set' }, sample[1]])
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.code === 'BS')?.name).toBe('Base Set')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npx vitest run -w @revelio/ingest load-sets`
Expected: FAIL — `Cannot find module '../src/load-sets.js'`.

- [ ] **Step 4: Write the implementation**

`app/ingest/src/load-sets.ts`:
```ts
import type { DB } from '@revelio/db'
import { sets } from '@revelio/db'
import type { DistSet } from './types.js'

export async function loadSets(db: DB, input: DistSet[]): Promise<void> {
  if (input.length === 0) return
  await db
    .insert(sets)
    .values(input.map((s) => ({
      code: s.code,
      name: s.name,
      releaseDate: s.releaseDate,
      isOfficial: s.isOfficial,
      cardCount: s.cardCount,
      symbol: s.symbol,
    })))
    .onConflictDoUpdate({
      target: sets.code,
      set: {
        name: sql`excluded.name`,
        releaseDate: sql`excluded.release_date`,
        isOfficial: sql`excluded.is_official`,
        cardCount: sql`excluded.card_count`,
        symbol: sql`excluded.symbol`,
      },
    })
}
```
Add this import at the top of the file: `import { sql } from 'drizzle-orm'`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run -w @revelio/ingest load-sets`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/ingest/test/helpers.ts app/ingest/src/load-sets.ts app/ingest/test/load-sets.test.ts
git commit -m "feat: upsert sets into Postgres with idempotency test"
```

---

### Task 4: Upsert `cards` + `card_localizations`

**Files:**
- Create: `app/ingest/src/load-cards.ts`
- Test: `app/ingest/test/load-cards.test.ts`

**Interfaces:**
- Consumes: `DistCard`, `@revelio/db` (`cards`, `cardLocalizations`), `loadSets` (FK parent must exist first).
- Produces: `loadCards(db: DB, cards: DistCard[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

`app/ingest/test/load-cards.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, cardLocalizations } from '@revelio/db'
import { loadSets } from '../src/load-sets.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dist')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards: distCards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadCards(ctx.db, distCards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadCards', () => {
  it('inserts all cards with split stats and string number', async () => {
    const rows = await ctx.db.select().from(cards)
    expect(rows).toHaveLength(3)
    const flobber = rows.find((r) => r.id === 'bs-2-flobberworm')!
    expect(flobber.health).toBe(6)
    expect(flobber.damagePerTurn).toBeNull()
    expect(flobber.cost).toBe(2)
    expect(flobber.provides).toEqual([{ lesson: 'Charms', amount: 1 }])
    const split = rows.find((r) => r.id === 'bs-1-dean-thomas')!
    expect(split.types).toEqual(['Character'])
    expect(split.health).toBeNull()
  })

  it('inserts one localization row per language', async () => {
    const locs = await ctx.db
      .select()
      .from(cardLocalizations)
      .where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    expect(locs).toHaveLength(2)
    expect(locs.find((l) => l.lang === 'de')?.text).toBe('Ziehe 3 Karten.')
    expect(locs.find((l) => l.lang === 'en')?.imageFile).toBe('DeanThomas.png')
  })

  it('stores match block as jsonb', async () => {
    const locs = await ctx.db
      .select()
      .from(cardLocalizations)
      .where(eq(cardLocalizations.cardId, 'qc-1-the-snitch'))
    expect((locs[0].match as { toWin: string }).toWin).toBe('Do 10 damage.')
  })

  it('is idempotent on re-run', async () => {
    const { cards: distCards } = await loadDist(fixtureDir)
    await loadCards(ctx.db, distCards)
    const rows = await ctx.db.select().from(cards)
    const locs = await ctx.db.select().from(cardLocalizations)
    expect(rows).toHaveLength(3)
    expect(locs).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run -w @revelio/ingest load-cards`
Expected: FAIL — `Cannot find module '../src/load-cards.js'`.

- [ ] **Step 3: Write the implementation**

`app/ingest/src/load-cards.ts`:
```ts
import { sql } from 'drizzle-orm'
import type { DB } from '@revelio/db'
import { cards, cardLocalizations } from '@revelio/db'
import type { DistCard } from './types.js'

export async function loadCards(db: DB, input: DistCard[]): Promise<void> {
  if (input.length === 0) return

  const cardRows = input.map((c) => ({
    id: c.id,
    setCode: c.setCode,
    number: c.number,
    name: c.name,
    types: c.types,
    subTypes: c.subTypes,
    lesson: c.lesson,
    cost: c.cost,
    provides: c.provides ?? null,
    rarity: c.rarity,
    finish: c.finish,
    artist: c.artist,
    health: c.stats?.health ?? null,
    damagePerTurn: c.stats?.damagePerTurn ?? null,
    orientation: c.orientation,
    legality: c.legality,
    draftValue: c.draftValue,
    rulings: c.rulings ?? [],
    defaultLanguage: c.defaultLanguage,
    languages: c.languages,
  }))

  await db.insert(cards).values(cardRows).onConflictDoUpdate({
    target: cards.id,
    set: {
      setCode: sql`excluded.set_code`,
      number: sql`excluded.number`,
      name: sql`excluded.name`,
      types: sql`excluded.types`,
      subTypes: sql`excluded.sub_types`,
      lesson: sql`excluded.lesson`,
      cost: sql`excluded.cost`,
      provides: sql`excluded.provides`,
      rarity: sql`excluded.rarity`,
      finish: sql`excluded.finish`,
      artist: sql`excluded.artist`,
      health: sql`excluded.health`,
      damagePerTurn: sql`excluded.damage_per_turn`,
      orientation: sql`excluded.orientation`,
      legality: sql`excluded.legality`,
      draftValue: sql`excluded.draft_value`,
      rulings: sql`excluded.rulings`,
      defaultLanguage: sql`excluded.default_language`,
      languages: sql`excluded.languages`,
    },
  })

  const locRows = input.flatMap((c) =>
    Object.entries(c.localizations).map(([lang, l]) => ({
      cardId: c.id,
      lang,
      name: l.name,
      status: l.status,
      source: l.source,
      text: l.text,
      flavorText: l.flavorText,
      adventure: l.adventure ?? null,
      match: l.match ?? null,
      imageFile: l.image?.file ?? null,
      imageUrl: l.image?.url ?? null,
    })),
  )

  await db.insert(cardLocalizations).values(locRows).onConflictDoUpdate({
    target: [cardLocalizations.cardId, cardLocalizations.lang],
    set: {
      name: sql`excluded.name`,
      status: sql`excluded.status`,
      source: sql`excluded.source`,
      text: sql`excluded.text`,
      flavorText: sql`excluded.flavor_text`,
      adventure: sql`excluded.adventure`,
      match: sql`excluded.match`,
      imageFile: sql`excluded.image_file`,
      imageUrl: sql`excluded.image_url`,
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run -w @revelio/ingest load-cards`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/ingest/src/load-cards.ts app/ingest/test/load-cards.test.ts
git commit -m "feat: upsert cards and localizations into Postgres"
```

---

### Task 5: Ingest entrypoint (`main`)

**Files:**
- Create: `app/ingest/src/main.ts`
- Test: `app/ingest/test/main.test.ts`

**Interfaces:**
- Consumes: `createClient`, `runMigrations`, `loadDist`, `loadSets`, `loadCards`.
- Produces: `runIngest(opts: { databaseUrl: string; dataDir: string }): Promise<{ sets: number; cards: number }>` and a CLI entry that reads `DATABASE_URL` / `DATA_DIR`.

- [ ] **Step 1: Write the failing test**

`app/ingest/test/main.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSQLContainer } from '@testcontainers/postgresql'
import { sql as dsql } from 'drizzle-orm'
import { createClient } from '@revelio/db'
import { runIngest } from '../src/main.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dist')

let container: Awaited<ReturnType<PostgreSQLContainer['start']>>
let uri: string
beforeAll(async () => {
  container = await new PostgreSQLContainer('postgres:16-alpine').start()
  uri = container.getConnectionUri()
}, 120_000)
afterAll(async () => { await container.stop() })

describe('runIngest', () => {
  it('migrates and loads the full fixture dataset', async () => {
    const result = await runIngest({ databaseUrl: uri, dataDir: fixtureDir })
    expect(result).toEqual({ sets: 2, cards: 3 })

    const { db, sql } = createClient(uri)
    const [{ count }] = await db.execute(dsql`select count(*)::int as count from cards`)
    expect(count).toBe(3)
    await sql.end()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run -w @revelio/ingest main`
Expected: FAIL — `Cannot find module '../src/main.js'`.

- [ ] **Step 3: Write the implementation**

`app/ingest/src/main.ts`:
```ts
import { createClient, runMigrations } from '@revelio/db'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadCards } from './load-cards.js'

export async function runIngest(opts: {
  databaseUrl: string
  dataDir: string
}): Promise<{ sets: number; cards: number }> {
  const { db, sql } = createClient(opts.databaseUrl)
  try {
    await runMigrations(db)
    const { sets, cards } = await loadDist(opts.dataDir)
    await loadSets(db, sets)
    await loadCards(db, cards)
    return { sets: sets.length, cards: cards.length }
  } finally {
    await sql.end()
  }
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  const dataDir = process.env.DATA_DIR ?? '/data'
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  runIngest({ databaseUrl, dataDir })
    .then((r) => {
      console.log(`ingest complete: ${r.sets} sets, ${r.cards} cards`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('ingest failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run -w @revelio/ingest main`
Expected: PASS (1 test).

- [ ] **Step 5: Run the whole ingest test suite**

Run: `cd app && npx vitest run -w @revelio/ingest`
Expected: PASS — all test files green.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/src/main.ts app/ingest/test/main.test.ts
git commit -m "feat: add ingest entrypoint wiring migrate and loaders"
```

---

### Task 6: Dev Docker Compose + ingest Dockerfile (real-data verification)

**Files:**
- Create: `app/ingest/Dockerfile`
- Create: `app/docker-compose.yml`
- Create: `app/docker-compose.override.yml`

**Interfaces:**
- Consumes: `runIngest` CLI (reads `DATABASE_URL`, `DATA_DIR`).
- Produces: a `postgres` service + a one-shot `ingest` service that loads the real `card-data/dist/` via a read-only bind-mount in dev.

- [ ] **Step 1: Write the ingest Dockerfile**

`app/ingest/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app

# Workspace manifests first for layer caching
COPY package.json ./
COPY db/package.json ./db/package.json
COPY ingest/package.json ./ingest/package.json
RUN npm install

# Source
COPY tsconfig.base.json ./
COPY db ./db
COPY ingest ./ingest

# In production a later plan bakes data here; in dev it is bind-mounted.
ENV DATA_DIR=/data
CMD ["npx", "tsx", "ingest/src/main.ts"]
```

- [ ] **Step 2: Write the base compose file**

`app/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: revelio
      POSTGRES_PASSWORD: revelio
      POSTGRES_DB: revelio
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U revelio"]
      interval: 5s
      timeout: 5s
      retries: 10

  ingest:
    image: ghcr.io/REPLACE_ME/revelio-ingest:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://revelio:revelio@postgres:5432/revelio
      DATA_DIR: /data
    restart: "no"

volumes:
  pgdata: {}
```

- [ ] **Step 3: Write the dev override**

`app/docker-compose.override.yml`:
```yaml
services:
  ingest:
    image: !reset null
    build:
      context: .
      dockerfile: ingest/Dockerfile
    volumes:
      - ../card-data/dist:/data:ro
```

- [ ] **Step 4: Run the stack against the real dataset**

Run:
```bash
cd app && docker compose up --build --abort-on-container-exit ingest
```
Expected: the `ingest` container logs `ingest complete: <N> sets, 1035 cards` and exits 0. (If `card-data/dist/` is missing, run `python3 card-data/build_dataset.py` first.)

- [ ] **Step 5: Verify the row counts in Postgres**

Run:
```bash
cd app && docker compose up -d postgres && \
docker compose exec -T postgres psql -U revelio -d revelio -c "select count(*) from cards; select count(*) from card_localizations; select count(*) from sets;"
```
Expected: `cards` = 1035; `card_localizations` ≥ 1035 (en for all + de for Base Set); `sets` = the number of entries in `dist/sets.json`.

- [ ] **Step 6: Tear down**

Run: `cd app && docker compose down`
Expected: containers removed (the `pgdata` volume persists).

- [ ] **Step 7: Commit**

```bash
git add app/ingest/Dockerfile app/docker-compose.yml app/docker-compose.override.yml
git commit -m "feat: add dev compose and ingest Dockerfile loading real dataset"
```

---

## Self-Review

**Spec coverage (this plan's slice — "Foundation + Postgres data layer"):**
- `app/` workspace + folder layout → Task 1, Task 2 ✓
- Postgres schema from `DATABASE-CHOICE.md` (minus `tsvector`, per Meili decision) → Task 1 ✓
- Drizzle ORM + migrations → Task 1 ✓
- ingest job `dist/ → Postgres`, idempotent upserts → Tasks 3–5 ✓
- env-driven config (`DATABASE_URL`, `DATA_DIR`), no hardcoded hosts → Task 5, Task 6 ✓
- one-shot ingest service gated on `postgres` health → Task 6 ✓
- dev bind-mount of `card-data/dist`; production baked-image path deferred → Task 6 ✓ (prod image bake is in Plan 5)
- Meilisearch, MinIO, Next.js frontend → deferred to Plans 2–5 (out of scope here) ✓

**Placeholder scan:** No TBD/TODO. `ghcr.io/REPLACE_ME/...` in the base compose is an intentional, documented placeholder resolved in Plan 5 (CI/registry); dev override builds locally so it does not block this plan.

**Type consistency:** `DistCard`/`DistSet`/`DistLocalization` defined in Task 2 are reused verbatim in Tasks 3–5. `loadSets`/`loadCards`/`loadDist`/`runIngest` signatures match across their producer and consumer tasks. Column names in `excluded.*` upsert clauses match the snake_case columns declared in `schema.ts`.

## Notes for later plans

- **Plan 2 (Search):** extend ingest with a `load-meili.ts` building per-language indexes from `cards.<lang>.json` + `search-index.<lang>.json`; add the `meilisearch` service.
- **Plan 3 (Images):** add `load-minio.ts` uploading `assets/cards/<id>.png` (diffed); add the `minio` service.
- **Plan 5 (CI/Prod):** the `revelio-data` image + `COPY --from` bake, prod `docker-compose.yml` image tags, and `web` gated on `ingest: service_completed_successfully`.

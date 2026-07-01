# Foundation + Postgres Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `app/` workspace and load the built card dataset (`card-data/dist/`) into PostgreSQL via a one-time additive seed job (Postgres is the source of truth; the import never overwrites existing rows), runnable locally with `docker compose up`.

**Architecture:** An npm-workspaces root (`app/`) with two packages: `@revelio/db` (Drizzle schema + migrations + client) and `@revelio/ingest` (a one-shot Node/TypeScript loader). The loader reads `dist/sets.json` + `dist/cards.json` from `DATA_DIR`, runs migrations, then **additively imports** (`ON CONFLICT DO NOTHING`) `sets`, `cards`, and `card_localizations` — Postgres is the source of truth and existing rows are never overwritten. Integration tests run against a throwaway Postgres via Testcontainers.

**Tech Stack:** Node 20, TypeScript (ESM), npm workspaces, Drizzle ORM + drizzle-kit, `postgres` (postgres.js) driver, Vitest, `@testcontainers/postgresql`, Docker Compose.

## Global Constraints

- Node **20+**, TypeScript, ESM (`"type": "module"`) everywhere.
- Config is **env-driven only — no hardcoded hosts**. This plan uses `DATABASE_URL` and `DATA_DIR` (default `/data`).
- **Postgres is the source of truth.** The pipeline is a **one-time additive seed**: every load uses `INSERT ... ON CONFLICT DO NOTHING` — it inserts only missing rows and **never updates or deletes** existing ones (so in-app edits and a later additive import never clobber each other). Re-running is a safe no-op.
- Every table carries editability metadata: `created_at` + `updated_at` (`timestamp`, default now, not null) and `origin` (`text`, not null, default `'import'`; seed rows = `'import'`, future in-app creates = `'user'`). The pre-existing nullable `card_localizations.source` (translation provenance, e.g. "WotC (hpjson)") is a different column and is kept.
- All prose, comments, identifiers, and commit messages in **English**.
- Commit messages follow **Conventional Commits** (`feat:`, `chore:`, `test:`, `docs:`).
- Postgres is the source of truth. **No `tsvector` column** — full-text search is Meilisearch's job (later plan).
- `number` is a **string** (`"3a"`), not an integer. `cost`, `health`, `damagePerTurn`, `draftValue` are nullable integers.
- New code lives under `app/`. `card-data/` and `logos/` are untouched.

---

## File Structure

```
app/
  package.json                     # workspaces root: ["core","db","ingest"]
  tsconfig.base.json
  .gitignore
  .env.example
  docker-compose.yml               # base: postgres service + volume
  docker-compose.override.yml      # dev: ingest built from source, bind-mounts ../card-data
  core/                            # @revelio/core (driver-free)
    package.json
    tsconfig.json
    src/
      vocab.ts                     # curated vocab config (codes, lesson colors, order)
      schemas.ts                   # Zod schemas
      domain.ts                    # shared DTO types (SetDTO, CardDTO, ...)
      index.ts                     # barrel
    test/
      vocab.test.ts
  db/
    package.json                   # @revelio/db
    tsconfig.json
    drizzle.config.ts
    src/
      schema.ts                    # ref tables + sets, cards, junctions, card_localizations
      client.ts                    # createClient(databaseUrl)
      migrate.ts                   # migrationsDir export + runMigrations()
      index.ts                     # re-exports
    drizzle/                       # GENERATED migrations (single consolidated, committed)
  ingest/
    package.json                   # @revelio/ingest
    tsconfig.json
    Dockerfile
    src/
      types.ts                     # TS types for dist JSON
      load-dist.ts                 # read+parse dist files from DATA_DIR
      load-sets.ts                 # additive import of sets (ON CONFLICT DO NOTHING)
      load-vocab.ts                # derive vocab + curated metadata -> reference tables
      load-cards.ts                # additive import of cards + localizations + junctions
      main.ts                      # entrypoint: migrate + seed
    test/
      fixtures/dataset/sets.json   # (not "dist/" — .gitignore would swallow it)
      fixtures/dataset/cards.json
      helpers.ts                   # isolated test DB (TEST_DATABASE_URL or Testcontainers)
      load-dist.test.ts
      load-sets.test.ts
      load-vocab.test.ts
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

### Task 3: Add editability columns (timestamps + source)

**Files:**
- Modify: `app/db/src/schema.ts`
- Generated: `app/db/drizzle/0001_*.sql` (via drizzle-kit)

**Interfaces:**
- Consumes: the Task 1 schema.
- Produces: each of `sets`, `cards`, `cardLocalizations` gains `createdAt` (`created_at`), `updatedAt` (`updated_at`), and `source` (`source`) columns. No signature changes to `createClient` / `runMigrations`.

- [ ] **Step 1: Replace the schema with the editability columns added**

Rewrite `app/db/src/schema.ts` so all three tables share a DRY `editable` column set:
```ts
import {
  pgTable, text, integer, boolean, jsonb, timestamp, primaryKey, index,
} from 'drizzle-orm/pg-core'

// Editability metadata shared by every table: pipeline rows are source='import',
// future in-app creates will be source='user'.
const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

export const sets = pgTable('sets', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  releaseDate: text('release_date'),
  isOfficial: boolean('is_official').notNull().default(false),
  cardCount: integer('card_count').notNull().default(0),
  symbol: text('symbol'),
  ...editable,
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
  ...editable,
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
  ...editable,
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.lang] }),
}))
```

Note: `card_localizations` already has a nullable `source` column (translation-text provenance like "WotC (hpjson)") and a `status` column (official/machine/community). The `origin` column from `editable` (import/user) is a separate axis — `card_localizations` keeps its own `source` line AND gains `origin`; the two names must not collide.

- [ ] **Step 2: Generate the migration**

Run: `cd app && npm run db:generate`
Expected: drizzle-kit writes `app/db/drizzle/0001_*.sql` containing `ALTER TABLE ... ADD COLUMN "created_at"`, `"updated_at"`, and `"origin"` for all three tables.

- [ ] **Step 3: Verify the migration adds the columns**

Run: `grep -c 'ADD COLUMN "origin"' app/db/drizzle/0001_*.sql`
Expected: `3` (one per table).

- [ ] **Step 4: Commit**

```bash
git add app/db/src/schema.ts app/db/drizzle
git commit -m "feat: add created_at, updated_at and source columns"
```

---

### Task 4: Test helper + additive `loadSets`

**Files:**
- Create: `app/ingest/test/helpers.ts`
- Create: `app/ingest/src/load-sets.ts`
- Test: `app/ingest/test/load-sets.test.ts`

**Interfaces:**
- Consumes: `DistSet`, `@revelio/db` (`createClient`, `runMigrations`, `sets`).
- Produces:
  - `loadSets(db: DB, sets: DistSet[]): Promise<void>` — inserts with `origin: 'import'`, **`ON CONFLICT DO NOTHING`** (never overwrites).
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
  it('inserts all sets tagged origin=import', async () => {
    await loadSets(ctx.db, sample)
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    const bs = rows.find((r) => r.code === 'BS')!
    expect(bs.name).toBe('Base')
    expect(bs.origin).toBe('import')
    expect(bs.createdAt).toBeInstanceOf(Date)
  })

  it('re-run never overwrites existing rows (additive)', async () => {
    await loadSets(ctx.db, [{ ...sample[0], name: 'CHANGED' }, sample[1]])
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.code === 'BS')?.name).toBe('Base') // preserved, not overwritten
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm install && cd ingest && npx vitest run load-sets`
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
      origin: 'import',
    })))
    .onConflictDoNothing({ target: sets.code })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/ingest && npx vitest run load-sets`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/ingest/test/helpers.ts app/ingest/src/load-sets.ts app/ingest/test/load-sets.test.ts
git commit -m "feat: additively import sets into Postgres"
```

---

### Task 5: `@revelio/core` shared package (vocab config + Zod + domain types)

**Files:**
- Modify: `app/package.json` (add `core` to `workspaces`)
- Create: `app/core/package.json`, `app/core/tsconfig.json`
- Create: `app/core/src/vocab.ts`, `app/core/src/schemas.ts`, `app/core/src/domain.ts`, `app/core/src/index.ts`
- Test: `app/core/test/vocab.test.ts`

**Interfaces:**
- Produces (from `@revelio/core`):
  - `VOCAB: { types: VocabEntry[]; rarities: VocabEntry[]; finishes: VocabEntry[]; legalities: VocabEntry[]; lessons: LessonEntry[] }`
  - `type VocabEntry = { code: string; sortOrder: number }`, `type LessonEntry = VocabEntry & { color: string }`
  - `vocabEntrySchema`, `lessonEntrySchema` (Zod)
  - `type SetDTO`, `type CardDTO`, `type CardLocalizationDTO`

- [ ] **Step 1: Add `core` to the workspace**

Edit `app/package.json` `workspaces` to `["core", "db", "ingest"]`.

- [ ] **Step 2: Create the package files**

`app/core/package.json`:
```json
{
  "name": "@revelio/core",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`app/core/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Write the vocab config**

`app/core/src/vocab.ts`:
```ts
export type VocabEntry = { code: string; sortOrder: number }
export type LessonEntry = VocabEntry & { color: string }

export const TYPES: VocabEntry[] = [
  { code: 'Character', sortOrder: 1 },
  { code: 'Creature', sortOrder: 2 },
  { code: 'Spell', sortOrder: 3 },
  { code: 'Item', sortOrder: 4 },
  { code: 'Lesson', sortOrder: 5 },
  { code: 'Adventure', sortOrder: 6 },
  { code: 'Location', sortOrder: 7 },
  { code: 'Event', sortOrder: 8 },
  { code: 'Match', sortOrder: 9 },
]

// First-pass HP-flavored accent colors on the dark canvas; tunable later.
export const LESSONS: LessonEntry[] = [
  { code: 'Care of Magical Creatures', color: '#5CB878', sortOrder: 1 },
  { code: 'Charms', color: '#5B8DEF', sortOrder: 2 },
  { code: 'Potions', color: '#A06CD5', sortOrder: 3 },
  { code: 'Transfiguration', color: '#E0555B', sortOrder: 4 },
  { code: 'Quidditch', color: '#EA7B3C', sortOrder: 5 },
]

export const RARITIES: VocabEntry[] = [
  { code: 'Common', sortOrder: 1 },
  { code: 'Uncommon', sortOrder: 2 },
  { code: 'Rare', sortOrder: 3 },
  { code: 'Lesson', sortOrder: 4 },
]

export const FINISHES: VocabEntry[] = [
  { code: 'normal', sortOrder: 1 },
  { code: 'foil', sortOrder: 2 },
  { code: 'holo', sortOrder: 3 },
]

export const LEGALITIES: VocabEntry[] = [
  { code: 'legal', sortOrder: 1 },
  { code: 'restricted', sortOrder: 2 },
  { code: 'banned', sortOrder: 3 },
  { code: 'unknown', sortOrder: 4 },
]

// sub_types is intentionally not curated here — it self-extends from card data.
export const VOCAB = {
  types: TYPES,
  lessons: LESSONS,
  rarities: RARITIES,
  finishes: FINISHES,
  legalities: LEGALITIES,
} as const
```

- [ ] **Step 4: Write the Zod schemas**

`app/core/src/schemas.ts`:
```ts
import { z } from 'zod'

export const vocabEntrySchema = z.object({
  code: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
})

export const lessonEntrySchema = vocabEntrySchema.extend({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a #RRGGBB hex color'),
})
```

- [ ] **Step 5: Write the shared domain DTO types**

`app/core/src/domain.ts`:
```ts
// The transport/domain shape shared by the API and the frontend (distinct from the
// Drizzle persistence rows in @revelio/db). Grows as the web app is built.
export type SetDTO = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
}

export type CardLocalizationDTO = {
  lang: string
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  imageFile: string | null
  imageUrl: string | null
}

export type CardDTO = {
  id: string
  setCode: string
  number: string
  name: string
  types: string[]
  subTypes: string[]
  lesson: string | null
  cost: number | null
  rarity: string | null
  finish: string | null
  legality: string | null
  localizations: Record<string, CardLocalizationDTO>
}
```

- [ ] **Step 6: Write the barrel export**

`app/core/src/index.ts`:
```ts
export * from './vocab.js'
export * from './schemas.js'
export * from './domain.js'
```

- [ ] **Step 7: Write the failing test**

`app/core/test/vocab.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, VOCAB } from '../src/vocab.js'
import { vocabEntrySchema, lessonEntrySchema } from '../src/schemas.js'

describe('vocab config', () => {
  it('every lesson has a valid #RRGGBB color and a unique code', () => {
    for (const l of LESSONS) expect(() => lessonEntrySchema.parse(l)).not.toThrow()
    const codes = LESSONS.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('plain vocab entries validate', () => {
    for (const e of [...TYPES, ...RARITIES, ...FINISHES, ...LEGALITIES]) {
      expect(() => vocabEntrySchema.parse(e)).not.toThrow()
    }
  })

  it('VOCAB groups the five curated vocabularies', () => {
    expect(Object.keys(VOCAB).sort()).toEqual(
      ['finishes', 'legalities', 'lessons', 'rarities', 'types'],
    )
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd app && npm install && cd core && npx vitest run`
Expected: FAIL — `Cannot find module '../src/vocab.js'`.

- [ ] **Step 9: (files already written in Steps 3–6) Run test to verify it passes**

Run: `cd app/core && npx vitest run`
Expected: PASS (3 tests). No Docker needed — this package is pure.

- [ ] **Step 10: Commit**

```bash
git add app/package.json app/core
git commit -m "feat: add @revelio/core with vocab config, Zod and domain types"
```

---

### Task 6: Schema evolution to normalized vocabularies (single fresh migration)

**Files:**
- Modify: `app/db/src/schema.ts`, `app/db/src/index.ts`
- Delete: `app/db/drizzle/*` (all existing migrations)
- Generated: a single fresh `app/db/drizzle/0000_*.sql`

**Interfaces:**
- Produces (from `@revelio/db`): new table objects `types`, `subTypes`, `lessons`, `rarities`, `finishes`, `legalities`, `cardTypes`, `cardSubTypes`; `cards` loses `types`/`subTypes` columns and gains FKs `lesson`→`lessons.code`, `rarity`→`rarities.code`, `finish`→`finishes.code`, `legality`→`legalities.code` (all nullable).

- [ ] **Step 1: Replace the schema**

`app/db/src/schema.ts`:
```ts
import {
  pgTable, text, integer, boolean, jsonb, timestamp, primaryKey, index,
} from 'drizzle-orm/pg-core'

const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

// --- reference (vocabulary) tables ---
export const types = pgTable('types', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const subTypes = pgTable('sub_types', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const lessons = pgTable('lessons', {
  code: text('code').primaryKey(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const rarities = pgTable('rarities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const finishes = pgTable('finishes', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const legalities = pgTable('legalities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

// --- core tables ---
export const sets = pgTable('sets', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  releaseDate: text('release_date'),
  isOfficial: boolean('is_official').notNull().default(false),
  cardCount: integer('card_count').notNull().default(0),
  symbol: text('symbol'),
  ...editable,
})

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  setCode: text('set_code').notNull().references(() => sets.code),
  number: text('number').notNull(),
  name: text('name').notNull(),
  lesson: text('lesson').references(() => lessons.code),
  cost: integer('cost'),
  provides: jsonb('provides'),
  rarity: text('rarity').references(() => rarities.code),
  finish: text('finish').references(() => finishes.code),
  artist: text('artist').array().notNull().default([]),
  health: integer('health'),
  damagePerTurn: integer('damage_per_turn'),
  orientation: text('orientation'),
  legality: text('legality').references(() => legalities.code),
  draftValue: integer('draft_value'),
  rulings: jsonb('rulings'),
  defaultLanguage: text('default_language').notNull(),
  languages: text('languages').array().notNull().default([]),
  ...editable,
}, (t) => ({
  setCodeIdx: index('cards_set_code_idx').on(t.setCode),
}))

// --- junction tables for the array-valued vocabularies ---
export const cardTypes = pgTable('card_types', {
  cardId: text('card_id').notNull().references(() => cards.id),
  typeCode: text('type_code').notNull().references(() => types.code),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.typeCode] }),
}))

export const cardSubTypes = pgTable('card_sub_types', {
  cardId: text('card_id').notNull().references(() => cards.id),
  subTypeCode: text('sub_type_code').notNull().references(() => subTypes.code),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.subTypeCode] }),
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
  ...editable,
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.lang] }),
}))
```

- [ ] **Step 2: Update the barrel export**

`app/db/src/index.ts`:
```ts
export * as schema from './schema.js'
export {
  types, subTypes, lessons, rarities, finishes, legalities,
  sets, cards, cardTypes, cardSubTypes, cardLocalizations,
} from './schema.js'
export { createClient } from './client.js'
export type { DB } from './client.js'
export { migrationsDir, runMigrations } from './migrate.js'
```

- [ ] **Step 3: Delete the old migrations and regenerate a single fresh one**

Run:
```bash
rm -rf app/db/drizzle
cd app && npm run db:generate
```
Expected: exactly one new SQL file `app/db/drizzle/0000_*.sql` plus `app/db/drizzle/meta/` (with a single `0000_snapshot.json` and a `_journal.json` holding one entry).

- [ ] **Step 4: Verify the consolidated migration**

Run:
```bash
ls app/db/drizzle/*.sql | wc -l                                   # expect 1
grep -c 'CREATE TABLE "card_types"' app/db/drizzle/0000_*.sql     # expect 1
grep -c 'CREATE TABLE "lessons"' app/db/drizzle/0000_*.sql        # expect 1
grep -c '"types"\|"sub_types"\|"rarities"\|"finishes"\|"legalities"' app/db/drizzle/0000_*.sql  # >= 5
grep -c 'REFERENCES "lessons"' app/db/drizzle/0000_*.sql          # expect >= 1 (cards.lesson FK)
```
Expected: one SQL file; the reference + junction tables and the `cards` FKs are all present in it. `cards` must NOT contain a `types`/`sub_types` column (those are junctions now):
```bash
grep -E '"types" |"sub_types" ' app/db/drizzle/0000_*.sql          # expect NOTHING inside the cards table
```

- [ ] **Step 5: Commit**

```bash
git add app/db/src/schema.ts app/db/src/index.ts app/db/drizzle
git commit -m "feat: normalize vocabularies into reference and junction tables

Regenerate a single consolidated migration; drop the old ones."
```

---

### Task 7: `load-vocab` (derive values + curated metadata)

**Files:**
- Modify: `app/ingest/package.json` (add `@revelio/core` dependency)
- Create: `app/ingest/src/load-vocab.ts`
- Test: `app/ingest/test/load-vocab.test.ts`

**Interfaces:**
- Consumes: `DistCard`, `@revelio/db` (reference tables), `@revelio/core` (`VOCAB`).
- Produces: `loadVocab(db: DB, cards: DistCard[]): Promise<void>` — derives distinct vocab values from the cards, merges curated metadata (sort order; lesson color), additively upserts every reference table. Must run **before** `loadCards` (FK targets).

- [ ] **Step 1: Add the core dependency**

Edit `app/ingest/package.json` `dependencies` to include `"@revelio/core": "*"`.

- [ ] **Step 2: Write the failing test**

Tests run against an isolated Postgres. Set `TEST_DATABASE_URL` to an external server (recommended here) or let it fall back to Testcontainers.

`app/ingest/test/load-vocab.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { types, subTypes, lessons } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { loadVocab } from '../src/load-vocab.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { cards } = await loadDist(fixtureDir)
  await loadVocab(ctx.db, cards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadVocab', () => {
  it('derives distinct types from the cards', async () => {
    const rows = await ctx.db.select().from(types)
    const codes = rows.map((r) => r.code).sort()
    expect(codes).toEqual(['Character', 'Creature', 'Match'])
  })

  it('derives sub_types (incl. from cards) with default order', async () => {
    const rows = await ctx.db.select().from(subTypes)
    expect(rows.map((r) => r.code).sort()).toEqual(['Gryffindor', 'Wizard'])
    expect(rows[0].sortOrder).toBe(999)
  })

  it('applies curated color + order to a lesson derived from provides', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'Charms'))
    expect(rows).toHaveLength(1) // Charms comes from Flobberworm.provides
    expect(rows[0].color).toBe('#5B8DEF')
    expect(rows[0].sortOrder).toBe(2)
  })

  it('is additive on re-run', async () => {
    const { cards } = await loadDist(fixtureDir)
    await loadVocab(ctx.db, cards)
    const rows = await ctx.db.select().from(types)
    expect(rows).toHaveLength(3)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm install && cd ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run load-vocab`
Expected: FAIL — `Cannot find module '../src/load-vocab.js'`.

- [ ] **Step 4: Write the implementation**

`app/ingest/src/load-vocab.ts`:
```ts
import type { DB } from '@revelio/db'
import { types, subTypes, lessons, rarities, finishes, legalities } from '@revelio/db'
import { VOCAB } from '@revelio/core'
import type { DistCard } from './types.js'

type Provide = { lesson?: string | null }

function distinctVocab(cards: DistCard[]) {
  const acc = {
    types: new Set<string>(),
    subTypes: new Set<string>(),
    lessons: new Set<string>(),
    rarities: new Set<string>(),
    finishes: new Set<string>(),
    legalities: new Set<string>(),
  }
  for (const c of cards) {
    c.types.forEach((x) => acc.types.add(x))
    c.subTypes.forEach((x) => acc.subTypes.add(x))
    if (c.lesson) acc.lessons.add(c.lesson)
    if (c.rarity) acc.rarities.add(c.rarity)
    if (c.finish) acc.finishes.add(c.finish)
    if (c.legality) acc.legalities.add(c.legality)
    for (const p of (c.provides as Provide[] | null) ?? []) {
      if (p?.lesson) acc.lessons.add(p.lesson)
    }
  }
  return acc
}

// Merge a derived code set with curated sort orders (default 999 when uncurated).
function vocabRows(codes: Set<string>, cfg: readonly { code: string; sortOrder: number }[]) {
  return [...codes].map((code) => ({
    code,
    sortOrder: cfg.find((e) => e.code === code)?.sortOrder ?? 999,
    origin: 'import' as const,
  }))
}

export async function loadVocab(db: DB, cards: DistCard[]): Promise<void> {
  const d = distinctVocab(cards)

  const typeRows = vocabRows(d.types, VOCAB.types)
  if (typeRows.length) await db.insert(types).values(typeRows).onConflictDoNothing()

  const rarityRows = vocabRows(d.rarities, VOCAB.rarities)
  if (rarityRows.length) await db.insert(rarities).values(rarityRows).onConflictDoNothing()

  const finishRows = vocabRows(d.finishes, VOCAB.finishes)
  if (finishRows.length) await db.insert(finishes).values(finishRows).onConflictDoNothing()

  const legalityRows = vocabRows(d.legalities, VOCAB.legalities)
  if (legalityRows.length) await db.insert(legalities).values(legalityRows).onConflictDoNothing()

  // sub_types has no curated config — self-extends from data with default order.
  const subTypeRows = vocabRows(d.subTypes, [])
  if (subTypeRows.length) await db.insert(subTypes).values(subTypeRows).onConflictDoNothing()

  // lessons carry a curated color in addition to sort order.
  const lessonRows = [...d.lessons].map((code) => {
    const cfg = VOCAB.lessons.find((l) => l.code === code)
    return { code, color: cfg?.color ?? null, sortOrder: cfg?.sortOrder ?? 999, origin: 'import' as const }
  })
  if (lessonRows.length) await db.insert(lessons).values(lessonRows).onConflictDoNothing()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run load-vocab`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/ingest/package.json app/ingest/src/load-vocab.ts app/ingest/test/load-vocab.test.ts
git commit -m "feat: additively import vocabularies from dist with curated metadata"
```

---

### Task 8: Rewrite `load-cards` for FKs + junction tables

**Files:**
- Modify: `app/ingest/src/load-cards.ts`
- Modify: `app/ingest/test/load-cards.test.ts`

**Interfaces:**
- Consumes: `DistCard`, `@revelio/db` (`cards`, `cardLocalizations`, `cardTypes`, `cardSubTypes`), and requires `loadVocab` + `loadSets` to have run first (FK targets).
- Produces: `loadCards(db: DB, cards: DistCard[]): Promise<void>` — inserts card rows (scalar FK columns, no more `types`/`subTypes` arrays), localization rows, and `card_types` / `card_sub_types` junction rows; all additive.

- [ ] **Step 1: Rewrite the test**

`app/ingest/test/load-cards.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, cardLocalizations, cardTypes, cardSubTypes } from '@revelio/db'
import { loadSets } from '../src/load-sets.js'
import { loadVocab } from '../src/load-vocab.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards: distCards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadVocab(ctx.db, distCards)
  await loadCards(ctx.db, distCards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadCards', () => {
  it('inserts cards with scalar FK values, split stats, and origin=import', async () => {
    const rows = await ctx.db.select().from(cards)
    expect(rows).toHaveLength(3)
    const flobber = rows.find((r) => r.id === 'bs-2-flobberworm')!
    expect(flobber.health).toBe(6)
    expect(flobber.damagePerTurn).toBeNull()
    expect(flobber.cost).toBe(2)
    expect(flobber.rarity).toBe('Common')
    expect(flobber.finish).toBe('normal')
    expect(flobber.origin).toBe('import')
  })

  it('links types via the card_types junction', async () => {
    const links = await ctx.db.select().from(cardTypes).where(eq(cardTypes.cardId, 'bs-2-flobberworm'))
    expect(links.map((l) => l.typeCode)).toEqual(['Creature'])
  })

  it('links sub_types via the card_sub_types junction', async () => {
    const links = await ctx.db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, 'bs-1-dean-thomas'))
    expect(links.map((l) => l.subTypeCode).sort()).toEqual(['Gryffindor', 'Wizard'])
  })

  it('inserts one localization row per language keeping the dist source', async () => {
    const locs = await ctx.db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    expect(locs).toHaveLength(2)
    expect(locs.find((l) => l.lang === 'de')?.text).toBe('Ziehe 3 Karten.')
    expect(locs.find((l) => l.lang === 'en')?.source).toBe('WotC')
  })

  it('re-run is additive and never overwrites an in-app edit', async () => {
    await ctx.db
      .update(cardLocalizations)
      .set({ text: 'EDITED IN APP' })
      .where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    const { cards: distCards } = await loadDist(fixtureDir)
    await loadCards(ctx.db, distCards)
    const cardRows = await ctx.db.select().from(cards)
    expect(cardRows).toHaveLength(3)
    const dean = await ctx.db
      .select().from(cardLocalizations)
      .where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    expect(dean.find((l) => l.lang === 'en')?.text).toBe('EDITED IN APP')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run load-cards`
Expected: FAIL — the current `load-cards.ts` still references removed `types`/`subTypes` columns (compile/type error) or the junction assertions fail.

- [ ] **Step 3: Rewrite the implementation**

`app/ingest/src/load-cards.ts`:
```ts
import type { DB } from '@revelio/db'
import { cards, cardLocalizations, cardTypes, cardSubTypes } from '@revelio/db'
import type { DistCard } from './types.js'

export async function loadCards(db: DB, input: DistCard[]): Promise<void> {
  if (input.length === 0) return

  const cardRows = input.map((c) => ({
    id: c.id,
    setCode: c.setCode,
    number: c.number,
    name: c.name,
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
    origin: 'import' as const,
  }))
  await db.insert(cards).values(cardRows).onConflictDoNothing({ target: cards.id })

  const locRows = input.flatMap((c) =>
    Object.entries(c.localizations).map(([lang, l]) => ({
      cardId: c.id,
      lang,
      name: l.name,
      status: l.status,
      source: l.source,
      origin: 'import' as const,
      text: l.text,
      flavorText: l.flavorText,
      adventure: l.adventure ?? null,
      match: l.match ?? null,
      imageFile: l.image?.file ?? null,
      imageUrl: l.image?.url ?? null,
    })),
  )
  await db
    .insert(cardLocalizations)
    .values(locRows)
    .onConflictDoNothing({ target: [cardLocalizations.cardId, cardLocalizations.lang] })

  const typeLinks = input.flatMap((c) => c.types.map((code) => ({ cardId: c.id, typeCode: code })))
  if (typeLinks.length) await db.insert(cardTypes).values(typeLinks).onConflictDoNothing()

  const subTypeLinks = input.flatMap((c) => c.subTypes.map((code) => ({ cardId: c.id, subTypeCode: code })))
  if (subTypeLinks.length) await db.insert(cardSubTypes).values(subTypeLinks).onConflictDoNothing()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run load-cards`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/ingest/src/load-cards.ts app/ingest/test/load-cards.test.ts
git commit -m "feat: import cards with FK vocab and junction tables"
```

---

### Task 9: Seed entrypoint wires `load-vocab`

**Files:**
- Modify: `app/ingest/src/main.ts`
- Modify: `app/ingest/test/main.test.ts`

**Interfaces:**
- Consumes: `loadDist`, `loadSets`, `loadVocab`, `loadCards`, `createClient`, `runMigrations`.
- Produces: `runIngest(opts)` runs migrate → loadSets → **loadVocab** → loadCards, in that order.

- [ ] **Step 1: Update the test**

`app/ingest/test/main.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql as dsql } from 'drizzle-orm'
import { createClient } from '@revelio/db'
import { runIngest } from '../src/main.js'
import { withFreshDatabase } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let fresh: Awaited<ReturnType<typeof withFreshDatabase>>
beforeAll(async () => { fresh = await withFreshDatabase() }, 120_000)
afterAll(async () => { await fresh.stop() })

describe('runIngest', () => {
  it('migrates and seeds sets, vocab, cards and junctions', async () => {
    const result = await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir })
    expect(result).toEqual({ sets: 2, cards: 3 })

    const { db, sql } = createClient(fresh.url)
    const cardCount = await db.execute(dsql`select count(*)::int as count from cards`)
    const typeLinks = await db.execute(dsql`select count(*)::int as count from card_types`)
    expect(cardCount[0].count).toBe(3)
    expect(typeLinks[0].count).toBe(3) // one type per fixture card
    await sql.end()
  })

  it('is a safe no-op on a second run', async () => {
    await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir })
    const { db, sql } = createClient(fresh.url)
    const cardCount = await db.execute(dsql`select count(*)::int as count from cards`)
    expect(cardCount[0].count).toBe(3)
    await sql.end()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run main`
Expected: FAIL — junction count is 0 (vocab/junctions not wired yet) or a compile error.

- [ ] **Step 3: Update the implementation**

`app/ingest/src/main.ts`:
```ts
import { createClient, runMigrations } from '@revelio/db'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadVocab } from './load-vocab.js'
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
    await loadVocab(db, cards)
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
      console.log(`seed complete: ${r.sets} sets, ${r.cards} cards imported (additive)`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run main`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole ingest + core suite**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run && cd ../core && npx vitest run`
Expected: all test files green.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/src/main.ts app/ingest/test/main.test.ts
git commit -m "feat: wire load-vocab into the seed entrypoint"
```

---

### Task 10: Dev Docker Compose + ingest Dockerfile (real-data verification)

**Files:**
- Create: `app/ingest/Dockerfile`
- Create: `app/docker-compose.yml`
- Create: `app/docker-compose.override.yml`

**Interfaces:**
- Consumes: `runIngest` CLI (reads `DATABASE_URL`, `DATA_DIR`).
- Produces: a `postgres` service + a one-shot `ingest` service that additively seeds the real `card-data/dist/` via a read-only bind-mount in dev.

- [ ] **Step 1: Write the ingest Dockerfile**

`app/ingest/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app

# Workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY ingest/package.json ./ingest/package.json
RUN npm install

# Source
COPY tsconfig.base.json ./
COPY core ./core
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
Expected: the `ingest` container logs `seed complete: <N> sets, 1035 cards imported (additive)` and exits 0. (If `card-data/dist/` is missing, run `python3 card-data/build_dataset.py` first.)

- [ ] **Step 5: Verify the data in Postgres**

Run:
```bash
cd app && docker compose up -d postgres && \
docker compose exec -T postgres psql -U revelio -d revelio -c "\
select count(*) as cards from cards; \
select count(*) as localizations from card_localizations; \
select count(*) as type_links from card_types; \
select count(*) as sub_type_links from card_sub_types; \
select count(*) as lessons from lessons; \
select code, color from lessons order by sort_order;"
```
Expected: `cards` = 1035; `type_links` ≥ 1035 (each card has ≥1 type); `lessons` = 5; the five lessons list with their curated colors.

- [ ] **Step 6: Verify a second run is a safe no-op**

Run:
```bash
cd app && docker compose run --rm ingest && \
docker compose exec -T postgres psql -U revelio -d revelio -c "select count(*) from cards;"
```
Expected: still `1035`.

- [ ] **Step 7: Tear down**

Run: `cd app && docker compose down`
Expected: containers removed (the authoritative `pgdata` volume persists).

- [ ] **Step 8: Commit**

```bash
git add app/ingest/Dockerfile app/docker-compose.yml app/docker-compose.override.yml
git commit -m "feat: add dev compose and ingest Dockerfile seeding real dataset"
```

---

## Self-Review

**Spec coverage (this plan's slice — "Foundation + Postgres data layer"):**
- `app/` workspace + folder layout → Tasks 1, 2, 5 ✓
- `@revelio/core` (vocab config, Zod, domain DTOs) → Task 5 ✓
- Postgres schema, editability metadata, normalized vocab (reference + junction tables, FKs) → Tasks 1, 3, 6 ✓
- Single consolidated migration (old ones deleted) → Task 6 ✓
- Postgres as source of truth; one-time **additive** seed (`ON CONFLICT DO NOTHING`) → Tasks 4, 7, 8, 9 ✓
- Vocab values derived from dist + curated metadata from `@revelio/core` → Task 7 ✓
- Cards via FKs + junction tables → Tasks 6, 8 ✓
- env-driven config, no hardcoded hosts → Tasks 9, 10 ✓
- one-shot ingest gated on `postgres` health; safe no-op on re-run → Task 10 ✓
- dev bind-mount; production baked-image path deferred to Plan 5 ✓
- Meilisearch, MinIO, Next.js frontend → Plans 2–5 ✓

**Placeholder scan:** No TBD/TODO. `ghcr.io/REPLACE_ME/...` in the base compose is intentional (resolved in Plan 5); the dev override builds locally.

**Type consistency:** `DistCard`/`DistSet` (Task 2) reused in Tasks 7–9. `loadSets`/`loadVocab`/`loadCards`/`runIngest` signatures match across tasks. Reference/junction table names (`types`, `sub_types`, `lessons`, `rarities`, `finishes`, `legalities`, `card_types`, `card_sub_types`) match between schema (Task 6), exports, and loaders (Tasks 7–8). `VOCAB` keys (`types`/`lessons`/`rarities`/`finishes`/`legalities`) match between `@revelio/core` (Task 5) and `load-vocab` (Task 7).

**Testing note:** integration tests use `TEST_DATABASE_URL` (external Postgres, fresh DB per test) — Testcontainers is a fallback but re-pulls its image per start, which is slow/unreliable in some sandboxes.

## Notes for later plans

- **Plan 2 (Search):** `load-meili.ts` builds per-language indexes; facets come from the FK/junction vocab. Steady-state index syncs from **Postgres** on in-app writes, not `dist/`.
- **Plan 3 (Images):** `load-minio.ts` uploads `assets/cards/<id>.png` (diffed); in-app uploads write to MinIO directly.
- **Plan 4 (Authoring + web):** write API/UI + auth to create/edit sets, cards, localizations and **vocab** (`origin='user'`); `@revelio/core` Zod schemas validate writes; the web reads `@revelio/core` for lesson colors and DTO types.
- **Plan 5 (CI/Prod):** `revelio-data` image + `COPY --from` bake, prod compose image tags, `web` gated on `ingest: service_completed_successfully`, and a backup strategy for the authoritative `pgdata` volume.

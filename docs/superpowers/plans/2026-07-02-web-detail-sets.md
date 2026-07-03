# Card Detail + Set Overview (Plan 4a-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three SSR read pages — `/card/[id]` (full card detail from Postgres), `/sets` (set index), `/sets/[code]` (set header + its cards) — with search/set tiles linking to the detail page.

**Architecture:** Add a read-query layer to `@revelio/db` (`getCardById`/`listSets`/`getSetByCode`) returning `@revelio/core` DTOs. The web reads Postgres through a server-only singleton client (`DATABASE_URL`). Card detail + set index come from Postgres; the per-set card grid reuses `searchCards` (Meili, `setCode` filter) + the existing `CardGrid`/`Pagination`. All pages are Server Components, localized, best-practice (Metadata API, `notFound()`).

**Tech Stack:** Next.js 16 (App Router, RSC), `@revelio/db` (Drizzle/postgres-js), `@revelio/core`, `@revelio/search`, next-intl, `next/image`, Vitest.

## Global Constraints

- Node **20+**, TypeScript, ESM. New code under `app/web/` and `app/db/` + `app/core/`.
- **Next.js best practices** ([[web-nextjs-best-practices]]): Server Components by default; `params`/`searchParams` awaited; `setRequestLocale(locale)`; **Metadata API** for SEO (title/canonical/hreflang/`og:image`); next-intl `Link` (no manual `/${locale}/…`); `next/image`; **`@revelio/db` server-only** (never in a client component / the browser).
- **Postgres is the detail source** (rulings, artist, health/damage, translation status, both-language text live only in Postgres). The per-set card grid uses Meili (`searchCards`), reusing `CardGrid`/`Pagination`.
- **Translation-status badge:** `en` localizations have `status: 'official'`, `de` have `status: 'machine'`. Show a "machine translation" badge when the displayed localization's `status === 'machine'`.
- **Localization fallback:** show `localizations[locale]`, else `localizations[defaultLanguage]`.
- **Extensionless imports:** convert `@revelio/db` relative imports from `./x.js` to extensionless (Turbopack can't resolve `.js`→`.ts`; see [[plan-1-foundation-done]]). `transpilePackages` in `next.config.ts` already lists `@revelio/db`.
- **Env:** adds `DATABASE_URL` (server) to the web; existing `MEILI_HOST`/`MEILI_SEARCH_KEY` (set grid), `NEXT_PUBLIC_IMAGE_BASE_URL` (images).
- **Image keys** (`@revelio/core`): full card `imageKey(id)` → `cards/<id>.png`; set symbol `symbolKey(code)` → `symbols/<CODE>.png` (files are keyed by set code; `sets.symbol` is the nullable "has a symbol" flag).
- English identifiers/comments; Conventional Commits.
- DB query integration tests reuse the ingest harness (`withMigratedDb`, `TEST_DATABASE_URL`); web component tests via Vitest + @testing-library.

## File Structure

```
app/
  core/src/domain.ts                       # + RulingDTO, CardDetailDTO
  db/src/
    queries.ts                             # getCardById, listSets, getSetByCode
    index.ts                               # export queries; extensionless imports
    client.ts, migrate.ts, migrate-cli.ts, schema.ts  # extensionless imports
  ingest/test/queries.test.ts              # DB query integration tests (reuse withMigratedDb)
  web/src/
    lib/db.ts                              # server-only singleton getDb()
    lib/card-view.ts                       # pickLocalization() helper (pure)
    app/[locale]/card/[id]/page.tsx        # detail SSR + generateMetadata
    app/[locale]/sets/page.tsx             # set index SSR
    app/[locale]/sets/[code]/page.tsx      # set page SSR (header + card grid)
    components/card-detail.tsx             # presentational detail view
    components/set-card.tsx                # set tile (index)
    components/card-tile.tsx               # + wrap in Link -> /card/[id]
    components/__tests__/                   # card-detail, set-card tests
    lib/__tests__/card-view.test.ts
  web/e2e/detail.spec.ts                   # Playwright (resilient)
  web/messages/{en,de}.json                # + card / sets namespaces
```

---

### Task 1: `@revelio/db` read-query layer (+ core DTOs, extensionless)

**Files:**
- Modify: `app/core/src/domain.ts` (add `RulingDTO`, `CardDetailDTO`)
- Create: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts`, `app/db/src/client.ts`, `app/db/src/migrate.ts`, `app/db/src/migrate-cli.ts`, `app/db/src/schema.ts` (extensionless relative imports)
- Test: `app/ingest/test/queries.test.ts`

**Interfaces:**
- Consumes: `DB` (`@revelio/db` client type); schema tables `cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings`; `SetDTO, CardLocalizationDTO` (`@revelio/core`).
- Produces:
  - `@revelio/core`: `RulingDTO = { seq: number; date: string | null; source: string | null; text: Record<string, string> }`; `CardDetailDTO = CardDTO & { artist: string[]; health: number | null; damagePerTurn: number | null; orientation: string | null; defaultLanguage: string; rulings: RulingDTO[]; set: SetDTO }`
  - `@revelio/db`: `getCardById(db: DB, id: string): Promise<CardDetailDTO | null>`, `listSets(db: DB): Promise<SetDTO[]>`, `getSetByCode(db: DB, code: string): Promise<SetDTO | null>`

- [ ] **Step 1: Add the DTOs to core**

Append to `app/core/src/domain.ts`:
```ts
export type RulingDTO = {
  seq: number
  date: string | null
  source: string | null
  text: Record<string, string>
}

// The full card as the detail page needs it (superset of CardDTO).
export type CardDetailDTO = CardDTO & {
  artist: string[]
  health: number | null
  damagePerTurn: number | null
  orientation: string | null
  defaultLanguage: string
  rulings: RulingDTO[]
  set: SetDTO
}
```

- [ ] **Step 2: Convert `@revelio/db` to extensionless relative imports**

In every `app/db/src/*.ts`, drop the `.js` suffix from relative imports/exports (e.g. `from './schema.js'` → `from './schema'`, `export * as schema from './schema.js'` → `export * as schema from './schema'`). Command:
```bash
cd app/db && for f in src/*.ts; do perl -pi -e "s/(from '\.[^']*)\.js'/\$1'/g" "$f"; done
```
Then confirm none remain: `grep -rn "from '\.[^']*\.js'" src` → no output.

- [ ] **Step 3: Write the query module**

`app/db/src/queries.ts`:
```ts
import { eq, asc } from 'drizzle-orm'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings } from './schema'
import type { SetDTO, CardLocalizationDTO, CardDetailDTO } from '@revelio/core'

type SetRow = typeof sets.$inferSelect

function toSetDTO(row: SetRow): SetDTO {
  return {
    code: row.code,
    name: row.name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
  }
}

export async function listSets(db: DB): Promise<SetDTO[]> {
  const rows = await db.select().from(sets).orderBy(asc(sets.releaseDate), asc(sets.code))
  return rows.map(toSetDTO)
}

export async function getSetByCode(db: DB, code: string): Promise<SetDTO | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  return row ? toSetDTO(row) : null
}

export async function getCardById(db: DB, id: string): Promise<CardDetailDTO | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
  if (!card) return null
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  const [locRows, typeRows, subTypeRows, rulingRows] = await Promise.all([
    db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, id)),
    db.select().from(cardTypes).where(eq(cardTypes.cardId, id)),
    db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, id)),
    db.select().from(cardRulings).where(eq(cardRulings.cardId, id)).orderBy(asc(cardRulings.seq)),
  ])
  const localizations: Record<string, CardLocalizationDTO> = {}
  for (const l of locRows) {
    localizations[l.lang] = {
      lang: l.lang, name: l.name, status: l.status, source: l.source,
      text: l.text, flavorText: l.flavorText, imageFile: l.imageFile, imageUrl: l.imageUrl,
    }
  }
  return {
    id: card.id,
    setCode: card.setCode,
    number: card.number,
    name: card.name,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    lesson: card.lesson,
    cost: card.cost,
    rarity: card.rarity,
    finish: card.finish,
    legality: card.legality,
    artist: card.artist,
    health: card.health,
    damagePerTurn: card.damagePerTurn,
    orientation: card.orientation,
    defaultLanguage: card.defaultLanguage,
    localizations,
    rulings: rulingRows.map((r) => ({
      seq: r.seq, date: r.date, source: r.source, text: (r.text ?? {}) as Record<string, string>,
    })),
    set: toSetDTO(setRow),
  }
}
```

- [ ] **Step 4: Export the queries**

Append to `app/db/src/index.ts`:
```ts
export { getCardById, listSets, getSetByCode } from './queries'
```

- [ ] **Step 5: Write the failing integration test**

`app/ingest/test/queries.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getCardById, listSets, getSetByCode, schema } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  const { db } = ctx
  await db.insert(schema.types).values({ code: 'creature', labels: {} })
  await db.insert(schema.subTypes).values({ code: 'beast', labels: {} })
  await db.insert(schema.lessons).values({ code: 'charms', labels: {}, color: '#5B8DEF' })
  await db.insert(schema.rarities).values({ code: 'rare', labels: {} })
  await db.insert(schema.sets).values({
    code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 1, symbol: 'BS',
  })
  await db.insert(schema.cards).values({
    id: 'bs-1-fluffy', setCode: 'BS', number: '1', name: 'Fluffy', lesson: 'charms', cost: 3,
    rarity: 'rare', artist: ['Some Artist'], health: 5, damagePerTurn: 2, orientation: 'vertical',
    defaultLanguage: 'en', languages: ['en', 'de'],
  })
  await db.insert(schema.cardTypes).values({ cardId: 'bs-1-fluffy', typeCode: 'creature' })
  await db.insert(schema.cardSubTypes).values({ cardId: 'bs-1-fluffy', subTypeCode: 'beast' })
  await db.insert(schema.cardLocalizations).values([
    { cardId: 'bs-1-fluffy', lang: 'en', name: 'Fluffy', status: 'official', text: 'Guards the trapdoor.', flavorText: 'Woof.' },
    { cardId: 'bs-1-fluffy', lang: 'de', name: 'Fluffy', status: 'machine', text: 'Bewacht die Falltür.', flavorText: null },
  ])
  await db.insert(schema.cardRulings).values({
    cardId: 'bs-1-fluffy', seq: 1, date: '2001-06-01', source: 'FAQ', text: { en: 'It sleeps to music.' },
  })
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('getCardById', () => {
  it('returns the full detail DTO', async () => {
    const card = await getCardById(ctx.db, 'bs-1-fluffy')
    expect(card).not.toBeNull()
    expect(card!.name).toBe('Fluffy')
    expect(card!.types).toEqual(['creature'])
    expect(card!.subTypes).toEqual(['beast'])
    expect(card!.lesson).toBe('charms')
    expect(card!.artist).toEqual(['Some Artist'])
    expect(card!.health).toBe(5)
    expect(card!.localizations.de.status).toBe('machine')
    expect(card!.localizations.en.text).toBe('Guards the trapdoor.')
    expect(card!.rulings).toHaveLength(1)
    expect(card!.rulings[0].text.en).toBe('It sleeps to music.')
    expect(card!.set.name).toBe('Base Set')
  })

  it('returns null for an unknown id', async () => {
    expect(await getCardById(ctx.db, 'nope')).toBeNull()
  })
})

describe('listSets / getSetByCode', () => {
  it('lists sets and finds one by code', async () => {
    const all = await listSets(ctx.db)
    expect(all.map((s) => s.code)).toContain('BS')
    const bs = await getSetByCode(ctx.db, 'BS')
    expect(bs!.name).toBe('Base Set')
    expect(await getSetByCode(ctx.db, 'ZZ')).toBeNull()
  })
})
```

- [ ] **Step 6: Run — RED then GREEN**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run queries`
Expected: FAIL first (`getCardById` not exported) → after Steps 1-4, PASS (4 tests).
(If port 55432 isn't up, the compose Postgres is on 5432: use `postgres://revelio:revelio@localhost:5432/revelio`.)

- [ ] **Step 7: Confirm nothing regressed + typecheck**

Run: `cd app/core && npx vitest run` (7 pass) and `cd app/ingest && TEST_DATABASE_URL=… TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run` (existing ingest suites still green).

- [ ] **Step 8: Commit**

```bash
git add app/core/src/domain.ts app/db/src app/ingest/test/queries.test.ts
git commit -m "feat: add @revelio/db read queries (getCardById/listSets/getSetByCode)"
```

---

### Task 2: `/card/[id]` detail page

**Files:**
- Create: `app/web/src/lib/db.ts`, `app/web/src/lib/card-view.ts`, `app/web/src/components/card-detail.tsx`, `app/web/src/app/[locale]/card/[id]/page.tsx`
- Modify: `app/web/src/components/card-tile.tsx` (wrap in Link), `app/web/messages/{en,de}.json` (`card` namespace)
- Test: `app/web/src/lib/__tests__/card-view.test.ts`, `app/web/src/components/__tests__/card-detail.test.tsx`

**Interfaces:**
- Consumes: `getCardById` (`@revelio/db`), `CardDetailDTO`/`CardLocalizationDTO` (`@revelio/core`), `imageKey`/`imageUrl`/`LESSONS` (`@revelio/core`), `attrLabel` (`@/lib/attribute-labels`), next-intl `Link`.
- Produces: `getDb(): DB`; `pickLocalization(card, locale): { loc: CardLocalizationDTO; isFallback: boolean }`; `<CardDetail card locale imageBase />`.

- [ ] **Step 1: Server-only db singleton**

`app/web/src/lib/db.ts`:
```ts
import 'server-only'
import { createClient, type DB } from '@revelio/db'

let cached: DB | null = null

// One pooled client per server process (avoids a new connection per request).
export function getDb(): DB {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  cached = createClient(url).db
  return cached
}
```

- [ ] **Step 2: Localization picker (pure) + failing test**

`app/web/src/lib/__tests__/card-view.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickLocalization } from '../card-view'
import type { CardDetailDTO } from '@revelio/core'

const base = {
  en: { lang: 'en', name: 'Fluffy', status: 'official', source: null, text: 'EN', flavorText: null, imageFile: null, imageUrl: null },
  de: { lang: 'de', name: 'Fluffy', status: 'machine', source: null, text: 'DE', flavorText: null, imageFile: null, imageUrl: null },
}
const card = (locs: object, def = 'en') => ({ defaultLanguage: def, localizations: locs } as unknown as CardDetailDTO)

describe('pickLocalization', () => {
  it('returns the requested locale when present', () => {
    const { loc, isFallback } = pickLocalization(card(base), 'de')
    expect(loc.text).toBe('DE')
    expect(isFallback).toBe(false)
  })
  it('falls back to defaultLanguage when the locale is missing', () => {
    const { loc, isFallback } = pickLocalization(card({ en: base.en }), 'de')
    expect(loc.text).toBe('EN')
    expect(isFallback).toBe(true)
  })
})
```

`app/web/src/lib/card-view.ts`:
```ts
import type { CardDetailDTO, CardLocalizationDTO } from '@revelio/core'

export function pickLocalization(
  card: CardDetailDTO, locale: string,
): { loc: CardLocalizationDTO; isFallback: boolean } {
  const requested = card.localizations[locale]
  if (requested) return { loc: requested, isFallback: false }
  return { loc: card.localizations[card.defaultLanguage], isFallback: true }
}
```
Run: `cd app/web && npx vitest run card-view` → RED then GREEN (2 tests).

- [ ] **Step 3: The presentational detail component + failing test**

`app/web/src/components/__tests__/card-detail.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardDetail } from '../card-detail'
import type { CardDetailDTO } from '@revelio/core'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

const card: CardDetailDTO = {
  id: 'bs-1-fluffy', setCode: 'BS', number: '1', name: 'Fluffy', types: ['creature'], subTypes: ['beast'],
  lesson: 'charms', cost: 3, rarity: 'rare', finish: null, legality: 'legal', artist: ['An Artist'],
  health: 5, damagePerTurn: 2, orientation: 'vertical', defaultLanguage: 'en',
  localizations: {
    en: { lang: 'en', name: 'Fluffy', status: 'official', source: null, text: 'Guards it.', flavorText: 'Woof.', imageFile: null, imageUrl: null },
    de: { lang: 'de', name: 'Fluffy', status: 'machine', source: null, text: 'Bewacht.', flavorText: null, imageFile: null, imageUrl: null },
  },
  rulings: [{ seq: 1, date: '2001-06-01', source: 'FAQ', text: { en: 'Sleeps to music.' } }],
  set: { code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 1, symbol: 'BS' },
}

describe('CardDetail', () => {
  it('renders the localized card with rules text, rulings and artist', () => {
    render(<CardDetail card={card} locale="en" imageBase="http://img" />)
    expect(screen.getByRole('heading', { name: 'Fluffy' })).toBeInTheDocument()
    expect(screen.getByText('Guards it.')).toBeInTheDocument()
    expect(screen.getByText(/Sleeps to music\./)).toBeInTheDocument()
    expect(screen.getByText(/An Artist/)).toBeInTheDocument()
    expect(screen.queryByTestId('machine-badge')).toBeNull()
  })
  it('shows the machine-translation badge for a machine localization', () => {
    render(<CardDetail card={card} locale="de" imageBase="http://img" />)
    expect(screen.getByTestId('machine-badge')).toBeInTheDocument()
    expect(screen.getByText('Bewacht.')).toBeInTheDocument()
  })
})
```

`app/web/src/components/card-detail.tsx` (Server Component; uses next-intl `useTranslations`):
```tsx
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { CardDetailDTO } from '@revelio/core'
import { imageKey, imageUrl, LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { pickLocalization } from '@/lib/card-view'

export function CardDetail({
  card, locale, imageBase,
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
}) {
  const t = useTranslations('card')
  const { loc } = pickLocalization(card, locale)
  const lessonColor = LESSONS.find((l) => l.code === card.lesson)?.color ?? undefined
  const rulingText = (r: { text: Record<string, string> }) => r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0] ?? ''

  return (
    <article className="mx-auto grid max-w-5xl gap-8 px-6 py-8 md:grid-cols-[minmax(0,340px)_1fr]">
      <div className="relative aspect-[5/7] overflow-hidden rounded-xl border border-border/60 bg-card">
        <Image src={imageUrl(imageBase, imageKey(card.id))} alt={loc.name} fill sizes="340px" className="object-cover" priority />
      </div>
      <div>
        <h1 className="text-3xl font-semibold text-primary">{loc.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {card.set.name} · {t('number', { number: card.number })}
          {card.rarity ? ` · ${attrLabel('rarities', card.rarity, locale)}` : ''}
        </p>

        {loc.status === 'machine' && (
          <p data-testid="machine-badge" className="mt-3 inline-block rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs text-accent">
            {t('machineTranslation')}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {card.lesson && (
            <span className="rounded-full border px-3 py-1" style={{ borderColor: lessonColor, color: lessonColor }}>
              {attrLabel('lessons', card.lesson, locale)}
            </span>
          )}
          {card.types.map((ty) => (
            <span key={ty} className="rounded-full border border-border px-3 py-1 text-muted-foreground">{attrLabel('types', ty, locale)}</span>
          ))}
          {card.cost != null && <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">{t('cost', { cost: card.cost })}</span>}
        </div>

        {loc.text && <p className="mt-6 whitespace-pre-line leading-relaxed">{loc.text}</p>}
        {loc.flavorText && <p className="mt-4 border-l-2 border-border pl-4 italic text-muted-foreground">{loc.flavorText}</p>}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {card.health != null && (<><dt className="text-muted-foreground">{t('health')}</dt><dd>{card.health}</dd></>)}
          {card.damagePerTurn != null && (<><dt className="text-muted-foreground">{t('damage')}</dt><dd>{card.damagePerTurn}</dd></>)}
          {card.legality && (<><dt className="text-muted-foreground">{t('legality')}</dt><dd>{attrLabel('finishes', card.legality, locale) || card.legality}</dd></>)}
          {card.artist.length > 0 && (<><dt className="text-muted-foreground">{t('artist')}</dt><dd>{card.artist.join(', ')}</dd></>)}
        </dl>

        {card.rulings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t('rulings')}</h2>
            <ul className="mt-2 space-y-2">
              {card.rulings.map((r) => (
                <li key={r.seq} className="text-sm">
                  <span className="text-muted-foreground">{r.date ? `${r.date} — ` : ''}</span>{rulingText(r)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  )
}
```
Run: `cd app/web && npx vitest run card-detail` → RED then GREEN (after adding the `card` messages in Step 4).

- [ ] **Step 4: Add the `card` messages**

Add a `card` namespace to `app/web/messages/en.json`:
```json
"card": { "number": "No. {number}", "cost": "Cost {cost}", "machineTranslation": "Machine translation", "health": "Health", "damage": "Damage/turn", "legality": "Legality", "artist": "Illustrated by", "rulings": "Rulings" }
```
`de.json`:
```json
"card": { "number": "Nr. {number}", "cost": "Kosten {cost}", "machineTranslation": "Maschinelle Übersetzung", "health": "Gesundheit", "damage": "Schaden/Zug", "legality": "Legalität", "artist": "Illustriert von", "rulings": "Regelungen" }
```

- [ ] **Step 5: The page + Metadata API**

`app/web/src/app/[locale]/card/[id]/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { imageKey, imageUrl } from '@revelio/core'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { getCardById } from '@revelio/db'
import { pickLocalization } from '@/lib/card-view'
import { CardDetail } from '@/components/card-detail'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  const card = await getCardById(getDb(), id)
  if (!card) return {}
  const { loc } = pickLocalization(card, locale)
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: `/card/${id}`, locale: l })}`]),
  )
  return {
    title: `${loc.name} · Revelio`,
    description: loc.text ?? undefined,
    alternates: { canonical: `${BASE_URL}${getPathname({ href: `/card/${id}`, locale })}`, languages },
    openGraph: { images: IMAGE_BASE ? [imageUrl(IMAGE_BASE, imageKey(id))] : [] },
  }
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const card = await getCardById(getDb(), id)
  if (!card) notFound()
  return <CardDetail card={card} locale={locale} imageBase={IMAGE_BASE} />
}
```

- [ ] **Step 6: Link search/set tiles to the detail page**

Edit `app/web/src/components/card-tile.tsx` — wrap the figure in the next-intl `Link`:
```tsx
import Image from 'next/image'
import { Link } from '@/../i18n/navigation'
import type { SearchDocument } from '@revelio/search'
import { imageUrl, thumbKey } from '@revelio/core'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <Link href={`/card/${hit.id}`} className="block">
      <figure className="group overflow-hidden rounded-lg border border-border/60 bg-card">
        <div className="relative aspect-[5/7] bg-muted">
          {hit.imageFile ? (
            <Image src={imageUrl(imageBase, thumbKey(hit.id))} alt={hit.name} fill sizes="(max-width: 640px) 45vw, 200px" className="object-cover transition group-hover:brightness-110" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{hit.name}</div>
          )}
        </div>
        <figcaption className="truncate px-2 py-1 text-sm">{hit.name}</figcaption>
      </figure>
    </Link>
  )
}
```
(The existing `card-grid.test.tsx` still passes — `Link` is next-intl's; if the test environment needs it, it already mocks `@/../i18n/navigation` elsewhere; if `card-grid.test` fails to resolve `Link`, add `vi.mock('@/../i18n/navigation', () => ({ Link: (p:any) => <a href={p.href}>{p.children}</a> }))` to that test.)

- [ ] **Step 7: Run tests + build**

Run: `cd app/web && npx vitest run card-view card-detail card-grid` (all pass), then `npx next build` (succeeds; `/[locale]/card/[id]` is a dynamic route).

- [ ] **Step 8: Commit**

```bash
git add app/web/src/lib/db.ts app/web/src/lib/card-view.ts app/web/src/lib/__tests__/card-view.test.ts app/web/src/components/card-detail.tsx app/web/src/components/__tests__/card-detail.test.tsx app/web/src/components/card-tile.tsx "app/web/src/app/[locale]/card" app/web/messages
git commit -m "feat: card detail page (/card/[id]) from Postgres with rulings and i18n"
```

---

### Task 3: `/sets` index + `/sets/[code]` page

**Files:**
- Create: `app/web/src/components/set-card.tsx`, `app/web/src/app/[locale]/sets/page.tsx`, `app/web/src/app/[locale]/sets/[code]/page.tsx`
- Modify: `app/web/messages/{en,de}.json` (`sets` namespace)
- Test: `app/web/src/components/__tests__/set-card.test.tsx`

**Interfaces:**
- Consumes: `listSets`/`getSetByCode` (`@revelio/db`), `getDb` (`@/lib/db`), `searchCards`/`getSearchClient`/`runSearch` (`@revelio/search` + `@/lib/search-client`), `symbolKey`/`imageUrl` (`@revelio/core`), `CardGrid`/`Pagination`, next-intl `Link`.
- Produces: `<SetCard set imageBase />`; the two set pages.

- [ ] **Step 1: The set tile + failing test**

`app/web/src/components/__tests__/set-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SetCard } from '../set-card'
import type { SetDTO } from '@revelio/core'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

const set: SetDTO = { code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 116, symbol: 'BS' }

describe('SetCard', () => {
  it('renders the set name, count and a link to the set page', () => {
    render(<SetCard set={set} imageBase="http://img" />)
    expect(screen.getByText('Base Set')).toBeInTheDocument()
    expect(screen.getByText(/116/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sets/BS')
  })
})
```

`app/web/src/components/set-card.tsx`:
```tsx
import Image from 'next/image'
import { Link } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { symbolKey, imageUrl } from '@revelio/core'

export function SetCard({ set, imageBase }: { set: SetDTO; imageBase: string }) {
  return (
    <Link href={`/sets/${set.code}`} className="flex items-center gap-4 rounded-lg border border-border/60 bg-card p-4 transition hover:border-primary/60">
      {set.symbol && imageBase ? (
        <Image src={imageUrl(imageBase, symbolKey(set.code))} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">{set.code}</span>
      )}
      <span className="flex-1">
        <span className="block font-medium">{set.name}</span>
        <span className="block text-sm text-muted-foreground">
          {set.cardCount} · {set.releaseDate ?? '—'}{set.isOfficial ? '' : ' · Fan'}
        </span>
      </span>
    </Link>
  )
}
```
Run: `cd app/web && npx vitest run set-card` → RED then GREEN.

- [ ] **Step 2: The `/sets` index page**

`app/web/src/app/[locale]/sets/page.tsx`:
```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { SetCard } from '@/components/set-card'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function SetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sets')
  const sets = await listSets(getDb())
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sets.map((set) => (
          <li key={set.code}><SetCard set={set} imageBase={IMAGE_BASE} /></li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: The `/sets/[code]` page (header + card grid via Meili)**

`app/web/src/app/[locale]/sets/[code]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toURLSearchParams } from '@/lib/search-params'
import { CardGrid } from '@/components/card-grid'
import { Pagination } from '@/components/pagination'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function SetPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetByCode(getDb(), code)
  if (!set) notFound()
  const t = await getTranslations('sets')

  const current = toURLSearchParams(await searchParams)
  const state = { ...parseSearchParams(current), types: [], lessons: [], official: null, sort: 'number' as const }
  // Constrain the search to this set, ignore free-text/filters, keep paging.
  const results = await runSearch(getSearchClient(), locale, { ...state, q: '' })
  // Note: runSearch has no setCode input yet — see Step 4 (extend toSearchOptions).

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-primary">{set.name}</h1>
        <p className="text-sm text-muted-foreground">{t('meta', { count: set.cardCount, date: set.releaseDate ?? '—' })}</p>
      </header>
      <CardGrid hits={results.hits} imageBase={IMAGE_BASE} />
      <Pagination page={results.page} total={results.total} hitsPerPage={results.hitsPerPage} current={current} />
    </main>
  )
}
```

- [ ] **Step 4: Add a `setCode` input to the search options mapping**

The set page needs `searchCards` constrained by `setCode`. Extend the search-state mapping (`app/web/src/lib/search-params.ts`): add an optional `set?: string` to `SearchState`, parse `set` in `parseSearchParams` (`set: sp.get('set') ?? undefined`), and in `toSearchOptions` set `filters.setCode = state.set` when present. Then in the set page (Step 3) build the state with `set: code` instead of the note:
```ts
const state = { q: '', types: [], lessons: [], set: code, official: null, sort: 'number' as const, page: parseSearchParams(current).page }
const results = await runSearch(getSearchClient(), locale, state)
```
Add to `search-params.test.ts` a case: `parseSearchParams(new URLSearchParams('set=BS')).set === 'BS'` and `toSearchOptions({...,set:'BS'}).options.filters.setCode === 'BS'`. Run `cd app/web && npx vitest run search-params` (green).

- [ ] **Step 5: Add the `sets` messages**

`app/web/messages/en.json`: `"sets": { "title": "Sets", "meta": "{count} cards · released {date}" }`
`de.json`: `"sets": { "title": "Editionen", "meta": "{count} Karten · erschienen {date}" }`

- [ ] **Step 6: Run tests + build**

Run: `cd app/web && npx vitest run set-card search-params` (green), then `npx next build` (succeeds; `/[locale]/sets` and `/[locale]/sets/[code]` present).

- [ ] **Step 7: Commit**

```bash
git add "app/web/src/app/[locale]/sets" app/web/src/components/set-card.tsx app/web/src/components/__tests__/set-card.test.tsx app/web/src/lib/search-params.ts app/web/src/lib/__tests__/search-params.test.ts app/web/messages
git commit -m "feat: set index (/sets) and set page (/sets/[code])"
```

---

### Task 4: Navigation link + Playwright e2e

**Files:**
- Modify: `app/web/src/components/site-header.tsx` (add a "Sets" link), `app/web/messages/{en,de}.json` (`nav.sets`)
- Create: `app/web/e2e/detail.spec.ts`

**Interfaces:**
- Consumes: next-intl `Link`; the running app.
- Produces: a header "Sets" link; a resilient detail/sets e2e.

- [ ] **Step 1: Header "Sets" link**

In `app/web/src/components/site-header.tsx`, add a `Link` (next-intl) to `/sets` labelled `t('sets')` (server component; use `getTranslations('nav')` or the existing translation hook already in the header). Add `"sets": "Sets"` (en) / `"sets": "Editionen"` (de) to the `nav` namespace in both message files.

- [ ] **Step 2: Resilient Playwright e2e**

`app/web/e2e/detail.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('search result links to a card detail page', async ({ page }) => {
  await page.goto('/search?q=harry')
  const firstTile = page.getByRole('figure').first()
  if (!(await firstTile.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  await firstTile.locator('..').click() // the tile is wrapped in a link
  await expect(page).toHaveURL(/\/card\//)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('sets index links to a set page', async ({ page }) => {
  await page.goto('/sets')
  const firstSet = page.getByRole('link').filter({ hasText: /.+/ }).first()
  if (!(await firstSet.isVisible().catch(() => false))) {
    test.skip(true, 'DB not seeded — run with a seeded stack to verify fully')
  }
  await firstSet.click()
  await expect(page).toHaveURL(/\/sets\/[A-Z0-9]+/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
```

- [ ] **Step 3: Run vitest + build + shell e2e**

Run: `cd app/web && npx vitest run` (all green), `npx next build` (succeeds), `npx playwright test shell` (existing shell e2e still green).

- [ ] **Step 4: Commit**

```bash
git add app/web/src/components/site-header.tsx app/web/messages app/web/e2e/detail.spec.ts
git commit -m "feat: header Sets link and card/set e2e"
```

---

## Self-Review

**Spec coverage (Card detail + set overview section):**
- Read-query layer in `@revelio/db` (`getCardById`/`listSets`/`getSetByCode`) → Task 1 ✓
- Extensionless conversion of `@revelio/db` → Task 1 Step 2 ✓
- Core `CardDetailDTO`/`RulingDTO` → Task 1 Step 1 ✓
- Web server-only db client → Task 2 Step 1 ✓
- `/card/[id]` with image, fields, rulings, localized + translation badge, `notFound`, Metadata API → Task 2 ✓
- `/sets` index grid → Task 3 Steps 1-2 ✓
- `/sets/[code]` header (Postgres) + card grid (Meili `setCode`, reuse CardGrid/Pagination), `notFound` → Task 3 Steps 3-4 ✓
- `CardTile` links to `/card/[id]` → Task 2 Step 6 ✓
- Env `DATABASE_URL` → Task 2 Step 1 (thrown if missing) ✓
- Deferred `adventure`/`match`/`provides`/`draftValue` → not built ✓

**Placeholder scan:** No TBD/TODO. Task 3 Step 3 contains a deliberate forward-reference note that Step 4 resolves (the `setCode` mapping) — Step 4 gives the exact replacement code, so no placeholder ships.

**Type consistency:** `CardDetailDTO`/`RulingDTO`/`SetDTO`/`CardLocalizationDTO` (core) flow from Task 1 → queries → pages/components. `getCardById(db,id)`, `listSets(db)`, `getSetByCode(db,code)` signatures identical across tasks. `pickLocalization(card, locale)` (Task 2) reused by the page's metadata. `SearchState` gains `set?: string` (Task 3 Step 4) consumed by `toSearchOptions`. `getDb()` returns the `DB` type from `@revelio/db`.

## Notes for later plans
- **4b (authoring + auth):** editing card localizations/rulings writes back to Postgres (the `origin: user` axis + `updated_at`); re-index Meili on change.
- **Advanced Search slice:** the `set` URL param added here (Task 3 Step 4) is the same one the advanced-search set filter will drive.
- **Plan 5:** `DATABASE_URL` must reach the web at runtime (server); the per-request singleton client is fine for a single instance — revisit pooling for multi-instance/serverless.

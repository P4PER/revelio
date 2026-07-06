# Admin Section + Sub-type Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give data-driven `sub_types` DB-stored, editor-editable per-locale translations rendered with a `humanize()` fallback, behind the project's first editor-gated admin section.

**Architecture:** A normalized `sub_type_translations` table (`@revelio/db`) with read/write query fns; a cached web loader feeding `card-detail` (translation → `humanize` fallback); a `'use server'` action mirroring `rulings-actions.ts`; and an `/admin` section (editor-gated layout + index + sub-types editor form) with a role-gated header link. No Meilisearch reindex; ingest unchanged.

**Tech Stack:** TypeScript, Drizzle ORM + Postgres (drizzle-kit migrations), Next.js App Router + next-intl, Better Auth roles, Vitest + Testcontainers.

## Global Constraints

- All app commands run from `app/`. CI uses `working-directory: app`.
- **Conventional Commits** for every commit.
- Migrations incremental/append-only: edit `db/src/schema.ts`, then `npm run generate` from `app/db`; never edit `0000`–`0002` or delete `drizzle/`. Next migration is `0003_*.sql`. **Commit the generated migration before running `npm run verify -w @revelio/db`** — `verify` runs `git clean -f -- drizzle` and deletes an uncommitted new migration. `verify` + `check -w @revelio/db` must pass.
- Roles: `user(0) < editor(1) < admin(2)`. This feature gates on **`editor`** (`requireRole('editor')` in actions; `getSession()` + `hasRequiredRole(role,'editor')` + `notFound()` in pages).
- Routing locales are exactly `['en','de']`; catalog default `en`.
- DB query fns live in `db/src/queries.ts`, exported from `db/src/index.ts`, and are tested from the **ingest** workspace via `withMigratedDb` (`ingest/test/`). There is no `db` test script.
- Web write actions follow `web/src/lib/*-actions.ts`: `'use server'` + `requireRole` + zod + `getDb()` + a `@revelio/db` fn + `revalidate*`. The web workspace is linted (`npm run lint -w web`).

## File Structure

- `db/src/schema.ts` — add `subTypeTranslations` table.
- `db/drizzle/0003_*.sql` (+ `meta/`) — generated migration.
- `db/src/queries.ts` — `getSubTypeLabels`, `listSubTypesWithTranslations`, `saveSubTypeTranslations`.
- `db/src/index.ts` — export the table + fns.
- `ingest/test/subtype-translations.test.ts` — query-fn tests.
- `web/src/lib/humanize.ts` — shared `humanize` (extracted from `card-detail.tsx`).
- `web/src/lib/subtype-labels.ts` — cached `getSubTypeLabelMap(locale)`.
- `web/src/components/card-detail.tsx` — read path with fallback.
- `web/src/app/[locale]/card/[id]/page.tsx` — fetch label map, pass prop.
- `web/src/lib/sub-type-actions.ts` — server action.
- `web/src/lib/__tests__/sub-type-actions.test.ts` — action test.
- `web/src/app/[locale]/admin/layout.tsx` — editor gate.
- `web/src/app/[locale]/admin/page.tsx` — admin index.
- `web/src/app/[locale]/admin/sub-types/page.tsx` — sub-types editor page.
- `web/src/components/subtype-translations-form.tsx` — client form.
- `web/src/components/__tests__/subtype-translations-form.test.tsx` — form test.
- `web/src/components/site-header.tsx` — role-gated Admin link.
- `web/messages/{en,de}.json` — `nav.admin` + `admin` namespace.

---

### Task 1: `sub_type_translations` table + migration

**Files:**
- Modify: `app/db/src/schema.ts`
- Create: `app/db/drizzle/0003_*.sql` (generated)

**Interfaces:**
- Produces: table `sub_type_translations` — columns `sub_type_code` (FK → `sub_types.code`, cascade), `lang`, `label` (notNull), PK `(sub_type_code, lang)`.

- [ ] **Step 1: Add the table to `schema.ts`**

Insert after the `legalities` table (end of the reference-tables block) in `app/db/src/schema.ts`:

```ts
export const subTypeTranslations = pgTable('sub_type_translations', {
  subTypeCode: text('sub_type_code').notNull().references(() => subTypes.code, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  label: text('label').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.subTypeCode, t.lang] }),
}))
```

(`pgTable`, `text`, `primaryKey` are already imported.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate` (from `app/`)
Expected: creates `app/db/drizzle/0003_*.sql` with a single `CREATE TABLE "sub_type_translations"` (two text PK columns, a notNull `label`, and an FK to `sub_types`).

- [ ] **Step 3: Review the generated SQL**

Run: `cat app/db/drizzle/0003_*.sql`
Confirm: only `CREATE TABLE "sub_type_translations"` + its FK constraint; no other table touched; `0000`–`0002` unchanged.

- [ ] **Step 4: Commit (before verify — verify git-cleans uncommitted migrations)**

```bash
git add app/db/src/schema.ts app/db/drizzle/
git commit -m "feat(db): add sub_type_translations table"
```

- [ ] **Step 5: Verify schema/migration consistency**

Run: `npm run check -w @revelio/db && npm run verify -w @revelio/db`
Expected: both pass (`✓ migrations are in sync with schema.ts`).

---

### Task 2: DB query fns for sub-type translations

**Files:**
- Modify: `app/db/src/queries.ts`
- Modify: `app/db/src/index.ts`
- Test: `app/ingest/test/subtype-translations.test.ts`

**Interfaces:**
- Consumes: `subTypeTranslations`, `subTypes` tables (Task 1).
- Produces:
  - `getSubTypeLabels(db: DB, lang: string): Promise<Record<string,string>>` — `code → label` for one language.
  - `listSubTypesWithTranslations(db: DB): Promise<{ code: string; labels: Record<string,string> }[]>` — every sub-type code (alphabetical) with its per-lang labels (`{}` when none).
  - `saveSubTypeTranslations(db: DB, rows: { code: string; lang: string; label: string }[]): Promise<void>` — upsert per `(code,lang)`; blank/whitespace label deletes that row; runs in one transaction.

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/subtype-translations.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { subTypes, getSubTypeLabels, listSubTypesWithTranslations, saveSubTypeTranslations } from '@revelio/db'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(subTypes).values([{ code: 'wizard' }, { code: 'death_eater' }, { code: 'gryffindor' }])
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('sub-type translation queries', () => {
  it('saves and reads labels per language', async () => {
    await saveSubTypeTranslations(ctx.db, [
      { code: 'wizard', lang: 'de', label: 'Zauberer' },
      { code: 'death_eater', lang: 'de', label: 'Todesser' },
    ])
    expect(await getSubTypeLabels(ctx.db, 'de')).toEqual({ wizard: 'Zauberer', death_eater: 'Todesser' })
    expect(await getSubTypeLabels(ctx.db, 'en')).toEqual({})
  })

  it('upserts an existing label', async () => {
    await saveSubTypeTranslations(ctx.db, [{ code: 'wizard', lang: 'de', label: 'Magier' }])
    expect((await getSubTypeLabels(ctx.db, 'de')).wizard).toBe('Magier')
  })

  it('deletes on a blank label', async () => {
    await saveSubTypeTranslations(ctx.db, [{ code: 'death_eater', lang: 'de', label: '  ' }])
    expect('death_eater' in (await getSubTypeLabels(ctx.db, 'de'))).toBe(false)
  })

  it('lists every sub-type alphabetically with its labels', async () => {
    const rows = await listSubTypesWithTranslations(ctx.db)
    expect(rows.map((r) => r.code)).toEqual(['death_eater', 'gryffindor', 'wizard'])
    expect(rows.find((r) => r.code === 'wizard')?.labels).toEqual({ de: 'Magier' })
    expect(rows.find((r) => r.code === 'gryffindor')?.labels).toEqual({})
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/ingest -- subtype-translations`
Expected: FAIL — the three functions are not exported yet.

- [ ] **Step 3: Add the query fns to `queries.ts`**

Append to `app/db/src/queries.ts` (imports `eq`, `asc`, `and` already present; add `subTypeTranslations`, `subTypes` to the existing `from './schema'` import):

```ts
export async function getSubTypeLabels(db: DB, lang: string): Promise<Record<string, string>> {
  const rows = await db.select().from(subTypeTranslations).where(eq(subTypeTranslations.lang, lang))
  return Object.fromEntries(rows.map((r) => [r.subTypeCode, r.label]))
}

export async function listSubTypesWithTranslations(
  db: DB,
): Promise<{ code: string; labels: Record<string, string> }[]> {
  const codes = await db.select().from(subTypes).orderBy(asc(subTypes.code))
  const trans = await db.select().from(subTypeTranslations)
  const byCode = new Map<string, Record<string, string>>()
  for (const t of trans) {
    const m = byCode.get(t.subTypeCode) ?? {}
    m[t.lang] = t.label
    byCode.set(t.subTypeCode, m)
  }
  return codes.map((c) => ({ code: c.code, labels: byCode.get(c.code) ?? {} }))
}

export async function saveSubTypeTranslations(
  db: DB,
  rows: { code: string; lang: string; label: string }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      if (r.label.trim() === '') {
        await tx.delete(subTypeTranslations).where(
          and(eq(subTypeTranslations.subTypeCode, r.code), eq(subTypeTranslations.lang, r.lang)),
        )
      } else {
        await tx.insert(subTypeTranslations)
          .values({ subTypeCode: r.code, lang: r.lang, label: r.label })
          .onConflictDoUpdate({
            target: [subTypeTranslations.subTypeCode, subTypeTranslations.lang],
            set: { label: r.label },
          })
      }
    }
  })
}
```

Update the schema import line in `queries.ts` to include the two tables, e.g.:
`import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingTexts, subTypes, subTypeTranslations } from './schema'`

- [ ] **Step 4: Export from `index.ts`**

In `app/db/src/index.ts`: add `subTypeTranslations` to the schema re-export list, and add the three fns to the `export { … } from './queries'` line:
`getSubTypeLabels, listSubTypesWithTranslations, saveSubTypeTranslations`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w @revelio/ingest -- subtype-translations`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/subtype-translations.test.ts
git commit -m "feat(db): sub-type translation read/write query fns"
```

---

### Task 3: Read path — cached loader + card-detail fallback

**Files:**
- Create: `app/web/src/lib/humanize.ts`
- Create: `app/web/src/lib/subtype-labels.ts`
- Modify: `app/web/src/components/card-detail.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/page.tsx`
- Test: `app/web/src/components/__tests__/card-detail.test.tsx` (add a case)

**Interfaces:**
- Consumes: `getSubTypeLabels` (Task 2).
- Produces: `humanize(code: string): string`; `getSubTypeLabelMap(locale: string): Promise<Record<string,string>>` (cached, tag `sub-type-labels`); `CardDetail` gains optional prop `subTypeLabels?: Record<string,string>` (default `{}`).

- [ ] **Step 1: Create the shared `humanize` helper**

Create `app/web/src/lib/humanize.ts`:

```ts
// Slug → Title Case fallback for codes with no translation (death_eater -> Death Eater).
export const humanize = (code: string): string =>
  code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
```

- [ ] **Step 2: Create the cached label-map loader**

Create `app/web/src/lib/subtype-labels.ts`:

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { getDb } from '@/lib/db'
import { getSubTypeLabels } from '@revelio/db'

// Sub-type translations change rarely; cache per locale under a shared tag the
// save action revalidates. Returns code -> label for the given locale.
export function getSubTypeLabelMap(locale: string): Promise<Record<string, string>> {
  return unstable_cache(
    () => getSubTypeLabels(getDb(), locale),
    ['sub-type-labels', locale],
    { tags: ['sub-type-labels'] },
  )()
}
```

- [ ] **Step 3: Add the failing card-detail test case**

In `app/web/src/components/__tests__/card-detail.test.tsx`, add a test that renders `CardDetail` with a card having `subTypes: ['wizard', 'death_eater']` and `subTypeLabels={{ wizard: 'Zauberer' }}`, asserting the output contains `Zauberer` (translated) and `Death Eater` (humanized fallback). Reuse the file's existing card fixture/render helper; pass `subTypeLabels` alongside the existing props.

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -w web -- card-detail`
Expected: FAIL — `CardDetail` doesn't accept `subTypeLabels` / still humanizes everything.

- [ ] **Step 5: Wire the fallback into `card-detail.tsx`**

In `app/web/src/components/card-detail.tsx`:
- Delete the local `humanize` const (around line 15) and its comment; add `import { humanize } from '@/lib/humanize'`.
- Add `subTypeLabels = {}` to the destructured props and its type:

```tsx
export function CardDetail({
  card, locale, imageBase, canEdit = false, subTypeLabels = {},
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
  canEdit?: boolean
  subTypeLabels?: Record<string, string>
}) {
```

- Change the sub-types render to prefer the translation:

```tsx
                {card.subTypes.map((st) => subTypeLabels[st] ?? humanize(st)).join(', ')}
```

- [ ] **Step 6: Pass the map from the card page**

In `app/web/src/app/[locale]/card/[id]/page.tsx`:
- Add `import { getSubTypeLabelMap } from '@/lib/subtype-labels'`.
- Before the return, add `const subTypeLabels = await getSubTypeLabelMap(locale)`.
- Pass it to the component: `return <CardDetail card={card} locale={locale} imageBase={IMAGE_BASE} canEdit={canEdit} subTypeLabels={subTypeLabels} />`.

- [ ] **Step 7: Run tests + lint + typecheck**

Run: `npm test -w web -- card-detail && npm run typecheck -w web && npm run lint -w web`
Expected: card-detail tests PASS; no type errors; 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add app/web/src/lib/humanize.ts app/web/src/lib/subtype-labels.ts \
  app/web/src/components/card-detail.tsx app/web/src/app/[locale]/card/[id]/page.tsx \
  app/web/src/components/__tests__/card-detail.test.tsx
git commit -m "feat(web): render sub-type translations with humanize fallback"
```

---

### Task 4: Server action

**Files:**
- Create: `app/web/src/lib/sub-type-actions.ts`
- Test: `app/web/src/lib/__tests__/sub-type-actions.test.ts`

**Interfaces:**
- Consumes: `saveSubTypeTranslations` (Task 2), `requireRole`, `getDb`, `routing`.
- Produces: `saveSubTypeTranslationsAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }>` — editor-gated; validates `rows[].{code,lang∈locales,label}`; calls `saveSubTypeTranslations`; `revalidateTag('sub-type-labels')`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/sub-type-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  saveSubTypeTranslations: vi.fn(async () => {}),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ saveSubTypeTranslations: m.saveSubTypeTranslations }))
vi.mock('next/cache', () => ({ revalidateTag: m.revalidateTag }))

import { saveSubTypeTranslationsAction } from '../sub-type-actions'

const valid = { rows: [{ code: 'wizard', lang: 'de', label: 'Zauberer' }] }

beforeEach(() => {
  m.requireRole.mockReset(); m.saveSubTypeTranslations.mockReset(); m.revalidateTag.mockReset()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
})

describe('saveSubTypeTranslationsAction', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await saveSubTypeTranslationsAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.saveSubTypeTranslations).not.toHaveBeenCalled()
  })

  it('returns invalid on a bad lang and does not write', async () => {
    const res = await saveSubTypeTranslationsAction({ rows: [{ code: 'x', lang: 'fr', label: 'y' }] })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveSubTypeTranslations).not.toHaveBeenCalled()
  })

  it('saves, revalidates the tag, returns ok', async () => {
    const res = await saveSubTypeTranslationsAction(valid)
    expect(m.saveSubTypeTranslations).toHaveBeenCalledWith({}, valid.rows)
    expect(m.revalidateTag).toHaveBeenCalledWith('sub-type-labels')
    expect(res).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- sub-type-actions`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the action**

Create `app/web/src/lib/sub-type-actions.ts`:

```ts
'use server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { saveSubTypeTranslations } from '@revelio/db'
import { routing } from '@/../i18n/routing'

const schema = z.object({
  rows: z.array(z.object({
    code: z.string().min(1),
    lang: z.enum(routing.locales as unknown as [string, ...string[]]),
    label: z.string(),
  })),
})

export type SubTypeSaveResult = { ok: true } | { ok: false; error: string }

export async function saveSubTypeTranslationsAction(input: unknown): Promise<SubTypeSaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  await saveSubTypeTranslations(getDb(), parsed.data.rows)
  revalidateTag('sub-type-labels')
  return { ok: true }
}
```

- [ ] **Step 4: Run the test + lint**

Run: `npm test -w web -- sub-type-actions && npm run lint -w web`
Expected: PASS (3 tests); 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/sub-type-actions.ts app/web/src/lib/__tests__/sub-type-actions.test.ts
git commit -m "feat(web): sub-type translations server action"
```

---

### Task 5: Admin section shell + header link + messages

**Files:**
- Create: `app/web/src/app/[locale]/admin/layout.tsx`
- Create: `app/web/src/app/[locale]/admin/page.tsx`
- Modify: `app/web/src/components/site-header.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Produces: an editor-gated `/[locale]/admin` route with an index linking to `/admin/sub-types`; a role-gated "Admin" header link; message keys `nav.admin` and the `admin` namespace.

- [ ] **Step 1: Add message keys**

In `app/web/messages/en.json`: add `"admin": "Admin"` inside the existing `"nav"` object, and add a new top-level `"admin"` object (keep JSON valid):

```json
"admin": {
  "title": "Admin",
  "subTypes": "Sub-types",
  "subTypesDesc": "Translate creature and character sub-types.",
  "code": "Code",
  "save": "Save",
  "saved": "Saved",
  "saveError": "Could not save"
}
```

In `app/web/messages/de.json`: add `"admin": "Admin"` inside `"nav"`, and:

```json
"admin": {
  "title": "Admin",
  "subTypes": "Unterarten",
  "subTypesDesc": "Kreatur- und Charakter-Unterarten übersetzen.",
  "code": "Code",
  "save": "Speichern",
  "saved": "Gespeichert",
  "saveError": "Speichern fehlgeschlagen"
}
```

- [ ] **Step 2: Create the editor-gated layout**

Create `app/web/src/app/[locale]/admin/layout.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()
  return <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
}
```

- [ ] **Step 3: Create the admin index page**

Create `app/web/src/app/[locale]/admin/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'

export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <Link
        href="/admin/sub-types"
        className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
      >
        <div className="font-medium">{t('subTypes')}</div>
        <div className="text-sm text-muted-foreground">{t('subTypesDesc')}</div>
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Add the role-gated header link**

In `app/web/src/components/site-header.tsx`:
- Add imports: `import { getSession } from '@/lib/session'` and `import { hasRequiredRole } from '@/lib/roles'`.
- In the component body, after `const t = await getTranslations('nav')`, add:
  `const session = await getSession()`
  `const isEditor = hasRequiredRole(session?.user?.role, 'editor')`
- In the `<nav>`, before the Sets button, add the gated link:

```tsx
          {isEditor && (
            <Button variant="ghost" size="sm" asChild><Link href="/admin">{t('admin')}</Link></Button>
          )}
```

- [ ] **Step 5: Verify JSON, typecheck, lint, build**

Run (from `app/`):
`node -e "JSON.parse(require('fs').readFileSync('web/messages/en.json'));JSON.parse(require('fs').readFileSync('web/messages/de.json'));console.log('json ok')"`
Then: `npm run typecheck -w web && npm run lint -w web`
Expected: `json ok`; no type errors; 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/app/[locale]/admin/layout.tsx app/web/src/app/[locale]/admin/page.tsx \
  app/web/src/components/site-header.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): editor-gated admin section shell + header link"
```

---

### Task 6: Sub-types translation editor (page + form)

**Files:**
- Create: `app/web/src/app/[locale]/admin/sub-types/page.tsx`
- Create: `app/web/src/components/subtype-translations-form.tsx`
- Test: `app/web/src/components/__tests__/subtype-translations-form.test.tsx`

**Interfaces:**
- Consumes: `listSubTypesWithTranslations` (Task 2), `saveSubTypeTranslationsAction` (Task 4), `routing.locales`.
- Produces: `/[locale]/admin/sub-types` editor listing every sub-type with a per-locale input and one Save.

- [ ] **Step 1: Write the failing form test**

Create `app/web/src/components/__tests__/subtype-translations-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SubTypeTranslationsForm } from '../subtype-translations-form'

vi.mock('@/lib/sub-type-actions', () => ({ saveSubTypeTranslationsAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SubTypeTranslationsForm
        locales={['en', 'de']}
        rows={[
          { code: 'death_eater', labels: { de: 'Todesser' } },
          { code: 'wizard', labels: {} },
        ]}
      />
    </NextIntlClientProvider>,
  )
}

describe('SubTypeTranslationsForm', () => {
  it('renders a row per sub-type with existing translations prefilled', () => {
    renderForm()
    expect(screen.getByText('death_eater')).toBeInTheDocument()
    expect(screen.getByText('wizard')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Todesser')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- subtype-translations-form`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the form**

Create `app/web/src/components/subtype-translations-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { saveSubTypeTranslationsAction } from '@/lib/sub-type-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Row = { code: string; labels: Record<string, string> }

export function SubTypeTranslationsForm({ locales, rows }: { locales: string[]; rows: Row[] }) {
  const t = useTranslations('admin')
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(rows.map((r) => [r.code, { ...r.labels }])),
  )
  const [busy, setBusy] = useState(false)

  function setCell(code: string, lang: string, label: string) {
    setValues((v) => ({ ...v, [code]: { ...v[code], [lang]: label } }))
  }

  async function save() {
    setBusy(true)
    const payload = rows.flatMap((r) =>
      locales.map((lang) => ({ code: r.code, lang, label: values[r.code]?.[lang] ?? '' })),
    )
    const res = await saveSubTypeTranslationsAction({ rows: payload })
    setBusy(false)
    if (res.ok) toast.success(t('saved'))
    else toast.error(t('saveError'))
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">{t('code')}</th>
              {locales.map((l) => <th key={l} className="px-3 py-2 font-medium">{l.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                {locales.map((lang) => (
                  <td key={lang} className="px-3 py-2">
                    <Input
                      value={values[r.code]?.[lang] ?? ''}
                      onChange={(e) => setCell(r.code, lang, e.target.value)}
                      aria-label={`${r.code} ${lang}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={save} disabled={busy}>{t('save')}</Button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web -- subtype-translations-form`
Expected: PASS.

- [ ] **Step 5: Create the sub-types admin page**

Create `app/web/src/app/[locale]/admin/sub-types/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { getDb } from '@/lib/db'
import { listSubTypesWithTranslations } from '@revelio/db'
import { SubTypeTranslationsForm } from '@/components/subtype-translations-form'

export default async function AdminSubTypesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  const rows = await listSubTypesWithTranslations(getDb())
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-primary">{t('subTypes')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subTypesDesc')}</p>
      <SubTypeTranslationsForm locales={[...routing.locales]} rows={rows} />
    </div>
  )
}
```

- [ ] **Step 6: Typecheck, lint, build**

Run (from `app/`): `npm run typecheck -w web && npm run lint -w web && npm run build -w web`
Expected: no type errors; 0 lint errors; build succeeds. (Build needs the `NEXT_PUBLIC_*` env vars — if unset locally, run `npm run typecheck -w web && npm run lint -w web` and note the build is CI-verified.)

- [ ] **Step 7: Commit**

```bash
git add app/web/src/app/[locale]/admin/sub-types/page.tsx \
  app/web/src/components/subtype-translations-form.tsx \
  app/web/src/components/__tests__/subtype-translations-form.test.tsx
git commit -m "feat(web): sub-types translation editor page + form"
```

---

### Task 7: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Ensure services are up** (Docker) — `docker compose up -d` from `app/`; wait for Meili health at `http://localhost:7700/health`.

- [ ] **Step 2: Run the whole suite** — `npm test` (from `app/`). Expected: all workspaces pass (core, ingest incl. the new `subtype-translations` suite, search, web incl. the new action/form/card-detail tests).

- [ ] **Step 3: Typecheck + db verify/check** — `npm run typecheck && npm run verify -w @revelio/db && npm run check -w @revelio/db`. Expected: all pass.

- [ ] **Step 4: Web lint** — `npm run lint -w web`. Expected: 0 errors.

---

## Self-Review

**Spec coverage:**
- Storage (`sub_type_translations` normalized) → Task 1.
- DB read/write fns (`getSubTypeLabels`, `listSubTypesWithTranslations`, `saveSubTypeTranslations`) → Task 2.
- Read path + `humanize` fallback + extract `humanize` → Task 3.
- Server action (editor gate, `revalidateTag('sub-type-labels')`) → Task 4.
- Admin shell (editor-gated `/admin` layout, index, role-gated header link, messages) → Task 5.
- Sub-types admin page + form (row per sub-type, prefilled, one Save) → Task 6.
- No reindex → nothing touches Meili (asserted by absence; the search index stores codes). Ingest unchanged → no ingest task.
- Tests: DB fns (Task 2), action (Task 4), read-path fallback (Task 3), form renders all rows prefilled (Task 6), full suite (Task 7).

**Placeholder scan:** No TBD/TODO; every code step shows full content; commands have expected output. The one non-literal instruction (Task 3 Step 3 reuses the existing card-detail fixture) is a deliberate reuse of a file the implementer already has open, with the exact props to add spelled out.

**Type consistency:** `saveSubTypeTranslations(db, rows: {code,lang,label}[])` used identically in Task 2 (impl), the action (Task 4), and the action test. `{ code, labels }[]` from `listSubTypesWithTranslations` (Task 2) matches the form's `Row` type and the page's `rows` prop (Task 6). `getSubTypeLabelMap(locale) → Record<string,string>` (Task 3) matches `CardDetail`'s `subTypeLabels` prop. Tag string `'sub-type-labels'` matches between the loader (Task 3) and the action (Task 4).

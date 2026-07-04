# Edit Card Images — Per-Language Upload (Plan 4b-5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors upload/remove a per-language card image (processed to WebP full + thumbnail, stored in S3/MinIO, card re-indexed), with languages that have no own image falling back to the default language's image.

**Architecture:** Make `imageKey`/`thumbKey` language-aware (default language keeps the existing `cards/{id}.webp` key — no re-seed; other languages get `cards/{id}.{lang}.webp`). Display resolves an effective language (own image → default image → none). The search document carries the resolved `imageLang`. An editor-gated server action processes the upload with `sharp`, writes to S3, sets `image_file`, and re-indexes.

**Tech Stack:** `@revelio/core` helpers, `@revelio/search` documents, Drizzle, `sharp`, `@aws-sdk/client-s3`, Next.js 16 server actions, next-intl, Vitest.

## Global Constraints

- **No re-seed:** `imageKey(id, lang?, defaultLang?)` → `cards/{id}.webp` when `lang`/`defaultLang` omitted or `lang === defaultLang`, else `cards/{id}.{lang}.webp`. `thumbKey` analogously with `cards/thumb/…`. Existing 1-arg callers keep working.
- **Fallback:** effective image lang for (locale L, default D) = L if L has an image, else D if D has one, else none. Detail computes it from the DTO; the tile reads the resolved `imageLang` from the search doc.
- **Search doc:** replace `imageFile: string | null` with `imageLang: string | null` and add `defaultLanguage: string`. The index must be **rebuilt** (re-run ingest reindex) after deploy; tests use fresh indexes.
- **Upload:** editor-gated server action, `sharp` → full WebP (quality 90, alpha preserved) + 300px-wide thumbnail WebP (quality 80); MIME `image/*`, size ≤ 5 MB; writes both S3 objects; sets `image_file(cardId, lang)` = uploaded filename (non-null = "has own image"); re-indexes all languages (non-fatal). `removeCardImage` deletes both objects, sets `image_file = null`, re-indexes.
- **OG image** intentionally keeps the default-language image (`imageKey(id)`), no change — acceptable for share previews.
- **Env (web, server-only):** `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`. Compose publishes MinIO on the host for dev.
- Env quirk: `~/.npm` is root-owned → prefix installs with `NPM_CONFIG_CACHE=/private/tmp/claude-502/-Users-timon-wegener-Desktop-revelio-cards/5736844e-b47b-4a0f-87aa-027e73f7d8a9/scratchpad/npm-cache`. Installs (`sharp`, `@aws-sdk/client-s3`) must run in the CONTROLLER, not a subagent.
- Test infra: Postgres `localhost:55432` (`revelio-testpg`), Meili `localhost:7700` key `masterKey`, MinIO `localhost:9000` (`revelio-testminio`, minioadmin/minioadmin). Web: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run`. DB/ingest: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run`.
- English identifiers; Conventional Commits.

## File Structure

```
app/core/src/images.ts              # imageKey/thumbKey lang-aware + effectiveImageLang
app/core/test/images.test.ts        # extended
app/search/src/documents.ts         # SearchDocument: imageFile -> imageLang + defaultLanguage; buildCardDocument
app/search/test/documents.test.ts   # (or wherever buildCardDocument is tested) updated
app/web/src/components/card-tile.tsx # use hit.imageLang + lang-aware thumbKey
app/web/src/components/card-detail.tsx # effectiveImageLang + lang-aware imageKey + placeholder
app/db/src/queries.ts, index.ts     # setLocalizationImage
app/web/src/lib/s3.ts               # server-only S3 write client (getS3, putObject, deleteObject)
app/web/src/lib/image-actions.ts    # uploadCardImage / removeCardImage
app/web/src/components/image-uploader.tsx # bordered image section
app/web/src/app/[locale]/card/[id]/edit/page.tsx # render <ImageUploader/>
app/web/messages/{en,de}.json       # edit image keys
app/docker-compose.yml              # publish minio on host
app/web/.env.example                # S3_* vars
tests: app/ingest/test/localization-write.test.ts (setLocalizationImage), app/web/src/lib/__tests__/image-actions.test.ts, app/web/src/components/__tests__/image-uploader.test.tsx
```

---

### Task 1: Language-aware image keys + `effectiveImageLang`

**Files:**
- Modify: `app/core/src/images.ts`
- Test: `app/core/test/images.test.ts`

**Interfaces:**
- Produces: `imageKey(id, lang?, defaultLang?)`, `thumbKey(id, lang?, defaultLang?)`, `effectiveImageLang(hasImage: (lang: string) => boolean, lang: string, defaultLang: string): string | null`.

- [ ] **Step 1: Extend the test**

Append to `app/core/test/images.test.ts` (note the existing imports use `../src/images.js`):
```ts
import { effectiveImageLang } from '../src/images.js'

describe('language-aware keys', () => {
  it('uses the shared key for the default language, a suffixed key otherwise', () => {
    expect(imageKey('x-1', 'en', 'en')).toBe('cards/x-1.webp')
    expect(imageKey('x-1', 'de', 'en')).toBe('cards/x-1.de.webp')
    expect(thumbKey('x-1', 'en', 'en')).toBe('cards/thumb/x-1.webp')
    expect(thumbKey('x-1', 'de', 'en')).toBe('cards/thumb/x-1.de.webp')
    expect(imageKey('x-1')).toBe('cards/x-1.webp') // 1-arg back-compat
  })

  it('resolves the effective image language with fallback', () => {
    const has = (set: string[]) => (l: string) => set.includes(l)
    expect(effectiveImageLang(has(['de']), 'de', 'en')).toBe('de')
    expect(effectiveImageLang(has(['en']), 'de', 'en')).toBe('en')
    expect(effectiveImageLang(has([]), 'de', 'en')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — FAIL**

Run: `cd app/core && npx vitest run images`
Expected: FAIL (`effectiveImageLang` undefined; lang-aware keys wrong).

- [ ] **Step 3: Implement in `app/core/src/images.ts`**

```ts
export function imageKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang ? `cards/${id}.${lang}.webp` : `cards/${id}.webp`
}

export function thumbKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang
    ? `cards/thumb/${id}.${lang}.webp`
    : `cards/thumb/${id}.webp`
}

export function symbolKey(code: string): string {
  return `symbols/${code}.webp`
}

export function imageUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key}`
}

// Which language's image to show for `lang`: its own if present, else the
// default language's, else none.
export function effectiveImageLang(
  hasImage: (lang: string) => boolean,
  lang: string,
  defaultLang: string,
): string | null {
  if (hasImage(lang)) return lang
  if (hasImage(defaultLang)) return defaultLang
  return null
}
```
(Keep `symbolKey`/`imageUrl` unchanged — shown for context.)

- [ ] **Step 4: Run — PASS**

Run: `cd app/core && npx vitest run images` → all pass.

- [ ] **Step 5: Commit**

```bash
git add app/core/src/images.ts app/core/test/images.test.ts
git commit -m "feat(core): language-aware imageKey/thumbKey + effectiveImageLang fallback helper"
```

---

### Task 2: Search document carries `imageLang` + `defaultLanguage`

**Files:**
- Modify: `app/search/src/documents.ts`
- Test: the file that tests `buildCardDocument` (search: `grep -rl buildCardDocument app/*/test app/search`; likely `app/search/test/documents.test.ts` or `app/ingest/test/*`)

**Interfaces:**
- Consumes: `effectiveImageLang` (`@revelio/core`).
- Produces: `SearchDocument` gains `imageLang: string | null` and `defaultLanguage: string`; the `imageFile` field is removed.

- [ ] **Step 1: Find + extend the test**

Locate the `buildCardDocument` test: `grep -rln "buildCardDocument" app/search/test app/ingest/test`. In that test, add a case (adapt the existing `CardIndexData` fixture builder it already uses):
```ts
it('resolves imageLang with fallback and carries defaultLanguage', () => {
  const base = {
    id: 'x-1', setCode: 'X', setName: 'X', number: '1', name: 'N',
    lesson: null, lessonColor: null, rarity: null, finish: null, legality: null,
    cost: null, isOfficial: true, types: [], subTypes: [], defaultLanguage: 'en',
  }
  // en has an image, de does not
  const data = { ...base, localizations: {
    en: { name: 'N', text: null, flavorText: null, imageFile: 'art.png' },
    de: { name: 'N', text: null, flavorText: null, imageFile: null },
  } }
  expect(buildCardDocument(data, 'en').imageLang).toBe('en')
  expect(buildCardDocument(data, 'de').imageLang).toBe('en') // falls back
  expect(buildCardDocument(data, 'de').defaultLanguage).toBe('en')
  const noImg = { ...base, localizations: { en: { name: 'N', text: null, flavorText: null, imageFile: null } } }
  expect(buildCardDocument(noImg, 'en').imageLang).toBeNull()
})
```
Also update any existing assertion in that file that reads `.imageFile` on a built document → `.imageLang`.

- [ ] **Step 2: Run — FAIL**

Run: `cd app/search && npx vitest run documents` (or the ingest test path). Expected: FAIL.

- [ ] **Step 3: Implement in `app/search/src/documents.ts`**

In `SearchDocument`, replace `imageFile: string | null` with:
```ts
  imageLang: string | null
  defaultLanguage: string
```
Add the import: `import { effectiveImageLang } from '@revelio/core'`. In `buildCardDocument`, replace the `imageFile: loc?.imageFile ?? null,` line with:
```ts
    imageLang: effectiveImageLang((l) => !!d.localizations[l]?.imageFile, lang, d.defaultLanguage),
    defaultLanguage: d.defaultLanguage,
```

- [ ] **Step 4: Run — PASS**

Run the search/ingest test again → pass. Then `cd app/search && npx tsc --noEmit` (or the search build) to confirm the type change compiles.

- [ ] **Step 5: Commit**

```bash
git add app/search/src/documents.ts app/search/test app/ingest/test
git commit -m "feat(search): document carries resolved imageLang + defaultLanguage (replaces imageFile)"
```

---

### Task 3: Display uses the resolved image (detail + tile)

**Files:**
- Modify: `app/web/src/components/card-tile.tsx`, `app/web/src/components/card-detail.tsx`
- Test: `app/web/src/components/__tests__/card-detail-edit.test.tsx` (or add a small tile test if one exists)

**Interfaces:**
- Consumes: `SearchDocument.imageLang`/`.defaultLanguage`; `imageKey`/`thumbKey`/`effectiveImageLang` (`@revelio/core`).

- [ ] **Step 1: Update the card tile**

`app/web/src/components/card-tile.tsx` — the import becomes `import { imageUrl, thumbKey } from '@revelio/core'`; replace the `hit.imageFile ? (...)` gate + `thumbKey(hit.id)`:
```tsx
          {hit.imageLang ? (
            <Image
              src={imageUrl(imageBase, thumbKey(hit.id, hit.imageLang, hit.defaultLanguage))}
              alt={hit.name}
              fill
              sizes="(max-width: 640px) 45vw, 200px"
              className="object-cover transition group-hover:brightness-110"
            />
          ) : (
```

- [ ] **Step 2: Update the card detail**

`app/web/src/components/card-detail.tsx` — import `effectiveImageLang` alongside `imageKey, imageUrl`. Compute the effective lang and render conditionally. Before the `return (`:
```tsx
  const imgLang = effectiveImageLang(
    (l) => !!card.localizations[l]?.imageFile,
    locale,
    card.defaultLanguage,
  )
```
Replace the `<Image src={imageUrl(imageBase, imageKey(card.id))} .../>` with a conditional:
```tsx
        {imgLang ? (
          <Image
            src={imageUrl(imageBase, imageKey(card.id, imgLang, card.defaultLanguage))}
            alt={loc.name}
            fill
            sizes="340px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {loc.name}
          </div>
        )}
```
(`card.defaultLanguage` and `card.localizations` are already on the DTO; `locale` is already a prop.)

- [ ] **Step 3: Extend a component test**

In `app/web/src/components/__tests__/card-detail-edit.test.tsx`, the `card` fixture's `localizations.en` — ensure it has `imageFile: 'art.png'` and the fixture has `defaultLanguage: 'en'`. Add:
```tsx
  it('renders the card image when the language has one', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CardDetail card={card} locale="en" imageBase="https://img.test" canEdit={false} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('img', { name: card.localizations.en.name })).toBeInTheDocument()
  })
```
(If the existing `card` fixture lacks `imageFile`/`defaultLanguage`, add them so the image renders.)

- [ ] **Step 4: Run + build**

Run: `cd app/web && npx vitest run card-detail-edit` → pass. Then `npx next build` → "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/card-tile.tsx app/web/src/components/card-detail.tsx "app/web/src/components/__tests__/card-detail-edit.test.tsx"
git commit -m "feat(web): render the resolved per-language card image (tile + detail) with fallback"
```

---

### Task 4: `setLocalizationImage` (db)

**Files:**
- Modify: `app/db/src/queries.ts`, `app/db/src/index.ts`
- Test: `app/ingest/test/localization-write.test.ts`

**Interfaces:**
- Produces: `setLocalizationImage(db, cardId, lang, imageFile: string | null): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `app/ingest/test/localization-write.test.ts` (reuses the `ctx`/`x-1` fixture):
```ts
describe('setLocalizationImage', () => {
  it('sets image_file for a language without touching other fields', async () => {
    await upsertLocalization(ctx.db, {
      cardId: 'x-1', lang: 'en', name: 'Keep', text: 'body', flavorText: null, status: 'official',
    })
    await setLocalizationImage(ctx.db, 'x-1', 'en', 'art.png')
    const rows = await ctx.db.select().from(cardLocalizations)
    const en = rows.find((r) => r.cardId === 'x-1' && r.lang === 'en')!
    expect(en.imageFile).toBe('art.png')
    expect(en.name).toBe('Keep')
    expect(en.text).toBe('body')
    expect(en.origin).toBe('user')

    await setLocalizationImage(ctx.db, 'x-1', 'en', null)
    const after = (await ctx.db.select().from(cardLocalizations)).find((r) => r.cardId === 'x-1' && r.lang === 'en')!
    expect(after.imageFile).toBeNull()
    expect(after.name).toBe('Keep')
  })
})
```
(Add `setLocalizationImage` to the `@revelio/db` import in that file.)

- [ ] **Step 2: Run — FAIL**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run localization-write` → FAIL.

- [ ] **Step 3: Implement in `app/db/src/queries.ts`**

```ts
export async function setLocalizationImage(
  db: DB,
  cardId: string,
  lang: string,
  imageFile: string | null,
): Promise<void> {
  const now = new Date()
  await db
    .insert(cardLocalizations)
    .values({ cardId, lang, name: '', imageFile, origin: 'user', updatedAt: now })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { imageFile, origin: 'user', updatedAt: now },
    })
}
```
Export it: add `setLocalizationImage` to the queries export in `app/db/src/index.ts`.

- [ ] **Step 4: Run — PASS**

Run the test again → pass.

- [ ] **Step 5: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts app/ingest/test/localization-write.test.ts
git commit -m "feat(db): setLocalizationImage — set a localization's image_file (provenance flag), origin user"
```

---

### Task 5: S3 write client + upload/remove actions

**Files:**
- Create: `app/web/src/lib/s3.ts`, `app/web/src/lib/image-actions.ts`
- Modify: `app/web/package.json` (deps), `app/docker-compose.yml` (minio host port), `app/web/.env.example`
- Test: `app/web/src/lib/__tests__/image-actions.test.ts`

**Interfaces:**
- Consumes: `imageKey`/`thumbKey` (`@revelio/core`), `getCardById`/`getCardIndexData`/`setLocalizationImage` (`@revelio/db`), `getWriteClient` (`@/lib/reindex`), `reindexCard` (`@revelio/search`), `routing`.
- Produces: `getS3()`, `putObject(s3, key, body, contentType)`, `deleteObject(s3, key)` (`@/lib/s3`); `uploadCardImage(formData): Promise<ImageResult>`, `removeCardImage(cardId, lang): Promise<ImageResult>` where `ImageResult = { ok: true; warning?: string } | { ok: false; error: string }`.

- [ ] **Step 1: (CONTROLLER) install deps**

From `app/web`:
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm install sharp @aws-sdk/client-s3 -w @revelio/web
```

- [ ] **Step 2: S3 write client `app/web/src/lib/s3.ts`**

```ts
import 'server-only'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function getS3(): S3Client {
  const endpoint = process.env.S3_ENDPOINT
  if (!endpoint) throw new Error('S3_ENDPOINT is required')
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  })
}

const bucket = () => process.env.S3_BUCKET ?? 'card-images'

export async function putObject(s3: S3Client, key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }))
}

export async function deleteObject(s3: S3Client, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}
```

- [ ] **Step 3: Write the failing action test (mock-based)**

`app/web/src/lib/__tests__/image-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  getCardById: vi.fn(async () => ({ id: 'x-1', defaultLanguage: 'en' })),
  setLocalizationImage: vi.fn(async () => {}),
  getCardIndexData: vi.fn(async () => null),
  reindexCard: vi.fn(async () => {}),
  getWriteClient: vi.fn(() => ({})),
  put: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getCardById: m.getCardById, setLocalizationImage: m.setLocalizationImage, getCardIndexData: m.getCardIndexData,
}))
vi.mock('@revelio/search', () => ({ reindexCard: m.reindexCard }))
vi.mock('@/lib/reindex', () => ({ getWriteClient: m.getWriteClient }))
vi.mock('@/lib/s3', () => ({ getS3: () => ({}), putObject: m.put, deleteObject: m.del }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('sharp', () => ({
  default: () => ({ webp: () => ({ resize: () => ({ toBuffer: async () => Buffer.from('x') }), toBuffer: async () => Buffer.from('x') }) }),
}))

import { uploadCardImage, removeCardImage } from '../image-actions'

function form(file: File | null, cardId = 'x-1', lang = 'de') {
  const fd = new FormData()
  if (file) fd.append('file', file)
  fd.append('cardId', cardId)
  fd.append('lang', lang)
  return fd
}

beforeEach(() => Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset()))
beforeEach(() => {
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getCardById.mockResolvedValue({ id: 'x-1', defaultLanguage: 'en' })
})

describe('uploadCardImage', () => {
  it('rejects a non-image file', async () => {
    const res = await uploadCardImage(form(new File(['x'], 'a.txt', { type: 'text/plain' })))
    expect(res).toEqual({ ok: false, error: 'type' })
    expect(m.put).not.toHaveBeenCalled()
  })

  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await uploadCardImage(form(new File(['x'], 'a.png', { type: 'image/png' }))).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.put).not.toHaveBeenCalled()
  })

  it('processes a valid image: writes full+thumb to the de keys and sets image_file', async () => {
    const res = await uploadCardImage(form(new File(['x'], 'art.png', { type: 'image/png' })))
    expect(res).toEqual({ ok: true })
    expect(m.put).toHaveBeenCalledTimes(2)
    const keys = m.put.mock.calls.map((c) => c[1])
    expect(keys).toContain('cards/x-1.de.webp')
    expect(keys).toContain('cards/thumb/x-1.de.webp')
    expect(m.setLocalizationImage).toHaveBeenCalledWith({}, 'x-1', 'de', 'art.png')
  })
})

describe('removeCardImage', () => {
  it('deletes both keys and nulls image_file', async () => {
    const res = await removeCardImage('x-1', 'de')
    expect(res).toEqual({ ok: true })
    expect(m.del).toHaveBeenCalledTimes(2)
    expect(m.setLocalizationImage).toHaveBeenCalledWith({}, 'x-1', 'de', null)
  })
})
```

- [ ] **Step 4: Run — FAIL** (`../image-actions` missing)

Run: `cd app/web && npx vitest run image-actions` → FAIL.

- [ ] **Step 5: Implement `app/web/src/lib/image-actions.ts`**

```ts
'use server'
import sharp from 'sharp'
import { revalidatePath } from 'next/cache'
import { imageKey, thumbKey } from '@revelio/core'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getCardById, getCardIndexData, setLocalizationImage } from '@revelio/db'
import { getS3, putObject, deleteObject } from '@/lib/s3'
import { getWriteClient } from '@/lib/reindex'
import { reindexCard } from '@revelio/search'
import { routing } from '@/../i18n/routing'

export type ImageResult = { ok: true; warning?: string } | { ok: false; error: string }

const MAX_BYTES = 5 * 1024 * 1024

async function reindex(cardId: string): Promise<string | undefined> {
  try {
    const data = await getCardIndexData(getDb(), cardId)
    if (data) await reindexCard(getWriteClient(), data, [...routing.locales])
    return undefined
  } catch (err) {
    console.error('reindex failed for card', cardId, err)
    return 'reindex-failed'
  }
}

export async function uploadCardImage(formData: FormData): Promise<ImageResult> {
  await requireRole('editor')
  const cardId = String(formData.get('cardId') ?? '')
  const lang = String(formData.get('lang') ?? '')
  const file = formData.get('file')
  if (!cardId || !routing.locales.includes(lang as (typeof routing.locales)[number]) || !(file instanceof File)) {
    return { ok: false, error: 'invalid' }
  }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'type' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'size' }

  const db = getDb()
  const card = await getCardById(db, cardId)
  if (!card) return { ok: false, error: 'invalid' }

  const input = Buffer.from(await file.arrayBuffer())
  const full = await sharp(input).webp({ quality: 90 }).toBuffer()
  const thumb = await sharp(input).resize({ width: 300 }).webp({ quality: 80 }).toBuffer()

  const s3 = getS3()
  await putObject(s3, imageKey(cardId, lang, card.defaultLanguage), full, 'image/webp')
  await putObject(s3, thumbKey(cardId, lang, card.defaultLanguage), thumb, 'image/webp')
  await setLocalizationImage(db, cardId, lang, file.name)

  const warning = await reindex(cardId)
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}

export async function removeCardImage(cardId: string, lang: string): Promise<ImageResult> {
  await requireRole('editor')
  if (!cardId || !routing.locales.includes(lang as (typeof routing.locales)[number])) {
    return { ok: false, error: 'invalid' }
  }
  const db = getDb()
  const card = await getCardById(db, cardId)
  if (!card) return { ok: false, error: 'invalid' }

  const s3 = getS3()
  await deleteObject(s3, imageKey(cardId, lang, card.defaultLanguage))
  await deleteObject(s3, thumbKey(cardId, lang, card.defaultLanguage))
  await setLocalizationImage(db, cardId, lang, null)

  const warning = await reindex(cardId)
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}
```

- [ ] **Step 6: Run — PASS + build**

Run: `cd app/web && npx vitest run image-actions` → all pass. Then `npx next build` → "Compiled successfully".

- [ ] **Step 7: Publish MinIO on the host + env example**

In `app/docker-compose.yml`, under the `minio` service add a host port:
```yaml
    ports:
      - "127.0.0.1:9000:9000"
```
In `app/web/.env.example`, append:
```
# S3/MinIO write access for image upload (server-only)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=card-images
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

- [ ] **Step 8: Commit**

```bash
git add app/web/src/lib/s3.ts app/web/src/lib/image-actions.ts app/web/src/lib/__tests__/image-actions.test.ts app/web/package.json app/package-lock.json app/docker-compose.yml app/web/.env.example
git commit -m "feat(web): image upload/remove actions (sharp -> WebP, S3 write) + MinIO host port + S3 env"
```

---

### Task 6: Image uploader UI + edit page

**Files:**
- Create: `app/web/src/components/image-uploader.tsx`
- Modify: `app/web/src/app/[locale]/card/[id]/edit/page.tsx`, `app/web/messages/{en,de}.json`
- Test: `app/web/src/components/__tests__/image-uploader.test.tsx`

**Interfaces:**
- Consumes: `uploadCardImage`/`removeCardImage` (`@/lib/image-actions`).

- [ ] **Step 1: Add `edit` message keys**

`messages/en.json` `"edit"` — add: `"image": "Image", "chooseFile": "Choose file…", "upload": "Upload", "removeImage": "Remove", "imageUploaded": "Image uploaded.", "imageRemoved": "Image removed.", "imageFailed": "Could not save the image.", "usingFallback": "Currently using the {lang} image."`.
`messages/de.json` `"edit"` — German: `"image": "Bild", "chooseFile": "Datei wählen…", "upload": "Hochladen", "removeImage": "Entfernen", "imageUploaded": "Bild hochgeladen.", "imageRemoved": "Bild entfernt.", "imageFailed": "Bild konnte nicht gespeichert werden.", "usingFallback": "Nutzt aktuell das {lang}-Bild."`.

- [ ] **Step 2: Write the failing component test**

`app/web/src/components/__tests__/image-uploader.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadCardImage = vi.fn(async () => ({ ok: true as const }))
const removeCardImage = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/image-actions', () => ({
  uploadCardImage: (...a: unknown[]) => uploadCardImage(...a),
  removeCardImage: (...a: unknown[]) => removeCardImage(...a),
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { ImageUploader } from '../image-uploader'
import en from '@/../messages/en.json'

function renderUploader(imageSrc: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ImageUploader cardId="x-1" lang="de" imageSrc={imageSrc} fallbackLang="en" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { uploadCardImage.mockClear(); removeCardImage.mockClear() })

describe('ImageUploader', () => {
  it('uploads the chosen file', async () => {
    renderUploader(null)
    const file = new File(['x'], 'art.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(en.edit.chooseFile), file)
    await userEvent.click(screen.getByRole('button', { name: en.edit.upload }))
    expect(uploadCardImage).toHaveBeenCalledTimes(1)
    const fd = uploadCardImage.mock.calls[0][0] as FormData
    expect(fd.get('cardId')).toBe('x-1')
    expect(fd.get('lang')).toBe('de')
    expect((fd.get('file') as File).name).toBe('art.png')
  })

  it('removes the image', async () => {
    renderUploader('https://img.test/cards/x-1.de.webp')
    await userEvent.click(screen.getByRole('button', { name: en.edit.removeImage }))
    expect(removeCardImage).toHaveBeenCalledWith('x-1', 'de')
  })
})
```

- [ ] **Step 3: Run — FAIL**

Run: `cd app/web && npx vitest run image-uploader` → FAIL.

- [ ] **Step 4: Implement `app/web/src/components/image-uploader.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { uploadCardImage, removeCardImage } from '@/lib/image-actions'
import { Button } from '@/components/ui/button'

// eslint-disable-next-line @next/next/no-img-element -- preview of an arbitrary S3 URL
export function ImageUploader({
  cardId, lang, imageSrc, fallbackLang,
}: {
  cardId: string
  lang: string
  imageSrc: string | null
  fallbackLang: string | null
}) {
  const t = useTranslations('edit')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function onUpload() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('cardId', cardId)
      fd.append('lang', lang)
      fd.append('file', file)
      const res = await uploadCardImage(fd)
      if (!res.ok) return toast.error(t('imageFailed'))
      if (res.warning) toast.warning(t('reindexWarning'))
      else toast.success(t('imageUploaded'))
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    setBusy(true)
    try {
      const res = await removeCardImage(cardId, lang)
      if (!res.ok) return toast.error(t('imageFailed'))
      toast.success(t('imageRemoved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{t('image')}</h2>
      <div className="flex gap-4">
        <div className="relative aspect-[5/7] w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={t('chooseFile')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || !file} onClick={onUpload}>{t('upload')}</Button>
            {imageSrc ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
                {t('removeImage')}
              </Button>
            ) : null}
          </div>
          {fallbackLang ? (
            <p className="text-xs text-muted-foreground">{t('usingFallback', { lang: fallbackLang })}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Run — PASS**

Run: `cd app/web && npx vitest run image-uploader` → pass.

- [ ] **Step 6: Render on the edit page**

In `app/web/src/app/[locale]/card/[id]/edit/page.tsx`: import `ImageUploader`, `imageKey`, `imageUrl`, `effectiveImageLang` (`@revelio/core`), and read the image base env. Compute (after `loc`/`kind`):
```ts
  const imgLang = effectiveImageLang((l) => !!card.localizations[l]?.imageFile, lang, card.defaultLanguage)
  const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  const imageSrc = imgLang && imageBase ? imageUrl(imageBase, imageKey(id, imgLang, card.defaultLanguage)) : null
  const fallbackLang = imgLang && imgLang !== lang ? imgLang : null
```
Render `<ImageUploader>` above `<CardEditForm>` inside `<main>`:
```tsx
      <ImageUploader key={`img-${lang}`} cardId={id} lang={lang} imageSrc={imageSrc} fallbackLang={fallbackLang} />
      <CardEditForm ... />
```

- [ ] **Step 7: Run tests + build**

Run: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run` → all green. `npx next build` → compiles; `/[locale]/card/[id]/edit` present.

- [ ] **Step 8: Commit**

```bash
git add app/web/src/components/image-uploader.tsx "app/web/src/app/[locale]/card/[id]/edit/page.tsx" app/web/messages "app/web/src/components/__tests__/image-uploader.test.tsx"
git commit -m "feat(web): per-language card image uploader section on the edit page"
```

---

## Self-Review

**Spec coverage:**
- Language-aware keys, no re-seed → Task 1 ✓
- Fallback resolution (`effectiveImageLang`) → Task 1; used by search doc (Task 2), detail (Task 3), edit page (Task 6) ✓
- Search doc `imageLang` + `defaultLanguage`, rebuild → Task 2 ✓
- Display detail + tile fallback → Task 3 (OG intentionally unchanged, per Global Constraints) ✓
- `setLocalizationImage` → Task 4 ✓
- Upload action (sharp WebP full+thumb, validation, S3, image_file, reindex) + remove → Task 5 ✓
- S3 write client + env + Compose MinIO host port → Task 5 ✓
- Bordered image UI (preview, upload, remove, fallback hint), immediate → Task 6 ✓
- Tests each layer (keys/fallback, doc, db, action gating+validation+orchestration, uploader UI) → Tasks 1-6 ✓
- OUT of scope (multi-image, cropping, drag-drop, CDN) → not built ✓

**Placeholder scan:** No TBD/TODO. `<scratchpad>` is the real cache path from Global Constraints. All code/tests are concrete. Note: the real sharp+S3+Meili round-trip is exercised manually (below) — the action test is mock-based (deterministic, fast, environment-independent), which is the right level for a binary/multipart action in the jsdom web suite.

**Type consistency:** `imageKey(id, lang?, defaultLang?)`/`thumbKey(...)` and `effectiveImageLang(hasImage, lang, defaultLang)` defined in Task 1, consumed identically in Tasks 2/3/5/6. `SearchDocument.imageLang`/`defaultLanguage` (Task 2) consumed by the tile (Task 3). `ImageResult` shape identical in Task 5 (def) and the action test. `setLocalizationImage(db, cardId, lang, imageFile)` identical in Tasks 4 and 5. `uploadCardImage(formData)`/`removeCardImage(cardId, lang)` (Task 5) consumed by the uploader (Task 6) and its test.

## Manual verification (before merge)

With the compose stack up (MinIO published on host, web env has S3_* + MEILI_* ): sign in as an editor, open `/card/<id>/edit`, switch to a non-default language, choose an image and Upload → the preview updates, the detail page shows the new image for that language only, other languages still show the default; Remove → the language falls back to the default image. Confirm the objects exist in MinIO under `cards/<id>.<lang>.webp` and `cards/thumb/<id>.<lang>.webp`.

## Notes
- After deploy, the search index must be rebuilt once (re-run ingest reindex) so documents carry `imageLang`/`defaultLanguage` instead of `imageFile`.
- This completes Plan 4b (Authoring). Remaining: Plan 5 (CI/prod — real OTP email, prod S3/CDN, incremental migrations).

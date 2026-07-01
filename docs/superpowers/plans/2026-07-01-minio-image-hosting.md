# MinIO Image Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve card images from MinIO (S3-compatible, public-read): shared key/URL helpers in `@revelio/core`, an uploader in `@revelio/ingest` that pushes `card-data/assets/` (full cards, thumbnails, set symbols) into a public bucket, wired into the seed.

**Architecture:** `@revelio/core` (driver-free) gains pure `imageKey`/`thumbKey`/`symbolKey`/`imageUrl` helpers used by both the uploader and the web. `@revelio/ingest` gains an uploader using `@aws-sdk/client-s3`: ensure the bucket + a public-read policy, then upload each asset **diffed** (skip objects already present). `runIngest` uploads after Postgres+Meili when `S3_ENDPOINT` is configured. MinIO is a standalone image (dev compose service).

**Tech Stack:** Node 20, TypeScript (ESM), `@aws-sdk/client-s3`, MinIO, Vitest, Docker.

## Global Constraints

- Node **20+**, TypeScript, ESM (`"type": "module"`) everywhere.
- Config env-driven only — no hardcoded hosts: `S3_ENDPOINT`, `S3_BUCKET` (default `card-images`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` (default `us-east-1`), `S3_FORCE_PATH_STYLE` (default `true`), `ASSETS_DIR` (default `/assets`). Tests use `TEST_S3_ENDPOINT` (default `http://localhost:9000`), `TEST_S3_ACCESS_KEY`/`TEST_S3_SECRET_KEY` (default `minioadmin`).
- Bucket is **public-read**; the web builds plain public URLs (no signing, no S3 client in the web).
- Object keys: full cards `cards/<id>.png`, thumbnails `cards/thumb/<id>.jpg`, set symbols `symbols/<code>.png`.
- Uploads are **diffed** (skip via `headObject`) — additive, so re-seed is fast; never deletes.
- `@revelio/core` stays driver-free (the key/URL helpers add NO dependency).
- Seed still works with no S3 configured (upload guarded by `S3_ENDPOINT`).
- English identifiers/comments; Conventional Commits. New code under `app/`.
- Integration tests need a real MinIO. Testcontainers is unreliable in this sandbox — use a long-running container + `TEST_S3_*` env, unique bucket per test. Ingest test files already run sequentially (`app/ingest/vitest.config.ts`).

## Test infrastructure (controller sets up before execution)

```bash
docker run -d --name revelio-testminio -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 minio/minio server /data
export TEST_S3_ENDPOINT="http://localhost:9000"
export TEST_S3_ACCESS_KEY="minioadmin"
export TEST_S3_SECRET_KEY="minioadmin"
```

## File Structure

```
app/
  core/src/
    images.ts                    # imageKey/thumbKey/symbolKey/imageUrl (pure)
    index.ts                     # barrel += images
  core/test/images.test.ts
  ingest/
    package.json                 # dep: @aws-sdk/client-s3
    Dockerfile                   # ENV ASSETS_DIR=/assets (Task 4)
    src/
      upload-images.ts           # S3Config, createS3Client, ensureBucket, uploadAssets
      main.ts                    # runIngest uploads when opts.s3 present
    test/
      s3-helpers.ts              # test client + unique bucket + nuke
      upload-images.test.ts
  docker-compose.yml             # minio service (Task 4)
  docker-compose.override.yml    # mount ../card-data/assets (Task 4)
```

---

### Task 1: `@revelio/core` image key/URL helpers

**Files:**
- Create: `app/core/src/images.ts`
- Modify: `app/core/src/index.ts` (add `export * from './images.js'`)
- Test: `app/core/test/images.test.ts`

**Interfaces:**
- Produces (from `@revelio/core`):
  - `imageKey(id: string): string` → `cards/${id}.png`
  - `thumbKey(id: string): string` → `cards/thumb/${id}.jpg`
  - `symbolKey(code: string): string` → `symbols/${code}.png`
  - `imageUrl(base: string, key: string): string` → base joined to key with exactly one slash

- [ ] **Step 1: Write the failing test**

`app/core/test/images.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { imageKey, thumbKey, symbolKey, imageUrl } from '../src/images.js'

describe('image keys and urls', () => {
  it('builds object keys', () => {
    expect(imageKey('bs-1-dean-thomas')).toBe('cards/bs-1-dean-thomas.png')
    expect(thumbKey('bs-1-dean-thomas')).toBe('cards/thumb/bs-1-dean-thomas.jpg')
    expect(symbolKey('BS')).toBe('symbols/BS.png')
  })

  it('joins base and key with a single slash', () => {
    expect(imageUrl('https://img.example.com', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
    expect(imageUrl('https://img.example.com/', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/core && npx vitest run images`
Expected: FAIL — `Cannot find module '../src/images.js'`.

- [ ] **Step 3: Write the implementation**

`app/core/src/images.ts`:
```ts
export function imageKey(id: string): string {
  return `cards/${id}.png`
}

export function thumbKey(id: string): string {
  return `cards/thumb/${id}.jpg`
}

export function symbolKey(code: string): string {
  return `symbols/${code}.png`
}

export function imageUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key}`
}
```

- [ ] **Step 4: Add to the barrel**

Append to `app/core/src/index.ts`:
```ts
export * from './images.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/core && npx vitest run images`
Expected: PASS (2 tests). Pure — no Docker.

- [ ] **Step 6: Commit**

```bash
git add app/core/src/images.ts app/core/src/index.ts app/core/test/images.test.ts
git commit -m "feat: add image key and url helpers to @revelio/core"
```

---

### Task 2: Uploader — bucket ensure + public policy + diffed upload

**Files:**
- Modify: `app/ingest/package.json` (add `@aws-sdk/client-s3` dependency)
- Create: `app/ingest/src/upload-images.ts`
- Create: `app/ingest/test/s3-helpers.ts`
- Test: `app/ingest/test/upload-images.test.ts`

**Interfaces:**
- Consumes: `@revelio/core` (`imageKey`, `thumbKey`, `symbolKey`).
- Produces:
  - `type S3Config = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string; forcePathStyle?: boolean }`
  - `createS3Client(c: S3Config): S3Client`
  - `ensureBucket(s3: S3Client, bucket: string): Promise<void>` (creates if missing + sets public-read policy)
  - `uploadAssets(s3: S3Client, bucket: string, assetsDir: string): Promise<{ uploaded: number; skipped: number }>`

- [ ] **Step 1: Add the dependency**

Edit `app/ingest/package.json` `dependencies` to include `"@aws-sdk/client-s3": "^3.600.0"`.

- [ ] **Step 2: Write the test helper**

`app/ingest/test/s3-helpers.ts`:
```ts
import { randomUUID } from 'node:crypto'
import {
  S3Client, ListObjectsV2Command, DeleteObjectCommand, DeleteBucketCommand,
} from '@aws-sdk/client-s3'

export function testS3Config(bucket: string) {
  return {
    endpoint: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
    bucket,
    accessKeyId: process.env.TEST_S3_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.TEST_S3_SECRET_KEY ?? 'minioadmin',
    region: 'us-east-1',
    forcePathStyle: true,
  }
}

export function uniqueBucket(): string {
  return `test-${randomUUID().replace(/-/g, '')}`
}

export async function nukeBucket(s3: S3Client, bucket: string): Promise<void> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
  for (const o of listed.Contents ?? []) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }))
  }
  await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
}
```

- [ ] **Step 3: Write the failing test**

`app/ingest/test/upload-images.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createS3Client, ensureBucket, uploadAssets } from '../src/upload-images.js'
import { testS3Config, uniqueBucket, nukeBucket } from './s3-helpers.js'

const bucket = uniqueBucket()
const cfg = testS3Config(bucket)
const s3 = createS3Client(cfg)
let assetsDir: string

beforeAll(async () => {
  assetsDir = await mkdtemp(join(tmpdir(), 'revelio-assets-'))
  await mkdir(join(assetsDir, 'cards', 'thumb'), { recursive: true })
  await mkdir(join(assetsDir, 'symbols'), { recursive: true })
  await writeFile(join(assetsDir, 'cards', 'bs-1-x.png'), Buffer.from('PNGDATA'))
  await writeFile(join(assetsDir, 'cards', 'thumb', 'bs-1-x.jpg'), Buffer.from('JPGDATA'))
  await writeFile(join(assetsDir, 'symbols', 'BS.png'), Buffer.from('SYMDATA'))
  await ensureBucket(s3, bucket)
}, 60_000)
afterAll(async () => { await nukeBucket(s3, bucket) })

describe('uploadAssets', () => {
  it('uploads full cards, thumbnails and symbols', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 3, skipped: 0 })
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/bs-1-x.png' }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/thumb/bs-1-x.jpg' }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'symbols/BS.png' }))).resolves.toBeTruthy()
  })

  it('serves objects with public (unauthenticated) read', async () => {
    const res = await fetch(`${cfg.endpoint}/${bucket}/cards/bs-1-x.png`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('PNGDATA')
  })

  it('skips objects that already exist on re-run (diffed)', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 0, skipped: 3 })
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd app && npm install && cd ingest && TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run upload-images`
Expected: FAIL — `Cannot find module '../src/upload-images.js'`.

- [ ] **Step 5: Write the implementation**

`app/ingest/src/upload-images.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand,
  HeadObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3'
import { imageKey, thumbKey, symbolKey } from '@revelio/core'

export type S3Config = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region?: string
  forcePathStyle?: boolean
}

export function createS3Client(c: S3Config): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region ?? 'us-east-1',
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    forcePathStyle: c.forcePathStyle ?? true,
  })
}

export async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  }
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    }],
  })
  await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
}

type Upload = { file: string; key: string; contentType: string }

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function collectUploads(assetsDir: string): Promise<Upload[]> {
  const uploads: Upload[] = []
  const cardsDir = resolve(assetsDir, 'cards')
  for (const f of await readdirSafe(cardsDir)) {
    if (f.endsWith('.png')) {
      uploads.push({ file: join(cardsDir, f), key: imageKey(f.slice(0, -4)), contentType: 'image/png' })
    }
  }
  const thumbDir = resolve(cardsDir, 'thumb')
  for (const f of await readdirSafe(thumbDir)) {
    if (f.endsWith('.jpg')) {
      uploads.push({ file: join(thumbDir, f), key: thumbKey(f.slice(0, -4)), contentType: 'image/jpeg' })
    }
  }
  const symbolsDir = resolve(assetsDir, 'symbols')
  for (const f of await readdirSafe(symbolsDir)) {
    if (f.endsWith('.png')) {
      uploads.push({ file: join(symbolsDir, f), key: symbolKey(f.slice(0, -4)), contentType: 'image/png' })
    }
  }
  return uploads
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

// Bounded concurrency (single-threaded JS: counter increments are safe).
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      await fn(items[i++])
    }
  })
  await Promise.all(workers)
}

export async function uploadAssets(
  s3: S3Client, bucket: string, assetsDir: string,
): Promise<{ uploaded: number; skipped: number }> {
  const uploads = await collectUploads(assetsDir)
  let uploaded = 0
  let skipped = 0
  await mapLimit(uploads, 8, async (u) => {
    if (await objectExists(s3, bucket, u.key)) {
      skipped++
      return
    }
    const body = await readFile(u.file)
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: u.key, Body: body, ContentType: u.contentType }))
    uploaded++
  })
  return { uploaded, skipped }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd app/ingest && TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run upload-images`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add app/ingest/package.json app/ingest/src/upload-images.ts app/ingest/test/s3-helpers.ts app/ingest/test/upload-images.test.ts
git commit -m "feat: upload card images to a public MinIO bucket, diffed"
```

---

### Task 3: Wire image upload into the seed entrypoint

**Files:**
- Modify: `app/ingest/src/main.ts`
- Modify: `app/ingest/test/main.test.ts`

**Interfaces:**
- Consumes: `createS3Client`, `ensureBucket`, `uploadAssets`, `S3Config`.
- Produces: `runIngest` opts gain optional `assetsDir?: string` and `s3?: S3Config`; when `s3` is set it ensures the bucket and uploads `assetsDir` after `loadCards`/indexing. CLI builds `s3` from `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_REGION`/`S3_FORCE_PATH_STYLE` (only when `S3_ENDPOINT` set) and reads `ASSETS_DIR` (default `/assets`).

- [ ] **Step 1: Add the test**

Add to `app/ingest/test/main.test.ts` (imports at top, and a new test). Add imports:
```ts
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { createS3Client } from '../src/upload-images.js'
import { testS3Config, uniqueBucket, nukeBucket } from './s3-helpers.js'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
```
Add this test inside the `describe('runIngest', ...)` block:
```ts
it('uploads card images when s3 is configured', async () => {
  const bucket = uniqueBucket()
  const s3cfg = testS3Config(bucket)
  const assetsDir = await mkdtemp(join(tmpdir(), 'revelio-main-assets-'))
  await mkdir(join(assetsDir, 'cards'), { recursive: true })
  await writeFile(join(assetsDir, 'cards', 'bs-1-dean-thomas.png'), Buffer.from('IMG'))

  await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir, assetsDir, s3: s3cfg })

  const s3 = createS3Client(s3cfg)
  await expect(
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/bs-1-dean-thomas.png' })),
  ).resolves.toBeTruthy()
  await nukeBucket(s3, bucket)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run main`
Expected: FAIL — `runIngest` does not accept `s3` / does not upload.

- [ ] **Step 3: Update the implementation**

`app/ingest/src/main.ts`:
```ts
import { createClient, runMigrations } from '@revelio/db'
import { createMeiliClient } from '@revelio/search'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadAttributes } from './load-attributes.js'
import { loadCards } from './load-cards.js'
import { loadLabels } from './load-labels.js'
import { indexCards } from './index-cards.js'
import { createS3Client, ensureBucket, uploadAssets, type S3Config } from './upload-images.js'

export async function runIngest(opts: {
  databaseUrl: string
  dataDir: string
  i18nDir: string
  assetsDir?: string
  meiliHost?: string
  meiliKey?: string
  s3?: S3Config
}): Promise<{ sets: number; cards: number }> {
  const { db, sql } = createClient(opts.databaseUrl)
  try {
    await runMigrations(db)
    const { sets, cards } = await loadDist(opts.dataDir)
    const labels = await loadLabels(opts.i18nDir)
    await loadSets(db, sets)
    await loadAttributes(db, cards, labels)
    await loadCards(db, cards)
    if (opts.meiliHost) {
      const meili = createMeiliClient(opts.meiliHost, opts.meiliKey ?? '')
      await indexCards(db, meili)
    }
    if (opts.s3) {
      const s3 = createS3Client(opts.s3)
      await ensureBucket(s3, opts.s3.bucket)
      await uploadAssets(s3, opts.s3.bucket, opts.assetsDir ?? '/assets')
    }
    return { sets: sets.length, cards: cards.length }
  } finally {
    await sql.end()
  }
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  const dataDir = process.env.DATA_DIR ?? '/data'
  const i18nDir = process.env.I18N_DIR ?? '/i18n'
  const assetsDir = process.env.ASSETS_DIR ?? '/assets'
  const meiliHost = process.env.MEILI_HOST
  const meiliKey = process.env.MEILI_MASTER_KEY
  const s3: S3Config | undefined = process.env.S3_ENDPOINT
    ? {
        endpoint: process.env.S3_ENDPOINT,
        bucket: process.env.S3_BUCKET ?? 'card-images',
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
      }
    : undefined
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  runIngest({ databaseUrl, dataDir, i18nDir, assetsDir, meiliHost, meiliKey, s3 })
    .then((r) => {
      const search = meiliHost ? ' + search indexed' : ''
      const images = s3 ? ' + images uploaded' : ''
      console.log(`seed complete: ${r.sets} sets, ${r.cards} cards imported (additive)${search}${images}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run main`
Expected: PASS.

- [ ] **Step 5: Run the full ingest + core suites**

Run:
```bash
cd app/ingest && TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_MEILI_HOST="$TEST_MEILI_HOST" TEST_MEILI_KEY="$TEST_MEILI_KEY" TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=minioadmin TEST_S3_SECRET_KEY=minioadmin npx vitest run && \
cd ../core && npx vitest run
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/src/main.ts app/ingest/test/main.test.ts
git commit -m "feat: upload images during the seed when S3_ENDPOINT is set"
```

---

### Task 4: MinIO service + Dockerfile + real-data verification

**Files:**
- Modify: `app/ingest/Dockerfile` (add `ENV ASSETS_DIR=/assets`)
- Modify: `app/docker-compose.yml` (add `minio` service + ingest `S3_*`/`ASSETS_DIR` env)
- Modify: `app/docker-compose.override.yml` (bind-mount `../card-data/assets`)

**Interfaces:**
- Consumes: `runIngest` CLI (reads `S3_*`, `ASSETS_DIR`).
- Produces: a dev `minio` service; the ingest one-shot uploads the real images.

- [ ] **Step 1: Add `ASSETS_DIR` to the ingest Dockerfile**

In `app/ingest/Dockerfile`, add next to the other `ENV` lines:
```dockerfile
ENV ASSETS_DIR=/assets
```

- [ ] **Step 2: Add the minio service + ingest env**

`app/docker-compose.yml` — add the service:
```yaml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 10
```
Add to the `ingest` service `environment:` block:
```yaml
      ASSETS_DIR: /assets
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: card-images
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      S3_REGION: us-east-1
      S3_FORCE_PATH_STYLE: "true"
```
Add `minio` to the `ingest` `depends_on` with `condition: service_healthy`, and add `minio: {}` to the top-level `volumes:` block.

- [ ] **Step 3: Bind-mount the assets in the dev override**

`app/docker-compose.override.yml` — add to the `ingest` service's `volumes:` list:
```yaml
      - ../card-data/assets:/assets:ro
```

- [ ] **Step 4: Build and run the seed against the real assets**

Run:
```bash
cd app && docker compose build ingest
docker compose up -d postgres meilisearch minio
docker compose run --rm -T ingest
```
Expected: logs `seed complete: 14 sets, 1035 cards imported (additive) + search indexed + images uploaded` and exits 0. (First run uploads ~1.3 GB; allow a few minutes.)

- [ ] **Step 5: Verify images are in the bucket and publicly readable**

Run:
```bash
# object count in the bucket (via the minio container's mc or an S3 list); simplest: public GET a known image
docker compose exec -T minio curl -fsS -o /dev/null -w "%{http_code}\n" \
  http://localhost:9000/card-images/cards/bs-1-dean-thomas.png
docker compose exec -T minio curl -fsS -o /dev/null -w "%{http_code}\n" \
  http://localhost:9000/card-images/symbols/BS.png
docker compose exec -T minio curl -fsS -o /dev/null -w "%{http_code}\n" \
  http://localhost:9000/card-images/cards/thumb/bs-1-dean-thomas.jpg
```
Expected: each prints `200` (full card, set symbol, and thumbnail all present and public).

- [ ] **Step 6: Verify a second run is a fast diffed no-op**

Run: `cd app && docker compose run --rm -T ingest`
Expected: still logs success; the upload step skips existing objects (near-instant vs the first run).

- [ ] **Step 7: Tear down**

Run: `cd app && docker compose down -v`
Expected: containers + volumes removed.

- [ ] **Step 8: Commit**

```bash
git add app/ingest/Dockerfile app/docker-compose.yml app/docker-compose.override.yml
git commit -m "feat: add minio service and upload the real images in the seed"
```

---

## Self-Review

**Spec coverage (Image hosting section):**
- `@revelio/core` key/URL helpers (`imageKey`/`thumbKey`/`symbolKey`/`imageUrl`) → Task 1 ✓
- Uploader via `@aws-sdk/client-s3`, bucket-ensure + public-read policy → Task 2 ✓
- Diffed upload (skip existing) of full cards + thumbnails + symbols with content-types → Task 2 ✓
- Wired into `runIngest`, guarded by `S3_ENDPOINT`; reads `ASSETS_DIR` → Task 3 ✓
- Public-read verified (unauthenticated GET) → Task 2 (dummy) + Task 4 (real) ✓
- MinIO as standalone image / dev compose service; env-driven → Task 4 ✓
- Web `<Image>` integration, in-app uploads, CDN → deferred to Plans 4/5 (noted) ✓

**Placeholder scan:** No TBD/TODO. `minioadmin`/`masterKey` are dev/test credentials; prod uses env (`S3_ACCESS_KEY`/`S3_SECRET_KEY`).

**Type consistency:** `S3Config` (Task 2) is consumed by `runIngest` (Task 3). `imageKey`/`thumbKey`/`symbolKey` (Task 1) used by the uploader (Task 2). `createS3Client`/`ensureBucket`/`uploadAssets` signatures match between producer (Task 2) and consumers (Tasks 3–4). Object keys (`cards/<id>.png`, `cards/thumb/<id>.jpg`, `symbols/<code>.png`) consistent across helpers, uploader, and verification.

## Notes for later plans

- **Plan 4 (web):** the web imports `@revelio/core` (`imageUrl`, `imageKey`, `thumbKey`, `symbolKey`) and renders `<Image src={imageUrl(NEXT_PUBLIC_IMAGE_BASE_URL, thumbKey(id))}>` in the grid, full image on detail; in-app card creation uploads new images to the same bucket (server-side, with credentials).
- **Plan 5 (CI/prod):** MinIO standalone or pre-deployed; the `revelio-data` image bakes `assets/`; put a CDN in front of the public bucket; the bucket data is rebuildable from `assets/`, so back up is optional.

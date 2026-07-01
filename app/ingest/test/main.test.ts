import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql as dsql } from 'drizzle-orm'
import { createClient } from '@revelio/db'
import { searchCards, cardsIndex, createMeiliClient } from '@revelio/search'
import { runIngest } from '../src/main.js'
import { withFreshDatabase } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { createS3Client } from '../src/upload-images.js'
import { testS3Config, uniqueBucket, nukeBucket } from './s3-helpers.js'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')
const i18nDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/i18n')

const meiliHost = process.env.TEST_MEILI_HOST ?? 'http://localhost:7700'
const meiliKey = process.env.TEST_MEILI_KEY ?? 'masterKey'
const meili = createMeiliClient(meiliHost, meiliKey)

let fresh: Awaited<ReturnType<typeof withFreshDatabase>>
beforeAll(async () => { fresh = await withFreshDatabase() }, 120_000)
afterAll(async () => {
  await meili.deleteIndex(cardsIndex('en')).catch(() => {})
  await meili.deleteIndex(cardsIndex('de')).catch(() => {})
  await fresh.stop()
})

describe('runIngest', () => {
  it('migrates and seeds sets, attribute, cards and junctions', async () => {
    const result = await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir })
    expect(result).toEqual({ sets: 2, cards: 3 })

    const { db, sql } = createClient(fresh.url)
    const cardCount = await db.execute(dsql`select count(*)::int as count from cards`)
    const typeLinks = await db.execute(dsql`select count(*)::int as count from card_types`)
    expect(cardCount[0].count).toBe(3)
    expect(typeLinks[0].count).toBe(3) // one type per fixture card
    await sql.end()
  })

  it('is a safe no-op on a second run', async () => {
    await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir })
    const { db, sql } = createClient(fresh.url)
    const cardCount = await db.execute(dsql`select count(*)::int as count from cards`)
    expect(cardCount[0].count).toBe(3)
    await sql.end()
  })

  it('makes the seeded cards searchable', async () => {
    await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir, meiliHost, meiliKey })
    const r = await searchCards(meili, 'en', 'dean')
    expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  })

  it('uploads card images when s3 is configured', async () => {
    const bucket = uniqueBucket()
    const s3cfg = testS3Config(bucket)
    const assetsDir = await mkdtemp(join(tmpdir(), 'revelio-main-assets-'))
    await mkdir(join(assetsDir, 'cards'), { recursive: true })
    await writeFile(join(assetsDir, 'cards', 'bs-1-dean-thomas.png'), Buffer.from('IMG'))

    await runIngest({ databaseUrl: fresh.url, dataDir: fixtureDir, i18nDir, assetsDir, s3: s3cfg })

    const s3 = createS3Client(s3cfg)
    try {
      await expect(
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/bs-1-dean-thomas.png' })),
      ).resolves.toBeTruthy()
    } finally {
      await nukeBucket(s3, bucket)
    }
  })
})

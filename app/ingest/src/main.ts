import { createClient, runMigrations } from '@revelio/db'
import { createMeiliClient } from '@revelio/search'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadAttributes } from './load-attributes.js'
import { loadCards } from './load-cards.js'
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
    await loadSets(db, sets)
    await loadAttributes(db, cards)
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
        bucket: process.env.S3_BUCKET ?? 'images',
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        region: process.env.S3_REGION ?? 'eu-central-1',
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

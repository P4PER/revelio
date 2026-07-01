import { createClient, runMigrations } from '@revelio/db'
import { createMeiliClient } from '@revelio/search'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadAttributes } from './load-attributes.js'
import { loadCards } from './load-cards.js'
import { loadLabels } from './load-labels.js'
import { indexCards } from './index-cards.js'

export async function runIngest(opts: {
  databaseUrl: string
  dataDir: string
  i18nDir: string
  meiliHost?: string
  meiliKey?: string
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
  const meiliHost = process.env.MEILI_HOST
  const meiliKey = process.env.MEILI_MASTER_KEY
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  runIngest({ databaseUrl, dataDir, i18nDir, meiliHost, meiliKey })
    .then((r) => {
      const search = meiliHost ? ' + search indexed' : ''
      console.log(`seed complete: ${r.sets} sets, ${r.cards} cards imported (additive)${search}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}

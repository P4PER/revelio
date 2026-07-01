import { createClient, runMigrations } from '@revelio/db'
import { loadDist } from './load-dist.js'
import { loadSets } from './load-sets.js'
import { loadAttributes } from './load-attributes.js'
import { loadCards } from './load-cards.js'
import { loadLabels } from './load-labels.js'

export async function runIngest(opts: {
  databaseUrl: string
  dataDir: string
  i18nDir: string
}): Promise<{ sets: number; cards: number }> {
  const { db, sql } = createClient(opts.databaseUrl)
  try {
    await runMigrations(db)
    const { sets, cards } = await loadDist(opts.dataDir)
    const labels = await loadLabels(opts.i18nDir)
    await loadSets(db, sets)
    await loadAttributes(db, cards, labels)
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
  const i18nDir = process.env.I18N_DIR ?? '/i18n'
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  runIngest({ databaseUrl, dataDir, i18nDir })
    .then((r) => {
      console.log(`seed complete: ${r.sets} sets, ${r.cards} cards imported (additive)`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('seed failed:', err)
      process.exit(1)
    })
}

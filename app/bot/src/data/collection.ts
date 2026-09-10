import { getCollectionSetProgress, getCollectionSummary, type DB } from '@revelio/db'

export type CollectionReport = {
  distinctOwned: number
  totalCards: number
  totalCopies: number
  percent: number
}

export type SetReport = {
  owned: number
  total: number
  percent: number
}

function percentOf(owned: number, total: number): number {
  // A fresh instance with no cards indexed would otherwise render NaN%.
  return total === 0 ? 0 : Math.round((owned / total) * 100)
}

export async function getCollectionReport(db: DB, userId: string): Promise<CollectionReport> {
  const summary = await getCollectionSummary(db, userId)
  return { ...summary, percent: percentOf(summary.distinctOwned, summary.totalCards) }
}

export async function getSetProgress(
  db: DB,
  userId: string,
  setCode: string,
): Promise<SetReport | null> {
  const rows = await getCollectionSetProgress(db, userId)
  // Set codes are lowercase in the database, but the option value can be typed
  // by hand rather than picked from the suggestions.
  const wanted = setCode.trim().toLowerCase()
  const row = rows.find((r) => r.setCode.toLowerCase() === wanted)
  return row ? { owned: row.owned, total: row.total, percent: percentOf(row.owned, row.total) } : null
}

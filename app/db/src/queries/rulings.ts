import { eq, asc, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from '../client'
import { cardRulings, cardRulingLocalizations } from '../schema'

export async function saveRulings(
  db: DB,
  cardId: string,
  lang: string,
  rows: { id: string | null; date: string | null; source: string | null; text: string }[],
): Promise<void> {
  const clean = rows.filter(
    (r) =>
      r.id !== null ||
      (r.date?.trim() || '') !== '' ||
      (r.source?.trim() || '') !== '' ||
      (r.text?.trim() || '') !== '',
  )
  const now = new Date()
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: cardRulings.id }).from(cardRulings).where(eq(cardRulings.cardId, cardId))
    const existingIds = new Set(existing.map((e) => e.id))
    const keptIds = new Set<string>()

    for (let i = 0; i < clean.length; i++) {
      const row = clean[i]
      const date = row.date?.trim() || null
      const source = row.source?.trim() || null
      const text = row.text?.trim() || ''
      let id = row.id
      if (id && existingIds.has(id)) {
        keptIds.add(id)
        await tx.update(cardRulings)
          .set({ date, source, seq: i, origin: 'user', updatedAt: now })
          .where(eq(cardRulings.id, id))
      } else {
        id = `${cardId}-r${randomUUID()}`
        await tx.insert(cardRulings).values({ id, cardId, seq: i, date, source, origin: 'user', updatedAt: now })
      }
      if (text) {
        await tx.insert(cardRulingLocalizations)
          .values({ rulingId: id, lang, text })
          .onConflictDoUpdate({ target: [cardRulingLocalizations.rulingId, cardRulingLocalizations.lang], set: { text } })
      } else {
        await tx.delete(cardRulingLocalizations).where(and(eq(cardRulingLocalizations.rulingId, id), eq(cardRulingLocalizations.lang, lang)))
      }
    }

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length) await tx.delete(cardRulings).where(inArray(cardRulings.id, toDelete))
  })
}

export async function listRulingSources(db: DB): Promise<string[]> {
  const rows = await db
    .selectDistinct({ source: cardRulings.source })
    .from(cardRulings)
    .where(isNotNull(cardRulings.source))
    .orderBy(asc(cardRulings.source))
  return rows.map((r) => r.source).filter((s): s is string => !!s)
}

import { eq, asc, and } from 'drizzle-orm'
import type { DB } from '../client'
import { subTypes, subTypeLocalizations } from '../schema'

export async function getSubTypeLabels(db: DB, lang: string): Promise<Record<string, string>> {
  const rows = await db.select().from(subTypeLocalizations).where(eq(subTypeLocalizations.lang, lang))
  return Object.fromEntries(rows.map((r) => [r.subTypeCode, r.label]))
}

export async function listSubTypesWithTranslations(
  db: DB,
): Promise<{ code: string; labels: Record<string, string> }[]> {
  const codes = await db.select().from(subTypes).orderBy(asc(subTypes.code))
  const trans = await db.select().from(subTypeLocalizations)
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
        await tx.delete(subTypeLocalizations).where(
          and(eq(subTypeLocalizations.subTypeCode, r.code), eq(subTypeLocalizations.lang, r.lang)),
        )
      } else {
        await tx.insert(subTypeLocalizations)
          .values({ subTypeCode: r.code, lang: r.lang, label: r.label })
          .onConflictDoUpdate({
            target: [subTypeLocalizations.subTypeCode, subTypeLocalizations.lang],
            set: { label: r.label },
          })
      }
    }
  })
}

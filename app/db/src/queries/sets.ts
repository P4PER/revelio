import { eq, asc, sql, and } from 'drizzle-orm'
import type { DB } from '../client'
import { sets, setLocalizations } from '../schema'
import type { SetDTO } from '@revelio/core'
import type { SitemapEntry } from './types'

type SetRow = typeof sets.$inferSelect

export type SetForEdit = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbolVersion: number | null
  localizations: Record<string, string>
}

export type SetWriteInput = {
  name: string
  releaseDate: string | null
  isOfficial: boolean
  localizations: Record<string, string>
}

export function toSetDTO(row: SetRow, name: string = row.name): SetDTO {
  return {
    code: row.code,
    name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbolVersion: row.symbolVersion,
  }
}

export async function listSets(db: DB, locale?: string): Promise<SetDTO[]> {
  const rows = await db.select().from(sets).orderBy(asc(sets.releaseDate), asc(sets.code))
  if (!locale) return rows.map((r) => toSetDTO(r))
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.lang, locale))
  const nameByCode = new Map(locs.map((l) => [l.setCode, l.name]))
  return rows.map((r) => toSetDTO(r, nameByCode.get(r.code) ?? r.name))
}

export async function getSetByCode(db: DB, code: string, locale?: string): Promise<SetDTO | null> {
  // Set codes are stored uppercase; match case-insensitively so lowercase URL
  // codes (e.g. /sets/bs) resolve rather than 404.
  const [row] = await db.select().from(sets).where(sql`upper(${sets.code}) = upper(${code})`).limit(1)
  if (!row) return null
  if (!locale) return toSetDTO(row)
  const [loc] = await db
    .select()
    .from(setLocalizations)
    .where(and(eq(setLocalizations.setCode, row.code), eq(setLocalizations.lang, locale)))
    .limit(1)
  return toSetDTO(row, loc?.name ?? row.name)
}

export async function getSetForEdit(db: DB, code: string): Promise<SetForEdit | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  if (!row) return null
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.setCode, code))
  return {
    code: row.code,
    name: row.name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbolVersion: row.symbolVersion,
    localizations: Object.fromEntries(locs.map((l) => [l.lang, l.name])),
  }
}

export async function createSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(sets).values({
      code,
      name: input.name,
      releaseDate: input.releaseDate,
      isOfficial: input.isOfficial,
      origin: 'user',
    })
    const rows = Object.entries(input.localizations)
      .filter(([, name]) => name.trim() !== '')
      .map(([lang, name]) => ({ setCode: code, lang, name }))
    if (rows.length) await tx.insert(setLocalizations).values(rows)
  })
}

export async function updateSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(sets)
      .set({
        name: input.name,
        releaseDate: input.releaseDate,
        isOfficial: input.isOfficial,
        origin: 'user',
        updatedAt: now,
      })
      .where(eq(sets.code, code))
    for (const [lang, name] of Object.entries(input.localizations)) {
      if (name.trim() === '') {
        await tx
          .delete(setLocalizations)
          .where(and(eq(setLocalizations.setCode, code), eq(setLocalizations.lang, lang)))
      } else {
        await tx
          .insert(setLocalizations)
          .values({ setCode: code, lang, name })
          .onConflictDoUpdate({
            target: [setLocalizations.setCode, setLocalizations.lang],
            set: { name },
          })
      }
    }
  })
}

export async function deleteSet(db: DB, code: string): Promise<void> {
  await db.delete(sets).where(eq(sets.code, code))
}

export async function setSetSymbolVersion(db: DB, code: string, symbolVersion: number | null): Promise<void> {
  await db.update(sets).set({ symbolVersion, updatedAt: new Date() }).where(eq(sets.code, code))
}

export async function listSetsForSitemap(db: DB): Promise<SitemapEntry[]> {
  return db.select({ id: sets.code, updatedAt: sets.updatedAt }).from(sets).orderBy(asc(sets.code))
}

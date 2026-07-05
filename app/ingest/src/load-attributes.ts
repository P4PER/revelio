import type { DB } from '@revelio/db'
import { types, subTypes, lessons, rarities, finishes, legalities } from '@revelio/db'
import { ATTRIBUTES, slugify } from '@revelio/core'
import type { DistCard } from './types.js'

type Provide = { lesson?: string | null }

function distinctAttributes(cards: DistCard[]) {
  const acc = {
    types: new Set<string>(),
    subTypes: new Set<string>(),
    lessons: new Set<string>(),
    rarities: new Set<string>(),
    finishes: new Set<string>(),
    legalities: new Set<string>(),
  }
  for (const c of cards) {
    c.types.forEach((x) => acc.types.add(slugify(x)))
    c.subTypes.forEach((x) => acc.subTypes.add(slugify(x)))
    if (c.lesson) acc.lessons.add(slugify(c.lesson))
    if (c.rarity) acc.rarities.add(slugify(c.rarity))
    if (c.finish) acc.finishes.add(slugify(c.finish))
    if (c.legality) acc.legalities.add(slugify(c.legality))
    for (const p of Array.isArray(c.provides) ? (c.provides as Provide[]) : []) {
      if (p?.lesson) acc.lessons.add(slugify(p.lesson))
    }
  }
  return acc
}

// Ordered vocab: sort_order is the 1-based position in the curated attributes.ts
// array (999 when a derived code is not curated there).
function orderedRows(codes: Set<string>, cfg: readonly { code: string }[]) {
  return [...codes].map((code) => {
    const idx = cfg.findIndex((e) => e.code === code)
    return { code, sortOrder: idx === -1 ? 999 : idx + 1 }
  })
}

// Code-only vocab: no sort_order column.
function codeRows(codes: Set<string>) {
  return [...codes].map((code) => ({ code }))
}

export async function loadAttributes(db: DB, cards: DistCard[]): Promise<void> {
  const d = distinctAttributes(cards)

  const typeRows = orderedRows(d.types, ATTRIBUTES.types)
  if (typeRows.length) await db.insert(types).values(typeRows).onConflictDoNothing()

  const rarityRows = orderedRows(d.rarities, ATTRIBUTES.rarities)
  if (rarityRows.length) await db.insert(rarities).values(rarityRows).onConflictDoNothing()

  const finishRows = orderedRows(d.finishes, ATTRIBUTES.finishes)
  if (finishRows.length) await db.insert(finishes).values(finishRows).onConflictDoNothing()

  const lessonRows = orderedRows(d.lessons, ATTRIBUTES.lessons)
  if (lessonRows.length) await db.insert(lessons).values(lessonRows).onConflictDoNothing()

  const legalityRows = codeRows(d.legalities)
  if (legalityRows.length) await db.insert(legalities).values(legalityRows).onConflictDoNothing()

  const subTypeRows = codeRows(d.subTypes)
  if (subTypeRows.length) await db.insert(subTypes).values(subTypeRows).onConflictDoNothing()
}

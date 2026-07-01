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

// Merge a derived code set with curated sort orders (default 999 when uncurated).
function attributeRows(codes: Set<string>, cfg: readonly { code: string; sortOrder: number }[]) {
  return [...codes].map((code) => ({
    code,
    sortOrder: cfg.find((e) => e.code === code)?.sortOrder ?? 999,
    origin: 'import' as const,
  }))
}

export async function loadAttributes(db: DB, cards: DistCard[]): Promise<void> {
  const d = distinctAttributes(cards)

  const typeRows = attributeRows(d.types, ATTRIBUTES.types)
  if (typeRows.length) await db.insert(types).values(typeRows).onConflictDoNothing()

  const rarityRows = attributeRows(d.rarities, ATTRIBUTES.rarities)
  if (rarityRows.length) await db.insert(rarities).values(rarityRows).onConflictDoNothing()

  const finishRows = attributeRows(d.finishes, ATTRIBUTES.finishes)
  if (finishRows.length) await db.insert(finishes).values(finishRows).onConflictDoNothing()

  const legalityRows = attributeRows(d.legalities, ATTRIBUTES.legalities)
  if (legalityRows.length) await db.insert(legalities).values(legalityRows).onConflictDoNothing()

  // sub_types has no curated config — self-extends from data with default order.
  const subTypeRows = attributeRows(d.subTypes, [])
  if (subTypeRows.length) await db.insert(subTypes).values(subTypeRows).onConflictDoNothing()

  // lessons carry a curated color in addition to sort order.
  const lessonRows = [...d.lessons].map((code) => {
    const cfg = ATTRIBUTES.lessons.find((l) => l.code === code)
    return { code, color: cfg?.color ?? null, sortOrder: cfg?.sortOrder ?? 999, origin: 'import' as const }
  })
  if (lessonRows.length) await db.insert(lessons).values(lessonRows).onConflictDoNothing()
}

import type { DB } from '@revelio/db'
import { types, subTypes, lessons, rarities, finishes, legalities } from '@revelio/db'
import { VOCAB } from '@revelio/core'
import type { DistCard } from './types.js'

type Provide = { lesson?: string | null }

function distinctVocab(cards: DistCard[]) {
  const acc = {
    types: new Set<string>(),
    subTypes: new Set<string>(),
    lessons: new Set<string>(),
    rarities: new Set<string>(),
    finishes: new Set<string>(),
    legalities: new Set<string>(),
  }
  for (const c of cards) {
    c.types.forEach((x) => acc.types.add(x))
    c.subTypes.forEach((x) => acc.subTypes.add(x))
    if (c.lesson) acc.lessons.add(c.lesson)
    if (c.rarity) acc.rarities.add(c.rarity)
    if (c.finish) acc.finishes.add(c.finish)
    if (c.legality) acc.legalities.add(c.legality)
    for (const p of (c.provides as Provide[] | null) ?? []) {
      if (p?.lesson) acc.lessons.add(p.lesson)
    }
  }
  return acc
}

// Merge a derived code set with curated sort orders (default 999 when uncurated).
function vocabRows(codes: Set<string>, cfg: readonly { code: string; sortOrder: number }[]) {
  return [...codes].map((code) => ({
    code,
    sortOrder: cfg.find((e) => e.code === code)?.sortOrder ?? 999,
    origin: 'import' as const,
  }))
}

export async function loadVocab(db: DB, cards: DistCard[]): Promise<void> {
  const d = distinctVocab(cards)

  const typeRows = vocabRows(d.types, VOCAB.types)
  if (typeRows.length) await db.insert(types).values(typeRows).onConflictDoNothing()

  const rarityRows = vocabRows(d.rarities, VOCAB.rarities)
  if (rarityRows.length) await db.insert(rarities).values(rarityRows).onConflictDoNothing()

  const finishRows = vocabRows(d.finishes, VOCAB.finishes)
  if (finishRows.length) await db.insert(finishes).values(finishRows).onConflictDoNothing()

  const legalityRows = vocabRows(d.legalities, VOCAB.legalities)
  if (legalityRows.length) await db.insert(legalities).values(legalityRows).onConflictDoNothing()

  // sub_types has no curated config — self-extends from data with default order.
  const subTypeRows = vocabRows(d.subTypes, [])
  if (subTypeRows.length) await db.insert(subTypes).values(subTypeRows).onConflictDoNothing()

  // lessons carry a curated color in addition to sort order.
  const lessonRows = [...d.lessons].map((code) => {
    const cfg = VOCAB.lessons.find((l) => l.code === code)
    return { code, color: cfg?.color ?? null, sortOrder: cfg?.sortOrder ?? 999, origin: 'import' as const }
  })
  if (lessonRows.length) await db.insert(lessons).values(lessonRows).onConflictDoNothing()
}

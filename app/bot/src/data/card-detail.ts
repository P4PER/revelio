import { getSubTypeLabels } from '@revelio/db'
import type { SearchDocument } from '@revelio/search'
import type { Deps } from '../clients'
import { resolveCardRulings, type CardRuling } from './cards'

export type CardDetail = {
  doc: SearchDocument
  setName: string
  rulings: CardRuling[]
  // Editor-curated sub-type translations for the locale, keyed by code.
  subTypeLabels: Record<string, string>
}

// Everything the card view draws beyond the search document. /card uses it
// now; the browser's "Open a card" and a shared list's "View a card" use it
// from phase 2, so the three can never show one card differently.
export async function loadCardDetail(deps: Deps, doc: SearchDocument, locale: string): Promise<CardDetail> {
  const [setName, rulings, subTypeLabels] = await Promise.all([
    deps.sets.name(doc.setCode, locale),
    resolveCardRulings(deps.db, doc.id, locale),
    getSubTypeLabels(deps.db, locale),
  ])
  return { doc, setName, rulings, subTypeLabels }
}

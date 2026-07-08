'use client'
import { useLocale } from 'next-intl'
import type { SetDTO } from '@revelio/core'
import { FilterSheet, type FilterSelection } from './filter-sheet'

// The deck builder's advanced filters. Lessons (quick-filter buttons) and the
// official/fan split (decided by the deck format) are intentionally absent.
export type DeckFilters = {
  set: string
  types: string[]
  rarities: string[]
  finishes: string[]
  legalities: string[]
  costMin: number | null
  costMax: number | null
}

export const EMPTY_DECK_FILTERS: DeckFilters = {
  set: '', types: [], rarities: [], finishes: [], legalities: [], costMin: null, costMax: null,
}

const numToStr = (n: number | null) => (n == null ? '' : String(n))
const strToNum = (s: string) => (s === '' ? null : Number(s))

// Local-state adapter for FilterSheet: the deck builder owns the applied
// DeckFilters and gets the next set back through onApply. Converts to/from the
// sheet's string-cost FilterSelection and omits the lessons / official sections.
export function DeckFilterDrawer({
  sets, value, onApply,
}: {
  sets: SetDTO[]
  value: DeckFilters
  onApply: (next: DeckFilters) => void
}) {
  const locale = useLocale()

  const selection: FilterSelection = {
    types: value.types,
    lessons: [],
    rarities: value.rarities,
    finishes: value.finishes,
    legalities: value.legalities,
    set: value.set,
    costMin: numToStr(value.costMin),
    costMax: numToStr(value.costMax),
    official: '',
  }

  function handleApply(next: FilterSelection) {
    onApply({
      set: next.set,
      types: next.types,
      rarities: next.rarities,
      finishes: next.finishes,
      legalities: next.legalities,
      costMin: strToNum(next.costMin),
      costMax: strToNum(next.costMax),
    })
  }

  return <FilterSheet sets={sets} value={selection} locale={locale} onApply={handleApply} />
}

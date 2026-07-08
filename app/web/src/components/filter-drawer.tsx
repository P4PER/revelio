'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { FilterSheet, type FilterSelection } from './filter-sheet'

// URL adapter for FilterSheet: reads the applied selection from the /search
// query string and, on apply, writes it back (preserving q and sort). Soft
// navigations don't remount, so the value is derived fresh from the URL on
// every render.
export function FilterDrawer({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const router = useRouter()
  const params = useSearchParams()

  const value: FilterSelection = {
    types: params.getAll('type'),
    lessons: params.getAll('lesson'),
    rarities: params.getAll('rarity'),
    finishes: params.getAll('finish'),
    legalities: params.getAll('legality'),
    set: params.get('set') ?? '',
    costMin: params.get('costMin') ?? '',
    costMax: params.get('costMax') ?? '',
    official: params.get('official') ?? '',
  }

  function handleApply(next: FilterSelection) {
    const p = new URLSearchParams()
    if (params.get('q')) p.set('q', params.get('q')!)
    if (params.get('sort')) p.set('sort', params.get('sort')!)
    for (const c of next.types) p.append('type', c)
    for (const c of next.lessons) p.append('lesson', c)
    for (const c of next.rarities) p.append('rarity', c)
    for (const c of next.finishes) p.append('finish', c)
    for (const c of next.legalities) p.append('legality', c)
    if (next.set) p.set('set', next.set)
    if (next.costMin) p.set('costMin', next.costMin)
    if (next.costMax) p.set('costMax', next.costMax)
    if (next.official) p.set('official', next.official)
    router.push(`/search?${p.toString()}`)
  }

  return (
    <FilterSheet
      sets={sets}
      value={value}
      locale={locale}
      show={{ lessons: true, official: true }}
      onApply={handleApply}
    />
  )
}

'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { FilterSheet, type FilterSelection, type OwnershipValue } from './filter-sheet'

// URL adapter for FilterSheet on the collection "Browse all" tab: like
// FilterDrawer, but also carries the ownership facet (?owned=) and keeps the
// tab param so applying filters stays on the browse view. Ownership is drafted
// inside the sheet and handed back via onApply, so Clear-all resets it too.
export function CollectionFilterDrawer({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
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
    owned: (params.get('owned') as OwnershipValue) ?? '',
  }

  function handleApply(next: FilterSelection) {
    const p = new URLSearchParams()
    p.set('tab', 'browse')
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
    if (next.owned) p.set('owned', next.owned)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <FilterSheet
      sets={sets}
      value={value}
      locale={locale}
      show={{ lessons: true, official: true, ownership: true }}
      size="default"
      onApply={handleApply}
    />
  )
}

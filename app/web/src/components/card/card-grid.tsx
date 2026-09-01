import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { SearchDocument } from '@revelio/search'
import { CardTile } from '@/components/card/card-tile'
import { EmptyResults } from '@/components/empty-results'

export function CardGrid({
  hits, imageBase, searchParams, startIndex = 0, empty,
}: {
  hits: SearchDocument[]
  imageBase: string
  searchParams?: URLSearchParams
  startIndex?: number
  // Surface-specific zero-result state. Callers that know why their list is
  // empty (the search page knows the query and filters, a set page knows it is
  // a data gap) pass their own; the fallback is the generic card-grid one.
  empty?: ReactNode
}) {
  const t = useTranslations('search')
  if (hits.length === 0) {
    return empty ?? <EmptyResults heading={t('empty.heading')} description={t('empty.plain')} />
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {hits.map((hit, i) => (
        <li key={hit.id}>
          <CardTile
            hit={hit}
            imageBase={imageBase}
            context={searchParams ? { params: searchParams, index: startIndex + i } : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

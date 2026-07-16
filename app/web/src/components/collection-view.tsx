'use client'
import { useTranslations } from 'next-intl'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CollectionSidebar } from '@/components/collection-sidebar'
import { CollectionCardTile, type CollectionCard } from '@/components/collection-card-tile'
import { CollectionFilterDrawer } from '@/components/collection-filter-drawer'
import type { SetDTO, SetProgress, OwnedQuantities } from '@revelio/core'

export function CollectionView({
  sets, progress, selectedSet, cards, browseCards, quantities, editable, locale, mode,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selectedSet: string
  cards: CollectionCard[]        // cards of the selected set (By set mode)
  browseCards: CollectionCard[]  // flat search results (Browse all mode)
  quantities: OwnedQuantities
  editable: boolean
  locale: string
  mode: 'sets' | 'browse'
}) {
  const t = useTranslations('collection')
  const grid = (list: CollectionCard[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {list.map((c) => (
        <li key={c.id}>
          <CollectionCardTile card={c} quantities={quantities[c.id] ?? {}} editable={editable} locale={locale} />
        </li>
      ))}
    </ul>
  )
  return (
    <Tabs defaultValue={mode}>
      <TabsList className="mb-4">
        <TabsTrigger value="sets">{t('bySets')}</TabsTrigger>
        <TabsTrigger value="browse">{t('browseAll')}</TabsTrigger>
      </TabsList>

      <TabsContent value="sets">
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <aside>
            <CollectionSidebar sets={sets} progress={progress} selected={selectedSet}
              hrefFor={(c) => `?tab=sets&set=${c}`} />
          </aside>
          <section className="hidden md:block">
            {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
          </section>
        </div>
      </TabsContent>

      <TabsContent value="browse">
        <div className="mb-4"><CollectionFilterDrawer sets={sets} locale={locale} /></div>
        {browseCards.length ? grid(browseCards) : <p className="text-muted-foreground">{t('empty')}</p>}
      </TabsContent>
    </Tabs>
  )
}

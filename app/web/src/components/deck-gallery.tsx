'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import { imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView } from '@revelio/core'
import { CardRotate } from '@/components/card-rotate'
import { CardDetailSheet } from '@/components/card-detail-sheet'
import { groupColor, groupLabel, groupMainEntries } from '@/lib/deck-groups'

function GalleryTile({
  entry,
  imageBase,
  onInfo,
}: {
  entry: DeckCardView
  imageBase: string
  onInfo: () => void
}) {
  const t = useTranslations('decks')
  const [broken, setBroken] = useState(false)
  return (
    <div className="group relative aspect-[63/88] overflow-hidden rounded-lg border border-border bg-muted">
      {broken || entry.imageVersion == null ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {entry.name}
        </div>
      ) : (
        <CardRotate
          src={imageUrl(imageBase, thumbKey(entry.cardId, entry.imageVersion))}
          alt={entry.name}
          orientation={entry.orientation}
          sizes="(max-width: 640px) 30vw, 160px"
          onError={() => setBroken(true)}
        />
      )}
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
        {entry.quantity}×
      </span>
      <button
        type="button"
        aria-label={t('browse.infoAria', { name: entry.name })}
        onClick={onInfo}
        className="absolute top-2 right-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Info className="size-5" />
      </button>
    </div>
  )
}

function Grid({
  entries,
  imageBase,
  onInfo,
}: {
  entries: DeckCardView[]
  imageBase: string
  onInfo: (cardId: string) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {entries.map((e) => (
        <GalleryTile key={`${e.zone}-${e.cardId}`} entry={e} imageBase={imageBase} onInfo={() => onInfo(e.cardId)} />
      ))}
    </div>
  )
}

export function DeckGallery({ entries, imageBase }: { entries: DeckCardView[]; imageBase: string }) {
  const t = useTranslations('decks')
  const [detailId, setDetailId] = useState<string | null>(null)
  const character = entries.filter((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainGroups = groupMainEntries(main)

  return (
    <div className="space-y-6">
      {character.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">{t('panel.character')}</h3>
          <Grid entries={character} imageBase={imageBase} onInfo={setDetailId} />
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">{t('panel.main')}</h3>
        {main.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('panel.emptyMain')}</p>
        ) : (
          <div className="space-y-4">
            {[...mainGroups.entries()].map(([key, list]) => (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-4 w-1 rounded-sm" style={{ backgroundColor: groupColor(key) }} aria-hidden />
                  {groupLabel(key, t)}
                  <span className="ml-auto text-xs font-medium text-muted-foreground">
                    {list.reduce((n, e) => n + e.quantity, 0)}
                  </span>
                </div>
                <Grid entries={list} imageBase={imageBase} onInfo={setDetailId} />
              </div>
            ))}
          </div>
        )}
      </section>
      {sideboard.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">{t('panel.sideboard')}</h3>
          <Grid entries={sideboard} imageBase={imageBase} onInfo={setDetailId} />
        </section>
      )}

      <CardDetailSheet
        cardId={detailId}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />
    </div>
  )
}

'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView } from '@revelio/core'

function GalleryTile({ entry, imageBase }: { entry: DeckCardView; imageBase: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="relative aspect-[63/88] overflow-hidden rounded-lg border border-border bg-muted">
      {broken ? (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {entry.name}
        </div>
      ) : (
        <Image
          src={imageUrl(imageBase, thumbKey(entry.cardId))}
          alt={entry.name}
          fill
          sizes="(max-width: 640px) 30vw, 160px"
          className="object-cover"
          onError={() => setBroken(true)}
        />
      )}
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
        {entry.quantity}×
      </span>
    </div>
  )
}

function Grid({ entries, imageBase }: { entries: DeckCardView[]; imageBase: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {entries.map((e) => (
        <GalleryTile key={`${e.zone}-${e.cardId}`} entry={e} imageBase={imageBase} />
      ))}
    </div>
  )
}

export function DeckGallery({ entries, imageBase }: { entries: DeckCardView[]; imageBase: string }) {
  const t = useTranslations('decks')
  const character = entries.filter((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')

  return (
    <div className="space-y-6">
      {character.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.character')}</h3>
          <Grid entries={character} imageBase={imageBase} />
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.main')}</h3>
        {main.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('panel.emptyMain')}</p>
        ) : (
          <Grid entries={main} imageBase={imageBase} />
        )}
      </section>
      {sideboard.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">{t('panel.sideboard')}</h3>
          <Grid entries={sideboard} imageBase={imageBase} />
        </section>
      )}
    </div>
  )
}

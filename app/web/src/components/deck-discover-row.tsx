'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Heart, Eye } from 'lucide-react'
import type { PublicDeckEntry } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { formatRelativeTime } from '@/lib/relative-time'

export function DeckDiscoverRow({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  return (
    <Link
      href={`/decks/${deck.id}`}
      className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <DeckArt cardId={deck.starterCardId} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="size-14 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-medium">{deck.name}</div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">
            @{deck.author} · {t(`explore.format.${deck.format}`)}
          </span>
          <span className="shrink-0">·</span>
          <LessonIcons codes={deck.lessons} size={16} />
          <span className="shrink-0">·</span>
          <span className="shrink-0 italic">{formatRelativeTime(deck.updatedAt, locale)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Heart className="size-4" />{deck.likeCount}</span>
        <span className="inline-flex items-center gap-1"><Eye className="size-4" />{deck.viewCount}</span>
      </div>
    </Link>
  )
}

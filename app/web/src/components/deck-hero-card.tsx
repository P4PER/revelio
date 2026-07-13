'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Heart, Eye } from 'lucide-react'
import type { PublicDeckEntry } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { formatRelativeTime } from '@/lib/relative-time'

export function DeckHeroCard({ deck, imageBase }: { deck: PublicDeckEntry; imageBase: string }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  return (
    <Link
      href={`/decks/${deck.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-[7/5]">
        <DeckArt cardId={deck.starterCardId} lessons={deck.lessons} imageBase={imageBase} alt={deck.name} className="h-full w-full" />
        {/* radial vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(0,0,0,0.35))]" />
        {/* top scrim + name/meta */}
        <div
          className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/45 to-transparent p-3 pb-8"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          <div className="line-clamp-2 text-lg font-semibold text-white">{deck.name}</div>
          <div className="text-sm text-white/90">
            {t(`explore.format.${deck.format}`)}
          </div>
        </div>
        {/* bottom scrim + lessons/stats */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
          <LessonIcons codes={deck.lessons} size={18} />
          <div className="flex items-center gap-3 text-sm text-white">
            <span className="inline-flex items-center gap-1"><Heart className="size-4" />{deck.likeCount}</span>
            <span className="inline-flex items-center gap-1"><Eye className="size-4" />{deck.viewCount}</span>
          </div>
        </div>
      </div>
      {/* footer bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate text-sm">@{deck.author}</span>
        <span className="shrink-0 italic">{formatRelativeTime(deck.updatedAt, locale)}</span>
      </div>
    </Link>
  )
}

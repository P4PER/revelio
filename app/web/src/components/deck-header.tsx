'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Eye } from 'lucide-react'
import type { DeckFormat } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck-art'
import { LessonIcons } from '@/components/lesson-icons'
import { DeckLikeButton } from '@/components/deck-like-button'
import { Badge } from '@/components/ui/badge'

export type DeckHeaderProps = {
  deckId: string
  name: string
  format: DeckFormat
  updatedAt: string
  visibility: 'private' | 'public'
  viewCount: number
  likeCount: number
  liked: boolean
  loggedIn: boolean
  imageBase: string
  ownerUsername: string | null
  starterCardId: string | null
  starterArtCropVersion: number | null
  lessons: string[]
}

const SHADOW = { textShadow: '0 1px 3px rgba(0,0,0,0.9)' } as const

export function DeckHeader(props: DeckHeaderProps) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(props.updatedAt))

  return (
    <div className="relative flex min-h-[230px] overflow-hidden rounded-xl border border-border">
      {/* Starter-character art fills the banner; DeckArt falls back to a
          lesson-colour gradient (then bg-muted) when there's no starter. */}
      <div className="absolute inset-0">
        <DeckArt
          cardId={props.starterCardId}
          version={props.starterArtCropVersion}
          lessons={props.lessons}
          imageBase={props.imageBase}
          alt={props.name}
          className="h-full w-full"
        />
      </div>
      {/* Horizontal fade: the art dissolves into the app background on the left,
          where the name/meta sit, and stays visible on the right. A gentle
          bottom fade grounds the lower edge. Colours are the app's indigo
          background (#13122A); the app is single-theme. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, #13122A 0%, #13122A 22%, rgba(19,18,42,0.55) 56%, rgba(19,18,42,0) 88%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/65 to-transparent" />

      <div className="relative z-10 flex w-full flex-col justify-between gap-6 p-5">
        <div className="flex items-start justify-between gap-3">
          {props.ownerUsername ? (
            <Link
              href={`/decks?q=@${props.ownerUsername}`}
              aria-label={t('overview.viewAuthorDecks', { username: props.ownerUsername })}
              className="truncate text-sm font-semibold text-white/90 transition-colors hover:text-white"
              style={SHADOW}
            >
              <span className="relative bottom-px text-primary">@</span>
              {props.ownerUsername}
            </Link>
          ) : (
            <span />
          )}
          <Badge variant={props.visibility === 'public' ? 'default' : 'secondary'}>
            {t(`list.visibility.${props.visibility}`)}
          </Badge>
        </div>

        <div style={SHADOW}>
          <h1 className="text-3xl font-bold text-balance text-white sm:text-4xl">{props.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-white/90">
            <span>
              {t(`format.${props.format}`)} · {t('overview.updatedAt', { date: updated })}
            </span>
            <span
              className="inline-flex items-center gap-1"
              aria-label={t('overview.views', { count: props.viewCount })}
            >
              <Eye className="size-5" />
              {props.viewCount}
            </span>
            <DeckLikeButton
              deckId={props.deckId}
              initialLiked={props.liked}
              initialCount={props.likeCount}
              loggedIn={props.loggedIn}
              className="text-white/90 hover:text-white"
            />
            {props.lessons.length > 0 && (
              <span className="ml-auto">
                <LessonIcons codes={props.lessons} size={20} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

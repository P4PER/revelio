'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Eye } from 'lucide-react'
import type { DeckFormat } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { DeckArt } from '@/components/deck/deck-art'
import { LessonIcons } from '@/components/deck/lesson-icons'
import { DeckLikeButton } from '@/components/deck/deck-like-button'
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

// Directional scrim: heaviest under the text on the left, nearly clear on the
// right so the starter art stays vivid. Deliberately built on --dark-background
// rather than --background: the latter is parchment in light mode, so it
// LIGHTENED the art under white text and the banner washed out (2.50:1 on pale
// art, 1.74:1 once the old bottom gradient landed).
const MIX = (pct: number) => `color-mix(in srgb, var(--dark-background) ${pct}%, transparent)`
const SCRIM = {
  backgroundImage: `linear-gradient(100deg, ${MIX(92)} 0%, ${MIX(78)} 34%, ${MIX(28)} 66%, ${MIX(6)} 100%)`,
} as const

export function DeckHeader(props: DeckHeaderProps) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(props.updatedAt))

  return (
    <div className="relative flex min-h-[180px] overflow-hidden rounded-xl border border-border bg-(--dark-background) sm:min-h-[230px]">
      {/* Softly blurred full-bleed art under a wash, so the text side carries a
          picture rather than flat colour. Falls back to a lesson gradient. */}
      <div className="absolute inset-0 scale-110 blur-md">
        <DeckArt
          cardId={props.starterCardId}
          version={props.starterArtCropVersion}
          lessons={props.lessons}
          imageBase={props.imageBase}
          alt=""
          className="h-full w-full"
        />
      </div>
      <div className="pointer-events-none absolute inset-0" style={SCRIM} />
      <div className="pointer-events-none absolute inset-0 bg-brand-indigo/12" />

      {/* Crisp starter art on the right, masked so its left edge dissolves into
          the field. Width capped near the crop's native size (520px) to stay sharp. */}
      <div
        className="absolute inset-y-0 right-0 hidden w-2/5 max-w-[620px] sm:block"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 40%, #000 72%)',
          maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 40%, #000 72%)',
        }}
      >
        <DeckArt
          cardId={props.starterCardId}
          version={props.starterArtCropVersion}
          lessons={props.lessons}
          imageBase={props.imageBase}
          alt={props.name}
          className="h-full w-full"
        />
      </div>

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
              <span className="ml-auto inline-flex items-center rounded-full bg-black/50 px-2 py-1">
                <LessonIcons codes={props.lessons} size={20} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

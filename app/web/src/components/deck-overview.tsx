'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, Eye, LayoutGrid, List } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { useRouter } from '@/../i18n/navigation'
import { deckStats } from '@/lib/deck-stats'
import { DeckPanel } from '@/components/deck-panel'
import { DeckGallery } from '@/components/deck-gallery'
import { DeckStatsPanel } from '@/components/deck-stats-panel'
import { DeckLegalityBar } from '@/components/deck-legality-bar'
import { DeckLikeButton } from '@/components/deck-like-button'
import { DeckOverviewActions } from '@/components/deck-overview-actions'
import { recordViewAction } from '@/lib/deck-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DECK_VIEW_COOKIE, type DeckView as View } from '@/lib/deck-view'

export type DeckOverviewProps = {
  deckId: string
  name: string
  format: DeckFormat
  visibility: 'private' | 'public'
  createdAt: string
  updatedAt: string
  views: DeckCardView[]
  isOwner: boolean
  loggedIn: boolean
  imageBase: string
  likeCount: number
  liked: boolean
  viewCount: number
  // Persisted view preference, read from a cookie on the server so the correct
  // view renders on first paint (no list→gallery flash on reload).
  initialView?: View
}

export function DeckOverview(props: DeckOverviewProps) {
  const { deckId, name, format, visibility, updatedAt, views, isOwner, loggedIn, imageBase } = props
  const t = useTranslations('decks')
  const locale = useLocale()
  const router = useRouter()
  const [view, setView] = useState<View>(props.initialView ?? 'list')

  // Go back to wherever the user came from (public list, My Decks, …). Falls
  // back to My Decks when the deck was opened directly with no in-app history.
  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/decks/mine')
  }

  function changeView(next: View) {
    setView(next)
    // Persist in a cookie (not localStorage) so the server can pre-render this
    // view on the next reload, avoiding a flash of the default view.
    document.cookie = `${DECK_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  useEffect(() => {
    // Record a unique view (logged-in-only, deduped server-side). Fired here on
    // mount rather than in the page's server render, which Next may run/prefetch
    // repeatedly. deckId is stable for a mounted overview, so this fires once.
    // Best-effort: a failed view record (auth expiry, network blip) must not
    // surface as an unhandled promise rejection.
    if (loggedIn) void recordViewAction(deckId).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const { status, mainCount } = deckStats(views, format)
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(updatedAt))

  return (
    <div className="space-y-4">
      {loggedIn && (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('overview.back')}
        </button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">{name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground">
            <span>
              {t(`format.${format}`)} · {t('overview.updatedAt', { date: updated })}
            </span>
            <span className="ml-3 inline-flex items-center gap-1" aria-label={t('overview.views', { count: props.viewCount })}>
              <Eye className="size-5" />
              {props.viewCount}
            </span>
            <DeckLikeButton deckId={deckId} initialLiked={props.liked} initialCount={props.likeCount} loggedIn={loggedIn} />
          </div>
        </div>
        <Badge variant={visibility === 'public' ? 'default' : 'secondary'}>
          {t(`list.visibility.${visibility}`)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DeckOverviewActions
          deckId={deckId}
          name={name}
          format={format}
          visibility={visibility}
          views={views}
          isOwner={isOwner}
          loggedIn={loggedIn}
        />
        <div className="inline-flex rounded-md border border-border p-0.5">
          <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => changeView('list')}>
            <List className="size-4" />
            {t('overview.viewList')}
          </Button>
          <Button size="sm" variant={view === 'gallery' ? 'secondary' : 'ghost'} onClick={() => changeView('gallery')}>
            <LayoutGrid className="size-4" />
            {t('overview.viewGallery')}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <DeckStatsPanel entries={views} />
        <DeckLegalityBar
          status={status}
          mainCount={mainCount}
          hasCharacter={views.some((e) => e.zone === 'character')}
          className="border-b border-border/60 px-4 py-3"
        />
        {view === 'list' ? (
          <DeckPanel entries={views} imageBase={imageBase} readOnly />
        ) : (
          <div className="p-4">
            <DeckGallery entries={views} imageBase={imageBase} />
          </div>
        )}
      </div>
    </div>
  )
}

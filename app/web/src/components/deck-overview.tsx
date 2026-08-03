'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutGrid, List } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { deckStats } from '@/lib/deck-stats'
import { DeckHeader } from '@/components/deck-header'
import { DeckPanel } from '@/components/deck-panel'
import { DeckGallery } from '@/components/deck-gallery'
import { DeckStatsPanel } from '@/components/deck-stats-panel'
import { DeckLegalityBar } from '@/components/deck-legality-bar'
import { DeckOverviewActions } from '@/components/deck-overview-actions'
import { recordViewAction } from '@/lib/deck-actions'
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
  ownerUsername: string | null
  // Persisted view preference, read from a cookie on the server so the correct
  // view renders on first paint (no list→gallery flash on reload).
  initialView?: View
}

export function DeckOverview(props: DeckOverviewProps) {
  const { deckId, name, format, visibility, updatedAt, views, isOwner, loggedIn, imageBase } = props
  const t = useTranslations('decks')
  const [view, setView] = useState<View>(props.initialView ?? 'list')

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
  const starter = views.find((v) => v.zone === 'character')
  const lessons = [...new Set(views.map((v) => v.lesson).filter((l): l is string => Boolean(l)))]

  return (
    <div className="space-y-4">
      <DeckHeader
        deckId={deckId}
        name={name}
        format={format}
        updatedAt={updatedAt}
        visibility={visibility}
        viewCount={props.viewCount}
        likeCount={props.likeCount}
        liked={props.liked}
        loggedIn={loggedIn}
        imageBase={imageBase}
        ownerUsername={props.ownerUsername}
        starterCardId={starter?.cardId ?? null}
        starterArtCropVersion={starter?.artCropVersion ?? null}
        lessons={lessons}
      />

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
        <div className="flex items-center gap-1" role="group" aria-label={t('overview.viewLabel')}>
          <Button size="icon-sm" variant={view === 'list' ? 'secondary' : 'ghost'}
            onClick={() => changeView('list')} aria-label={t('overview.viewList')} title={t('overview.viewList')}>
            <List className="size-4" />
          </Button>
          <Button size="icon-sm" variant={view === 'gallery' ? 'secondary' : 'ghost'}
            onClick={() => changeView('gallery')} aria-label={t('overview.viewGallery')} title={t('overview.viewGallery')}>
            <LayoutGrid className="size-4" />
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

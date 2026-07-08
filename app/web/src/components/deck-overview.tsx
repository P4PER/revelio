'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, LayoutGrid, List } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { deckStats } from '@/lib/deck-stats'
import { DeckPanel } from '@/components/deck-panel'
import { DeckGallery } from '@/components/deck-gallery'
import { DeckOverviewActions } from '@/components/deck-overview-actions'
import { LegalitySeal } from '@/components/legality-seal'
import { LessonCurve } from '@/components/lesson-curve'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const VIEW_KEY = 'revelio.deck.view'
type View = 'list' | 'gallery'

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
}

export function DeckOverview(props: DeckOverviewProps) {
  const { deckId, name, format, visibility, updatedAt, views, isOwner, loggedIn, imageBase } = props
  const t = useTranslations('decks')
  const locale = useLocale()
  const [view, setView] = useState<View>('list')

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    // Intentional: mount-only sync of the persisted view preference from
    // localStorage into state. Defaulting to 'list' for the server/first client
    // render avoids a hydration mismatch; the effect switches after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'list' || saved === 'gallery') setView(saved)
  }, [])

  function changeView(next: View) {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const { status, violations, mainEntries, mainCount } = deckStats(views, format)
  const totalCards = views.reduce((n, e) => n + e.quantity, 0)
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(updatedAt))

  return (
    <div className="space-y-4">
      {loggedIn && (
        <Link
          href="/decks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('overview.backToDecks')}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`format.${format}`)} · {t('overview.cardCount', { count: totalCards })} ·{' '}
            {t('overview.updatedAt', { date: updated })}
          </p>
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

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <LegalitySeal status={status} mainCount={mainCount} violations={violations} />
        <div className="min-w-[220px] flex-1">
          <LessonCurve entries={mainEntries} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {view === 'list' ? (
          <DeckPanel entries={views} readOnly />
        ) : (
          <div className="p-4">
            <DeckGallery entries={views} imageBase={imageBase} />
          </div>
        )}
      </div>
    </div>
  )
}

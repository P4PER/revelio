'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { CardDetailDTO } from '@revelio/core'
import { getCardDetailAction } from '@/lib/actions/deck-actions'
import { pickLocalization } from '@/lib/card-view'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { isHorizontal } from '@/components/card-image'
import { CardDetail } from '@/components/card-detail'
import { cn } from '@/lib/utils'

// Card detail Sheet used by the deck builder's card browser: the browser owns
// which card is being inspected (`cardId`, or null when closed). The fetching
// body is keyed by cardId so it remounts (fresh loading state) whenever the
// inspected card changes, instead of resetting state imperatively in an effect.
export function CardDetailSheet({
  cardId,
  orientation,
  imageBase,
  onOpenChange,
}: {
  cardId: string | null
  // Orientation of the inspected card, known by the caller from its own card
  // list. Only used to size the loading skeleton's image frame.
  orientation?: string | null
  imageBase: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={cardId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full gap-0 overflow-y-auto sm:max-w-4xl">
        {cardId && (
          <CardDetailBody key={cardId} cardId={cardId} orientation={orientation} imageBase={imageBase} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function CardDetailBody({
  cardId,
  orientation,
  imageBase,
}: {
  cardId: string
  orientation?: string | null
  imageBase: string
}) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [card, setCard] = useState<CardDetailDTO | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getCardDetailAction(cardId, locale)
      .then((c) => {
        if (!cancelled) setCard(c)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardId, locale])

  const title = card ? (pickLocalization(card, locale).loc?.name ?? card.name) : t('browse.detailTitle')

  return (
    <>
      <SheetHeader>
        <SheetTitle className="sr-only">{title}</SheetTitle>
      </SheetHeader>
      {loading && <CardDetailSkeleton label={t('browse.detailLoading')} orientation={orientation} />}
      {!loading && !card && (
        <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
          {t('browse.detailError')}
        </p>
      )}
      {!loading && card && <CardDetail card={card} locale={locale} imageBase={imageBase} />}
    </>
  )
}

// Placeholder for CardDetail while the card is fetched. Mirrors that component's
// grid (image column plus text column), including the wider frame a horizontal
// card gets, so the real content lands in place instead of shifting in.
function CardDetailSkeleton({ label, orientation }: { label: string; orientation?: string | null }) {
  const horizontal = isHorizontal(orientation)

  return (
    <div
      role="status"
      aria-label={label}
      className="mx-auto grid w-full max-w-[76rem] gap-8 px-6 py-8 md:grid-cols-[auto_1fr]"
    >
      <div className={cn('w-full', horizontal ? 'md:w-[476px]' : 'md:w-[340px]')}>
        <Skeleton className={cn('w-full rounded-xl', horizontal ? 'aspect-[7/5]' : 'aspect-[5/7]')} />
      </div>
      <div>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="mt-6 h-5 w-1/2" />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
    </div>
  )
}

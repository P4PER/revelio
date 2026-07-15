'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { CardDetailDTO } from '@revelio/core'
import { getCardDetailAction } from '@/lib/deck-actions'
import { pickLocalization } from '@/lib/card-view'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CardDetail } from '@/components/card-detail'

// Card detail Sheet used by the deck builder's card browser: the browser owns
// which card is being inspected (`cardId`, or null when closed). The fetching
// body is keyed by cardId so it remounts (fresh loading state) whenever the
// inspected card changes, instead of resetting state imperatively in an effect.
export function CardDetailSheet({
  cardId,
  imageBase,
  onOpenChange,
}: {
  cardId: string | null
  imageBase: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={cardId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full gap-0 overflow-y-auto sm:max-w-4xl">
        {cardId && <CardDetailBody key={cardId} cardId={cardId} imageBase={imageBase} />}
      </SheetContent>
    </Sheet>
  )
}

function CardDetailBody({ cardId, imageBase }: { cardId: string; imageBase: string }) {
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
      {loading && (
        <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
          {t('browse.detailLoading')}
        </p>
      )}
      {!loading && !card && (
        <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
          {t('browse.detailError')}
        </p>
      )}
      {!loading && card && <CardDetail card={card} locale={locale} imageBase={imageBase} />}
    </>
  )
}

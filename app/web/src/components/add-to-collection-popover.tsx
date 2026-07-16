'use client'
import { useTranslations } from 'next-intl'
import { Library } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CardFinishStepper } from '@/components/card-finish-stepper'
import { attrLabel } from '@/lib/attribute-labels'

export function AddToCollectionPopover({
  cardId, finishes, quantities, locale,
}: {
  cardId: string
  finishes: string[]
  quantities: Record<string, number>
  locale: string
}) {
  const t = useTranslations('collection')
  const total = Object.values(quantities).reduce((a, b) => a + b, 0)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={total > 0 ? 'secondary' : 'default'} size="sm" className="gap-1.5">
          <Library className="size-3.5" />
          {total > 0 ? `${t('inCollection')} · ${total}` : t('addToCollection')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2">
        {finishes.map((f) => (
          <CardFinishStepper key={f} cardId={cardId} finish={f}
            label={attrLabel('finishes', f, locale)} quantity={quantities[f] ?? 0} />
        ))}
      </PopoverContent>
    </Popover>
  )
}

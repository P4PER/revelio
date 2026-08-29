'use client'
import { useState, useTransition } from 'react'
import { Minus, Plus } from 'lucide-react'
import { setCardQuantityAction } from '@/lib/actions/collection-actions'

export function CardFinishStepper({
  cardId, finish, label, quantity, editable = true,
}: {
  cardId: string
  finish: string
  label: string
  quantity: number
  editable?: boolean
}) {
  const [qty, setQty] = useState(quantity)
  const [pending, start] = useTransition()

  function commit(next: number) {
    const target = Math.max(0, next)
    const prev = qty // last-known-good, not the mount-time prop
    setQty(target) // optimistic
    start(async () => {
      const res = await setCardQuantityAction(cardId, finish, target)
      if (!res.ok) setQty(prev) // revert on failure
    })
  }

  return (
    <div
      data-testid={`stepper-${cardId}-${finish}`}
      // Borderless row that blends into its surrounding panel (the collection
      // tile and the card page's collection panel both own the surface).
      className="flex items-center justify-between gap-2 px-1"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      {editable ? (
        <span className="flex items-center gap-1.5">
          <button type="button" aria-label={`decrement ${label}`} disabled={pending || qty === 0}
            onClick={() => commit(qty - 1)}
            className="grid size-5 cursor-pointer place-items-center rounded border border-input disabled:cursor-default disabled:opacity-40">
            <Minus className="size-3" />
          </button>
          <span className="min-w-4 text-center text-sm font-semibold tabular-nums">{qty}</span>
          <button type="button" aria-label={`increment ${label}`} disabled={pending}
            onClick={() => commit(qty + 1)}
            className="grid size-5 cursor-pointer place-items-center rounded bg-primary text-primary-foreground disabled:cursor-default">
            <Plus className="size-3" />
          </button>
        </span>
      ) : (
        <span className="text-sm font-semibold tabular-nums">{qty}</span>
      )}
    </div>
  )
}

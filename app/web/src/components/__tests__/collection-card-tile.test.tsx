import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CollectionCardTile } from '@/components/collection-card-tile'

vi.mock('@/lib/collection-actions', () => ({ setCardQuantityAction: vi.fn(async () => ({ ok: true })) }))

const card = { id: 'bs-1', name: 'Harry', finishes: ['normal', 'holo'] }

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={{}}>{ui}</NextIntlClientProvider>)
}

describe('CollectionCardTile', () => {
  it('marks a card with zero owned as not-owned', () => {
    wrap(<CollectionCardTile card={card} quantities={{}} editable />)
    expect(screen.getByTestId('card-tile-bs-1').dataset.owned).toBe('false')
  })
  it('marks a card with any owned copy as owned and shows the total badge', () => {
    wrap(<CollectionCardTile card={card} quantities={{ normal: 2, holo: 1 }} editable />)
    const tile = screen.getByTestId('card-tile-bs-1')
    expect(tile.dataset.owned).toBe('true')
    expect(screen.getByTestId('owned-badge-bs-1').textContent).toBe('3')
  })
  it('renders one stepper per card finish', () => {
    wrap(<CollectionCardTile card={card} quantities={{}} editable />)
    expect(screen.getAllByTestId(/^stepper-bs-1-/)).toHaveLength(2)
  })
  it('hides steppers when not editable', () => {
    wrap(<CollectionCardTile card={card} quantities={{ normal: 1 }} editable={false} />)
    expect(screen.queryByTestId(/^stepper-bs-1-/)).toBeNull()
  })
})

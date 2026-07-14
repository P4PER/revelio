import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck-panel'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
  }
}

describe('DeckPanel readOnly', () => {
  const entries = [view('harry', 'character', 1), view('accio', 'main', 4)]

  it('renders quantities without stepper buttons when readOnly', () => {
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" readOnly />)
    expect(screen.getByText('4×')).toBeInTheDocument()
    expect(screen.queryByLabelText('Increase accio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease accio')).not.toBeInTheDocument()
  })

  it('renders stepper buttons when not readOnly', () => {
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" onQuantityChange={() => {}} />)
    expect(screen.getByLabelText('Increase accio')).toBeInTheDocument()
  })
})

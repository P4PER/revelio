import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckGallery } from '@/components/deck-gallery'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
  }
}

describe('DeckGallery', () => {
  it('renders a tile per card with a quantity badge', () => {
    const entries = [
      view('harry', 'character', 1),
      view('accio', 'main', 4),
      view('side1', 'sideboard', 2),
    ]
    renderWithIntl(<DeckGallery entries={entries} imageBase="https://img.example" />)
    expect(screen.getByAltText('accio')).toBeInTheDocument()
    expect(screen.getByText('4×')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByText('1×')).toBeInTheDocument()
  })

  it('shows a rotate button for a horizontal deck card', () => {
    const entries: DeckCardView[] = [{ ...view('dean', 'main', 1), orientation: 'horizontal' }]
    renderWithIntl(<DeckGallery entries={entries} imageBase="https://img.example" />)
    expect(screen.getByRole('button', { name: /rotate upright/i })).toBeInTheDocument()
  })
})

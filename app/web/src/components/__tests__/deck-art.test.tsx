import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DeckArt } from '@/components/deck-art'

describe('DeckArt', () => {
  it('renders the cropped starter image when a card id and base are given', () => {
    const { container } = render(<DeckArt cardId="c-1" lessons={['charms']} imageBase="https://img.test" alt="Deck" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://img.test/cards/c-1.webp')
    expect(img).toHaveAttribute('alt', 'Deck')
  })

  it('renders no image (gradient fallback) when there is no card id', () => {
    const { container } = render(<DeckArt cardId={null} lessons={['charms', 'potions']} imageBase="https://img.test" alt="Deck" />)
    expect(container.querySelector('img')).toBeNull()
    // gradient element present
    expect(container.querySelector('[data-slot="deck-art-fallback"]')).not.toBeNull()
  })
})

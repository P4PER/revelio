import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DeckArt } from '@/components/deck-art'

describe('DeckArt', () => {
  it('renders the baked art-crop image (no transform) when a card id and base are given', () => {
    const { container } = render(<DeckArt cardId="c-1" version={7} lessons={['charms']} imageBase="https://img.test" alt="Deck" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://img.test/cards/art-crop/c-1.7.webp')
    expect(img).toHaveAttribute('alt', 'Deck')
    expect(img).toHaveClass('object-cover')
    expect(img?.getAttribute('style') ?? '').not.toContain('rotate')
  })

  it('renders no image (gradient fallback) when there is no card id', () => {
    const { container } = render(<DeckArt cardId={null} version={null} lessons={['charms', 'potions']} imageBase="https://img.test" alt="Deck" />)
    expect(container.querySelector('img')).toBeNull()
    // gradient element present
    expect(container.querySelector('[data-slot="deck-art-fallback"]')).not.toBeNull()
  })

  // The fallback used to bake LESSONS[].color, the WotC card-frame hexes, which
  // are tuned for a midnight frame and wash out on parchment. It reads the
  // per-theme custom properties instead.
  it('paints the fallback from the theme lesson tints, not baked hexes', () => {
    const { container } = render(
      <DeckArt cardId={null} version={null} lessons={['charms', 'potions']} imageBase="" alt="Deck" />,
    )
    const style = container.querySelector('[data-slot="deck-art-fallback"]')?.getAttribute('style') ?? ''
    expect(style).toContain('var(--lesson-charms)')
    expect(style).toContain('var(--lesson-potions)')
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  // A single lesson fades into itself. The alpha has to come from color-mix:
  // the old `${hex}99` string concatenation is impossible against a var().
  it('fades a single lesson with color-mix rather than an appended alpha', () => {
    const { container } = render(
      <DeckArt cardId={null} version={null} lessons={['quidditch']} imageBase="" alt="Deck" />,
    )
    const style = container.querySelector('[data-slot="deck-art-fallback"]')?.getAttribute('style') ?? ''
    expect(style).toContain('color-mix(in srgb, var(--lesson-quidditch) 60%, transparent)')
  })

  it('falls through to the muted container when no lesson is known', () => {
    const { container } = render(
      <DeckArt cardId={null} version={null} lessons={['not_a_lesson']} imageBase="" alt="Deck" />,
    )
    const style = container.querySelector('[data-slot="deck-art-fallback"]')?.getAttribute('style') ?? ''
    expect(style).not.toContain('linear-gradient')
  })
})

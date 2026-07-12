import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeckHeroCard } from '@/components/deck-hero-card'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a>,
}))

const deck = {
  id: 'd1', name: 'Lara but Fast', format: 'revival' as const, author: 'Abls',
  lessons: ['charms', 'potions'], likeCount: 3, viewCount: 10, cardCount: 60,
  updatedAt: new Date().toISOString(), likedByViewer: false, starterCardId: 'c-1',
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckHeroCard deck={deck} imageBase="https://img.test" />
    </NextIntlClientProvider>,
  )
}

describe('DeckHeroCard', () => {
  it('shows name, format · cards, author, lessons, and read-only counts', () => {
    const { container } = renderCard()
    expect(screen.getByText('Lara but Fast')).toBeInTheDocument()
    expect(screen.getByText(/Revival · 60 cards/)).toBeInTheDocument()
    expect(screen.getByText('@Abls')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()  // likes
    expect(screen.getByText('10')).toBeInTheDocument() // views
    // lesson icons + starter art present, but NO interactive like button
    expect(container.querySelector('[aria-pressed]')).toBeNull()
    expect(container.querySelector('a')).toHaveAttribute('href', '/decks/d1')
  })

  it('renders the baked art-crop for the starter card', () => {
    const { container } = renderCard()
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://img.test/cards/art-crop/c-1.webp')
  })
})

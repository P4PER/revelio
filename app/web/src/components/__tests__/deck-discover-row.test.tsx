import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeckDiscoverRow } from '@/components/deck-discover-row'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a>,
}))

const deck = {
  id: 'd1', name: 'Potions Control', format: 'revival' as const, author: 'Herm',
  lessons: ['potions'], likeCount: 1, viewCount: 9, cardCount: 61,
  updatedAt: new Date().toISOString(), likedByViewer: false, starterCardId: null, starterArtCropVersion: null,
}

describe('DeckDiscoverRow', () => {
  it('renders name, author/meta, read-only counts, and links to the deck', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}><DeckDiscoverRow deck={deck} imageBase="https://img.test" /></NextIntlClientProvider>,
    )
    expect(screen.getByText('Potions Control')).toBeInTheDocument()
    expect(screen.getByText(/@Herm/)).toBeInTheDocument()
    expect(container.querySelector('[aria-pressed]')).toBeNull() // no like button
    expect(container.querySelector('a')).toHaveAttribute('href', '/decks/d1')
  })

  it('renders the baked art-crop thumbnail for the starter card', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckDiscoverRow deck={{ ...deck, starterCardId: 'c-1', starterArtCropVersion: 7 }} imageBase="https://img.test" />
      </NextIntlClientProvider>,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://img.test/cards/art-crop/c-1.7.webp')
  })
})

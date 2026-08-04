import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { DeckHeader } from '@/components/deck-header'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
// Isolate the header: the like button has its own action/router deps.
vi.mock('@/components/deck-like-button', () => ({ DeckLikeButton: () => <div data-testid="like" /> }))

const base = {
  deckId: 'd1',
  name: 'My Deck',
  format: 'revival' as const,
  updatedAt: '2026-07-01T00:00:00.000Z',
  visibility: 'public' as const,
  viewCount: 12,
  likeCount: 3,
  liked: false,
  loggedIn: true,
  imageBase: 'https://img.example',
  ownerUsername: 'ron',
  starterCardId: 'harry',
  starterArtCropVersion: 1,
  lessons: ['charms'],
}

describe('DeckHeader', () => {
  it('renders the deck name and links the owner handle to filtered deck search', () => {
    renderWithIntl(<DeckHeader {...base} />)
    expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /ron/i })
    expect(link).toHaveAttribute('href', '/decks?q=@ron')
  })

  it('omits the owner element when there is no username', () => {
    renderWithIntl(<DeckHeader {...base} ownerUsername={null} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the lesson-gradient fallback when there is no starter art', () => {
    const { container } = renderWithIntl(
      <DeckHeader {...base} starterCardId={null} starterArtCropVersion={null} />,
    )
    expect(container.querySelector('[data-slot="deck-art-fallback"]')).toBeInTheDocument()
  })
})

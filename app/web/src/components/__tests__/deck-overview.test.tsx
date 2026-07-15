import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckOverview } from '@/components/deck-overview'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/components/deck-overview-actions', () => ({
  DeckOverviewActions: () => <div data-testid="actions" />,
}))
vi.mock('@/components/deck-panel', () => ({ DeckPanel: () => <div data-testid="list-view" /> }))
vi.mock('@/components/deck-gallery', () => ({ DeckGallery: () => <div data-testid="gallery-view" /> }))
// The mount effect fires the recordView server action; stub it so tests don't
// invoke real server code (which calls headers() outside a request scope).
vi.mock('@/lib/deck-actions', () => ({ recordViewAction: vi.fn(() => Promise.resolve({ viewCount: 1 })) }))

const views: DeckCardView[] = [
  { cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true },
  { cardId: 'accio', zone: 'main', quantity: 4, name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: false },
]
const props = {
  deckId: 'd1', name: 'My Deck', format: 'revival' as const, visibility: 'private' as const,
  createdAt: '2026-06-30T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  views, isOwner: true, loggedIn: true, imageBase: 'https://img.example',
  likeCount: 3, liked: false, viewCount: 12,
}

beforeEach(() => {
  document.cookie = 'revelio.deck-view=; path=/; max-age=0'
})

describe('DeckOverview', () => {
  it('shows the deck name and defaults to the list view', () => {
    renderWithIntl(<DeckOverview {...props} />)
    expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument()
    expect(screen.getByTestId('list-view')).toBeInTheDocument()
    expect(screen.queryByTestId('gallery-view')).not.toBeInTheDocument()
  })

  it('renders the initial view supplied by the server (from the cookie)', () => {
    renderWithIntl(<DeckOverview {...props} initialView="gallery" />)
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument()
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument()
  })

  it('switches to the gallery view and persists the choice to a cookie', () => {
    renderWithIntl(<DeckOverview {...props} />)
    fireEvent.click(screen.getByText('Gallery'))
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument()
    expect(document.cookie).toContain('revelio.deck-view=gallery')
  })

  it('shows the back link only to logged-in viewers', () => {
    const { unmount } = renderWithIntl(<DeckOverview {...props} loggedIn />)
    expect(screen.getByText('Back')).toBeInTheDocument()
    unmount()
    renderWithIntl(<DeckOverview {...props} loggedIn={false} />)
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })
})

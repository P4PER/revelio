import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import type { DeckCardView, Violation } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckOverview } from '@/components/deck/deck-overview'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/components/deck/deck-overview-actions', () => ({
  DeckOverviewActions: () => <div data-testid="actions" />,
}))
// The stub echoes the violation codes it is handed, so a test can see the
// overview passes them to the list view; row marking is DeckPanel's own test.
vi.mock('@/components/deck/deck-panel', () => ({
  DeckPanel: ({ violations }: { violations?: Violation[] }) => (
    <div data-testid="list-view" data-violations={(violations ?? []).map((v) => v.code).join(' ')} />
  ),
}))
vi.mock('@/components/deck/deck-gallery', () => ({ DeckGallery: () => <div data-testid="gallery-view" /> }))
vi.mock('@/components/deck/deck-header', () => ({
  DeckHeader: ({ name }: { name: string }) => <h1>{name}</h1>,
}))
// The mount effect fires the recordView server action; stub it so tests don't
// invoke real server code (which calls headers() outside a request scope).
vi.mock('@/lib/actions/deck-actions', () => ({ recordViewAction: vi.fn(() => Promise.resolve({ viewCount: 1 })) }))

const views: DeckCardView[] = [
  { cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true },
  { cardId: 'accio', zone: 'main', quantity: 4, name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: false },
]
const props = {
  deckId: 'd1', name: 'My Deck', format: 'revival' as const, visibility: 'private' as const,
  createdAt: '2026-06-30T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  views, isOwner: true, loggedIn: true, imageBase: 'https://img.example',
  likeCount: 3, liked: false, viewCount: 12, ownerUsername: 'ron',
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
    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }))
    expect(screen.getByTestId('gallery-view')).toBeInTheDocument()
    expect(document.cookie).toContain('revelio.deck-view=gallery')
  })

  it('lists why a deck is illegal, by name and without jump buttons, and hands the reasons to the list', () => {
    const banned: DeckCardView[] = [
      ...views,
      { cardId: 'fred', zone: 'main', quantity: 1, name: 'Fred Weasley', cost: 2, setCode: 'BS', number: '3', lesson: null, isOfficial: true, legality: 'banned', isLesson: false, isStartingCharacter: false },
    ]
    renderWithIntl(<DeckOverview {...props} views={banned} />)
    fireEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('Fred Weasley is banned in Revival')
    expect(within(list).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('list-view').getAttribute('data-violations')).toContain('banned_card')
  })
})

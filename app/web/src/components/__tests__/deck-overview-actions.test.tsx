import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckOverviewActions } from '@/components/deck-overview-actions'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/deck-actions', () => ({
  updateDeckMetaAction: vi.fn(async () => ({ ok: true, id: 'd1' })),
  duplicateDeckAction: vi.fn(async () => ({ ok: true, id: 'copy1' })),
}))

const views: DeckCardView[] = [
  { cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true },
]
const base = { deckId: 'd1', name: 'My Deck', format: 'revival' as const, views }

describe('DeckOverviewActions visibility', () => {
  it('owner of a private deck sees Edit, Publish, Export, Duplicate', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="private" isOwner loggedIn />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Duplicate → editor')).toBeInTheDocument()
  })

  it('owner of a public deck sees Published instead of Publish', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="public" isOwner loggedIn />)
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.queryByText('Publish')).not.toBeInTheDocument()
  })

  it('non-owner viewer sees only Export and Duplicate', () => {
    renderWithIntl(<DeckOverviewActions {...base} visibility="public" isOwner={false} loggedIn />)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Publish')).not.toBeInTheDocument()
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Duplicate → editor')).toBeInTheDocument()
  })
})

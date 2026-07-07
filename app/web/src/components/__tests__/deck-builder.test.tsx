import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { SearchResult } from '@revelio/search'
import en from '@/../messages/en.json'
import type { BuilderState } from '@/lib/deck-model'
import { DeckBuilder } from '../deck-builder'

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, hitsPerPage: 24 }

const createDeckAction = vi.fn(async () => ({ ok: true, id: 'new-id' }))
const updateDeckAction = vi.fn(async () => ({ ok: true, id: 'existing-id' }))
const searchDeckCards = vi.fn(async (): Promise<SearchResult> => EMPTY_RESULT)
const getCardDetailAction = vi.fn(() => new Promise(() => {}))
vi.mock('@/lib/deck-actions', () => ({
  createDeckAction: (...a: unknown[]) => createDeckAction(...a),
  updateDeckAction: (...a: unknown[]) => updateDeckAction(...a),
  searchDeckCards: (...a: unknown[]) => searchDeckCards(...a),
  getCardDetailAction: (...a: unknown[]) => getCardDetailAction(...a),
}))

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// jsdom's localStorage is flaky under this test runner, and the guest-draft
// persistence itself is out of scope here — stub the localStorage-backed
// draft functions with an in-memory box so this file can focus on the
// save-on-login prompt's own logic (show/hide/accept/dismiss).
const draftBox = vi.hoisted(() => ({ current: null as BuilderState | null }))
vi.mock('@/lib/deck-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deck-model')>()
  return {
    ...actual,
    loadDraft: () => draftBox.current,
    saveDraft: vi.fn(),
    clearDraft: () => {
      draftBox.current = null
    },
  }
})

const emptyState: BuilderState = { name: '', format: 'revival', visibility: 'private', entries: [] }

const draftEntry = {
  cardId: 'accio', zone: 'main' as const, quantity: 2, name: 'Accio', cost: 1, setCode: 'BS',
  lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}

function renderBuilder(overrides: Partial<Parameters<typeof DeckBuilder>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckBuilder initial={emptyState} deckId={null} loggedIn={false} sets={[]} imageBase="" {...overrides} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  createDeckAction.mockClear()
  updateDeckAction.mockClear()
  push.mockClear()
  draftBox.current = null
})

describe('DeckBuilder save-on-login prompt', () => {
  it('offers to save a non-empty guest draft once the user is logged in, and saves it on accept', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save to account' }))

    await waitFor(() => expect(createDeckAction).toHaveBeenCalledTimes(1))
    expect(createDeckAction).toHaveBeenCalledWith({
      name: 'My Draft',
      format: 'revival',
      visibility: 'private',
      cards: [{ cardId: 'accio', zone: 'main', quantity: 2 }],
    })
    expect(draftBox.current).toBeNull()
    expect(push).toHaveBeenCalledWith('/decks/new-id')
  })

  it('hides the banner on dismiss without touching the stored draft', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
    expect(createDeckAction).not.toHaveBeenCalled()
    expect(draftBox.current).not.toBeNull()
  })

  it('does not show the prompt when there is no draft, when logged out, or when editing an existing deck', () => {
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: '', format: 'revival', visibility: 'private', entries: [] }
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: 'existing-id' })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
  })
})

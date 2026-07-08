import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { DeckSummary } from '@revelio/db'
import { DeckList } from '../deck-list'

const duplicateDeckAction = vi.fn(async () => ({ ok: true, id: 'new-id' }))
const deleteDeckAction = vi.fn(async () => ({ ok: true, id: 'd1' }))
const updateDeckMetaAction = vi.fn(async () => ({ ok: true, id: 'd1' }))

vi.mock('@/lib/deck-actions', () => ({
  duplicateDeckAction: (...a: unknown[]) => duplicateDeckAction(...a),
  deleteDeckAction: (...a: unknown[]) => deleteDeckAction(...a),
  updateDeckMetaAction: (...a: unknown[]) => updateDeckMetaAction(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

const decks: DeckSummary[] = [
  {
    id: 'd1', name: 'My Revival Deck', format: 'revival', visibility: 'private',
    cardCount: 42, updatedAt: '2026-07-01T12:00:00.000Z',
  },
]

function renderList(rows = decks) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckList decks={rows} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  duplicateDeckAction.mockClear()
  deleteDeckAction.mockClear()
  updateDeckMetaAction.mockClear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('DeckList', () => {
  it('shows the empty state with a link to the builder when there are no decks', () => {
    renderList([])
    expect(screen.getByText('No decks yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Build a deck' })).toHaveAttribute('href', '/decks/new')
  })

  it('renders a deck row with name, format, visibility, and card count', () => {
    renderList()
    expect(screen.getByRole('link', { name: 'My Revival Deck' })).toHaveAttribute('href', '/decks/d1')
    expect(screen.getByText('Revival')).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByText('42 / 60 cards')).toBeInTheDocument()
  })

  it('duplicates a deck from the row menu', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(duplicateDeckAction).toHaveBeenCalledWith('d1'))
  })

  it('deletes a deck after confirming in the dialog', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderList()
    await user.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteDeckAction).toHaveBeenCalledWith('d1'))
  })

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderList()
    await user.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(deleteDeckAction).not.toHaveBeenCalled()
  })

  it('toggles visibility from the row menu', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make public' }))
    await waitFor(() => expect(updateDeckMetaAction).toHaveBeenCalledWith('d1', { visibility: 'public' }))
  })

  it('renames a deck inline', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename' })
    fireEvent.change(input, { target: { value: 'Renamed Deck' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(updateDeckMetaAction).toHaveBeenCalledWith('d1', { name: 'Renamed Deck' }),
    )
  })

  it('keeps the rename input open and shows an inline error on failure', async () => {
    updateDeckMetaAction.mockResolvedValueOnce({ ok: false, error: 'invalid' } as never)
    renderList()
    await userEvent.click(screen.getByRole('button', { name: /Deck actions for My Revival Deck/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename' })
    fireEvent.change(input, { target: { value: 'New Name' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(en.decks.list.renameError)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Rename' })).toBeInTheDocument()
  })
})

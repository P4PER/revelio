import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-actions', () => ({
  getCardViewsAction: vi.fn(async () => ({})),
  resolveImportNames: vi.fn(async () => ({})),
}))

import { DeckImportDialog } from '../deck-import-dialog'
import { emptyDeck } from '@/lib/deck-model'
import en from '@/../messages/en.json'

function open() {
  return within(screen.getByRole('dialog'))
}

describe('DeckImportDialog', () => {
  it('shows the empty-input error inline under the textarea', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    expect(await screen.findByText(en.decks.import.emptyInput)).toBeInTheDocument()
  })

  it('shows the invalid-JSON error inline for a JSON object that is not a deck', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    fireEvent.change(open().getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '{"totally":"not a deck"}' },
    })
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    expect(await screen.findByText(en.decks.import.invalidJson)).toBeInTheDocument()
  })
})

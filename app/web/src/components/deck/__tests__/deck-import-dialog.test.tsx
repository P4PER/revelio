import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  getCardViewsAction: vi.fn(async (): Promise<Record<string, unknown>> => ({})),
  resolveImportNames: vi.fn(async (): Promise<Record<string, string | null>> => ({})),
}))
vi.mock('@/lib/actions/deck-actions', () => actions)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
})

import { parseText } from '@revelio/core'
import { toast } from 'sonner'

import { DeckImportDialog, EXAMPLE_LIST } from '@/components/deck/deck-import-dialog'
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

    // The file picker loads into the textarea rather than importing separately,
    // so the textarea is the one field every failure belongs to - and it has to
    // say so, not just sit above the message.
    const box = open().getByLabelText(en.decks.import.pasteLabel)
    expect(box).toHaveAttribute('aria-invalid', 'true')
    const describedBy = box.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(en.decks.import.emptyInput)
  })

  it('drops the error once the text it describes is replaced', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    const box = open().getByLabelText(en.decks.import.pasteLabel)
    expect(box).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(box, { target: { value: '4 Accio' } })
    expect(box).not.toHaveAttribute('aria-invalid')
    expect(box).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(en.decks.import.emptyInput)).not.toBeInTheDocument()
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

  it('renders a format example that the text parser actually accepts', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    expect(open().getByText(en.decks.import.exampleLabel)).toBeInTheDocument()

    // The sample is rendered token by token so the quantity, name and set
    // reference can be styled apart, so assert on the block's full text rather
    // than a text match (getByText only sees an element's direct text nodes).
    const sample = open().getByText(/Harry Potter/).closest('pre')
    expect(sample?.textContent).toBe(EXAMPLE_LIST)

    const { lines, unparsed } = parseText(EXAMPLE_LIST)
    expect(unparsed).toEqual([])
    expect(lines.map((l) => l.zone)).toEqual(['character', 'main', 'main', 'sideboard'])
  })

  // The sample styles headings as load-bearing rather than as ignorable comments.
  // That is only honest while headings really are the sole way to pick a zone, so
  // pin the behaviour the sheet's copy claims.
  it('needs the headings it shows: without them nothing reaches a non-main zone', () => {
    const headless = EXAMPLE_LIST.split('\n')
      .filter((l) => !l.startsWith('//'))
      .join('\n')
    const { lines, unparsed } = parseText(headless)

    // Every surviving card collapses into the main deck...
    expect(lines.every((l) => l.zone === 'main')).toBe(true)
    // ...and the bare character line is not merely moved, it is rejected.
    expect(unparsed).toEqual(['Harry Potter (BS 8)'])
  })

  it('imports one starting character and lists the others it left out', async () => {
    const meta = { cost: null, setCode: 'BS', lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true }
    actions.resolveImportNames.mockResolvedValueOnce({ 'harry potter|BS|2': 'bs-harry', 'ron weasley|BS|3': 'bs-ron' })
    actions.getCardViewsAction.mockResolvedValueOnce({
      'bs-harry': { ...meta, cardId: 'bs-harry', name: 'Harry Potter', number: '2' },
      'bs-ron': { ...meta, cardId: 'bs-ron', name: 'Ron Weasley', number: '3' },
    })
    const onImport = vi.fn()
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={onImport} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    fireEvent.change(open().getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '// Character\nHarry Potter (BS 2)\nRon Weasley (BS 3)' },
    })
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))

    const notice = await screen.findByText(en.decks.import.extraCharactersTitle)
    expect(notice.closest('[role="alert"]')).toHaveTextContent('Ron Weasley (BS 3)')
    const entries = onImport.mock.calls[0][0].entries
    expect(entries.map((e: { cardId: string; zone: string }) => `${e.zone}-${e.cardId}`)).toEqual(['character-bs-harry'])
  })

  it('says how many cards the import brought in', async () => {
    const meta = { cost: null, setCode: 'BS', lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false }
    actions.resolveImportNames.mockResolvedValueOnce({ 'accio|BS|1': 'bs-accio' })
    actions.getCardViewsAction.mockResolvedValueOnce({
      'bs-accio': { ...meta, cardId: 'bs-accio', name: 'Accio', number: '1' },
    })
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    fireEvent.change(open().getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '3 Accio (BS 1)' },
    })
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Deck imported.', {
        description: '3 cards are now in the builder.',
      }),
    )
  })

  // The builder was replaced and the dialog closed, so this toast is the only
  // sign anything happened; it just has no count to give.
  it('still confirms an empty deck that closed the dialog', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    fireEvent.change(open().getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '{"name":"Empty","format":"classic","character":null,"main":[],"sideboard":[]}' },
    })
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Deck imported.', undefined))
  })

  it('does not celebrate an import that brought in no cards', async () => {
    actions.resolveImportNames.mockResolvedValueOnce({ 'nonsense|BS|1': null })
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeckImportDialog state={emptyDeck()} onImport={vi.fn()} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.decks.import.button }))
    fireEvent.change(open().getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '3 Nonsense (BS 1)' },
    })
    await user.click(open().getByRole('button', { name: en.decks.import.submit }))
    expect((await screen.findAllByText('Nonsense (BS 1)', { exact: false })).length).toBeGreaterThan(0)
    expect(toast.success).not.toHaveBeenCalled()
  })
})

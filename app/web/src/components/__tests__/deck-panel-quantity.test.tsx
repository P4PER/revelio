import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck-panel'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
  }
}

function renderPanel(onQuantityChange = vi.fn()) {
  renderWithIntl(
    <DeckPanel entries={[view('accio', 'main', 2)]} imageBase="http://img.test" onQuantityChange={onQuantityChange} />,
  )
  return { onQuantityChange, input: screen.getByLabelText('Quantity of accio') as HTMLInputElement }
}

describe('DeckPanel quantity input', () => {
  it('shows the current quantity', () => {
    const { input } = renderPanel()
    expect(input.value).toBe('2')
  })

  it('commits a typed quantity on blur', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.type(input, '3')
    expect(onQuantityChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onQuantityChange).toHaveBeenCalledWith('accio', 'main', 3)
  })

  it('commits on Enter', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.type(input, '4{Enter}')
    expect(onQuantityChange).toHaveBeenCalledWith('accio', 'main', 4)
  })

  it('ignores non-numeric input', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.type(input, 'a-1e{Enter}')
    expect(onQuantityChange).toHaveBeenCalledWith('accio', 'main', 1)
  })

  it('reverts to the deck value when left empty', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.tab()
    expect(onQuantityChange).not.toHaveBeenCalled()
    expect(input.value).toBe('2')
  })

  it('reverts the draft on Escape', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.type(input, '9{Escape}')
    expect(input.value).toBe('2')
    await user.tab()
    expect(onQuantityChange).not.toHaveBeenCalled()
  })

  it('commits zero so the row can be removed by typing', async () => {
    const user = userEvent.setup()
    const { input, onQuantityChange } = renderPanel()
    await user.clear(input)
    await user.type(input, '0{Enter}')
    expect(onQuantityChange).toHaveBeenCalledWith('accio', 'main', 0)
  })

  it('has no quantity input when readOnly', () => {
    renderWithIntl(<DeckPanel entries={[view('accio', 'main', 2)]} imageBase="http://img.test" readOnly />)
    expect(screen.queryByLabelText('Quantity of accio')).not.toBeInTheDocument()
  })
})

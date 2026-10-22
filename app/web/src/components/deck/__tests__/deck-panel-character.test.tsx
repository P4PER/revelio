import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeckCardView } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck/deck-panel'

const harry: DeckCardView = {
  cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, setCode: 'BS', number: '6',
  lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: true,
}

describe('DeckPanel starting character', () => {
  it('removes the character through its button', async () => {
    const user = userEvent.setup()
    const onRemoveCharacter = vi.fn()
    renderWithIntl(<DeckPanel entries={[harry]} imageBase="http://img.test" onRemoveCharacter={onRemoveCharacter} />)
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    expect(onRemoveCharacter).toHaveBeenCalledWith('harry')
    await waitFor(() => expect(screen.getByText('Starting Character')).toHaveFocus())
  })

  it('has no remove button when read-only', () => {
    renderWithIntl(<DeckPanel entries={[harry]} imageBase="http://img.test" onRemoveCharacter={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: /as starting character/ })).toBeNull()
  })

  it('has no remove button without a handler', () => {
    renderWithIntl(<DeckPanel entries={[harry]} imageBase="http://img.test" />)
    expect(screen.queryByRole('button', { name: /as starting character/ })).toBeNull()
  })
})

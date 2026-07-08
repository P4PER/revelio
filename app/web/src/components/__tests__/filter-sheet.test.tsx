import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

import { FilterSheet, EMPTY_SELECTION } from '../filter-sheet'
import en from '@/../messages/en.json'

function renderSheet(onApply = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FilterSheet sets={[]} value={EMPTY_SELECTION} locale="en" onApply={onApply} />
    </NextIntlClientProvider>,
  )
  return onApply
}

describe('FilterSheet cost range', () => {
  it('blocks Apply and shows an inline error when min > max', async () => {
    const user = userEvent.setup()
    const onApply = renderSheet()
    await user.click(screen.getByRole('button', { name: en.filters.button }))
    const panel = within(screen.getByRole('dialog'))
    await user.type(panel.getByLabelText(en.filters.costMin), '5')
    await user.type(panel.getByLabelText(en.filters.costMax), '2')
    await user.click(panel.getByRole('button', { name: en.filters.apply }))
    expect(await screen.findByText(en.validation.costRange)).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies a valid range', async () => {
    const user = userEvent.setup()
    const onApply = renderSheet()
    await user.click(screen.getByRole('button', { name: en.filters.button }))
    const panel = within(screen.getByRole('dialog'))
    await user.type(panel.getByLabelText(en.filters.costMin), '1')
    await user.type(panel.getByLabelText(en.filters.costMax), '4')
    await user.click(panel.getByRole('button', { name: en.filters.apply }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ costMin: '1', costMax: '4' }))
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { FilterDrawer } from '../filter-drawer'

const messages = { filters: { button: 'Filters', title: 'Filters', apply: 'Apply', clear: 'Clear all', set: 'Set', type: 'Type', lesson: 'Lesson', rarity: 'Rarity', finish: 'Finish', legality: 'Legality', cost: 'Cost', costMin: 'Min', costMax: 'Max', official: 'Official only', fan: 'Fan / Revival only', anySet: 'Any set' } }
const sets = [{ code: 'BS', name: 'Base Set', releaseDate: null, isOfficial: true, cardCount: 1, symbol: 'BS' }]

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FilterDrawer sets={sets} locale="en" />
    </NextIntlClientProvider>,
  )
}

describe('FilterDrawer', () => {
  it('applies a checked rarity to the URL', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(await screen.findByLabelText('Rare'))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(push.mock.calls.at(-1)?.[0]).toMatch(/rarity=rare/)
  })
})

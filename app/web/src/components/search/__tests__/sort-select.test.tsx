import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SortSelect } from '@/components/search/sort-select'

const SORT_KEYS = ['relevance', 'name', 'number', 'cost'] as const

function renderSort(locale: 'en' | 'de', messages: typeof en | typeof de, ui: ReactElement) {
  render(
    <NextIntlClientProvider locale={locale} timeZone="UTC" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('SortSelect', () => {
  it('defaults to Relevance', () => {
    renderSort('en', en, <SortSelect />)
    expect(screen.getByRole('combobox')).toHaveTextContent(en.search.sort.relevance)
  })

  it('choosing Name updates the sort param', async () => {
    const user = userEvent.setup()
    renderSort('en', en, <SortSelect />)
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: en.search.sort.name }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/sort=name/)
  })

  it('labels the trigger and every option in the active locale', async () => {
    const user = userEvent.setup()
    renderSort('de', de, <SortSelect />)
    const trigger = screen.getByRole('combobox', { name: de.search.sort.label })
    expect(trigger).toHaveTextContent(de.search.sort.relevance)
    await user.click(trigger)
    for (const key of SORT_KEYS) {
      expect(await screen.findByRole('option', { name: de.search.sort[key] })).toBeInTheDocument()
    }
  })
})

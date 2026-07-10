import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { QuickFilters } from '../quick-filters'

function renderFilters() {
  // LessonFilterChips (shared) calls useLocale(), so an intl provider is needed.
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <QuickFilters locale="en" />
    </NextIntlClientProvider>,
  )
}

describe('QuickFilters', () => {
  it('toggling a type chip adds it to the url', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Creature' }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/type=creature/)
  })

  it('toggling a lesson chip adds it to the url', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /Potions/ }))
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/lesson=potions/)
  })
})

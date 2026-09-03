import type { ReactNode } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { QuickFilters } from '@/components/search/quick-filters'

const messages = { filters: { type: 'Type', lesson: 'Lesson' } }

function renderFilters(trailing?: ReactNode) {
  // LessonFilterChips (shared) calls useLocale(), so an intl provider is needed.
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuickFilters locale="en" trailing={trailing} />
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

  it('groups the type chips in a lane labelled Type', () => {
    renderFilters()
    const lane = screen.getByRole('group', { name: 'Type' })
    expect(within(lane).getByRole('button', { name: 'Creature' })).toBeInTheDocument()
  })

  it('groups the lesson chips in a lane labelled Lesson', () => {
    renderFilters()
    const lane = screen.getByRole('group', { name: 'Lesson' })
    expect(within(lane).getByRole('button', { name: /Potions/ })).toBeInTheDocument()
  })

  it('renders the trailing slot alongside the lanes', () => {
    renderFilters(<button type="button">Advanced</button>)
    expect(screen.getByRole('button', { name: 'Advanced' })).toBeInTheDocument()
  })

  it('pins the trailing slot to the right edge below md', () => {
    // Below md the trigger drops under the lanes, where a left-aligned button
    // would sit in a different place than it does on the collection and
    // deck-builder filter rows (and than it does here at md and up).
    renderFilters(<button type="button">Advanced</button>)
    const slot = screen.getByRole('button', { name: 'Advanced' }).parentElement
    expect(slot).toHaveClass('self-end')
    expect(slot).toHaveClass('md:self-start')
  })
})

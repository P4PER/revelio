import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const replace = vi.fn()
const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={typeof href === 'string' ? href : '#'}>{children}</a>,
}))

import { DeckBrowse } from '@/components/deck/deck-browse'

const base = {
  state: { q: '', lessons: [], format: null, sort: 'likes' as const, page: 1 },
  entries: [], total: 0, pageSize: 24, imageBase: 'https://img.test', initialView: 'gallery' as const,
}

function renderBrowse(overrides: Partial<typeof base> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckBrowse {...base} {...overrides} />
    </NextIntlClientProvider>,
  )
}

function renderBrowseInGerman(overrides: Partial<typeof base> = {}) {
  return render(
    <NextIntlClientProvider locale="de" timeZone="UTC" messages={de}>
      <DeckBrowse {...base} {...overrides} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { vi.useFakeTimers(); push.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('DeckBrowse instant search', () => {
  it('debounces typing into a URL update without Enter', () => {
    renderBrowse()
    const input = screen.getByPlaceholderText(en.decks.explore.searchPlaceholder)
    fireEvent.change(input, { target: { value: 'aggro' } })
    expect(push).not.toHaveBeenCalled()          // not yet (debounced)
    act(() => { vi.advanceTimersByTime(300) })
    expect(push).toHaveBeenCalledWith(expect.stringContaining('q=aggro'))
  })
})

describe('DeckBrowse sort control', () => {
  it('changing sort pushes a sort param', async () => {
    vi.useRealTimers()                        // userEvent needs real timers
    const user = userEvent.setup()
    renderBrowse()
    await user.click(screen.getByLabelText(en.decks.explore.sort.label))
    await user.click(await screen.findByRole('option', { name: en.decks.explore.sort.newest }))
    expect(push).toHaveBeenCalledWith(expect.stringContaining('sort=newest'))
  })
})

describe('DeckBrowse deck count', () => {
  it('names the decks on screen in both the header and the pager', () => {
    renderBrowse({ total: 105 })
    expect(screen.getAllByText('1–24 of 105 decks')).toHaveLength(2)
    // exactly one of the two announces, the way the card lists do. The
    // empty state carries its own live region, so count only the ones that
    // render the count.
    const announced = screen
      .getAllByRole('status')
      .filter((el) => el.textContent === '1–24 of 105 decks')
    expect(announced).toHaveLength(1)
  })

  it('drops the range once every deck fits on one page', () => {
    renderBrowse({ total: 7 })
    expect(screen.getByText('7 decks')).toBeInTheDocument()
  })
})

describe('DeckBrowse view toggle', () => {
  it('names the list and gallery buttons in the active locale', () => {
    renderBrowseInGerman()
    expect(screen.getByLabelText(de.decks.explore.view.list)).toBeInTheDocument()
    expect(screen.getByLabelText(de.decks.explore.view.gallery)).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

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

function renderBrowse() {
  return render(<NextIntlClientProvider locale="en" messages={en}><DeckBrowse {...base} /></NextIntlClientProvider>)
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

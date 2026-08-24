import { screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SearchBox } from '@/components/search/search-box'

describe('SearchBox', () => {
  it('debounced typing updates the q param via router.replace', async () => {
    renderWithIntl(<SearchBox placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 1000 })
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/q=harry/)
  })

  it('the clear button empties the field and drops q from the URL', async () => {
    renderWithIntl(<SearchBox placeholder="Search" />)
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'harry' } })
    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 1000 })

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((box as HTMLInputElement).value).toBe('')
    await waitFor(() => expect(replace.mock.calls.at(-1)?.[0]).not.toMatch(/q=harry/), {
      timeout: 1000,
    })
  })
})

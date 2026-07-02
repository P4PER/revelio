import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const replace = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

import { SearchBox } from '../search-box'

describe('SearchBox', () => {
  it('debounced typing updates the q param via router.replace', async () => {
    render(<SearchBox placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    await waitFor(() => expect(replace).toHaveBeenCalled(), { timeout: 1000 })
    expect(replace.mock.calls.at(-1)?.[0]).toMatch(/q=harry/)
  })
})

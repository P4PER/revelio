import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))

import { HomeSearch } from '../home-search'

describe('HomeSearch', () => {
  it('submits to /search with the query', () => {
    render(<HomeSearch placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(push).toHaveBeenCalledWith('/search?q=harry')
  })
})

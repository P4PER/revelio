import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))

import { HomeSearch } from '@/components/search/home-search'

describe('HomeSearch', () => {
  it('submits to /search with the query', () => {
    render(<HomeSearch placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(push).toHaveBeenCalledWith('/search?q=harry')
  })

  it('shows the icon for the theme, as decoration', () => {
    const { container } = render(<HomeSearch placeholder="Search" />)
    const icons = [...container.querySelectorAll('img')]
    const light = icons.find((i) => i.getAttribute('src') === '/revelio-icon-on-light.svg')
    const dark = icons.find((i) => i.getAttribute('src') === '/revelio-icon-on-dark.svg')
    expect(light).toHaveClass('dark:hidden')
    expect(dark).toHaveClass('hidden', 'dark:block')
    for (const icon of [light, dark]) expect(icon).toHaveAttribute('alt', '')
  })
})

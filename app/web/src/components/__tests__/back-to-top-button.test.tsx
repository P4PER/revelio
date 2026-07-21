import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BackToTopButton } from '../back-to-top-button'

describe('BackToTopButton', () => {
  it('scrolls to the top when clicked', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<BackToTopButton label="Back to top" />)
    await userEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    vi.unstubAllGlobals()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ContactEmail } from '../contact-email'

describe('ContactEmail', () => {
  it('renders a readable mailto link for a normal address', () => {
    render(<ContactEmail email="hi@example.com" fallback="Not configured" />)
    const link = screen.getByRole('link', { name: 'hi@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('percent-encodes URL-special characters while keeping @ literal', () => {
    render(<ContactEmail email="a b@example.com" fallback="Not configured" />)
    const link = screen.getByRole('link', { name: 'a b@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:a%20b@example.com')
  })

  it('renders the fallback when no email is set', () => {
    render(<ContactEmail email={null} fallback="Not configured" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
  })
})

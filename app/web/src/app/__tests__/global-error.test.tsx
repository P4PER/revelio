import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GlobalErrorContent } from '../global-error'

describe('global error content', () => {
  it('renders the hardcoded English heading and the reload control', () => {
    render(<GlobalErrorContent error={Object.assign(new Error('x'), { digest: '9z' })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went dark')
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    expect(screen.getByText('reference: 9z')).toBeInTheDocument()
  })
})

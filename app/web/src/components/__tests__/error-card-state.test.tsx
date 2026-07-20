import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ErrorCardState } from '../error-card-state'

describe('ErrorCardState', () => {
  it('renders heading, description, and action children', () => {
    render(
      <ErrorCardState variant="missing" heading="Not found" description="It vanished">
        <button>Do thing</button>
      </ErrorCardState>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found')
    expect(screen.getByText('It vanished')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Do thing' })).toBeInTheDocument()
  })

  it('hides the digest line when no digest is given', () => {
    render(
      <ErrorCardState variant="missing" heading="h" description="d">
        <span />
      </ErrorCardState>,
    )
    expect(screen.queryByText(/reference:/i)).not.toBeInTheDocument()
  })

  it('shows the digest line with the given label when digest is present', () => {
    render(
      <ErrorCardState variant="dark" heading="h" description="d" digest="8f3a1c" digestLabel="reference">
        <span />
      </ErrorCardState>,
    )
    expect(screen.getByText('reference: 8f3a1c')).toBeInTheDocument()
  })

  it('shows a "?" mark for the missing variant', () => {
    render(
      <ErrorCardState variant="missing" heading="h" description="d">
        <span />
      </ErrorCardState>,
    )
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})

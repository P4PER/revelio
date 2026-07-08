import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FieldError } from '../field-error'

describe('FieldError', () => {
  it('renders nothing when no message', () => {
    const { container } = render(<FieldError />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the message as an alert', () => {
    render(<FieldError>Something is missing</FieldError>)
    const el = screen.getByRole('alert')
    expect(el).toHaveTextContent('Something is missing')
    expect(el).toHaveClass('text-destructive')
  })
})

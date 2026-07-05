import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <h1>Revelio</h1>
}

describe('test setup', () => {
  it('renders a component via testing-library', () => {
    render(<Hello />)
    expect(screen.getByRole('heading', { name: 'Revelio' })).toBeInTheDocument()
  })
})

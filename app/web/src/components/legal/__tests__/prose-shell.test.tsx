import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProseShell } from '../prose-shell'

describe('ProseShell', () => {
  it('renders children inside a main landmark', () => {
    render(
      <ProseShell>
        <h1>Hello</h1>
        <p>Body text.</p>
      </ProseShell>,
    )
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(main.className).toContain('max-w-[76rem]')
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByText('Body text.')).toBeInTheDocument()
  })
})

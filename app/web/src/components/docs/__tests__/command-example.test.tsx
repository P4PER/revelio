import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CommandExample } from '@/components/docs/command-example'

describe('CommandExample', () => {
  it('keeps the invocation readable as one line of text', () => {
    const { container } = render(<CommandExample>/card name:Alohomora</CommandExample>)
    expect(container.textContent).toBe('/card name:Alohomora')
  })

  // It is something a reader copies into Discord, so it has to stay a code
  // block rather than become decorated prose.
  it('renders as a code block', () => {
    const { container } = render(<CommandExample>/card name:Alohomora</CommandExample>)
    expect(container.querySelector('pre > code')).not.toBeNull()
  })

  // The whole point of the change: three token kinds, three colours. A single
  // colour for all of them is what this replaces.
  it('colours the command, the option names and the values differently', () => {
    render(<CommandExample>/card name:Alohomora</CommandExample>)
    expect(screen.getByText('/card')).toHaveClass('text-primary-ink')
    expect(screen.getByText('name:')).toHaveClass('text-syntax-option')
    expect(screen.getByText('Alohomora')).toHaveClass('text-foreground')
  })

  it('splits every option of a multi-option invocation', () => {
    render(<CommandExample>/search query:lumos lesson:Charms</CommandExample>)
    expect(screen.getByText('query:')).toBeInTheDocument()
    expect(screen.getByText('lumos')).toBeInTheDocument()
    expect(screen.getByText('lesson:')).toBeInTheDocument()
    expect(screen.getByText('Charms')).toBeInTheDocument()
  })

  // `set:Chamber of Secrets` is one option whose value happens to contain
  // spaces - splitting on whitespace alone would turn it into three.
  it('keeps a multi-word value with its option', () => {
    render(<CommandExample>/search query:lumos set:Chamber of Secrets</CommandExample>)
    expect(screen.getByText('Chamber of Secrets')).toBeInTheDocument()
  })

  // A URL value carries its own colons and slashes; only the first colon of
  // the token separates the option name from its value.
  it('treats a URL value as a single value', () => {
    render(<CommandExample>/deck deck:https://revelio.cards/decks/abc123</CommandExample>)
    expect(screen.getByText('deck:')).toBeInTheDocument()
    expect(screen.getByText('https://revelio.cards/decks/abc123')).toBeInTheDocument()
  })

  it('renders a command that takes no options', () => {
    const { container } = render(<CommandExample>/mydecks</CommandExample>)
    expect(container.textContent).toBe('/mydecks')
    expect(screen.getByText('/mydecks')).toHaveClass('text-primary-ink')
  })
})

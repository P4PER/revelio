import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Callout } from '@/components/docs/callout'

describe('Callout', () => {
  it('renders its children', () => {
    render(<Callout>Linking is only needed for two commands.</Callout>)
    expect(screen.getByText('Linking is only needed for two commands.')).toBeInTheDocument()
  })

  // It carries a caution or an aside, not decoration, so it must be reachable
  // as a distinct region rather than an unlabelled coloured box.
  it('is announced as a note', () => {
    render(<Callout>Something worth knowing.</Callout>)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})

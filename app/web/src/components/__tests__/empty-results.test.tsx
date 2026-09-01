import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyResults } from '@/components/empty-results'

describe('EmptyResults', () => {
  it('announces itself and renders heading, description and actions', () => {
    render(
      <EmptyResults heading="No cards match" description="Try another spell">
        <button>Clear filters</button>
      </EmptyResults>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('No cards match')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No cards match')
    expect(screen.getByText('Try another spell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('omits the description and the action row when neither is given', () => {
    render(<EmptyResults heading="Nothing here" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Nothing here')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('uses the medium motif by default and the small one when compact', () => {
    const { container: def } = render(<EmptyResults heading="a" />)
    const { container: compact } = render(<EmptyResults heading="b" size="compact" />)
    expect(def.querySelector('.h-48')).not.toBeNull()
    expect(compact.querySelector('.h-24')).not.toBeNull()
  })

  it('merges a className onto the container so callers can span a grid', () => {
    render(<EmptyResults heading="a" className="col-span-full" />)
    expect(screen.getByRole('status').className).toContain('col-span-full')
  })
})

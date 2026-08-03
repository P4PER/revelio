import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useHasHover } from '../use-has-hover'

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function Probe() {
  return <span>{useHasHover() ? 'hover' : 'touch'}</span>
}

afterEach(() => {
  // @ts-expect-error — remove the stub between tests
  delete window.matchMedia
})

describe('useHasHover', () => {
  it('reports hover when (hover: hover) matches', () => {
    stubMatchMedia(true)
    render(<Probe />)
    expect(screen.getByText('hover')).toBeInTheDocument()
  })

  it('reports touch when (hover: hover) does not match', () => {
    stubMatchMedia(false)
    render(<Probe />)
    expect(screen.getByText('touch')).toBeInTheDocument()
  })
})

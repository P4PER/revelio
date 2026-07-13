import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { CardRotate } from '../card-rotate'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

const messages = { card: { rotate: 'Rotate upright', rotateBack: 'Close rotated view' } }

function mount(orientation: string | null, onParentClick = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <div data-card-frame className="group relative" onClick={onParentClick}>
        <CardRotate src="http://img/bs-1.webp" alt="Dean Thomas" orientation={orientation} />
      </div>
    </NextIntlClientProvider>,
  )
}

describe('CardRotate', () => {
  it('renders no button for a vertical card', () => {
    mount('vertical')
    expect(screen.queryByRole('button', { name: /rotate upright/i })).toBeNull()
  })

  it('opens and closes the upright overlay for a horizontal card', () => {
    mount('horizontal')
    const btn = screen.getByRole('button', { name: /rotate upright/i })
    fireEvent.click(btn)
    expect(screen.getAllByAltText('Dean Thomas').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /close rotated view/i })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /close rotated view/i })).toBeNull()
  })

  it('does not trigger the parent click when the button is pressed', () => {
    const parentClick = vi.fn()
    mount('horizontal', parentClick)
    fireEvent.click(screen.getByRole('button', { name: /rotate upright/i }))
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('closes on backdrop click without bubbling to the parent (portal event gotcha)', () => {
    const parentClick = vi.fn()
    mount('horizontal', parentClick)
    fireEvent.click(screen.getByRole('button', { name: /rotate upright/i }))
    parentClick.mockClear()
    fireEvent.click(screen.getByTestId('card-rotate-backdrop'))
    expect(screen.queryByRole('button', { name: /close rotated view/i })).toBeNull()
    expect(parentClick).not.toHaveBeenCalled()
  })
})

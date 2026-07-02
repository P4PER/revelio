import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SetCard } from '../set-card'
import type { SetDTO } from '@revelio/core'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

const set: SetDTO = { code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 116, symbol: 'BS' }

describe('SetCard', () => {
  it('renders the set name, count and a link to the set page', () => {
    render(<SetCard set={set} imageBase="http://img" />)
    expect(screen.getByText('Base Set')).toBeInTheDocument()
    expect(screen.getByText(/116/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sets/BS')
  })
})

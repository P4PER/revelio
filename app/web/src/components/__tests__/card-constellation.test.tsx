import { render, screen } from '@testing-library/react'
import { it, expect, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@/../i18n/navigation', () => ({
  Link: ({
    href,
    children,
    'aria-label': ariaLabel,
  }: {
    href: string
    children: React.ReactNode
    'aria-label'?: string
  }) => (
    <a href={href} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}))

import { CardConstellation } from '../card-constellation'

const cards = [
  { id: 'a', name: 'Alpha', imageVersion: 1 },
  { id: 'b', name: 'Beta', imageVersion: 2 },
]
const positions = [
  { left: 20, top: 40, rot: -5 },
  { left: 70, top: 50, rot: 5 },
]

it('renders one link per card to its detail page, labelled by name', () => {
  render(<CardConstellation cards={cards} positions={positions} imageBase="https://img" />)
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(2)
  expect(links[0]).toHaveAttribute('href', '/card/a')
  expect(screen.getByLabelText('Alpha')).toBeInTheDocument()
})

it('renders nothing when there are no cards', () => {
  const { container } = render(<CardConstellation cards={[]} positions={[]} imageBase="https://img" />)
  expect(container.querySelector('section')).toBeNull()
})

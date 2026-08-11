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

it('links each card to its detail page (desktop + mobile variants)', () => {
  render(
    <CardConstellation
      cards={cards}
      positions={positions}
      positionsMobile={positions}
      imageBase="https://img"
    />,
  )
  const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
  // one desktop + one mobile variant per card
  expect(hrefs.filter((h) => h === '/card/a')).toHaveLength(2)
  expect(hrefs).toContain('/card/b')
  expect(screen.getAllByLabelText('Alpha').length).toBeGreaterThan(0)
})

it('renders fewer cards on mobile than desktop', () => {
  render(
    <CardConstellation
      cards={cards}
      positions={positions}
      positionsMobile={positions.slice(0, 1)}
      imageBase="https://img"
    />,
  )
  // 2 desktop variants + 1 mobile variant = 3 links
  expect(screen.getAllByRole('link')).toHaveLength(3)
})

it('renders nothing when there are no cards', () => {
  const { container } = render(
    <CardConstellation cards={[]} positions={[]} positionsMobile={[]} imageBase="https://img" />,
  )
  expect(container.querySelector('section')).toBeNull()
})

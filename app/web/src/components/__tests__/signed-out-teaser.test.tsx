import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { SignedOutTeaser } from '@/components/signed-out-teaser'

function renderTeaser() {
  return render(
    <SignedOutTeaser
      title="Track what you own"
      description="Mark cards as owned."
      primary={{ label: 'Sign in', href: '/login?redirect=%2Fcollection' }}
      secondary={{ label: 'Browse sets', href: '/sets' }}
    >
      <div data-testid="ghost">ghost</div>
    </SignedOutTeaser>,
  )
}

describe('SignedOutTeaser', () => {
  it('states its pitch as a subheading, leaving the h1 to the page', () => {
    renderTeaser()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Track what you own')
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('offers both calls to action', () => {
    renderTeaser()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcollection',
    )
    expect(screen.getByRole('link', { name: 'Browse sets' })).toHaveAttribute('href', '/sets')
  })

  it('hides the ghost from assistive tech', () => {
    const { container } = renderTeaser()
    const ghostLayer = container.querySelector('[aria-hidden="true"]')
    expect(ghostLayer).not.toBeNull()
    expect(ghostLayer).toContainElement(screen.getByTestId('ghost'))
  })

  it('never animates the ghost', () => {
    const { container } = renderTeaser()
    const ghostLayer = container.querySelector('[aria-hidden="true"]')!
    expect(ghostLayer.className).toContain('[&_[data-slot=skeleton]]:animate-none')
  })
})

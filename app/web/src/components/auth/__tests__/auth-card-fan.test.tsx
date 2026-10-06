import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) => <img alt={p.alt as string} src={p.src as string} />,
}))

import { AuthCardFan } from '@/components/auth/auth-card-fan'

function fan(container: HTMLElement) {
  return container.querySelector('[data-slot="auth-card-fan"]') as HTMLElement
}

describe('AuthCardFan', () => {
  it('draws the two fan cards from /public, then the Revelio mark', () => {
    const { container } = render(<AuthCardFan />)
    const srcs = [...fan(container).querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual([
      '/auth/bs-111-wingardium-leviosa.webp',
      '/auth/poa-71-lumos.webp',
      '/revelio-icon-dark.svg',
    ])
  })

  it('is hidden from assistive tech and has no empty-alt gaps', () => {
    const { container } = render(<AuthCardFan />)
    expect(fan(container)).toHaveAttribute('aria-hidden', 'true')
    for (const img of fan(container).querySelectorAll('img')) {
      expect(img).toHaveAttribute('alt', '')
    }
  })
})

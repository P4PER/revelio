import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) => <img alt={p.alt as string} src={p.src as string} />,
}))

import { AuthCardFan } from '@/components/auth/auth-card-fan'

const A = 'https://img.test/cards/thumb/a.1.webp'
const B = 'https://img.test/cards/thumb/b.1.webp'

function fan(container: HTMLElement) {
  return container.querySelector('[data-slot="auth-card-fan"]') as HTMLElement
}

describe('AuthCardFan', () => {
  it('draws each card image plus the Revelio mark', () => {
    const { container } = render(<AuthCardFan images={[A, B]} />)
    const srcs = [...fan(container).querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual([A, B, '/revelio-icon.svg'])
  })

  it('still draws the Revelio card with no card images', () => {
    const { container } = render(<AuthCardFan images={[]} />)
    const srcs = [...fan(container).querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['/revelio-icon.svg'])
  })

  it('is hidden from assistive tech and has no empty-alt gaps', () => {
    const { container } = render(<AuthCardFan images={[A, B]} />)
    expect(fan(container)).toHaveAttribute('aria-hidden', 'true')
    for (const img of fan(container).querySelectorAll('img')) {
      expect(img).toHaveAttribute('alt', '')
    }
  })

  it('ignores more than two images rather than stacking them in one slot', () => {
    const { container } = render(<AuthCardFan images={[A, B, A]} />)
    expect(fan(container).querySelectorAll('img')).toHaveLength(3)
  })
})

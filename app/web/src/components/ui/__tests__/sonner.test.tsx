import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { Toaster, toastRemoved } from '../sonner'

const h = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  path: '/',
}))

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    h.props = props
    return null
  },
  toast: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({ usePathname: () => h.path }))

beforeEach(() => {
  h.props = {}
  h.path = '/'
})

describe('Toaster', () => {
  // Centred like sonner's default, but below the header rather than over its
  // search; the same on every viewport.
  it('sits top-centre below the header', () => {
    render(<Toaster theme="dark" />)
    expect(h.props.position).toBe('top-center')
    expect(h.props.offset).toEqual({ top: '4rem' })
    expect(h.props.mobileOffset).toEqual({ top: '4rem' })
  })

  it.each(['/admin', '/admin/users', '/card/123/edit'])('keeps rich colours on %s', (path) => {
    h.path = path
    render(<Toaster theme="dark" />)
    expect(h.props.richColors).toBe(true)
  })

  it.each(['/', '/decks', '/card/123', '/settings', '/administrator'])(
    'uses the brand style on %s',
    (path) => {
      h.path = path
      render(<Toaster theme="dark" />)
      expect(h.props.richColors).toBe(false)
    },
  )

  it('lets a caller prop still win', () => {
    render(<Toaster theme="dark" position="bottom-center" />)
    expect(h.props.position).toBe('bottom-center')
  })
})

describe('toastRemoved', () => {
  // A deletion is a plain toast in the quiet removed style, never a success:
  // the gold star would celebrate something that is gone.
  it('fires a plain toast tagged for the removed style', () => {
    toastRemoved('Deck deleted.', { description: 'Gone for good.' })
    expect(toast).toHaveBeenCalledWith(
      'Deck deleted.',
      expect.objectContaining({ description: 'Gone for good.', className: 'toast-removed', icon: expect.anything() }),
    )
  })
})

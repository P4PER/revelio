import { describe, it, expect, vi } from 'vitest'

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({ notFound }))

import CatchAllPage from '../page'

describe('locale catch-all page', () => {
  it('calls notFound() so unmatched routes render the localized 404', () => {
    expect(() => CatchAllPage()).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
  })
})

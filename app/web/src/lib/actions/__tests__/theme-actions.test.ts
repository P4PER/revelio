import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = { set: vi.fn(), delete: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => store }))

const { setTheme } = await import('@/lib/actions/theme-actions')

beforeEach(() => {
  store.set.mockClear()
  store.delete.mockClear()
})

describe('setTheme', () => {
  it('writes an explicit choice as a long-lived cookie', async () => {
    expect(await setTheme('dark')).toEqual({ ok: true })
    expect(store.set).toHaveBeenCalledOnce()
    const [name, value, opts] = store.set.mock.calls[0]
    expect(name).toBe('revelio.theme')
    expect(value).toBe('dark')
    expect(opts).toMatchObject({ path: '/', sameSite: 'lax', httpOnly: false })
    expect(opts.maxAge).toBeGreaterThan(60 * 60 * 24 * 300)
  })

  it('deletes the cookie for system, rather than writing "system"', async () => {
    expect(await setTheme('system')).toEqual({ ok: true })
    expect(store.delete).toHaveBeenCalledWith('revelio.theme')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('rejects anything else without touching the cookie', async () => {
    const result = await setTheme('mauve')
    expect(result.ok).toBe(false)
    expect(store.set).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
  })
})

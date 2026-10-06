import { describe, it, expect, vi } from 'vitest'

// Counts down sharp calls; the one that reaches zero fails, so a test can fail
// exactly the render it means to.
const failing = vi.hoisted(() => ({ in: 0 }))

vi.mock('sharp', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const real = (await importOriginal<typeof import('sharp')>()).default
  const wrapped = (...args: Parameters<typeof real>) => {
    if (failing.in > 0 && --failing.in === 0) {
      return { raw: () => ({ toBuffer: () => Promise.reject(new Error('vips: out of memory')) }) }
    }
    return real(...args)
  }
  return { default: wrapped }
})

const { renderText } = await import('../src/text')

describe('line metrics', () => {
  // Metrics are cached per style, and every render at that style awaits them.
  // A cached failure would fail every later sheet at that size until restart.
  it('measures again after a failed measurement', async () => {
    const style = { size: 37, color: '#ffffff' }
    // renderText draws the string twice (ink, then line box) before it asks
    // for the style's metrics, which draw an H: the third call.
    failing.in = 3
    let first: unknown
    try { await renderText('ZAUBER', style) } catch (err) { first = err }
    expect((first as Error | undefined)?.message).toBe('vips: out of memory')
    const second = await renderText('ZAUBER', style)
    expect(second.baseline).toBeGreaterThan(second.capTop)
  })
})

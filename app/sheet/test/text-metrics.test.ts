import { describe, it, expect, vi, beforeEach } from 'vitest'

// What the mocked sharp has been asked to draw, and a switch that fails the
// next metrics measurement. The measurement is told apart by its content - it
// draws a lone H - not by its place in the call order, which a refactor of
// renderText is free to change.
const spy = vi.hoisted(() => ({ drawn: [] as string[], failMetrics: false }))
const isMetrics = (markup: string) => markup.includes('>H</span>')

vi.mock('sharp', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const real = (await importOriginal<typeof import('sharp')>()).default
  const wrapped = (...args: Parameters<typeof real>) => {
    const markup = (args[0] as { text?: { text?: string } } | undefined)?.text?.text
    if (markup !== undefined) {
      spy.drawn.push(markup)
      if (spy.failMetrics && isMetrics(markup)) {
        spy.failMetrics = false
        return { raw: () => ({ toBuffer: () => Promise.reject(new Error('vips: out of memory')) }) }
      }
    }
    return real(...args)
  }
  return { default: wrapped }
})

const { renderText } = await import('../src/text')

beforeEach(() => { spy.drawn = []; spy.failMetrics = false })

// Each test uses sizes of its own: the metrics cache lives for the module.
describe('line metrics', () => {
  // Metrics are cached per style, and every render at that style awaits them.
  // A cached failure would fail every later sheet at that size until restart.
  it('measures again after a failed measurement', async () => {
    const style = { size: 37, color: '#ffffff' }
    spy.failMetrics = true
    let first: unknown
    try { await renderText('ZAUBER', style) } catch (err) { first = err }
    expect((first as Error | undefined)?.message).toBe('vips: out of memory')
    const second = await renderText('ZAUBER', style)
    expect(second.baseline).toBeGreaterThan(second.capTop)
  })

  // Text is the hot path - two strings per card - so once a style is measured
  // a string costs one draw, not one for its width and one for its box.
  it('draws a string once its style is measured', async () => {
    await renderText('A', { size: 41, color: '#ffffff' })
    spy.drawn = []
    await renderText('ZAUBER', { size: 41, color: '#ffffff' })
    expect(spy.drawn).toHaveLength(1)
  })

  // Sizes are layout sizes times the render scale, and the scale is fractional
  // whenever a sheet is shrunk to its pixel budget, so nearly every such sheet
  // brings new sizes. An unbounded cache would grow for the life of the pod.
  it('keeps a bounded number of measured styles', async () => {
    await renderText('A', { size: 50, color: '#ffffff' })
    for (let i = 0; i < 300; i++) await renderText('A', { size: 60 + i / 7, color: '#ffffff' })
    spy.drawn = []
    await renderText('A', { size: 50, color: '#ffffff' })
    expect(spy.drawn.filter(isMetrics)).toHaveLength(1)
  }, 60_000)
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { createSetNames } from '../src/data/sets'

afterEach(() => vi.restoreAllMocks())

describe('createSetNames', () => {
  it('resolves a code to its localized name', async () => {
    vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Basis-Set' },
    ] as never)
    const sets = createSetNames({} as never)
    expect(await sets.name('base', 'de')).toBe('Basis-Set')
  })

  it('falls back to the raw code for an unknown set', async () => {
    vi.spyOn(dbModule, 'listSets').mockResolvedValue([] as never)
    const sets = createSetNames({} as never)
    expect(await sets.name('mystery', 'en')).toBe('mystery')
  })

  it('reads the database once per locale within the TTL', async () => {
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never)
    await sets.name('base', 'en')
    await sets.name('base', 'en')
    expect(listSets).toHaveBeenCalledTimes(1)
  })

  it('caches each locale separately', async () => {
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never)
    await sets.name('base', 'en')
    await sets.name('base', 'de')
    expect(listSets).toHaveBeenCalledTimes(2)
  })

  it('re-reads once the TTL has expired', async () => {
    vi.useFakeTimers()
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never, 1000)
    await sets.name('base', 'en')
    vi.advanceTimersByTime(1001)
    await sets.name('base', 'en')
    expect(listSets).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('lists every set for a locale', async () => {
    vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
      { code: 'qui', name: 'Quidditch Cup' },
    ] as never)
    const sets = createSetNames({} as never)
    expect(await sets.all('en')).toEqual([
      { code: 'base', name: 'Base Set' },
      { code: 'qui', name: 'Quidditch Cup' },
    ])
  })

  it('shares one cache read between all() and name()', async () => {
    const listSets = vi.spyOn(dbModule, 'listSets').mockResolvedValue([
      { code: 'base', name: 'Base Set' },
    ] as never)
    const sets = createSetNames({} as never)
    await sets.all('en')
    await sets.name('base', 'en')
    expect(listSets).toHaveBeenCalledTimes(1)
  })
})

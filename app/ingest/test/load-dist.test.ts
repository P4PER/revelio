import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadDist } from '../src/load-dist.js'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dist')

describe('loadDist', () => {
  it('parses sets keyed object into an array', async () => {
    const { sets } = await loadDist(fixtureDir)
    expect(sets).toHaveLength(2)
    expect(sets.find((s) => s.code === 'BS')?.name).toBe('Base')
  })

  it('parses the cards array with nested localizations', async () => {
    const { cards } = await loadDist(fixtureDir)
    expect(cards).toHaveLength(3)
    const dean = cards.find((c) => c.id === 'bs-1-dean-thomas')!
    expect(dean.localizations.de.text).toBe('Ziehe 3 Karten.')
    expect(dean.number).toBe('1')
  })
})

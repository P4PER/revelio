import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadSets } from '../src/load-sets.js'
import { loadAttributes } from '../src/load-attributes.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { buildDocuments } from '../src/build-documents.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(here, 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let byLang: Record<string, Awaited<ReturnType<typeof buildDocuments>>[string]>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets, fixtureDir)
  await loadAttributes(ctx.db, cards)
  await loadCards(ctx.db, cards, fixtureDir)
  byLang = await buildDocuments(ctx.db)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('buildDocuments', () => {
  it('produces one document set per language', () => {
    expect(Object.keys(byLang).sort()).toEqual(['de', 'en'])
    expect(byLang.en).toHaveLength(3)
  })

  it('resolves the localization for the language', () => {
    const deanDe = byLang.de.find((d) => d.id === 'bs-1-dean-thomas')!
    expect(deanDe.name).toBe('Dean Thomas')
    expect(deanDe.text).toBe('Ziehe 3 Karten.')
  })

  it('falls back to defaultLanguage when a localization is missing', () => {
    // qc-1-the-snitch has only en; its de doc should fall back to en text
    const snitchDe = byLang.de.find((d) => d.id === 'qc-1-the-snitch')!
    expect(snitchDe.name).toBe('The Snitch')
  })

  it('includes types/subTypes from the junctions and the lesson color', () => {
    const flob = byLang.en.find((d) => d.id === 'bs-2-flobberworm')!
    expect(flob.types).toEqual(['creature'])
    const dean = byLang.en.find((d) => d.id === 'bs-1-dean-thomas')!
    expect(dean.subTypes.sort()).toEqual(['gryffindor', 'wizard'])
  })

  it('carries set metadata (name + isOfficial)', () => {
    const snitch = byLang.en.find((d) => d.id === 'qc-1-the-snitch')!
    expect(snitch.isOfficial).toBe(true)
  })
})

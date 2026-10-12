import { describe, it, expect } from 'vitest'
import { inlineGrid } from '../src/discord/embeds/inline-grid'

const field = (name: string) => ({ name, value: 'v', inline: true })
const blank = { name: '\u200b', value: '\u200b', inline: true }

describe('inlineGrid', () => {
  it.each([
    [0, 0],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 6],
    [5, 6],
    [6, 6],
  ])('pads %i fields to %i', (given, expected) => {
    const fields = Array.from({ length: given }, (_, i) => field(`f${i}`))
    const out = inlineGrid(fields)
    expect(out).toHaveLength(expected)
    expect(out.slice(0, given)).toEqual(fields)
    for (const pad of out.slice(given)) expect(pad).toEqual(blank)
  })

  it('leaves the input array untouched', () => {
    const fields = [field('a')]
    inlineGrid(fields)
    expect(fields).toHaveLength(1)
  })
})

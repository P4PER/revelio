import { describe, it, expect } from 'vitest'
import { OTHER_GROUP, groupKey, groupMainEntries } from '../src/deck-groups.js'

const card = (name: string, types: string[]) => ({ name, types })

describe('groupKey', () => {
  it('buckets a card by its first type in priority order, lesson first', () => {
    expect(groupKey(card('a', ['creature', 'lesson']))).toBe('lesson')
    expect(groupKey(card('b', ['item', 'spell']))).toBe('spell')
  })

  it('puts a card with no known type in other', () => {
    expect(groupKey(card('c', ['mystery']))).toBe(OTHER_GROUP)
    expect(groupKey(card('d', []))).toBe(OTHER_GROUP)
  })
})

describe('groupMainEntries', () => {
  it('orders groups canonically with other before lessons and lessons last', () => {
    const groups = groupMainEntries([
      card('lesson', ['lesson']),
      card('odd', ['mystery']),
      card('item', ['item']),
      card('creature', ['creature']),
    ])
    expect([...groups.keys()]).toEqual(['creature', 'item', OTHER_GROUP, 'lesson'])
  })

  it('keeps the order entries arrive in within a group', () => {
    const groups = groupMainEntries([card('b', ['spell']), card('a', ['spell'])])
    expect(groups.get('spell')!.map((e) => e.name)).toEqual(['b', 'a'])
  })

  it('hands back the entries it was given, whatever their shape', () => {
    const entry = { ...card('x', ['item']), extra: 1 }
    expect(groupMainEntries([entry]).get('item')![0]).toBe(entry)
  })
})

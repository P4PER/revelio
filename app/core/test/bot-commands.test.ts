import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '../src/bot-commands'
import { LESSONS, TYPES } from '../src/attributes'

describe('BOT_COMMANDS', () => {
  it('names each command exactly once', () => {
    const names = BOT_COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  // Discord rejects an option name that is not lower case, and a rejected
  // registration takes every command down with it, not just the bad one.
  it('gives every option a lower-case name', () => {
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        expect(option.name).toBe(option.name.toLowerCase())
      }
    }
  })

  // A command that answers about the asker rather than about the game needs an
  // account to answer from, and its answer is nobody else's business. The two
  // properties travel together; splitting them is how one gets forgotten.
  it('marks personal commands as both ephemeral and link-required', () => {
    for (const command of BOT_COMMANDS) {
      expect(command.ephemeral).toBe(command.linkRequired)
    }
  })

  it('keeps exactly the two personal commands out of the channel', () => {
    expect(BOT_COMMANDS.filter((c) => c.ephemeral).map((c) => c.name))
      .toEqual(['collection', 'mydecks'])
  })

  // `choices` names an attribute scope rather than listing values, so the
  // rendered table reuses attrLabel and survives a new lesson or type.
  it('only sources choices from a scope that exists', () => {
    const scopes: Record<string, number> = { lessons: LESSONS.length, types: TYPES.length }
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        if (!option.choices) continue
        expect(scopes[option.choices]).toBeGreaterThan(0)
        expect(option.type).toBe('string')
      }
    }
  })

  it('puts a minimum only on an integer option', () => {
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        if (option.min !== undefined) expect(option.type).toBe('integer')
      }
    }
  })

  it('describes the search options in the order Discord shows them', () => {
    const search = BOT_COMMANDS.find((c) => c.name === 'search')
    expect(search?.options.map((o) => o.name))
      .toEqual(['query', 'lesson', 'type', 'set', 'page'])
  })

  it('takes no options for mydecks', () => {
    expect(BOT_COMMANDS.find((c) => c.name === 'mydecks')?.options).toEqual([])
  })
})

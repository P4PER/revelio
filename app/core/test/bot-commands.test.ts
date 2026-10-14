import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '../src/bot-commands'

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
  // A linked command reads someone's own data, so its answer is private. The
  // converse does not hold: /search is private but needs no account.
  it('answers every link-required command privately', () => {
    for (const command of BOT_COMMANDS.filter((c) => c.linkRequired)) {
      expect(command.ephemeral).toBe(true)
    }
  })

  it('keeps the personal commands and the browsers out of the channel', () => {
    expect(BOT_COMMANDS.filter((c) => c.ephemeral).map((c) => c.name).sort())
      .toEqual(['collection', 'decks', 'mydecks', 'search'])
  })

  // `choices` names an attribute scope rather than listing values, and the
  // scope's codes are strings, so only a string option can carry one.
  it('puts choices only on a string option', () => {
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        if (!option.choices) continue
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
})

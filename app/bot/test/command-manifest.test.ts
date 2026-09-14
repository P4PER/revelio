import { describe, it, expect } from 'vitest'
import { ApplicationCommandOptionType } from 'discord.js'
import { BOT_COMMANDS, LESSONS, TYPES } from '@revelio/core'
import { COMMANDS } from '../src/discord/commands/index'

// The manifest speaks in domain words; Discord's JSON speaks in numbers.
const OPTION_TYPE = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
} as const

// discord.js omits a flag it was never given, so an absent `required` means
// false. Normalising both sides is what keeps the comparison honest.
function optionsOf(name: string) {
  const command = COMMANDS.get(name)
  if (!command) throw new Error(`no registered command named ${name}`)
  const json = command.data.toJSON() as {
    options?: { name: string; type: number; required?: boolean; autocomplete?: boolean }[]
  }
  return (json.options ?? []).map((option) => ({
    name: option.name,
    type: option.type,
    required: option.required ?? false,
    autocomplete: option.autocomplete ?? false,
  }))
}

describe('BOT_COMMANDS matches what the bot registers with Discord', () => {
  it('covers every registered command and invents none', () => {
    expect(BOT_COMMANDS.map((c) => c.name).slice().sort())
      .toEqual([...COMMANDS.keys()].sort())
  })

  for (const command of BOT_COMMANDS) {
    it(`/${command.name} declares the options the builder registers`, () => {
      expect(optionsOf(command.name)).toEqual(
        command.options.map((option) => ({
          name: option.name,
          type: OPTION_TYPE[option.type],
          required: option.required,
          autocomplete: option.autocomplete,
        })),
      )
    })
  }

  // The manifest records the scope, not the values. If the builder stopped
  // offering every value, a docs table built from the scope would overstate
  // what a user can pick.
  it('offers every lesson and every type as a choice on /search', () => {
    const json = COMMANDS.get('search')!.data.toJSON() as {
      options: { name: string; choices?: unknown[] }[]
    }
    const byName = new Map(json.options.map((option) => [option.name, option]))
    expect(byName.get('lesson')?.choices).toHaveLength(LESSONS.length)
    expect(byName.get('type')?.choices).toHaveLength(TYPES.length)
  })

  // Page 0 is not a page. Discord enforces the floor client-side, so losing it
  // turns a typo into an empty embed rather than a validation message.
  it('keeps the page floor on /search in step with the manifest', () => {
    const json = COMMANDS.get('search')!.data.toJSON() as {
      options: { name: string; min_value?: number }[]
    }
    const page = json.options.find((option) => option.name === 'page')
    const spec = BOT_COMMANDS.find((c) => c.name === 'search')!
      .options.find((option) => option.name === 'page')
    expect(page?.min_value).toBe(spec?.min)
    expect(spec?.min).toBe(1)
  })
})

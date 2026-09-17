import { describe, it, expect, vi, afterEach } from 'vitest'
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { BOT_COMMANDS, LESSONS, TYPES } from '@revelio/core'
import { COMMANDS } from '../src/discord/commands/index'

// The manifest speaks in domain words; Discord's JSON speaks in numbers.
const OPTION_TYPE = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
} as const

// The manifest records the scope, not the values, so the docs table can resolve
// them through attrLabel. Resolving it here is what stops the manifest claiming
// a dropdown Discord never offers, or dropping one it does.
const SCOPE_VALUES: Record<string, string[]> = {
  lessons: LESSONS.map((l) => l.code),
  types: TYPES.map((t) => t.code),
}

afterEach(() => { vi.restoreAllMocks() })

// discord.js omits a flag it was never given, so an absent `required` means
// false. Normalising both sides is what keeps the comparison honest.
function optionsOf(name: string) {
  const command = COMMANDS.get(name)
  if (!command) throw new Error(`no registered command named ${name}`)
  const json = command.data.toJSON() as {
    options?: {
      name: string
      type: number
      required?: boolean
      autocomplete?: boolean
      choices?: { value: string | number }[]
    }[]
  }
  return (json.options ?? []).map((option) => ({
    name: option.name,
    type: option.type,
    required: option.required ?? false,
    autocomplete: option.autocomplete ?? false,
    choices: option.choices?.map((choice) => choice.value) ?? null,
  }))
}

// Every handler defers as its first statement, so the flags are settled before
// anything downstream can fail on the empty deps below.
function deferOf(name: string) {
  const interaction = {
    locale: 'en',
    user: { id: '111' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: () => null, getInteger: () => null },
  }
  const deps = {
    meili: {},
    db: {},
    sets: { name: vi.fn(), all: vi.fn().mockResolvedValue([]) },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
  const done = COMMANDS.get(name)!.execute(interaction as never, deps as never)
    .catch(() => undefined)
  return { interaction, done }
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
          choices: option.choices
            ? SCOPE_VALUES[option.choices]
            : option.values ? [...option.values] : null,
        })),
      )
    })
  }

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

  // The docs state, per command, whether the answer is private and whether it
  // needs a linked account. Both are claims about the handler, so both are
  // checked against the handler rather than trusted.
  for (const command of BOT_COMMANDS) {
    it(`/${command.name} defers ${command.ephemeral ? 'ephemerally' : 'in the channel'}`, async () => {
      const { interaction, done } = deferOf(command.name)
      await done
      expect(interaction.deferReply).toHaveBeenCalledWith(
        ...(command.ephemeral ? [{ flags: MessageFlags.Ephemeral }] : []),
      )
    })
  }

  for (const command of BOT_COMMANDS.filter((c) => c.linkRequired)) {
    it(`/${command.name} sends an unlinked user to the settings page`, async () => {
      vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
      const { interaction, done } = deferOf(command.name)
      await done
      const [reply] = interaction.editReply.mock.calls[0] as [{ content: string }]
      expect(reply.content).toContain('/settings')
    })
  }
})

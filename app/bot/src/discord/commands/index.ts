import type { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder } from 'discord.js'
import type { Deps } from '../../clients'
import * as card from './card'
import * as search from './search'

export type BotCommand = {
  data: SlashCommandOptionsOnlyBuilder
  execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void>
}

// A registry, not a barrel: main.ts routes an interaction by name through this
// map, and register.ts publishes every entry's builder to Discord.
export const COMMANDS: Map<string, BotCommand> = new Map(
  [card, search].map((c) => [c.data.name, c as BotCommand]),
)

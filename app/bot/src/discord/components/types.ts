import type { MessageComponentInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import type { CustomId } from './custom-id'

export type ComponentHandler = (
  interaction: MessageComponentInteraction,
  id: CustomId,
  deps: Deps,
) => Promise<void>

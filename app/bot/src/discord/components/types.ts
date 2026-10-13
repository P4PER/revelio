import type { MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import type { CustomId } from './custom-id'

export type ComponentHandler = (
  interaction: MessageComponentInteraction,
  id: CustomId,
  deps: Deps,
) => Promise<void>

// A submitted form, routed by its custom id like a click.
export type ModalHandler = (
  interaction: ModalSubmitInteraction,
  id: CustomId,
  deps: Deps,
) => Promise<void>

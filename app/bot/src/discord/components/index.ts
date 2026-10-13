import type { CustomId } from './custom-id'
import type { ComponentHandler } from './types'

// The twin of COMMANDS: handle-interaction.ts routes a click by its custom id's
// kind through this map. The browsers of phases 2 and 3 register here. A
// handler acting on a public message acknowledges only with an ephemeral
// reply, never update/deferUpdate, so that neither it nor the router's error
// answer can rewrite a message the whole channel sees.
export const COMPONENTS: Map<CustomId['kind'], ComponentHandler> = new Map()

import { ComponentType } from 'discord.js'

// A component as Discord receives it: the JSON a builder serializes to.
type ComponentJSON = {
  type: number
  content?: string
  components?: ComponentJSON[]
  accessory?: ComponentJSON
}

// Anything that serializes to a component: every discord.js builder.
export type Encodable = { toJSON(): unknown }

export type Tally = { components: number; text: number }

// Discord's ceilings for one IS_COMPONENTS_V2 message. The docs state the
// 40-component cap but not whether nested components count, and no total
// text cap; both are assumed here because the assumption can only be stricter
// than Discord (spec, "Discord constraints" and "Probe findings"). A breach
// fails the whole interaction with a 400, so views clamp their own text and
// this guard is the backstop that turns a clamp bug into a logged error.
export const MAX_COMPONENTS = 40
export const MAX_TEXT = 4000

function tally(node: ComponentJSON, acc: Tally): void {
  acc.components += 1
  // .length counts UTF-16 units, never fewer than Discord's characters, so
  // the guard can only err towards rejecting.
  if (node.type === ComponentType.TextDisplay) acc.text += node.content?.length ?? 0
  for (const child of node.components ?? []) tally(child, acc)
  if (node.accessory) tally(node.accessory, acc)
}

export function measure(components: readonly Encodable[]): Tally {
  const acc: Tally = { components: 0, text: 0 }
  for (const component of components) tally(component.toJSON() as ComponentJSON, acc)
  return acc
}

export function assertWithinLimits(components: readonly Encodable[]): void {
  const { components: count, text } = measure(components)
  if (count > MAX_COMPONENTS) {
    throw new Error(`V2 message has ${count} components, over the ${MAX_COMPONENTS} limit`)
  }
  if (text > MAX_TEXT) {
    throw new Error(`V2 message has ${text} text characters, over the ${MAX_TEXT} limit`)
  }
}

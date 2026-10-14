import type { MessageComponentInteraction } from 'discord.js'
import { ANY } from '../v2/search-view'

// The one value a single select sent, or null for "Any" and for a button.
// Client data: callers check it against what they accept.
export function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

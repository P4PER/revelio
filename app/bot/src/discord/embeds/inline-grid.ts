import type { APIEmbedField } from 'discord.js'

// Discord lays inline fields out three to a row and stretches a short last row
// across the full width, so a fifth field would sit centred under the grid.
// Blank fields (a zero-width space; Discord rejects an empty string) pad the
// row back to three columns.
const INLINE_COLUMNS = 3
const BLANK = '\u200b'

// Every field passed in must be inline: a full-width field ends Discord's row
// early, and the count here would no longer match the rows on screen.
export function inlineGrid(fields: APIEmbedField[]): APIEmbedField[] {
  const padded = [...fields]
  while (padded.length % INLINE_COLUMNS) padded.push({ name: BLANK, value: BLANK, inline: true })
  return padded
}

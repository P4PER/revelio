import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '@revelio/core'

// Prose that counts the bot's commands cannot be derived from the manifest the
// way the command grid is, so it drifts: /decks shipped while two pages and the
// docs nav still said "five". Any count word that sits right before
// "commands" / "Befehle" must be the manifest's count.
const NUMBERS: Record<string, number> = {
  five: 5, six: 6, seven: 7, eight: 8,
  'fünf': 5, sechs: 6, sieben: 7, acht: 8,
}
const COUNTED = /\b(five|six|seven|eight|fünf|sechs|sieben|acht)\s+(?:slash[ -])?(?:commands|befehle)\b/gi

const root = join(__dirname, '../../../..')
const docs = join(root, 'content/docs')

const sources = [
  ...readdirSync(docs)
    .filter((name) => name.startsWith('discord'))
    .map((name) => ({ name, text: readFileSync(join(docs, name), 'utf8') })),
  ...['en', 'de'].map((l) => ({ name: `messages/${l}.json`, text: readFileSync(join(root, `messages/${l}.json`), 'utf8') })),
]

describe('prose that counts the bot commands', () => {
  it.each(sources)('$name says the manifest count', ({ text }) => {
    const counts = [...text.matchAll(COUNTED)].map((m) => NUMBERS[m[1].toLowerCase()])
    for (const count of counts) expect(count).toBe(BOT_COMMANDS.length)
  })
})

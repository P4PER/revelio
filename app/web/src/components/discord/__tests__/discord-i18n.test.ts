import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '@revelio/core'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// message-key-parity.test.ts already holds the two catalogs to the same keys.
// What it cannot know is that the keys line up with the bot's command list.
describe('discord i18n', () => {
  it('describes every command in both locales', () => {
    for (const messages of [en, de]) {
      for (const { name } of BOT_COMMANDS) {
        expect((messages.discord.commands as Record<string, { description: string }>)[name]?.description, name).toBeTruthy()
      }
    }
  })
})

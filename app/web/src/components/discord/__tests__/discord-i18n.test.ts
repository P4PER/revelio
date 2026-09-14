import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// The page is copy-heavy and bilingual; a key present in one catalog and
// missing in the other renders the raw key path to a visitor.
function keyPaths(value: object): string[] {
  return Object.entries(value)
    .flatMap(([k, v]) =>
      v !== null && typeof v === 'object' ? keyPaths(v).map((child) => `${k}.${child}`) : [k],
    )
    .sort()
}

describe('discord i18n', () => {
  it('has a discord namespace in both locales', () => {
    expect(en.discord).toBeTruthy()
    expect(de.discord).toBeTruthy()
  })

  it('holds the same keys in both locales', () => {
    expect(keyPaths(en.discord)).toEqual(keyPaths(de.discord))
  })

  it('describes all five commands in both locales', () => {
    for (const messages of [en, de]) {
      for (const name of ['card', 'search', 'deck', 'collection', 'mydecks'] as const) {
        expect(messages.discord.commands[name].description).toBeTruthy()
      }
    }
  })
})

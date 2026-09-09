import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'

// /card reaches Postgres for rulings. The fake deps carry no real db, so stub
// the query itself; a card with no rulings is the common case anyway.
beforeEach(() => { vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null) })
afterEach(() => { vi.restoreAllMocks() })

function fakeInteraction(options: Record<string, string | number | null>, locale = 'en') {
  return {
    locale,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: (name: string) => (options[name] as string) ?? null,
      getInteger: (name: string) => (options[name] as number) ?? null,
    },
  }
}

function fakeDeps(hits: unknown[], total: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: total })
  return {
    meili: { index: () => ({ search }) },
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}

function fakeAutocomplete(focused: string, locale = 'en') {
  return {
    locale,
    respond: vi.fn().mockResolvedValue(undefined),
    options: { getFocused: () => focused, getSubcommand: () => null },
  }
}

const doc = {
  id: 'base-12', setCode: 'base', number: '12', numberSort: '0:12', name: 'Nimbus 2000',
  text: null, flavorText: null, types: [], subTypes: [], lesson: null, rarity: null,
  finishes: [], legality: null, cost: null, damage: null, isOfficial: true,
  imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en',
  orientation: null,
}

describe('/card', () => {
  it('defers, then replies with an embed for the best hit', async () => {
    const interaction = fakeInteraction({ name: 'nimbus' })
    const deps = fakeDeps([doc], 1)
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)

    expect(interaction.deferReply).toHaveBeenCalled()
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Nimbus 2000')
  })

  it('replies with a localized miss when nothing matches', async () => {
    const interaction = fakeInteraction({ name: 'zzz' }, 'de')
    await COMMANDS.get('card')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Keine Karte passt zu "zzz".' }),
    )
  })

  it('never lets the echoed name ping anyone', async () => {
    // The miss reply interpolates raw user input into message content. Without
    // an explicit allowedMentions, Discord parses it and `/card name:@everyone`
    // becomes a mass ping issued by the bot.
    const interaction = fakeInteraction({ name: '@everyone' })
    await COMMANDS.get('card')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } }),
    )
  })
})

describe('/search', () => {
  it('replies with a result page', async () => {
    const interaction = fakeInteraction({ query: 'nimbus', page: 1 })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([doc], 1) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().description).toContain('Nimbus 2000')
  })

  it('tells the user when the requested page is past the end', async () => {
    const interaction = fakeInteraction({ query: 'nimbus', page: 9 })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([doc], 1) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('1 page') }),
    )
  })

  it('treats an in-range but empty page as out of range', async () => {
    // estimatedTotalHits can over-estimate: 25 estimated, 12 real, page 3 asked.
    const interaction = fakeInteraction({ query: 'nimbus', page: 3 })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([], 25) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('does not exist') }),
    )
  })

  it('replies with a localized empty state', async () => {
    const interaction = fakeInteraction({ query: 'zzz' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Nothing matched that search.' }),
    )
  })
})

describe('the command registry', () => {
  it('keys each command by its own builder name', () => {
    for (const [key, command] of COMMANDS) {
      expect(command.data.name).toBe(key)
    }
  })
})

describe('/card autocomplete', () => {
  it('responds with name/value pairs where the value is the card id', async () => {
    const interaction = fakeAutocomplete('nim')
    await COMMANDS.get('card')!.autocomplete!(interaction as never, fakeDeps([doc], 1) as never)
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Nimbus 2000 (base #12)', value: 'base-12' },
    ])
  })

  it('responds with an empty list for an empty query', async () => {
    const interaction = fakeAutocomplete('  ')
    await COMMANDS.get('card')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })

  it('answers with an empty list rather than throwing when Meilisearch fails', async () => {
    const interaction = fakeAutocomplete('nim')
    const deps = { meili: { index: () => ({ search: vi.fn().mockRejectedValue(new Error('down')) }) } }
    await COMMANDS.get('card')!.autocomplete!(interaction as never, deps as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})

describe('/card id fast path', () => {
  it('fetches by id when the submitted value is a document id', async () => {
    const interaction = fakeInteraction({ name: 'base-12' })
    const getDocument = vi.fn().mockResolvedValue(doc)
    const search = vi.fn()
    const deps = {
      meili: { index: () => ({ getDocument, search }) },
      db: {},
      sets: { name: vi.fn().mockResolvedValue('Base Set') },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)
    expect(getDocument).toHaveBeenCalledWith('base-12')
    expect(search).not.toHaveBeenCalled()
  })

  it('falls back to a text search when the value is not an id', async () => {
    const interaction = fakeInteraction({ name: 'nimbus' })
    const getDocument = vi.fn().mockRejectedValue(new Error('not found'))
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const deps = {
      meili: { index: () => ({ getDocument, search }) },
      db: {},
      sets: { name: vi.fn().mockResolvedValue('Base Set') },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)
    expect(search).toHaveBeenCalled()
  })
})

describe('/search set filter', () => {
  it('passes the chosen set code into the Meilisearch filter', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const deps = {
      meili: { index: () => ({ search }) },
      db: {},
      sets: { name: vi.fn(), all: vi.fn() },
      env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
    }
    const interaction = fakeInteraction({ query: 'broom', set: 'base' })
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    const [, options] = search.mock.calls[0]
    // buildFilter emits one parenthesised clause per facet, and `filter` is the
    // array of those clauses, so this is an element match rather than a substring.
    expect(options.filter).toContain('(setCode = "base")')
  })

  it('suggests sets matching the typed fragment, by code or by name', async () => {
    const all = vi.fn().mockResolvedValue([
      { code: 'base', name: 'Base Set' },
      { code: 'qui', name: 'Quidditch Cup' },
    ])
    const interaction = fakeAutocomplete('quid')
    await COMMANDS.get('search')!.autocomplete!(interaction as never, { sets: { all } } as never)
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Quidditch Cup', value: 'qui' },
    ])
  })

  it('never suggests more than 25 sets', async () => {
    const all = vi.fn().mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ code: `s${i}`, name: `Set ${i}` })),
    )
    const interaction = fakeAutocomplete('set')
    await COMMANDS.get('search')!.autocomplete!(interaction as never, { sets: { all } } as never)
    expect(interaction.respond.mock.calls[0][0]).toHaveLength(25)
  })
})

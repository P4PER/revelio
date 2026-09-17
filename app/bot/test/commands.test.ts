import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { renderDeckImage } from '../src/images/deck-image'

// Rendering is exercised by deck-image.test.ts; here it is a seam, so /deck's
// two views and its fallback can be told apart without drawing anything.
vi.mock('../src/images/deck-image', () => ({ renderDeckImage: vi.fn() }))

// /card reaches Postgres for rulings. The fake deps carry no real db, so stub
// the query itself; a card with no rulings is the common case anyway.
beforeEach(() => {
  vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null)
  vi.spyOn(dbModule, 'getSubTypeLabels').mockResolvedValue({})
  // Armed here rather than in the factory: afterEach's restoreAllMocks strips a
  // factory implementation too, and a seam that resolves undefined would leave
  // /deck falling back to the list without any test saying so.
  vi.mocked(renderDeckImage).mockResolvedValue({ body: Buffer.from('png'), name: 'deck.png' })
})
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

// A relevance read leaves as a federated multi-search: a name-only query weighted
// against the unrestricted one. The stub cannot rank, so it runs only the unrestricted
// query - the one a federated read draws its full hit list from - through the same
// `index` and `search` mocks, with the federated window folded back in. Routing it
// through `index` matters: the index uid rides inside the sub-query rather than in an
// `index()` call, and a test that asserts which locale index was read must hold
// whichever transport the read used.
function federatedToSearch(index: (uid: string) => { search: ReturnType<typeof vi.fn> }) {
  return async (req: {
    federation: Record<string, unknown>
    queries: Record<string, unknown>[]
  }) => {
    const { indexUid, q, federationOptions: _opts, ...rest } =
      req.queries[req.queries.length - 1] as Record<string, unknown> & {
        indexUid: string
        q: string
      }
    return index(indexUid).search(q, { ...rest, ...req.federation })
  }
}

// Both transports over one `search` mock - see federatedToSearch.
function fakeMeili(search: ReturnType<typeof vi.fn>) {
  const index = () => ({ search })
  return { index, multiSearch: federatedToSearch(index) }
}

function fakeDeps(hits: unknown[], total: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: total })
  return {
    meili: fakeMeili(search),
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', IMAGE_FETCH_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
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
    const deps = { meili: fakeMeili(vi.fn().mockRejectedValue(new Error('down'))) }
    await COMMANDS.get('card')!.autocomplete!(interaction as never, deps as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})

function fastPathDeps(search: unknown) {
  return {
    meili: fakeMeili(search as ReturnType<typeof vi.fn>),
    db: {},
    sets: { name: vi.fn().mockResolvedValue('Base Set') },
    env: { IMAGE_BASE_URL: 'https://img.test', IMAGE_FETCH_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}

describe('/card id fast path', () => {
  it('resolves a submitted card id with one filtered lookup', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const interaction = fakeInteraction({ name: 'base-12' })
    await COMMANDS.get('card')!.execute(interaction as never, fastPathDeps(search) as never)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('', expect.objectContaining({
      filter: ['id IN ["base-12"]'],
    }))
  })

  it('falls back to a text search when the value is not an id', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0 })
      .mockResolvedValueOnce({ hits: [doc], estimatedTotalHits: 1 })
    const interaction = fakeInteraction({ name: 'nimbus' })
    await COMMANDS.get('card')!.execute(interaction as never, fastPathDeps(search) as never)
    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenLastCalledWith('nimbus', expect.anything())
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Nimbus 2000')
  })
})

describe('/search set filter', () => {
  it('passes the chosen set code into the Meilisearch filter', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [doc], estimatedTotalHits: 1 })
    const deps = {
      meili: fakeMeili(search),
      db: {},
      sets: { name: vi.fn(), all: vi.fn() },
      env: { IMAGE_BASE_URL: 'https://img.test', IMAGE_FETCH_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
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

  it('clamps a set name to Discord\'s 100 character limit', async () => {
    // Discord rejects the whole response with a 400 if any choice name is too
    // long, which costs the user every suggestion, not just the oversized one.
    const all = vi.fn().mockResolvedValue([{ code: 'long', name: 'S'.repeat(200) }])
    const interaction = fakeAutocomplete('s')
    await COMMANDS.get('search')!.autocomplete!(interaction as never, { sets: { all } } as never)
    expect(interaction.respond.mock.calls[0][0][0].name.length).toBeLessThanOrEqual(100)
  })
})

// Duplicated from decks.test.ts on purpose: a fixture copied into the file that
// reads it keeps each test file self-contained.
const deckViews = [
  { cardId: 'c1', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, lesson: null, types: ['character'], subTypes: ['wizard'], isLesson: false, isStartingCharacter: true, isOfficial: true, legality: 'legal' },
  { cardId: 'c2', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms', types: ['spell'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
]

function stubDeck() {
  return {
    deck: {
      id: 'abc123', name: 'Charms Aggro', format: 'classic', visibility: 'public',
      cards: deckViews.map((v) => ({ cardId: v.cardId, zone: v.zone, quantity: v.quantity })),
      createdAt: '2026-01-01', updatedAt: '2026-01-02',
    },
    userId: 'u1',
    views: deckViews,
    viewCount: 7,
    ownerUsername: 'seeker',
  }
}

describe('/deck', () => {
  it('replies with an embed for a public deck', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'https://revelio.cards/decks/abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Charms Aggro')
  })

  // The bot performs this GET itself, so the sheet has to come from the host it
  // can reach, not the public one Discord fetches embed images from.
  it('renders the deck sheet from the fetch base, not the public one', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deps = fakeDeps([], 0)
    deps.env = {
      ...deps.env,
      IMAGE_BASE_URL: 'https://public.test/images',
      IMAGE_FETCH_BASE_URL: 'http://internal.test:9000/images',
    }
    await COMMANDS.get('deck')!.execute(fakeInteraction({ deck: 'abc123' }) as never, deps as never)
    const [, options] = vi.mocked(renderDeckImage).mock.calls.at(-1)!
    expect(options.imageBase).toBe('http://internal.test:9000/images')
  })

  // getString returns null for an option nobody passed, which is exactly what
  // Discord sends when a user types /deck with no view.
  it('defaults to the picture, uploaded as the embed attachment', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files[0].name).toBe('deck.png')
    expect(payload.embeds[0].toJSON().image?.url).toBe('attachment://deck.png')
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(false)
  })

  // The renderer falls back to WebP on an oversized sheet, and the embed can
  // only reach the upload by name, so the two must not be able to disagree.
  it('uploads and references the deck sheet under the name the renderer chose', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.mocked(renderDeckImage).mockResolvedValueOnce({ body: Buffer.from('webp'), name: 'deck.webp' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files[0].name).toBe('deck.webp')
    expect(payload.embeds[0].toJSON().image?.url).toBe('attachment://deck.webp')
  })

  it('sends the text list, and no file, for view:list', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123', view: 'list' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files).toBeUndefined()
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(true)
  })

  // A deck the user can see is worth more than the picture of it.
  it('falls back to the list when rendering throws', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.mocked(renderDeckImage).mockRejectedValueOnce(new Error('libvips said no'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files).toBeUndefined()
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })

  it('never renders an empty deck', async () => {
    const empty = stubDeck()
    empty.views = []
    empty.deck.cards = []
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(empty as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(vi.mocked(renderDeckImage)).not.toHaveBeenCalled()
    expect(interaction.editReply.mock.calls[0][0].files).toBeUndefined()
  })

  it('replies with a localized miss for a private or unknown deck', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    const interaction = fakeInteraction({ deck: 'nope' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Private decks') }),
    )
  })

  it('never records a view', async () => {
    const record = vi.spyOn(dbModule, 'recordView')
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(record).not.toHaveBeenCalled()
  })
})

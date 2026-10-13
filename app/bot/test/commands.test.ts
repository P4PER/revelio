import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { requestDeckSheet } from '../src/data/sheet'

// The render service is exercised by sheet.test.ts and the service's own suite;
// here it is a seam, so /deck's two views and its fallback can be told apart
// without drawing anything.
vi.mock('../src/data/sheet', () => ({ requestDeckSheet: vi.fn() }))

// /card reaches Postgres for rulings. The fake deps carry no real db, so stub
// the query itself; a card with no rulings is the common case anyway.
beforeEach(() => {
  vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null)
  vi.spyOn(dbModule, 'getSubTypeLabels').mockResolvedValue({})
  // Armed here rather than in the mock factory: afterEach's restoreAllMocks
  // strips a factory implementation too, and a seam that resolves undefined
  // would leave /deck falling back to the list without any test saying so.
  vi.mocked(requestDeckSheet).mockResolvedValue({ body: Buffer.from('png'), name: 'deck.png' })
})
afterEach(() => { vi.restoreAllMocks() })

function fakeInteraction(
  options: Record<string, string | number | null>,
  locale = 'en',
  awaitMessageComponent = vi.fn().mockRejectedValue(new Error('time')),
) {
  return {
    locale,
    user: { id: '111' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({ resource: { message: { awaitMessageComponent } } }),
    options: {
      getString: (name: string) => (options[name] as string) ?? null,
      getInteger: (name: string) => (options[name] as number) ?? null,
    },
  }
}

// A button or select click on the prompt. message.awaitMessageComponent is
// what a select pick hands on to the visibility prompt that replaces it.
function fakeComponent(
  customId: string,
  values: string[] = [],
  next = vi.fn().mockRejectedValue(new Error('time')),
) {
  return {
    customId,
    values,
    user: { id: '111' },
    isStringSelectMenu: () => values.length > 0,
    deferReply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    message: { awaitMessageComponent: next },
  }
}

const access = (value: dbModule.DeckAccess | null) =>
  vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(value)
const viewer = (id: string | null) =>
  vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(id)

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
    env: {
      IMAGE_BASE_URL: 'https://img.test',
      SITE_BASE_URL: 'https://revelio.cards',
      SHEET_SERVICE_URL: 'http://sheet:8080',
      SHEET_TOKEN: 'a-token-at-least-16-chars',
    },
  }
}

function fakeAutocomplete(focused: string, locale = 'en') {
  return {
    locale,
    user: { id: '111' },
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
    env: {
      IMAGE_BASE_URL: 'https://img.test',
      SITE_BASE_URL: 'https://revelio.cards',
      SHEET_SERVICE_URL: 'http://sheet:8080',
      SHEET_TOKEN: 'a-token-at-least-16-chars',
    },
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
      env: {
        IMAGE_BASE_URL: 'https://img.test',
        SITE_BASE_URL: 'https://revelio.cards',
        SHEET_SERVICE_URL: 'http://sheet:8080',
        SHEET_TOKEN: 'a-token-at-least-16-chars',
      },
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
  beforeEach(() => {
    viewer(null)
    access({ access: 'public', name: 'Charms Aggro' })
  })

  it('replies with an embed for a public deck', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'https://revelio.cards/decks/abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.embeds[0].toJSON().title).toBe('Charms Aggro')
  })

  // getString returns null for an option nobody passed, which is exactly what
  // Discord sends when a user types /deck with no view.
  it('uploads the sheet under the name the service chose', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.mocked(requestDeckSheet).mockResolvedValueOnce({ body: Buffer.from('webp'), name: 'deck.webp' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files[0].name).toBe('deck.webp')
    expect(payload.embeds[0].toJSON().image?.url).toBe('attachment://deck.webp')
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(false)
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
  it('falls back to the list embed when the service cannot answer', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.mocked(requestDeckSheet).mockRejectedValueOnce(new Error('sheet service answered 503'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.files).toBeUndefined()
    expect(payload.embeds[0].toJSON().image).toBeUndefined()
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })

  // The picture's editReply lives inside the try for this reason: Discord can
  // reject the upload itself (an attachment it will not take), and that must
  // cost the picture rather than the answer. Hoisting it out of the try - which
  // reads like a simplification, since a return follows - would turn "no
  // picture" into "/deck failed".
  it('falls back to the list when Discord rejects the upload', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeInteraction({ deck: 'abc123' })
    interaction.editReply.mockRejectedValueOnce(new Error('Request entity too large'))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledTimes(2)
    const payload = interaction.editReply.mock.calls[1][0]
    expect(payload.files).toBeUndefined()
    expect(payload.embeds[0].toJSON().fields?.some((f: { name: string }) => f.name.startsWith('Main deck'))).toBe(true)
  })

  it('never asks for a sheet of an empty deck', async () => {
    const empty = stubDeck()
    empty.views = []
    empty.deck.cards = []
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(empty as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(vi.mocked(requestDeckSheet)).not.toHaveBeenCalled()
    expect(interaction.editReply.mock.calls[0][0].files).toBeUndefined()
  })

  it('answers an unknown deck ephemerally, without a public defer', async () => {
    access(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    const interaction = fakeInteraction({ deck: 'nope' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'No deck matched that name, link or id.',
      flags: MessageFlags.Ephemeral,
    })
  })

  // Review focus 3: someone else's private deck is indistinguishable from a
  // deck that does not exist.
  it('answers another user\'s private deck exactly like an unknown one', async () => {
    viewer('user-1')
    access(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    const interaction = fakeInteraction({ deck: 'bobs-private-id' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply.mock.calls[0][0].content).toBe('No deck matched that name, link or id.')
  })

  // A deck posted without asking is loaded as nobody: if its owner made it
  // private after the access check, it reads as not found instead of being
  // posted on the owner's own authority.
  it('loads an unprompted public deck as an anonymous viewer', async () => {
    viewer('user-1')
    const load = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith()
    expect(load).toHaveBeenCalledWith({}, 'abc123', null)
  })

  // The leak regression: an own private deck must never start with a public
  // defer, whatever happens afterwards.
  it('asks privately before showing an own private deck', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).not.toHaveBeenCalled()
    const prompt = interaction.reply.mock.calls[0][0]
    expect(prompt.flags).toBe(MessageFlags.Ephemeral)
    expect(prompt.content).toContain('Secret Charms')
    expect(prompt.components).toHaveLength(1)
  })

  // The click opens the deck's own message with deferReply, so Discord shows
  // its native "thinking" state at once; the answered prompt is deleted.
  it('posts publicly only after "Post publicly"', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const click = fakeComponent('deck:post')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deferReply).toHaveBeenCalledWith()
    expect(click.editReply.mock.calls[0][0].embeds[0].toJSON().title).toBe('Charms Aggro')
    expect(click.followUp).not.toHaveBeenCalled()
    expect(interaction.deleteReply).toHaveBeenCalled()
  })

  it('never posts publicly for "Only show me"', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const click = fakeComponent('deck:self')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(click.followUp).not.toHaveBeenCalled()
    expect(click.editReply.mock.calls[0][0].embeds[0].toJSON().title).toBe('Charms Aggro')
    expect(interaction.deleteReply).toHaveBeenCalled()
  })

  // Review focus 4: the deck vanished or went private between prompt and click.
  // Only the one-row access check runs before the click is acknowledged, so
  // "not found" stays in the private prompt and no public "thinking" message
  // ever appears.
  it('reports a deck that disappeared before the click, and posts nothing', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' }).mockResolvedValueOnce(
      { access: 'own-private', name: 'Secret Charms' },
    ).mockResolvedValueOnce(null)
    const load = vi.spyOn(dbModule, 'getDeckForViewer')
    const click = fakeComponent('deck:post')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deferReply).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(click.update).toHaveBeenCalledWith({
      content: 'No deck matched that name, link or id.', components: [],
    })
  })

  // The full deck load runs after the defer; a deck gone in that gap takes the
  // public placeholder back and tells the caller alone.
  it('withdraws the public placeholder for a deck gone after the defer', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    const click = fakeComponent('deck:post')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deleteReply).toHaveBeenCalled()
    expect(click.followUp).toHaveBeenCalledWith({
      content: 'No deck matched that name, link or id.', flags: MessageFlags.Ephemeral,
    })
  })

  // Review finding: a failure before the click is acknowledged used to escape
  // to main.ts, which edits the text but leaves the now-dead buttons up.
  it('turns the prompt into the error when the click cannot be served', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' }).mockResolvedValueOnce(
      { access: 'own-private', name: 'Secret Charms' },
    ).mockRejectedValueOnce(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const click = fakeComponent('deck:self')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await expect(
      COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never),
    ).resolves.toBeUndefined()
    expect(click.deferReply).not.toHaveBeenCalled()
    expect(click.update).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again in a moment.', components: [],
    })
  })

  // "Only show me" has no public placeholder to withdraw: the error replaces
  // the private "thinking" message instead of sitting next to it.
  it('puts a private failure into the private placeholder', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const click = fakeComponent('deck:self')
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deleteReply).not.toHaveBeenCalled()
    expect(click.editReply).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again in a moment.', embeds: [], files: [], components: [],
    })
  })

  // Discord rejecting the deck message itself, after the public defer: the
  // empty public placeholder is taken back and the error goes to the caller.
  it('withdraws the public placeholder when the post fails', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const click = fakeComponent('deck:post')
    click.editReply.mockRejectedValue(new Error('Request entity too large'))
    const interaction = fakeInteraction({ deck: 'abc123' }, 'en', vi.fn().mockResolvedValue(click))
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(click.deleteReply).toHaveBeenCalled()
    expect(click.followUp).toHaveBeenCalledWith({
      content: expect.any(String), flags: MessageFlags.Ephemeral,
    })
  })

  it('strips the buttons when the prompt times out', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'This choice expired. Run /deck again.', components: [],
    })
  })

  // Review focus 5: the user dismissed the ephemeral prompt, so the expiry
  // edit has nothing left to edit.
  it('survives a dismissed prompt at timeout', async () => {
    viewer('user-1')
    access({ access: 'own-private', name: 'Secret Charms' })
    const interaction = fakeInteraction({ deck: 'abc123' })
    interaction.editReply.mockRejectedValue(new Error('Unknown Message'))
    await expect(
      COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never),
    ).resolves.toBeUndefined()
  })

  describe('an ambiguous name', () => {
    const options: dbModule.DeckSuggestion[] = [
      { id: 'pub', name: 'Aggro One', format: 'classic', author: 'seeker', visibility: 'public', isOwn: false, exactName: false },
      { id: 'mine', name: 'Aggro Two', format: 'classic', author: 'me', visibility: 'private', isOwn: true, exactName: false },
    ]
    beforeEach(() => {
      viewer('user-1')
      // The typed text is no id; the click re-checks the picked deck by its id.
      vi.spyOn(dbModule, 'getDeckAccess').mockImplementation(async (_db, id) =>
        id === 'pub' ? { access: 'public', name: 'Aggro One' }
        : id === 'mine' ? { access: 'own-private', name: 'Aggro Two' }
        : null)
      vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue(options)
      vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    })

    it('asks which deck was meant, privately', async () => {
      const interaction = fakeInteraction({ deck: 'aggro' })
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(interaction.deferReply).not.toHaveBeenCalled()
      const prompt = interaction.reply.mock.calls[0][0]
      expect(prompt.flags).toBe(MessageFlags.Ephemeral)
      expect(prompt.content).toBe('Several decks match. Which one did you mean?')
    })

    it('posts a picked public deck to the channel', async () => {
      const pick = fakeComponent('deck:pick', ['pub'])
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(pick.deferReply).toHaveBeenCalledWith()
      expect(pick.editReply.mock.calls[0][0].embeds[0].toJSON().title).toBe('Charms Aggro')
      expect(interaction.deleteReply).toHaveBeenCalled()
    })

    // Review finding: the menu was built while the deck was public. If it went
    // private before the pick, an unprompted post must not go out on the
    // owner's authority.
    it('loads a picked public deck as an anonymous viewer', async () => {
      const load = vi.mocked(dbModule.getDeckForViewer)
      const pick = fakeComponent('deck:pick', ['pub'])
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(load).toHaveBeenCalledWith({}, 'pub', null)
    })

    it('loads a confirmed private deck as its owner', async () => {
      const load = vi.mocked(dbModule.getDeckForViewer)
      const click = fakeComponent('deck:self')
      const pick = fakeComponent('deck:pick', ['mine'], vi.fn().mockResolvedValue(click))
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(load).toHaveBeenCalledWith({}, 'mine', 'user-1')
    })

    it('asks again before showing a picked private deck', async () => {
      const click = fakeComponent('deck:self')
      const pick = fakeComponent('deck:pick', ['mine'], vi.fn().mockResolvedValue(click))
      const interaction = fakeInteraction({ deck: 'aggro' }, 'en', vi.fn().mockResolvedValue(pick))
      await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
      expect(pick.followUp).not.toHaveBeenCalled()
      expect(pick.update.mock.calls[0][0].content).toContain('Aggro Two')
      expect(click.followUp).not.toHaveBeenCalled()
      expect(click.editReply.mock.calls[0][0].embeds[0].toJSON().title).toBe('Charms Aggro')
    })
  })

  it('never records a view', async () => {
    const record = vi.spyOn(dbModule, 'recordView')
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const interaction = fakeInteraction({ deck: 'abc123' })
    await COMMANDS.get('deck')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(record).not.toHaveBeenCalled()
  })
})

describe('/deck autocomplete', () => {
  const row = (over: Partial<dbModule.DeckSuggestion>): dbModule.DeckSuggestion => ({
    id: 'd1', name: 'Gryffindor Aggro', format: 'classic', author: 'seeker',
    visibility: 'public', isOwn: false, exactName: false, ...over,
  })

  it('suggests decks for the linked viewer, valued by deck id', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([
      row({ id: 'mine', name: 'Secret', visibility: 'private', isOwn: true }),
      row({ id: 'pub' }),
    ])
    const interaction = fakeAutocomplete('gry')
    await COMMANDS.get('deck')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(search).toHaveBeenCalledWith({}, { query: 'gry', viewerId: 'user-1', limit: 25 })
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: '🔒 Secret · @seeker · Classic', value: 'mine' },
      { name: 'Gryffindor Aggro · @seeker · Classic', value: 'pub' },
    ])
  })

  it('searches public decks only for an unlinked user', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    await COMMANDS.get('deck')!.autocomplete!(fakeAutocomplete('') as never, fakeDeps([], 0) as never)
    expect(search).toHaveBeenCalledWith({}, { query: '', viewerId: null, limit: 25 })
  })

  it('answers an empty list rather than throwing when the query fails', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeAutocomplete('x')
    await COMMANDS.get('deck')!.autocomplete!(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.respond).toHaveBeenCalledWith([])
  })
})

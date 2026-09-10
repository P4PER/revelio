import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'

afterEach(() => { vi.restoreAllMocks() })

function fakeInteraction(options: Record<string, string | null> = {}, locale = 'en') {
  return {
    locale,
    user: { id: '111' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: (n: string) => options[n] ?? null },
  }
}

function fakeDeps() {
  return {
    meili: {},
    db: {},
    sets: {
      name: vi.fn().mockResolvedValue('Base Set'),
      all: vi.fn().mockResolvedValue([{ code: 'base', name: 'Base Set' }]),
    },
    env: { IMAGE_BASE_URL: 'https://img.test', SITE_BASE_URL: 'https://revelio.cards' },
  }
}

function run(name: string, interaction: unknown, deps: unknown) {
  return COMMANDS.get(name)!.execute(interaction as never, deps as never)
}

const linked = () => vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
const unlinked = () => vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)

describe('/collection', () => {
  it('always replies ephemerally', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 50, totalCards: 200, totalCopies: 80,
    })
    const interaction = fakeInteraction()
    await run('collection', interaction, fakeDeps())
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('reports owned, total, percentage and copies', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 50, totalCards: 200, totalCopies: 80,
    })
    const interaction = fakeInteraction()
    await run('collection', interaction, fakeDeps())
    const { content } = interaction.editReply.mock.calls[0][0]
    expect(content).toContain('50')
    expect(content).toContain('200')
    expect(content).toContain('25')
    expect(content).toContain('80')
  })

  it('points an unlinked user at the settings page', async () => {
    unlinked()
    const interaction = fakeInteraction()
    await run('collection', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content)
      .toContain('https://revelio.cards/settings/connections')
  })

  it('does not divide by zero when the card pool is empty', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 0, totalCards: 0, totalCopies: 0,
    })
    const interaction = fakeInteraction()
    await run('collection', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain('NaN')
  })

  it('reports one set when asked for one', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSetProgress').mockResolvedValue([
      { setCode: 'base', owned: 30, total: 116 },
    ])
    const interaction = fakeInteraction({ set: 'base' })
    await run('collection', interaction, fakeDeps())
    const { content } = interaction.editReply.mock.calls[0][0]
    expect(content).toContain('Base Set')
    expect(content).toContain('30')
    expect(content).toContain('116')
  })

  // Set codes are stored uppercase, and the option value can be typed by hand
  // rather than picked from the suggestions.
  it('resolves a set typed in the wrong case, and still names it', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSetProgress').mockResolvedValue([
      { setCode: 'BS', owned: 5, total: 118 },
    ])
    const deps = fakeDeps()
    const interaction = fakeInteraction({ set: 'bs' })
    await run('collection', interaction, deps)
    expect(deps.sets.name).toHaveBeenCalledWith('BS', 'en')
    expect(interaction.editReply.mock.calls[0][0].content).toContain('Base Set')
  })

  it('says so when the set code matches nothing', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSetProgress').mockResolvedValue([
      { setCode: 'base', owned: 30, total: 116 },
    ])
    const interaction = fakeInteraction({ set: 'zzz' })
    await run('collection', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content).toContain('No set matched')
  })
})

describe('/mydecks', () => {
  const deck = (over: Record<string, unknown> = {}) => ({
    id: 'd1', name: 'Secret Brew', format: 'classic', visibility: 'private',
    mainCount: 60, cardCount: 61, hasCharacter: true, characterName: 'Harry',
    updatedAt: new Date('2026-01-01'), ...over,
  })

  it('always replies ephemerally', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([])
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('lists private decks too, since only the asker sees the reply', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([deck()] as never)
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    const { content } = interaction.editReply.mock.calls[0][0]
    expect(content).toContain('Secret Brew')
    expect(content).toContain('private')
    expect(content).toContain('https://revelio.cards/decks/d1')
  })

  it('offers the builder link when the user has no decks', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([])
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content).toContain('/decks/new')
  })

  it('points an unlinked user at the settings page', async () => {
    unlinked()
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content)
      .toContain('https://revelio.cards/settings/connections')
  })

  // Discord rejects a message body over 2000 characters outright, which would
  // fail the whole interaction rather than truncate it.
  it('stays inside the message limit for a user with many decks', async () => {
    linked()
    const many = Array.from({ length: 80 }, (_, i) =>
      deck({ id: `deck-${i}`, name: `A fairly long deck name number ${i}` }))
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue(many as never)
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].content.length).toBeLessThanOrEqual(2000)
  })
})

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { handleInteraction } from '../src/discord/handle-interaction'
import { encodeCustomId, type DeckBrowseState } from '../src/discord/components/custom-id'
import { requestDeckSheet } from '../src/data/sheet'
import { fakeClick, fakeDeps, type ClickOptions } from './helpers/discord'
import { buttonsOf, mediaUrls, textOf, titleOf } from './helpers/v2'

vi.mock('../src/data/sheet', () => ({ requestDeckSheet: vi.fn() }))

const ID = '6f1c2a5e-9a8b-4c3d-8e7f-0a1b2c3d4e5f'
const state: DeckBrowseState = { scope: 'public', page: 1, format: null, sort: 'likes', lesson: null, query: '' }
const entry = (n: number) => ({
  id: `${ID.slice(0, -1)}${n}`, name: `Deck ${n}`, format: 'classic', author: 'ann', lessons: [],
  likeCount: 1, viewCount: 1, cardCount: 60, updatedAt: '2026-10-01T00:00:00.000Z', likedByViewer: false,
  starterCardId: null, starterArtCropVersion: null,
})
// The shape getDeckForViewer resolves to, as decks.test.ts builds it.
const stored = (visibility: 'public' | 'private') => ({
  deck: { id: ID, name: 'Charms Aggro', format: 'classic', visibility },
  views: [{ cardId: 'c1', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms',
    setCode: 'BS', number: '75', isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false }],
  ownerUsername: 'ann',
  viewCount: 0,
})

beforeEach(() => {
  vi.mocked(requestDeckSheet).mockResolvedValue({ body: Buffer.from('png'), name: 'deck.png' })
  vi.spyOn(dbModule, 'listPublicDecks').mockResolvedValue({
    entries: [1, 2, 3].map(entry) as never, total: 3, page: 1, pageCount: 1, pageSize: 5,
  })
})
afterEach(() => { vi.restoreAllMocks() })

const linkedAs = (id: string | null) => vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(id)
const click = (id: string, opts: ClickOptions = {}) => {
  const c = fakeClick(id, opts)
  return { c, done: handleInteraction(c as never, fakeDeps([], 0) as never) }
}

describe('/decks', () => {
  it('defers ephemerally first and answers with the browser', async () => {
    const interaction = {
      locale: 'en', user: { id: '111' }, inGuild: () => true,
      deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: (n: string) => (n === 'sort' ? 'views' : null) },
    }
    await COMMANDS.get('decks')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(dbModule.listPublicDecks).toHaveBeenCalledWith({}, expect.objectContaining({ sort: 'views', pageSize: 5 }))
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('Public decks: **3**')
  })

  it('applies a format and resets to page 1, ignoring a value that is not one', async () => {
    await click(encodeCustomId({ kind: 'df', state: { ...state, page: 4 } }), { values: ['revival'] }).done
    await click(encodeCustomId({ kind: 'df', state }), { values: ['legacy'] }).done
    const calls = vi.mocked(dbModule.listPublicDecks).mock.calls
    expect(calls[0][1]).toMatchObject({ format: 'revival', page: 1 })
    expect(calls[1][1]).toMatchObject({ format: null })
  })
})

describe('opening a deck', () => {
  it('shows the sheet in place with Back and Post', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('public') as never)
    const { c, done } = click(encodeCustomId({ kind: 'do', state }), { values: [ID] })
    await done
    expect(c.deferUpdate).toHaveBeenCalled()
    const payload = c.editReply.mock.calls[0][0]
    expect(titleOf(payload)).toBe('Charms Aggro')
    expect(mediaUrls(payload)).toEqual(['attachment://deck.png'])
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Back to decks', 'Post to channel', 'Open on revelio.cards'])
  })

  // Made private or deleted since the browser was drawn.
  it('says not found for a deck the clicker may no longer see', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const { c, done } = click(encodeCustomId({ kind: 'do', state }), { values: [ID] })
    await done
    expect(textOf(c.reply.mock.calls[0][0])).toBe('No deck matched that name, link or id.')
    expect(c.reply.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(c.editReply).not.toHaveBeenCalled()
  })

  it('goes back and drops the sheet', async () => {
    const { c, done } = click(encodeCustomId({ kind: 'd', state }))
    await done
    expect(c.editReply.mock.calls[0][0].attachments).toEqual([])
  })
})

describe('posting a deck', () => {
  it('posts a public deck as nobody, naming who shared it', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    const read = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('public') as never)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(read).toHaveBeenCalledWith(expect.anything(), ID, null)
    const sent = c.channel.send.mock.calls[0][0]
    expect(textOf(sent)).toMatch(/^<@111> shared a deck\.\n## Charms Aggro/)
    // The post is its own confirmation (spec section 6, as for cards in 2b).
    expect(c.followUp).not.toHaveBeenCalled()
  })

  // Pressing Post on your own private deck is the owner's say-so.
  it('posts the owner\'s own private deck as its owner, without a page link', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'own-private', name: 'Charms Aggro' })
    const read = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('private') as never)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(read).toHaveBeenCalledWith(expect.anything(), ID, 'user-1')
    expect(buttonsOf(c.channel.send.mock.calls[0][0]).some((b) => b.url)).toBe(false)
  })

  it('answers not found for someone else\'s private deck and posts nothing', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(textOf(c.reply.mock.calls[0][0])).toBe('No deck matched that name, link or id.')
  })

  it('refuses privately where the bot may not attach files', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }), { allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(textOf(c.reply.mock.calls[0][0])).toMatch(/can't post in this channel/)
  })
})

describe('an open /mydecks browser', () => {
  // Unlinked or banned since the browser was drawn: the next click must stop
  // showing private decks.
  it('re-resolves the account on every click', async () => {
    linkedAs(null)
    const list = vi.spyOn(dbModule, 'pageDecksByUser')
    const { c, done } = click(encodeCustomId({ kind: 'd', state: { ...state, scope: 'mine', sort: 'updated', page: 2 } }))
    await done
    expect(list).not.toHaveBeenCalled()
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('/settings/connections')
  })
})

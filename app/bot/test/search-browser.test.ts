import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { handleInteraction } from '../src/discord/handle-interaction'
import { encodeCustomId, type CardBrowseState } from '../src/discord/components/custom-id'
import { fakeClick, fakeDeps, type ClickOptions } from './helpers/discord'
import { buttonsOf, textOf } from './helpers/v2'

beforeEach(() => {
  vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null)
  vi.spyOn(dbModule, 'getSubTypeLabels').mockResolvedValue({})
})
afterEach(() => { vi.restoreAllMocks() })

const card = (n: number) => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), numberSort: `0:${n}`,
  text: 'Rules.', flavorText: null, types: ['spell'], subTypes: [], lesson: 'charms', rarity: null,
  finishes: [], legality: null, cost: 2, damage: null, isOfficial: true, imageLang: 'en',
  imageVersion: 1, artCropVersion: null, defaultLanguage: 'en', orientation: null,
})
const hits = [1, 2, 3, 4, 5].map(card)
const state: CardBrowseState = { page: 1, lesson: null, type: null, set: null, query: 'lumos' }

function fakeCommand(options: Record<string, string | null>, locale = 'en') {
  return {
    locale,
    user: { id: '111' },
    inGuild: () => true,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: (n: string) => options[n] ?? null },
  }
}

const click = (id: string, deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) => {
  const c = fakeClick(id, opts)
  return { c, done: handleInteraction(c as never, deps as never) }
}

describe('/search', () => {
  it('defers ephemerally before anything else', async () => {
    const interaction = fakeCommand({ query: 'lumos' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps(hits, 23) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('answers with the first page of the browser', async () => {
    const interaction = fakeCommand({ query: 'lumos' })
    const deps = fakeDeps(hits, 23)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toContain('Cards found for "lumos": **23**')
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ limit: 5, offset: 0 }))
  })

  it('browses by filters alone', async () => {
    const interaction = fakeCommand({ lesson: 'charms' })
    const deps = fakeDeps(hits, 23)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('Cards found: **23**')
  })

  it('resolves a set typed by name or in the wrong case', async () => {
    const interaction = fakeCommand({ query: 'x', set: 'chamber of secrets' })
    const deps = fakeDeps(hits, 1)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    expect(deps.search.mock.calls[0][1].filter).toContain('(setCode = "coc")')
  })

  it('says so when a typed set matches nothing, instead of failing', async () => {
    const interaction = fakeCommand({ query: 'x', set: 'no such set!' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps(hits, 1) as never)
    expect(textOf(interaction.editReply.mock.calls[0][0])).toBe('No set matched that.')
  })
})

describe('browsing', () => {
  it('turns the page in place', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state: { ...state, page: 2 } }), deps)
    await done
    expect(c.deferUpdate).toHaveBeenCalled()
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ offset: 5 }))
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('**Card 1**')
  })

  it('applies a lesson and starts again at page 1', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sl', state: { ...state, page: 3 } }), deps, { values: ['charms'] })
    await done
    expect(deps.search.mock.calls[0][1]).toMatchObject({ offset: 0 })
    expect(deps.search.mock.calls[0][1].filter).toContain('(lesson = "charms")')
    expect(c.editReply).toHaveBeenCalled()
  })

  it('clears a filter on Any and ignores a value that is not a lesson', async () => {
    const deps = fakeDeps(hits, 23)
    await click(encodeCustomId({ kind: 'sl', state: { ...state, lesson: 'charms' } }), deps, { values: ['-'] }).done
    await click(encodeCustomId({ kind: 'sl', state }), deps, { values: ['divination'] }).done
    for (const call of deps.search.mock.calls) expect(call[1].filter ?? []).not.toContain('(lesson = "charms")')
  })

  // A cold set cache is a Postgres read; it must not eat the 3 s budget.
  it('acknowledges a set pick before reading the set list', async () => {
    const deps = fakeDeps(hits, 23)
    const c = fakeClick(encodeCustomId({ kind: 'ss', state }), { values: ['coc'] })
    const ackedFirst: boolean[] = []
    deps.sets.all.mockImplementation(async () => {
      ackedFirst.push(c.deferred)
      return [{ code: 'coc', name: 'Chamber of Secrets' }]
    })
    await handleInteraction(c as never, deps as never)
    expect(ackedFirst.length).toBeGreaterThan(0)
    expect(ackedFirst.every(Boolean)).toBe(true)
  })

  it('applies a set from the set menu', async () => {
    const deps = fakeDeps(hits, 23)
    await click(encodeCustomId({ kind: 'ss', state }), deps, { values: ['coc'] }).done
    expect(deps.search.mock.calls[0][1].filter).toContain('(setCode = "coc")')
  })

  it('never answers a browser click in public', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state }), deps)
    await done
    expect(c.reply).not.toHaveBeenCalled()
    expect(c.followUp).not.toHaveBeenCalled()
    expect(c.channel.send).not.toHaveBeenCalled()
  })

  it('leaves Share off outside a server', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state }), deps, { inGuild: false })
    await done
    expect(buttonsOf(c.editReply.mock.calls[0][0]).some((b) => b.label === 'Share')).toBe(false)
  })
})

describe('a card from the results', () => {
  const open = (deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) =>
    click(encodeCustomId({ kind: 'co', state }), deps, { values: ['base-1'], ...opts })

  it('opens in place with Back and Post', async () => {
    const deps = fakeDeps([card(1)], 1)
    const { c, done } = open(deps)
    await done
    const payload = c.editReply.mock.calls[0][0]
    expect(textOf(payload)).toMatch(/## Card 1/)
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Back to results', 'Post to channel', 'Open on revelio.cards'])
  })

  it('has no Post outside a server', async () => {
    const { c, done } = open(fakeDeps([card(1)], 1), { inGuild: false })
    await done
    expect(buttonsOf(c.editReply.mock.calls[0][0]).some((b) => b.label === 'Post to channel')).toBe(false)
  })

  it('goes back to the page it came from', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'cb', state: { ...state, page: 3 } }), deps)
    await done
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ offset: 10 }))
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('Cards found')
  })

  it('shows the results again for a card id that is not an id', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'co', state }), deps, { values: ['x" OR 1'] })
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('Cards found')
  })
})

describe('posting one card', () => {
  const post = (deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) =>
    click(encodeCustomId({ kind: 'cp', cardId: 'base-1' }), deps, opts)

  it('posts it as a plain channel message naming who shared it', async () => {
    const { c, done } = post(fakeDeps([card(1)], 1))
    await done
    const sent = c.channel.send.mock.calls[0][0]
    expect(sent.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(sent)).toMatch(/^<@111> shared a card\.\n## Card 1/)
    expect(buttonsOf(sent).map((b) => b.label)).toEqual(['Open on revelio.cards'])
    expect(c.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }))
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('says privately when the bot may not post there, and sends nothing', async () => {
    const { c, done } = post(fakeDeps([card(1)], 1), { allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    const payload = c.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toContain("I can't post in this channel")
  })

  it('reads a refusal from Discord as the same answer', async () => {
    const deps = fakeDeps([card(1)], 1)
    const c = fakeClick(encodeCustomId({ kind: 'cp', cardId: 'base-1' }))
    c.channel.send.mockRejectedValue(new DiscordAPIError(
      { code: RESTJSONErrorCodes.MissingAccess, message: 'Missing Access' },
      RESTJSONErrorCodes.MissingAccess, 403, 'POST', '/x', { body: undefined, files: undefined },
    ))
    await handleInteraction(c as never, deps as never)
    expect(textOf(c.followUp.mock.calls[0][0])).toContain("I can't post here")
  })
})

describe('sharing results', () => {
  it('asks which cards, privately', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sh', state }), deps)
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toBe('Which cards should I post to the channel?')
    expect(c.channel.send).not.toHaveBeenCalled()
  })

  it('posts the picked cards and returns to the results', async () => {
    const deps = fakeDeps([card(1), card(3)], 2)
    const { c, done } = click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1', 'base-3'] })
    await done
    expect(deps.search.mock.calls[0][1].filter).toContain('id IN ["base-1","base-3"]')
    expect(textOf(c.channel.send.mock.calls[0][0])).toMatch(/^<@111> shared 2 cards/)
    expect(textOf(c.editReply.mock.calls.at(-1)![0])).toContain('Cards found')
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('drops a tampered value before it reaches the search', async () => {
    const deps = fakeDeps([card(1)], 1)
    await click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1', 'x"] OR id EXISTS'] }).done
    expect(deps.search.mock.calls[0][1].filter).toContain('id IN ["base-1"]')
  })

  it('refuses privately when the bot may not post there', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1'], allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(c.reply.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
  })
})

describe('View a card, on a shared list', () => {
  it('answers whoever picks, privately and in their language, and leaves the list alone', async () => {
    const deps = fakeDeps([card(1)], 1)
    const { c, done } = click('v1:pk', deps, { values: ['base-1'], ephemeral: false, locale: 'de' })
    await done
    expect(c.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(c.update).not.toHaveBeenCalled()
    expect(c.deferUpdate).not.toHaveBeenCalled()
    const payload = c.editReply.mock.calls[0][0]
    expect(textOf(payload)).toMatch(/## Card 1/)
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Auf revelio.cards öffnen'])
  })

  it('says a vanished card is gone', async () => {
    const { c, done } = click('v1:pk', fakeDeps([], 0), { values: ['base-9'], ephemeral: false })
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toBe('That card is no longer in the database.')
  })
})

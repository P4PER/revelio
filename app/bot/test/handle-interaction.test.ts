import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { handleInteraction } from '../src/discord/handle-interaction'
import { COMPONENTS } from '../src/discord/components/index'
import { textOf } from './helpers/v2'

const REGISTERED = new Map(COMPONENTS)
afterEach(() => {
  vi.restoreAllMocks()
  COMPONENTS.clear()
  for (const [kind, handler] of REGISTERED) COMPONENTS.set(kind, handler)
})

const ERROR = 'Something went wrong. Please try again in a moment.'
const EXPIRED = 'These results are out of date. Run the command again.'

function fakeCommand(state: { replied: boolean; deferred: boolean }) {
  return {
    id: 'i-1',
    commandName: 'deck',
    locale: 'en',
    user: { id: '111' },
    ...state,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isChatInputCommand: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: () => 'abc123', getInteger: () => null },
  }
}

function fakeClick(customId: string, opts: { ephemeral?: boolean; deferred?: boolean } = {}) {
  return {
    id: 'i-2',
    customId,
    locale: 'en',
    user: { id: '111' },
    deferred: opts.deferred ?? false,
    replied: false,
    isAutocomplete: () => false,
    isMessageComponent: () => true,
    isChatInputCommand: () => false,
    message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral && (opts.ephemeral ?? true) } },
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  }
}

const run = (interaction: unknown) => handleInteraction(interaction as never, { db: {} } as never)

describe('handleInteraction: commands', () => {
  // /deck's prompt is a V1 message until phase 3: an edit there keeps content.
  it('strips components when a command fails after replying', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: true, deferred: false })
    await run(interaction)
    expect(interaction.editReply).toHaveBeenCalledWith({ content: ERROR, components: [] })
  })

  // A deferred reply is V2; a content edit would be a 400 and leave the user
  // on "thinking...".
  it('answers a command that failed after deferring with a V2 status line', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: false, deferred: true })
    await run(interaction)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toBe(ERROR)
  })

  it('answers a command that failed before replying ephemerally, in V2', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: false, deferred: false })
    await run(interaction)
    expect(interaction.editReply).not.toHaveBeenCalled()
    const payload = interaction.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toBe(ERROR)
  })
})

describe('handleInteraction: components', () => {
  // Its collector answers it; a second answer from the router would throw.
  it('leaves a /deck prompt click to its collector', async () => {
    const click = fakeClick('deck:post')
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    expect(click.reply).not.toHaveBeenCalled()
  })

  it('hands a decoded id to the handler registered for its kind', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    COMPONENTS.set('pk', handler)
    const click = fakeClick('v1:pk', { ephemeral: false })
    const deps = { db: {} }
    await handleInteraction(click as never, deps as never)
    expect(handler).toHaveBeenCalledWith(click, { kind: 'pk' }, deps)
  })

  it('replaces a private browser with "out of date" for an id it cannot read', async () => {
    const click = fakeClick('v1:s:0:-:-:-:q')
    await run(click)
    expect(textOf(click.update.mock.calls[0][0])).toBe(EXPIRED)
  })

  it('treats a valid id with no handler yet as out of date', async () => {
    const click = fakeClick('v1:pg:c')
    await run(click)
    expect(textOf(click.update.mock.calls[0][0])).toBe(EXPIRED)
  })

  // A shared list belongs to the channel; one person's stale click must not
  // rewrite it for everyone.
  it('answers privately and leaves a public message alone', async () => {
    const click = fakeClick('v2:pk', { ephemeral: false })
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    const payload = click.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toBe(EXPIRED)
  })

  it('edits what the handler acknowledged with when it fails afterwards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    COMPONENTS.set('pk', async (i) => {
      Object.assign(i, { deferred: true })
      throw new Error('boom')
    })
    const click = fakeClick('v1:pk', { ephemeral: false })
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    expect(textOf(click.editReply.mock.calls[0][0])).toBe(ERROR)
  })

  it('logs the kind but never the raw id, which carries the query', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    COMPONENTS.set('s', async () => { throw new Error('boom') })
    await run(fakeClick('v1:s:1:-:-:-:secret query'))
    expect(String(log.mock.calls[0][0])).toContain('component s failed')
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret query')
  })
})

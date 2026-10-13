import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { handleInteraction } from '../src/discord/handle-interaction'

afterEach(() => { vi.restoreAllMocks() })

function fakeCommand(state: { replied: boolean; deferred: boolean }) {
  return {
    id: 'i-1',
    commandName: 'deck',
    locale: 'en',
    user: { id: '111' },
    ...state,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: () => 'abc123', getInteger: () => null },
  }
}

describe('handleInteraction', () => {
  // A command that throws after answering may have left buttons or a menu on
  // that answer. The error must take them away, or they stay up, dead.
  it('strips components when a command fails after replying', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: true, deferred: false })
    await handleInteraction(interaction as never, { db: {} } as never)
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again in a moment.', components: [],
    })
  })

  it('answers a command that failed before replying ephemerally', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: false, deferred: false })
    await handleInteraction(interaction as never, { db: {} } as never)
    expect(interaction.editReply).not.toHaveBeenCalled()
    expect(interaction.reply.mock.calls[0][0].flags).toBeDefined()
  })
})

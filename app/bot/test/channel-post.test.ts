import { describe, it, expect, vi } from 'vitest'
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord.js'
import { postTarget, refusal } from '../src/discord/channel-post'

function fakeClick(opts: { sendable?: boolean; thread?: boolean; allowed?: boolean } = {}) {
  const has = vi.fn(() => opts.allowed ?? true)
  return {
    channel: { isSendable: () => opts.sendable ?? true, isThread: () => opts.thread ?? false },
    appPermissions: { has },
  }
}

const apiError = (code: number) => new DiscordAPIError(
  { code, message: 'refused' }, code, 403, 'POST', '/channels/1/messages', { body: undefined, files: undefined },
)

describe('postTarget', () => {
  it('asks for view, embed, attach and send in a channel when files go along', () => {
    const click = fakeClick()
    expect(postTarget(click as never, { needsFiles: true }).kind).toBe('ok')
    expect(click.appPermissions.has).toHaveBeenCalledWith([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.SendMessages,
    ])
  })

  it('does not ask for Attach Files when nothing is attached', () => {
    const click = fakeClick()
    postTarget(click as never, { needsFiles: false })
    expect(click.appPermissions.has.mock.calls[0][0]).not.toContain(PermissionFlagsBits.AttachFiles)
  })

  it('asks for the thread send permission inside a thread', () => {
    const click = fakeClick({ thread: true })
    postTarget(click as never, { needsFiles: false })
    expect(click.appPermissions.has.mock.calls[0][0]).toContain(PermissionFlagsBits.SendMessagesInThreads)
  })

  it('reports a channel it cannot send to as unreachable', () => {
    expect(postTarget(fakeClick({ sendable: false }) as never, { needsFiles: false }).kind).toBe('unreachable')
  })

  it('reports a missing permission as forbidden', () => {
    expect(postTarget(fakeClick({ allowed: false }) as never, { needsFiles: false }).kind).toBe('forbidden')
  })
})

describe('refusal', () => {
  it('reads Missing Access as unreachable and Missing Permissions as forbidden', () => {
    expect(refusal(apiError(RESTJSONErrorCodes.MissingAccess))).toBe('unreachable')
    expect(refusal(apiError(RESTJSONErrorCodes.MissingPermissions))).toBe('forbidden')
  })

  it('has no answer for any other failure', () => {
    expect(refusal(apiError(RESTJSONErrorCodes.UnknownChannel))).toBeNull()
    expect(refusal(new Error('socket hang up'))).toBeNull()
  })
})

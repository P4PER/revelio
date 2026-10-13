import { describe, it, expect } from 'vitest'
import { AttachmentBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js'
import { textEdit, textMessage, v2Edit, v2Message } from '../src/discord/v2/send'
import { container, lessonColor } from '../src/discord/v2/parts'
import { textOf } from './helpers/v2'

const one = () => [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('hi'))]

describe('v2 payloads', () => {
  it('flags a message as components v2', () => {
    expect(v2Message(one()).flags).toBe(MessageFlags.IsComponentsV2)
  })

  // Without it an edit keeps the previous upload: a deck sheet would linger
  // under the status line that replaced it.
  it('clears earlier attachments on an edit that sends none', () => {
    expect(v2Edit(one())).toMatchObject({ attachments: [] })
  })

  it('keeps the attachments an edit sends', () => {
    const file = new AttachmentBuilder(Buffer.from('png'), { name: 'deck.png' })
    const edit = v2Edit(one(), [file])
    expect(edit.files).toEqual([file])
    expect(edit).not.toHaveProperty('attachments')
  })

  it('refuses a message over the limits', () => {
    const big = [new ContainerBuilder().addTextDisplayComponents(
      ...Array.from({ length: 40 }, () => new TextDisplayBuilder().setContent('x')),
    )]
    expect(() => v2Message(big)).toThrow(/components/)
  })

  it('wraps a status line in one container', () => {
    const message = textMessage('Nothing here.')
    expect(message.components).toHaveLength(1)
    expect(textOf(message)).toBe('Nothing here.')
    expect(textOf(textEdit('Gone.'))).toBe('Gone.')
  })
})

describe('parts', () => {
  it('tints by lesson and falls back for none', () => {
    expect(lessonColor('quidditch')).toBe(0xe2ae37)
    expect(lessonColor(null)).toBe(0x2b2d31)
  })

  it('leaves the accent off a container without one', () => {
    expect(container().toJSON().accent_color).toBeUndefined()
    expect(container(0xd4a83a).toJSON().accent_color).toBe(0xd4a83a)
  })
})

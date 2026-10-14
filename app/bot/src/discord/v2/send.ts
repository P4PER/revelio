import { MessageFlags, type AttachmentBuilder, type ContainerBuilder } from 'discord.js'
import { assertWithinLimits } from './limits'
import { container, text } from './parts'

// A V2 message as the create calls take it: reply, followUp, channel.send.
// The flag rules out `content` and `embeds`, and Discord never lets a message
// drop it again, so a view that is V2 stays V2 for every later edit.
export type V2Message = {
  components: ContainerBuilder[]
  files: AttachmentBuilder[]
  flags: MessageFlags.IsComponentsV2
}

// The same for the edit calls: editReply, update. `attachments: []` drops the
// uploads an earlier version of the message carried.
export type V2Edit = V2Message & { attachments?: [] }

// For a private reply to a click. A plain number, which every reply call takes.
export const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral

export function v2Message(components: ContainerBuilder[], files: AttachmentBuilder[] = []): V2Message {
  assertWithinLimits(components)
  return { components, files, flags: MessageFlags.IsComponentsV2 }
}

export function v2Edit(components: ContainerBuilder[], files: AttachmentBuilder[] = []): V2Edit {
  const message = v2Message(components, files)
  return files.length ? message : { ...message, attachments: [] }
}

// Status lines (not found, out of date, errors) are V2 too, so a message
// never has to change format to say something went wrong.
export function textMessage(content: string): V2Message {
  return v2Message([container().addTextDisplayComponents(text(content))])
}

export function textEdit(content: string): V2Edit {
  return v2Edit([container().addTextDisplayComponents(text(content))])
}

// A status line only the clicker sees: a reply or followUp to a click.
export function ephemeralText(content: string) {
  return { ...textMessage(content), flags: EPHEMERAL_V2 }
}

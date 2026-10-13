import {
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type MessageComponentInteraction,
  type SendableChannels,
} from 'discord.js'
import { t } from '../i18n/t'
import { ephemeralText } from './v2/send'

// Whether a message can go to the interaction's channel as a plain message.
// 'unreachable' is a channel the bot has no hold on at all (not cached: a
// guild where only the user installed the app, an archived thread), which no
// moderator can fix; 'forbidden' is a missing permission, which one can.
export type PostTarget =
  | { kind: 'ok'; channel: SendableChannels }
  | { kind: 'unreachable' }
  | { kind: 'forbidden' }

// The catalog keys a refusal is answered with; a card post and a deck post
// name different permissions.
export type RefusalKeys = { unreachable: string; forbidden: string }

// needsFiles: Attach Files is only asked for when something is attached (a
// deck sheet); a card list posts images by URL.
export type PostOptions = { needsFiles: boolean }

// The one place a post into a channel is decided. Every "post to the channel"
// is a plain channel.send rather than an interaction reply, which would render
// as a reply to the private message the click came from.
const BASE_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks]

// Discord sends the bot's permissions in that channel with every interaction,
// so this needs no request of its own. A thread takes its own send permission.
export function postTarget(component: MessageComponentInteraction, opts: PostOptions): PostTarget {
  const channel = component.channel
  if (!channel?.isSendable()) return { kind: 'unreachable' }
  const send = channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages
  const needed = [
    ...BASE_PERMISSIONS,
    ...(opts.needsFiles ? [PermissionFlagsBits.AttachFiles] : []),
    send,
  ]
  return component.appPermissions.has(needed) ? { kind: 'ok', channel } : { kind: 'forbidden' }
}

// Discord's own refusal of a post, read as the same answers postTarget gives
// up front. A private thread the bot is not in can pass the permission check
// and still be refused with Missing Access.
export function refusal(err: unknown): 'unreachable' | 'forbidden' | null {
  if (!(err instanceof DiscordAPIError)) return null
  if (err.code === RESTJSONErrorCodes.MissingAccess) return 'unreachable'
  if (err.code === RESTJSONErrorCodes.MissingPermissions) return 'forbidden'
  return null
}

// Sends a post the click has already acknowledged with deferUpdate. Every
// failure is answered privately: past the acknowledgement the router would
// answer with editReply, which replaces the private message the post came from.
export async function sendToChannel(
  interaction: MessageComponentInteraction,
  send: () => Promise<unknown>,
  locale: string,
  keys: RefusalKeys,
): Promise<void> {
  try {
    await send()
  } catch (err) {
    const refused = refusal(err)
    if (!refused) console.error(`post failed (${interaction.id}):`, err)
    await interaction.followUp(ephemeralText(t(locale, refused ? keys[refused] : 'error.generic')))
  }
}

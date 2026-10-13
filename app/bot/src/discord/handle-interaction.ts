import {
  MessageFlags,
  type Interaction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js'
import type { Deps } from '../clients'
import { COMMANDS } from './commands/index'
import { COMPONENTS, MODALS } from './components/index'
import { decodeCustomId } from './components/custom-id'
import { EPHEMERAL_V2, textEdit, textMessage } from './v2/send'
import { toRevelioLocale } from '../i18n/locale'
import { t } from '../i18n/t'

// The ids the router owns. /deck's prompt ids (deck:post, deck:self,
// deck:pick) do not match: their awaitMessageComponent collector answers
// them, and a second answer from here would throw.
const ROUTED_ID = /^v\d+:/

// A status line in answer to a click. A private browser is replaced by it; a
// public message is never touched, the clicker gets a private reply instead.
// Once the handler has acknowledged, its acknowledgement is what gets edited.
async function answerClick(interaction: MessageComponentInteraction, content: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(textEdit(content))
    return
  }
  if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
    await interaction.update(textEdit(content))
    return
  }
  await interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 })
}

async function handleComponent(interaction: MessageComponentInteraction, deps: Deps): Promise<void> {
  if (!ROUTED_ID.test(interaction.customId)) return
  const locale = toRevelioLocale(interaction.locale)
  const id = decodeCustomId(interaction.customId)
  const handler = id ? COMPONENTS.get(id.kind) : undefined
  if (!id || !handler) {
    // Another version, a tampered id, or a control from a build that had a
    // handler this one lacks: all read as results gone stale.
    await answerClick(interaction, t(locale, 'browse.expired')).catch(() => {})
    return
  }
  try {
    await handler(interaction, id, deps)
  } catch (err) {
    // The kind, never the raw id: it carries the user's query.
    console.error(`component ${id.kind} failed (${interaction.id}):`, err)
    await answerClick(interaction, t(locale, 'error.generic')).catch(() => {})
  }
}

// The component path's twin for a submitted form. A form only exists once a
// click opened it, so an answer before the handler acknowledged is a private
// reply; after, it edits what the handler acknowledged.
async function handleModal(interaction: ModalSubmitInteraction, deps: Deps): Promise<void> {
  if (!ROUTED_ID.test(interaction.customId)) return
  const locale = toRevelioLocale(interaction.locale)
  const answer = (content: string) => interaction.deferred || interaction.replied
    ? interaction.editReply(textEdit(content))
    : interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 })
  const id = decodeCustomId(interaction.customId)
  const handler = id ? MODALS.get(id.kind) : undefined
  if (!id || !handler) {
    await answer(t(locale, 'browse.expired')).catch(() => {})
    return
  }
  try {
    await handler(interaction, id, deps)
  } catch (err) {
    // The kind, never the raw id or the typed text.
    console.error(`modal ${id.kind} failed (${interaction.id}):`, err)
    await answer(t(locale, 'error.generic')).catch(() => {})
  }
}

// The gateway's interactionCreate handler. Its own module, with no top-level
// side effects, so tests can import it: main.ts starts the bot on import.
export async function handleInteraction(interaction: Interaction, deps: Deps): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = COMMANDS.get(interaction.commandName)
    // Autocomplete has a 3 second budget and no defer, so failures are swallowed
    // inside the handler rather than routed through the reply-based error path
    // below, which does not apply to an autocomplete interaction. An unanswered
    // one leaves the client spinning until it times out, so a stale registration
    // or an option with no handler still gets an empty list.
    if (!command?.autocomplete) {
      await interaction.respond([]).catch(() => {})
      return
    }
    await command.autocomplete(interaction, deps)
    return
  }
  if (interaction.isMessageComponent()) {
    await handleComponent(interaction, deps)
    return
  }
  if (interaction.isModalSubmit()) {
    await handleModal(interaction, deps)
    return
  }
  if (!interaction.isChatInputCommand()) return
  const command = COMMANDS.get(interaction.commandName)
  if (!command) {
    // A stale registration still dispatches a removed name. Leaving the
    // interaction unacknowledged shows the user "the application did not
    // respond", which reads as the bot being down.
    console.warn(`unknown command ${interaction.commandName} (${interaction.id})`)
    await interaction
      .reply({ ...textMessage(t(toRevelioLocale(interaction.locale), 'error.generic')), flags: EPHEMERAL_V2 })
      .catch(() => {})
    return
  }
  try {
    await command.execute(interaction, deps)
  } catch (err) {
    // Log the command and interaction id, never the token or the raw options.
    console.error(`command ${interaction.commandName} failed (${interaction.id}):`, err)
    const content = t(toRevelioLocale(interaction.locale), 'error.generic')
    if (interaction.deferred) {
      // A deferred placeholder takes a V2 edit, and a content edit on a V2
      // reply is a 400. /search, /mydecks and /deck still edit V1 until phases
      // 2 and 3, but each makes that edit last, so nothing throws after it.
      await interaction.editReply(textEdit(content)).catch(() => {})
    } else if (interaction.replied) {
      // Only /deck replies without deferring, with a V1 prompt (until phase 3
      // moves it to V2). Its collector is gone with the error, so the buttons
      // are stripped rather than left up, dead.
      await interaction.editReply({ content, components: [] }).catch(() => {})
    } else {
      await interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 }).catch(() => {})
    }
  }
}

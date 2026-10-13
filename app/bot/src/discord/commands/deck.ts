import {
  AttachmentBuilder,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type MessageComponentInteraction,
  type SendableChannels,
} from 'discord.js'
import { getDeckAccess, type DeckSuggestion } from '@revelio/db'
import type { Deps } from '../../clients'
import {
  accessOf,
  findDecks,
  getDeckView,
  resolveDeckRef,
  suggestionLabel,
  type DeckView,
} from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { requestDeckSheet } from '../../data/sheet'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import {
  awaitChoice,
  pickPrompt,
  POST_ID,
  visibilityPrompt,
} from '../components/deck-prompts'
import { deckEmbed } from '../embeds/deck-embed'

type DeckPayload = { embeds: EmbedBuilder[]; files?: AttachmentBuilder[]; components: [] }

type DeckContext = { deps: Deps; locale: string; listOnly: boolean }

// Where the deck's own message goes once a prompt is answered: 'post' to the
// channel, 'self' to the caller alone.
type Delivery = 'post' | 'self'

// Who reads the message a deck is delivered in. Required wherever a deck is
// sent, so the page link is decided from data rather than defaulted.
type Audience = 'channel' | 'caller'

// Whether a deck can go to the interaction's channel as a plain message.
// 'unreachable' is a channel the bot has no hold on at all (not cached: a
// guild where only the user installed the app, an archived thread), which no
// moderator can fix; 'forbidden' is a missing permission, which one can.
type PostTarget =
  | { kind: 'ok'; channel: SendableChannels }
  | { kind: 'unreachable' }
  | { kind: 'forbidden' }

// What a plain channel post of a deck needs: the embed and the sheet are an
// embed and an attachment. A thread takes its own send permission.
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
]

export const data = new SlashCommandBuilder()
  .setName('deck')
  .setDescription(t('en', 'command.deck.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.deck.description') })
  .addStringOption((o) =>
    o.setName('deck')
      .setDescription(t('en', 'command.deck.option.deck'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.deck') })
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o.setName('view')
      .setDescription(t('en', 'command.deck.option.view'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.view') })
      .addChoices(
        ...(['image', 'list'] as const).map((value) => ({
          name: t('en', `command.deck.view.${value}`),
          name_localizations: { de: t('de', `command.deck.view.${value}`) },
          value,
        })),
      ),
  )

// A deck with no cards has no picture worth posting, and a sheet that cannot
// be had must not cost the answer: both fall back to the list the embed can
// always draw from the data already in hand. The bot draws nothing itself -
// @revelio/sheet is the only process that paints a deck. `send` is whichever
// call puts the answer where it belongs: the command's deferred reply, the
// deferred reply to a click, or a plain message in the channel.
async function deliverDeck(
  send: (payload: DeckPayload) => Promise<unknown>,
  deck: DeckView,
  ctx: DeckContext,
  audience: Audience,
  sendEdits: boolean,
): Promise<void> {
  const { locale } = ctx
  // Only the owner can open a private deck's page, so a channel never gets a
  // link to one; the caller alone may be that owner.
  const linkPage = audience === 'caller' || deck.visibility === 'public'
  const siteBase = ctx.deps.env.SITE_BASE_URL
  if (!ctx.listOnly && deck.entries.length > 0) {
    const sheet = await requestDeckSheet(deck, locale, ctx.deps.env).catch((err: unknown) => {
      console.error('deck sheet render failed:', err)
      return null
    })
    if (sheet) {
      try {
        await send({
          embeds: [deckEmbed(deck, { locale, siteBase, linkPage, view: 'image', imageName: sheet.name })],
          files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
          components: [],
        })
        return
      } catch (err) {
        // Discord can reject the upload itself (an attachment it will not
        // take), which must cost the picture rather than the answer. An edit
        // of the bot's own message can always be retried as the list. A new
        // message only after a rejection Discord answered, which proves
        // nothing was posted: a timeout or a dropped socket may have reached
        // the channel, and a retry could then post the deck twice.
        if (!sendEdits && !(err instanceof DiscordAPIError)) throw err
        console.error('deck sheet upload failed:', err)
      }
    }
  }
  await send({ embeds: [deckEmbed(deck, { locale, siteBase, linkPage, view: 'list' })], components: [] })
}

// Where a deck may be posted as a plain message. Discord sends the bot's
// permissions in that channel with every interaction, so this needs no
// request of its own.
function postTarget(component: MessageComponentInteraction): PostTarget {
  const channel = component.channel
  if (!channel?.isSendable()) return { kind: 'unreachable' }
  const send = channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages
  return component.appPermissions.has([...POST_PERMISSIONS, send])
    ? { kind: 'ok', channel }
    : { kind: 'forbidden' }
}

// Discord's own refusal of a post, read as the same answers postTarget gives
// up front. A private thread the bot is not in can pass the permission check
// and still be refused with Missing Access.
function refusalKey(err: unknown): string | null {
  if (!(err instanceof DiscordAPIError)) return null
  if (err.code === RESTJSONErrorCodes.MissingAccess) return 'deck.cannotPostHere'
  if (err.code === RESTJSONErrorCodes.MissingPermissions) return 'deck.cannotPost'
  return null
}

// Answers a click on the prompt. Whether the deck may be shown is checked
// again here rather than carried from before the prompt: it may have been
// deleted or made private in the meantime. `asOwner` says whose eyes both
// checks use: the clicker's linked account only once they have confirmed
// through the visibility prompt, nobody for a deck posted unprompted. That
// account is resolved again on the click rather than reused from the command's
// start, because resolveLinkedUser is where a ban or an unlink is enforced,
// and either can land inside the prompt's 60 s.
//
// Before the click is acknowledged, only those two indexed reads run, so the
// 3 s budget holds and a miss stays in the private prompt. Then:
// - 'post' goes to the channel as a plain message. An interaction reply to
//   the click would render as a reply to the private, deleted prompt. The
//   prompt turns into a progress line at once, the channel shows the bot
//   typing while the sheet renders, and the prompt is deleted once the deck
//   is up.
// - 'self' turns the private prompt into a progress line at once and then
//   into the deck itself, in the same message.
// The full load, several queries, only runs after that.
async function deliverChoice(
  prompt: ChatInputCommandInteraction,
  component: MessageComponentInteraction,
  deckId: string,
  delivery: Delivery,
  ctx: DeckContext,
  asOwner: boolean,
): Promise<void> {
  const { locale } = ctx
  let loadAs: string | null = null
  let channel: SendableChannels | null = null
  try {
    if (asOwner) loadAs = await resolveLinkedUser(ctx.deps.db, component.user.id)
    const access = await getDeckAccess(ctx.deps.db, deckId, loadAs)
    if (!access) {
      await component.update({ content: t(locale, 'deck.notFound'), components: [] })
      return
    }
    if (delivery === 'post') {
      const target = postTarget(component)
      if (target.kind !== 'ok') {
        const key = target.kind === 'unreachable' ? 'deck.cannotPostHere' : 'deck.cannotPost'
        await component.update({ content: t(locale, key), components: [] })
        return
      }
      channel = target.channel
      await component.update({ content: t(locale, 'deck.posting'), components: [] })
    } else {
      // The prompt itself becomes the deck: a progress line at once, then the
      // deck in the same private message.
      await component.update({ content: t(locale, 'deck.loading'), components: [] })
    }
  } catch (err) {
    // The click itself has to be answered. The top-level handler only knows
    // the slash command's interaction, so an error left to it would edit the
    // prompt while the clicker still sees "This interaction failed".
    console.error('deck prompt failed:', err)
    await component
      .update({ content: t(locale, 'error.generic'), components: [] })
      .catch(() => {})
    return
  }

  // A failure from here on is told to the caller alone: in the prompt for a
  // post, which never reached the channel, or in the private deck message.
  const fail = async (key: string): Promise<void> => {
    const content = t(locale, key)
    const payload = channel
      ? { content, components: [] }
      : { content, embeds: [], files: [], components: [] }
    await component.editReply(payload).catch(() => {})
  }
  try {
    const deck = await getDeckView(ctx.deps.db, deckId, loadAs)
    if (!deck) {
      await fail('deck.notFound')
      return
    }
    if (channel) {
      const target = channel
      await target.sendTyping().catch(() => {})
      // The mention names who shared it - a plain message carries no "used
      // /deck" line - and never pings: the client's allowedMentions parses none.
      const content = t(locale, 'deck.sharedBy', { user: `<@${component.user.id}>` })
      await deliverDeck((p) => target.send({ ...p, content }), deck, ctx, 'channel', false)
      await prompt.deleteReply().catch(() => {})
    } else {
      await deliverDeck((p) => component.editReply({ ...p, content: '' }), deck, ctx, 'caller', true)
    }
  } catch (err) {
    console.error('deck prompt failed:', err)
    await fail(refusalKey(err) ?? 'error.generic')
  }
}

async function expire(interaction: ChatInputCommandInteraction, locale: string): Promise<void> {
  // The user may have dismissed the ephemeral prompt already, in which case
  // there is nothing left to edit and nothing to report.
  await interaction
    .editReply({ content: t(locale, 'deck.prompt.expired'), components: [] })
    .catch(() => {})
}

async function answerPick(
  interaction: ChatInputCommandInteraction,
  pick: MessageComponentInteraction,
  options: DeckSuggestion[],
  ctx: DeckContext,
): Promise<void> {
  const chosen = pick.isStringSelectMenu() ? options.find((o) => o.id === pick.values[0]) : undefined
  if (!chosen) {
    await pick.update({ content: t(ctx.locale, 'deck.notFound'), components: [] })
    return
  }
  if (accessOf(chosen) === 'public') {
    await deliverChoice(interaction, pick, chosen.id, 'post', ctx, false)
    return
  }
  // Outside a server there is no channel to post to, so nothing to choose.
  if (!interaction.inGuild()) {
    await deliverChoice(interaction, pick, chosen.id, 'self', ctx, true)
    return
  }
  await pick.update(visibilityPrompt(chosen.name, ctx.locale))
  const click = await awaitChoice(pick.message, interaction.user.id)
  if (!click) {
    await expire(interaction, ctx.locale)
    return
  }
  await deliverChoice(interaction, click, chosen.id, click.customId === POST_ID ? 'post' : 'self', ctx, true)
}

// The one command that does not defer first. Whether its first reply is public
// or ephemeral depends on the deck, and Discord cannot make a public reply
// ephemeral afterwards. So it does at most three indexed reads first (linked
// user, deck access, and a name search when the input is not an id); the
// sheet render, the slow part, still runs after a defer.
export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  const locale = toRevelioLocale(interaction.locale)
  const viewerId = await resolveLinkedUser(deps.db, interaction.user.id)
  const ctx: DeckContext = {
    deps, locale, listOnly: interaction.options.getString('view') === 'list',
  }
  const ref = await resolveDeckRef(deps.db, interaction.options.getString('deck') ?? '', viewerId)

  if (ref.kind === 'none') {
    // One message for "no such deck" and "someone else's private deck":
    // telling them apart would confirm a deck its owner chose not to share.
    await interaction.reply({ content: t(locale, 'deck.notFound'), flags: MessageFlags.Ephemeral })
    return
  }

  if (ref.kind === 'deck' && ref.access === 'public') {
    await interaction.deferReply()
    // Loaded as nobody: the reply is already public, so a deck its owner made
    // private since the access check must read as not found, not be posted.
    const deck = await getDeckView(deps.db, ref.id, null)
    if (!deck) {
      await interaction.editReply({ content: t(locale, 'deck.notFound') })
      return
    }
    await deliverDeck((p) => interaction.editReply(p), deck, ctx, 'channel', true)
    return
  }

  // Outside a server - a DM with the bot, or a user-installed app in a DM or
  // group DM - the bot cannot post to the channel, so an own private deck
  // needs no question: it is shown ephemerally at once.
  if (ref.kind === 'deck' && !interaction.inGuild()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const deck = await getDeckView(deps.db, ref.id, viewerId)
    if (!deck) {
      await interaction.editReply({ content: t(locale, 'deck.notFound') })
      return
    }
    await deliverDeck((p) => interaction.editReply(p), deck, ctx, 'caller', true)
    return
  }

  // Everything left is private to the caller until they say otherwise: their
  // own private deck, or a list of names to choose from.
  const prompt = ref.kind === 'ambiguous'
    ? pickPrompt(ref.options, locale)
    : visibilityPrompt(ref.name, locale)
  const response = await interaction.reply({ ...prompt, flags: MessageFlags.Ephemeral, withResponse: true })
  const message = response.resource?.message
  if (!message) {
    console.warn(`deck prompt has no message to collect on (${interaction.id})`)
    return
  }

  const choice = await awaitChoice(message, interaction.user.id)
  if (!choice) {
    await expire(interaction, locale)
    return
  }
  if (ref.kind === 'deck') {
    await deliverChoice(interaction, choice, ref.id, choice.customId === POST_ID ? 'post' : 'self', ctx, true)
    return
  }
  await answerPick(interaction, choice, ref.options, ctx)
}

// Runs on every keystroke inside a 3 second budget with no defer, so a failure
// degrades to an empty list - free text still works - rather than an error.
// resolveLinkedUser is one indexed read and also enforces a ban: a banned
// user is treated as unlinked and sees public decks only.
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const locale = toRevelioLocale(interaction.locale)
  try {
    const viewerId = await resolveLinkedUser(deps.db, interaction.user.id)
    const decks = await findDecks(deps.db, interaction.options.getFocused(), viewerId)
    await interaction.respond(decks.map((d) => ({ name: suggestionLabel(d, locale), value: d.id })))
  } catch (err) {
    console.error('deck autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}

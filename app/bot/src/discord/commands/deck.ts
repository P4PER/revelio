import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
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
} from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import {
  awaitChoice,
  pickPrompt,
  POST_ID,
  visibilityPrompt,
} from '../components/deck-prompts'
import { postTarget, refusal } from '../channel-post'
import { deliverDeck } from '../deck-delivery'
import { EPHEMERAL_V2, textEdit, textMessage, v2Edit, v2Message } from '../v2/send'

type DeckContext = { deps: Deps; locale: string; listOnly: boolean }

// Where the deck's own message goes once a prompt is answered: 'post' to the
// channel, 'self' to the caller alone.
type Delivery = 'post' | 'self'

// /deck's wording for a post that cannot happen. "Here" carries a /deck hint
// that only makes sense in this command.
const REFUSAL_KEYS = { unreachable: 'deck.cannotPostHere', forbidden: 'post.cannotPost' } as const

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
      await component.update(textEdit(t(locale, 'deck.notFound')))
      return
    }
    if (delivery === 'post') {
      const target = postTarget(component, { needsFiles: true })
      if (target.kind !== 'ok') {
        const key = REFUSAL_KEYS[target.kind]
        await component.update(textEdit(t(locale, key)))
        return
      }
      channel = target.channel
      await component.update(textEdit(t(locale, 'deck.posting')))
    } else {
      // The prompt itself becomes the deck: a progress line at once, then the
      // deck in the same private message.
      await component.update(textEdit(t(locale, 'deck.loading')))
    }
  } catch (err) {
    // The click itself has to be answered. The top-level handler only knows
    // the slash command's interaction, so an error left to it would edit the
    // prompt while the clicker still sees "This interaction failed".
    console.error('deck prompt failed:', err)
    await component.update(textEdit(t(locale, 'error.generic'))).catch(() => {})
    return
  }

  // A failure from here on is told to the caller alone: in the prompt for a
  // post, which never reached the channel, or in the private deck message.
  const fail = async (key: string): Promise<void> => {
    // textEdit also drops any sheet an earlier edit attached.
    await component.editReply(textEdit(t(locale, key))).catch(() => {})
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
      const lead = t(locale, 'post.sharedDeck', { user: `<@${component.user.id}>` })
      await deliverDeck((c, f) => target.send(v2Message(c, f)), deck, ctx.deps, locale, {
        audience: 'channel', sendEdits: false, listOnly: ctx.listOnly, lead,
      })
      await prompt.deleteReply().catch(() => {})
    } else {
      await deliverDeck((c, f) => component.editReply(v2Edit(c, f)), deck, ctx.deps, locale, {
        audience: 'caller', sendEdits: true, listOnly: ctx.listOnly,
      })
    }
  } catch (err) {
    console.error('deck prompt failed:', err)
    const refused = refusal(err)
    await fail(refused ? REFUSAL_KEYS[refused] : 'error.generic')
  }
}

async function expire(interaction: ChatInputCommandInteraction, locale: string): Promise<void> {
  // The user may have dismissed the ephemeral prompt already, in which case
  // there is nothing left to edit and nothing to report.
  await interaction.editReply(textEdit(t(locale, 'deck.prompt.expired'))).catch(() => {})
}

async function answerPick(
  interaction: ChatInputCommandInteraction,
  pick: MessageComponentInteraction,
  options: DeckSuggestion[],
  ctx: DeckContext,
): Promise<void> {
  const chosen = pick.isStringSelectMenu() ? options.find((o) => o.id === pick.values[0]) : undefined
  if (!chosen) {
    await pick.update(textEdit(t(ctx.locale, 'deck.notFound')))
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
    await interaction.reply({ ...textMessage(t(locale, 'deck.notFound')), flags: EPHEMERAL_V2 })
    return
  }

  if (ref.kind === 'deck' && ref.access === 'public') {
    await interaction.deferReply()
    // Loaded as nobody: the reply is already public, so a deck its owner made
    // private since the access check must read as not found, not be posted.
    const deck = await getDeckView(deps.db, ref.id, null)
    if (!deck) {
      await interaction.editReply(textEdit(t(locale, 'deck.notFound')))
      return
    }
    await deliverDeck((c, f) => interaction.editReply(v2Edit(c, f)), deck, deps, locale, {
      audience: 'channel', sendEdits: true, listOnly: ctx.listOnly,
    })
    return
  }

  // Outside a server - a DM with the bot, or a user-installed app in a DM or
  // group DM - the bot cannot post to the channel, so an own private deck
  // needs no question: it is shown ephemerally at once.
  if (ref.kind === 'deck' && !interaction.inGuild()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const deck = await getDeckView(deps.db, ref.id, viewerId)
    if (!deck) {
      await interaction.editReply(textEdit(t(locale, 'deck.notFound')))
      return
    }
    await deliverDeck((c, f) => interaction.editReply(v2Edit(c, f)), deck, deps, locale, {
      audience: 'caller', sendEdits: true, listOnly: ctx.listOnly,
    })
    return
  }

  // Everything left is private to the caller until they say otherwise: their
  // own private deck, or a list of names to choose from.
  const prompt = ref.kind === 'ambiguous'
    ? pickPrompt(ref.options, locale)
    : visibilityPrompt(ref.name, locale)
  const response = await interaction.reply({ ...prompt, flags: EPHEMERAL_V2, withResponse: true })
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

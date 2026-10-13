import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type MessageComponentInteraction,
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
// call puts the answer where it belongs: the command's deferred reply, or the
// deferred reply to a click on a prompt.
async function deliverDeck(
  send: (payload: DeckPayload) => Promise<unknown>,
  deck: DeckView,
  ctx: DeckContext,
  audience: Audience,
): Promise<void> {
  const { locale } = ctx
  // Only the owner can open a private deck's page, so a channel never gets a
  // link to one; the caller alone may be that owner.
  const linkPage = audience === 'caller' || deck.visibility === 'public'
  const siteBase = ctx.deps.env.SITE_BASE_URL
  if (!ctx.listOnly && deck.entries.length > 0) {
    try {
      const sheet = await requestDeckSheet(deck, locale, ctx.deps.env)
      await send({
        embeds: [deckEmbed(deck, { locale, siteBase, linkPage, view: 'image', imageName: sheet.name })],
        files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
        components: [],
      })
      return
    } catch (err) {
      console.error('deck sheet render failed:', err)
    }
  }
  await send({ embeds: [deckEmbed(deck, { locale, siteBase, linkPage, view: 'list' })], components: [] })
}

// Answers a click on the prompt with the deck's own message. Whether the deck
// may be shown is checked again here rather than carried from before the
// prompt: it may have been deleted or made private in the meantime. `asOwner`
// says whose eyes both checks use: the clicker's linked account only once they
// have confirmed through the visibility prompt, nobody for a deck posted
// unprompted. That account is resolved again on the click rather than reused
// from the command's start, because resolveLinkedUser is where a ban or an
// unlink is enforced, and either can land inside the prompt's 60 s.
//
// Before the click is acknowledged, only those two indexed reads run, so the
// 3 s budget holds, and a miss stays in the private prompt
// instead of opening a public "thinking" message that has to be taken back.
// Then deferReply, which gives Discord's native loading state on the new
// message (deferUpdate would show nothing while the sheet renders), and only
// then the full load, which is several queries.
async function deliverChoice(
  prompt: ChatInputCommandInteraction,
  component: MessageComponentInteraction,
  deckId: string,
  delivery: Delivery,
  ctx: DeckContext,
  asOwner: boolean,
): Promise<void> {
  const isPublic = delivery === 'post'
  let loadAs: string | null = null
  try {
    if (asOwner) loadAs = await resolveLinkedUser(ctx.deps.db, component.user.id)
    const access = await getDeckAccess(ctx.deps.db, deckId, loadAs)
    if (!access) {
      await component.update({ content: t(ctx.locale, 'deck.notFound'), components: [] })
      return
    }
    await (isPublic ? component.deferReply() : component.deferReply({ flags: MessageFlags.Ephemeral }))
  } catch (err) {
    // The click itself has to be answered. The top-level handler only knows
    // the slash command's interaction, so an error left to it would edit the
    // prompt while the clicker still sees "This interaction failed".
    console.error('deck prompt failed:', err)
    await component
      .update({ content: t(ctx.locale, 'error.generic'), components: [] })
      .catch(() => {})
    return
  }

  // Answered: the deck's own message replaces the prompt. A prompt the user
  // already dismissed has nothing left to delete.
  await prompt.deleteReply().catch(() => {})

  // An empty public placeholder must not linger in the channel, so a failure
  // there is withdrawn and told to the caller alone; a private one simply
  // becomes the message.
  const fail = async (key: string): Promise<void> => {
    const content = t(ctx.locale, key)
    if (isPublic) {
      await component.deleteReply().catch(() => {})
      await component.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    } else {
      await component.editReply({ content, embeds: [], files: [], components: [] }).catch(() => {})
    }
  }
  try {
    const deck = await getDeckView(ctx.deps.db, deckId, loadAs)
    if (!deck) {
      await fail('deck.notFound')
      return
    }
    await deliverDeck((p) => component.editReply(p), deck, ctx, isPublic ? 'channel' : 'caller')
  } catch (err) {
    console.error('deck prompt failed:', err)
    await fail('error.generic')
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
    await deliverDeck((p) => interaction.editReply(p), deck, ctx, 'channel')
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

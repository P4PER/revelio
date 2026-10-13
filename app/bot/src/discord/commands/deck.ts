import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type MessageComponentInteraction,
} from 'discord.js'
import type { DeckSuggestion } from '@revelio/db'
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

type DeckContext = { deps: Deps; locale: string; viewerId: string | null; listOnly: boolean }

// Where the deck's own message goes once a prompt is answered: 'post' to the
// channel, 'self' to the caller alone.
type Delivery = 'post' | 'self'

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
): Promise<void> {
  const { locale } = ctx
  const siteBase = ctx.deps.env.SITE_BASE_URL
  if (!ctx.listOnly && deck.entries.length > 0) {
    try {
      const sheet = await requestDeckSheet(deck, locale, ctx.deps.env)
      await send({
        embeds: [deckEmbed(deck, { locale, siteBase, view: 'image', imageName: sheet.name })],
        files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
        components: [],
      })
      return
    } catch (err) {
      console.error('deck sheet render failed:', err)
    }
  }
  await send({ embeds: [deckEmbed(deck, { locale, siteBase, view: 'list' })], components: [] })
}

// Answers a click on the prompt with the deck's own message. The deck is
// loaded again here rather than carried from before the prompt: it may have
// been deleted or made private in the meantime, and getDeckForViewer is the
// check that has to run last. `loadAs` is the viewer that check runs for: the
// owner only once they have confirmed through the visibility prompt, null for
// a deck posted unprompted.
//
// The read comes before the acknowledgement on purpose. It is one indexed
// read, well inside the 3 s budget, and it keeps "not found" in the private
// prompt instead of opening a public "thinking" message that has to be taken
// back. Only then deferReply, which gives Discord's native loading state on the
// new message - deferUpdate would show nothing while the sheet renders.
async function deliverChoice(
  prompt: ChatInputCommandInteraction,
  component: MessageComponentInteraction,
  deckId: string,
  delivery: Delivery,
  ctx: DeckContext,
  loadAs: string | null,
): Promise<void> {
  const deck = await getDeckView(ctx.deps.db, deckId, loadAs)
  if (!deck) {
    await component.update({ content: t(ctx.locale, 'deck.notFound'), components: [] })
    return
  }
  const isPublic = delivery === 'post'
  await (isPublic ? component.deferReply() : component.deferReply({ flags: MessageFlags.Ephemeral }))
  // Answered: the deck's own message replaces the prompt. A prompt the user
  // already dismissed has nothing left to delete.
  await prompt.deleteReply().catch(() => {})
  try {
    await deliverDeck((p) => component.editReply(p), deck, ctx)
  } catch (err) {
    console.error('deck prompt failed:', err)
    // An empty public placeholder must not linger in the channel; the error
    // is for the caller alone.
    if (isPublic) await component.deleteReply().catch(() => {})
    await component
      .followUp({ content: t(ctx.locale, 'error.generic'), flags: MessageFlags.Ephemeral })
      .catch(() => {})
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
    await deliverChoice(interaction, pick, chosen.id, 'post', ctx, null)
    return
  }
  await pick.update(visibilityPrompt(chosen.name, ctx.locale))
  const click = await awaitChoice(pick.message, interaction.user.id)
  if (!click) {
    await expire(interaction, ctx.locale)
    return
  }
  await deliverChoice(interaction, click, chosen.id, click.customId === POST_ID ? 'post' : 'self', ctx, ctx.viewerId)
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
    deps, locale, viewerId, listOnly: interaction.options.getString('view') === 'list',
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
    await deliverDeck((p) => interaction.editReply(p), deck, ctx)
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
    await deliverChoice(interaction, choice, ref.id, choice.customId === POST_ID ? 'post' : 'self', ctx, viewerId)
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

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

// 'post' sends a public follow-up and marks the prompt as done; 'self' turns
// the ephemeral prompt itself into the deck.
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
// call puts the answer where it belongs: the deferred reply, a public
// follow-up, or the ephemeral prompt being replaced.
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

// Answers a click on the prompt. The deck is loaded again here rather than
// carried from before the prompt: it may have been deleted or made private in
// the meantime, and getDeckForViewer is the check that has to run last.
async function deliverChoice(
  component: MessageComponentInteraction,
  deckId: string,
  delivery: Delivery,
  ctx: DeckContext,
): Promise<void> {
  await component.deferUpdate()
  try {
    const deck = await getDeckView(ctx.deps.db, deckId, ctx.viewerId)
    if (!deck) {
      await component.editReply({ content: t(ctx.locale, 'deck.notFound'), components: [] })
      return
    }
    if (delivery === 'post') {
      await deliverDeck((p) => component.followUp(p), deck, ctx)
      await component.editReply({ content: t(ctx.locale, 'deck.posted'), components: [] })
    } else {
      await deliverDeck((p) => component.editReply({ ...p, content: '' }), deck, ctx)
    }
  } catch (err) {
    console.error('deck prompt failed:', err)
    await component
      .editReply({ content: t(ctx.locale, 'error.generic'), embeds: [], components: [] })
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
    await deliverChoice(pick, chosen.id, 'post', ctx)
    return
  }
  await pick.update(visibilityPrompt(chosen.name, ctx.locale))
  const click = await awaitChoice(pick.message, interaction.user.id)
  if (!click) {
    await expire(interaction, ctx.locale)
    return
  }
  await deliverChoice(click, chosen.id, click.customId === POST_ID ? 'post' : 'self', ctx)
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
    const deck = await getDeckView(deps.db, ref.id, viewerId)
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
    await deliverChoice(choice, ref.id, choice.customId === POST_ID ? 'post' : 'self', ctx)
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

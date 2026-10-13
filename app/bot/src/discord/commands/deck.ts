import {
  AttachmentBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js'
import type { Deps } from '../../clients'
import { findDecks, getDeckView, suggestionLabel } from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { requestDeckSheet } from '../../data/sheet'
import { deckEmbed } from '../embeds/deck-embed'

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

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const ref = interaction.options.getString('deck') ?? ''

  const deck = await getDeckView(deps.db, ref, null)
  if (!deck) {
    // One message for "no such deck" and "that deck is private": telling them
    // apart would confirm the existence of a deck its owner chose not to share.
    await interaction.editReply({ content: t(locale, 'deck.notFound') })
    return
  }

  const siteBase = deps.env.SITE_BASE_URL

  // A deck with no cards has no picture worth posting, and a sheet that cannot
  // be had must not cost the answer: both fall back to the list the embed can
  // always draw from the data already in hand. The bot draws nothing itself -
  // @revelio/sheet is the only process that paints a deck.
  const wantsImage = interaction.options.getString('view') !== 'list' && deck.entries.length > 0
  if (wantsImage) {
    try {
      const sheet = await requestDeckSheet(deck, locale, deps.env)
      await interaction.editReply({
        embeds: [deckEmbed(deck, { locale, siteBase, view: 'image', imageName: sheet.name })],
        files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
      })
      return
    } catch (err) {
      console.error('deck sheet render failed:', err)
    }
  }

  await interaction.editReply({ embeds: [deckEmbed(deck, { locale, siteBase, view: 'list' })] })
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

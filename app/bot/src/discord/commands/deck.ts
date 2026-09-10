import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { getPublicDeck } from '../../data/decks'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { deckEmbed } from '../embeds/deck-embed'

export const data = new SlashCommandBuilder()
  .setName('deck')
  .setDescription(t('en', 'command.deck.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.deck.description') })
  .addStringOption((o) =>
    o.setName('deck')
      .setDescription(t('en', 'command.deck.option.deck'))
      .setDescriptionLocalizations({ de: t('de', 'command.deck.option.deck') })
      .setRequired(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const ref = interaction.options.getString('deck') ?? ''

  const deck = await getPublicDeck(deps.db, ref)
  if (!deck) {
    // One message for "no such deck" and "that deck is private": telling them
    // apart would confirm the existence of a deck its owner chose not to share.
    await interaction.editReply({ content: t(locale, 'deck.notFound') })
    return
  }

  await interaction.editReply({
    embeds: [deckEmbed(deck, { locale, siteBase: deps.env.SITE_BASE_URL })],
  })
}

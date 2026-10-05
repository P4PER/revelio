import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { getPublicDeck } from '../../data/decks'
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
      .setRequired(true),
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

  const deck = await getPublicDeck(deps.db, ref)
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

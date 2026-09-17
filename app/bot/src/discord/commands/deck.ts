import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { getPublicDeck } from '../../data/decks'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { renderDeckImage } from '../../images/deck-image'
import { DECK_IMAGE_NAME, deckEmbed, type DeckView } from '../embeds/deck-embed'

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

  const embedOf = (view: DeckView) =>
    deckEmbed(deck, { locale, siteBase: deps.env.SITE_BASE_URL, view })

  // A deck with no cards has no picture worth posting, and a render that fails
  // must not cost the answer: both fall back to the list the embed can always
  // draw from the data already in hand.
  const wantsImage = interaction.options.getString('view') !== 'list' && deck.entries.length > 0
  if (wantsImage) {
    try {
      // The bot fetches this one itself, so it takes the fetch base - not
      // IMAGE_BASE_URL, which is the host Discord fetches embed images from and
      // may well be unreachable from in here.
      const image = await renderDeckImage(deck, { imageBase: deps.env.IMAGE_FETCH_BASE_URL, locale })
      await interaction.editReply({
        embeds: [embedOf('image')],
        files: [new AttachmentBuilder(image, { name: DECK_IMAGE_NAME })],
      })
      return
    } catch (err) {
      console.error('deck image render failed:', err)
    }
  }

  await interaction.editReply({ embeds: [embedOf('list')] })
}

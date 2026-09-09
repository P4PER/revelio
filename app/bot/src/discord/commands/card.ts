import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { findOneCard, resolveCardRulings } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { cardEmbed } from '../embeds/card-embed'

export const data = new SlashCommandBuilder()
  .setName('card')
  .setDescription(t('en', 'command.card.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.card.description') })
  .addStringOption((o) =>
    o.setName('name')
      .setDescription(t('en', 'command.card.option.name'))
      .setDescriptionLocalizations({ de: t('de', 'command.card.option.name') })
      .setRequired(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const name = interaction.options.getString('name') ?? ''

  const doc = await findOneCard(deps.meili, { query: name, locale })
  if (!doc) {
    // The raw option value is echoed back, so mentions must be inert: without
    // this, `/card name:@everyone` turns the bot into a mass ping.
    await interaction.editReply({
      content: t(locale, 'card.notFound', { name }),
      allowedMentions: { parse: [] },
    })
    return
  }

  const [setName, rulings] = await Promise.all([
    deps.sets.name(doc.setCode, locale),
    resolveCardRulings(deps.db, doc.id, locale),
  ])

  await interaction.editReply({
    embeds: [cardEmbed(doc, {
      locale,
      setName,
      rulings,
      imageBase: deps.env.IMAGE_BASE_URL,
      siteBase: deps.env.SITE_BASE_URL,
    })],
  })
}

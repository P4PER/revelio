import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import type { CardFilters } from '@revelio/search'
import type { Deps } from '../../clients'
import { findCards } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { searchEmbed } from '../embeds/search-embed'

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription(t('en', 'command.search.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.search.description') })
  .addStringOption((o) =>
    o.setName('query')
      .setDescription(t('en', 'command.search.option.query'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.query') })
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('lesson')
      .setDescription(t('en', 'command.search.option.lesson'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.lesson') })
      .addChoices(...LESSONS.map((l) => ({
        name: attrLabel('lessons', l.code, 'en'),
        name_localizations: { de: attrLabel('lessons', l.code, 'de') },
        value: l.code,
      }))),
  )
  .addStringOption((o) =>
    o.setName('type')
      .setDescription(t('en', 'command.search.option.type'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.type') })
      .addChoices(...TYPES.map((ty) => ({
        name: attrLabel('types', ty.code, 'en'),
        name_localizations: { de: attrLabel('types', ty.code, 'de') },
        value: ty.code,
      }))),
  )
  .addIntegerOption((o) =>
    o.setName('page')
      .setDescription(t('en', 'command.search.option.page'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.page') })
      .setMinValue(1),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const query = interaction.options.getString('query') ?? ''
  const lesson = interaction.options.getString('lesson')
  const type = interaction.options.getString('type')
  const requestedPage = interaction.options.getInteger('page') ?? 1

  const filters: CardFilters = {}
  if (lesson) filters.lesson = [lesson]
  if (type) filters.types = [type]

  const page = await findCards(deps.meili, { query, locale, filters, page: requestedPage })

  if (page.total === 0) {
    await interaction.editReply({ content: t(locale, 'search.noResults') })
    return
  }
  if (page.page > page.pages) {
    await interaction.editReply({
      content: t(locale, 'search.pageOutOfRange', { pages: page.pages }),
    })
    return
  }

  await interaction.editReply({
    embeds: [searchEmbed(page, { locale, query, siteBase: deps.env.SITE_BASE_URL })],
  })
}

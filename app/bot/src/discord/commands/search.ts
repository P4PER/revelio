import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import type { CardFilters } from '@revelio/search'
import type { Deps } from '../../clients'
import { clampLabel, findCards, MAX_CHOICES } from '../../data/cards'
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
  .addStringOption((o) =>
    o.setName('set')
      .setDescription(t('en', 'command.search.option.set'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.set') })
      .setAutocomplete(true),
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
  const set = interaction.options.getString('set')
  const requestedPage = interaction.options.getInteger('page') ?? 1

  const filters: CardFilters = {}
  if (lesson) filters.lesson = [lesson]
  if (type) filters.types = [type]
  if (set) filters.setCode = [set]

  const page = await findCards(deps.meili, { query, locale, filters, page: requestedPage })

  if (page.total === 0) {
    await interaction.editReply({ content: t(locale, 'search.noResults') })
    return
  }
  // `pages` is derived from Meilisearch's estimatedTotalHits, which over-estimates,
  // so a page can sit inside `pages` and still come back empty. Both cases are the
  // same thing to the user: the page they asked for is not there.
  if (page.page > page.pages || page.hits.length === 0) {
    await interaction.editReply({
      content: t(locale, 'search.pageOutOfRange', { pages: page.pages }),
    })
    return
  }

  await interaction.editReply({
    embeds: [searchEmbed(page, {
      locale,
      query,
      siteBase: deps.env.SITE_BASE_URL,
      filters: { lesson, type, set },
    })],
  })
}

// Only one option on /search autocompletes, so this does not branch on which
// one is focused. Adding a second autocompleting option here makes that branch
// mandatory.
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const focused = interaction.options.getFocused().trim().toLowerCase()
  try {
    const sets = await deps.sets.all(toRevelioLocale(interaction.locale))
    const matches = sets
      .filter((s) => !focused
        || s.code.toLowerCase().includes(focused)
        || s.name.toLowerCase().includes(focused))
      .slice(0, MAX_CHOICES)
    await interaction.respond(matches.map((s) => ({ name: clampLabel(s.name), value: s.code })))
  } catch (err) {
    console.error('search autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}

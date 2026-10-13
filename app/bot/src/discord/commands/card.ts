import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js'
import type { Deps } from '../../clients'
import { findCardById, findOneCard, suggestCards } from '../../data/cards'
import { loadCardDetail } from '../../data/card-detail'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { cardView } from '../v2/card-view'
import { textEdit, v2Edit } from '../v2/send'

export const data = new SlashCommandBuilder()
  .setName('card')
  .setDescription(t('en', 'command.card.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.card.description') })
  .addStringOption((o) =>
    o.setName('name')
      .setDescription(t('en', 'command.card.option.name'))
      .setDescriptionLocalizations({ de: t('de', 'command.card.option.name') })
      .setRequired(true)
      .setAutocomplete(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply()
  const locale = toRevelioLocale(interaction.locale)
  const name = interaction.options.getString('name') ?? ''

  // A chosen suggestion submits the card id; typed free text does not.
  const doc = (await findCardById(deps.meili, name, locale))
    ?? (await findOneCard(deps.meili, { query: name, locale }))
  if (!doc) {
    // The raw option value is echoed back, so mentions must be inert: without
    // this, `/card name:@everyone` turns the bot into a mass ping.
    await interaction.editReply({
      ...textEdit(t(locale, 'card.notFound', { name })),
      allowedMentions: { parse: [] },
    })
    return
  }

  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
  })))
}

export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const focused = interaction.options.getFocused()
  try {
    const suggestions = await suggestCards(deps.meili, {
      query: focused,
      locale: toRevelioLocale(interaction.locale),
    })
    await interaction.respond(suggestions.map((s) => ({ name: s.label, value: s.id })))
  } catch (err) {
    // A failed suggestion must not surface as an error banner mid-typing; an
    // empty list degrades to plain free-text entry.
    console.error('card autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}

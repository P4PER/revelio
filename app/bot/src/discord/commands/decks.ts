import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { DeckFormat } from '@revelio/core'
import type { Deps } from '../../clients'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { clampQuery, DECK_SORTS, MAX_QUERY, type DeckBrowseState } from '../components/custom-id'
import { renderDeckBrowser } from '../components/deck-browser'

export const data = new SlashCommandBuilder()
  .setName('decks')
  .setDescription(t('en', 'command.decks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.decks.description') })
  .addStringOption((o) =>
    o.setName('query')
      .setDescription(t('en', 'command.decks.option.query'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.query') })
      .setMaxLength(MAX_QUERY),
  )
  .addStringOption((o) =>
    o.setName('format')
      .setDescription(t('en', 'command.decks.option.format'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.format') })
      .addChoices(...DeckFormat.options.map((value) => ({
        name: t('en', `deck.format.${value}`),
        name_localizations: { de: t('de', `deck.format.${value}`) },
        value,
      }))),
  )
  .addStringOption((o) =>
    o.setName('sort')
      .setDescription(t('en', 'command.decks.option.sort'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.sort') })
      .addChoices(...DECK_SORTS.map((value) => ({
        name: t('en', `decks.sort.${value}`),
        name_localizations: { de: t('de', `decks.sort.${value}`) },
        value,
      }))),
  )

export async function execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void> {
  // Private before anything else: browsing is the caller's; only a deck they
  // post reaches the channel.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)
  const format = DeckFormat.safeParse(interaction.options.getString('format'))
  const sort = DECK_SORTS.find((s) => s === interaction.options.getString('sort')) ?? 'likes'
  const state: DeckBrowseState = {
    scope: 'public',
    page: 1,
    format: format.success ? format.data : null,
    sort,
    lesson: null,
    query: clampQuery(interaction.options.getString('query') ?? ''),
  }
  await interaction.editReply(await renderDeckBrowser(deps, state, locale, interaction.user.id))
}

import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import type { DeckBrowseState } from '../components/custom-id'
import { renderDeckBrowser } from '../components/deck-browser'

export const data = new SlashCommandBuilder()
  .setName('mydecks')
  .setDescription(t('en', 'command.mydecks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.mydecks.description') })

const MINE: DeckBrowseState = { scope: 'mine', page: 1, format: null, sort: 'updated', lesson: null, query: '' }

export async function execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void> {
  // Ephemeral before anything else. Private decks are listed on purpose: only
  // the person who ran the command can read the reply.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderDeckBrowser(deps, MINE, locale, interaction.user.id))
}

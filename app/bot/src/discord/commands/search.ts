import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import type { Deps } from '../../clients'
import { clampLabel, MAX_CHOICES } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { clampQuery, MAX_QUERY, type CardBrowseState } from '../components/custom-id'
import { renderSearchBrowser } from '../components/search-browser'
import { textEdit } from '../v2/send'

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription(t('en', 'command.search.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.search.description') })
  .addStringOption((o) =>
    o.setName('query')
      .setDescription(t('en', 'command.search.option.query'))
      .setDescriptionLocalizations({ de: t('de', 'command.search.option.query') })
      .setMaxLength(MAX_QUERY),
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

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  // Private before anything else: a result list is the caller's to browse.
  // Only what they choose to share reaches the channel.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  // The set option autocompletes to a code but can be typed by hand, so it is
  // resolved against the real list - by code or name, any case - before it can
  // reach a custom id.
  const typedSet = interaction.options.getString('set')?.trim().toLowerCase() ?? ''
  let set: string | null = null
  if (typedSet) {
    const sets = await deps.sets.all(locale)
    const match = sets.find((s) => s.code.toLowerCase() === typedSet || s.name.toLowerCase() === typedSet)
    if (!match) {
      await interaction.editReply(textEdit(t(locale, 'search.setUnknown')))
      return
    }
    set = match.code
  }

  const state: CardBrowseState = {
    page: 1,
    lesson: interaction.options.getString('lesson'),
    type: interaction.options.getString('type'),
    set,
    query: clampQuery(interaction.options.getString('query') ?? ''),
  }
  await interaction.editReply(await renderSearchBrowser(deps, state, locale, interaction.inGuild()))
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

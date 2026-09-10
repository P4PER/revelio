import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js'
import type { Deps } from '../../clients'
import { clampLabel, MAX_CHOICES } from '../../data/cards'
import { getCollectionReport, getSetProgress } from '../../data/collection'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { settingsUrl } from '../../links'

export const data = new SlashCommandBuilder()
  .setName('collection')
  .setDescription(t('en', 'command.collection.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.collection.description') })
  .addStringOption((o) =>
    o.setName('set')
      .setDescription(t('en', 'command.collection.option.set'))
      .setDescriptionLocalizations({ de: t('de', 'command.collection.option.set') })
      .setAutocomplete(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  // Ephemeral before anything else: a collection is not channel business.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  const userId = await resolveLinkedUser(deps.db, interaction.user.id)
  if (!userId) {
    await interaction.editReply({
      content: t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  const setCode = interaction.options.getString('set')
  if (setCode) {
    const progress = await getSetProgress(deps.db, userId, setCode)
    if (!progress) {
      await interaction.editReply({ content: t(locale, 'collection.setUnknown') })
      return
    }
    await interaction.editReply({
      content: t(locale, 'collection.set', {
        setName: await deps.sets.name(setCode, locale),
        owned: progress.owned,
        total: progress.total,
        percent: progress.percent,
      }),
    })
    return
  }

  const report = await getCollectionReport(deps.db, userId)
  await interaction.editReply({
    content: t(locale, 'collection.summary', {
      owned: report.distinctOwned,
      total: report.totalCards,
      percent: report.percent,
      copies: report.totalCopies,
    }),
  })
}

// The same set suggestions /search offers, against the cached list rather than
// a query: autocomplete has a 3 second budget and cannot be deferred.
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
    console.error('collection autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}

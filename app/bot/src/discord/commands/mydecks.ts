import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { listDecksByUser } from '@revelio/db'
import type { Deps } from '../../clients'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { deckUrl, newDeckUrl, settingsUrl } from '../../links'

// Discord rejects a message body over this outright, failing the whole
// interaction rather than truncating it.
const MESSAGE_LIMIT = 2000

export const data = new SlashCommandBuilder()
  .setName('mydecks')
  .setDescription(t('en', 'command.mydecks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.mydecks.description') })

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  const userId = await resolveLinkedUser(deps.db, interaction.user.id)
  if (!userId) {
    await interaction.editReply({
      content: t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  const decks = await listDecksByUser(deps.db, userId)
  if (!decks.length) {
    await interaction.editReply({
      content: t(locale, 'decks.empty', { url: newDeckUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  // Private decks are included on purpose: this reply is ephemeral, so only the
  // person who ran the command can read it.
  const header = t(locale, 'decks.title', { count: decks.length })
  const lines: string[] = []
  let length = header.length
  for (const deck of decks) {
    const line = `${t(locale, 'decks.line', {
      name: deck.name,
      format: t(locale, `deck.format.${deck.format}`),
      count: deck.mainCount,
      visibility: t(locale, `decks.visibility.${deck.visibility}`),
    })} - ${deckUrl(deps.env.SITE_BASE_URL, deck.id, locale)}`
    // Decks come back newest first, so stopping is better than skipping the
    // long one and resuming: the reader gets a contiguous most-recent run.
    if (length + line.length + 1 > MESSAGE_LIMIT) break
    lines.push(line)
    length += line.length + 1
  }

  // The header counts every deck, so a silent stop would read as "you have 80
  // decks" above a list of 25. Say what was left out, dropping shown rows until
  // that admission itself fits.
  if (lines.length < decks.length) {
    let more = t(locale, 'deck.more', { count: decks.length - lines.length })
    while (lines.length > 0 && length + more.length + 1 > MESSAGE_LIMIT) {
      length -= lines.pop()!.length + 1
      more = t(locale, 'deck.more', { count: decks.length - lines.length })
    }
    lines.push(more)
  }

  await interaction.editReply({ content: [header, ...lines].join('\n') })
}

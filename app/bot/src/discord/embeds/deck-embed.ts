import { EmbedBuilder } from 'discord.js'
import { LESSONS } from '@revelio/core'
import type { DeckEntryView, PublicDeck } from '../../data/decks'
import { t } from '../../i18n/t'
import { deckUrl } from '../../links'

export type DeckEmbedOptions = { locale: string; siteBase: string }

const FIELD_LIMIT = 1024
const FALLBACK_COLOR = 0x2b2d31

function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

// Fill the field with whole lines, then say how many were left out. A truncated
// card name would read as a data bug; an explicit remainder reads as a summary.
// The remainder counts copies, not entries, because the field header counts
// copies: two units inside one field leave the reader unable to reconcile them.
function cardList(entries: DeckEntryView[], locale: string): string {
  const lines: string[] = []
  let used = 0
  let left = entries.reduce((n, e) => n + e.quantity, 0)
  for (const entry of entries) {
    const line = `${entry.quantity}x ${entry.name}`
    const remainder = t(locale, 'deck.more', { count: left })
    if (used + line.length + 1 + remainder.length + 1 > FIELD_LIMIT) {
      lines.push(remainder)
      break
    }
    lines.push(line)
    used += line.length + 1
    left -= entry.quantity
  }
  return lines.join('\n')
}

export function deckEmbed(deck: PublicDeck, opts: DeckEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const embed = new EmbedBuilder()
    .setTitle(deck.name)
    .setURL(deckUrl(opts.siteBase, deck.id, locale))
    .setColor(lessonColor(deck.topLesson))
    .setFooter({
      text: deck.ownerUsername
        ? t(locale, 'deck.footer', { owner: deck.ownerUsername })
        : t(locale, 'deck.footer.anonymous'),
    })

  if (deck.character) {
    embed.addFields({
      name: t(locale, 'deck.field.character'),
      value: deck.character.name,
      inline: true,
    })
  }
  embed.addFields(
    { name: t(locale, 'deck.field.format'), value: t(locale, `deck.format.${deck.format}`), inline: true },
    { name: t(locale, 'deck.field.legality'), value: t(locale, `deck.status.${deck.status}`), inline: true },
  )
  if (deck.main.length) {
    embed.addFields({
      name: t(locale, 'deck.field.main', { count: deck.mainCount }),
      value: cardList(deck.main, locale),
    })
  }
  if (deck.sideboard.length) {
    embed.addFields({
      name: t(locale, 'deck.field.sideboard', { count: deck.sideboardCount }),
      value: cardList(deck.sideboard, locale),
    })
  }
  return embed
}

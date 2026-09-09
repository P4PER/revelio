import { EmbedBuilder } from 'discord.js'
import type { SearchDocument } from '@revelio/search'
import { attrLabel, imageUrl, thumbKey, LESSONS } from '@revelio/core'
import type { CardRuling } from '../../data/cards'
import { t } from '../../i18n/t'
import { cardUrl } from '../../links'

// Discord rejects the entire response if an embed breaks a limit, so clamp
// rather than risk a 400 on a wordy card.
const DESCRIPTION_LIMIT = 4096
const FIELD_LIMIT = 1024
const FALLBACK_COLOR = 0x2b2d31

const ELLIPSIS = '...'

function clamp(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`
}

function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

export type CardEmbedOptions = {
  locale: string
  setName: string
  imageBase: string
  siteBase: string
  rulings: CardRuling[]
}

export function cardEmbed(doc: SearchDocument, opts: CardEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const embed = new EmbedBuilder()
    .setTitle(doc.name)
    .setURL(cardUrl(opts.siteBase, doc.id, locale))
    .setColor(lessonColor(doc.lesson))
    .setFooter({ text: t(locale, 'card.footer', { setName: opts.setName, number: doc.number }) })

  const body = [doc.text, doc.flavorText ? `*${doc.flavorText}*` : null]
    .filter(Boolean)
    .join('\n\n')
  if (body) embed.setDescription(clamp(body, DESCRIPTION_LIMIT))

  if (doc.imageLang && doc.imageVersion != null) {
    const key = thumbKey(doc.id, doc.imageVersion, doc.imageLang, doc.defaultLanguage)
    embed.setThumbnail(imageUrl(opts.imageBase, key))
  }

  // Sub-types are not curated in attributes.ts (they self-extend from card data),
  // so they are appended raw after the localized types.
  const typeLabel = [
    ...doc.types.map((code) => attrLabel('types', code, locale)),
    ...doc.subTypes,
  ].join(', ')
  if (typeLabel) {
    embed.addFields({ name: t(locale, 'card.field.type'), value: typeLabel, inline: true })
  }
  if (doc.lesson) {
    embed.addFields({
      name: t(locale, 'card.field.lesson'),
      value: attrLabel('lessons', doc.lesson, locale),
      inline: true,
    })
  }
  if (doc.cost != null) {
    embed.addFields({ name: t(locale, 'card.field.cost'), value: String(doc.cost), inline: true })
  }
  if (doc.damage != null) {
    embed.addFields({ name: t(locale, 'card.field.damage'), value: String(doc.damage), inline: true })
  }
  if (doc.rarity) {
    embed.addFields({
      name: t(locale, 'card.field.rarity'),
      value: attrLabel('rarities', doc.rarity, locale),
      inline: true,
    })
  }
  if (doc.legality) {
    embed.addFields({
      name: t(locale, 'card.field.legality'),
      value: attrLabel('legalities', doc.legality, locale),
      inline: true,
    })
  }
  if (opts.rulings.length) {
    const value = opts.rulings
      .map((r) => (r.date ? `- ${r.date}: ${r.text}` : `- ${r.text}`))
      .join('\n')
    embed.addFields({ name: t(locale, 'card.field.rulings'), value: clamp(value, FIELD_LIMIT) })
  }

  return embed
}

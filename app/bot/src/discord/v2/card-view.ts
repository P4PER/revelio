import {
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  type ButtonBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { attrLabel, humanize, imageUrl, landscapeThumbKey, thumbKey } from '@revelio/core'
import type { CardDetail } from '../../data/card-detail'
import { t } from '../../i18n/t'
import { cardUrl } from '../../links'
import { container, lessonColor, linkButton, text } from './parts'

export type CardViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Buttons that lead the link button in the view's one row: Back and Post in
  // the browser. At most four, since a row holds five.
  actions?: ButtonBuilder[]
}

// Per-part ceilings that keep a wordy card inside the message's 4000-character
// text budget, with room left for the heading, stats and footer. The guard in
// limits.ts enforces the whole; these keep a long card from ever reaching it.
const BODY_LIMIT = 1800
const RULINGS_LIMIT = 1500
const ELLIPSIS = '...'

function clamp(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`
}

// Two lines in place of the embed's inline-field grid, which needed blank
// padding fields to keep its columns: what the card is (types, sub-types,
// lesson), then what it costs and how it plays. One line ran the two together.
// Sub-types are not curated in attributes.ts, so they resolve like the card
// page: a translation from the DB, else the humanized code.
function headerLines(detail: CardDetail, locale: string): string[] {
  const { doc } = detail
  const types = [
    ...doc.types.map((code) => attrLabel('types', code, locale)),
    ...doc.subTypes.map((code) => detail.subTypeLabels[code] ?? humanize(code)),
  ].join(', ')
  const tags = [types, doc.lesson ? attrLabel('lessons', doc.lesson, locale) : '']
  const stats = [
    doc.cost != null ? t(locale, 'card.stat.cost', { value: doc.cost }) : '',
    doc.damage != null ? t(locale, 'card.stat.damage', { value: doc.damage }) : '',
    doc.rarity ? attrLabel('rarities', doc.rarity, locale) : '',
    // Without field labels, a bare "Unknown" would not say what is.
    doc.legality && doc.legality !== 'unknown' ? attrLabel('legalities', doc.legality, locale) : '',
  ]
  return [tags, stats].map((parts) => parts.filter(Boolean).join(' · ')).filter(Boolean)
}

export function cardView(detail: CardDetail, opts: CardViewOptions): ContainerBuilder[] {
  const { doc } = detail
  const { locale } = opts
  const view = container(lessonColor(doc.lesson))

  view.addTextDisplayComponents(text([`## ${doc.name}`, ...headerLines(detail, locale)].join('\n')))

  // Card faces are stored portrait, so a horizontal card uses its pre-baked
  // landscape thumb to read upright. The 300px thumb, never the full image.
  if (doc.imageLang && doc.imageVersion != null) {
    const keyOf = doc.orientation === 'horizontal' ? landscapeThumbKey : thumbKey
    const url = imageUrl(opts.imageBase, keyOf(doc.id, doc.imageVersion, doc.imageLang, doc.defaultLanguage))
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url).setDescription(doc.name)),
    )
  }

  const body = [doc.text, doc.flavorText ? `*${doc.flavorText}*` : null].filter(Boolean).join('\n\n')
  if (body) view.addTextDisplayComponents(text(clamp(body, BODY_LIMIT)))

  if (detail.rulings.length) {
    const list = detail.rulings
      .map((r) => (r.date ? `- ${r.date}: ${r.text}` : `- ${r.text}`))
      .join('\n')
    view.addSeparatorComponents(new SeparatorBuilder())
    view.addTextDisplayComponents(
      text(`**${t(locale, 'card.field.rulings')}**\n${clamp(list, RULINGS_LIMIT)}`),
    )
  }

  view.addTextDisplayComponents(
    text(`-# ${t(locale, 'card.footer', { setName: detail.setName, number: doc.number })}`),
  )
  view.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...(opts.actions ?? []),
      linkButton(cardUrl(opts.siteBase, doc.id, locale), t(locale, 'card.openSite')),
    ),
  )
  return [view]
}

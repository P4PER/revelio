import {
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  type ButtonBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { attrLabel, humanize } from '@revelio/core'
import type { CardDetail } from '../../data/card-detail'
import { t } from '../../i18n/t'
import { cardUrl } from '../../links'
import { cardThumbUrl, container, lessonColor, linkButton, text } from './parts'

// The card.field.* labels the header uses, typed so a misspelt one fails to
// compile instead of showing its raw catalog key in a channel.
type FieldKey = 'type' | 'lesson' | 'cost' | 'damage' | 'rarity' | 'legality'

export type CardViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Buttons that lead the link button in the view's one row: Back and Post in
  // the browser. At most four, since a row holds five.
  actions?: ButtonBuilder[]
  // A line above the heading: who shared the card, on a post to a channel.
  lead?: string
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

// Labelled pairs on two lines, in place of the embed's inline-field grid
// (which needed blank padding fields to keep its columns): what the card is,
// then what it costs and how it plays. A pair with no value is dropped, and a
// line with no pairs. Sub-types are not curated in attributes.ts, so they
// resolve like the card page: a translation from the DB, else the humanized code.
function headerLines(detail: CardDetail, locale: string): string[] {
  const { doc } = detail
  const pair = (key: FieldKey, value: string | number | null | undefined): string =>
    value == null || value === '' ? '' : `**${t(locale, `card.field.${key}`)}** ${value}`
  const types = [
    ...doc.types.map((code) => attrLabel('types', code, locale)),
    ...doc.subTypes.map((code) => detail.subTypeLabels[code] ?? humanize(code)),
  ].join(', ')
  const tags = [
    pair('type', types),
    pair('lesson', doc.lesson && attrLabel('lessons', doc.lesson, locale)),
  ]
  const stats = [
    pair('cost', doc.cost),
    pair('damage', doc.damage),
    pair('rarity', doc.rarity && attrLabel('rarities', doc.rarity, locale)),
    pair('legality', doc.legality && attrLabel('legalities', doc.legality, locale)),
  ]
  return [tags, stats].map((parts) => parts.filter(Boolean).join(' · ')).filter(Boolean)
}

export function cardView(detail: CardDetail, opts: CardViewOptions): ContainerBuilder[] {
  const { doc } = detail
  const { locale } = opts
  const view = container(lessonColor(doc.lesson))

  const heading = [`## ${doc.name}`, ...headerLines(detail, locale)].join('\n')
  view.addTextDisplayComponents(text(opts.lead ? `${opts.lead}\n${heading}` : heading))

  const image = cardThumbUrl(doc, opts.imageBase)
  if (image) {
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image).setDescription(doc.name)),
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

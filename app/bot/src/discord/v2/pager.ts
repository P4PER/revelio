import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { t } from '../../i18n/t'

export type PagerOptions = {
  locale: string
  page: number
  pages: number
  // False on the estimated last page and on a short page: Meilisearch totals
  // over-count, so "page < pages" alone can offer a next page that is empty.
  hasNext: boolean
  prevId: string
  nextId: string
  // The page indicator is a disabled button, which still needs an id of its own.
  indicatorId: string
  // Share and the site link ride in the same row; a row holds five buttons.
  trailing?: ButtonBuilder[]
}

export function pagerRow(opts: PagerOptions): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const { locale } = opts
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(opts.prevId).setLabel(t(locale, 'browse.prev'))
      .setStyle(ButtonStyle.Secondary).setDisabled(opts.page <= 1),
    new ButtonBuilder().setCustomId(opts.indicatorId)
      .setLabel(t(locale, 'browse.page', { page: opts.page, pages: opts.pages }))
      .setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(opts.nextId).setLabel(t(locale, 'browse.next'))
      .setStyle(ButtonStyle.Secondary).setDisabled(!opts.hasNext),
    ...(opts.trailing ?? []),
  )
}

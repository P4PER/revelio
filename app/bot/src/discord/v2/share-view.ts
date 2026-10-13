import {
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ContainerBuilder,
} from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { t } from '../../i18n/t'
import { browseUrl } from '../../links'
import { encodeCustomId, type CardBrowseState } from '../components/custom-id'
import { actionRow, BRAND_GOLD, container, linkButton, plain, text } from './parts'
import { addCardRow, cardOption } from './rows'

export type ShareViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Discord user id of whoever shared, for the attribution line.
  sharerId: string
}

// The private step between Share and the post: which of this page's cards go.
// Changing the menu only redraws this picker; Post sends. A multi-select left
// as it was may never fire, so the menu cannot be what posts. `mask` holds the
// ticked rows, one bit per row, and rides on Post's id.
export function sharePicker(
  hits: CardBrowseHit[],
  state: CardBrowseState,
  mask: number,
  locale: string,
): ContainerBuilder[] {
  return [
    container()
      .addTextDisplayComponents(text(t(locale, 'search.share.prompt')))
      .addActionRowComponents(
        actionRow(new StringSelectMenuBuilder()
          .setCustomId(encodeCustomId({ kind: 'sp', state }))
          .setPlaceholder(t(locale, 'search.share.placeholder'))
          .setMinValues(1)
          .setMaxValues(hits.length)
          .addOptions(hits.map((hit, i) => cardOption(hit, ((mask >> i) & 1) === 1)))),
        actionRow(
          new ButtonBuilder()
            .setCustomId(encodeCustomId({ kind: 'sx', mask, state }))
            .setLabel(t(locale, 'search.share.post'))
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(encodeCustomId({ kind: 's', state }))
            .setLabel(t(locale, 'search.share.cancel'))
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ]
}

// The public list. Nothing on it changes the message: "View a card" answers
// whoever picks privately, and the link opens the site.
export function shareView(hits: CardBrowseHit[], state: CardBrowseState, opts: ShareViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const user = `<@${opts.sharerId}>`
  // One card reads "shared a card", not "shared 1 cards".
  const key = hits.length === 1 ? 'post.sharedCard' : 'post.sharedCards'
  const lead = state.query
    ? t(locale, `${key}.query`, { user, count: hits.length, query: plain(state.query) })
    : t(locale, key, { user, count: hits.length })
  const view = container(BRAND_GOLD).addTextDisplayComponents(text(lead))
  for (const hit of hits) addCardRow(view, hit, opts)
  view.addActionRowComponents(
    actionRow(new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: 'pk' }))
      .setPlaceholder(t(locale, 'share.view.placeholder'))
      .addOptions(hits.map((hit) => cardOption(hit)))),
    actionRow(linkButton(
      browseUrl(opts.siteBase, state, locale),
      t(locale, 'share.site'),
    )),
  )
  return [view]
}

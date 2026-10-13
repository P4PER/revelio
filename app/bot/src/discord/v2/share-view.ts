import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { clampLabel } from '../../data/cards'
import { t } from '../../i18n/t'
import { searchUrl } from '../../links'
import { encodeCustomId, type CardBrowseState } from '../components/custom-id'
import { BRAND_GOLD, container, linkButton, plain, text } from './parts'
import { addCardRow } from './rows'

export type ShareViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Discord user id of whoever shared, for the attribution line.
  sharerId: string
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

function cardOptions(hits: CardBrowseHit[], selected: boolean) {
  return hits.map((hit) => ({
    label: clampLabel(hit.name),
    description: `${hit.setCode} #${hit.number}`,
    value: hit.id,
    default: selected,
  }))
}

// The private step between Share and the post: which of this page's cards go.
export function sharePicker(hits: CardBrowseHit[], state: CardBrowseState, locale: string): ContainerBuilder[] {
  return [
    container()
      .addTextDisplayComponents(text(t(locale, 'search.share.prompt')))
      .addActionRowComponents(
        row(new StringSelectMenuBuilder()
          .setCustomId(encodeCustomId({ kind: 'sp', state }))
          .setPlaceholder(t(locale, 'search.share.placeholder'))
          .setMinValues(1)
          .setMaxValues(hits.length)
          .addOptions(cardOptions(hits, true))),
        row(new ButtonBuilder()
          .setCustomId(encodeCustomId({ kind: 's', state }))
          .setLabel(t(locale, 'search.share.cancel'))
          .setStyle(ButtonStyle.Secondary)),
      ),
  ]
}

// The public list. Nothing on it changes the message: "View a card" answers
// whoever picks privately, and the link opens the site.
export function shareView(hits: CardBrowseHit[], state: CardBrowseState, opts: ShareViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const user = `<@${opts.sharerId}>`
  const lead = state.query
    ? t(locale, 'post.sharedCards.query', { user, count: hits.length, query: plain(state.query) })
    : t(locale, 'post.sharedCards', { user, count: hits.length })
  const view = container(BRAND_GOLD).addTextDisplayComponents(text(lead))
  for (const hit of hits) addCardRow(view, hit, opts)
  view.addActionRowComponents(
    row(new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: 'pk' }))
      .setPlaceholder(t(locale, 'share.view.placeholder'))
      .addOptions(cardOptions(hits, false))),
    row(linkButton(
      searchUrl(opts.siteBase, state.query, locale, { lesson: state.lesson, type: state.type, set: state.set }),
      t(locale, 'share.site'),
    )),
  )
  return [view]
}

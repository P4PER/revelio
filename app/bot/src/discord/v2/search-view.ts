import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import { clampLabel, type CardPage } from '../../data/cards'
import type { SetEntry } from '../../data/sets'
import { t } from '../../i18n/t'
import { searchUrl } from '../../links'
import { encodeCustomId, type CardBrowseState } from '../components/custom-id'
import { pagerRow } from './pager'
import { BRAND_GOLD, container, linkButton, plain, text } from './parts'
import { addCardRow } from './rows'

export type SearchViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // The set select's options, in release order.
  sets: SetEntry[]
  // False outside a guild, where there is no channel to share into.
  canPost: boolean
}

type FilterOption = { value: string; label: string }

// The select value meaning "no filter". Not a code any lesson, type or set uses.
export const ANY = '-'

// A select holds 25 options; one of them is "Any".
const MAX_FILTER_OPTIONS = 24

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

function filterSelect(
  kind: 'sl' | 'st' | 'ss',
  state: CardBrowseState,
  placeholder: string,
  options: FilterOption[],
  current: string | null,
  locale: string,
): Row {
  // The active value stays selectable even when it falls past the cut.
  const active = options.find((o) => o.value === current)
  const listed = options.slice(0, MAX_FILTER_OPTIONS)
  const shown = active && !listed.includes(active) ? [active, ...listed.slice(0, -1)] : listed
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind, state }))
      .setPlaceholder(placeholder)
      .addOptions(
        // Never preselected: an unset filter shows its placeholder, which is
        // the only label a message select has.
        { label: t(locale, 'browse.any'), value: ANY, default: false },
        ...shown.map((o) => ({ label: clampLabel(o.label), value: o.value, default: o.value === current })),
      ),
  )
}

function header(page: CardPage, state: CardBrowseState, opts: SearchViewOptions): string {
  const { locale } = opts
  if (page.total === 0) return t(locale, 'search.noResults')
  if (page.hits.length === 0) return t(locale, 'search.pageEmpty')
  const head = state.query
    ? t(locale, 'search.header.query', { query: plain(state.query), total: page.total })
    : t(locale, 'search.header', { total: page.total })
  const filters = [
    state.lesson ? attrLabel('lessons', state.lesson, locale) : '',
    state.type ? attrLabel('types', state.type, locale) : '',
    state.set ? opts.sets.find((s) => s.code === state.set)?.name ?? state.set : '',
  ].filter(Boolean)
  return filters.length ? `${head} · ${filters.join(' · ')}` : head
}

// The private browser: header, up to five rows, an open menu, three filter
// menus and the pager. 33 components at its fullest (spec section 5).
export function searchView(page: CardPage, state: CardBrowseState, opts: SearchViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container(BRAND_GOLD).addTextDisplayComponents(text(header(page, state, opts)))

  if (page.hits.length) {
    view.addSeparatorComponents(new SeparatorBuilder())
    for (const hit of page.hits) addCardRow(view, hit, opts)
    view.addSeparatorComponents(new SeparatorBuilder())
    view.addActionRowComponents(row(
      new StringSelectMenuBuilder()
        .setCustomId(encodeCustomId({ kind: 'co', state }))
        .setPlaceholder(t(locale, 'search.open.placeholder'))
        .addOptions(page.hits.map((hit) => ({
          label: clampLabel(hit.name),
          description: `${hit.setCode} #${hit.number}`,
          value: hit.id,
        }))),
    ))
  }

  view.addActionRowComponents(
    filterSelect('sl', state, t(locale, 'search.filter.lesson'),
      LESSONS.map((l) => ({ value: l.code, label: attrLabel('lessons', l.code, locale) })), state.lesson, locale),
    filterSelect('st', state, t(locale, 'search.filter.type'),
      TYPES.map((ty) => ({ value: ty.code, label: attrLabel('types', ty.code, locale) })), state.type, locale),
    filterSelect('ss', state, t(locale, 'search.filter.set'),
      opts.sets.map((s) => ({ value: s.code, label: s.name })), state.set, locale),
  )

  const trailing: ButtonBuilder[] = []
  if (page.hits.length && opts.canPost) {
    trailing.push(new ButtonBuilder()
      .setCustomId(encodeCustomId({ kind: 'sh', state }))
      .setLabel(t(locale, 'search.share'))
      .setStyle(ButtonStyle.Primary))
  }
  trailing.push(linkButton(
    searchUrl(opts.siteBase, state.query, locale, { lesson: state.lesson, type: state.type, set: state.set }),
    t(locale, 'browse.site'),
  ))
  const hasNext = page.page < page.pages && page.hits.length === page.pageSize
  view.addActionRowComponents(pagerRow({
    locale,
    page: page.page,
    pages: Math.max(page.pages, page.page),
    hasNext,
    prevId: encodeCustomId({ kind: 's', state: { ...state, page: Math.max(1, page.page - 1) } }),
    nextId: encodeCustomId({ kind: 's', state: { ...state, page: page.page + 1 } }),
    indicatorId: encodeCustomId({ kind: 'pg', of: 'cards' }),
    trailing,
  }))
  return [view]
}

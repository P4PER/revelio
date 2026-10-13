import {
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ThumbnailBuilder,
  type ActionRowBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { DeckFormat, LESSONS, artCropKey, attrLabel, clampDeckName, imageUrl } from '@revelio/core'
import { clampLabel } from '../../data/cards'
import { DECK_PAGE_SIZE, OWN_PAGE_SIZE, type OwnDeckPage, type PublicDeckPage } from '../../data/decks'
import { t } from '../../i18n/t'
import { decksUrl } from '../../links'
import { DECK_SORTS, encodeCustomId, type DeckBrowseState } from '../components/custom-id'
import { pagerRow } from './pager'
import { actionRow, container, linkButton, plain, text } from './parts'
import { ANY } from './search-view'

export type DeckBrowserOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // A line above the header, e.g. why the deck just picked did not open.
  notice?: string
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

// One deck row as both browsers draw it. author is null on /mydecks, where
// every deck is the caller's own.
type DeckRow = {
  name: string
  format: DeckFormat
  author: string | null
  isPrivate: boolean
  likeCount: number
  cardCount: number
  lessons: string[]
  starterCardId: string | null
  starterArtCropVersion: number | null
}

type FilterOption = { value: string; label: string }

// The order select has no "Any": there is always an order.
function select(
  kind: 'df' | 'ds' | 'dl',
  state: DeckBrowseState,
  placeholder: string,
  options: FilterOption[],
  current: string | null,
  withAny: boolean,
  locale: string,
): Row {
  return actionRow(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind, state }))
      .setPlaceholder(placeholder)
      .addOptions(
        // Never preselected, as on the card browser: an unset filter shows its
        // placeholder, which is the only label a message select has.
        ...(withAny ? [{ label: t(locale, 'browse.any'), value: ANY, default: false }] : []),
        ...options.map((o) => ({ label: clampLabel(o.label), value: o.value, default: o.value === current })),
      ),
  )
}

function deckRowText(row: DeckRow, locale: string): string {
  const line = [
    `**${plain(clampDeckName(row.name))}**`,
    row.author !== null ? `@${plain(row.author)}` : '',
    t(locale, `deck.format.${row.format}`),
  ].filter(Boolean).join(' · ')
  const title = row.isPrivate ? t(locale, 'decks.privateRow', { line }) : line
  const stats = [
    t(locale, 'decks.row.stats', { likes: row.likeCount, cards: row.cardCount }),
    row.lessons.map((code) => attrLabel('lessons', code, locale)).join(', '),
  ].filter(Boolean).join(' · ')
  return `${title}\n${stats}`
}

// The rows between two separators, each with its starter's art beside it.
function addDeckRows(view: ContainerBuilder, rows: DeckRow[], opts: DeckBrowserOptions): void {
  view.addSeparatorComponents(new SeparatorBuilder())
  for (const row of rows) {
    const content = deckRowText(row, opts.locale)
    if (row.starterCardId && row.starterArtCropVersion != null) {
      view.addSectionComponents(new SectionBuilder()
        .addTextDisplayComponents(text(content))
        .setThumbnailAccessory(new ThumbnailBuilder()
          .setURL(imageUrl(opts.imageBase, artCropKey(row.starterCardId, row.starterArtCropVersion)))
          .setDescription(clampDeckName(row.name))))
    } else {
      // A section must carry an accessory; no starter, no picture.
      view.addTextDisplayComponents(text(content))
    }
  }
  view.addSeparatorComponents(new SeparatorBuilder())
}

function header(page: PublicDeckPage, state: DeckBrowseState, locale: string): string {
  if (page.total === 0) return t(locale, 'decks.noResults')
  if (page.entries.length === 0) return t(locale, 'decks.pageEmpty')
  const head = state.query
    ? t(locale, 'decks.header.query', { query: plain(state.query), total: page.total })
    : t(locale, 'decks.header', { total: page.total })
  const parts = [
    state.format ? t(locale, `deck.format.${state.format}`) : '',
    state.lesson ? attrLabel('lessons', state.lesson, locale) : '',
    t(locale, `decks.sort.${state.sort}`),
  ].filter(Boolean)
  return `${head} · ${parts.join(' · ')}`
}

function openMenu(state: DeckBrowseState, options: { id: string; label: string }[], locale: string): Row {
  return actionRow(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: 'do', state }))
      .setPlaceholder(t(locale, 'decks.open.placeholder'))
      .addOptions(options.map((o) => ({ label: clampLabel(o.label), value: o.id }))),
  )
}

function pager(state: DeckBrowseState, page: number, pages: number, shown: number, pageSize: number, opts: DeckBrowserOptions, siteLink: boolean): Row {
  return pagerRow({
    locale: opts.locale,
    page,
    pages: Math.max(pages, page),
    hasNext: page < pages && shown === pageSize,
    prevId: encodeCustomId({ kind: 'd', state: { ...state, page: Math.max(1, page - 1) } }),
    nextId: encodeCustomId({ kind: 'd', state: { ...state, page: page + 1 } }),
    indicatorId: encodeCustomId({ kind: 'pg', of: 'decks' }),
    trailing: siteLink ? [linkButton(decksUrl(opts.siteBase, opts.locale, state), t(opts.locale, 'browse.site'))] : [],
  })
}

// /decks: header, up to five rows with the starter's art, an open menu,
// format, order and lesson menus, and the pager. 32 components at its fullest.
export function publicDecksView(page: PublicDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[] {
  const { locale } = opts
  const head = header(page, state, locale)
  const view = container().addTextDisplayComponents(text(opts.notice ? `${opts.notice}\n${head}` : head))
  if (page.entries.length) {
    addDeckRows(view, page.entries.map((e) => ({ ...e, isPrivate: false })), opts)
    view.addActionRowComponents(openMenu(state, page.entries.map((e) => ({ id: e.id, label: e.name })), locale))
  }
  view.addActionRowComponents(
    select('df', state, t(locale, 'decks.filter.format'),
      DeckFormat.options.map((f) => ({ value: f, label: t(locale, `deck.format.${f}`) })), state.format, true, locale),
    select('ds', state, t(locale, 'decks.filter.sort'),
      DECK_SORTS.map((s) => ({ value: s, label: t(locale, `decks.sort.${s}`) })), state.sort, false, locale),
    select('dl', state, t(locale, 'decks.filter.lesson'),
      LESSONS.map((l) => ({ value: l.code, label: attrLabel('lessons', l.code, locale) })), state.lesson, true, locale),
    pager(state, page.page, page.pages, page.entries.length, DECK_PAGE_SIZE, opts, true),
  )
  return [view]
}

// /mydecks: the caller's own decks drawn as /decks rows, private ones marked,
// an open menu and the pager. No filters: a user's own list is short.
export function ownDecksView(page: OwnDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container().addTextDisplayComponents(
    text([opts.notice, t(locale, 'decks.title', { count: page.total })].filter(Boolean).join('\n')),
  )
  // Decks deleted between the count and the page read can leave it empty,
  // and Discord rejects a select with no options.
  if (page.decks.length) {
    addDeckRows(view, page.decks.map((d) => ({ ...d, author: null, isPrivate: d.visibility === 'private' })), opts)
    view.addActionRowComponents(openMenu(state, page.decks.map((d) => ({ id: d.id, label: d.name })), locale))
  }
  view.addActionRowComponents(pager(state, page.page, page.pages, page.decks.length, OWN_PAGE_SIZE, opts, false))
  return [view]
}

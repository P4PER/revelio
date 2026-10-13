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
import type { PublicDeckEntry } from '@revelio/db'
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

function deckRowText(entry: PublicDeckEntry, locale: string): string {
  const title = `**${plain(clampDeckName(entry.name))}** · @${plain(entry.author)} · ${t(locale, `deck.format.${entry.format}`)}`
  const stats = [
    t(locale, 'decks.row.stats', { likes: entry.likeCount, cards: entry.cardCount }),
    entry.lessons.map((code) => attrLabel('lessons', code, locale)).join(', '),
  ].filter(Boolean).join(' · ')
  return `${title}\n${stats}`
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
    view.addSeparatorComponents(new SeparatorBuilder())
    for (const entry of page.entries) {
      const content = deckRowText(entry, locale)
      if (entry.starterCardId && entry.starterArtCropVersion != null) {
        view.addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(text(content))
          .setThumbnailAccessory(new ThumbnailBuilder()
            .setURL(imageUrl(opts.imageBase, artCropKey(entry.starterCardId, entry.starterArtCropVersion)))
            .setDescription(clampDeckName(entry.name))))
      } else {
        // A section must carry an accessory; no starter, no picture.
        view.addTextDisplayComponents(text(content))
      }
    }
    view.addSeparatorComponents(new SeparatorBuilder())
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

// /mydecks: the caller's own decks as text rows, private ones marked, an open
// menu and the pager. No filters: a user's own list is short.
export function ownDecksView(page: OwnDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[] {
  const { locale } = opts
  const lines = page.decks.map((d) => {
    const line = `**${plain(clampDeckName(d.name))}** · ${t(locale, `deck.format.${d.format}`)} · ${t(locale, 'decks.cards', { count: d.mainCount })}`
    return d.visibility === 'private' ? t(locale, 'decks.privateRow', { line }) : line
  })
  const view = container().addTextDisplayComponents(
    text([opts.notice, t(locale, 'decks.title', { count: page.total }), ...lines].filter(Boolean).join('\n')),
  )
  // Decks deleted between the count and the page read can leave it empty,
  // and Discord rejects a select with no options.
  if (page.decks.length) {
    view.addActionRowComponents(openMenu(state, page.decks.map((d) => ({ id: d.id, label: d.name })), locale))
  }
  view.addActionRowComponents(pager(state, page.page, page.pages, page.decks.length, OWN_PAGE_SIZE, opts, false))
  return [view]
}

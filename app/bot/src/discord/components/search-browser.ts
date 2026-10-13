import { LESSONS, TYPES } from '@revelio/core'
import {
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageComponentInteraction,
} from 'discord.js'
import type { Deps } from '../../clients'
import { loadCardDetail } from '../../data/card-detail'
import { findCardById, findCards, type CardPage } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { postTarget, refusal } from '../channel-post'
import { cardView } from '../v2/card-view'
import { searchView, ANY } from '../v2/search-view'
import { EPHEMERAL_V2, textEdit, textMessage, v2Edit, v2Message, type V2Edit } from '../v2/send'
import { sharePicker, shareView } from '../v2/share-view'
import {
  clampQuery,
  encodeCustomId,
  isCardKind,
  isEntityId,
  MAX_QUERY,
  type CardBrowseState,
  type CardKind,
  type CustomId,
} from './custom-id'
import type { ComponentHandler, ModalHandler } from './types'

type CardStateId = { kind: CardKind; state: CardBrowseState }

const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((ty) => ty.code)
// The search form's one text input.
const QUERY_FIELD = 'query'
const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPostCards' } as const

function isCardState(id: CustomId): id is CardStateId {
  return isCardKind(id.kind)
}

// The one select value a click carries, or null for "Any" and anything that is
// not a select click.
function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

// The one Meilisearch read behind every view of a page: the browser, the share
// picker and Post all draw from it, so they show the same cards.
async function pageOf(deps: Deps, state: CardBrowseState, locale: string): Promise<CardPage> {
  return findCards(deps.meili, {
    query: state.query,
    locale,
    page: state.page,
    filters: {
      ...(state.lesson ? { lesson: [state.lesson] } : {}),
      ...(state.type ? { types: [state.type] } : {}),
      ...(state.set ? { setCode: [state.set] } : {}),
    },
  })
}

// Every row of a page of n rows ticked.
function allRows(n: number): number {
  return (1 << n) - 1
}

// The browser for a page already read.
async function browserOf(
  deps: Deps,
  page: CardPage,
  state: CardBrowseState,
  locale: string,
  canPost: boolean,
): Promise<V2Edit> {
  return v2Edit(searchView(page, state, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    sets: await deps.sets.all(locale),
    canPost,
  }))
}

// Every browser click is on the caller's own private message: acknowledge
// without a visible change, then replace the message.
async function show(interaction: MessageComponentInteraction, deps: Deps, state: CardBrowseState): Promise<void> {
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderSearchBrowser(deps, state, locale, interaction.inGuild()))
}

function backButton(state: CardBrowseState, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cb', state }))
    .setLabel(t(locale, 'search.back')).setStyle(ButtonStyle.Secondary)
}

function postButton(cardId: string, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cp', cardId }))
    .setLabel(t(locale, 'search.post')).setStyle(ButtonStyle.Primary)
}

// Sends a finished message into the channel. The post is its own confirmation;
// a refusal Discord answered is told to the caller privately. Anything else (a
// timeout, a dropped socket) may have posted, so it is not retried but left to
// the router's error path.
async function sendToChannel(
  interaction: MessageComponentInteraction,
  send: () => Promise<unknown>,
  locale: string,
): Promise<void> {
  try {
    await send()
  } catch (err) {
    const refused = refusal(err)
    if (!refused) throw err
    await interaction.followUp({ ...textMessage(t(locale, REFUSAL_KEYS[refused])), flags: EPHEMERAL_V2 })
  }
}

// A filter value is client data: anything that is not a real lesson, type or
// set clears the filter rather than reaching the Meilisearch query.
const filterLesson: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const lesson = value && LESSON_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, lesson, page: 1 })
}

const filterType: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const type = value && TYPE_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, type, page: 1 })
}

// Acknowledged before the set list is read: a cold cache is a Postgres query,
// which must not run inside Discord's 3 second budget.
const filterSet: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  const value = picked(interaction)
  const sets = await deps.sets.all(locale)
  const set = value && sets.some((s) => s.code === value) ? value : null
  await interaction.editReply(
    await renderSearchBrowser(deps, { ...id.state, set, page: 1 }, locale, interaction.inGuild()),
  )
}

// A page turn, and Back from a card: the state in the id is the whole view.
const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

const openCard: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const cardId = picked(interaction)
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const doc = cardId && isEntityId(cardId) ? await findCardById(deps.meili, cardId, locale) : null
  if (!doc) {
    // Gone since the page was drawn, or not an id at all: the results again.
    await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    actions: [
      backButton(id.state, locale),
      ...(interaction.inGuild() ? [postButton(doc.id, locale)] : []),
    ],
  })))
}

// The private card view stays where it is; the channel gets its own copy with
// a "shared by" line.
const postCard: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'cp') return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, REFUSAL_KEYS[target.kind])), flags: EPHEMERAL_V2 })
    return
  }
  await interaction.deferUpdate()
  const doc = await findCardById(deps.meili, id.cardId, locale)
  if (!doc) {
    await interaction.followUp({ ...textMessage(t(locale, 'card.gone')), flags: EPHEMERAL_V2 })
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  const message = v2Message(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    // Never pings: the client's allowedMentions parses none.
    lead: t(locale, 'post.sharedCard', { user: `<@${interaction.user.id}>` }),
  }))
  await sendToChannel(interaction, () => target.channel.send(message), locale)
}

const share: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const page = await pageOf(deps, id.state, locale)
  await interaction.editReply(page.hits.length
    ? v2Edit(sharePicker(page.hits, id.state, allRows(page.hits.length), locale))
    : await browserOf(deps, page, id.state, locale, interaction.inGuild()))
}

// A new selection only redraws the picker, with the ticked rows as Post's mask.
// The values are client data: only ids of cards on this page count, and an
// empty result falls back to every row rather than to an unpostable picker.
const pickShared: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  const values = interaction.isStringSelectMenu() ? interaction.values : []
  await interaction.deferUpdate()
  const page = await pageOf(deps, id.state, locale)
  if (!page.hits.length) {
    await interaction.editReply(await browserOf(deps, page, id.state, locale, interaction.inGuild()))
    return
  }
  const mask = page.hits.reduce((bits, hit, i) => (values.includes(hit.id) ? bits | (1 << i) : bits), 0)
  await interaction.editReply(v2Edit(sharePicker(page.hits, id.state, mask || allRows(page.hits.length), locale)))
}

// Post re-reads the page and takes the rows in the mask, so the channel gets
// them in the order the caller saw, and redraws the browser from that same
// read. A page that shrank past every ticked row offers the picker again
// rather than posting nothing silently; one that shifted only changes which
// public cards go, and nothing in the mask can reach a query.
const postShared: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'sx') return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, REFUSAL_KEYS[target.kind])), flags: EPHEMERAL_V2 })
    return
  }
  await interaction.deferUpdate()
  const page = await pageOf(deps, id.state, locale)
  const chosen = page.hits.filter((_, i) => ((id.mask >> i) & 1) === 1)
  if (!chosen.length && page.hits.length) {
    await interaction.editReply(v2Edit(sharePicker(page.hits, id.state, allRows(page.hits.length), locale)))
    return
  }
  if (chosen.length) {
    const message = v2Message(shareView(chosen, id.state, {
      locale,
      imageBase: deps.env.IMAGE_BASE_URL,
      siteBase: deps.env.SITE_BASE_URL,
      sharerId: interaction.user.id,
    }))
    await sendToChannel(interaction, () => target.channel.send(message), locale)
  }
  await interaction.editReply(await browserOf(deps, page, id.state, locale, interaction.inGuild()))
}

// On the public list: answered privately, in the clicker's own language, and
// never by touching the list itself (see components/index.ts).
const viewShared: ComponentHandler = async (interaction, _id, deps) => {
  const cardId = picked(interaction)
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const doc = cardId && isEntityId(cardId) ? await findCardById(deps.meili, cardId, locale) : null
  if (!doc) {
    await interaction.editReply(textEdit(t(locale, 'card.gone')))
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
  })))
}

// The form a message cannot hold: one text input, prefilled with the query.
// Showing a modal is the click's acknowledgement, so nothing is deferred.
const openSearchForm: ComponentHandler = async (interaction, id) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  const input = new TextInputBuilder()
    .setCustomId(QUERY_FIELD)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(MAX_QUERY)
  // Discord rejects an empty prefill, so a search without a query leaves it unset.
  if (id.state.query) input.setValue(id.state.query)
  await interaction.showModal(new ModalBuilder()
    .setCustomId(encodeCustomId({ kind: 'sm', state: id.state }))
    .setTitle(t(locale, 'search.modal.title'))
    .addLabelComponents(new LabelBuilder().setLabel(t(locale, 'search.modal.label')).setTextInputComponent(input)))
}

// The submitted form redraws the browser it came from, filters kept, page 1.
const submitSearch: ModalHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const query = clampQuery(interaction.fields.getTextInputValue(QUERY_FIELD))
  await interaction.editReply(
    await renderSearchBrowser(deps, { ...id.state, query, page: 1 }, locale, interaction.inGuild()),
  )
}

export const SEARCH_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['s', navigate],
  ['sl', filterLesson],
  ['st', filterType],
  ['ss', filterSet],
  ['co', openCard],
  ['cb', navigate],
  ['cp', postCard],
  ['sh', share],
  ['sp', pickShared],
  ['sx', postShared],
  ['pk', viewShared],
  ['sq', openSearchForm],
]

export const SEARCH_MODALS: readonly (readonly [CustomId['kind'], ModalHandler])[] = [
  ['sm', submitSearch],
]

// One page of the private browser, for /search and every click that redraws it.
export async function renderSearchBrowser(
  deps: Deps,
  state: CardBrowseState,
  locale: string,
  canPost: boolean,
): Promise<V2Edit> {
  return browserOf(deps, await pageOf(deps, state, locale), state, locale, canPost)
}

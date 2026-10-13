import { LESSONS, TYPES } from '@revelio/core'
import {
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  MessageFlags,
  type MessageComponentInteraction,
} from 'discord.js'
import type { Deps } from '../../clients'
import { loadCardDetail } from '../../data/card-detail'
import { findCardById, findCards } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { postTarget, refusal } from '../channel-post'
import { cardView } from '../v2/card-view'
import { searchView, ANY } from '../v2/search-view'
import { EPHEMERAL_V2, textEdit, textMessage, v2Edit, v2Message, type V2Edit } from '../v2/send'
import { sharePicker, shareView } from '../v2/share-view'
import {
  encodeCustomId,
  isEntityId,
  type CardBrowseState,
  type CardKind,
  type CustomId,
} from './custom-id'
import type { ComponentHandler } from './types'

type CardStateId = { kind: CardKind; state: CardBrowseState }

const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((ty) => ty.code)
const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPostCards' } as const

export function isCardState(id: CustomId): id is CardStateId {
  return 'state' in id && !('scope' in id.state)
}

// The one select value a click carries, or null for "Any" and anything that is
// not a select click.
function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

// Share and the picker share one read of the page, so the picker offers exactly
// the cards the caller was looking at.
async function pageOf(deps: Deps, state: CardBrowseState, locale: string) {
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

export async function renderSearchBrowser(
  deps: Deps,
  state: CardBrowseState,
  locale: string,
  canPost: boolean,
): Promise<V2Edit> {
  const [page, sets] = await Promise.all([pageOf(deps, state, locale), deps.sets.all(locale)])
  return v2Edit(searchView(page, state, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    sets,
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

// A filter value is client data: anything that is not a real lesson, type or
// set clears the filter rather than reaching the Meilisearch query.
const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

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

export function postRefusalKey(kind: 'unreachable' | 'forbidden'): string {
  return REFUSAL_KEYS[kind]
}

function backButton(state: CardBrowseState, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cb', state }))
    .setLabel(t(locale, 'search.back')).setStyle(ButtonStyle.Secondary)
}

function postButton(cardId: string, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cp', cardId }))
    .setLabel(t(locale, 'search.post')).setStyle(ButtonStyle.Primary)
}

// Sends a finished message into the channel. A refusal Discord answered is
// told to the caller privately; anything else (a timeout, a dropped socket)
// may have posted, so it is not retried but left to the router's error path.
async function sendToChannel(
  interaction: MessageComponentInteraction,
  send: () => Promise<unknown>,
  locale: string,
): Promise<boolean> {
  try {
    await send()
    return true
  } catch (err) {
    const refused = refusal(err)
    if (!refused || !(err instanceof DiscordAPIError)) throw err
    await interaction.followUp({ ...textMessage(t(locale, postRefusalKey(refused))), flags: EPHEMERAL_V2 })
    return false
  }
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

const backToResults: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

// The private card view stays where it is; the channel gets its own copy with
// a "shared by" line, and the caller a private "posted".
const postCard: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'cp') return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, postRefusalKey(target.kind))), flags: EPHEMERAL_V2 })
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
  if (await sendToChannel(interaction, () => target.channel.send(message), locale)) {
    await interaction.followUp({ ...textMessage(t(locale, 'post.done')), flags: EPHEMERAL_V2 })
  }
}

const share: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const page = await pageOf(deps, id.state, locale)
  if (!page.hits.length) {
    await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
    return
  }
  await interaction.editReply(v2Edit(sharePicker(page.hits, id.state, locale)))
}

// The picked cards are read again by id: the values are client data, so an
// invalid one is dropped before the query and a card gone since simply drops
// out of the result.
const sharePicked: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, postRefusalKey(target.kind))), flags: EPHEMERAL_V2 })
    return
  }
  const ids = interaction.isStringSelectMenu() ? interaction.values.filter(isEntityId) : []
  await interaction.deferUpdate()
  const chosen = ids.length
    ? await findCards(deps.meili, { query: '', locale, filters: { ids }, pageSize: ids.length })
    : null
  if (chosen?.hits.length) {
    const message = v2Message(shareView(chosen.hits, id.state, {
      locale,
      imageBase: deps.env.IMAGE_BASE_URL,
      siteBase: deps.env.SITE_BASE_URL,
      sharerId: interaction.user.id,
    }))
    if (await sendToChannel(interaction, () => target.channel.send(message), locale)) {
      await interaction.followUp({ ...textMessage(t(locale, 'post.done')), flags: EPHEMERAL_V2 })
    }
  }
  await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
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

export const SEARCH_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['s', navigate],
  ['sl', filterLesson],
  ['st', filterType],
  ['ss', filterSet],
  ['co', openCard],
  ['cb', backToResults],
  ['cp', postCard],
  ['sh', share],
  ['sp', sharePicked],
  ['pk', viewShared],
]

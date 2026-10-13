import { ButtonBuilder, ButtonStyle, type MessageComponentInteraction } from 'discord.js'
import { DeckFormat } from '@revelio/core'
import { getDeckAccess } from '@revelio/db'
import type { Deps } from '../../clients'
import { browsePublicDecks, getDeckView, pageOwnDecks } from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { newDeckUrl, settingsUrl } from '../../links'
import { postTarget, sendToChannel } from '../channel-post'
import { deliverDeck } from '../deck-delivery'
import { ownDecksView, publicDecksView } from '../v2/deck-browser-view'
import { ANY } from '../v2/search-view'
import { ephemeralText, textEdit, v2Edit, v2Message, type V2Edit } from '../v2/send'
import {
  DECK_SORTS,
  encodeCustomId,
  isEntityId,
  LESSON_CODES,
  type CustomId,
  type DeckBrowseState,
  type DeckKind,
} from './custom-id'
import type { ComponentHandler } from './types'

type DeckStateId = { kind: DeckKind; state: DeckBrowseState }

const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPost' } as const

function isDeckState(id: CustomId): id is DeckStateId {
  return 'state' in id && 'scope' in id.state
}

function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

async function show(interaction: MessageComponentInteraction, deps: Deps, state: DeckBrowseState): Promise<void> {
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderDeckBrowser(deps, state, locale, interaction.user.id))
}

// The viewer a deck is read as on a click: the clicker's own account when the
// deck is theirs and private, nobody otherwise. Null when the clicker may not
// see it at all - deleted, someone else's private deck, or a tampered id.
async function readAs(deps: Deps, interaction: MessageComponentInteraction, deckId: string) {
  if (!isEntityId(deckId)) return null
  const viewer = await resolveLinkedUser(deps.db, interaction.user.id)
  const access = await getDeckAccess(deps.db, deckId, viewer)
  if (!access) return null
  return { loadAs: access.access === 'own-private' ? viewer : null }
}

const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  await show(interaction, deps, id.state)
}

const filterFormat: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const parsed = DeckFormat.safeParse(picked(interaction))
  await show(interaction, deps, { ...id.state, format: parsed.success ? parsed.data : null, page: 1 })
}

const filterSort: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const value = picked(interaction)
  const sort = DECK_SORTS.find((s) => s === value) ?? id.state.sort
  await show(interaction, deps, { ...id.state, sort, page: 1 })
}

const filterLesson: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const value = picked(interaction)
  await show(interaction, deps, { ...id.state, lesson: value && LESSON_CODES.includes(value) ? value : null, page: 1 })
}

// A deck the clicker can no longer open (made private, deleted, or gone
// between the access check and the read) redraws the browser in place, which
// drops it from the menu, under a line saying so.
const openDeck: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  const deckId = picked(interaction) ?? ''
  const reader = await readAs(deps, interaction, deckId)
  const deck = reader && await getDeckView(deps.db, deckId, reader.loadAs)
  if (!deck) {
    await interaction.editReply(
      await renderDeckBrowser(deps, id.state, locale, interaction.user.id, t(locale, 'deck.notFound')),
    )
    return
  }
  const actions = [
    new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'd', state: id.state }))
      .setLabel(t(locale, 'deck.back')).setStyle(ButtonStyle.Secondary),
    ...(interaction.inGuild()
      ? [new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'dp', deckId: deck.id }))
          .setLabel(t(locale, 'deck.post')).setStyle(ButtonStyle.Primary)]
      : []),
  ]
  await deliverDeck((c, f) => interaction.editReply(v2Edit(c, f)), deck, deps, locale, {
    audience: 'caller', sendEdits: true, listOnly: false, actions,
  })
}

// Pressing Post on your own private deck is the owner's explicit say-so, the
// same consent /deck's prompt asks for with "Post publicly". Anyone else's
// private deck reads as not found. The post is its own confirmation; only a
// refusal or a failure is answered privately.
const postDeck: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'dp') return
  const locale = toRevelioLocale(interaction.locale)
  const reader = await readAs(deps, interaction, id.deckId)
  if (!reader) {
    await interaction.reply(ephemeralText(t(locale, 'deck.notFound')))
    return
  }
  const target = postTarget(interaction, { needsFiles: true })
  if (target.kind !== 'ok') {
    await interaction.reply(ephemeralText(t(locale, REFUSAL_KEYS[target.kind])))
    return
  }
  await interaction.deferUpdate()
  const deck = await getDeckView(deps.db, id.deckId, reader.loadAs)
  if (!deck) {
    await interaction.followUp(ephemeralText(t(locale, 'deck.notFound')))
    return
  }
  await target.channel.sendTyping().catch(() => {})
  await sendToChannel(interaction, () => deliverDeck((c, f) => target.channel.send(v2Message(c, f)), deck, deps, locale, {
    audience: 'channel',
    sendEdits: false,
    listOnly: false,
    lead: t(locale, 'post.sharedDeck', { user: `<@${interaction.user.id}>` }),
  }), locale, REFUSAL_KEYS)
}

export const DECK_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['d', navigate],
  ['df', filterFormat],
  ['ds', filterSort],
  ['dl', filterLesson],
  ['do', openDeck],
  ['dp', postDeck],
]

// Resolved on every click, not carried in the id: resolveLinkedUser is where a
// ban or an unlink is enforced, and either can land while a browser is open.
export async function renderDeckBrowser(
  deps: Deps,
  state: DeckBrowseState,
  locale: string,
  discordUserId: string,
  notice?: string,
): Promise<V2Edit> {
  const opts = { locale, imageBase: deps.env.IMAGE_BASE_URL, siteBase: deps.env.SITE_BASE_URL, notice }
  if (state.scope === 'public') {
    return v2Edit(publicDecksView(await browsePublicDecks(deps.db, state), state, opts))
  }
  const userId = await resolveLinkedUser(deps.db, discordUserId)
  if (!userId) return textEdit(t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }))
  const page = await pageOwnDecks(deps.db, userId, state.page)
  if (page.total === 0) return textEdit(t(locale, 'decks.empty', { url: newDeckUrl(deps.env.SITE_BASE_URL, locale) }))
  return v2Edit(ownDecksView(page, { ...state, page: page.page }, opts))
}

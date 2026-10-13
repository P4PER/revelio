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
import { ephemeralText, textEdit, v2Edit, v2Message, type V2Edit } from '../v2/send'
import {
  decodeCustomId,
  DECK_SORTS,
  encodeCustomId,
  isEntityId,
  LESSON_CODES,
  type CustomId,
  type DeckBrowseState,
  type DeckKind,
} from './custom-id'
import { picked } from './select'
import type { ComponentHandler } from './types'

type DeckStateId = { kind: DeckKind; state: DeckBrowseState }

// A received component as its JSON: only what openedFrom walks.
type ComponentJson = { custom_id?: string; components?: ComponentJson[]; accessory?: ComponentJson }

const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPost' } as const

function isDeckState(id: CustomId): id is DeckStateId {
  return 'state' in id && 'scope' in id.state
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

// The browser page a deck view was opened from, read off its Back button.
// Client data like any id: decodeCustomId validates it, and it only chooses
// which page of the caller's own browser is drawn.
function openedFrom(interaction: MessageComponentInteraction): DeckBrowseState | null {
  const queue = [...((interaction.message.components ?? []) as unknown[])].map((c) => {
    const encodable = c as { toJSON?: () => ComponentJson }
    return typeof encodable.toJSON === 'function' ? encodable.toJSON() : (c as ComponentJson)
  })
  for (let node = queue.shift(); node; node = queue.shift()) {
    const id = node.custom_id ? decodeCustomId(node.custom_id) : null
    if (id?.kind === 'd') return id.state
    queue.push(...(node.components ?? []), ...(node.accessory ? [node.accessory] : []))
  }
  return null
}

// The deck view behind Open, with Back and (in a guild) Post.
async function showDeck(
  interaction: MessageComponentInteraction,
  state: DeckBrowseState,
  deps: Deps,
  locale: string,
  back: (notice: string) => Promise<V2Edit>,
): Promise<void> {
  const deckId = picked(interaction) ?? ''
  const reader = await readAs(deps, interaction, deckId)
  const deck = reader && await getDeckView(deps.db, deckId, reader.loadAs)
  if (!deck) {
    await interaction.editReply(await back(t(locale, 'deck.notFound')))
    return
  }
  const actions = [
    new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'd', state }))
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

// The click is answered with a loading line at once, as /deck's "Only show
// me" is: the sheet render can take seconds, and a browser that stays put
// looks as if the click did nothing. A deck the clicker can no longer open
// (made private, deleted, or gone between the access check and the read)
// redraws the browser in place, which drops it from the menu, under a line
// saying so; so does a failure, since the loading line has already replaced
// the browser and a bare error would lose its page and filters.
const openDeck: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  await interaction.update(textEdit(t(locale, 'deck.loading')))
  const back = (notice: string) => renderDeckBrowser(deps, id.state, locale, interaction.user.id, notice)
  try {
    await showDeck(interaction, id.state, deps, locale, back)
  } catch (err) {
    console.error(`deck open failed (${interaction.id}):`, err)
    await interaction.editReply(await back(t(locale, 'error.generic')))
  }
}

// Pressing Post on your own private deck is the owner's explicit say-so, the
// same consent /deck's prompt asks for with "Post publicly". Anyone else's
// private deck reads as not found. The post is its own confirmation; only a
// refusal or a failure is answered privately. postTarget reads only what
// Discord sent with the click, so its refusal goes out before the
// acknowledgement; the reads come after it, outside the 3 second budget.
const postDeck: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'dp') return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: true })
  if (target.kind !== 'ok') {
    await interaction.reply(ephemeralText(t(locale, REFUSAL_KEYS[target.kind])))
    return
  }
  await interaction.deferUpdate()
  // Past deferUpdate the router would answer with editReply, replacing the
  // deck view the post came from, so every failure is answered here.
  let posted = false
  try {
    const reader = await readAs(deps, interaction, id.deckId)
    const deck = reader && await getDeckView(deps.db, id.deckId, reader.loadAs)
    if (!deck) {
      await interaction.followUp(ephemeralText(t(locale, 'deck.notFound')))
      return
    }
    await target.channel.sendTyping().catch(() => {})
    posted = await sendToChannel(interaction, () => deliverDeck((c, f) => target.channel.send(v2Message(c, f)), deck, deps, locale, {
      audience: 'channel',
      sendEdits: false,
      listOnly: false,
      lead: t(locale, 'post.sharedDeck', { user: `<@${interaction.user.id}>` }),
    }), locale, REFUSAL_KEYS)
  } catch (err) {
    console.error(`deck post failed (${interaction.id}):`, err)
    await interaction.followUp(ephemeralText(t(locale, 'error.generic')))
    return
  }
  // The channel shows the deck now; the private copy would only repeat it.
  // The deck is out, so a failed redraw only leaves that copy in place: an
  // error line here would invite a second post.
  const from = posted ? openedFrom(interaction) : null
  if (!from) return
  try {
    await interaction.editReply(await renderDeckBrowser(deps, from, locale, interaction.user.id))
  } catch (err) {
    console.error(`deck browser redraw failed (${interaction.id}):`, err)
  }
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

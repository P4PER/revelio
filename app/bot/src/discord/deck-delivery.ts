import {
  AttachmentBuilder,
  DiscordAPIError,
  type ButtonBuilder,
  type ContainerBuilder,
} from 'discord.js'
import type { Deps } from '../clients'
import type { DeckView } from '../data/decks'
import { requestDeckSheet } from '../data/sheet'
import { deckView } from './v2/deck-view'

// Whichever call puts the deck where it belongs: an edit of the bot's own
// reply, or a plain message in the channel. The caller wraps it in v2Edit or
// v2Message, the two shapes those calls take.
export type SendDeck = (components: ContainerBuilder[], files: AttachmentBuilder[]) => Promise<unknown>

export type DeliveryOptions = {
  // Who reads the message: decides whether a private deck's page is linked.
  audience: 'channel' | 'caller'
  // True when `send` edits a message, which can always be retried as the list;
  // false for a new message, which may only be retried after a rejection
  // Discord answered.
  sendEdits: boolean
  listOnly: boolean
  lead?: string
  actions?: ButtonBuilder[]
}

// A deck with no cards has no picture worth posting, and a sheet that cannot
// be had must not cost the answer: both fall back to the list the view can
// always draw from the data already in hand. The bot draws nothing itself -
// @revelio/sheet is the only process that paints a deck.
export async function deliverDeck(
  send: SendDeck,
  deck: DeckView,
  deps: Deps,
  locale: string,
  opts: DeliveryOptions,
): Promise<void> {
  // Only the owner can open a private deck's page, so a channel never gets a
  // link to one; the caller alone may be that owner.
  const base = {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    linkPage: opts.audience === 'caller' || deck.visibility === 'public',
    lead: opts.lead,
    actions: opts.actions,
  }
  if (!opts.listOnly && deck.entries.length > 0) {
    const sheet = await requestDeckSheet(deck, locale, deps.env).catch((err: unknown) => {
      console.error('deck sheet render failed:', err)
      return null
    })
    if (sheet) {
      try {
        await send(
          deckView(deck, { ...base, imageName: sheet.name }),
          [new AttachmentBuilder(sheet.body, { name: sheet.name })],
        )
        return
      } catch (err) {
        // Discord can reject the upload itself (an attachment it will not
        // take), which must cost the picture rather than the answer. An edit
        // of the bot's own message can always be retried as the list. A new
        // message only after a rejection Discord answered, which proves
        // nothing was posted: a timeout or a dropped socket may have reached
        // the channel, and a retry could then post the deck twice.
        if (!opts.sendEdits && !(err instanceof DiscordAPIError)) throw err
        console.error('deck sheet upload failed:', err)
      }
    }
  }
  await send(deckView(deck, base), [])
}

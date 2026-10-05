import { SHEET_LOCALES, pickSheetEntries, type DeckSheetRequest } from '@revelio/core'
import type { BotEnv } from '../env'
import type { PublicDeck } from './decks'

// The rendered sheet and the file name it has to be uploaded under. Discord
// sniffs the content, but media.discordapp.net keys its transcoding off the
// extension, so a WebP served as .png can come back broken in the embed even
// though the attachment downloads fine. The embed can only reference an
// attachment by name, so the name travels with the bytes.
export type DeckSheet = { body: Buffer; name: string }

// Discord rejects an attachment over 10 MB in a non-boosted guild and fails the
// whole interaction with it. The service derives its pixel budget from this
// rather than owning a cap of its own.
const MAX_ATTACHMENT_BYTES = 9_000_000
// The reply is already deferred, which buys 15 minutes, so this is generous on
// purpose: the service queues one render at a time and a cold large deck is a
// few seconds. It exists so a hung socket cannot hold the interaction forever.
const REQUEST_TIMEOUT_MS = 75_000

// The sheet renders en and de. A Discord locale outside that set reaches here as
// whatever toRevelioLocale made of it, and a 400 from the service would cost the
// picture for no reason.
function sheetLocale(locale: string): DeckSheetRequest['locale'] {
  return (SHEET_LOCALES as readonly string[]).includes(locale) ? (locale as DeckSheetRequest['locale']) : 'en'
}

/**
 * The deck sheet for one deck, drawn by @revelio/sheet. Throws on anything but a
 * 200 - an unreachable service, a 503 from a full render queue, a failed render
 * - because /deck answers a throw with the list embed it can always draw from
 * data already in hand.
 */
export async function requestDeckSheet(deck: PublicDeck, locale: string, env: BotEnv): Promise<DeckSheet> {
  const body: DeckSheetRequest = {
    locale: sheetLocale(locale),
    maxBytes: MAX_ATTACHMENT_BYTES,
    deck: { name: deck.name, format: deck.format },
    entries: pickSheetEntries(deck.entries),
  }
  const res = await fetch(`${env.SHEET_SERVICE_URL.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SHEET_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // A service-to-service POST has nowhere legitimate to be redirected to, and
    // following one would spend the render budget on whatever answered.
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`sheet service answered ${res.status}`)
  // Everything below is the envelope, which is not the service's own contract
  // once SHEET_SERVICE_URL can point anywhere: a 200 that is not an image would
  // otherwise be uploaded and shown as a broken picture, where a throw gets the
  // list embed instead.
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (!type.startsWith('image/')) throw new Error(`sheet service answered a non-image body: ${type || 'no content type'}`)
  // Checked before the body is read, because arrayBuffer() buffers all of it
  // into the gateway's heap and the abort above bounds duration, not bytes.
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > MAX_ATTACHMENT_BYTES) throw new Error(`sheet service answered a body too large: ${declared}`)
  return { body: Buffer.from(await res.arrayBuffer()), name: type.startsWith('image/webp') ? 'deck.webp' : 'deck.png' }
}

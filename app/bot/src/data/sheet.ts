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
 * The response body, read a chunk at a time and abandoned past `limit`.
 *
 * content-length is an early exit, not the bound: it is absent on a chunked
 * answer - which a proxy in front of the service can produce at any time, and
 * demanding one would cost every deck its picture - and Headers.get joins
 * duplicates with ', ', which Number() reads as NaN. Both compare false against
 * a ceiling, so a check on the header alone would let arrayBuffer() pull an
 * unbounded body into the gateway's heap, on a pod this phase takes to 256Mi.
 */
async function readBounded(res: Response, limit: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw new Error(`sheet service answered a body too large: ${declared}`)
  if (!res.body) throw new Error('sheet service answered an empty body')
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    // Throwing out of the loop is what cancels the stream: an abrupt exit calls
    // the async iterator's return(), which cancels unless preventCancel was set.
    // Cancelling by hand here instead fails - the iterator holds the lock.
    if (total > limit) throw new Error(`sheet service answered a body too large: over ${limit}`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
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
  // Bounded while it is read: the abort above bounds duration, not bytes.
  const bytes = await readBounded(res, MAX_ATTACHMENT_BYTES)
  return { body: bytes, name: type.startsWith('image/webp') ? 'deck.webp' : 'deck.png' }
}

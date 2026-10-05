import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import {
  DeckFormat, DeckSheetRequest, DeckZone, MAX_SHEET_ENTRIES, SHEET_FIELD_LIMITS, SHEET_LOCALES,
  pickSheetEntries, type DeckSheetEntry,
} from '@revelio/core'
import { getCardViews } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { clientIp, consumeSheetRateLimit } from '@/lib/server/rate-limit'
import { renderDeckSheet } from '@/lib/server/sheet'

// sharp lives on the other side of an HTTP call, but the handler still reads
// Postgres and streams a Buffer, so it is not an edge route.
export const runtime = 'nodejs'

/**
 * What the browser is allowed to say. The deck's own title, then card ids, zones
 * and quantities only: every field of a card that reaches a pixel - its name,
 * types, image version and orientation - is resolved here from the database. A
 * client-supplied card name would let anyone have the render service draw
 * arbitrary text and serve it from this origin.
 *
 * The title is not length-checked here on purpose: the builder's name field has
 * no maxLength, so a limit the service does not share would fail that deck's
 * export forever. The body cap bounds it; the handler clamps it to what the
 * service carries.
 */
const SheetBody = z.object({
  name: z.string(),
  format: DeckFormat,
  locale: z.enum(SHEET_LOCALES),
  cards: z.array(z.object({
    cardId: z.string().min(1).max(120),
    zone: DeckZone,
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(MAX_SHEET_ENTRIES),
})

// The service's own check on the title, so the route can tell a name it would
// refuse before sending one.
const PaintedDeckName = DeckSheetRequest.shape.deck.shape.name

// A legal body is at most ~70 KB: MAX_SHEET_ENTRIES entries of an id, a zone and
// a quantity, plus the title. The route needs no session, and req.json() would
// otherwise buffer and parse whatever an anonymous caller sends - nothing in
// front of a route handler bounds it (proxy.ts, the one place Next caps a body,
// excludes /api).
const MAX_BODY_BYTES = 128 * 1024

/** The body as text, or null once it is past `limit` - declared or as read. */
async function readBoundedText(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!req.body) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    // Returning out of the loop cancels the stream: an abrupt exit calls the
    // async iterator's return(), which releases and cancels the reader.
    if (total > limit) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function POST(req: Request): Promise<Response> {
  if (!(await consumeSheetRateLimit(clientIp(req.headers)))) {
    return new Response('too many requests', { status: 429 })
  }

  const text = await readBoundedText(req, MAX_BODY_BYTES)
  if (text === null) return new Response('payload too large', { status: 413 })
  let payload: unknown = null
  try { payload = JSON.parse(text) } catch { /* answered as a 400 below */ }
  const parsed = SheetBody.safeParse(payload)
  if (!parsed.success) return new Response('bad request', { status: 400 })
  const { format, locale, cards } = parsed.data

  // Clamped to what the service carries, and, when nothing paintable is left
  // (a name of control characters, say), the same untitled name the builder
  // shows - rather than a request the service is bound to refuse.
  const painted = PaintedDeckName.safeParse(parsed.data.name.slice(0, SHEET_FIELD_LIMITS.nameInput))
  const name = painted.success
    ? painted.data
    : (await getTranslations({ locale, namespace: 'decks' }))('namePlaceholder')

  // One lookup for the distinct ids; a card can sit in two zones.
  const metaById = await getCardViews(getDb(), [...new Set(cards.map((c) => c.cardId))])
  const views: DeckSheetEntry[] = cards.flatMap((c) => {
    const meta = metaById[c.cardId]
    // An id with no card is simply dropped, the way deck import treats one: it
    // cannot be painted and it must not fail the other 59 cards.
    return meta ? [{ ...meta, zone: c.zone, quantity: c.quantity }] : []
  })
  if (views.length === 0) return new Response('no renderable cards', { status: 400 })

  try {
    const sheet = await renderDeckSheet({
      locale,
      deck: { name, format },
      entries: pickSheetEntries(views),
    })
    return new Response(new Uint8Array(sheet.body), {
      status: 200,
      headers: {
        'content-type': sheet.contentType,
        'content-length': String(sheet.body.length),
        // The sheet is a download, not a page asset, and a private deck's
        // picture must not sit in a shared cache.
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    // The service being down, full or slow is not this app's fault and not the
    // user's: the menu shows its error toast and the other exports still work.
    console.error('deck sheet render failed:', err instanceof Error ? err.message : err)
    return new Response('sheet service unavailable', { status: 502 })
  }
}

import { z } from 'zod'
import {
  DeckFormat, DeckZone, MAX_SHEET_ENTRIES, SHEET_LOCALES, pickSheetEntries,
  type DeckSheetEntry,
} from '@revelio/core'
import { getCardViews } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { clientIp, consumeSheetRateLimit } from '@/lib/server/rate-limit'
import { renderDeckSheet } from '@/lib/server/sheet'

// sharp lives on the other side of an HTTP call, but the handler still reads
// Postgres and streams a Buffer, so it is not an edge route.
export const runtime = 'nodejs'

/**
 * What the browser is allowed to say. Card ids, zones and quantities only: every
 * field that reaches a pixel - the name, the types, the image version, the
 * orientation - is resolved here from the database. A client-supplied name would
 * let anyone have the render service draw arbitrary text and serve it from this
 * origin.
 */
const SheetBody = z.object({
  name: z.string().min(1).max(300),
  format: DeckFormat,
  locale: z.enum(SHEET_LOCALES),
  cards: z.array(z.object({
    cardId: z.string().min(1).max(120),
    zone: DeckZone,
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(MAX_SHEET_ENTRIES),
})

export async function POST(req: Request): Promise<Response> {
  if (!(await consumeSheetRateLimit(clientIp(req.headers)))) {
    return new Response('too many requests', { status: 429 })
  }

  const payload = await req.json().catch(() => null)
  const parsed = SheetBody.safeParse(payload)
  if (!parsed.success) return new Response('bad request', { status: 400 })
  const { name, format, locale, cards } = parsed.data

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

import 'server-only'
import type { DeckSheetRequest } from '@revelio/core'

export type RenderedSheet = { body: Buffer; contentType: string }

// The export is a deliberate click, not a page render, so it can wait - but not
// forever: past this the user gets the error toast instead of a spinner that
// never resolves. The service queues one render at a time, so a queued request
// spends part of this waiting its turn.
const SHEET_TIMEOUT_MS = 30_000

// What the service draws. The route serves the bytes from web's own origin with
// the type they came with, so anything else - a misconfigured URL answering an
// HTML page, say - is refused here rather than passed through.
const SHEET_TYPES = new Set(['image/png', 'image/webp'])

/**
 * The deck sheet as drawn by @revelio/sheet. Server-only: the token must never
 * reach a browser, and the service has no public ingress to reach from one.
 *
 * No byte ceiling is sent. Discord's attachment limit is the bot's constraint,
 * not a download's, so the service renders at its full pixel cap here - which
 * is what keeps the exported PNG as crisp as the old canvas one.
 */
export async function renderDeckSheet(req: DeckSheetRequest): Promise<RenderedSheet> {
  const base = process.env.SHEET_SERVICE_URL
  const token = process.env.SHEET_TOKEN
  if (!base || !token) throw new Error('SHEET_SERVICE_URL and SHEET_TOKEN are required to render a deck sheet')

  const res = await fetch(`${base.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
    cache: 'no-store',
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`sheet service answered ${res.status}`)
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!SHEET_TYPES.has(contentType)) throw new Error(`sheet service answered ${contentType || 'no content type'}`)
  return { body: Buffer.from(await res.arrayBuffer()), contentType }
}

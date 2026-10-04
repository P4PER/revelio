import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { DeckSheetRequest } from '@revelio/core'
import type { SheetEnv } from './env'
import { renderSheet } from './render'

// Enough for 400 entries of a few hundred bytes each, with room to spare, and
// small enough that a hostile body is read in one go and dropped.
export const MAX_BODY_BYTES = 262_144
// One render at a time, because the pod's memory limit is sized for one. Four
// waiting is a short burst absorbed; past that the answer is 503, which every
// caller already handles as "no picture this time".
export const MAX_QUEUED = 4

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const given = Buffer.from(header.slice(prefix.length))
  const want = Buffer.from(token)
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a token is not the secret.
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * The request body, or null when it is too large. Read with a running total
 * rather than by Content-Length: a chunked body carries no length, and a
 * declared one is a claim, not a limit.
 */
async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(body)
}

export function createSheetServer(env: SheetEnv): Server {
  // The queue is one promise chain. A job is appended by chaining onto the tail,
  // and the tail advances to that job synchronously, before any await - so the
  // next job chains onto THIS one. Several renders awaiting one shared promise
  // would all resume the moment it settled and run together, which is the one
  // thing a memory limit sized for a single composite cannot afford.
  let tail: Promise<void> = Promise.resolve()
  // Admitted renders: the one in flight plus the ones waiting behind it.
  let admitted = 0

  function enqueue(job: () => Promise<void>): Promise<void> {
    const run = tail.then(job)
    // Swallowed on the tail only: the caller still sees `run` reject.
    tail = run.then(() => undefined, () => undefined)
    return run
  }

  async function render(res: ServerResponse, body: string): Promise<void> {
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      send(res, 400, 'malformed JSON')
      return
    }
    const parsed = DeckSheetRequest.safeParse(payload)
    if (!parsed.success) {
      // Field paths, never values: a card name is user input and this goes to a log.
      send(res, 400, parsed.error.issues.map((i) => i.path.join('.')).join(', '))
      return
    }

    // One in flight plus MAX_QUEUED waiting is the whole admission; the next
    // request is shed, which every caller already handles as "no picture this
    // time".
    if (admitted > MAX_QUEUED) {
      send(res, 503, 'render queue full')
      return
    }
    admitted += 1
    try {
      await enqueue(async () => {
        try {
          const out = await renderSheet(parsed.data, { imageBase: env.IMAGE_BASE_URL })
          res.writeHead(200, {
            'content-type': out.contentType,
            'content-length': String(out.body.length),
            'cache-control': 'no-store',
            'x-sheet-pixels': String(out.pixels),
            'x-sheet-scale': out.scale.toFixed(3),
            'x-sheet-dropped': String(out.dropped),
            'x-sheet-full-art': String(out.fullArt),
          })
          res.end(out.body)
        } catch (err) {
          console.error('sheet: render failed:', err instanceof Error ? err.message : err)
          send(res, 500, 'render failed')
        }
      })
    } finally {
      admitted -= 1
    }
  }

  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, 'ok')
      return
    }
    if (req.method !== 'POST' || req.url !== '/render') {
      send(res, 404, 'not found')
      return
    }
    if (!authorized(req, env.SHEET_TOKEN)) {
      send(res, 401, 'unauthorized')
      return
    }
    void readBody(req).then((body) => {
      if (body === null) {
        send(res, 413, 'body too large')
        return undefined
      }
      return render(res, body)
    }).catch((err) => {
      console.error('sheet: request failed:', err instanceof Error ? err.message : err)
      if (!res.headersSent) send(res, 500, 'request failed')
    })
  })
}

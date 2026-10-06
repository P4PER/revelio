import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { DeckSheetRequest, MAX_SHEET_ENTRIES, SHEET_FIELD_LIMITS } from '@revelio/core'
import type { SheetEnv } from './env'
import { renderSheet } from './render'

type RenderLog = Record<string, string | number | boolean>

// The fixed half of a serialized entry: every key name, the zone, the quantity,
// the bounded imageVersion and artCropVersion and the punctuation around them,
// plus the comma that joins it to the next. Measured at 152 against the
// contract's own maxima (124 before artCropVersion), not against realistic
// values - sizing the fixed half from one and the variable half from the other
// is how this was wrong before. The rest is headroom for the contract gaining a
// field.
const JSON_ENTRY_OVERHEAD = 180
// The variable half comes from the contract's own ceilings, so widening one
// there widens this by the same arithmetic.
//
// Counted in BYTES, not characters: zod bounds a string in JS string units and
// this cap is compared against the encoded body, so a German name costs more
// per character than an English one and an unpaired surrogate costs six. Only
// the names pay that factor - every other field is allowlisted to ASCII, which
// is half of why they are allowlisted at all. Each type also costs its quotes
// and comma.
const MAX_ENTRY_BYTES =
  SHEET_FIELD_LIMITS.cardId +
  SHEET_FIELD_LIMITS.nameInput * SHEET_FIELD_LIMITS.jsonBytesPerChar +
  SHEET_FIELD_LIMITS.setCode +
  SHEET_FIELD_LIMITS.types * (SHEET_FIELD_LIMITS.typeLength + 3) +
  SHEET_FIELD_LIMITS.orientation +
  JSON_ENTRY_OVERHEAD
// The deck name, the locale, the format, maxBytes and the envelope punctuation.
const JSON_ENVELOPE_BYTES =
  SHEET_FIELD_LIMITS.nameInput * SHEET_FIELD_LIMITS.jsonBytesPerChar + 4_096
export const MAX_BODY_BYTES = MAX_SHEET_ENTRIES * MAX_ENTRY_BYTES + JSON_ENVELOPE_BYTES
// One render at a time, because the pod's memory limit is sized for one. Four
// waiting is a short burst absorbed; past that the answer is 503, which every
// caller already handles as "no picture this time".
export const MAX_QUEUED = 4
// The service's own ceiling on one render, from spec section 9. It sits inside
// the bot's 75s abort and outside web's 30s one.
//
// It bounds the fetch phase and the checkpoints around it, not the composite or
// the encoders - sharp cannot be interrupted once those start (see render.ts).
// So this is the point past which no NEW work is begun for a render, not a hard
// wall-clock bound on one, and the queue's worst-case wait is correspondingly
// soft. MAX_SHEET_PIXELS is what actually bounds the uninterruptible half.
export const REQUEST_DEADLINE_MS = 60_000
// Sockets accepted at once, and so the ceiling on bodies buffered ahead of
// admission: MAX_CONNECTIONS x MAX_BODY_BYTES, which readBody holds as chunks,
// a concat and a string at once. 16 keeps that near 35 MB against the ~551 MB a
// 12 Mpx render peaks at inside a 768Mi pod; 64 measured ~140 MB, a real share
// of the headroom for callers that send one request at a time.
export const MAX_CONNECTIONS = 16

// Counts repeats in the logs, which is the evidence for or against a sheet
// cache (spec section 5). Zod's parse output lists keys in schema order, so the
// same request from either caller stringifies the same way. Truncated: it only
// has to tell requests apart, not stand in for one.
function requestDigest(req: DeckSheetRequest): string {
  return createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0, 16)
}

// key=value, one line, so a log query can filter and aggregate on any field
// without parsing prose. Counts, timings and the digest only: never a name, a
// title or a URL (spec section 10).
function logRender(fields: RenderLog): void {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`)
  console.log(`sheet: render ${parts.join(' ')}`)
}

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

/**
 * Answers a request whose body was abandoned part-read, and closes the
 * connection with it. Keep-alive is the trap here: the unread remainder of the
 * body is still arriving on a socket the client will happily take back from its
 * pool, so the next request on it reads the leftovers as its request line and
 * hangs until the socket times out. `Connection: close` is what tells the client
 * not to reuse it; destroying the request stops the upload once the answer is
 * out.
 */
function sendAndClose(req: IncomingMessage, res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' })
  res.end(body, () => req.destroy())
}

/**
 * Starts listening, and reports a failure to start by rejecting. net.Server
 * emits 'error' rather than calling back, and an 'error' with no listener is
 * rethrown as an uncaught exception - so without this a taken port kills the
 * process with a raw stack instead of main()'s 'sheet failed to start:', which
 * is the prefix sheet/Dockerfile greps for as the start-up contract.
 */
export function listen(server: Server, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    const started = () => { server.off('error', reject); resolve() }
    if (host === undefined) server.listen(port, started)
    else server.listen(port, host, started)
  })
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
    const digest = requestDigest(parsed.data)
    const entries = parsed.data.entries.length

    // One in flight plus MAX_QUEUED waiting is the whole admission; the next
    // request is shed, which every caller already handles as "no picture this
    // time".
    if (admitted > MAX_QUEUED) {
      logRender({ outcome: 'shed', digest, entries, queued: admitted })
      send(res, 503, 'render queue full')
      return
    }
    admitted += 1
    const admittedAt = performance.now()
    try {
      await enqueue(async () => {
        const queueMs = Math.round(performance.now() - admittedAt)
        // The wait in the queue is unbounded from here, so the caller may well
        // have given up before its turn came. Painting now would spend the one
        // render slot on a socket nobody is reading while the next caller gets
        // a 503.
        // Logged all the same: a caller that gave up in the queue is a queue
        // too long for its callers, and that is evidence too.
        if (res.closed) {
          logRender({ outcome: 'abandoned', digest, entries, queueMs, reason: JSON.stringify('caller went away before its turn') })
          return
        }

        const abandon = new AbortController()
        const hangUp = () => abandon.abort(new Error('caller went away'))
        res.once('close', hangUp)
        const deadline = setTimeout(
          () => abandon.abort(new Error(`render passed the ${REQUEST_DEADLINE_MS}ms deadline`)),
          REQUEST_DEADLINE_MS,
        )
        try {
          const out = await renderSheet(parsed.data, {
            imageBase: env.IMAGE_BASE_URL,
            signal: abandon.signal,
          })
          // The encode cannot be interrupted (render.ts), so a caller that left
          // during it still gets a finished render back. Nobody will read these
          // bytes: record the hang-up rather than a delivered sheet.
          if (res.closed) {
            logRender({ outcome: 'abandoned', digest, entries, queueMs, reason: JSON.stringify('caller went away during the encode') })
            return
          }
          logRender({
            outcome: 'rendered', digest, entries, distinct: out.distinct,
            mpx: (out.pixels / 1e6).toFixed(2), scale: out.scale.toFixed(3),
            art: out.fullArt ? 'full' : 'thumb', dropped: out.dropped,
            queueMs, fetchMs: out.fetchMs, encodeMs: out.encodeMs,
            bytes: out.body.length, type: out.contentType === 'image/png' ? 'png' : 'webp',
          })
          res.writeHead(200, {
            'content-type': out.contentType,
            'content-length': String(out.body.length),
            'cache-control': 'no-store',
            'x-sheet-pixels': String(out.pixels),
            'x-sheet-scale': out.scale.toFixed(3),
            'x-sheet-dropped': String(out.dropped),
            'x-sheet-full-art': String(out.fullArt),
            'server-timing': `queue;dur=${queueMs}, fetch;dur=${out.fetchMs}, encode;dur=${out.encodeMs}`,
          })
          res.end(out.body)
        } catch (err) {
          // console.log like every other outcome, so all four land in one stream
          // and one query. JSON.stringify quotes the message so its spaces
          // cannot break the key=value split; it names no URL (render.ts).
          // Decided by the socket, not by the abort signal: the deadline fires
          // that signal too, but its caller is still here and gets a 500.
          const reason = err instanceof Error ? err.message : String(err)
          logRender({
            outcome: res.closed ? 'abandoned' : 'failed',
            digest, entries, queueMs, reason: JSON.stringify(reason),
          })
          // An abandoned render has no socket left to answer on, and writing to
          // a closed response throws rather than reporting anything.
          if (!res.closed) send(res, 500, 'render failed')
        } finally {
          clearTimeout(deadline)
          res.off('close', hangUp)
        }
      })
    } finally {
      admitted -= 1
    }
  }

  const server = createServer((req, res) => {
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
        // Not reachable with a request the contract accepts - see MAX_BODY_BYTES
        // - so this means a body that is not one, and says so rather than
        // leaving a caller to guess that its deck was too big.
        // Not "larger than any valid request": JSON allows arbitrary whitespace
        // between tokens, so a body whose parsed form the contract accepts can
        // exceed any byte cap. The cap covers every well-formed one.
        sendAndClose(req, res, 413, 'body too large')
        return undefined
      }
      return render(res, body)
    }).catch((err) => {
      console.error('sheet: request failed:', err instanceof Error ? err.message : err)
      if (!res.headersSent) send(res, 500, 'request failed')
    })
  })

  // A body is buffered before it reaches the queue, so the queue bounds renders
  // but never bytes. This is what bounds the bytes - see MAX_CONNECTIONS.
  server.maxConnections = MAX_CONNECTIONS
  return server
}

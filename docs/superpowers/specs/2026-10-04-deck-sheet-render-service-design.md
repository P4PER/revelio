# Deck sheet render service — Design

**Date:** 2026-10-04
**Status:** approved, not yet implemented
**Workspace:** new `@revelio/sheet` (`app/sheet/`), with changes in `core`, `bot`, `web`
**Builds on:** `2026-07-30-deck-png-image-export-design.md` (the web export),
`2026-09-09-discord-bot-design.md` (`/deck`),
`2026-09-17-deck-image-delivery-design.md` (every measurement quoted here)

## Problem

The deck sheet — the picture of a deck — is painted twice from one set of shared geometry:

| Where | Runtime | Serves |
| --- | --- | --- |
| `web/src/lib/deck-png.ts` | browser Canvas | the builder's "Export PNG" download |
| `bot/src/images/deck-image.ts` | sharp | the Discord `/deck` reply |
| `core/src/deck-sheet.ts` + `deck-groups.ts` | pure | layout, grouping, colours, for both |

The split was the right call when `/deck` shipped: the bot has no Canvas, the browser has no
sharp, and pushing grouping and geometry down into `@revelio/core` kept the two pictures from
drifting apart. What it did not do is keep the two *painters* from each growing their own
constraints, and those constraints are now the thing in the way. Four symptoms, none of which
is a bug to fix in place:

1. **The two pixel caps cannot become one constant.** The browser clamps by
   `MAX_CANVAS_DIM = 8192` (`deck-png.ts:26`), a per-axis limit past which `toBlob()` hands
   back a blank image. The bot clamps by `MAX_SHEET_PIXELS = 5_000_000`, an *area* limit that
   comes from pod memory and Discord's 10 MB attachment cap. Both are real, neither is
   negotiable, and they are different shapes of number. `DECK_SHEET` cannot hold either one
   without lying to the other painter, which is exactly what the comment on each of them says.
2. **The bot carries an image toolchain for one command.** `sharp` is the single dependency
   its esbuild bundle cannot inline, so `bot/Dockerfile` installs it on its own into the
   runtime image (165 MB -> 195 MB). Beside it: `Poppins-SemiBold.ttf`, a `fonts.conf` to stop
   fontconfig scanning every system font directory, a writable fontconfig cache dir, and a
   build-stage `RUN` that renders one line against an unmatched font family to prove the font
   resolves. All of that exists so `/deck` can draw a picture.
3. **A ~550 MB peak composite runs on the Discord gateway pod.** The gateway's own job is a
   websocket and a few embeds; its memory limit is set entirely by the renderer, and an OOM
   kill takes the gateway down rather than costing one reply.
4. **Neither painter can cache.** The sheet is a pure function of (entries, locale, image
   versions), and both repaint from scratch every time — re-fetching up to ~31 MB of card art
   per render on a large deck.

A fifth, smaller one: the two painters still differ below the geometry line. The web paints
`system-ui` at three weights, the bot one bundled Poppins face, so the same deck is two
slightly different pictures depending on where it was drawn.

## Goals

- One painter, in one place, producing the bytes for both `/deck` and the web export.
- `@revelio/core` keeps owning layout, grouping and colour. The service is a painter, not a
  second owner of the geometry.
- The bot carries no image toolchain: no sharp, no font, no font proof, no fetch budget.
- **One** pixel cap, owned by the process whose memory it bounds.
- A repeat render of the same sheet costs no composite; a repeat render of the same card art
  costs no fetch.
- No UX regression: `/deck` posts an attachment and degrades to the list embed; the export
  menu still downloads a file from one click, including for an unsaved deck.

## Non-goals

- **A deck id in the contract**, or rendering on deck save. Argued below; both break the web
  export outright.
- **Changing `DECK_SHEET` geometry or the grouping.** A layout change is separate work with
  its own verification on both sides.
- **Localized card names on the sheet.** `cardViewMetaByIds` resolves `cards.name`, so both
  painters already draw default-language names; the locale decides the section labels only.
- **The OG image path.** `web/src/lib/og-image.tsx` and `lib/server/deck-og.ts` are satori
  (`next/og`) on a crawler hot path, 1200x630, built from one art crop. Unrelated and untouched.
- **Posting a sheet URL instead of an attachment.** See *Rejected alternatives*.
- **A public ingress for the service.** It is reachable from `web` and `bot` only.
- **Sharing the cache between replicas.** Specced as the extension point, not built.

## Baseline

PR #136 (`fix/bot-deck-image-delivery`) is **deployed and will not be merged.** It is the
production painter and the source of every number below; `main` still carries the earlier
PR #133 painter (WebP output, thumbs, no clamp, silent failures). Two consequences:

- The painter Phase 1 ports into the service is **the branch's** `deck-image.ts`, not main's.
- The painter Phase 2 deletes is **main's**, and the branch closes unmerged when Phase 2 lands.

Measured on that branch, against real card art, peak RSS sampled every 20 ms:

| Quantity | Measurement |
| --- | --- |
| Peak RSS | `215 MB + 28 MB per megapixel` of sheet |
| Encoded PNG | `1.6 MB per megapixel` |
| Full card art | 745 px wide (~317 KB); thumb 300 px (~23 KB) |
| Worth drawing from full art | above roughly a 1.5:1 downscale of the thumb |

Card box at the shipped 5 Mpx cap, by distinct entries, with the scale that implies and the
sheet area the same deck would have had at the full 2x:

| Distinct entries | Card box at 5 Mpx | Scale | Natural area at 2x |
| ---: | --- | ---: | ---: |
| <= 25 | 264 x 370 | 2.00 | <= 5.0 Mpx |
| 40 | 232 x 326 | 1.76 | 6.5 Mpx |
| 60 | 197 x 277 | 1.49 | 9.0 Mpx |
| 100 | 154 x 216 | 1.17 | 14.7 Mpx |
| 200 | 110 x 154 | 0.83 | 28.8 Mpx |

Section headers cost as much height as a row of cards, so entries map to megapixels far less
generously than a card count suggests. The originally specced 12 Mpx cap was wrong *for the
bot*: at 12 Mpx the PNG lands near 19 MB, which Discord rejects outright. 5 Mpx is what fits
both the attachment limit and a 640Mi pod — a constraint that belongs to the Discord path,
not to the sheet.

## Design

### 1. The contract: resolved entries, not a deck id

The service takes the **already-resolved sheet input** and returns image bytes. It has no
database, no Meilisearch, no S3 and no deck ids.

```
POST /render
Authorization: Bearer <SHEET_TOKEN>
Content-Type: application/json

{
  "locale": "en",
  "maxBytes": 9000000,
  "deck":    { "name": "Hogwarts Express", "format": "classic" },
  "entries": [ { "cardId": "...", "zone": "main", "quantity": 2, "name": "...",
                 "setCode": "...", "types": ["creature"], "imageVersion": 7,
                 "orientation": null } ]
}

200 OK
Content-Type: image/png | image/webp
X-Sheet-Cache:   hit | miss
X-Sheet-Pixels:  4987200
X-Sheet-Scale:   1.76
X-Sheet-Dropped: 0
```

`entries` is `DeckSheetEntry[]` from `@revelio/core` — the exact type `layoutDeckSheet`
already takes, which both callers already hold (`PublicDeck.entries` in the bot,
`BuilderState.entries` in the browser). The request is a Zod schema, `DeckSheetRequest`, in
`core/src/deck-sheet.ts`: core owns the shape of the sheet's input, the service owns pixels.
A 100-entry deck serializes to roughly 12 KB.

Three reasons this is a payload and not `{ deckId, locale }`:

- **The web export renders unsaved state.** `DeckExportMenu` paints from `BuilderState`
  (`deck-export-menu.tsx:84`) — a deck with unsaved edits, or no id at all. A service keyed on
  a deck id cannot serve it without a second code path, and a second code path is the split
  this document is removing.
- **A deck id drags visibility rules in.** The service would have to re-implement
  `getDeckForViewer`'s owner-or-public check, and get it right, to avoid becoming a way to read
  a private deck as a picture.
- **The payload is the cache key.** The sheet is pure in its input; when the request body *is*
  that input, the key is a hash of the body and correctness is not an argument.

Error responses, all of which the callers treat identically ("no picture this time"):

| Status | Cause |
| --- | --- |
| 400 | body fails `DeckSheetRequest`, unknown locale, entries over the cap |
| 401 | missing or wrong bearer token |
| 413 | body over `MAX_BODY_BYTES` |
| 500 | render or encode failed (including: still over `maxBytes` after the WebP fallback) |
| 503 | render queue full |

### 2. Where it runs: a service of its own, not an endpoint on `web`

`web` is the cheaper home on paper. It already has sharp (`lib/actions/image-actions.ts`),
an S3 client, the database, a Dockerfile and a deploy webhook; a route handler would be a few
hundred lines and no new infrastructure. `CLAUDE.md` also records that there is no HTTP API
between `bot` and `web` today, and an endpoint on `web` would create one.

It is still the wrong home:

| | Endpoint on `web` | Service of its own |
| --- | --- | --- |
| Peak memory | 551 MB *per concurrent render*, in the heap that serves SSR | 551 MB, in a pod that does nothing else |
| Memory limit | sized for SSR + N renders, by guesswork | sized for exactly one render |
| Blast radius of an OOM | every request in flight on that pod | one reply, one download |
| Concurrency control | needs a semaphore inside Next, which nothing else there has | the service's own queue, its reason to exist |
| Latency coupling | a 3 s composite competes with p95 page render | none |
| Cost | no new image, no new deploy | +1 image, +1 deploy target, +1 webhook, +1 token |
| `bot` depends on | `web`'s availability and request path | a painter neither app owns |

The deciding line is the second: a bursty, CPU-bound, half-gigabyte composite has no stable
limit when it shares a heap with an uncontrolled number of SSR requests, and the thing that
dies when the guess is wrong is the website. A pod that renders one sheet at a time has a
memory limit that follows from a constant (see §4) instead of from traffic.

The `CLAUDE.md` rule survives in substance. Its point is that the bot must not depend on
`web`'s code or its request path — not that the bot may never make an HTTP call. A render
service that neither app owns is a third party to both, and the rule is restated that way:
*`bot` must never import from `web` and never call it; both call `@revelio/sheet`.*

### 3. Shape of the workspace

A seventh npm workspace, `@revelio/sheet` at `app/sheet/`, depending on `@revelio/core`
**only** — the dependency direction becomes `core <- {search, db} <- {ingest, web, bot, sheet}`.

- `src/server.ts` — `node:http`, no framework: one route, one health check, a bearer check, a
  body limit and a queue. A framework would be the largest thing in the bundle.
- `src/render.ts` — the painter, ported from the branch's `bot/src/images/deck-image.ts`:
  `chromeSvg`, `badgeSvg`, the per-card overlays, `sheetScale`, `usesFullArt`, `px`,
  `canvasSize`, the fetch budget and the PNG/WebP encode with its post-encode check.
- `src/text.ts`, `src/Poppins-SemiBold.ttf`, `src/fonts.conf` — ported from `bot/src/images/`.
- `src/cache.ts` — the two caches (§5).
- `build.mjs` + `Dockerfile` — mirroring `bot`'s exactly, and for the same reasons: the
  `createRequire` banner, `sharp` marked external and installed alone into the runtime stage,
  the font files copied beside the bundle because `text.ts` resolves them against
  `import.meta.url`, the font-render proof in the build stage, and a `RUN` of the bundle with
  an empty env to catch an entry guard firing inside a bundle.
- `GET /healthz` returns 200 and the painter's version. The font proof stays in the image
  build, where it fails the build rather than the first request.

Nothing else moves. `core/src/deck-sheet.ts` and `deck-groups.ts` stay exactly where they are
and keep every consumer they have; the service is the only thing that paints.

### 4. One pixel cap, and a byte ceiling that is derived rather than declared

`MAX_CANVAS_DIM` dies with the canvas: once no painter runs in a browser, nothing in the
system has a per-axis limit. That leaves one cap, in the one process whose memory it bounds:

```
MAX_SHEET_PIXELS = 12_000_000     // sheet/src/render.ts, a code constant, not env
```

From `215 MB + 28 MB/Mpx`, with the pod sized for one render at a time:

| Cap | Peak RSS | PNG at the cap | Pod limit |
| ---: | ---: | ---: | --- |
| 5 Mpx | 355 MB | 8.0 MB | 512Mi |
| 8 Mpx | 439 MB | 12.8 MB | 640Mi |
| **12 Mpx** | **551 MB** | **19.2 MB** | **768Mi** (request 256Mi) |
| 16 Mpx | 663 MB | 25.6 MB | 1Gi |

12 Mpx with a **768Mi limit, 256Mi request and a render concurrency of 1** leaves ~170 MB over
the measured peak for the Node baseline and the HTTP layer. The cap is a constant rather than
an env var on purpose: it is one half of a pair with the pod limit, and a value an operator can
move independently of the limit is a value that will be moved past it.

The bot's old 5 Mpx is **not** a second cap any more. It was always a consequence of Discord's
attachment limit, so the caller states the limit and the service derives the scale from it:

```
effective budget = min(MAX_SHEET_PIXELS, maxBytes / 1.6 MB-per-Mpx)
scale            = min(DECK_SHEET.scale, sqrt(effective budget / (geom.width * geom.height)))
```

`/deck` sends `maxBytes: 9_000_000` (Discord's 10 MB, with headroom) and gets 5.6 Mpx; the web
download sends no ceiling and gets the full 12 Mpx. The coefficient only picks the *starting*
scale — art content moves the real PNG size around it — so the existing belt-and-braces stays:
encode, measure, and on an overshoot re-encode the same pixels as WebP and measure again,
failing the request if that is still over. The callers already handle a failed render.

What that does to each side's picture:

- **`/deck` gets slightly crisper.** 5.6 Mpx against today's 5.0.
- **The web export is identical up to ~80 distinct entries** (both render at the full 2x).
  Between ~80 and ~110 entries the service's sheet is up to 13% smaller per axis than today's
  browser render (229 x 321 against 264 x 370 at the extreme). Past ~110 entries it is
  *crisper* than today, because `MAX_CANVAS_DIM` was already clamping harder: at 200 entries,
  170 x 239 against today's 147 x 206.
- **No new download-size concern.** Today's browser export already emits 13.9 MB for a
  60-entry deck; 19.2 MB at the 12 Mpx cap is the same order, from an explicit export click.

### 5. Caching

Two caches, both bounded, both on the service's own disk, both behind one small `BlobCache`
interface (`get(key)`, `put(key, bytes)`, byte cap, LRU eviction, nothing else).

**Sheet cache.** Key is a SHA-256 over canonical JSON of:

```
{ painter: PAINTER_VERSION,                 // hand-bumped when the painting changes
  geometry: hash(DECK_SHEET, DECK_SHEET_COLORS),
  locale, maxBytes,
  deck: { name, format },
  entries: [ { cardId, zone, quantity, name, setCode, types, imageVersion, orientation } ] }
```

Everything that moves a pixel is in the key. A geometry edit in `core` invalidates the cache
by itself, which is the one that would otherwise be forgotten; only a change to the painter
needs the hand bump, and a test asserts the two constants are both in the digest. `imageVersion`
is in the key, so an ingest run that re-uploads art invalidates exactly the sheets that art
appears in. Stored entry is the encoded bytes plus the content type.

**Art cache.** Key is the image key itself (`cards/<id>.<v>.webp`), which is immutable by
construction — a new version is a new key, and `upload-images.ts` already serves these with
`max-age=31536000, immutable`. This is the cache that pays: the full-art corpus is 1098 cards
at ~317 KB, so **a 512 MB art cache holds every card in the game** and the steady state is a
render with no outbound fetches at all. The thumb corpus is ~25 MB.

Defaults: `SHEET_CACHE_BYTES=512Mi`, `ART_CACHE_BYTES=512Mi`, `CACHE_DIR=/cache` (unset
disables both, which is what the test suite runs with). Disk, not RAM: the pod's memory limit
is sized for the render peak, and a cache in the heap would be competing with it.

**Why not the object store.** The `images` bucket's policy is `s3:GetObject` for `Principal: *`
on `bucket/*` (`ingest/src/upload-images.ts:41`) — every object in it is world-readable. The
web export renders unsaved and **private** decks, so writing those sheets there would publish
them at an unguessable but permanent URL. A second, non-public bucket would also mean S3
credentials, a lifecycle policy and ~8 MB per cached sheet of storage growth, bought for a
durability the local cache's cost of a miss (one re-render) does not justify at one replica.
The `BlobCache` interface is the promotion point: when replica count exceeds 1, an
object-store implementation drops in behind it and nothing else changes.

### 6. The sheet's labels move into `@revelio/core`

`DeckSheetLabels` is resolved by each caller from its own catalog today — next-intl in web,
`bot/src/i18n/{en,de}.json` in the bot. With a shared painter that has to stop: the labels
would otherwise be part of the request, which means part of the cache key, which means one
typo in one catalog quietly forks the cache and lets the two callers render two different
pictures of the same deck.

`core/src/labels.ts` already holds exactly this kind of catalog for attribute codes, keyed by
locale, deliberately framework-free so a Next server component, a client component and a plain
Node process can all call it. The sheet's ~15 strings (two format labels, `character`,
`mainDeck`, `sideboard`, and the plural group labels) join it as a `deckSheet` scope with a
`sheetLabels(locale)` helper, with the copy taken verbatim from web's catalog, which is the
original. The request then carries a `locale` and nothing else about language, and the service
resolves labels itself. `core/test/labels.test.ts` and the bot's `catalog-parity.test.ts`
pattern cover en/de completeness.

### 7. How `web` gets the bytes

A route handler, not a server action: the response is binary and streamed, which is what route
handlers are for, and the existing `src/app/api/auth/[...all]/route.ts` is the precedent for an
`/api` path outside the `[locale]` tree (`proxy.ts`'s matcher already excludes `api`).

```
POST /api/deck-sheet   { name, format, locale, cards: [{ cardId, zone, quantity }] }
  -> getCardViews(db, ids)        resolve names/types/imageVersion/orientation server-side
  -> POST <SHEET_SERVICE_URL>/render
  -> 200 image/png, Content-Disposition: attachment; filename="<slug>.png"
```

The client sends **card ids, quantities and zones only**, and the route resolves the rest with
`getCardViews` (`db/src/queries/decks.ts:143`) — the query the deck import path already uses.
That is a deliberate trust boundary, not an optimization: `name` is painted onto the sheet as
text, and a client-supplied `name` would make the service draw arbitrary strings served from
web's own origin. The deck's own title stays user input, as it already is in today's canvas
render.

The export menu keeps its shape — one `onSelect`, an `await`, an anchor click, the existing
`export.pngError` toast on failure — so the UX delta is a pending state on the menu item
instead of an unindicated wait. Text and JSON export are pure `@revelio/core` and untouched.

The route is reachable without a session, because a public deck's overview offers the export to
anonymous visitors today and that must keep working. It is rate limited per IP (best-effort,
in-memory) and bounded by the service's own queue and entry cap; the precedent is the OG image
routes, which already render an image for anonymous callers.

Deleted with this phase: `web/src/lib/deck-png.ts`, `MAX_CANVAS_DIM`, `loadCardImage`, and
`web/src/lib/__tests__/deck-png-image.test.ts`. Keeping the canvas painter as a fallback was
considered and rejected: a fallback painter is the duplication this whole document is paying to
remove, and it would be the copy that silently drifts because it only runs when something is
already broken.

Two visible deltas, both accepted:

- **Type changes to Poppins** in the exported PNG (today `system-ui`). That is the brand face
  (`logos/BRAND-GUIDE.md`) and it makes the two pictures identical, which is the point.
- **The export's CORS dependency disappears.** The browser no longer fetches card art, so
  `RUSTFS_CORS_ALLOWED_ORIGINS` and the `cache: 'reload'` CORS workaround in `loadCardImage`
  (PR #134) stop being load-bearing for the export. The compose comment that explains them has
  to be rewritten rather than deleted — a bare local stack no longer breaks the export.

### 8. Env: the two image bases collapse back into one

`IMAGE_FETCH_BASE_URL` exists only because one process both fetched card art itself and handed
URLs to Discord, and those need opposite hosts in a cluster. The service only ever fetches, and
the bot only ever hands out URLs, so **the variable does not move — it disappears**, and each
process is left with one unambiguous `IMAGE_BASE_URL`:

| Service | Variable | Meaning |
| --- | --- | --- |
| `bot` | `IMAGE_BASE_URL` | public host; **Discord** fetches it. (`IMAGE_FETCH_BASE_URL` removed) |
| `sheet` | `IMAGE_BASE_URL` | where **this process** GETs card art; in a cluster, the object store's internal service name |
| `web` | `NEXT_PUBLIC_IMAGE_BASE_URL` | unchanged |

`@revelio/sheet` env in full: `PORT` (8080), `IMAGE_BASE_URL`, `SHEET_TOKEN`, `CACHE_DIR`,
`SHEET_CACHE_BYTES`, `ART_CACHE_BYTES`. No `DATABASE_URL`, no `MEILI_*`, no `S3_*`. New on
`bot` and `web`: `SHEET_SERVICE_URL` and `SHEET_TOKEN` (server-only in web).

### 9. Failure modes

| Caller | Service unreachable, 5xx, 503 or timeout |
| --- | --- |
| `/deck` | the existing path, unchanged: the render throws, the command logs it and answers with the list embed it can always draw from data in hand |
| web export | the existing `export.pngError` toast; text and JSON export unaffected; no page render depends on the service |

Budgets, outermost first: the bot aborts its request at 75 s (its deferred reply has 15
minutes, so it can afford to wait); web's route aborts at 30 s; the service's own request
deadline is 60 s, inside which the art fetch phase keeps the branch's 30 s shared budget with
each request's timeout clamped to what is left of it. A render that outlives the deadline is
abandoned rather than finished into a closed socket.

The queue is the memory limit's enforcement: one render in flight, at most four waiting, 503
beyond that. 503 is the same path as "down", so a burst degrades `/deck` to lists rather than
OOM-killing the pod.

### 10. Trust and input handling

- Every string in the payload is **text, never markup**. Card names and the deck title reach
  sharp's text API and the chrome SVG; the SVG path escapes `& < > " '`, and the text path runs
  with Pango markup off. A test renders a name containing `</text><script>` and asserts the
  output is a picture of that string.
- `entries` is capped (`MAX_ENTRIES = 400`, above any legal deck), the body at
  `MAX_BODY_BYTES = 256 KB`, and `locale` is validated against core's supported locales.
  The cap is what keeps geometry from being a denial-of-service input.
- The bearer token is compared with `timingSafeEqual`. The service has no public ingress; the
  token is defence in depth for a cluster-internal network, and its dev default lives in
  `sheet/.env.example` like every other workspace's.
- Logs name card ids and reasons, never URLs — the fetch base can be an internal hostname and
  logs are the wrong place for infrastructure topology. That rule comes from the branch and
  survives the move.

### 11. Observability

One structured line per render: cache hit or miss, distinct entries, megapixels, scale, full
art or thumbs, dropped art count, fetch ms, composite ms, encoded bytes, output format. That is
the line that answers "why is this sheet soft" and "why did that one take four seconds", both
of which currently need a reproduction. The `X-Sheet-*` response headers carry the same facts
to the caller, so a bot log can say why a sheet looked the way it did without correlating two
services by timestamp.

## Deployment

1. **New image** `ghcr.io/<owner>/revelio-sheet`: a `build-sheet` job in `publish.yml` plus a
   `sheet` entry in the `changes` paths-filter (sharing the existing `shared` anchor, since
   `core` changes rebuild it), and a `SHEET_REDEPLOY_WEBHOOK_URL` secret.
2. **New deployment**: 1 replica, **limit 768Mi / request 256Mi**, 1 Gi of ephemeral disk for
   `/cache`, no public ingress. `IMAGE_BASE_URL` points at the in-cluster object store service
   name — the value that is currently in the bot's `IMAGE_FETCH_BASE_URL`.
3. **`SHEET_TOKEN`** generated once and set on all three services.
4. **`SHEET_SERVICE_URL`** set on `bot` and `web` (in-cluster service name).
5. **Order matters**: the service must be live before the bot rolls, because the bot that
   rolls has no painter left. `/deck` degrades to the list embed in the gap rather than
   failing, which is the fallback working as designed.
6. **After the bot rolls**: remove `IMAGE_FETCH_BASE_URL` from the bot and **lower the bot's
   memory limit back** to what a gateway needs (256Mi limit / 64Mi request). Leaving 640Mi
   there is the whole cost this work removes.
7. Local stack: a `sheet` service in `docker-compose.yml` with no profile — it needs no
   secrets, so a bare `docker compose up` can bring it up beside the others, with
   `IMAGE_BASE_URL: http://rustfs:9000/images`.

Repo wiring that goes with it: `app/package.json` workspaces, `app/eslint.config.mjs` globs,
`tsconfig.base.json` path mapping, a `test` script so `npm test` picks it up, and the
`CLAUDE.md` sections that say "six npm workspaces", "no HTTP API between `bot` and `web`",
"**`bot` has one external dependency: `sharp`**" and "Two image bases, and they are not
interchangeable" — each of which this change makes wrong.

## Phases

| Phase | Plan | Delivers |
| --- | --- | --- |
| 1 | `2026-10-04-deck-sheet-phase-1-render-service.md` | `@revelio/sheet`: contract in core, labels in core, the painter ported from the branch, image, compose, CI/publish wiring. Nothing switched; `curl` renders a sheet. |
| 2 | `2026-10-04-deck-sheet-phase-2-bot-switchover.md` | `/deck` calls the service. `deck-image.ts`, `text.ts`, the font, `fonts.conf`, sharp, the font proof and `IMAGE_FETCH_BASE_URL` leave `bot`. |
| 3 | `2026-10-04-deck-sheet-phase-3-web-switchover.md` | `/api/deck-sheet`, the export menu, deletion of `deck-png.ts` and `MAX_CANVAS_DIM`; compose CORS comment rewritten. |
| 4 | `2026-10-04-deck-sheet-phase-4-caching.md` | The two caches and the render log. |

Phase 1 ships behind nothing and changes no behaviour, so it can land and be exercised against
production card art before either caller moves. Phases 2 and 3 are independent of each other.
Phase 4 is last on purpose: a cache that is wrong is worse than no cache, and it is easier to
be sure of a key when both callers are already producing requests to key on.

## Rejected alternatives

- **A render endpoint on `web`.** §2. Memory, not architecture, is what decides it.
- **Render on deck save.** Cannot serve the web export at all (unsaved state), re-renders on
  every save of a deck nobody will ever post, needs a queue and a retry path, and still goes
  stale at every ingest run that moves an `imageVersion`. Request-time plus a cache gets the
  same second-request-is-free property without any of that.
- **A shared painter library, imported by `bot` and `web` instead of called over HTTP.** It
  removes the duplication but none of the cost: sharp, the font and the half-gigabyte peak stay
  on the gateway pod, and the browser still cannot run it, so web keeps a Canvas painter.
- **Posting a bucket URL in the embed instead of an attachment.** Tempting — the bot would
  handle no bytes at all. But it means every rendered sheet is world-readable (the bucket
  policy is `bucket/*`), including sheets of private and unsaved decks from the web path, and
  `media.discordapp.net` would be transcoding a URL whose extension the bot no longer controls.
  The attachment path already works and the `deck.png` / `deck.webp` naming rule exists to keep
  it working.
- **Caching sheets in the object store.** §5.
- **Keeping the Canvas painter in `web` as a fallback.** §7.
- **`MAX_SHEET_PIXELS` as an env var.** It is half of a pair with the pod memory limit; a value
  that can be raised without the limit is one that will be.

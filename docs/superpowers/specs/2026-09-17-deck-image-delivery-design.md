# Deck image delivery design

Date: 2026-09-17
Status: approved, not yet implemented

## Problem

`/deck` shipped in PR #133 and is broken in production in three separate ways. All three
were found while debugging one screenshot: a deck sheet in which every card is an empty
placeholder box with the card name in it.

### 1. One `IMAGE_BASE_URL` serves two consumers with opposite requirements

The bot uses `IMAGE_BASE_URL` for two things that need different hosts:

| Consumer | Who performs the GET | Reachability needed |
| --- | --- | --- |
| `/card`, `/search`, `/collection` embeds (`embeds/card-embed.ts:53`) | **Discord**, from the public internet | Public DNS + TLS |
| `/deck` sheet render (`images/deck-image.ts:95`) | **The bot process**, in-cluster | Reachable from the pod |

Production runs on Kubernetes. Observed behaviour, confirmed by the operator:

- `IMAGE_BASE_URL=https://portkey.revelio.cards/images` - `/card` renders its image
  (Discord fetches it), `/deck` draws a placeholder for every card. The pod cannot reach
  the site's own ingress hostname from inside the cluster, which is the ordinary
  hairpin-NAT / split-horizon-DNS case, so every `fetchThumb` fails.
- `IMAGE_BASE_URL=http://svc-app-rustfs-<hash>.proj-reveliocards-<hash>.svc.cluster.local:9000/images` -
  `/card` renders no image at all (Discord cannot resolve a cluster-local name), and
  `/deck` loads the art and then kills the process.

There is no single value that satisfies both. The variable has to split.

`app/docker-compose.yml:81` has the same bug in the local stack for a different reason: it
hands the containerised bot `IMAGE_BASE_URL: http://localhost:9000/images`, which inside
that container is the container itself. `DATABASE_URL` and `MEILI_HOST` two lines above it
were given service-name overrides; the image base was not.

### 2. Every fetch and decode failure is silent

`fetchThumb` (`images/deck-image.ts:92-102`) and `cardImage` (`:112-120`) each end in a
bare `catch { return null }`. A null becomes the placeholder box. Nothing is logged, at
any level. The production symptom - 21 placeholder boxes - produced zero log lines, which
is why the cause had to be reconstructed from the outside.

### 3. The renderer's peak memory is unbounded, and it is large

Measured on this branch with `tsx`, rendering against the real production image host. Peak
RSS sampled every 20ms:

| Entries | Sheet (device px) | Megapixels | Peak RSS | Output (webp q90) |
| ---: | --- | ---: | ---: | ---: |
| 20 | 1960 x 2570 | 5.0 | 273 MB | 0.50 MB |
| 60 | 1960 x 5102 | 10.0 | 368 MB | 1.49 MB |
| 120 | 1960 x 9744 | 19.1 | 478 MB | 2.94 MB |

A straight-line fit over those three points:

```
peak RSS ~= 200 MB + 14.5 MB per megapixel of sheet
```

Two things follow. The cost tracks canvas **area**, and nothing in the code bounds that
area - `computeSheetGeometry` grows the sheet by however many cards the deck has, and the
bot renders at `DECK_SHEET.scale` (2) as is. The web painter already clamps its scale
(`web/src/lib/deck-png.ts:186`, `MAX_CANVAS_DIM = 8192`) because browsers cap canvas size;
the bot inherited the geometry but not the clamp.

The same measurement with an unreachable image base - which is exactly the pre-fix
production behaviour - peaks at **285 MB** for 60 entries against **365 MB** when the
images actually load. So fixing problem 1 raises peak memory by roughly 80 MB on a
mid-sized deck. A pod limit sitting anywhere in that gap survives placeholders and is
OOM-killed the moment the art arrives, which is the reported sequence exactly.

Hypotheses that were measured and **rejected** - they are listed so nobody re-tries them:

- Replacing the full-canvas `badgeSvg` overlay with one small overlay per badge, plus
  `sharp.cache(false)` and `sharp.concurrency(2)`: 478 MB -> 454 MB at 120 entries. 5%.
  Not the lever, despite a full-canvas SVG overlay costing ~140 MB in isolation.
- Zod rejecting the cluster-local URL at boot: `parseEnv` accepts it. Verified directly.
- `imageVersion` being null in production: the deck page payload for the deck in the
  screenshot carries a version for every card, zero nulls.
- CORS: `RUSTFS_CORS_ALLOWED_ORIGINS` is invisible to the bot. Node's `fetch` sends no
  `Origin` and does not enforce the response header; a no-`Origin` GET against the
  production host answers 200 with the image. CORS is why the *web* export needed its own
  fix (PR #134) and has nothing to do with this one.

### 4. Output format and art resolution

Two asks from the operator, both in the code as deliberate choices that are worth
revisiting now that the sheet is being touched:

- `deck-image.ts` ends `.webp({ quality: 90 })` and the attachment is named `deck.webp`.
  A PNG is the more useful thing to download out of Discord.
- The bot renders from `thumbKey` (300 x 419) into a 264 x 370 device-pixel card box -
  adequate, with no headroom, and lossy source re-encoded lossily a second time. The web
  export deliberately uses the full image instead (`deck-png.ts:52-54`: "Full art (745px)
  rather than the 300px thumbnail keeps the exported cards crisp"). The two painters
  disagree, and the web one is right.

## Goals

- One reachable image source per consumer, so `/card` and `/deck` can both work at once.
- `/deck` cannot kill the gateway, at any deck size.
- Every dropped card image leaves a log line naming the card and the reason.
- `/deck` posts a PNG.
- Card art at least as crisp as the web export, within a bounded file size.

## Non-goals

- **An HTTP API between `bot` and `web`.** Ruled out by CLAUDE.md; the bot keeps rendering
  its own sheet.
- **Pagination or multi-attachment decks.** One deck, one image, clamped if it is huge.
- **Changing `DECK_SHEET` geometry.** Both painters read it; a layout change is a separate
  piece of work with its own web-side verification.
- **Caching rendered sheets.** A deck changes under its own id and the bot is stateless.

## Design

### Split the image base in two

```
IMAGE_BASE_URL          public, absolute. Goes into embed URLs that Discord fetches.
IMAGE_FETCH_BASE_URL    optional. What the bot's own renderer fetches from.
                        Defaults to IMAGE_BASE_URL when unset.
```

Only `deck-image.ts` reads the fetch base. Everything that hands a URL to Discord keeps
reading `IMAGE_BASE_URL`. The default keeps every existing deployment and the whole test
suite working unchanged - a single-host setup sets one variable, exactly as today, and a
split-horizon setup sets the second.

Naming: `IMAGE_FETCH_BASE_URL` says who performs the GET, which is the actual distinction.
`IMAGE_INTERNAL_BASE_URL` was considered and rejected - "internal" describes one
deployment's topology, not the rule.

### Bound the sheet by a pixel budget

Add a render scale clamp to the bot, in the same spirit as the web's `MAX_CANVAS_DIM` but
driven by the constraint that actually binds here, which is memory rather than a browser
limit:

```
scale = min(DECK_SHEET.scale, sqrt(MAX_SHEET_PIXELS / (geom.width * geom.height)))
```

`MAX_SHEET_PIXELS = 12_000_000` puts the worst case at roughly `200 + 14.5 * 12` = 374 MB
peak, and leaves every deck up to ~75 entries at the full 2x. Past that the sheet scales
down smoothly rather than clipping or dying. The clamp is the bot's own constant, not a
`DECK_SHEET` field: the web's cap is a browser limit at a different number, and merging
them into one value would tie two unrelated constraints together.

This makes the renderer's memory a function of a constant instead of of user input, which
is the property that matters. It does not by itself make 374 MB affordable - see
Deployment.

### PNG output

Encode `.png({ compressionLevel: 9 })` and name the attachment `deck.png`. Measured on a
60-entry sheet: webp q90 0.75 MB, PNG 3.13 MB. Extrapolated to the clamped worst case
(12 Mpx) PNG lands near 6 MB, inside Discord's 10 MB non-boosted upload limit, and the
clamp is what keeps it there.

Guard it anyway: if the encoded PNG exceeds `MAX_ATTACHMENT_BYTES` (9 MB, leaving headroom
under Discord's 10 MB), re-encode the same pixels as WebP rather than fail the reply. A
degraded picture beats the list fallback, and the guard is cheap.

`DECK_IMAGE_NAME` in `embeds/deck-embed.ts:13` is the single source for the filename and
is already read by both sides, so the rename is one constant.

### Full-resolution art

Switch `fetchThumb` from `thumbKey` to `imageKey` (744 x 1039), matching the web export.
At the clamped scale the card box is at most 264 x 370, so the full image is downsampled
rather than stretched, and the softness goes away. Cost: ~317 KB per distinct card against
~23 KB, so a 40-distinct-card deck pulls ~12 MB instead of ~1 MB. That is one in-cluster
fetch per distinct card at 8 in flight, against a 15-minute deferred-reply budget - the
existing `MAX_IN_FLIGHT = 8` and a raised per-request timeout cover it.

Raise `FETCH_TIMEOUT_MS` from 5s to 10s to match the web's `IMG_TIMEOUT_MS`, since the
payload is now 13x larger.

### Make failures loud

`fetchThumb` and `cardImage` keep returning null - a missing image must never cost the
reply - but each logs once, at `warn`, with the card id and the reason. The render logs a
single summary line with the counts, so a fully-broken image host is one line rather than
sixty.

Log lines carry the card id and the failure, never the URL: the fetch base can be an
internal hostname and logs are the wrong place for infrastructure topology.

## Deployment

Three things outside the diff, all required:

1. **Set `IMAGE_FETCH_BASE_URL`** on the bot to the in-cluster RustFS service
   (`http://svc-app-rustfs-<hash>.proj-reveliocards-<hash>.svc.cluster.local:9000/images`)
   and **restore `IMAGE_BASE_URL` to `https://portkey.revelio.cards/images`**, which is
   what Discord fetches.
2. **Raise the bot pod's memory limit to at least 640Mi** (request 256Mi). The clamp bounds
   the peak at ~374 MB, and a limit under that OOM-kills `/deck` on a large deck however
   correct the code is. This is the change that actually stops the crash; the clamp is what
   makes the number knowable.
3. Confirm the current termination reason before shipping - `kubectl describe pod` should
   show `OOMKilled` / exit code 137. Everything above follows from a measurement made on a
   developer machine; if production died some other way, Phase 1 changes.

## Phases

| Phase | Plan | Delivers |
| --- | --- | --- |
| 1 | `2026-09-17-deck-image-phase-1-bounded-render.md` | Pixel budget, loud failures. `/deck` survives any deck. |
| 2 | `2026-09-17-deck-image-phase-2-image-base-split.md` | `IMAGE_FETCH_BASE_URL`, compose fix. Art actually loads. |
| 3 | `2026-09-17-deck-image-phase-3-png-and-full-art.md` | PNG output, full-resolution art. |

Phase 1 lands before Phase 2 on purpose. Phase 2 is what makes the images load, and
loading them is what pushes memory over the edge; shipping it first would reproduce the
production crash on a machine where it is harder to see.

## Revision, 2026-09-17 (implementation)

Two numbers above were measured against **thumb** sources and did not survive Phase 3,
which switched the renderer to full card art. Re-measured on the implemented branch, at
`MAX_SHEET_PIXELS` candidates, against the local RustFS:

| Budget | Sheet | Peak RSS | PNG | Posted |
| --- | --- | ---: | ---: | --- |
| 12 Mpx (as specced) | 8.9 Mpx, 60 entries | 464 MB | 13.93 MB | WebP fallback |
| 6 Mpx | 6.0 Mpx | 404 MB | 9.31 MB | WebP fallback |
| 5 Mpx | 5.0 Mpx, 60 entries | 358 MB | 7.75 MB | PNG |
| 5 Mpx | 5.0 Mpx, 200 entries | 405 MB | 8.14 MB | PNG |

So full art costs roughly `215 MB + 28 MB per megapixel` of peak RSS and `1.6 MB per
megapixel` of PNG, against the `200 + 14.5` and ~0.5 MB/Mpx this document derived from
thumbs. At the specced 12 Mpx the sheet both breaks the memory estimate and exceeds
Discord's attachment limit, so "`/deck` posts a PNG" would have been false for any deck
past roughly 20 grouped entries. **`MAX_SHEET_PIXELS` shipped at 5 Mpx**, which keeps every
deck size inside the 9 MB attachment guard and inside the 640Mi pod limit this document
already asks for. The Deployment section is otherwise unchanged.

Section headers cost as much sheet height as a row of cards, so entries map to megapixels
far less generously than the tables above suggest: a 12-entry deck over six sections is
already 5.9 Mpx at 2x. The clamp therefore bites on ordinary decks, not only on huge ones,
and full art is what keeps those renders crisp at the reduced scale.

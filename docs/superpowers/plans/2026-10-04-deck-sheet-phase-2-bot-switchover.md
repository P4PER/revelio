# Deck Sheet Render Service — Phase 2 (Bot Switchover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/deck` asks `@revelio/sheet` for the picture and uploads what comes back, and the bot stops carrying an image toolchain.

**Architecture:** A thin HTTP client in `bot/src/data/sheet.ts` builds a `DeckSheetRequest` from the `PublicDeck` the command already has, sends Discord's attachment limit as its byte ceiling, and returns the bytes with the file name the response's content type implies. `/deck`'s existing try/catch becomes the whole failure design: any non-200, timeout or unreachable service falls through to the list embed. Then the painter, the font, the fontconfig file, sharp, and the Dockerfile steps that exist for them are deleted.

**Tech Stack:** TypeScript, Node 22, discord.js 14, zod 3, vitest, Docker.

**Spec:** `docs/superpowers/specs/2026-10-04-deck-sheet-render-service-design.md`

## Global Constraints

- **Phase 1 must be merged and the service must be deployed before this lands.** A rolled bot has no painter; until the service answers, `/deck` degrades to the list embed.
- **`/deck` must never fail because a picture failed.** Every error path ends in the list embed.
- **The attachment is named for the format it actually is**, `deck.png` or `deck.webp`: `media.discordapp.net` transcodes by extension, so WebP bytes under a `.png` name break the inline image for some clients. The name travels with the bytes.
- **Discord's attachment ceiling is 9_000_000 bytes** (10 MB real, with headroom). The bot states it; the service derives its pixel budget from it.
- **The bot keeps `IMAGE_BASE_URL` as the public host Discord fetches.** It must not gain `IMAGE_FETCH_BASE_URL` - that variable exists only on the deployed branch, and this phase is what makes it unnecessary.
- **Every command still defers first**, every personal reply stays ephemeral, every string still comes from `bot/src/i18n/{en,de}.json`.
- **Types:** `type` aliases only, `import type` for type-only imports, declaration order types -> constants -> helpers -> exported functions.
- **Comments are ASCII only.** Conventional Commits, scope `bot`. No tool attribution.
- All commands run from `app/`.

---

### Task 1: The bot learns where the service is

**Files:**
- Modify: `bot/src/env.ts`, `bot/.env.example`, `docker-compose.yml` (bot service env)
- Test: `bot/test/env.test.ts`

**Interfaces:**
- Produces: `BotEnv.SHEET_SERVICE_URL: string`, `BotEnv.SHEET_TOKEN: string`. Task 2's client takes a `BotEnv`.

- [ ] **Step 1: Write the failing test**

Append to `bot/test/env.test.ts`:

```ts
describe('the render service', () => {
  it('requires a URL and a token', () => {
    for (const key of ['SHEET_SERVICE_URL', 'SHEET_TOKEN'] as const) {
      const { [key]: _dropped, ...rest } = complete
      let thrown: unknown
      try { parseEnv(rest) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(key)
    }
  })

  it('rejects a service URL that is not a URL', () => {
    let thrown: unknown
    try { parseEnv({ ...complete, SHEET_SERVICE_URL: 'sheet:8080' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).toContain('SHEET_SERVICE_URL')
  })
})
```

`complete` is the existing fixture at the top of that file; add the two keys to it:

```ts
  SHEET_SERVICE_URL: 'http://sheet:8080',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/bot -- test/env.test.ts`
Expected: FAIL — the parse succeeds without the keys, so the error assertions fail.

- [ ] **Step 3: Add the two variables**

In `bot/src/env.ts`, inside the `Env` object after `IMAGE_BASE_URL`:

```ts
  // The deck sheet render service. The bot draws no pictures itself: /deck posts
  // what this answers with, and falls back to the list embed when it does not.
  SHEET_SERVICE_URL: z.string().url(),
  SHEET_TOKEN: z.string().min(16),
```

Keep the `IMAGE_BASE_URL` comment accurate - it is now unambiguous, since nothing in this
process fetches an image any more:

```ts
  // Public, absolute. Goes into embed image URLs, which *Discord* fetches from
  // the public internet. Nothing in this process fetches a card image itself,
  // so there is only one image base here and no second one to confuse it with.
  IMAGE_BASE_URL: z.string().url(),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/bot -- test/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the variables**

In `bot/.env.example`, after the `SITE_BASE_URL` block:

```
# ---- Deck sheet render service -------------------------------------------
# The bot draws no images; /deck asks this service for the picture. Locally it
# is the compose `sheet` service on its published port. The token must match the
# one that service was started with.
SHEET_SERVICE_URL=http://localhost:8080
SHEET_TOKEN=local-dev-sheet-token
```

In `docker-compose.yml`, in the `bot` service's `environment` block (the container cannot
reach the host's published port, so it uses the service name):

```yaml
      SHEET_SERVICE_URL: http://sheet:8080
      SHEET_TOKEN: local-dev-sheet-token
```

Add `sheet` to the bot service's `depends_on` with no condition (the sheet service has no
healthcheck, and `/deck` survives it being down anyway):

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      meilisearch:
        condition: service_healthy
      sheet:
        condition: service_started
```

- [ ] **Step 6: Commit**

```bash
git add bot/src/env.ts bot/.env.example bot/test/env.test.ts docker-compose.yml
git commit -m "feat(bot): point the bot at the deck sheet render service"
```

---

### Task 2: The sheet client

**Files:**
- Create: `bot/src/data/sheet.ts`, `bot/test/sheet.test.ts`

**Interfaces:**
- Consumes: `DeckSheetRequest`, `pickSheetEntries`, `SHEET_LOCALES` from `@revelio/core`; `PublicDeck` from `bot/src/data/decks.ts`; `BotEnv` from Task 1.
- Produces: `requestDeckSheet(deck: PublicDeck, locale: string, env: BotEnv): Promise<DeckSheet>` and `type DeckSheet = { body: Buffer; name: string }`. Task 4's `/deck` calls it; Task 3's embed takes the `name`.

- [ ] **Step 1: Write the failing test**

`bot/test/sheet.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { requestDeckSheet } from '../src/data/sheet'
import type { PublicDeck } from '../src/data/decks'
import type { BotEnv } from '../src/env'

afterEach(() => { vi.unstubAllGlobals() })

function view(cardId: string): DeckCardView {
  return {
    cardId, zone: 'main', quantity: 2, name: `Card ${cardId}`, cost: 3, damage: null,
    setCode: 'base', number: '1', lesson: null, isOfficial: true, legality: 'legal',
    isLesson: false, isStartingCharacter: false, imageVersion: 4, artCropVersion: null,
    orientation: null, types: ['creature'],
  }
}

const deck = {
  id: 'abc', name: 'Charms Aggro', format: 'classic', ownerUsername: 'seeker',
  character: null, main: [], sideboard: [], entries: [view('harry')],
  mainCount: 2, sideboardCount: 0, topLesson: null, status: 'legal',
} as unknown as PublicDeck

const env = {
  SHEET_SERVICE_URL: 'http://sheet:8080',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
} as unknown as BotEnv

function stubFetch(body: string, init: ResponseInit) {
  const fetchMock = vi.fn(async () => new Response(body, init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('requestDeckSheet', () => {
  it("posts the sheet contract with Discord's byte ceiling", async () => {
    const fetchMock = stubFetch('png-bytes', { status: 200, headers: { 'content-type': 'image/png' } })
    const out = await requestDeckSheet(deck, 'de', env)

    expect(out.name).toBe('deck.png')
    expect(out.body.toString()).toBe('png-bytes')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://sheet:8080/render')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer a-token-at-least-16-chars')
    const sent = JSON.parse(init.body as string)
    expect(sent.locale).toBe('de')
    expect(sent.maxBytes).toBe(9_000_000)
    expect(sent.deck).toEqual({ name: 'Charms Aggro', format: 'classic' })
    // Narrowed to the painted fields: cost and legality never reach a pixel and
    // would only widen the service's cache key.
    expect(sent.entries[0]).toEqual({
      cardId: 'harry', zone: 'main', quantity: 2, name: 'Card harry',
      setCode: 'base', types: ['creature'], imageVersion: 4, orientation: null,
    })
  })

  it('names the attachment for the format it got back', async () => {
    stubFetch('webp-bytes', { status: 200, headers: { 'content-type': 'image/webp' } })
    expect((await requestDeckSheet(deck, 'en', env)).name).toBe('deck.webp')
  })

  it('falls back to English for a locale the sheet has no labels for', async () => {
    const fetchMock = stubFetch('png', { status: 200, headers: { 'content-type': 'image/png' } })
    await requestDeckSheet(deck, 'fr', env)
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).locale).toBe('en')
  })

  it('throws on any non-200 so /deck can fall back to the list', async () => {
    for (const status of [401, 400, 500, 503]) {
      stubFetch('nope', { status })
      let thrown: unknown
      try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(String(status))
    }
  })

  it('throws when the service never answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed') }))
    let thrown: unknown
    try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
    expect(thrown).toBeInstanceOf(Error)
  })

  it('trims a trailing slash off the service URL', async () => {
    const fetchMock = stubFetch('png', { status: 200, headers: { 'content-type': 'image/png' } })
    await requestDeckSheet(deck, 'en', { ...env, SHEET_SERVICE_URL: 'http://sheet:8080/' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://sheet:8080/render')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/bot -- test/sheet.test.ts`
Expected: FAIL — `Cannot find module '../src/data/sheet'`.

- [ ] **Step 3: Write the client**

`bot/src/data/sheet.ts`:

```ts
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
  })
  if (!res.ok) throw new Error(`sheet service answered ${res.status}`)
  const name = (res.headers.get('content-type') ?? '').startsWith('image/webp') ? 'deck.webp' : 'deck.png'
  return { body: Buffer.from(await res.arrayBuffer()), name }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/bot -- test/sheet.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add bot/src/data/sheet.ts bot/test/sheet.test.ts
git commit -m "feat(bot): fetch the deck sheet from the render service"
```

---

### Task 3: The embed names the attachment it was given

The service answers PNG normally and WebP when the PNG overshot the ceiling, so the file name is no longer a constant the embed can assume.

**Files:**
- Modify: `bot/src/discord/embeds/deck-embed.ts:7-13,70`
- Test: `bot/test/deck-embed.test.ts`

**Interfaces:**
- Produces: `DeckEmbedOptions` as a discriminated union - `{ locale, siteBase, view: 'list' }` or `{ locale, siteBase, view: 'image', imageName: string }`. `DECK_IMAGE_NAME` and `DeckView` are deleted. Task 4 builds both variants.

- [ ] **Step 1: Write the failing test**

In `bot/test/deck-embed.test.ts`, replace the assertions that use `DECK_IMAGE_NAME` with:

```ts
it('references the attachment it was told about', () => {
  const png = deckEmbed(deck, { locale: 'en', siteBase: 'https://revelio.cards', view: 'image', imageName: 'deck.png' })
  expect(png.data.image?.url).toBe('attachment://deck.png')
  // media.discordapp.net transcodes by extension, so the fallback's WebP has to
  // be referenced as a .webp or the inline image can come back broken.
  const webp = deckEmbed(deck, { locale: 'en', siteBase: 'https://revelio.cards', view: 'image', imageName: 'deck.webp' })
  expect(webp.data.image?.url).toBe('attachment://deck.webp')
})

it('has no image in the list view', () => {
  const list = deckEmbed(deck, { locale: 'en', siteBase: 'https://revelio.cards', view: 'list' })
  expect(list.data.image).toBeUndefined()
})
```

Remove the `DECK_IMAGE_NAME` import from that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @revelio/bot -- test/deck-embed.test.ts`
Expected: FAIL — `imageName` is not a known property, and the import of `DECK_IMAGE_NAME` still resolves.

- [ ] **Step 3: Change the options type and the image line**

In `bot/src/discord/embeds/deck-embed.ts`, replace lines 7-13 (`DeckView`, `DeckEmbedOptions`, `DECK_IMAGE_NAME`) with:

```ts
// The image view carries the attachment's file name because that is the only
// handle an embed has on an upload, and the render service picks the format it
// settled on - PNG, or WebP when the PNG overshot the attachment ceiling. A
// single constant here used to be enough, back when one painter picked one
// format for every sheet.
export type DeckEmbedOptions =
  | { locale: string; siteBase: string; view: 'list' }
  | { locale: string; siteBase: string; view: 'image'; imageName: string }
```

And at the `setImage` call (line 70):

```ts
    return embed.setImage(`attachment://${opts.imageName}`)
```

TypeScript narrows `opts` to the image variant inside the `view === 'image'` branch; if it
does not, the branch is testing something else and needs restructuring so it does.

- [ ] **Step 4: Run the tests**

Run: `npm test -w @revelio/bot -- test/deck-embed.test.ts && npm run typecheck -w @revelio/bot`
Expected: the embed tests PASS. The typecheck FAILS in `commands/deck.ts`, which still passes `view` without a name - Task 4 fixes that.

- [ ] **Step 5: Commit**

```bash
git add bot/src/discord/embeds/deck-embed.ts bot/test/deck-embed.test.ts
git commit -m "fix(bot): reference the deck attachment by the name it was uploaded under"
```

---

### Task 4: `/deck` calls the service

**Files:**
- Modify: `bot/src/discord/commands/deck.ts:1-10,30-70`
- Test: `bot/test/commands.test.ts` (the `/deck` block)

**Interfaces:**
- Consumes: `requestDeckSheet`/`DeckSheet` (Task 2), `DeckEmbedOptions` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Rewrite the command's test seam**

In `bot/test/commands.test.ts`:

```ts
import { requestDeckSheet } from '../src/data/sheet'

// The render service is exercised by sheet.test.ts and the service's own suite;
// here it is a seam, so /deck's two views and its fallback can be told apart
// without drawing anything.
vi.mock('../src/data/sheet', () => ({ requestDeckSheet: vi.fn() }))
```

In the `beforeEach`, replace the `renderDeckImage` arming with:

```ts
  // Armed here rather than in the factory: afterEach's restoreAllMocks strips a
  // factory implementation too, and a seam that resolves undefined would leave
  // /deck falling back to the list without any test saying so.
  vi.mocked(requestDeckSheet).mockResolvedValue({ body: Buffer.from('png'), name: 'deck.png' })
```

Replace the three `env:` fixtures' `IMAGE_FETCH_BASE_URL` entries (they only exist on the
deployed branch; on main there is nothing to remove) with the service's two variables:

```ts
    env: {
      IMAGE_BASE_URL: 'https://img.test',
      SITE_BASE_URL: 'https://revelio.cards',
      SHEET_SERVICE_URL: 'http://sheet:8080',
      SHEET_TOKEN: 'a-token-at-least-16-chars',
    },
```

And replace the former "renders from the fetch base" test with these:

```ts
  it('uploads the sheet under the name the service chose', async () => {
    vi.mocked(requestDeckSheet).mockResolvedValueOnce({ body: Buffer.from('webp'), name: 'deck.webp' })
    const interaction = fakeInteraction({ deck: 'abc' })
    await run('deck', interaction, deps)
    const [reply] = vi.mocked(interaction.editReply).mock.calls.at(-1)!
    expect(reply.files?.[0].name).toBe('deck.webp')
    expect(reply.embeds?.[0].data.image?.url).toBe('attachment://deck.webp')
  })

  it('falls back to the list embed when the service cannot answer', async () => {
    vi.mocked(requestDeckSheet).mockRejectedValueOnce(new Error('sheet service answered 503'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeInteraction({ deck: 'abc' })
    await run('deck', interaction, deps)
    const [reply] = vi.mocked(interaction.editReply).mock.calls.at(-1)!
    expect(reply.files).toBeUndefined()
    expect(reply.embeds?.[0].data.image).toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
```

(`run` and `deps` are the existing helpers in that file; keep using them as the surrounding
tests do.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/bot -- test/commands.test.ts`
Expected: FAIL — the module `../src/data/sheet` is mocked but `deck.ts` still imports the painter.

- [ ] **Step 3: Rewrite the command**

In `bot/src/discord/commands/deck.ts`, replace the painter import:

```ts
import { requestDeckSheet } from '../../data/sheet'
import { deckEmbed } from '../embeds/deck-embed'
```

(`DECK_IMAGE_NAME` and `DeckView` are gone; `AttachmentBuilder` stays.)

And the render block:

```ts
  const siteBase = deps.env.SITE_BASE_URL

  // A deck with no cards has no picture worth posting, and a sheet that cannot
  // be had must not cost the answer: both fall back to the list the embed can
  // always draw from the data already in hand. The bot draws nothing itself -
  // @revelio/sheet is the only process that paints a deck.
  const wantsImage = interaction.options.getString('view') !== 'list' && deck.entries.length > 0
  if (wantsImage) {
    try {
      const sheet = await requestDeckSheet(deck, locale, deps.env)
      await interaction.editReply({
        embeds: [deckEmbed(deck, { locale, siteBase, view: 'image', imageName: sheet.name })],
        files: [new AttachmentBuilder(sheet.body, { name: sheet.name })],
      })
      return
    } catch (err) {
      console.error('deck sheet render failed:', err)
    }
  }

  await interaction.editReply({ embeds: [deckEmbed(deck, { locale, siteBase, view: 'list' })] })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @revelio/bot && npm run typecheck -w @revelio/bot`
Expected: PASS and clean, except `test/deck-image.test.ts` and `test/text.test.ts`, which still
test the painter Task 5 deletes. If they pass, leave them; if the typecheck complains about
`deck-image.ts`, that is Task 5's work.

- [ ] **Step 5: Commit**

```bash
git add bot/src/discord/commands/deck.ts bot/test/commands.test.ts
git commit -m "feat(bot): post the deck sheet the render service draws"
```

---

### Task 5: Delete the painter and the toolchain it needed

**Files:**
- Delete: `bot/src/images/deck-image.ts`, `bot/src/images/text.ts`, `bot/src/images/Poppins-SemiBold.ttf`, `bot/src/images/fonts.conf` (the whole `bot/src/images/` directory), `bot/test/deck-image.test.ts`, `bot/test/text.test.ts`
- Modify: `bot/package.json` (drop `sharp`), `bot/build.mjs` (drop the asset copy and the `external`), `bot/Dockerfile` (drop the sharp install, the font copy, the fontconfig cache dir and the font proof)
- Modify: `bot/src/i18n/en.json`, `bot/src/i18n/de.json` (drop the 13 keys only the painter read)

**Interfaces:** removes `renderDeckImage`, `DeckImage`, `MAX_SHEET_PIXELS`, `sheetScale`, `usesFullArt`, `renderText`, `fitText` from the bot. Nothing in the bot consumes them after Task 4.

- [ ] **Step 1: Delete the files**

```bash
git rm -r bot/src/images bot/test/deck-image.test.ts bot/test/text.test.ts
```

- [ ] **Step 2: Delete the 13 catalog keys the painter was the only reader of**

`labelsFor` in the deleted `deck-image.ts` was the only consumer of these, in both locales:

- `deck.sheet.character`, `deck.sheet.main`, `deck.sheet.sideboard`
- `deck.group.creature`, `.spell`, `.item`, `.adventure`, `.location`, `.event`, `.match`, `.character`, `.lesson`, `.other`

Remove all 13 from **both** `bot/src/i18n/en.json` and `bot/src/i18n/de.json` - the sheet now
resolves them from core's catalog, and `catalog-parity.test.ts` fails if only one locale is
edited. **Keep `deck.format.classic` and `deck.format.revival`**: `mydecks.ts:49` and
`deck-embed.ts:65` read those, and they have nothing to do with the sheet.

Confirm nothing else referenced them:

```bash
grep -rn "deck.sheet\.\|deck.group\." bot/src
```

Expected: no hits at all (the catalogs included).

- [ ] **Step 3: Drop sharp from the manifest**

In `bot/package.json`, remove the `"sharp": "^0.35.3"` line from `dependencies`, then:

```bash
npm install
```

Expected: `package-lock.json` changes. sharp stays in the tree because `@revelio/sheet`
depends on it; what changes is that the bot no longer does.

- [ ] **Step 4: Simplify the bundler**

In `bot/build.mjs`, delete the `external: ['sharp']` line and its comment, and delete the
asset copy block (the `mkdir`/`copyFile` loop) and the `copyFile, mkdir` import. The banner
comment stays - `discord.js` is still CJS, which is the whole reason it exists.

- [ ] **Step 5: Strip the Dockerfile**

In `bot/Dockerfile`, delete:

- the `RUN npm install --prefix /sharp ...` step and its comment,
- `COPY --from=build --chown=bot:nodejs /sharp/node_modules ./node_modules`,
- the `COPY ... Poppins-SemiBold.ttf ... fonts.conf ./` line,
- the `RUN mkdir -p /var/cache/fontconfig ...` step and its comment,
- the `RUN test -s /app/Poppins-SemiBold.ttf ...` line, and
- the `RUN node -e "const s=require('sharp') ..."` font proof and its comment.

Keep the entry-guard grep (`RUN env -i node bot/dist/bot.mjs 2>&1 | grep -q 'bot failed to start:'`):
it guards a bundling trap, not sharp. The runtime stage then copies the bundle and nothing
else, so it needs no `node_modules` at all.

- [ ] **Step 6: Verify the whole suite and the image**

Run:

```bash
npm test -w @revelio/bot && npm run typecheck && npm run lint
npm run build -w @revelio/bot && ls -l bot/dist
docker build -f bot/Dockerfile -t revelio-bot:local .
docker images revelio-bot:local
```

Expected: tests and typecheck green; `bot/dist` holds `bot.mjs` alone (no `.ttf`, no
`fonts.conf`); the image builds and measures roughly **165 MB against the 195 MB it was** -
that 30 MB is sharp and libvips leaving. Record both numbers for the PR.

- [ ] **Step 7: Prove the bundle still boots**

Run: `docker run --rm --env-file /dev/null revelio-bot:local || true`
Expected: it exits non-zero printing `bot failed to start: Invalid bot environment:` and the
missing variable names - including `SHEET_SERVICE_URL` and `SHEET_TOKEN`. A different error,
or a silent exit, means the bundle is broken rather than the env.

- [ ] **Step 8: Commit**

```bash
git add bot/package.json bot/build.mjs bot/Dockerfile bot/src/i18n/en.json bot/src/i18n/de.json package-lock.json
git commit -m "refactor(bot): drop sharp and the bundled font with the painter"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md` (the bot's image bullets and the `sharp` paragraph)

- [ ] **Step 1: Rewrite the three passages this phase falsified**

1. In **Image builds**, the paragraph beginning "**`bot` has one external dependency: `sharp`**"
   is now false. Replace it with:

```markdown
- **`bot` has no external dependencies left**: the bundle is the whole runtime. It used to
  carry `sharp` (195 MB against 165 MB), a bundled Poppins face, a `fonts.conf` and a
  build-stage render that proved the font resolved - all for the one command that drew a
  picture. `@revelio/sheet` draws it now, and that image carries them instead.
```

2. In **Discord bot specifics**, replace the `thumbKey` bullet and the "Two image bases"
   bullet with:

```markdown
- **The bot draws nothing.** `/deck` asks `@revelio/sheet` for the sheet
  (`bot/src/data/sheet.ts`) and uploads what comes back; any non-200, timeout or unreachable
  service falls through to the list embed, which the command can always draw from data in
  hand. The byte ceiling it sends (9 MB) is what the service derives its pixel budget from.
- **The attachment is named for the format it came back as**, `deck.png` or `deck.webp`:
  `media.discordapp.net` transcodes by file extension, so WebP bytes under a `.png` name
  break the inline image for some clients. `requestDeckSheet` returns the name with the
  bytes and the embed's image view takes it.
- **One image base.** `IMAGE_BASE_URL` goes into embed URLs, which **Discord** fetches from
  the public internet, so it must be the public bucket host. Nothing in this process fetches
  a card image itself any more, so there is no second base and nothing to confuse it with -
  the render service has its own `IMAGE_BASE_URL`, pointed at the store's internal address.
- Card images in embeds use `thumbKey` (300px), never the full `imageKey`.
```

- [ ] **Step 2: Full verification**

Run: `npm run check -w @revelio/db && npm run verify -w @revelio/db && npm run lint && npm run typecheck && npm test`
Expected: all green. Note the bot's test count before and after (two suites are gone).

- [ ] **Step 3: Commit**

```bash
git add ../CLAUDE.md
git commit -m "docs(bot): record that the sheet is drawn by the render service"
```

---

## Phase 2 definition of done

- `/deck` posts a picture in the local stack with `docker compose --profile bot up bot sheet`, and still answers with a list when `sheet` is stopped.
- `npm test`, `npm run lint`, `npm run typecheck` green.
- `bot/src/images/` is gone, `sharp` is not in `bot/package.json`, and the bot image measures ~165 MB.
- The PR body's `## Deployment` says: set `SHEET_SERVICE_URL` and `SHEET_TOKEN` on the bot, **remove `IMAGE_FETCH_BASE_URL`** from the bot's deployment env, and **lower the bot pod's memory limit to 256Mi (request 64Mi)** - the 640Mi it runs with exists only for the renderer that is now somewhere else.

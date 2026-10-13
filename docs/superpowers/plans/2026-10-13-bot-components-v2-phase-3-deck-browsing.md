# Bot Components V2, Phase 3: Deck browsing - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every deck message to Components V2 (`/deck` and its prompts included), add a
private `/decks` browser over public decks, turn `/mydecks` into the same browser over the
caller's own decks, and let either one open a deck (sheet included) and post it to the channel.

**Architecture:** `v2/deck-view.ts` replaces `deck-embed.ts` for every path; `deck-delivery.ts`
lifts `/deck`'s sheet-or-list delivery out of the command so the browsers can reuse it.
`components/deck-browser.ts` registers the deck kinds of the phase 1 codec. Every deck read on a
click re-resolves the clicking user and goes through `getDeckAccess` / `getDeckView`, the same
two checks `/deck`'s prompt uses. After this phase no embeds remain: `embeds/` is deleted.

**Tech Stack:** TypeScript, discord.js 14.27, Drizzle (`@revelio/db`), Vitest, Testcontainers
(for the one db query change).

**Spec:** `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md`, section 6 (and 1-3).

**Depends on:** phases 1 and 2 on this branch (`v2/` incl. `rows`, `pager`, `plain`;
`components/` incl. `isEntityId`; `test/helpers/{v2,discord,meili}.ts`).

## Global Constraints

- Branch `feat/bot-components-v2`. Conventional Commits, scope `bot` / `db` / `core` / `web`,
  signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`, no tool attribution.
- Commands run from `app/` with `/usr/local/bin/npm`. Postgres-backed tests need Docker (Testcontainers).
- `/decks` and `/mydecks` defer **ephemerally** as their first statement.
- **A private deck is never posted without its owner's say-so.** A click that reads a deck
  re-resolves the clicker with `resolveLinkedUser` and checks `getDeckAccess(db, id, viewer)`;
  the deck is loaded as its owner only when access is `own-private`, otherwise as nobody.
- A channel never gets a link to a private deck's page (`linkPage`).
- Every post to a channel: `postTarget(..., { needsFiles: true })`, then `channel.send`; a
  failure that is not a `DiscordAPIError` is never retried as the list.
- Deck names and author handles are user content: through `plain()` wherever a text display
  renders them.
- Every message through `v2Message` / `v2Edit`; 40 components, 4000 text characters at most.
- Strings from `bot/src/i18n/{en,de}.json`, both catalogs; ASCII-only code comments.

## Review Focus

- A deck named `[Click me](https://evil.example)` posted to a channel must render as text, not as
  a masked link under the bot's name. Pinned in Task 2.
- A deck made private (or deleted) between drawing the browser and pressing Open or Post must
  read as not found, never shown or posted. Pinned in Task 5.
- Pressing Post on someone else's private deck id (a tampered `dp` id) must answer not found.
  Pinned in Task 5.
- Going Back from an opened deck must drop the sheet attachment, or the image lingers under the
  list. Pinned in Task 5 (`v2Edit` sends `attachments: []`).
- A user who unlinks or is banned while a `/mydecks` browser is open must stop seeing their
  private decks on the next click. Pinned in Task 6.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/db/src/queries/deck-browse.ts` | modify | `listPublicDecks` takes `pageSize` |
| `app/bot/src/data/decks.ts` | modify | `browsePublicDecks`, `pageOwnDecks` |
| `app/bot/src/links.ts` | modify | `decksUrl` |
| `app/bot/src/discord/v2/deck-view.ts` | create | one deck as a V2 container |
| `app/bot/src/discord/deck-delivery.ts` | create | `deliverDeck` (sheet, else list) moved out of `commands/deck.ts` |
| `app/bot/src/discord/commands/deck.ts` | modify | V2 messages, uses `deck-delivery.ts` |
| `app/bot/src/discord/components/deck-prompts.ts` | modify | prompts as V2 |
| `app/bot/src/discord/v2/deck-browser-view.ts` | create | `publicDecksView`, `ownDecksView` |
| `app/bot/src/discord/components/deck-browser.ts` | create | handlers `d dl df ds do dp`, `renderDeckBrowser` |
| `app/bot/src/discord/commands/decks.ts` | create | `/decks` |
| `app/bot/src/discord/commands/mydecks.ts` | modify | the own-decks browser |
| `app/bot/src/discord/commands/index.ts`, `components/index.ts` | modify | register |
| `app/bot/src/discord/handle-interaction.ts` | modify | the `replied` error branch goes V2 |
| `app/bot/src/discord/embeds/` | delete | `deck-embed.ts`, `inline-grid.ts` |
| `app/core/src/bot-commands.ts` | modify | `decks` |
| `app/web/messages/{en,de}.json` | modify | `docs.commands.decks` |
| tests | see tasks | |

---

### Task 1: `listPublicDecks` takes a page size

**Files:**
- Modify: `app/db/src/queries/deck-browse.ts`
- Test: `app/ingest/test/deck-browse.test.ts`

**Interfaces:**
- Produces: `ListPublicDecksInput.pageSize?: number` (default stays 24; the result's `pageSize`
  reports the one used).

- [ ] **Step 1: Write the failing test**

Add to the `listPublicDecks` describe block in `app/ingest/test/deck-browse.test.ts` (it already
seeds public decks for `u1`/`u2`; reuse them):

```ts
  it('honours a smaller page size and keeps 24 by default', async () => {
    const small = await listPublicDecks(ctx.db, { pageSize: 1 })
    expect(small.entries).toHaveLength(1)
    expect(small.pageSize).toBe(1)
    expect(small.pageCount).toBe(small.total)
    expect((await listPublicDecks(ctx.db, {})).pageSize).toBe(24)
  })
```

Run: `/usr/local/bin/npm test -w @revelio/ingest -- test/deck-browse.test.ts`
Expected: FAIL (`pageSize` ignored). Run only this file: other ingest tests wipe the dev
Meilisearch indexes.

- [ ] **Step 2: Implement**

In `ListPublicDecksInput` add `pageSize?: number` with the comment
"The Discord bot pages five at a time; the web page keeps PUBLIC_PAGE_SIZE." In
`listPublicDecks`, add `const pageSize = input.pageSize && input.pageSize >= 1 ? Math.floor(input.pageSize) : PUBLIC_PAGE_SIZE`
and use `pageSize` in place of `PUBLIC_PAGE_SIZE` for `pageCount`, `.limit`, `.offset` and the
returned `pageSize`.

- [ ] **Step 3: Run the test**

Run: `/usr/local/bin/npm test -w @revelio/ingest -- test/deck-browse.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/db/src/queries/deck-browse.ts app/ingest/test/deck-browse.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): let listPublicDecks take a page size"
```

---

### Task 2: The deck view

**Files:**
- Create: `app/bot/src/discord/v2/deck-view.ts`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/deck-view.test.ts` (ported from `deck-embed.test.ts`)

**Interfaces:**
- Consumes: `DeckView` (`data/decks.ts`), `container`, `text`, `plain`, `linkButton`, `lessonColor`.
- Produces: `type DeckViewOptions = { locale: string; siteBase: string; linkPage: boolean; imageName?: string; lead?: string; actions?: ButtonBuilder[] }`,
  `deckView(deck: DeckView, opts: DeckViewOptions): ContainerBuilder[]`.

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `deck.openSite` | `Open on revelio.cards` | `Auf revelio.cards öffnen` |
| `deck.characterLine` | `Starting character: {name}` | `Startcharakter: {name}` |

- [ ] **Step 2: Write the failing test**

`app/bot/test/deck-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle } from 'discord.js'
import { deckView, type DeckViewOptions } from '../src/discord/v2/deck-view'
import type { DeckView } from '../src/data/decks'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, mediaUrls, textOf } from './helpers/v2'

const deck: DeckView = {
  id: 'abc123',
  name: 'Charms Aggro',
  format: 'classic',
  ownerUsername: 'seeker',
  visibility: 'public',
  character: { name: 'Harry Potter', quantity: 1, cost: null, lesson: null, setCode: 'BS', number: '1' },
  main: [
    { name: 'Charms Lesson', quantity: 8, cost: 0, lesson: 'charms', setCode: 'BS', number: '112' },
    { name: 'Alohomora', quantity: 4, cost: 2, lesson: 'charms', setCode: 'BS', number: '75' },
  ],
  sideboard: [{ name: 'Nimbus 2000', quantity: 2, cost: 4, lesson: 'quidditch', setCode: 'QC', number: '8' }],
  entries: [],
  mainCount: 12,
  sideboardCount: 2,
  topLesson: 'charms',
  status: 'incomplete',
}
const opts: DeckViewOptions = { locale: 'en', siteBase: 'https://revelio.cards', linkPage: true }
const view = (d: DeckView = deck, o: Partial<DeckViewOptions> = {}) => ({ components: deckView(d, { ...opts, ...o }) })

describe('deckView', () => {
  it('heads with the deck name, owner, format, legality and character', () => {
    expect(textOf(view())).toMatch(
      /^## Charms Aggro\nby seeker · Classic · Incomplete · Starting character: Harry Potter/,
    )
  })

  it('credits revelio.cards when the owner has no handle', () => {
    expect(textOf(view({ ...deck, ownerUsername: null }))).toContain('shared on revelio.cards')
  })

  it('tints the container with the top lesson', () => {
    expect(deckView(deck, opts)[0].toJSON().accent_color).toBe(0x0069a9)
  })

  it('lists each zone with the printing of every card', () => {
    const t = textOf(view())
    expect(t).toContain('**Main deck (12)**\n8x Charms Lesson (BS 112)\n4x Alohomora (BS 75)')
    expect(t).toContain('**Sideboard (2)**\n2x Nimbus 2000 (QC 8)')
  })

  it('shows the sheet instead of the lists when it has one', () => {
    const v = view(deck, { imageName: 'deck.webp' })
    expect(mediaUrls(v)).toEqual(['attachment://deck.webp'])
    expect(textOf(v)).not.toContain('Main deck')
  })

  it('links the deck page only when allowed', () => {
    expect(buttonsOf(view()).find((b) => b.url)?.url).toBe('https://revelio.cards/decks/abc123')
    expect(buttonsOf(view(deck, { linkPage: false }))).toHaveLength(0)
  })

  it('puts a lead line first and actions ahead of the link', () => {
    const back = new ButtonBuilder().setCustomId('v1:d:p:1:-:0:-:').setLabel('Back').setStyle(ButtonStyle.Secondary)
    const v = view(deck, { lead: '<@1> shared a deck.', actions: [back] })
    expect(textOf(v)).toMatch(/^<@1> shared a deck\.\n## Charms Aggro/)
    expect(buttonsOf(v).map((b) => b.label)).toEqual(['Back', 'Open on revelio.cards'])
  })

  it('renders a hostile deck name as text, not as a link', () => {
    const t = textOf(view({ ...deck, name: '[Click me](https://evil.example)', ownerUsername: '**boss**' }))
    expect(t).toContain('## \\[Click me\\]\\(https://evil.example\\)')
    expect(t).toContain('by \\*\\*boss\\*\\*')
  })

  it('stays inside the text budget for a huge deck, saying how many it left out', () => {
    const main = Array.from({ length: 120 }, (_, i) => ({
      name: `A long card name number ${i}`, quantity: 1, cost: i, lesson: null, setCode: 'BS', number: String(i),
    }))
    const big = { ...deck, main, sideboard: main, mainCount: 120, sideboardCount: 120 }
    const v = view(big)
    expect(measure(v.components).text).toBeLessThanOrEqual(4000)
    expect(textOf(v)).toMatch(/\.\.\. and \d+ more/)
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/deck-view.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`app/bot/src/discord/v2/deck-view.ts`:

```ts
import {
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type ButtonBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import type { DeckEntryView, DeckView } from '../../data/decks'
import { t } from '../../i18n/t'
import { deckUrl } from '../../links'
import { container, lessonColor, linkButton, plain, text } from './parts'

export type DeckViewOptions = {
  locale: string
  siteBase: string
  // false leaves the page link off: a private deck posted to a channel would
  // otherwise link a page that answers "not found" for everyone but its owner.
  // Required, so a new caller has to decide rather than link by default.
  linkPage: boolean
  // The sheet's attachment name; the render service picks PNG or WebP, and the
  // gallery can only point at an upload by its name. Absent: the text lists.
  imageName?: string
  // A line above the heading: who shared the deck, on a post to a channel.
  lead?: string
  // Buttons ahead of the page link (Back and Post in the browser).
  actions?: ButtonBuilder[]
}

// Two zones of whole lines inside the message's 4000-character text budget,
// with room for the heading and the lead.
const LIST_LIMIT = 1500

// "(BS 75)" names the printing, since the same card name recurs across sets.
// Left off when the card row did not resolve rather than printing "( )".
function entryLine(entry: DeckEntryView): string {
  const line = `${entry.quantity}x ${entry.name}`
  return entry.setCode && entry.number ? `${line} (${entry.setCode} ${entry.number})` : line
}

// Whole lines, then how many copies were left out. A truncated card name would
// read as a data bug; an explicit remainder reads as a summary. The remainder
// counts copies because the zone heading does.
function cardList(entries: DeckEntryView[], locale: string): string {
  const lines: string[] = []
  let used = 0
  let left = entries.reduce((n, e) => n + e.quantity, 0)
  for (const entry of entries) {
    const line = entryLine(entry)
    const remainder = t(locale, 'deck.more', { count: left })
    if (used + line.length + 1 + remainder.length + 1 > LIST_LIMIT) {
      lines.push(remainder)
      break
    }
    lines.push(line)
    used += line.length + 1
    left -= entry.quantity
  }
  return lines.join('\n')
}

function metaLine(deck: DeckView, locale: string): string {
  return [
    deck.ownerUsername
      ? t(locale, 'deck.footer', { owner: plain(deck.ownerUsername) })
      : t(locale, 'deck.footer.anonymous'),
    t(locale, `deck.format.${deck.format}`),
    t(locale, `deck.status.${deck.status}`),
    deck.character ? t(locale, 'deck.characterLine', { name: deck.character.name }) : '',
  ].filter(Boolean).join(' · ')
}

export function deckView(deck: DeckView, opts: DeckViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container(lessonColor(deck.topLesson))
  const heading = `## ${plain(deck.name)}\n${metaLine(deck, locale)}`
  view.addTextDisplayComponents(text(opts.lead ? `${opts.lead}\n${heading}` : heading))

  if (opts.imageName) {
    // The picture shows every card, so the text lists would only repeat it.
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${opts.imageName}`).setDescription(deck.name),
      ),
    )
  } else {
    if (deck.main.length) {
      view.addTextDisplayComponents(text(
        `**${t(locale, 'deck.field.main', { count: deck.mainCount })}**\n${cardList(deck.main, locale)}`,
      ))
    }
    if (deck.sideboard.length) {
      view.addTextDisplayComponents(text(
        `**${t(locale, 'deck.field.sideboard', { count: deck.sideboardCount })}**\n${cardList(deck.sideboard, locale)}`,
      ))
    }
  }

  const buttons = [
    ...(opts.actions ?? []),
    ...(opts.linkPage ? [linkButton(deckUrl(opts.siteBase, deck.id, locale), t(locale, 'deck.openSite'))] : []),
  ]
  // An action row with nothing in it is a 400.
  if (buttons.length) {
    view.addActionRowComponents(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons))
  }
  return [view]
}
```

- [ ] **Step 4: Run the test**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/deck-view.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/bot/src/discord/v2/deck-view.ts app/bot/src/i18n app/bot/test/deck-view.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): draw a deck as a components v2 container"
```

---

### Task 3: `/deck` and its prompts on V2; one delivery path

**Files:**
- Create: `app/bot/src/discord/deck-delivery.ts`
- Modify: `app/bot/src/discord/commands/deck.ts`, `app/bot/src/discord/components/deck-prompts.ts`,
  `app/bot/src/discord/handle-interaction.ts`, `app/bot/src/i18n/{en,de}.json`
- Delete: `app/bot/src/discord/embeds/deck-embed.ts`, `app/bot/src/discord/embeds/inline-grid.ts`,
  `app/bot/test/deck-embed.test.ts`, `app/bot/test/inline-grid.test.ts`
- Test: `app/bot/test/commands.test.ts` (`/deck` blocks), `app/bot/test/deck-prompts.test.ts`,
  `app/bot/test/handle-interaction.test.ts`, `app/bot/test/helpers/v2.ts`

**Interfaces:**
- Produces: `type SendDeck = (components: ContainerBuilder[], files: AttachmentBuilder[]) => Promise<unknown>`,
  `type DeliveryOptions = { audience: 'channel' | 'caller'; sendEdits: boolean; listOnly: boolean; lead?: string; actions?: ButtonBuilder[] }`,
  `deliverDeck(send: SendDeck, deck: DeckView, deps: Deps, locale: string, opts: DeliveryOptions): Promise<void>`;
  `visibilityPrompt` / `pickPrompt` return `V2Message`;
  test helper `titleOf(payload): string` (the first `## ` line).
- Rename: catalog key `deck.sharedBy` -> `post.sharedDeck` (same text).

- [ ] **Step 1: Add `titleOf` to the test reader**

In `app/bot/test/helpers/v2.ts`:

```ts
// The text of the first "## " heading, markdown escapes left as they are.
export function titleOf(payload: Payload): string {
  return /^## (.*)$/m.exec(textOf(payload))?.[1] ?? ''
}
```

- [ ] **Step 2: Rewrite the `/deck` assertions first**

In `app/bot/test/commands.test.ts`, `describe('/deck')` and `describe('an ambiguous name')`,
import `textOf`, `titleOf`, `mediaUrls`, `buttonsOf` from `./helpers/v2` and apply this table to
every assertion (the arrange and act parts of each test stay as they are):

| old assertion | new assertion |
|---|---|
| `payload.embeds[0].toJSON().title).toBe(X)` | `titleOf(payload)).toBe(X)` |
| `payload.embeds[0].toJSON().image?.url).toBe('attachment://N')` | `mediaUrls(payload)).toEqual(['attachment://N'])` |
| `payload.embeds[0].toJSON().image).toBeUndefined()` | `mediaUrls(payload)).toEqual([])` |
| `...fields?.some((f) => f.name.startsWith('Main deck'))).toBe(B)` | `textOf(payload).includes('Main deck')).toBe(B)` |
| `payload.files).toBeUndefined()` | `payload.files).toEqual([])` |
| `....embeds[0].toJSON().url).toBeUndefined()` | `buttonsOf(...).some((b) => b.url)).toBe(false)` |
| `....embeds[0].toJSON().url).toBe(U)` | `buttonsOf(...).find((b) => b.url)?.url).toBe(U)` |
| `toHaveBeenCalledWith({ content: X, components: [] })` (also with `embeds: [], files: []`) | `textOf(<mock>.mock.calls[<i>][0])).toBe(X)` for the same call index |
| `expect.objectContaining({ content: X })` on a reply | `textOf(...)).toBe(X)` plus `.flags` is `MessageFlags.IsComponentsV2 \| MessageFlags.Ephemeral` where the old one asserted `flags: MessageFlags.Ephemeral` |
| `posted.content).toBe('<@111> shared a deck.')` + title | `textOf(posted)).toMatch(/^<@111> shared a deck\.\n## Charms Aggro/)` |
| `shown.content).toBe('')` | `shown.flags).toBe(MessageFlags.IsComponentsV2)` |
| `prompt.content).toContain(X)` / `.toBe(X)` | `textOf(prompt)).toContain(X)` / `.toBe(X)` |
| `....update.mock.calls[0][0].content)` | `textOf(....update.mock.calls[0][0]))` |

In `deck-prompts.test.ts` apply the same `content` -> `textOf` rule.

In `handle-interaction.test.ts`, `strips components when a command fails after replying`
becomes:

```ts
  it('replaces a /deck prompt with a V2 status line when the command fails after replying', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: true, deferred: false })
    await run(interaction)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toBe(ERROR)
  })
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/commands.test.ts test/deck-prompts.test.ts test/handle-interaction.test.ts`
Expected: the rewritten `/deck` assertions FAIL (still embeds and content).

- [ ] **Step 3: Rename the catalog key**

Both catalogs: `"deck.sharedBy"` -> `"post.sharedDeck"`, text unchanged. Remove
`deck.field.format` and `deck.field.legality` (the meta line uses the values alone).

- [ ] **Step 4: Create `deck-delivery.ts`**

Move `deliverDeck` out of `commands/deck.ts` with its comments, rewritten for V2:

```ts
import {
  AttachmentBuilder,
  DiscordAPIError,
  type ButtonBuilder,
  type ContainerBuilder,
} from 'discord.js'
import type { Deps } from '../clients'
import type { DeckView } from '../data/decks'
import { requestDeckSheet } from '../data/sheet'
import { deckView } from './v2/deck-view'

// Whichever call puts the deck where it belongs: an edit of the bot's own
// reply, or a plain message in the channel. The caller wraps it in v2Edit or
// v2Message, the two shapes those calls take.
export type SendDeck = (components: ContainerBuilder[], files: AttachmentBuilder[]) => Promise<unknown>

export type DeliveryOptions = {
  // Who reads the message: decides whether a private deck's page is linked.
  audience: 'channel' | 'caller'
  // True when `send` edits a message, which can always be retried as the list;
  // false for a new message, which may only be retried after a rejection
  // Discord answered.
  sendEdits: boolean
  listOnly: boolean
  lead?: string
  actions?: ButtonBuilder[]
}

// A deck with no cards has no picture worth posting, and a sheet that cannot
// be had must not cost the answer: both fall back to the list the view can
// always draw from the data already in hand. The bot draws nothing itself -
// @revelio/sheet is the only process that paints a deck.
export async function deliverDeck(
  send: SendDeck,
  deck: DeckView,
  deps: Deps,
  locale: string,
  opts: DeliveryOptions,
): Promise<void> {
  // Only the owner can open a private deck's page, so a channel never gets a
  // link to one; the caller alone may be that owner.
  const base = {
    locale,
    siteBase: deps.env.SITE_BASE_URL,
    linkPage: opts.audience === 'caller' || deck.visibility === 'public',
    lead: opts.lead,
    actions: opts.actions,
  }
  if (!opts.listOnly && deck.entries.length > 0) {
    const sheet = await requestDeckSheet(deck, locale, deps.env).catch((err: unknown) => {
      console.error('deck sheet render failed:', err)
      return null
    })
    if (sheet) {
      try {
        await send(
          deckView(deck, { ...base, imageName: sheet.name }),
          [new AttachmentBuilder(sheet.body, { name: sheet.name })],
        )
        return
      } catch (err) {
        // Discord can reject the upload itself (an attachment it will not
        // take), which must cost the picture rather than the answer. An edit
        // of the bot's own message can always be retried as the list. A new
        // message only after a rejection Discord answered, which proves
        // nothing was posted: a timeout or a dropped socket may have reached
        // the channel, and a retry could then post the deck twice.
        if (!opts.sendEdits && !(err instanceof DiscordAPIError)) throw err
        console.error('deck sheet upload failed:', err)
      }
    }
  }
  await send(deckView(deck, base), [])
}
```

- [ ] **Step 5: Switch `commands/deck.ts` over**

- Delete `DeckPayload`, the local `deliverDeck`, `DeckContext.deps` usage of `deckEmbed`; keep
  `DeckContext = { deps: Deps; locale: string; listOnly: boolean }`.
- Every `deliverDeck(send, deck, ctx, audience, sendEdits)` call becomes
  `deliverDeck(send, deck, ctx.deps, ctx.locale, { audience, sendEdits, listOnly: ctx.listOnly, lead })`
  with `send` one of:
  - command reply: `(c, f) => interaction.editReply(v2Edit(c, f))`
  - "Only show me": `(c, f) => component.editReply(v2Edit(c, f))`
  - channel post: `(c, f) => target.send(v2Message(c, f))`, with
    `lead: t(locale, 'post.sharedDeck', { user: \`<@${component.user.id}>\` })` and no `content`.
- `component.update({ content: X, components: [] })` -> `component.update(textEdit(X))`.
- `fail`: `await component.editReply(textEdit(t(locale, key))).catch(() => {})` (one shape for
  both cases: `textEdit` clears earlier attachments).
- `interaction.reply({ content: X, flags: MessageFlags.Ephemeral })` ->
  `interaction.reply({ ...textMessage(X), flags: EPHEMERAL_V2 })`.
- `interaction.editReply({ content: X })` -> `interaction.editReply(textEdit(X))`.
- `expire`: `editReply(textEdit(t(locale, 'deck.prompt.expired')))`.
- The prompt reply: `interaction.reply({ ...prompt, flags: EPHEMERAL_V2, withResponse: true })`.
- Imports: drop `AttachmentBuilder`, `EmbedBuilder`, `deckEmbed`, `requestDeckSheet`; add
  `deliverDeck` from `../deck-delivery`, `EPHEMERAL_V2`, `textEdit`, `textMessage`, `v2Edit`,
  `v2Message` from `../v2/send`.

- [ ] **Step 6: Prompts as V2**

`components/deck-prompts.ts`: delete the `DeckPrompt` type; both builders return `V2Message`:

```ts
export function visibilityPrompt(name: string, locale: string): V2Message {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(POST_ID).setLabel(t(locale, 'deck.private.post')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(SELF_ID).setLabel(t(locale, 'deck.private.self')).setStyle(ButtonStyle.Secondary),
  )
  // The deck's name is the owner's text: plain() keeps it from rendering as markdown.
  return v2Message([
    container()
      .addTextDisplayComponents(text(t(locale, 'deck.private.prompt', { name: plain(name) })))
      .addActionRowComponents(row),
  ])
}

export function pickPrompt(options: DeckSuggestion[], locale: string): V2Message {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PICK_ID)
    .setPlaceholder(t(locale, 'deck.pick.placeholder'))
    .addOptions(options.slice(0, MAX_OPTIONS).map((o) => ({ label: suggestionLabel(o, locale), value: o.id })))
  return v2Message([
    container()
      .addTextDisplayComponents(text(t(locale, 'deck.ambiguous')))
      .addActionRowComponents(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)),
  ])
}
```

Imports: `container`, `plain`, `text` from `../v2/parts`; `v2Message`, `type V2Message` from `../v2/send`.

- [ ] **Step 7: One error shape in the router**

In `handle-interaction.ts`, the command `catch` collapses to two branches now that every reply is V2:

```ts
    if (interaction.deferred || interaction.replied) {
      // Every reply is V2. An answer the command already sent may carry
      // buttons or a menu whose collector is gone with the error; the status
      // line replaces them.
      await interaction.editReply(textEdit(content)).catch(() => {})
    } else {
      await interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 }).catch(() => {})
    }
```

- [ ] **Step 8: Delete the embeds**

```bash
git rm -r app/bot/src/discord/embeds app/bot/test/deck-embed.test.ts app/bot/test/inline-grid.test.ts
```

- [ ] **Step 9: Run the bot suite**

Run: `/usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck`
Expected: PASS. Any `/deck` test still failing is a missed row of the Step 2 table, not a
behaviour change: the flows themselves are untouched.

- [ ] **Step 10: Commit**

```bash
git add -A app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): send /deck and its prompts as components v2"
```

---

### Task 4: Deck pages from the data layer, and the browser views

**Files:**
- Modify: `app/bot/src/data/decks.ts`, `app/bot/src/links.ts`, `app/bot/src/i18n/{en,de}.json`
- Create: `app/bot/src/discord/v2/deck-browser-view.ts`
- Test: `app/bot/test/decks.test.ts`, `app/bot/test/links.test.ts`, `app/bot/test/deck-browser-view.test.ts`

**Interfaces:**
- Consumes: `DeckBrowseState`, `DECK_SORTS`, `encodeCustomId` (phase 1), `pagerRow`, `plain` (phase 2).
- Produces:
  - `DECK_PAGE_SIZE = 5`, `OWN_PAGE_SIZE = 10`,
  - `type PublicDeckPage = { entries: PublicDeckEntry[]; total: number; page: number; pages: number }`,
    `browsePublicDecks(db: DB, state: DeckBrowseState): Promise<PublicDeckPage>`,
  - `type OwnDeckPage = { decks: DeckSummary[]; total: number; page: number; pages: number }`,
    `pageOwnDecks(db: DB, userId: string, page: number): Promise<OwnDeckPage>`,
  - `decksUrl(siteBase: string, locale: string, state: Pick<DeckBrowseState, 'query' | 'format' | 'sort' | 'lesson'>): string`,
  - `type DeckBrowserOptions = { locale: string; imageBase: string; siteBase: string }`,
    `publicDecksView(page: PublicDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[]`,
    `ownDecksView(page: OwnDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[]`.

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `decks.header` | `Public decks: **{total}**` | `Öffentliche Decks: **{total}**` |
| `decks.header.query` | `Public decks for "{query}": **{total}**` | `Öffentliche Decks für „{query}“: **{total}**` |
| `decks.noResults` | `No public deck matched.` | `Kein öffentliches Deck passt dazu.` |
| `decks.pageEmpty` | `No more decks on this page. Go back one.` | `Auf dieser Seite gibt es keine weiteren Decks. Geh eine zurück.` |
| `decks.open.placeholder` | `Open a deck...` | `Deck öffnen ...` |
| `decks.filter.format` | `Format` | `Format` |
| `decks.filter.sort` | `Order` | `Reihenfolge` |
| `decks.filter.lesson` | `Lesson` | `Lektion` |
| `decks.sort.likes` | `Most liked` | `Meiste Likes` |
| `decks.sort.views` | `Most viewed` | `Meiste Aufrufe` |
| `decks.sort.newest` | `Newest` | `Neueste` |
| `decks.sort.updated` | `Recently updated` | `Zuletzt aktualisiert` |
| `decks.row.stats` | `{likes} likes · {cards} cards` | `{likes} Likes · {cards} Karten` |

- [ ] **Step 2: Write the failing tests**

`decks.test.ts`, new block:

```ts
import { browsePublicDecks, pageOwnDecks } from '../src/data/decks'

describe('deck pages', () => {
  it('asks listPublicDecks for five, with the browser state as its filters', async () => {
    const list = vi.spyOn(dbModule, 'listPublicDecks').mockResolvedValue({
      entries: [], total: 12, page: 2, pageCount: 3, pageSize: 5,
    })
    const page = await browsePublicDecks({} as never, {
      scope: 'public', page: 2, format: 'revival', sort: 'views', lesson: 'charms', query: '@ann',
    })
    expect(list).toHaveBeenCalledWith({}, {
      search: '@ann', lessons: ['charms'], format: 'revival', sort: 'views', page: 2, pageSize: 5,
    })
    expect(page).toMatchObject({ total: 12, page: 2, pages: 3 })
  })

  it('pages the owner\'s decks ten at a time, newest edit first as listed', async () => {
    const decks = Array.from({ length: 23 }, (_, i) => ({ id: `d${i}` }))
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue(decks as never)
    const page = await pageOwnDecks({} as never, 'u1', 3)
    expect(page.decks.map((d) => d.id)).toEqual(['d20', 'd21', 'd22'])
    expect(page).toMatchObject({ total: 23, page: 3, pages: 3 })
  })
})
```

(`decks.test.ts` already imports `vi` and `* as dbModule`; add them if not.)

`links.test.ts`:

```ts
  it('links the public deck browser with only non-default state', () => {
    expect(decksUrl('https://revelio.cards', 'de', { query: 'aggro', format: null, sort: 'likes', lesson: 'charms' }))
      .toBe('https://revelio.cards/de/decks?q=aggro&lesson=charms')
    expect(decksUrl('https://revelio.cards', 'en', { query: '', format: 'classic', sort: 'views', lesson: null }))
      .toBe('https://revelio.cards/decks?format=classic&sort=views')
  })
```

`app/bot/test/deck-browser-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { DeckSummary, PublicDeckEntry } from '@revelio/db'
import { ownDecksView, publicDecksView } from '../src/discord/v2/deck-browser-view'
import type { DeckBrowseState } from '../src/discord/components/custom-id'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, mediaUrls, textOf } from './helpers/v2'

const entry = (n: number, over: Partial<PublicDeckEntry> = {}): PublicDeckEntry => ({
  id: `00000000-0000-0000-0000-00000000000${n}`, name: `Deck ${n}`, format: 'classic', author: 'ann',
  lessons: ['charms'], likeCount: 3, viewCount: 9, cardCount: 61, updatedAt: '2026-10-01T00:00:00.000Z',
  likedByViewer: false, starterCardId: 'base-1', starterArtCropVersion: 2, ...over,
})
const state: DeckBrowseState = { scope: 'public', page: 1, format: null, sort: 'likes', lesson: null, query: '' }
const opts = { locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards' }
const pub = (entries: PublicDeckEntry[], over = {}) =>
  ({ components: publicDecksView({ entries, total: 12, page: 1, pages: 3, ...over }, state, opts) })
const ids = (v: { components: unknown[] }) => flatten(v).flatMap((n) => (n.custom_id ? [n.custom_id] : []))

describe('publicDecksView', () => {
  it('stays inside the limits at its fullest', () => {
    const full = publicDecksView(
      { entries: [1, 2, 3, 4, 5].map((n) => entry(n)), total: 99, page: 2, pages: 20 },
      { ...state, page: 2, format: 'classic', lesson: 'charms', query: 'x'.repeat(50) }, opts,
    )
    expect(measure(full).components).toBeLessThanOrEqual(40)
  })

  it('shows each deck with its starter art, author, format and counts', () => {
    const v = pub([entry(1)])
    expect(textOf(v)).toContain('**Deck 1** · @ann · Classic\n3 likes · 61 cards · Charms')
    expect(mediaUrls(v)).toEqual(['https://img.test/cards/art-crop/base-1.2.webp'])
  })

  it('draws a deck without a starting character as text', () => {
    const v = pub([entry(1, { starterCardId: null, starterArtCropVersion: null })])
    expect(flatten(v).some((n) => n.type === ComponentType.Section)).toBe(false)
  })

  it('escapes a hostile deck name and author', () => {
    const t = textOf(pub([entry(1, { name: '[x](https://evil.example)', author: '*a*' })]))
    expect(t).toContain('**\\[x\\]\\(https://evil.example\\)** · @\\*a\\*')
  })

  it('offers open, format, order and lesson menus and the site link', () => {
    const v = pub([entry(1)])
    const kinds = ids(v).map((id) => id.split(':')[1])
    expect(kinds).toEqual(expect.arrayContaining(['do', 'df', 'ds', 'dl', 'd', 'pg']))
    expect(buttonsOf(v).find((b) => b.url)?.url).toBe('https://revelio.cards/decks')
  })

  it('says when nothing matched and keeps the menus', () => {
    const v = pub([], { total: 0, pages: 1 })
    expect(textOf(v)).toContain('No public deck matched.')
    expect(ids(v).some((id) => id.startsWith('v1:do:'))).toBe(false)
    expect(ids(v).some((id) => id.startsWith('v1:df:'))).toBe(true)
  })

  it('gives every control a distinct id', () => {
    const all = ids(pub([1, 2, 3].map((n) => entry(n))))
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('ownDecksView', () => {
  const own = (n: number, over: Partial<DeckSummary> = {}): DeckSummary => ({
    id: `d${n}`, name: `Mine ${n}`, format: 'classic', visibility: 'private', cardCount: 61,
    mainCount: 60, hasCharacter: true, characterName: 'Harry', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
  })
  const mine: DeckBrowseState = { ...state, scope: 'mine', sort: 'updated' }

  it('lists the page of own decks, private ones marked, with an open menu', () => {
    const v = { components: ownDecksView({ decks: [own(1), own(2, { visibility: 'public' })], total: 2, page: 1, pages: 1 }, mine, opts) }
    expect(textOf(v)).toContain('Your decks (2)')
    expect(textOf(v)).toContain('🔒 **Mine 1** · Classic · 60 cards')
    expect(textOf(v)).toContain('**Mine 2** · Classic · 60 cards')
    expect(textOf(v)).not.toContain('🔒 **Mine 2**')
    expect(ids(v).some((id) => id.startsWith('v1:do:m:'))).toBe(true)
  })

  it('has no filter menus', () => {
    const v = { components: ownDecksView({ decks: [own(1)], total: 1, page: 1, pages: 1 }, mine, opts) }
    expect(ids(v).some((id) => /^v1:d[fsl]:/.test(id))).toBe(false)
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/decks.test.ts test/links.test.ts test/deck-browser-view.test.ts`
Expected: FAIL (functions and module missing).

- [ ] **Step 3: Implement the data helpers**

In `bot/src/data/decks.ts` (types up top, constants after, per the declaration order):

```ts
import { listDecksByUser, listPublicDecks, type DeckSummary, type PublicDeckEntry } from '@revelio/db'
import type { DeckBrowseState } from '../discord/components/custom-id'

export type PublicDeckPage = { entries: PublicDeckEntry[]; total: number; page: number; pages: number }
export type OwnDeckPage = { decks: DeckSummary[]; total: number; page: number; pages: number }

// Five rows with art keep /decks at 32 of Discord's 40 components; own decks
// are text rows, so ten fit.
export const DECK_PAGE_SIZE = 5
export const OWN_PAGE_SIZE = 10

// The web /decks page's own query, so the two can never disagree on what
// matches - "@handle" included.
export async function browsePublicDecks(db: DB, state: DeckBrowseState): Promise<PublicDeckPage> {
  const res = await listPublicDecks(db, {
    search: state.query || undefined,
    lessons: state.lesson ? [state.lesson] : undefined,
    format: state.format,
    sort: state.sort,
    page: state.page,
    pageSize: DECK_PAGE_SIZE,
  })
  return { entries: res.entries, total: res.total, page: res.page, pages: res.pageCount }
}

// listDecksByUser returns every deck, newest edit first; a user's own list is
// small enough to page in memory.
export async function pageOwnDecks(db: DB, userId: string, page: number): Promise<OwnDeckPage> {
  const all = await listDecksByUser(db, userId)
  const pages = Math.max(1, Math.ceil(all.length / OWN_PAGE_SIZE))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * OWN_PAGE_SIZE
  return { decks: all.slice(start, start + OWN_PAGE_SIZE), total: all.length, page: current, pages }
}
```

Note the `browsePublicDecks` test asserts `search: '@ann'`; with an empty query it passes
`undefined`, which `listPublicDecks` treats as no search.

In `links.ts`:

```ts
// The web's public deck browser (web/src/lib/browse-params.ts): q, lesson,
// format and sort, each only when it differs from the default.
export function decksUrl(
  siteBase: string,
  locale: string,
  state: { query: string; format: string | null; sort: string; lesson: string | null },
): string {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)
  if (state.lesson) params.set('lesson', state.lesson)
  if (state.format) params.set('format', state.format)
  if (state.sort !== 'likes') params.set('sort', state.sort)
  const qs = params.toString()
  return `${localeRoot(siteBase, locale)}/decks${qs ? `?${qs}` : ''}`
}
```

- [ ] **Step 4: Implement the views**

`app/bot/src/discord/v2/deck-browser-view.ts`:

```ts
import {
  ActionRowBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ThumbnailBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { DeckFormat, LESSONS, artCropKey, attrLabel, imageUrl } from '@revelio/core'
import type { PublicDeckEntry } from '@revelio/db'
import { clampLabel } from '../../data/cards'
import type { OwnDeckPage, PublicDeckPage } from '../../data/decks'
import { t } from '../../i18n/t'
import { decksUrl } from '../../links'
import { DECK_SORTS, encodeCustomId, type DeckBrowseState } from '../components/custom-id'
import { pagerRow } from './pager'
import { container, linkButton, plain, text } from './parts'
import { ANY } from './search-view'

export type DeckBrowserOptions = { locale: string; imageBase: string; siteBase: string }

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

function select(
  kind: 'df' | 'ds' | 'dl',
  state: DeckBrowseState,
  placeholder: string,
  options: { value: string; label: string }[],
  current: string | null,
  withAny: boolean,
  locale: string,
): Row {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind, state }))
      .setPlaceholder(placeholder)
      .addOptions(
        ...(withAny ? [{ label: t(locale, 'browse.any'), value: ANY, default: current == null }] : []),
        ...options.map((o) => ({ label: o.label, value: o.value, default: o.value === current })),
      ),
  )
}

function deckRowText(entry: PublicDeckEntry, locale: string): string {
  const title = `**${plain(entry.name)}** · @${plain(entry.author)} · ${t(locale, `deck.format.${entry.format}`)}`
  const stats = [
    t(locale, 'decks.row.stats', { likes: entry.likeCount, cards: entry.cardCount }),
    entry.lessons.map((code) => attrLabel('lessons', code, locale)).join(', '),
  ].filter(Boolean).join(' · ')
  return `${title}\n${stats}`
}

function header(page: PublicDeckPage, state: DeckBrowseState, locale: string): string {
  if (page.total === 0) return t(locale, 'decks.noResults')
  if (page.entries.length === 0) return t(locale, 'decks.pageEmpty')
  const head = state.query
    ? t(locale, 'decks.header.query', { query: plain(state.query), total: page.total })
    : t(locale, 'decks.header', { total: page.total })
  const parts = [
    state.format ? t(locale, `deck.format.${state.format}`) : '',
    state.lesson ? attrLabel('lessons', state.lesson, locale) : '',
    t(locale, `decks.sort.${state.sort}`),
  ].filter(Boolean)
  return `${head} · ${parts.join(' · ')}`
}

function openMenu(state: DeckBrowseState, options: { id: string; label: string }[], locale: string): Row {
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: 'do', state }))
      .setPlaceholder(t(locale, 'decks.open.placeholder'))
      .addOptions(options.map((o) => ({ label: clampLabel(o.label), value: o.id }))),
  )
}

function pager(state: DeckBrowseState, page: number, pages: number, shown: number, pageSize: number, opts: DeckBrowserOptions, siteLink: boolean): Row {
  return pagerRow({
    locale: opts.locale,
    page,
    pages: Math.max(pages, page),
    hasNext: page < pages && shown === pageSize,
    prevId: encodeCustomId({ kind: 'd', state: { ...state, page: Math.max(1, page - 1) } }),
    nextId: encodeCustomId({ kind: 'd', state: { ...state, page: page + 1 } }),
    indicatorId: encodeCustomId({ kind: 'pg', of: 'decks' }),
    trailing: siteLink ? [linkButton(decksUrl(opts.siteBase, opts.locale, state), t(opts.locale, 'browse.site'))] : [],
  })
}

// /decks: header, up to five rows with the starter's art, an open menu,
// format, order and lesson menus, and the pager. 32 components at its fullest.
export function publicDecksView(page: PublicDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container().addTextDisplayComponents(text(header(page, state, locale)))
  if (page.entries.length) {
    view.addSeparatorComponents(new SeparatorBuilder())
    for (const entry of page.entries) {
      const content = deckRowText(entry, locale)
      if (entry.starterCardId && entry.starterArtCropVersion != null) {
        view.addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(text(content))
          .setThumbnailAccessory(new ThumbnailBuilder()
            .setURL(imageUrl(opts.imageBase, artCropKey(entry.starterCardId, entry.starterArtCropVersion)))
            .setDescription(entry.name)))
      } else {
        // A section must carry an accessory; no starter, no picture.
        view.addTextDisplayComponents(text(content))
      }
    }
    view.addSeparatorComponents(new SeparatorBuilder())
    view.addActionRowComponents(openMenu(state, page.entries.map((e) => ({ id: e.id, label: e.name })), locale))
  }
  view.addActionRowComponents(
    select('df', state, t(locale, 'decks.filter.format'),
      DeckFormat.options.map((f) => ({ value: f, label: t(locale, `deck.format.${f}`) })), state.format, true, locale),
    select('ds', state, t(locale, 'decks.filter.sort'),
      DECK_SORTS.map((s) => ({ value: s, label: t(locale, `decks.sort.${s}`) })), state.sort, false, locale),
    select('dl', state, t(locale, 'decks.filter.lesson'),
      LESSONS.map((l) => ({ value: l.code, label: attrLabel('lessons', l.code, locale) })), state.lesson, true, locale),
    pager(state, page.page, page.pages, page.entries.length, 5, opts, true),
  )
  return [view]
}

// /mydecks: the caller's own decks as text rows, private ones marked, an open
// menu and the pager. No filters: a user's own list is short.
export function ownDecksView(page: OwnDeckPage, state: DeckBrowseState, opts: DeckBrowserOptions): ContainerBuilder[] {
  const { locale } = opts
  const lines = page.decks.map((d) => {
    const line = `**${plain(d.name)}** · ${t(locale, `deck.format.${d.format}`)} · ${t(locale, 'decks.cards', { count: d.mainCount })}`
    return d.visibility === 'private' ? `🔒 ${line}` : line
  })
  const view = container().addTextDisplayComponents(
    text(`${t(locale, 'decks.title', { count: page.total })}\n${lines.join('\n')}`),
  )
  view.addActionRowComponents(
    openMenu(state, page.decks.map((d) => ({ id: d.id, label: d.name })), locale),
    pager(state, page.page, page.pages, page.decks.length, 10, opts, false),
  )
  return [view]
}
```

Add catalog key `decks.cards`: en `{count} cards`, de `{count} Karten`. (The old `/mydecks`
keys are removed in Task 6, once nothing reads them.)

- [ ] **Step 5: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/decks.test.ts test/links.test.ts test/deck-browser-view.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/bot/src app/bot/test/decks.test.ts app/bot/test/links.test.ts app/bot/test/deck-browser-view.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): page decks for the bot and draw the deck browsers"
```

---

### Task 5: `/decks` - browse, open, post

**Files:**
- Create: `app/bot/src/discord/components/deck-browser.ts`, `app/bot/src/discord/commands/decks.ts`
- Modify: `app/bot/src/discord/components/index.ts`, `app/bot/src/discord/commands/index.ts`
- Modify: `app/core/src/bot-commands.ts`, `app/web/messages/{en,de}.json`, `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/deck-browser.test.ts`

**Interfaces:**
- Consumes: `browsePublicDecks`, `pageOwnDecks`, `publicDecksView`, `ownDecksView` (Task 4),
  `deliverDeck` (Task 3), `getDeckView`, `resolveLinkedUser`, `getDeckAccess`, `postTarget`,
  `refusal`, `isEntityId`.
- Produces: `renderDeckBrowser(deps: Deps, state: DeckBrowseState, locale: string, discordUserId: string): Promise<V2Edit>`,
  `DECK_HANDLERS` (`d`, `dl`, `df`, `ds`, `do`, `dp`), the `/decks` command.

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `command.decks.description` | `Browse public decks` | `Öffentliche Decks durchsuchen` |
| `command.decks.option.query` | `Deck name, or @author` | `Deckname oder @Autor` |
| `command.decks.option.format` | `Only this format` | `Nur dieses Format` |
| `command.decks.option.sort` | `Order` | `Reihenfolge` |
| `deck.back` | `Back to decks` | `Zurück zu den Decks` |
| `deck.post` | `Post to channel` | `Im Kanal posten` |

- [ ] **Step 2: Write the failing tests**

`app/bot/test/deck-browser.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { handleInteraction } from '../src/discord/handle-interaction'
import { encodeCustomId, type DeckBrowseState } from '../src/discord/components/custom-id'
import { requestDeckSheet } from '../src/data/sheet'
import { fakeClick, fakeDeps, type ClickOptions } from './helpers/discord'
import { buttonsOf, mediaUrls, textOf, titleOf } from './helpers/v2'

vi.mock('../src/data/sheet', () => ({ requestDeckSheet: vi.fn() }))

const ID = '6f1c2a5e-9a8b-4c3d-8e7f-0a1b2c3d4e5f'
const state: DeckBrowseState = { scope: 'public', page: 1, format: null, sort: 'likes', lesson: null, query: '' }
const entry = (n: number) => ({
  id: `${ID.slice(0, -1)}${n}`, name: `Deck ${n}`, format: 'classic', author: 'ann', lessons: [],
  likeCount: 1, viewCount: 1, cardCount: 60, updatedAt: '2026-10-01T00:00:00.000Z', likedByViewer: false,
  starterCardId: null, starterArtCropVersion: null,
})
// The shape getDeckForViewer resolves to, as decks.test.ts builds it.
const stored = (visibility: 'public' | 'private') => ({
  deck: { id: ID, name: 'Charms Aggro', format: 'classic', visibility },
  views: [{ cardId: 'c1', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms',
    setCode: 'BS', number: '75', isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false }],
  ownerUsername: 'ann',
  viewCount: 0,
})

beforeEach(() => {
  vi.mocked(requestDeckSheet).mockResolvedValue({ body: Buffer.from('png'), name: 'deck.png' })
  vi.spyOn(dbModule, 'listPublicDecks').mockResolvedValue({
    entries: [1, 2, 3].map(entry) as never, total: 3, page: 1, pageCount: 1, pageSize: 5,
  })
})
afterEach(() => { vi.restoreAllMocks() })

const linkedAs = (id: string | null) => vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(id)
const click = (id: string, opts: ClickOptions = {}) => {
  const c = fakeClick(id, opts)
  return { c, done: handleInteraction(c as never, fakeDeps([], 0) as never) }
}

describe('/decks', () => {
  it('defers ephemerally first and answers with the browser', async () => {
    const interaction = {
      locale: 'en', user: { id: '111' }, inGuild: () => true,
      deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined),
      options: { getString: (n: string) => (n === 'sort' ? 'views' : null) },
    }
    await COMMANDS.get('decks')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(dbModule.listPublicDecks).toHaveBeenCalledWith({}, expect.objectContaining({ sort: 'views', pageSize: 5 }))
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('Public decks: **3**')
  })

  it('applies a format and resets to page 1, ignoring a value that is not one', async () => {
    await click(encodeCustomId({ kind: 'df', state: { ...state, page: 4 } }), { values: ['revival'] }).done
    await click(encodeCustomId({ kind: 'df', state }), { values: ['legacy'] }).done
    const calls = vi.mocked(dbModule.listPublicDecks).mock.calls
    expect(calls[0][1]).toMatchObject({ format: 'revival', page: 1 })
    expect(calls[1][1]).toMatchObject({ format: null })
  })
})

describe('opening a deck', () => {
  it('shows the sheet in place with Back and Post', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('public') as never)
    const { c, done } = click(encodeCustomId({ kind: 'do', state }), { values: [ID] })
    await done
    expect(c.deferUpdate).toHaveBeenCalled()
    const payload = c.editReply.mock.calls[0][0]
    expect(titleOf(payload)).toBe('Charms Aggro')
    expect(mediaUrls(payload)).toEqual(['attachment://deck.png'])
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Back to decks', 'Post to channel', 'Open on revelio.cards'])
  })

  // Made private or deleted since the browser was drawn.
  it('says not found for a deck the clicker may no longer see', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const { c, done } = click(encodeCustomId({ kind: 'do', state }), { values: [ID] })
    await done
    expect(textOf(c.reply.mock.calls[0][0])).toBe('No deck matched that name, link or id.')
    expect(c.reply.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(c.editReply).not.toHaveBeenCalled()
  })

  it('goes back and drops the sheet', async () => {
    const { c, done } = click(encodeCustomId({ kind: 'd', state }))
    await done
    expect(c.editReply.mock.calls[0][0].attachments).toEqual([])
  })
})

describe('posting a deck', () => {
  it('posts a public deck as nobody, naming who shared it', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    const read = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('public') as never)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(read).toHaveBeenCalledWith(expect.anything(), ID, null)
    const sent = c.channel.send.mock.calls[0][0]
    expect(textOf(sent)).toMatch(/^<@111> shared a deck\.\n## Charms Aggro/)
    expect(c.followUp).toHaveBeenCalled()
  })

  // Pressing Post on your own private deck is the owner's say-so.
  it('posts the owner\'s own private deck as its owner, without a page link', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'own-private', name: 'Charms Aggro' })
    const read = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stored('private') as never)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(read).toHaveBeenCalledWith(expect.anything(), ID, 'user-1')
    expect(buttonsOf(c.channel.send.mock.calls[0][0]).some((b) => b.url)).toBe(false)
  })

  it('answers not found for someone else\'s private deck and posts nothing', async () => {
    linkedAs('user-1')
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }))
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(textOf(c.reply.mock.calls[0][0])).toBe('No deck matched that name, link or id.')
  })

  it('refuses privately where the bot may not attach files', async () => {
    linkedAs(null)
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'Charms Aggro' })
    const { c, done } = click(encodeCustomId({ kind: 'dp', deckId: ID }), { allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(textOf(c.reply.mock.calls[0][0])).toMatch(/can't post in this channel/)
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/deck-browser.test.ts`
Expected: FAIL (no `/decks`, no deck handlers).

- [ ] **Step 3: Implement `deck-browser.ts`**

```ts
import { ButtonBuilder, ButtonStyle, DiscordAPIError, type MessageComponentInteraction } from 'discord.js'
import { DeckFormat, LESSONS } from '@revelio/core'
import { getDeckAccess } from '@revelio/db'
import type { Deps } from '../../clients'
import { browsePublicDecks, getDeckView, pageOwnDecks } from '../../data/decks'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { newDeckUrl, settingsUrl } from '../../links'
import { postTarget, refusal } from '../channel-post'
import { deliverDeck } from '../deck-delivery'
import { ownDecksView, publicDecksView } from '../v2/deck-browser-view'
import { ANY } from '../v2/search-view'
import { EPHEMERAL_V2, textEdit, textMessage, v2Edit, v2Message, type V2Edit } from '../v2/send'
import { DECK_SORTS, encodeCustomId, isEntityId, type CustomId, type DeckBrowseState, type DeckKind } from './custom-id'
import type { ComponentHandler } from './types'

type DeckStateId = { kind: DeckKind; state: DeckBrowseState }

const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPost' } as const

function isDeckState(id: CustomId): id is DeckStateId {
  return 'state' in id && 'scope' in id.state
}

function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

function privately(content: string) {
  return { ...textMessage(content), flags: EPHEMERAL_V2 }
}

// Resolved on every click, not carried in the id: resolveLinkedUser is where a
// ban or an unlink is enforced, and either can land while a browser is open.
export async function renderDeckBrowser(
  deps: Deps,
  state: DeckBrowseState,
  locale: string,
  discordUserId: string,
): Promise<V2Edit> {
  const opts = { locale, imageBase: deps.env.IMAGE_BASE_URL, siteBase: deps.env.SITE_BASE_URL }
  if (state.scope === 'public') {
    return v2Edit(publicDecksView(await browsePublicDecks(deps.db, state), state, opts))
  }
  const userId = await resolveLinkedUser(deps.db, discordUserId)
  if (!userId) return textEdit(t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }))
  const page = await pageOwnDecks(deps.db, userId, state.page)
  if (page.total === 0) return textEdit(t(locale, 'decks.empty', { url: newDeckUrl(deps.env.SITE_BASE_URL, locale) }))
  return v2Edit(ownDecksView(page, { ...state, page: page.page }, opts))
}

async function show(interaction: MessageComponentInteraction, deps: Deps, state: DeckBrowseState): Promise<void> {
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderDeckBrowser(deps, state, locale, interaction.user.id))
}

// The viewer a deck is read as on a click: the clicker's own account when the
// deck is theirs and private, nobody otherwise. Null when the clicker may not
// see it at all - deleted, someone else's private deck, or a tampered id.
async function readAs(deps: Deps, interaction: MessageComponentInteraction, deckId: string) {
  if (!isEntityId(deckId)) return null
  const viewer = await resolveLinkedUser(deps.db, interaction.user.id)
  const access = await getDeckAccess(deps.db, deckId, viewer)
  if (!access) return null
  return { loadAs: access.access === 'own-private' ? viewer : null }
}

const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  await show(interaction, deps, id.state)
}

const filterFormat: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const parsed = DeckFormat.safeParse(picked(interaction))
  await show(interaction, deps, { ...id.state, format: parsed.success ? parsed.data : null, page: 1 })
}

const filterSort: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const value = picked(interaction)
  const sort = DECK_SORTS.find((s) => s === value) ?? id.state.sort
  await show(interaction, deps, { ...id.state, sort, page: 1 })
}

const filterLesson: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const value = picked(interaction)
  await show(interaction, deps, { ...id.state, lesson: value && LESSON_CODES.includes(value) ? value : null, page: 1 })
}

const openDeck: ComponentHandler = async (interaction, id, deps) => {
  if (!isDeckState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  const deckId = picked(interaction) ?? ''
  // Two indexed reads before the acknowledgement keep a miss private and
  // inside the 3 s budget; the sheet render runs after deferUpdate.
  const reader = await readAs(deps, interaction, deckId)
  if (!reader) {
    await interaction.reply(privately(t(locale, 'deck.notFound')))
    return
  }
  await interaction.deferUpdate()
  const deck = await getDeckView(deps.db, deckId, reader.loadAs)
  if (!deck) {
    await interaction.editReply(await renderDeckBrowser(deps, id.state, locale, interaction.user.id))
    return
  }
  const actions = [
    new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'd', state: id.state }))
      .setLabel(t(locale, 'deck.back')).setStyle(ButtonStyle.Secondary),
    ...(interaction.inGuild()
      ? [new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'dp', deckId: deck.id }))
          .setLabel(t(locale, 'deck.post')).setStyle(ButtonStyle.Primary)]
      : []),
  ]
  await deliverDeck((c, f) => interaction.editReply(v2Edit(c, f)), deck, deps, locale, {
    audience: 'caller', sendEdits: true, listOnly: false, actions,
  })
}

// Pressing Post on your own private deck is the owner's explicit say-so, the
// same consent /deck's prompt asks for with "Post publicly". Anyone else's
// private deck reads as not found.
const postDeck: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'dp') return
  const locale = toRevelioLocale(interaction.locale)
  const reader = await readAs(deps, interaction, id.deckId)
  if (!reader) {
    await interaction.reply(privately(t(locale, 'deck.notFound')))
    return
  }
  const target = postTarget(interaction, { needsFiles: true })
  if (target.kind !== 'ok') {
    await interaction.reply(privately(t(locale, REFUSAL_KEYS[target.kind])))
    return
  }
  await interaction.deferUpdate()
  const deck = await getDeckView(deps.db, id.deckId, reader.loadAs)
  if (!deck) {
    await interaction.followUp(privately(t(locale, 'deck.notFound')))
    return
  }
  await target.channel.sendTyping().catch(() => {})
  try {
    await deliverDeck((c, f) => target.channel.send(v2Message(c, f)), deck, deps, locale, {
      audience: 'channel',
      sendEdits: false,
      listOnly: false,
      lead: t(locale, 'post.sharedDeck', { user: `<@${interaction.user.id}>` }),
    })
  } catch (err) {
    const refused = refusal(err)
    if (!refused || !(err instanceof DiscordAPIError)) throw err
    await interaction.followUp(privately(t(locale, REFUSAL_KEYS[refused])))
    return
  }
  await interaction.followUp(privately(t(locale, 'post.done')))
}

export const DECK_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['d', navigate],
  ['df', filterFormat],
  ['ds', filterSort],
  ['dl', filterLesson],
  ['do', openDeck],
  ['dp', postDeck],
]
```

`components/index.ts`: `new Map([...SEARCH_HANDLERS, ...DECK_HANDLERS])`.

- [ ] **Step 4: Implement `/decks`**

`app/bot/src/discord/commands/decks.ts`:

```ts
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { DeckFormat } from '@revelio/core'
import type { Deps } from '../../clients'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { clampQuery, DECK_SORTS, MAX_QUERY, type DeckBrowseState } from '../components/custom-id'
import { renderDeckBrowser } from '../components/deck-browser'

export const data = new SlashCommandBuilder()
  .setName('decks')
  .setDescription(t('en', 'command.decks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.decks.description') })
  .addStringOption((o) =>
    o.setName('query')
      .setDescription(t('en', 'command.decks.option.query'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.query') })
      .setMaxLength(MAX_QUERY),
  )
  .addStringOption((o) =>
    o.setName('format')
      .setDescription(t('en', 'command.decks.option.format'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.format') })
      .addChoices(...DeckFormat.options.map((value) => ({
        name: t('en', `deck.format.${value}`),
        name_localizations: { de: t('de', `deck.format.${value}`) },
        value,
      }))),
  )
  .addStringOption((o) =>
    o.setName('sort')
      .setDescription(t('en', 'command.decks.option.sort'))
      .setDescriptionLocalizations({ de: t('de', 'command.decks.option.sort') })
      .addChoices(...DECK_SORTS.map((value) => ({
        name: t('en', `decks.sort.${value}`),
        name_localizations: { de: t('de', `decks.sort.${value}`) },
        value,
      }))),
  )

export async function execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void> {
  // Private before anything else: browsing is the caller's; only a deck they
  // post reaches the channel.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)
  const format = DeckFormat.safeParse(interaction.options.getString('format'))
  const sort = DECK_SORTS.find((s) => s === interaction.options.getString('sort')) ?? 'likes'
  const state: DeckBrowseState = {
    scope: 'public',
    page: 1,
    format: format.success ? format.data : null,
    sort,
    lesson: null,
    query: clampQuery(interaction.options.getString('query') ?? ''),
  }
  await interaction.editReply(await renderDeckBrowser(deps, state, locale, interaction.user.id))
}
```

`commands/index.ts`: import `* as decks` and add it after `deck` in the array.

- [ ] **Step 5: Manifest and web docs catalog**

`core/src/bot-commands.ts`: `BotCommandName` gains `'decks'`; add after `deck`:

```ts
  {
    name: 'decks',
    ephemeral: true,
    linkRequired: false,
    options: [
      { name: 'query', type: 'string', required: false, autocomplete: false, maxLength: 50 },
      { name: 'format', type: 'string', required: false, autocomplete: false, values: ['classic', 'revival'] },
      { name: 'sort', type: 'string', required: false, autocomplete: false, values: ['likes', 'views', 'newest', 'updated'] },
    ],
  },
```

`web/messages/en.json`, `docs.commands`:

```json
      "decks": {
        "options": {
          "query": "Part of a deck name, or @ and part of an author's handle. Leave it out to browse every public deck.",
          "format": "Only decks of this format. The format menu on the reply changes it later.",
          "sort": "The order to browse in. Most liked by default."
        },
        "choices": {
          "format": { "classic": "Classic", "revival": "Revival" },
          "sort": { "likes": "Most liked", "views": "Most viewed", "newest": "Newest", "updated": "Recently updated" }
        }
      },
```

`web/messages/de.json`:

```json
      "decks": {
        "options": {
          "query": "Ein Teil eines Decknamens, oder @ und ein Teil des Handles einer Autorin oder eines Autors. Ohne Angabe durchsuchst du alle öffentlichen Decks.",
          "format": "Nur Decks dieses Formats. Das Format-Menü in der Antwort ändert es später.",
          "sort": "Die Reihenfolge beim Durchsuchen. Standardmäßig nach den meisten Likes."
        },
        "choices": {
          "format": { "classic": "Classic", "revival": "Revival" },
          "sort": { "likes": "Meiste Likes", "views": "Meiste Aufrufe", "newest": "Neueste", "updated": "Zuletzt aktualisiert" }
        }
      },
```

- [ ] **Step 6: Run the tests**

```bash
/usr/local/bin/npm test -w @revelio/bot -- test/deck-browser.test.ts test/command-manifest.test.ts test/catalog-parity.test.ts
/usr/local/bin/npm test -w web -- src/components/docs src/lib/docs
```

Expected: PASS. If a `getDeckForViewer` fixture shape in the test does not satisfy `getDeckView`,
copy the stub from `decks.test.ts`'s `describe('getDeckView')` instead of `stored()`.

- [ ] **Step 7: Commit**

```bash
git add app/bot app/core/src/bot-commands.ts app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): browse public decks with /decks and post one to the channel"
```

---

### Task 6: `/mydecks` becomes the own-decks browser

**Files:**
- Modify: `app/bot/src/discord/commands/mydecks.ts`
- Modify: `app/bot/src/i18n/{en,de}.json` (`command.mydecks.description`)
- Test: `app/bot/test/personal-commands.test.ts` (`/mydecks` block), `app/bot/test/deck-browser.test.ts`

**Interfaces:**
- Consumes: `renderDeckBrowser` (Task 5).

- [ ] **Step 1: Rewrite the `/mydecks` tests first**

Replace the `describe('/mydecks')` block of `personal-commands.test.ts` with:

```ts
describe('/mydecks', () => {
  const deck = (over: Record<string, unknown> = {}) => ({
    id: 'd1', name: 'Secret Brew', format: 'classic', visibility: 'private',
    mainCount: 60, cardCount: 61, hasCharacter: true, characterName: 'Harry',
    updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  })

  it('always replies ephemerally', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([])
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('lists private decks too, marked, since only the asker sees the reply', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([deck()] as never)
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('🔒 **Secret Brew**')
  })

  it('pages ten decks at a time', async () => {
    linked()
    const many = Array.from({ length: 25 }, (_, i) => deck({ id: `d${i}`, name: `Deck ${i}` }))
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue(many as never)
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    const text = textOf(interaction.editReply.mock.calls[0][0])
    expect(text).toContain('Your decks (25)')
    expect(text).toContain('Deck 9')
    expect(text).not.toContain('Deck 10')
  })

  it('offers the builder link when the user has no decks', async () => {
    linked()
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([])
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('/decks/new')
  })

  it('points an unlinked user at the settings page', async () => {
    unlinked()
    const interaction = fakeInteraction()
    await run('mydecks', interaction, fakeDeps())
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('https://revelio.cards/settings/connections')
  })
})
```

Add `user: { id: '111' }` to this file's `fakeInteraction` if absent (it is present). Add to
`deck-browser.test.ts`:

```ts
describe('an open /mydecks browser', () => {
  // Unlinked or banned since the browser was drawn: the next click must stop
  // showing private decks.
  it('re-resolves the account on every click', async () => {
    linkedAs(null)
    const list = vi.spyOn(dbModule, 'listDecksByUser')
    const { c, done } = click(encodeCustomId({ kind: 'd', state: { ...state, scope: 'mine', sort: 'updated', page: 2 } }))
    await done
    expect(list).not.toHaveBeenCalled()
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('/settings/connections')
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/personal-commands.test.ts test/deck-browser.test.ts`
Expected: the `/mydecks` command cases FAIL (still the 2000-character text list).

- [ ] **Step 2: Rewrite `mydecks.ts`**

```ts
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import type { DeckBrowseState } from '../components/custom-id'
import { renderDeckBrowser } from '../components/deck-browser'

export const data = new SlashCommandBuilder()
  .setName('mydecks')
  .setDescription(t('en', 'command.mydecks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.mydecks.description') })

const MINE: DeckBrowseState = { scope: 'mine', page: 1, format: null, sort: 'updated', lesson: null, query: '' }

export async function execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void> {
  // Ephemeral before anything else. Private decks are listed on purpose: only
  // the person who ran the command can read the reply.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderDeckBrowser(deps, MINE, locale, interaction.user.id))
}
```

Catalog: `command.mydecks.description` en `Browse your decks`, de `Deine Decks durchsuchen`.
`decks.title`, `decks.empty`, `link.required` and `deck.more` stay in use; remove `decks.line`,
`decks.visibility.public` and `decks.visibility.private` from both catalogs. `MESSAGE_LIMIT` and
the remainder logic go with the old body.

In `command-manifest.test.ts`, the linked-required test can now read `textOf(reply)` alone:
replace `expect(reply.content ?? textOf(reply)).toContain('/settings')` with
`expect(textOf(reply)).toContain('/settings')`.

- [ ] **Step 3: Run the bot suite**

Run: `/usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): turn /mydecks into a private browser of your decks"
```

---

### Task 7: Docs, then verify on the dev guild

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

- Architecture, `@revelio/bot` line: the commands are `/card`, `/search`, `/deck`, `/decks`,
  `/collection` and `/mydecks`.
- "Every personal reply is ephemeral": the list is `/search`, `/decks`, `/collection`, `/mydecks`.
- Replace "**`/deck` is the one exception**..." wording only where it says "embed": `/deck` still
  does its reads before answering.
- In the V2 bullet, drop "`/deck`'s deck message and prompts are still embeds and content until
  phase 3" - everything is V2 now.
- In the private-deck bullet, add: "The deck browsers' **Post to channel** on your own private
  deck is the same consent; every deck click re-resolves the clicker and re-reads access
  (`components/deck-browser.ts`). Deck names and handles go through `plain()`."
- "The bot draws nothing" bullet: "falls through to the list embed" -> "falls through to the text
  lists"; mention `discord/deck-delivery.ts` as where that happens.
- "The attachment is named for the format it came back as": "the embed's image view" -> "the
  deck view's gallery".

- [ ] **Step 2: Run the whole check suite**

From `app/`:
```bash
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm test -w @revelio/ingest -- test/deck-browse.test.ts test/deck-suggest.test.ts
/usr/local/bin/npm test -w web -- src/components/docs src/lib/docs src/components/discord
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm run build -w @revelio/bot
```

Expected: all green; record counts for the PR.

- [ ] **Step 3: Check by hand on the dev guild (English and German)**

Start the sheet service too (`docker compose up -d` covers it if it is in the default profile;
otherwise run it per `app/sheet`'s README) so sheets render.

- `/deck deck:<public deck>` - V2 deck with the sheet; `view:list` - text lists.
- `/deck` on your own private deck - V2 prompt; **Post publicly** and **Only show me** both work.
- `/decks` - five decks with starter art; change format, order and lesson; page.
- Open a deck: sheet, Back drops it, Post posts it with "shared by" and no ping.
- `/mydecks` - your decks with locks; open a private one; Post it: posted without a page link.
- Unlink Discord in Settings with a `/mydecks` browser open, press Next: the link prompt.
- A deck renamed to `[x](https://example.com)` renders as text when posted.

Screenshots of `/decks`, an opened deck and `/mydecks` for the PR.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe the deck browsers in CLAUDE.md"
```

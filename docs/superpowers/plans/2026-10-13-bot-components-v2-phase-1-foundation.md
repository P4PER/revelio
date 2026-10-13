# Bot Components V2, Phase 1: Foundation - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bot everything the browsers of phases 2 and 3 stand on - a V2 message layer
with a limits guard, a custom id codec, a component router and one shared channel-posting path -
and prove it end to end by moving `/card` and `/collection` to Components V2.

**Architecture:** `bot/src/discord/v2/` builds every V2 message (one container per message,
checked by `assertWithinLimits` before it leaves). `bot/src/discord/components/` holds the
stateless custom id codec and the `COMPONENTS` registry the router in `handle-interaction.ts`
dispatches to; phase 1 registers no handlers, so the router only answers stale ids.
`channel-post.ts` is `/deck`'s posting checks lifted out unchanged so phase 2 can share them.

**Tech Stack:** TypeScript, discord.js 14.27 (Components V2 builders, `MessageFlags.IsComponentsV2`),
Zod 3, Vitest. All commands run from `app/`, with `/usr/local/bin/npm`.

**Spec:** `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md` (sections 1-4, the
Discord constraints table, and the phase 1 line under Phases).

## Global Constraints

- Branch `feat/bot-components-v2`; never commit to `main`.
- Commits are Conventional Commits, scope `bot` (or `docs(specs)` / `docs`), no tool attribution,
  signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Every user-facing string comes from `bot/src/i18n/{en,de}.json`; both catalogs get every key
  (`test/catalog-parity.test.ts`).
- Code comments ASCII only (no em dashes, no unicode arrows); write U+200B and friends as `​`.
- `type` aliases, never `interface`; `import type` for type-only imports; declaration order
  types -> constants -> helpers -> exported functions.
- Every V2 message is exactly one top-level `ContainerBuilder`, built through `v2Message` /
  `v2Edit`, which run `assertWithinLimits` (40 components counting nested ones, 4000 text
  characters).
- Custom ids: `v1:<kind>:...`, at most 100 characters; ids are untrusted input.
- `allowedMentions: { parse: [] }` stays the client default; any reply echoing user input keeps
  passing it explicitly as today.
- Card images use `thumbKey` / `landscapeThumbKey`, never `imageKey`.
- `/deck` behaviour does not change in this phase: its tests in `test/commands.test.ts` must pass
  unmodified except where a task says otherwise.

## Review Focus

- A click on `/deck`'s prompt (`deck:post`, `deck:self`, `deck:pick`) also reaches
  `interactionCreate`; the router must leave it to the collector, or the click is answered twice
  and the second answer throws. Pinned in Task 5.
- A stale or tampered `v1:` id on a **public** message must never edit that message; the clicker
  gets a private answer. Pinned in Task 5.
- A command that fails after a deferred V2 reply must answer with a V2 payload: a `content` edit
  is a 400 and the user is left on "thinking...". Pinned in Task 5.
- A query with `:` or emoji must round-trip through a custom id and never push it past 100
  characters. Pinned in Task 4.
- A card with very long text and many rulings must stay inside the 4000-character budget instead
  of failing `/card` outright. Pinned in Task 7.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/bot/src/discord/v2/limits.ts` | create | count components and text of a V2 message; throw over the ceilings |
| `app/bot/src/discord/v2/parts.ts` | create | shared builders: `container`, `text`, `linkButton`, `lessonColor`, `BRAND_GOLD` |
| `app/bot/src/discord/v2/send.ts` | create | payload shapes with the V2 flag: `v2Message`, `v2Edit`, `textMessage`, `textEdit`, `EPHEMERAL_V2` |
| `app/bot/src/discord/v2/card-view.ts` | create | the card as a V2 container |
| `app/bot/src/discord/components/custom-id.ts` | create | `encodeCustomId` / `decodeCustomId`, browse state types, `clampQuery` |
| `app/bot/src/discord/components/types.ts` | create | `ComponentHandler` type |
| `app/bot/src/discord/components/index.ts` | create | `COMPONENTS` registry |
| `app/bot/src/discord/channel-post.ts` | create | `postTarget`, `refusal` (moved from `commands/deck.ts`) |
| `app/bot/src/data/card-detail.ts` | create | `loadCardDetail`: set name, rulings, sub-type labels for one card |
| `app/bot/src/discord/handle-interaction.ts` | modify | component branch; V2 error answers |
| `app/bot/src/discord/commands/card.ts` | modify | reply with `cardView` |
| `app/bot/src/discord/commands/collection.ts` | modify | reply with `textEdit` |
| `app/bot/src/discord/commands/deck.ts` | modify | use `channel-post.ts` |
| `app/bot/src/discord/embeds/deck-embed.ts` | modify | import `lessonColor` from `v2/parts` |
| `app/bot/src/discord/embeds/card-embed.ts` | delete | replaced by `v2/card-view.ts` |
| `app/bot/src/i18n/{en,de}.json` | modify | new and renamed keys |
| `app/bot/test/helpers/v2.ts` | create | read V2 payloads in tests: `flatten`, `textOf`, `mediaUrls`, `buttonsOf` |
| `app/bot/test/limits.test.ts`, `v2-send.test.ts`, `custom-id.test.ts`, `channel-post.test.ts`, `card-view.test.ts` | create | unit tests |
| `app/bot/test/handle-interaction.test.ts`, `commands.test.ts`, `personal-commands.test.ts` | modify | V2 expectations |
| `app/bot/test/card-embed.test.ts` | delete | replaced by `card-view.test.ts` |
| `CLAUDE.md`, the spec | modify | probe findings, router, limits, posting path |

---

### Task 1: Probe Discord's unstated V2 rules (throwaway)

The spec lists six assumptions the docs do not settle. This task settles 1, 2, 4 and 5 against
the dev guild with a script that is **not committed**; 3 is settled by hand in Task 9 (it is
exactly the `/card` path), 6 belongs to phase 2 (no browser exists yet).

**Files:**
- Create (scratchpad, not committed): `<scratchpad>/v2-probe.mjs`
- Modify: `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md` (new "Probe findings" section)

**Interfaces:**
- Consumes: `DISCORD_TOKEN` from `app/bot/.env.local`.
- Produces: the "Probe findings" section that Task 9 copies into CLAUDE.md.

- [ ] **Step 1: Ask the user for two channel ids in the dev guild**

One ordinary text channel the bot can post in (`PROBE_CHANNEL_ID`), and one where the bot's role
has **Embed Links denied** by a channel override but can view and send (`PROBE_NO_EMBED_CHANNEL_ID`).
Do not guess ids. The script posts a handful of test messages into both.

- [ ] **Step 2: Write the probe script**

```js
// v2-probe.mjs - throwaway. Run from app/bot so discord.js resolves:
//   cd app/bot && PROBE_CHANNEL_ID=... PROBE_NO_EMBED_CHANNEL_ID=... \
//     /usr/local/bin/node --env-file=.env.local --input-type=module < <scratchpad>/v2-probe.mjs
import { DiscordAPIError, REST, Routes } from 'discord.js'

const rest = new REST().setToken(process.env.DISCORD_TOKEN)
const channel = process.env.PROBE_CHANNEL_ID
const noEmbed = process.env.PROBE_NO_EMBED_CHANNEL_ID
const V2 = 1 << 15
const td = (content) => ({ type: 10, content })
const box = (components) => ({ type: 17, components })
const thumbSection = { type: 9, components: [td('thumbnail probe')],
  accessory: { type: 11, media: { url: 'https://cdn.discordapp.com/embed/avatars/0.png' } } }

const describe = (e) => e instanceof DiscordAPIError ? `${e.status} ${e.code} ${e.message}` : String(e)
async function attempt(name, channelId, body) {
  try {
    const m = await rest.post(Routes.channelMessages(channelId), { body })
    console.log(`${name}: ok`)
    return m
  } catch (e) {
    console.log(`${name}: ${describe(e)}`)
    return null
  }
}
const texts = (n) => Array.from({ length: n }, (_, i) => td(`t${i}`))

// Assumption 1: do nested components count toward 40?
await attempt('A1 container + 39 text = 40', channel, { flags: V2, components: [box(texts(39))] })
await attempt('A1 container + 40 text = 41', channel, { flags: V2, components: [box(texts(40))] })
// Assumption 2: is there a 4000-character total across text displays?
await attempt('A2 2000 + 2000 chars', channel, { flags: V2, components: [box([td('a'.repeat(2000)), td('b'.repeat(2000))])] })
await attempt('A2 2000 + 2001 chars', channel, { flags: V2, components: [box([td('a'.repeat(2000)), td('b'.repeat(2001))])] })
// Assumption 4: can a V1 message be edited into V2? (a channel message, the closest proxy to
// the /deck prompt, which is an interaction reply)
const v1 = await attempt('A4 create v1', channel, { content: 'probe: v1 message' })
if (v1) {
  try {
    await rest.patch(Routes.channelMessage(channel, v1.id), {
      body: { content: '', flags: V2, components: [box([td('probe: now v2')])] },
    })
    console.log('A4 edit v1 -> v2: ok')
  } catch (e) {
    console.log(`A4 edit v1 -> v2: ${describe(e)}`)
  }
}
// Assumption 5: does a V2 thumbnail need Embed Links?
await attempt('A5 v2 thumbnail, Embed Links allowed', channel, { flags: V2, components: [box([thumbSection])] })
await attempt('A5 v2 thumbnail, Embed Links denied', noEmbed, { flags: V2, components: [box([thumbSection])] })
```

- [ ] **Step 3: Run it and keep the output**

Run (from the repo root, ids from Step 1):
`cd app/bot && PROBE_CHANNEL_ID=<id> PROBE_NO_EMBED_CHANNEL_ID=<id> /usr/local/bin/node --env-file=.env.local --input-type=module < <scratchpad>/v2-probe.mjs`

Expected: nine result lines. For each `A5` line that says `ok`, open the channel and check the
thumbnail actually **renders** (a message can be accepted with the image suppressed); note it.

- [ ] **Step 4: Record the findings in the spec**

Add a section right after "Discord constraints" in the spec:

```markdown
### Probe findings (2026-10-13, dev guild)

| # | Question | Result |
|---|---|---|
| 1 | Nested components count toward 40 | <yes: 41 rejected with "<code> <message>" / no: 41 accepted> |
| 2 | 4000-character total across text displays | <yes / no, 4001 accepted> |
| 4 | V1 message editable into V2 | <yes / no: "<code> <message>"> |
| 5 | V2 thumbnail without Embed Links | <posted and rendered / posted, image suppressed / rejected "<code>"> |

The guard keeps 40 nested and 4000 characters whatever 1 and 2 say: both are only ever
stricter than Discord. Finding 4 decides whether the command error path may edit a V1 `/deck`
prompt into V2 (Task 5 avoids it either way until phase 3). Finding 5 decides phase 2's
permission list for a shared card list.
```

Fill each `<...>` with what the run printed, verbatim codes and messages. Delete the probe
messages from both channels by hand.

- [ ] **Step 5: Commit the spec**

```bash
git add docs/superpowers/specs/2026-10-13-bot-components-v2-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(specs): record the components v2 probe findings"
```

---

### Task 2: The limits guard and the test reader

**Files:**
- Create: `app/bot/src/discord/v2/limits.ts`
- Create: `app/bot/test/helpers/v2.ts`
- Test: `app/bot/test/limits.test.ts`

**Interfaces:**
- Produces: `type Encodable = { toJSON(): unknown }`, `type Tally = { components: number; text: number }`,
  `MAX_COMPONENTS = 40`, `MAX_TEXT = 4000`, `measure(components: readonly Encodable[]): Tally`,
  `assertWithinLimits(components: readonly Encodable[]): void`.
- Produces (tests only): `flatten(payload)`, `textOf(payload)`, `mediaUrls(payload)`, `buttonsOf(payload)`
  from `test/helpers/v2.ts`.

- [ ] **Step 1: Write the test reader**

`app/bot/test/helpers/v2.ts`:

```ts
import { ComponentType } from 'discord.js'

// A component as Discord receives it. Only the fields the tests read.
type Json = {
  type: number
  content?: string
  components?: Json[]
  accessory?: Json
  items?: { media: { url: string }; description?: string | null }[]
  media?: { url: string }
  url?: string
  label?: string
  custom_id?: string
  disabled?: boolean
  accent_color?: number | null
}

type Payload = { components?: readonly unknown[] }

function toJson(component: unknown): Json {
  const encodable = component as { toJSON?: () => Json }
  return typeof encodable.toJSON === 'function' ? encodable.toJSON() : (component as Json)
}

// Every node of a V2 payload, depth first, accessories included.
export function flatten(payload: Payload): Json[] {
  const out: Json[] = []
  const walk = (node: Json): void => {
    out.push(node)
    node.components?.forEach(walk)
    if (node.accessory) walk(node.accessory)
  }
  for (const component of payload.components ?? []) walk(toJson(component))
  return out
}

// All text displays' content, in order, one per line.
export function textOf(payload: Payload): string {
  return flatten(payload)
    .filter((n) => n.type === ComponentType.TextDisplay)
    .map((n) => n.content ?? '')
    .join('\n')
}

// Every image URL a payload shows: gallery items and thumbnails.
export function mediaUrls(payload: Payload): string[] {
  return flatten(payload).flatMap((n) => {
    if (n.type === ComponentType.MediaGallery) return (n.items ?? []).map((i) => i.media.url)
    if (n.type === ComponentType.Thumbnail && n.media) return [n.media.url]
    return []
  })
}

export function buttonsOf(payload: Payload): Json[] {
  return flatten(payload).filter((n) => n.type === ComponentType.Button)
}
```

- [ ] **Step 2: Write the failing test**

`app/bot/test/limits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { assertWithinLimits, measure } from '../src/discord/v2/limits'

const text = (content: string) => new TextDisplayBuilder().setContent(content)
const withTexts = (n: number, content = 'x') =>
  new ContainerBuilder().addTextDisplayComponents(...Array.from({ length: n }, () => text(content)))

describe('measure', () => {
  it('counts the container and every nested component', () => {
    const section = new SectionBuilder()
      .addTextDisplayComponents(text('a'), text('b'))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://img.test/a.webp'))
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('v1:pk').setLabel('x').setStyle(ButtonStyle.Primary),
    )
    const message = new ContainerBuilder().addSectionComponents(section).addActionRowComponents(row)
    // container 1 + section 1 + two texts 2 + thumbnail 1 + row 1 + button 1
    expect(measure([message]).components).toBe(7)
  })

  it('sums text display characters across the message', () => {
    expect(measure([withTexts(3, 'abcd')]).text).toBe(12)
  })
})

describe('assertWithinLimits', () => {
  it('accepts exactly 40 components', () => {
    expect(() => assertWithinLimits([withTexts(39)])).not.toThrow()
  })

  it('rejects 41 components, nested ones included', () => {
    expect(() => assertWithinLimits([withTexts(40)])).toThrow(/41 components/)
  })

  it('accepts exactly 4000 text characters and rejects 4001', () => {
    expect(() => assertWithinLimits([withTexts(2, 'a'.repeat(2000))])).not.toThrow()
    const over = new ContainerBuilder().addTextDisplayComponents(text('a'.repeat(2000)), text('b'.repeat(2001)))
    expect(() => assertWithinLimits([over])).toThrow(/4001 text characters/)
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/limits.test.ts`
Expected: FAIL, cannot resolve `../src/discord/v2/limits`.

- [ ] **Step 4: Implement**

`app/bot/src/discord/v2/limits.ts`:

```ts
import { ComponentType } from 'discord.js'

// A component as Discord receives it: the JSON a builder serializes to.
type ComponentJSON = {
  type: number
  content?: string
  components?: ComponentJSON[]
  accessory?: ComponentJSON
}

// Anything that serializes to a component: every discord.js builder.
export type Encodable = { toJSON(): unknown }

export type Tally = { components: number; text: number }

// Discord's ceilings for one IS_COMPONENTS_V2 message. The docs state the
// 40-component cap but not whether nested components count, and no total
// text cap; both are assumed here because the assumption can only be stricter
// than Discord (spec, "Discord constraints" and "Probe findings"). A breach
// fails the whole interaction with a 400, so views clamp their own text and
// this guard is the backstop that turns a clamp bug into a logged error.
export const MAX_COMPONENTS = 40
export const MAX_TEXT = 4000

function tally(node: ComponentJSON, acc: Tally): void {
  acc.components += 1
  // .length counts UTF-16 units, never fewer than Discord's characters, so
  // the guard can only err towards rejecting.
  if (node.type === ComponentType.TextDisplay) acc.text += node.content?.length ?? 0
  for (const child of node.components ?? []) tally(child, acc)
  if (node.accessory) tally(node.accessory, acc)
}

export function measure(components: readonly Encodable[]): Tally {
  const acc: Tally = { components: 0, text: 0 }
  for (const component of components) tally(component.toJSON() as ComponentJSON, acc)
  return acc
}

export function assertWithinLimits(components: readonly Encodable[]): void {
  const { components: count, text } = measure(components)
  if (count > MAX_COMPONENTS) {
    throw new Error(`V2 message has ${count} components, over the ${MAX_COMPONENTS} limit`)
  }
  if (text > MAX_TEXT) {
    throw new Error(`V2 message has ${text} text characters, over the ${MAX_TEXT} limit`)
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/limits.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add app/bot/src/discord/v2/limits.ts app/bot/test/helpers/v2.ts app/bot/test/limits.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): guard components v2 messages against discord's limits"
```

---

### Task 3: Shared parts and V2 payloads

**Files:**
- Create: `app/bot/src/discord/v2/parts.ts`
- Create: `app/bot/src/discord/v2/send.ts`
- Modify: `app/bot/src/discord/embeds/deck-embed.ts` (drop its own `lessonColor` / `FALLBACK_COLOR`, import from `../v2/parts`)
- Test: `app/bot/test/v2-send.test.ts`

**Interfaces:**
- Consumes: `assertWithinLimits` (Task 2).
- Produces (`parts.ts`): `BRAND_GOLD = 0xd4a83a`, `lessonColor(lesson: string | null): number`,
  `container(accent?: number | null): ContainerBuilder`, `text(content: string): TextDisplayBuilder`,
  `linkButton(url: string, label: string): ButtonBuilder`.
- Produces (`send.ts`): `type V2Message = { components: ContainerBuilder[]; files: AttachmentBuilder[]; flags: MessageFlags.IsComponentsV2 }`,
  `type V2Edit = V2Message & { attachments?: [] }`, `EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral`,
  `v2Message(components, files?)`, `v2Edit(components, files?)`, `textMessage(content)`, `textEdit(content)`.

- [ ] **Step 1: Write the failing test**

`app/bot/test/v2-send.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AttachmentBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js'
import { textEdit, textMessage, v2Edit, v2Message } from '../src/discord/v2/send'
import { container, lessonColor } from '../src/discord/v2/parts'
import { textOf } from './helpers/v2'

const one = () => [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('hi'))]

describe('v2 payloads', () => {
  it('flags a message as components v2', () => {
    expect(v2Message(one()).flags).toBe(MessageFlags.IsComponentsV2)
  })

  // Without it an edit keeps the previous upload: a deck sheet would linger
  // under the status line that replaced it.
  it('clears earlier attachments on an edit that sends none', () => {
    expect(v2Edit(one())).toMatchObject({ attachments: [] })
  })

  it('keeps the attachments an edit sends', () => {
    const file = new AttachmentBuilder(Buffer.from('png'), { name: 'deck.png' })
    const edit = v2Edit(one(), [file])
    expect(edit.files).toEqual([file])
    expect(edit).not.toHaveProperty('attachments')
  })

  it('refuses a message over the limits', () => {
    const big = [new ContainerBuilder().addTextDisplayComponents(
      ...Array.from({ length: 40 }, () => new TextDisplayBuilder().setContent('x')),
    )]
    expect(() => v2Message(big)).toThrow(/components/)
  })

  it('wraps a status line in one container', () => {
    const message = textMessage('Nothing here.')
    expect(message.components).toHaveLength(1)
    expect(textOf(message)).toBe('Nothing here.')
    expect(textOf(textEdit('Gone.'))).toBe('Gone.')
  })
})

describe('parts', () => {
  it('tints by lesson and falls back for none', () => {
    expect(lessonColor('quidditch')).toBe(0xe2ae37)
    expect(lessonColor(null)).toBe(0x2b2d31)
  })

  it('leaves the accent off a container without one', () => {
    expect(container().toJSON().accent_color).toBeUndefined()
    expect(container(0xd4a83a).toJSON().accent_color).toBe(0xd4a83a)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/v2-send.test.ts`
Expected: FAIL, cannot resolve `../src/discord/v2/send`.

- [ ] **Step 3: Implement `parts.ts`**

```ts
import { ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder } from 'discord.js'
import { LESSONS } from '@revelio/core'

// The search accent, as the embed used it.
export const BRAND_GOLD = 0xd4a83a
// Discord's own dark surface: an accent that reads as "none" for a card or
// deck with no lesson.
const FALLBACK_COLOR = 0x2b2d31

export function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

// Every V2 message is one container; this is where it starts.
export function container(accent: number | null = null): ContainerBuilder {
  const view = new ContainerBuilder()
  return accent == null ? view : view.setAccentColor(accent)
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

export function linkButton(url: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label)
}
```

- [ ] **Step 4: Implement `send.ts`**

```ts
import { MessageFlags, type AttachmentBuilder, type ContainerBuilder } from 'discord.js'
import { assertWithinLimits } from './limits'
import { container, text } from './parts'

// A V2 message as the create calls take it: reply, followUp, channel.send.
// The flag rules out `content` and `embeds`, and Discord never lets a message
// drop it again, so a view that is V2 stays V2 for every later edit.
export type V2Message = {
  components: ContainerBuilder[]
  files: AttachmentBuilder[]
  flags: MessageFlags.IsComponentsV2
}

// The same for the edit calls: editReply, update. `attachments: []` drops the
// uploads an earlier version of the message carried.
export type V2Edit = V2Message & { attachments?: [] }

// For a private reply to a click. A plain number, which every reply call takes.
export const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral

export function v2Message(components: ContainerBuilder[], files: AttachmentBuilder[] = []): V2Message {
  assertWithinLimits(components)
  return { components, files, flags: MessageFlags.IsComponentsV2 }
}

export function v2Edit(components: ContainerBuilder[], files: AttachmentBuilder[] = []): V2Edit {
  const message = v2Message(components, files)
  return files.length ? message : { ...message, attachments: [] }
}

// Status lines (not found, out of date, errors) are V2 too, so a message
// never has to change format to say something went wrong.
export function textMessage(content: string): V2Message {
  return v2Message([container().addTextDisplayComponents(text(content))])
}

export function textEdit(content: string): V2Edit {
  return v2Edit([container().addTextDisplayComponents(text(content))])
}
```

- [ ] **Step 5: Point `deck-embed.ts` at the shared `lessonColor`**

In `app/bot/src/discord/embeds/deck-embed.ts`, delete the `FALLBACK_COLOR` constant and the local
`lessonColor` function, drop `LESSONS` from the `@revelio/core` import if nothing else uses it,
and add:

```ts
import { lessonColor } from '../v2/parts'
```

- [ ] **Step 6: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/v2-send.test.ts test/deck-embed.test.ts`
Expected: PASS (deck-embed's colour test proves the move changed nothing).

- [ ] **Step 7: Commit**

```bash
git add app/bot/src/discord/v2 app/bot/src/discord/embeds/deck-embed.ts app/bot/test/v2-send.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add components v2 payload helpers and shared parts"
```

---

### Task 4: The custom id codec

Every routed control carries its whole state in its id. The spec's kind table is extended here
with the kinds a real browser needs to keep ids **unique within a message** (Discord requires it):
each filter select gets its own kind (`sl`/`st`/`ss` for lesson/type/set, `dl`/`df`/`ds` for
deck lesson/format/sort), and the disabled page indicator gets `pg`.

**Files:**
- Create: `app/bot/src/discord/components/custom-id.ts`
- Test: `app/bot/test/custom-id.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type CardBrowseState = { page: number; lesson: string | null; type: string | null; set: string | null; query: string }
  type DeckBrowseState = { scope: 'public' | 'mine'; page: number; format: DeckFormat | null; sort: DeckSort; lesson: string | null; query: string }
  type DeckSort = (typeof DECK_SORTS)[number]   // 'likes' | 'views' | 'newest' | 'updated'
  type CardKind = 's' | 'sl' | 'st' | 'ss' | 'co' | 'cb' | 'sh' | 'sp'   // exported
  type DeckKind = 'd' | 'dl' | 'df' | 'ds' | 'do'
  type CustomId =
    | { kind: CardKind; state: CardBrowseState }
    | { kind: DeckKind; state: DeckBrowseState }
    | { kind: 'cp'; cardId: string }
    | { kind: 'dp'; deckId: string }
    | { kind: 'pk' }
    | { kind: 'pg'; of: 'cards' | 'decks' }
  ID_VERSION = 'v1'; MAX_CUSTOM_ID = 100; MAX_QUERY = 50; MAX_PAGE = 9999
  DECK_SORTS = ['likes', 'views', 'newest', 'updated'] as const
  clampQuery(query: string): string
  encodeCustomId(id: CustomId): string   // throws over 100 characters or on an unencodable value
  decodeCustomId(raw: string): CustomId | null
  ```
- Phase 2 and 3 consume all of it. Kind meanings: `s` page change, `sl`/`st`/`ss` filter
  selects (the chosen value replaces that field, page resets to 1), `co` open-a-card select,
  `cb` back to results, `sh` Share button, `sp` share picker, `d`/`dl`/`df`/`ds`/`do` the deck
  equivalents, `cp`/`dp` post a card/deck, `pk` "View a card" on a shared list, `pg` the
  disabled page indicator.

- [ ] **Step 1: Write the failing test**

`app/bot/test/custom-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LESSONS, TYPES } from '@revelio/core'
import {
  clampQuery,
  decodeCustomId,
  encodeCustomId,
  MAX_CUSTOM_ID,
  MAX_PAGE,
  MAX_QUERY,
  type CardBrowseState,
  type CustomId,
  type DeckBrowseState,
} from '../src/discord/components/custom-id'

const card: CardBrowseState = { page: 3, lesson: 'charms', type: 'spell', set: 'base', query: 'lumos' }
const deck: DeckBrowseState = {
  scope: 'public', page: 2, format: 'classic', sort: 'views', lesson: null, query: '@hermione',
}
// The longest anything can be: last page, last lesson and type, an 8-character
// set code, and a query of 2-unit emoji that clampQuery cuts to 50 units.
const worstCard: CardBrowseState = {
  page: MAX_PAGE,
  lesson: LESSONS[LESSONS.length - 1].code,
  type: TYPES[TYPES.length - 1].code,
  set: 'abcdefgh',
  query: '\u{1F600}'.repeat(40),
}
const worstDeck: DeckBrowseState = {
  scope: 'mine', page: MAX_PAGE, format: 'revival', sort: 'updated',
  lesson: LESSONS[LESSONS.length - 1].code, query: 'x'.repeat(80),
}

const ALL: CustomId[] = [
  ...(['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp'] as const).map((kind) => ({ kind, state: card })),
  ...(['d', 'dl', 'df', 'ds', 'do'] as const).map((kind) => ({ kind, state: deck })),
  { kind: 'cp', cardId: 'chamber-of-secrets-12' },
  { kind: 'dp', deckId: '6f1c2a5e-9a8b-4c3d-8e7f-0a1b2c3d4e5f' },
  { kind: 'pk' },
  { kind: 'pg', of: 'cards' },
  { kind: 'pg', of: 'decks' },
]

describe('custom ids', () => {
  it.each(ALL.map((id) => [id.kind, id] as const))('round-trips %s', (_kind, id) => {
    expect(decodeCustomId(encodeCustomId(id))).toEqual(id)
  })

  it('stays inside 100 characters for the worst case of every kind', () => {
    const worst: CustomId[] = [
      ...(['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp'] as const).map((kind) => ({ kind, state: worstCard })),
      ...(['d', 'dl', 'df', 'ds', 'do'] as const).map((kind) => ({ kind, state: worstDeck })),
      { kind: 'cp', cardId: 'x'.repeat(64) },
      { kind: 'dp', deckId: 'x'.repeat(64) },
    ]
    for (const id of worst) expect(encodeCustomId(id).length).toBeLessThanOrEqual(MAX_CUSTOM_ID)
  })

  it('keeps a query containing colons intact', () => {
    const id: CustomId = { kind: 's', state: { ...card, query: 'a:b::c' } }
    expect(decodeCustomId(encodeCustomId(id))).toEqual(id)
  })

  it('writes a lesson as an index, not its code', () => {
    const id = encodeCustomId({ kind: 's', state: { ...card, lesson: 'care_of_magical_creatures' } })
    expect(id).not.toContain('care_of_magical_creatures')
  })

  it.each([
    ['another version', 'v2:s:1:-:-:-:q'],
    ['an unknown kind', 'v1:zz:1'],
    ['a /deck prompt id', 'deck:post'],
    ['page zero', 'v1:s:0:-:-:-:q'],
    ['a page past the cap', `v1:s:${MAX_PAGE + 1}:-:-:-:q`],
    ['a lesson index out of range', 'v1:s:1:z:-:-:q'],
    ['a malformed set', 'v1:s:1:-:-:no/pe:q'],
    ['too few fields', 'v1:s:1:-'],
    ['an unknown deck scope', 'v1:d:x:1:-:0:-:q'],
    ['a card id with a space', 'v1:cp:a b'],
    ['an extra field on pk', 'v1:pk:1'],
  ])('rejects %s', (_label, raw) => {
    expect(decodeCustomId(raw)).toBeNull()
  })

  it('refuses to encode a lesson it does not know', () => {
    expect(() => encodeCustomId({ kind: 's', state: { ...card, lesson: 'divination' } })).toThrow()
  })
})

describe('clampQuery', () => {
  it('trims and cuts to 50 UTF-16 units on a whole code point', () => {
    const cut = clampQuery(`  ${'\u{1F600}'.repeat(40)}  `)
    expect(cut.length).toBe(MAX_QUERY)
    expect(cut).toBe('\u{1F600}'.repeat(25))
  })

  it('leaves a short query alone', () => {
    expect(clampQuery('lumos')).toBe('lumos')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/custom-id.test.ts`
Expected: FAIL, cannot resolve `../src/discord/components/custom-id`.

- [ ] **Step 3: Implement**

`app/bot/src/discord/components/custom-id.ts`:

```ts
import { z } from 'zod'
import { DeckFormat, LESSONS, TYPES } from '@revelio/core'

// What a card browser shows: one page of one search. Rebuilt from the id on
// every click, so it is all the state there is (spec section 2).
export type CardBrowseState = {
  page: number
  lesson: string | null
  type: string | null
  set: string | null
  query: string
}

export type DeckSort = (typeof DECK_SORTS)[number]

// 'mine' is /mydecks over the caller's own decks; 'public' is /decks.
export type DeckBrowseState = {
  scope: 'public' | 'mine'
  page: number
  format: DeckFormat | null
  sort: DeckSort
  lesson: string | null
  query: string
}

// One kind per control on a view, so no two controls of one message share an
// id (Discord rejects duplicates): s page change, sl/st/ss lesson/type/set
// select, co open a card, cb back to results, sh Share, sp the share picker.
export type CardKind = 's' | 'sl' | 'st' | 'ss' | 'co' | 'cb' | 'sh' | 'sp'
// d page change, dl/df/ds lesson/format/sort select, do open a deck.
export type DeckKind = 'd' | 'dl' | 'df' | 'ds' | 'do'

// cp/dp post a card/deck, pk "View a card" on a shared list, pg the disabled
// page indicator (a non-link button needs an id even when it does nothing).
export type CustomId =
  | { kind: CardKind; state: CardBrowseState }
  | { kind: DeckKind; state: DeckBrowseState }
  | { kind: 'cp'; cardId: string }
  | { kind: 'dp'; deckId: string }
  | { kind: 'pk' }
  | { kind: 'pg'; of: 'cards' | 'decks' }

// A layout change bumps the version; decode answers null for any other one,
// which the router turns into "these results are out of date".
export const ID_VERSION = 'v1'
// Discord's ceiling for a custom id.
export const MAX_CUSTOM_ID = 100
// The /search and /decks query option's max length, and the cut clampQuery
// makes. The worst-case test in custom-id.test.ts is what proves it fits.
export const MAX_QUERY = 50
export const MAX_PAGE = 9999
// Mirrors @revelio/db's PublicDeckSort; the index into it is what the id
// carries, so the order here is part of the id format.
export const DECK_SORTS = ['likes', 'views', 'newest', 'updated'] as const

const CARD_KINDS: readonly string[] = ['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp']
const DECK_KINDS: readonly string[] = ['d', 'dl', 'df', 'ds', 'do']
// Lessons, types and formats go in as a one-character index into these lists:
// 'care_of_magical_creatures' alone is 25 characters. Their order is therefore
// part of the id format too; appending is safe, reordering breaks old ids.
const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((t) => t.code)
const FORMATS: readonly DeckFormat[] = DeckFormat.options
const NONE = '-'
// Syntactic only: a well-formed but unknown set simply finds no cards.
const SET_CODE = /^[a-z0-9-]{1,8}$/i
const ENTITY_ID = /^[\w.-]{1,64}$/
const Page = z.coerce.number().int().min(1).max(MAX_PAGE)

function toIndex(list: readonly string[], value: string | null): string {
  if (value == null) return NONE
  const i = list.indexOf(value)
  if (i < 0) throw new Error(`cannot encode unknown value "${value}"`)
  return i.toString(36)
}

// null for "none", undefined for anything that is not a valid index.
function fromIndex<T extends string>(list: readonly T[], raw: string): T | null | undefined {
  if (raw === NONE) return null
  if (!/^[0-9a-z]$/.test(raw)) return undefined
  return list[parseInt(raw, 36)]
}

function encodeCard(s: CardBrowseState): string {
  if (s.set != null && !SET_CODE.test(s.set)) throw new Error(`cannot encode set "${s.set}"`)
  return [
    Math.min(Math.max(1, s.page), MAX_PAGE),
    toIndex(LESSON_CODES, s.lesson),
    toIndex(TYPE_CODES, s.type),
    s.set ?? NONE,
    clampQuery(s.query),
  ].join(':')
}

function encodeDeck(s: DeckBrowseState): string {
  return [
    s.scope === 'mine' ? 'm' : 'p',
    Math.min(Math.max(1, s.page), MAX_PAGE),
    toIndex(FORMATS, s.format),
    toIndex(DECK_SORTS, s.sort),
    toIndex(LESSON_CODES, s.lesson),
    clampQuery(s.query),
  ].join(':')
}

// The query is always the last field, so it may contain colons itself.
function decodeCard(fields: string[]): CardBrowseState | null {
  if (fields.length < 5) return null
  const [pageRaw, lessonRaw, typeRaw, set, ...query] = fields
  const page = Page.safeParse(pageRaw)
  const lesson = fromIndex(LESSON_CODES, lessonRaw)
  const type = fromIndex(TYPE_CODES, typeRaw)
  if (!page.success || lesson === undefined || type === undefined) return null
  if (set !== NONE && !SET_CODE.test(set)) return null
  return { page: page.data, lesson, type, set: set === NONE ? null : set, query: query.join(':') }
}

function decodeDeck(fields: string[]): DeckBrowseState | null {
  if (fields.length < 6) return null
  const [scopeRaw, pageRaw, formatRaw, sortRaw, lessonRaw, ...query] = fields
  if (scopeRaw !== 'm' && scopeRaw !== 'p') return null
  const page = Page.safeParse(pageRaw)
  const format = fromIndex(FORMATS, formatRaw)
  const sort = fromIndex(DECK_SORTS, sortRaw)
  const lesson = fromIndex(LESSON_CODES, lessonRaw)
  if (!page.success || format === undefined || !sort || lesson === undefined) return null
  return {
    scope: scopeRaw === 'm' ? 'mine' : 'public',
    page: page.data, format, sort, lesson, query: query.join(':'),
  }
}

// Trimmed, then cut to MAX_QUERY UTF-16 units on a whole code point: Discord's
// option max_length counts characters, so 50 emoji would otherwise be 100
// units and blow the id. A cut query still finds what its first 50 found.
export function clampQuery(query: string): string {
  let out = ''
  for (const ch of query.trim()) {
    if (out.length + ch.length > MAX_QUERY) break
    out += ch
  }
  return out
}

export function encodeCustomId(id: CustomId): string {
  let body: string
  switch (id.kind) {
    case 's': case 'sl': case 'st': case 'ss': case 'co': case 'cb': case 'sh': case 'sp':
      body = encodeCard(id.state)
      break
    case 'd': case 'dl': case 'df': case 'ds': case 'do':
      body = encodeDeck(id.state)
      break
    case 'cp':
      body = id.cardId
      break
    case 'dp':
      body = id.deckId
      break
    case 'pk':
      body = ''
      break
    case 'pg':
      body = id.of === 'cards' ? 'c' : 'd'
      break
  }
  const out = body ? `${ID_VERSION}:${id.kind}:${body}` : `${ID_VERSION}:${id.kind}`
  if (out.length > MAX_CUSTOM_ID) throw new Error(`custom id ${id.kind} is ${out.length} characters`)
  return out
}

// Custom ids round-trip through the client, so this treats them as untrusted:
// anything malformed, from another version, or out of range is null. Nothing
// decoded here is an authorization - see spec section 2.
export function decodeCustomId(raw: string): CustomId | null {
  const [version, kind, ...fields] = raw.split(':')
  if (version !== ID_VERSION || !kind) return null
  if (CARD_KINDS.includes(kind)) {
    const state = decodeCard(fields)
    return state ? { kind: kind as CardKind, state } : null
  }
  if (DECK_KINDS.includes(kind)) {
    const state = decodeDeck(fields)
    return state ? { kind: kind as DeckKind, state } : null
  }
  if (kind === 'cp' || kind === 'dp') {
    if (fields.length !== 1 || !ENTITY_ID.test(fields[0])) return null
    return kind === 'cp' ? { kind, cardId: fields[0] } : { kind, deckId: fields[0] }
  }
  if (kind === 'pk') return fields.length === 0 ? { kind } : null
  if (kind === 'pg' && fields.length === 1 && (fields[0] === 'c' || fields[0] === 'd')) {
    return { kind, of: fields[0] === 'c' ? 'cards' : 'decks' }
  }
  return null
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/custom-id.test.ts`
Expected: PASS. If the worst-case test fails, lower `MAX_QUERY` until it passes (and say so in
the commit body); do not raise the 100.

- [ ] **Step 5: Commit**

```bash
git add app/bot/src/discord/components/custom-id.ts app/bot/test/custom-id.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): encode browse state into stateless custom ids"
```

---

### Task 5: The component router and V2 error answers

**Files:**
- Create: `app/bot/src/discord/components/types.ts`
- Create: `app/bot/src/discord/components/index.ts`
- Modify: `app/bot/src/discord/handle-interaction.ts`
- Modify: `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json` (add `browse.expired`)
- Test: `app/bot/test/handle-interaction.test.ts`

**Interfaces:**
- Consumes: `decodeCustomId`, `CustomId` (Task 4); `textEdit`, `textMessage`, `EPHEMERAL_V2` (Task 3).
- Produces: `type ComponentHandler = (interaction: MessageComponentInteraction, id: CustomId, deps: Deps) => Promise<void>`,
  `COMPONENTS: Map<CustomId['kind'], ComponentHandler>` (empty in this phase).
- Rule later handlers rely on: **a handler acting on a public message acknowledges only with an
  ephemeral `deferReply` or `reply`, never `update`/`deferUpdate`**; the router's error answer
  edits whatever the handler acknowledged with.

- [ ] **Step 1: Add the catalog key**

`en.json`: `"browse.expired": "These results are out of date. Run the command again."`
`de.json`: `"browse.expired": "Diese Ergebnisse sind veraltet. Führe den Befehl erneut aus."`

- [ ] **Step 2: Write the failing tests**

Replace the body of `app/bot/test/handle-interaction.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { handleInteraction } from '../src/discord/handle-interaction'
import { COMPONENTS } from '../src/discord/components/index'
import { textOf } from './helpers/v2'

afterEach(() => {
  vi.restoreAllMocks()
  COMPONENTS.clear()
})

const ERROR = 'Something went wrong. Please try again in a moment.'
const EXPIRED = 'These results are out of date. Run the command again.'

function fakeCommand(state: { replied: boolean; deferred: boolean }) {
  return {
    id: 'i-1',
    commandName: 'deck',
    locale: 'en',
    user: { id: '111' },
    ...state,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isChatInputCommand: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: () => 'abc123', getInteger: () => null },
  }
}

function fakeClick(customId: string, opts: { ephemeral?: boolean; deferred?: boolean } = {}) {
  return {
    id: 'i-2',
    customId,
    locale: 'en',
    user: { id: '111' },
    deferred: opts.deferred ?? false,
    replied: false,
    isAutocomplete: () => false,
    isMessageComponent: () => true,
    isChatInputCommand: () => false,
    message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral && (opts.ephemeral ?? true) } },
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  }
}

const run = (interaction: unknown) => handleInteraction(interaction as never, { db: {} } as never)

describe('handleInteraction: commands', () => {
  // /deck's prompt is a V1 message until phase 3: an edit there keeps content.
  it('strips components when a command fails after replying', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: true, deferred: false })
    await run(interaction)
    expect(interaction.editReply).toHaveBeenCalledWith({ content: ERROR, components: [] })
  })

  // A deferred reply is V2; a content edit would be a 400 and leave the user
  // on "thinking...".
  it('answers a command that failed after deferring with a V2 status line', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: false, deferred: true })
    await run(interaction)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toBe(ERROR)
  })

  it('answers a command that failed before replying ephemerally, in V2', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const interaction = fakeCommand({ replied: false, deferred: false })
    await run(interaction)
    expect(interaction.editReply).not.toHaveBeenCalled()
    const payload = interaction.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toBe(ERROR)
  })
})

describe('handleInteraction: components', () => {
  // Its collector answers it; a second answer from the router would throw.
  it('leaves a /deck prompt click to its collector', async () => {
    const click = fakeClick('deck:post')
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    expect(click.reply).not.toHaveBeenCalled()
  })

  it('hands a decoded id to the handler registered for its kind', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    COMPONENTS.set('pk', handler)
    const click = fakeClick('v1:pk', { ephemeral: false })
    const deps = { db: {} }
    await handleInteraction(click as never, deps as never)
    expect(handler).toHaveBeenCalledWith(click, { kind: 'pk' }, deps)
  })

  it('replaces a private browser with "out of date" for an id it cannot read', async () => {
    const click = fakeClick('v1:s:0:-:-:-:q')
    await run(click)
    expect(textOf(click.update.mock.calls[0][0])).toBe(EXPIRED)
  })

  it('treats a valid id with no handler yet as out of date', async () => {
    const click = fakeClick('v1:pk')
    await run(click)
    expect(textOf(click.update.mock.calls[0][0])).toBe(EXPIRED)
  })

  // A shared list belongs to the channel; one person's stale click must not
  // rewrite it for everyone.
  it('answers privately and leaves a public message alone', async () => {
    const click = fakeClick('v2:pk', { ephemeral: false })
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    const payload = click.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toBe(EXPIRED)
  })

  it('edits what the handler acknowledged with when it fails afterwards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    COMPONENTS.set('pk', async (i) => {
      Object.assign(i, { deferred: true })
      throw new Error('boom')
    })
    const click = fakeClick('v1:pk', { ephemeral: false })
    await run(click)
    expect(click.update).not.toHaveBeenCalled()
    expect(textOf(click.editReply.mock.calls[0][0])).toBe(ERROR)
  })

  it('logs the kind but never the raw id, which carries the query', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    COMPONENTS.set('s', async () => { throw new Error('boom') })
    await run(fakeClick('v1:s:1:-:-:-:secret query'))
    expect(String(log.mock.calls[0][0])).toContain('component s failed')
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret query')
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/handle-interaction.test.ts`
Expected: FAIL, cannot resolve `../src/discord/components/index`.

- [ ] **Step 4: Create the handler type and the registry**

`app/bot/src/discord/components/types.ts` (its own file because the handler modules of phases 2
and 3 import it, and `index.ts` imports them):

```ts
import type { MessageComponentInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import type { CustomId } from './custom-id'

export type ComponentHandler = (
  interaction: MessageComponentInteraction,
  id: CustomId,
  deps: Deps,
) => Promise<void>
```

`app/bot/src/discord/components/index.ts`:

```ts
import type { CustomId } from './custom-id'
import type { ComponentHandler } from './types'

// The twin of COMMANDS: handle-interaction.ts routes a click by its custom id's
// kind through this map. The browsers of phases 2 and 3 register here. A
// handler acting on a public message acknowledges only with an ephemeral
// reply, never update/deferUpdate, so that neither it nor the router's error
// answer can rewrite a message the whole channel sees.
export const COMPONENTS: Map<CustomId['kind'], ComponentHandler> = new Map()
```

- [ ] **Step 5: Route components and answer errors in V2**

In `app/bot/src/discord/handle-interaction.ts`:

1. Extend the imports:

```ts
import { MessageFlags, type Interaction, type MessageComponentInteraction } from 'discord.js'
import { COMPONENTS } from './components/index'
import { decodeCustomId } from './components/custom-id'
import { EPHEMERAL_V2, textEdit, textMessage } from './v2/send'
```

2. Add, above `handleInteraction`:

```ts
// The ids the router owns. /deck's prompt ids (deck:post, deck:self,
// deck:pick) do not match: their awaitMessageComponent collector answers
// them, and a second answer from here would throw.
const ROUTED_ID = /^v\d+:/

// A status line in answer to a click. A private browser is replaced by it; a
// public message is never touched, the clicker gets a private reply instead.
// Once the handler has acknowledged, its acknowledgement is what gets edited.
async function answerClick(interaction: MessageComponentInteraction, content: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(textEdit(content))
    return
  }
  if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
    await interaction.update(textEdit(content))
    return
  }
  await interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 })
}

async function handleComponent(interaction: MessageComponentInteraction, deps: Deps): Promise<void> {
  if (!ROUTED_ID.test(interaction.customId)) return
  const locale = toRevelioLocale(interaction.locale)
  const id = decodeCustomId(interaction.customId)
  const handler = id ? COMPONENTS.get(id.kind) : undefined
  if (!id || !handler) {
    // Another version, a tampered id, or a control from a build that had a
    // handler this one lacks: all read as results gone stale.
    await answerClick(interaction, t(locale, 'browse.expired')).catch(() => {})
    return
  }
  try {
    await handler(interaction, id, deps)
  } catch (err) {
    // The kind, never the raw id: it carries the user's query.
    console.error(`component ${id.kind} failed (${interaction.id}):`, err)
    await answerClick(interaction, t(locale, 'error.generic')).catch(() => {})
  }
}
```

3. In `handleInteraction`, right after the autocomplete block and before
   `if (!interaction.isChatInputCommand()) return`, add:

```ts
  if (interaction.isMessageComponent()) {
    await handleComponent(interaction, deps)
    return
  }
```

4. Replace the unknown-command reply's payload with
   `{ ...textMessage(t(toRevelioLocale(interaction.locale), 'error.generic')), flags: EPHEMERAL_V2 }`.

5. Replace the body of the command `catch` after the `console.error` line with:

```ts
    const content = t(toRevelioLocale(interaction.locale), 'error.generic')
    if (interaction.deferred) {
      // Every deferred reply is V2, and a content edit on one is a 400.
      await interaction.editReply(textEdit(content)).catch(() => {})
    } else if (interaction.replied) {
      // Only /deck replies without deferring, with a V1 prompt (until phase 3
      // moves it to V2). Its collector is gone with the error, so the buttons
      // are stripped rather than left up, dead.
      await interaction.editReply({ content, components: [] }).catch(() => {})
    } else {
      await interaction.reply({ ...textMessage(content), flags: EPHEMERAL_V2 }).catch(() => {})
    }
```

- [ ] **Step 6: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/handle-interaction.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/bot/src/discord/components/index.ts app/bot/src/discord/components/types.ts app/bot/src/discord/handle-interaction.ts app/bot/src/i18n app/bot/test/handle-interaction.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): route component clicks by custom id and answer errors in v2"
```

---

### Task 6: One posting path, shared

**Files:**
- Create: `app/bot/src/discord/channel-post.ts`
- Modify: `app/bot/src/discord/commands/deck.ts` (delete `PostTarget`, `POST_PERMISSIONS`, `postTarget`, `refusalKey`; use the module)
- Modify: `app/bot/src/i18n/{en,de}.json` (rename `deck.cannotPost` -> `post.cannotPost`, same text)
- Test: `app/bot/test/channel-post.test.ts`

**Interfaces:**
- Produces: `type PostTarget = { kind: 'ok'; channel: SendableChannels } | { kind: 'unreachable' } | { kind: 'forbidden' }`,
  `type PostOptions = { needsFiles: boolean }`, `postTarget(component: MessageComponentInteraction, opts: PostOptions): PostTarget`,
  `refusal(err: unknown): 'unreachable' | 'forbidden' | null`.
- Note against the spec: `refusal` returns a kind, not a catalog key, so each caller keeps its own
  wording. `/deck` keeps `deck.cannotPostHere` ("Run /deck again and choose Only show me") because
  that hint only makes sense there; the generic `post.cannotPost` is shared. Phase 2 adds
  `post.cannotPostHere` for the browsers.

- [ ] **Step 1: Write the failing test**

`app/bot/test/channel-post.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from 'discord.js'
import { postTarget, refusal } from '../src/discord/channel-post'

function fakeClick(opts: { sendable?: boolean; thread?: boolean; allowed?: boolean } = {}) {
  const has = vi.fn(() => opts.allowed ?? true)
  return {
    channel: { isSendable: () => opts.sendable ?? true, isThread: () => opts.thread ?? false },
    appPermissions: { has },
  }
}

const apiError = (code: number) => new DiscordAPIError(
  { code, message: 'refused' }, code, 403, 'POST', '/channels/1/messages', { body: undefined, files: undefined },
)

describe('postTarget', () => {
  it('asks for view, embed, attach and send in a channel when files go along', () => {
    const click = fakeClick()
    expect(postTarget(click as never, { needsFiles: true }).kind).toBe('ok')
    expect(click.appPermissions.has).toHaveBeenCalledWith([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.SendMessages,
    ])
  })

  it('does not ask for Attach Files when nothing is attached', () => {
    const click = fakeClick()
    postTarget(click as never, { needsFiles: false })
    expect(click.appPermissions.has.mock.calls[0][0]).not.toContain(PermissionFlagsBits.AttachFiles)
  })

  it('asks for the thread send permission inside a thread', () => {
    const click = fakeClick({ thread: true })
    postTarget(click as never, { needsFiles: false })
    expect(click.appPermissions.has.mock.calls[0][0]).toContain(PermissionFlagsBits.SendMessagesInThreads)
  })

  it('reports a channel it cannot send to as unreachable', () => {
    expect(postTarget(fakeClick({ sendable: false }) as never, { needsFiles: false }).kind).toBe('unreachable')
  })

  it('reports a missing permission as forbidden', () => {
    expect(postTarget(fakeClick({ allowed: false }) as never, { needsFiles: false }).kind).toBe('forbidden')
  })
})

describe('refusal', () => {
  it('reads Missing Access as unreachable and Missing Permissions as forbidden', () => {
    expect(refusal(apiError(RESTJSONErrorCodes.MissingAccess))).toBe('unreachable')
    expect(refusal(apiError(RESTJSONErrorCodes.MissingPermissions))).toBe('forbidden')
  })

  it('has no answer for any other failure', () => {
    expect(refusal(apiError(RESTJSONErrorCodes.UnknownChannel))).toBeNull()
    expect(refusal(new Error('socket hang up'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/channel-post.test.ts`
Expected: FAIL, cannot resolve `../src/discord/channel-post`.

- [ ] **Step 3: Implement**

`app/bot/src/discord/channel-post.ts` (comments carried over from `deck.ts`):

```ts
import {
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type MessageComponentInteraction,
  type SendableChannels,
} from 'discord.js'

// Whether a message can go to the interaction's channel as a plain message.
// 'unreachable' is a channel the bot has no hold on at all (not cached: a
// guild where only the user installed the app, an archived thread), which no
// moderator can fix; 'forbidden' is a missing permission, which one can.
export type PostTarget =
  | { kind: 'ok'; channel: SendableChannels }
  | { kind: 'unreachable' }
  | { kind: 'forbidden' }

// needsFiles: Attach Files is only asked for when something is attached (a
// deck sheet); a card list posts images by URL.
export type PostOptions = { needsFiles: boolean }

// The one place a post into a channel is decided. Every "post to the channel"
// is a plain channel.send rather than an interaction reply, which would render
// as a reply to the private message the click came from.
const BASE_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks]

// Discord sends the bot's permissions in that channel with every interaction,
// so this needs no request of its own. A thread takes its own send permission.
export function postTarget(component: MessageComponentInteraction, opts: PostOptions): PostTarget {
  const channel = component.channel
  if (!channel?.isSendable()) return { kind: 'unreachable' }
  const send = channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages
  const needed = [
    ...BASE_PERMISSIONS,
    ...(opts.needsFiles ? [PermissionFlagsBits.AttachFiles] : []),
    send,
  ]
  return component.appPermissions.has(needed) ? { kind: 'ok', channel } : { kind: 'forbidden' }
}

// Discord's own refusal of a post, read as the same answers postTarget gives
// up front. A private thread the bot is not in can pass the permission check
// and still be refused with Missing Access.
export function refusal(err: unknown): 'unreachable' | 'forbidden' | null {
  if (!(err instanceof DiscordAPIError)) return null
  if (err.code === RESTJSONErrorCodes.MissingAccess) return 'unreachable'
  if (err.code === RESTJSONErrorCodes.MissingPermissions) return 'forbidden'
  return null
}
```

- [ ] **Step 4: Switch `deck.ts` over**

In `app/bot/src/discord/commands/deck.ts`:

1. Delete the `PostTarget` type, `POST_PERMISSIONS`, `postTarget` and `refusalKey` (with their
   comments); drop `PermissionFlagsBits` and `RESTJSONErrorCodes` from the discord.js import if
   nothing else uses them (`DiscordAPIError` stays: `deliverDeck` uses it).
2. Add the import and the key map (after the types, before `data`, per declaration order):

```ts
import { postTarget, refusal } from '../channel-post'

// /deck's wording for a post that cannot happen. "Here" carries a /deck hint
// that only makes sense in this command.
const REFUSAL_KEYS = { unreachable: 'deck.cannotPostHere', forbidden: 'post.cannotPost' } as const
```

3. In `deliverChoice`, replace

```ts
      const target = postTarget(component)
      if (target.kind !== 'ok') {
        const key = target.kind === 'unreachable' ? 'deck.cannotPostHere' : 'deck.cannotPost'
```

with

```ts
      const target = postTarget(component, { needsFiles: true })
      if (target.kind !== 'ok') {
        const key = REFUSAL_KEYS[target.kind]
```

4. In the same function's last `catch`, replace `await fail(refusalKey(err) ?? 'error.generic')` with

```ts
    const refused = refusal(err)
    await fail(refused ? REFUSAL_KEYS[refused] : 'error.generic')
```

5. Rename the catalog key in both files: `"deck.cannotPost"` -> `"post.cannotPost"`, text unchanged.

- [ ] **Step 5: Run the new tests and every /deck test**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/channel-post.test.ts test/commands.test.ts test/catalog-parity.test.ts`
Expected: PASS, with `commands.test.ts` unmodified (same strings, same permission list).

- [ ] **Step 6: Commit**

```bash
git add app/bot/src/discord/channel-post.ts app/bot/src/discord/commands/deck.ts app/bot/src/i18n app/bot/test/channel-post.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(bot): share the channel posting checks outside /deck"
```

---

### Task 7: `/card` on Components V2

> **Superseded after the dev-guild check (commit 0d6d83d5):** the header below is one unlabelled
> stats line with `card.stat.cost` / `card.stat.damage`. It shipped as labelled pairs on two lines
> (`**Type** ... · **Lesson** ...` / `**Cost** ... · **Rarity** ... · **Legality** ...`) using the
> restored `card.field.*` keys; spec section 4 has the final layout.

**Files:**
- Create: `app/bot/src/data/card-detail.ts`
- Create: `app/bot/src/discord/v2/card-view.ts`
- Modify: `app/bot/src/discord/commands/card.ts`
- Modify: `app/bot/src/i18n/{en,de}.json` (add `card.stat.cost`, `card.stat.damage`, `card.openSite`)
- Delete: `app/bot/src/discord/embeds/card-embed.ts`, `app/bot/test/card-embed.test.ts`
- Test: `app/bot/test/card-view.test.ts`, `app/bot/test/commands.test.ts` (the `/card` blocks)

**Interfaces:**
- Consumes: `container`, `text`, `linkButton`, `lessonColor` (Task 3); `v2Edit`, `textEdit` (Task 3).
- Produces: `type CardDetail = { doc: SearchDocument; setName: string; rulings: CardRuling[]; subTypeLabels: Record<string, string> }`,
  `loadCardDetail(deps: Deps, doc: SearchDocument, locale: string): Promise<CardDetail>`,
  `type CardViewOptions = { locale: string; imageBase: string; siteBase: string; actions?: ButtonBuilder[] }`,
  `cardView(detail: CardDetail, opts: CardViewOptions): ContainerBuilder[]`.
  Phase 2 passes `actions` (Back, Post) and reuses `loadCardDetail` for "Open a card" and "View a card".

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `card.stat.cost` | `Cost {value}` | `Kosten {value}` |
| `card.stat.damage` | `{value} damage per turn` | `{value} Schaden pro Zug` |
| `card.openSite` | `Open on revelio.cards` | `Auf revelio.cards öffnen` |

- [ ] **Step 2: Write the failing view test**

`app/bot/test/card-view.test.ts` (the fixture is `card-embed.test.ts`'s):

```ts
import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import type { SearchDocument } from '@revelio/search'
import { cardView, type CardViewOptions } from '../src/discord/v2/card-view'
import { measure, MAX_TEXT } from '../src/discord/v2/limits'
import type { CardDetail } from '../src/data/card-detail'
import { buttonsOf, flatten, mediaUrls, textOf } from './helpers/v2'

const doc: SearchDocument = {
  id: 'base-12', setCode: 'base', number: '12', numberSort: '0:000012', name: 'Nimbus 2000',
  text: 'Whenever you play a Quidditch card, draw a card.',
  flavorText: 'The fastest broom on the market.',
  types: ['item'], subTypes: ['broom'], lesson: 'quidditch', rarity: 'rare', finishes: ['normal'],
  legality: 'legal', cost: 4, damage: null, isOfficial: true, imageLang: 'en', imageVersion: 3,
  artCropVersion: null, defaultLanguage: 'en', orientation: null,
}

const detail = (over: Partial<SearchDocument> = {}, rest: Partial<CardDetail> = {}): CardDetail => ({
  doc: { ...doc, ...over }, setName: 'Base Set', rulings: [], subTypeLabels: {}, ...rest,
})

const opts: CardViewOptions = {
  locale: 'en', imageBase: 'https://img.revelio.cards', siteBase: 'https://revelio.cards',
}

const view = (d: CardDetail, o: Partial<CardViewOptions> = {}) => ({ components: cardView(d, { ...opts, ...o }) })

describe('cardView', () => {
  it('heads the card with its name and links to the card page', () => {
    const v = view(detail())
    expect(textOf(v)).toMatch(/^## Nimbus 2000\n/)
    const link = buttonsOf(v).find((b) => b.style === ButtonStyle.Link)
    expect(link?.url).toBe('https://revelio.cards/card/base-12')
    expect(link?.label).toBe('Open on revelio.cards')
  })

  it('shows the 300px thumb in a gallery, never the full image', () => {
    expect(mediaUrls(view(detail()))).toEqual(['https://img.revelio.cards/cards/thumb/base-12.3.webp'])
  })

  it('shows a horizontal card upright through its landscape thumb', () => {
    expect(mediaUrls(view(detail({ orientation: 'horizontal', imageLang: 'de' }))))
      .toEqual(['https://img.revelio.cards/cards/landscape-thumb/base-12.de.3.webp'])
  })

  it('has no gallery when the card has no image', () => {
    const v = view(detail({ imageLang: null, imageVersion: null }))
    expect(flatten(v).some((n) => n.type === ComponentType.MediaGallery)).toBe(false)
  })

  it('tints the container with the lesson colour', () => {
    expect(cardView(detail(), opts)[0].toJSON().accent_color).toBe(0xe2ae37)
  })

  it('puts type, lesson, cost, rarity and legality on one line', () => {
    expect(textOf(view(detail()))).toContain('Item, Broom · Quidditch · Cost 4 · Rare · Legal')
  })

  it('localizes the stats line and humanizes an untranslated sub-type', () => {
    expect(textOf(view(detail(), { locale: 'de' }))).toContain('Gegenstand, Broom · Quidditch · Kosten 4')
  })

  it('prefers a translated sub-type label', () => {
    const v = view(detail({ types: ['character'], subTypes: ['wizard', 'death_eater'] }, { subTypeLabels: { wizard: 'Wizard' } }))
    expect(textOf(v)).toContain('Character, Wizard, Death Eater')
  })

  it('drops what the card has no value for', () => {
    const t = textOf(view(detail({ cost: null, damage: null })))
    expect(t).not.toContain('Cost')
    expect(t).not.toContain('damage per turn')
  })

  it('ends with the set and number as a footer line', () => {
    expect(textOf(view(detail()))).toContain('-# Base Set · #12')
  })

  it('lists rulings under a heading', () => {
    const v = view(detail({}, { rulings: [{ date: '2001-11-01', source: 'WotC', text: 'It stacks.' }] }))
    expect(textOf(v)).toContain('**Rulings**\n- 2001-11-01: It stacks.')
  })

  it('stays inside the text budget for a wordy card with many rulings', () => {
    const rulings = Array.from({ length: 30 }, (_, i) => ({ date: null, source: null, text: 'y'.repeat(200) + i }))
    const components = cardView(detail({ text: 'x'.repeat(5000), flavorText: 'z'.repeat(1000) }, { rulings }), opts)
    expect(measure(components).text).toBeLessThanOrEqual(MAX_TEXT)
  })

  it('puts the actions it is given ahead of the link button', () => {
    const back = new ButtonBuilder().setCustomId('v1:cb:1:-:-:-:q').setLabel('Back').setStyle(ButtonStyle.Secondary)
    const buttons = buttonsOf(view(detail(), { actions: [back] }))
    expect(buttons.map((b) => b.label)).toEqual(['Back', 'Open on revelio.cards'])
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/card-view.test.ts`
Expected: FAIL, cannot resolve `../src/discord/v2/card-view`.

- [ ] **Step 4: Implement `card-detail.ts`**

```ts
import { getSubTypeLabels } from '@revelio/db'
import type { SearchDocument } from '@revelio/search'
import type { Deps } from '../clients'
import { resolveCardRulings, type CardRuling } from './cards'

export type CardDetail = {
  doc: SearchDocument
  setName: string
  rulings: CardRuling[]
  // Editor-curated sub-type translations for the locale, keyed by code.
  subTypeLabels: Record<string, string>
}

// Everything the card view draws beyond the search document. /card uses it
// now; the browser's "Open a card" and a shared list's "View a card" use it
// from phase 2, so the three can never show one card differently.
export async function loadCardDetail(deps: Deps, doc: SearchDocument, locale: string): Promise<CardDetail> {
  const [setName, rulings, subTypeLabels] = await Promise.all([
    deps.sets.name(doc.setCode, locale),
    resolveCardRulings(deps.db, doc.id, locale),
    getSubTypeLabels(deps.db, locale),
  ])
  return { doc, setName, rulings, subTypeLabels }
}
```

- [ ] **Step 5: Implement `card-view.ts`**

```ts
import {
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  type ButtonBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { attrLabel, humanize, imageUrl, landscapeThumbKey, thumbKey } from '@revelio/core'
import type { CardDetail } from '../../data/card-detail'
import { t } from '../../i18n/t'
import { cardUrl } from '../../links'
import { container, lessonColor, linkButton, text } from './parts'

export type CardViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Buttons that lead the link button in the view's one row: Back and Post in
  // the browser. At most four, since a row holds five.
  actions?: ButtonBuilder[]
}

// Per-part ceilings that keep a wordy card inside the message's 4000-character
// text budget, with room left for the heading, stats and footer. The guard in
// limits.ts enforces the whole; these keep a long card from ever reaching it.
const BODY_LIMIT = 1800
const RULINGS_LIMIT = 1500
const ELLIPSIS = '...'

function clamp(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`
}

// One line in place of the embed's inline-field grid, which needed blank
// padding fields to keep its columns. Sub-types are not curated in
// attributes.ts, so they resolve like the card page: a translation from the
// DB, else the humanized code.
function statsLine(detail: CardDetail, locale: string): string {
  const { doc } = detail
  const types = [
    ...doc.types.map((code) => attrLabel('types', code, locale)),
    ...doc.subTypes.map((code) => detail.subTypeLabels[code] ?? humanize(code)),
  ].join(', ')
  return [
    types,
    doc.lesson ? attrLabel('lessons', doc.lesson, locale) : '',
    doc.cost != null ? t(locale, 'card.stat.cost', { value: doc.cost }) : '',
    doc.damage != null ? t(locale, 'card.stat.damage', { value: doc.damage }) : '',
    doc.rarity ? attrLabel('rarities', doc.rarity, locale) : '',
    doc.legality ? attrLabel('legalities', doc.legality, locale) : '',
  ].filter(Boolean).join(' · ')
}

export function cardView(detail: CardDetail, opts: CardViewOptions): ContainerBuilder[] {
  const { doc } = detail
  const { locale } = opts
  const view = container(lessonColor(doc.lesson))

  const stats = statsLine(detail, locale)
  view.addTextDisplayComponents(text(stats ? `## ${doc.name}\n${stats}` : `## ${doc.name}`))

  // Card faces are stored portrait, so a horizontal card uses its pre-baked
  // landscape thumb to read upright. The 300px thumb, never the full image.
  if (doc.imageLang && doc.imageVersion != null) {
    const keyOf = doc.orientation === 'horizontal' ? landscapeThumbKey : thumbKey
    const url = imageUrl(opts.imageBase, keyOf(doc.id, doc.imageVersion, doc.imageLang, doc.defaultLanguage))
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url).setDescription(doc.name)),
    )
  }

  const body = [doc.text, doc.flavorText ? `*${doc.flavorText}*` : null].filter(Boolean).join('\n\n')
  if (body) view.addTextDisplayComponents(text(clamp(body, BODY_LIMIT)))

  if (detail.rulings.length) {
    const list = detail.rulings
      .map((r) => (r.date ? `- ${r.date}: ${r.text}` : `- ${r.text}`))
      .join('\n')
    view.addSeparatorComponents(new SeparatorBuilder())
    view.addTextDisplayComponents(
      text(`**${t(locale, 'card.field.rulings')}**\n${clamp(list, RULINGS_LIMIT)}`),
    )
  }

  view.addTextDisplayComponents(
    text(`-# ${t(locale, 'card.footer', { setName: detail.setName, number: doc.number })}`),
  )
  view.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...(opts.actions ?? []),
      linkButton(cardUrl(opts.siteBase, doc.id, locale), t(locale, 'card.openSite')),
    ),
  )
  return [view]
}
```

- [ ] **Step 6: Run the view test**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/card-view.test.ts`
Expected: PASS.

- [ ] **Step 7: Rewrite the `/card` command tests first**

In `app/bot/test/commands.test.ts`, add `import { textOf } from './helpers/v2'` and change the
`/card` and `/card id fast path` blocks:

```ts
  it('defers, then replies with the card view for the best hit', async () => {
    const interaction = fakeInteraction({ name: 'nimbus' })
    const deps = fakeDeps([doc], 1)
    await COMMANDS.get('card')!.execute(interaction as never, deps as never)

    expect(interaction.deferReply).toHaveBeenCalled()
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toMatch(/^## Nimbus 2000/)
  })

  it('replies with a localized miss when nothing matches', async () => {
    const interaction = fakeInteraction({ name: 'zzz' }, 'de')
    await COMMANDS.get('card')!.execute(interaction as never, fakeDeps([], 0) as never)
    expect(textOf(interaction.editReply.mock.calls[0][0])).toBe('Keine Karte passt zu "zzz".')
  })
```

Keep `never lets the echoed name ping anyone` as it is. In `falls back to a text search when the
value is not an id`, replace the last two lines with:

```ts
    expect(textOf(interaction.editReply.mock.calls[0][0])).toMatch(/^## Nimbus 2000/)
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/commands.test.ts -t "/card"`
Expected: FAIL on the two rewritten assertions (the command still sends embeds).

- [ ] **Step 8: Switch `card.ts` over**

Replace the imports of `getSubTypeLabels`, `resolveCardRulings` and `cardEmbed` with
`loadCardDetail`, `cardView`, `textEdit`, `v2Edit`, and the body after the lookup with:

```ts
  if (!doc) {
    // The raw option value is echoed back, so mentions must be inert: without
    // this, `/card name:@everyone` turns the bot into a mass ping.
    await interaction.editReply({
      ...textEdit(t(locale, 'card.notFound', { name })),
      allowedMentions: { parse: [] },
    })
    return
  }

  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
  })))
```

Imports, in the file's existing order:

```ts
import { findCardById, findOneCard, suggestCards } from '../../data/cards'
import { loadCardDetail } from '../../data/card-detail'
import { cardView } from '../v2/card-view'
import { textEdit, v2Edit } from '../v2/send'
```

- [ ] **Step 9: Delete the embed and its test**

```bash
git rm app/bot/src/discord/embeds/card-embed.ts app/bot/test/card-embed.test.ts
```

`inline-grid.ts` stays: `deck-embed.ts` still uses it until phase 3.

- [ ] **Step 10: Run the bot suite and typecheck**

Run: `/usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck -w @revelio/bot`
Expected: PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add app/bot/src app/bot/test
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): show /card as a components v2 container"
```

---

### Task 8: `/collection` on Components V2

**Files:**
- Modify: `app/bot/src/discord/commands/collection.ts`
- Test: `app/bot/test/personal-commands.test.ts` (the `/collection` block only)

**Interfaces:**
- Consumes: `textEdit` (Task 3).

- [ ] **Step 1: Rewrite the `/collection` assertions first**

In `personal-commands.test.ts`, add `import { textOf } from './helpers/v2'`. In the
`describe('/collection')` block only, replace every
`const { content } = interaction.editReply.mock.calls[0][0]` with
`const content = textOf(interaction.editReply.mock.calls[0][0])`, and every
`interaction.editReply.mock.calls[0][0].content` with
`textOf(interaction.editReply.mock.calls[0][0])`. Add one test to that block:

```ts
  it('answers as a components v2 message', async () => {
    linked()
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 1, totalCards: 2, totalCopies: 1,
    })
    const interaction = fakeInteraction()
    await run('collection', interaction, fakeDeps())
    expect(interaction.editReply.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2)
  })
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/personal-commands.test.ts -t "/collection"`
Expected: FAIL (the command still sends `content`). `/mydecks` tests stay untouched and green.

- [ ] **Step 2: Switch the four replies**

In `collection.ts`, import `textEdit` from `'../v2/send'` and change each
`interaction.editReply({ content: X })` to `interaction.editReply(textEdit(X))` - the link
prompt, the unknown set, the set progress and the summary. The ephemeral `deferReply` stays the
first statement.

- [ ] **Step 3: Teach the manifest test to read either format**

`test/command-manifest.test.ts`'s "sends an unlinked user to the settings page" reads
`reply.content`, which a V2 `/collection` no longer has (`/mydecks` keeps `content` until phase 3).
Add `import { textOf } from './helpers/v2'` and replace its last two lines with:

```ts
      const [reply] = interaction.editReply.mock.calls[0] as [{ content?: string; components?: unknown[] }]
      // /collection answers in V2, /mydecks still in content until phase 3.
      expect(reply.content ?? textOf(reply)).toContain('/settings')
```

- [ ] **Step 4: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/personal-commands.test.ts test/command-manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/bot/src/discord/commands/collection.ts app/bot/test/personal-commands.test.ts app/bot/test/command-manifest.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): answer /collection as a components v2 message"
```

---

### Task 9: Docs, then verify on the dev guild

**Files:**
- Modify: `CLAUDE.md` ("Discord bot specifics")
- Modify: `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md` (record where this plan refined it)

- [ ] **Step 1: Update CLAUDE.md**

Under "Discord bot specifics":

1. Replace the "Discord embed limits are hard" bullet with:

```markdown
- **Replies are Components V2** (`MessageFlags.IsComponentsV2`, built in `bot/src/discord/v2/`): one container per message, no `content`, no embeds, and Discord never lets a message drop the flag again. Build every payload through `v2Message` / `v2Edit` (`v2/send.ts`), which run `assertWithinLimits`: at most 40 components counting nested ones, at most 4000 characters across text displays (the probe findings in `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md` say what Discord itself enforces). A breach fails the whole interaction with a 400, so views clamp their own text and the guard is the backstop. Status lines are V2 too (`textMessage` / `textEdit`). `/deck`'s deck message and prompts are still embeds and content until phase 3 of that spec.
```

2. Add after it:

```markdown
- **Buttons and selects route by custom id** (`discord/components/`): `v1:<kind>:<fields>`, positional, the query last, at most 100 characters, every view's whole state inside the id - nothing is stored, so a click works after a restart. `handle-interaction.ts` dispatches a `v<n>:` id to `COMPONENTS` by kind; an undecodable id or a kind with no handler answers "out of date". **Ids are untrusted input**: nothing in one authorizes anything, and every deck read re-resolves the clicking user (`resolveLinkedUser`) and goes through `getDeckAccess` / `getDeckForViewer`. A handler on a public message acknowledges only with an ephemeral reply, never `update` / `deferUpdate`. `/deck`'s prompt ids (`deck:post`, ...) have no version prefix and stay with its collector.
```

3. In the private-deck bullet, replace "There is no global component router in `discord/handle-interaction.ts`, so a bot restart leaves an open prompt's buttons dead, which is accepted." with "Its prompt keeps a collector rather than the component router, so a bot restart leaves an open prompt's buttons dead, which is accepted. Posting checks live in `discord/channel-post.ts`, the one path every post to a channel goes through."

4. In "Card images in embeds use `thumbKey`", change "in embeds" to "in embeds, thumbnails and galleries".

- [ ] **Step 2: Note this plan's refinements in the spec**

In the spec:
- Section 1: the payload helpers are `v2Message` / `v2Edit` / `textMessage` / `textEdit`
  (replacing the names `v2Reply` / `textPayload`).
- Section 2: add the kinds `sl`, `st`, `ss`, `dl`, `df`, `ds` (one per filter select, since ids
  must be unique within a message) and `pg` (the page indicator) to the table; the set field
  is validated syntactically only, a well-formed unknown set finds no cards.
- Section 3: `refusal` returns `'unreachable' | 'forbidden'`, callers keep their own wording;
  `/deck` keeps `deck.cannotPostHere`, only `deck.cannotPost` became `post.cannotPost`.

- [ ] **Step 3: Run the whole check suite**

Run, from `app/`:
```bash
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm run build -w @revelio/bot
```
Expected: all green; record the bot test count for the PR.

- [ ] **Step 4: Check by hand on the dev guild**

Start the stack and the bot (`docker compose up -d` from `app/`, then
`/usr/local/bin/npm run dev -w @revelio/bot`), and in the dev guild, Discord set to English and
then German:

- `/card name:Nimbus 2000` - container with the lesson accent, stats line, image, footer, link
  button. This settles probe assumption 3 (a deferred reply edited into V2); write the result
  into the spec's "Probe findings" table as row 3.
- `/card` for a horizontal card and for a card with rulings.
- `/card name:zzzz` - the miss as a V2 line.
- `/collection` and `/collection set:<code>` - V2 lines, only you see them.
- `/deck` on your own private deck -> **Post publicly**, and in a channel where the bot lacks
  Attach Files: the same messages as before this branch (the `channel-post.ts` move).

Screenshot the `/card` reply on desktop and mobile for the PR.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-13-bot-components-v2-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe the components v2 layer and router in CLAUDE.md"
```

# Bot Components V2, Phase 2: Card browsing - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/search` into a private, browsable result list: card thumbnails, pages, filter
selects on the message, open a card in place, post one card, and share some or all cards of a page
to the channel, where anyone can open one of them privately.

**Architecture:** One handler module (`components/search-browser.ts`) registers the card kinds of
the phase 1 codec with `COMPONENTS`; every click decodes its state, does one Meilisearch read and
edits the private message. Views are pure functions in `v2/` (`rows`, `pager`, `search-view`,
`share-view`). Posting reuses `channel-post.ts`. `@revelio/search` gains one projection so a row
can draw its thumbnail and stats.

**Tech Stack:** TypeScript, discord.js 14.27, Meilisearch (via `@revelio/search`), Vitest; web
docs catalog (next-intl JSON) for the manifest change.

**Spec:** `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md`, section 5 (and 1-3 as
built by phase 1, including its "Probe findings").

**Depends on:** phase 1 merged into this branch (`v2/`, `components/custom-id.ts`, `COMPONENTS`,
`channel-post.ts`, `loadCardDetail`, `cardView`, `test/helpers/v2.ts`).

## Global Constraints

- Branch `feat/bot-components-v2`. Conventional Commits, scope `bot` / `search` / `web` / `core`,
  signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`, no tool attribution.
- Commands run from `app/` with `/usr/local/bin/npm`.
- `/search` defers **ephemerally** as its first statement, like `/collection` and `/mydecks`.
- Every message built through `v2Message` / `v2Edit`; one container per message; 40 components
  and 4000 text characters at most.
- Every post into a channel is `channel.send` after `postTarget(..., { needsFiles: false })`,
  never an interaction reply; a failed send that is not a `DiscordAPIError` is never retried.
- Handlers on the private browser acknowledge with `deferUpdate()` then `editReply()`; the one
  handler on a public message (`pk`) acknowledges only with `deferReply({ flags: Ephemeral })`.
- Custom ids and select values are untrusted: ids decode through `decodeCustomId`, card ids from
  select values pass `isEntityId`, filter values are checked against `LESSONS` / `TYPES` / the
  set list.
- User text shown in a message (the query) goes through `plain()` so it cannot inject markdown
  or a masked link.
- Every string from `bot/src/i18n/{en,de}.json`; both catalogs; ASCII-only code comments.
- Card images through `cardThumbUrl` (`thumbKey` / `landscapeThumbKey`).

## Review Focus

- A query like `[free nitro](https://evil.example)` must not become a clickable masked link in
  the private header or, worse, in the public shared list. Pinned in Tasks 3 and 6.
- Meilisearch over-counts, so the page after the last real one can come back empty: it must say
  so with "Previous" enabled, not show a blank list or an error. Pinned in Task 3.
- A select value is client data: a tampered card id (quotes, spaces) must drop out before it
  reaches a Meilisearch filter. Pinned in Task 6.
- Outside a guild (DM, group DM) there is no channel to post to: Share and Post must be absent,
  not present and failing. Pinned in Tasks 3 and 4.
- A `/search set:` typed by hand that matches no set must say so rather than throw while encoding
  the custom id. Pinned in Task 4.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/search/src/search.ts` | modify | `BROWSE_FIELDS`, `CardBrowseHit`, `searchCardBrowseRows` |
| `app/bot/src/data/cards.ts` | modify | `findCards` reads browse rows, 5 per page |
| `app/bot/src/discord/v2/parts.ts` | modify | add `plain`, `cardThumbUrl` |
| `app/bot/src/discord/v2/rows.ts` | create | `addCardRow`, `cardRowText` |
| `app/bot/src/discord/v2/pager.ts` | create | `pagerRow` |
| `app/bot/src/discord/v2/search-view.ts` | create | the private browser |
| `app/bot/src/discord/v2/share-view.ts` | create | `sharePicker`, `shareView` |
| `app/bot/src/discord/v2/card-view.ts` | modify | `lead` option, `cardThumbUrl` |
| `app/bot/src/discord/components/custom-id.ts` | modify | export `isEntityId` |
| `app/bot/src/discord/components/search-browser.ts` | create | handlers for `s sl st ss co cb sh sp cp pk`, `renderSearchBrowser` |
| `app/bot/src/discord/components/index.ts` | modify | register `SEARCH_HANDLERS` |
| `app/bot/src/discord/commands/search.ts` | modify | ephemeral browser, `query` optional, no `page` |
| `app/bot/src/discord/embeds/search-embed.ts` | delete | replaced by `search-view.ts` |
| `app/core/src/bot-commands.ts` | modify | `maxLength`, `/search` entry |
| `app/web/src/components/docs/command-table.tsx` | modify | render `maxLength` |
| `app/web/messages/{en,de}.json` | modify | `docs.commands.search.options`, `docs.commandTable.maxLength` |
| `app/bot/src/i18n/{en,de}.json` | modify | browser and posting keys |
| `app/bot/test/helpers/meili.ts`, `helpers/discord.ts` | create | shared fakes |
| `app/bot/test/rows.test.ts`, `search-view.test.ts`, `share-view.test.ts`, `search-browser.test.ts` | create | tests |
| `app/bot/test/cards.test.ts`, `commands.test.ts`, `command-manifest.test.ts`, `handle-interaction.test.ts`, `card-view.test.ts` | modify | follow the changes |
| `app/bot/test/search-embed.test.ts` | delete | |

---

### Task 1: Browse rows from Meilisearch

**Files:**
- Modify: `app/search/src/search.ts`
- Modify: `app/bot/src/data/cards.ts`
- Create: `app/bot/test/helpers/meili.ts`
- Test: `app/bot/test/cards.test.ts`

**Interfaces:**
- Produces: `type CardBrowseHit = Pick<SearchDocument, 'id' | 'name' | 'setCode' | 'number' | 'types' | 'lesson' | 'cost' | 'imageVersion' | 'imageLang' | 'defaultLanguage' | 'orientation'>`,
  `searchCardBrowseRows(client, lang, query, opts?): Promise<CardProjection<...>>` (from `@revelio/search`);
  `CardPage.hits: CardBrowseHit[]`, `DEFAULT_PAGE_SIZE = 5` (from `bot/src/data/cards.ts`);
  `stubMeili(hits, total)` (from `test/helpers/meili.ts`).

- [ ] **Step 1: Move the projecting Meilisearch stub into a helper**

Create `app/bot/test/helpers/meili.ts` holding `federatedToSearch` and `stubMeili`, moved verbatim
(with their comments) from `app/bot/test/cards.test.ts`, both exported. In `cards.test.ts`, delete
the two functions and add `import { stubMeili } from './helpers/meili'`.

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/cards.test.ts`
Expected: PASS (pure move).

- [ ] **Step 2: Write the failing test**

Add to `describe('findCards')` in `cards.test.ts`:

```ts
  // A browse row draws a thumbnail and a stats line, so the read must carry the
  // image and stat fields - and still not the rules text.
  it('reads the browse projection, five to a page', async () => {
    const full = {
      ...doc, lesson: 'quidditch', cost: 4, imageVersion: 3, imageLang: 'en',
      defaultLanguage: 'en', orientation: null, flavorText: 'Fast.',
    }
    const { client, search } = stubMeili([full], 1)
    const page = await findCards(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 5 }))
    expect(page.hits[0]).toMatchObject({ imageVersion: 3, lesson: 'quidditch', cost: 4, types: ['item'] })
    expect(page.hits[0]).not.toHaveProperty('text')
    expect(page.hits[0]).not.toHaveProperty('flavorText')
  })
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/cards.test.ts`
Expected: FAIL (limit is 10, no `imageVersion`).

- [ ] **Step 3: Add the projection to `@revelio/search`**

In `app/search/src/search.ts`, next to `CardSummaryHit`:

```ts
// A browse row: the summary plus what a thumbnail and a one-line stats label
// need. Still no rules text or flavour: a page of rows renders neither.
export type CardBrowseHit = Pick<SearchDocument, (typeof BROWSE_FIELDS)[number]>
```

next to `SUMMARY_FIELDS`:

```ts
const BROWSE_FIELDS = [
  'id', 'name', 'setCode', 'number', 'types', 'lesson', 'cost',
  'imageVersion', 'imageLang', 'defaultLanguage', 'orientation',
] as const
```

and after `searchCardSummaries`:

```ts
// The Discord bot's result rows: identity, a thumbnail and a stats line.
export async function searchCardBrowseRows(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<CardProjection<(typeof BROWSE_FIELDS)[number]>> {
  return searchCardFields(client, lang, query, BROWSE_FIELDS, opts)
}
```

- [ ] **Step 4: Switch `findCards`**

In `app/bot/src/data/cards.ts`: import `searchCardBrowseRows` and `type CardBrowseHit` instead of
`searchCardSummaries` / `CardSummaryHit` (keep `CardSummaryHit` only if `suggestCards` still
names it); `CardPage.hits` becomes `CardBrowseHit[]`; `DEFAULT_PAGE_SIZE = 5` with the comment
"Five rows with thumbnails keep the browser at 33 of Discord's 40 components."; `findCards` calls
`searchCardBrowseRows` and its comment says it reads browse rows.

- [ ] **Step 5: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/cards.test.ts && /usr/local/bin/npm run typecheck`
Expected: PASS. `search-embed.ts` still compiles (it reads `name`, `setCode`, `number`). If the
existing `queries the locale index and reports page arithmetic` test passes `pageSize: 10`, it
stays as is.

- [ ] **Step 6: Commit**

```bash
git add app/search/src/search.ts app/bot/src/data/cards.ts app/bot/test/cards.test.ts app/bot/test/helpers/meili.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(search): read card browse rows for the bot's result list"
```

---

### Task 2: Rows, the pager, and safe text

**Files:**
- Modify: `app/bot/src/discord/v2/parts.ts` (add `plain`, `cardThumbUrl`)
- Modify: `app/bot/src/discord/v2/card-view.ts` (use `cardThumbUrl`; add `lead`)
- Create: `app/bot/src/discord/v2/rows.ts`, `app/bot/src/discord/v2/pager.ts`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/rows.test.ts`, `app/bot/test/card-view.test.ts`

**Interfaces:**
- Produces:
  - `plain(value: string): string` - backslash-escapes `\ * _ ~ \` | > # - [ ] ( ) <`.
  - `cardThumbUrl(card: Pick<SearchDocument, 'id' | 'imageVersion' | 'imageLang' | 'defaultLanguage' | 'orientation'>, imageBase: string): string | null`.
  - `cardRowText(hit: CardBrowseHit, locale: string): string`,
    `addCardRow(view: ContainerBuilder, hit: CardBrowseHit, opts: { locale: string; imageBase: string }): void`.
  - `type PagerOptions = { locale: string; page: number; pages: number; hasNext: boolean; prevId: string; nextId: string; indicatorId: string; trailing?: ButtonBuilder[] }`,
    `pagerRow(opts: PagerOptions): ActionRowBuilder<MessageActionRowComponentBuilder>`.
  - `CardViewOptions.lead?: string` - a line shown above the heading (the "shared by" line).

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `browse.prev` | `Previous` | `Zurück` |
| `browse.next` | `Next` | `Weiter` |
| `browse.page` | `{page} / {pages}` | `{page} / {pages}` |

- [ ] **Step 2: Write the failing tests**

`app/bot/test/rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { addCardRow, cardRowText } from '../src/discord/v2/rows'
import { pagerRow } from '../src/discord/v2/pager'
import { cardThumbUrl, container, plain } from '../src/discord/v2/parts'
import { flatten, mediaUrls, textOf } from './helpers/v2'

const hit: CardBrowseHit = {
  id: 'base-12', name: 'Nimbus 2000', setCode: 'base', number: '12', types: ['item'],
  lesson: 'quidditch', cost: 4, imageVersion: 3, imageLang: 'en', defaultLanguage: 'en', orientation: null,
}
const opts = { locale: 'en', imageBase: 'https://img.test' }
const rowOf = (h: CardBrowseHit) => {
  const view = container()
  addCardRow(view, h, opts)
  return { components: [view] }
}

describe('plain', () => {
  it('neutralizes markdown and masked links', () => {
    expect(plain('[free](https://evil.example) **x**')).toBe('\\[free\\]\\(https://evil.example\\) \\*\\*x\\*\\*')
  })

  it('leaves ordinary words alone', () => {
    expect(plain('lumos maxima')).toBe('lumos maxima')
  })
})

describe('cardThumbUrl', () => {
  it('uses the portrait thumb, or the landscape one for a horizontal card', () => {
    expect(cardThumbUrl(hit, 'https://img.test')).toBe('https://img.test/cards/thumb/base-12.3.webp')
    expect(cardThumbUrl({ ...hit, orientation: 'horizontal', imageLang: 'de' }, 'https://img.test'))
      .toBe('https://img.test/cards/landscape-thumb/base-12.de.3.webp')
  })

  it('is null for a card without an image', () => {
    expect(cardThumbUrl({ ...hit, imageVersion: null }, 'https://img.test')).toBeNull()
  })
})

describe('card rows', () => {
  it('names the card and its printing, then its stats', () => {
    expect(cardRowText(hit, 'en')).toBe('**Nimbus 2000** · base #12\nItem · Quidditch · Cost 4')
  })

  it('is a section with the thumbnail beside the text', () => {
    const row = rowOf(hit)
    expect(flatten(row).some((n) => n.type === ComponentType.Section)).toBe(true)
    expect(mediaUrls(row)).toEqual(['https://img.test/cards/thumb/base-12.3.webp'])
  })

  // A section must have an accessory, so a card with no image is plain text.
  it('is plain text when the card has no image', () => {
    const row = rowOf({ ...hit, imageVersion: null })
    expect(flatten(row).some((n) => n.type === ComponentType.Section)).toBe(false)
    expect(textOf(row)).toContain('**Nimbus 2000**')
  })
})

describe('pagerRow', () => {
  const ids = { prevId: 'v1:s:1:-:-:-:', nextId: 'v1:s:3:-:-:-:', indicatorId: 'v1:pg:c' }
  const buttons = (o: Partial<Parameters<typeof pagerRow>[0]>) =>
    pagerRow({ locale: 'en', page: 2, pages: 5, hasNext: true, ...ids, ...o }).toJSON().components as {
      label?: string; disabled?: boolean; custom_id?: string
    }[]

  it('shows previous, the page, and next, the page disabled', () => {
    const [prev, page, next] = buttons({})
    expect([prev.label, page.label, next.label]).toEqual(['Previous', '2 / 5', 'Next'])
    expect([prev.disabled, page.disabled, next.disabled]).toEqual([false, true, false])
  })

  it('disables previous on the first page and next without a next page', () => {
    const [prev, , next] = buttons({ page: 1, hasNext: false })
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('appends trailing buttons', () => {
    const extra = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL('https://x.test').setLabel('site')
    expect(buttons({ trailing: [extra] })).toHaveLength(4)
  })
})
```

Add to `card-view.test.ts`:

```ts
  it('puts a lead line above the heading', () => {
    expect(textOf(view(detail(), { lead: '<@1> shared a card.' }))).toMatch(/^<@1> shared a card\.\n## Nimbus 2000/)
  })
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/rows.test.ts test/card-view.test.ts`
Expected: FAIL (modules and `lead` missing).

- [ ] **Step 3: Add `plain` and `cardThumbUrl` to `parts.ts`**

```ts
import { imageUrl, landscapeThumbKey, thumbKey } from '@revelio/core'
import type { SearchDocument } from '@revelio/search'

type ThumbSource = Pick<SearchDocument, 'id' | 'imageVersion' | 'imageLang' | 'defaultLanguage' | 'orientation'>

// Markdown's active characters, plus `<` so a typed "<@123>" or "<#1>" renders
// as text rather than as a mention or channel link.
const MARKDOWN = /[\\`*_~|>#\-[\]()<]/g

// User text inside a text display. Discord renders markdown there, masked
// links included, so a query or a deck name could otherwise post a link that
// reads as anything at all - in a message the bot sends.
export function plain(value: string): string {
  return value.replace(MARKDOWN, '\\$&')
}

// Card faces are stored portrait, so a horizontal card uses its pre-baked
// landscape thumb to read upright. The 300px thumb, never the full image.
export function cardThumbUrl(card: ThumbSource, imageBase: string): string | null {
  if (!card.imageLang || card.imageVersion == null) return null
  const keyOf = card.orientation === 'horizontal' ? landscapeThumbKey : thumbKey
  return imageUrl(imageBase, keyOf(card.id, card.imageVersion, card.imageLang, card.defaultLanguage))
}
```

(Merge the `@revelio/core` import with the existing `LESSONS` one; types before constants.)

- [ ] **Step 4: Use them in `card-view.ts`**

Replace the image block with:

```ts
  const image = cardThumbUrl(doc, opts.imageBase)
  if (image) {
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image).setDescription(doc.name)),
    )
  }
```

drop the now-unused `imageUrl`, `landscapeThumbKey`, `thumbKey` imports, add `lead?: string` to
`CardViewOptions` with the comment "A line above the heading: who shared the card, on a post to a
channel.", and make the heading text:

```ts
  const heading = stats ? `## ${doc.name}\n${stats}` : `## ${doc.name}`
  view.addTextDisplayComponents(text(opts.lead ? `${opts.lead}\n${heading}` : heading))
```

- [ ] **Step 5: Create `rows.ts`**

```ts
import { SectionBuilder, ThumbnailBuilder, type ContainerBuilder } from 'discord.js'
import { attrLabel } from '@revelio/core'
import type { CardBrowseHit } from '@revelio/search'
import { t } from '../../i18n/t'
import { cardThumbUrl, text } from './parts'

export type CardRowOptions = { locale: string; imageBase: string }

// "**Name** · set #number", then "Type · Lesson · Cost n" - whatever the card has.
export function cardRowText(hit: CardBrowseHit, locale: string): string {
  const title = t(locale, 'search.line', { name: hit.name, setCode: hit.setCode, number: hit.number })
  const stats = [
    hit.types.map((code) => attrLabel('types', code, locale)).join(', '),
    hit.lesson ? attrLabel('lessons', hit.lesson, locale) : '',
    hit.cost != null ? t(locale, 'card.stat.cost', { value: hit.cost }) : '',
  ].filter(Boolean).join(' · ')
  return stats ? `${title}\n${stats}` : title
}

// One result row: a section with the card's thumbnail beside its text, or plain
// text for a card with no image, since a section must carry an accessory.
// Three components with a thumbnail (section, text, thumbnail), one without.
export function addCardRow(view: ContainerBuilder, hit: CardBrowseHit, opts: CardRowOptions): void {
  const content = cardRowText(hit, opts.locale)
  const thumb = cardThumbUrl(hit, opts.imageBase)
  if (!thumb) {
    view.addTextDisplayComponents(text(content))
    return
  }
  view.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription(hit.name)),
  )
}
```

- [ ] **Step 6: Create `pager.ts`**

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { t } from '../../i18n/t'

export type PagerOptions = {
  locale: string
  page: number
  pages: number
  // False on the estimated last page and on a short page: Meilisearch totals
  // over-count, so "page < pages" alone can offer a next page that is empty.
  hasNext: boolean
  prevId: string
  nextId: string
  // The page indicator is a disabled button, which still needs an id of its own.
  indicatorId: string
  // Share and the site link ride in the same row; a row holds five buttons.
  trailing?: ButtonBuilder[]
}

export function pagerRow(opts: PagerOptions): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const { locale } = opts
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(opts.prevId).setLabel(t(locale, 'browse.prev'))
      .setStyle(ButtonStyle.Secondary).setDisabled(opts.page <= 1),
    new ButtonBuilder().setCustomId(opts.indicatorId)
      .setLabel(t(locale, 'browse.page', { page: opts.page, pages: opts.pages }))
      .setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(opts.nextId).setLabel(t(locale, 'browse.next'))
      .setStyle(ButtonStyle.Secondary).setDisabled(!opts.hasNext),
    ...(opts.trailing ?? []),
  )
}
```

- [ ] **Step 7: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/rows.test.ts test/card-view.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/bot/src/discord/v2 app/bot/src/i18n app/bot/test/rows.test.ts app/bot/test/card-view.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add card rows, a pager and markdown-safe text for v2 views"
```

---

### Task 3: The search browser view

**Files:**
- Create: `app/bot/src/discord/v2/search-view.ts`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/search-view.test.ts`

**Interfaces:**
- Consumes: `CardPage` (Task 1), `addCardRow`, `pagerRow`, `plain` (Task 2), `encodeCustomId`,
  `CardBrowseState` (phase 1), `SetEntry` (`data/sets.ts`), `searchUrl` (`links.ts`).
- Produces: `type SearchViewOptions = { locale: string; imageBase: string; siteBase: string; sets: SetEntry[]; canPost: boolean }`,
  `searchView(page: CardPage, state: CardBrowseState, opts: SearchViewOptions): ContainerBuilder[]`,
  `ANY = '-'` (the "any" select value).

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `browse.any` | `Any` | `Alle` |
| `browse.site` | `revelio.cards` | `revelio.cards` |
| `search.header` | `Cards found: **{total}**` | `Gefundene Karten: **{total}**` |
| `search.header.query` | `Cards found for "{query}": **{total}**` | `Gefundene Karten für „{query}“: **{total}**` |
| `search.pageEmpty` | `No more results on this page. Go back one.` | `Auf dieser Seite gibt es keine weiteren Ergebnisse. Geh eine zurück.` |
| `search.open.placeholder` | `Open a card...` | `Karte öffnen ...` |
| `search.filter.lesson` | `Lesson` | `Lektion` |
| `search.filter.type` | `Card type` | `Kartentyp` |
| `search.filter.set` | `Set` | `Set` |
| `search.share` | `Share` | `Teilen` |

- [ ] **Step 2: Write the failing test**

`app/bot/test/search-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { searchView, type SearchViewOptions } from '../src/discord/v2/search-view'
import type { CardBrowseState } from '../src/discord/components/custom-id'
import type { CardPage } from '../src/data/cards'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, textOf } from './helpers/v2'

const hit = (n: number): CardBrowseHit => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), types: ['spell'],
  lesson: 'charms', cost: 2, imageVersion: 1, imageLang: 'en', defaultLanguage: 'en', orientation: null,
})
const page = (n: number, over: Partial<CardPage> = {}): CardPage => ({
  hits: Array.from({ length: n }, (_, i) => hit(i + 1)), total: 23, page: 2, pageSize: 5, pages: 5, ...over,
})
const state: CardBrowseState = { page: 2, lesson: null, type: null, set: null, query: 'lumos' }
const sets = Array.from({ length: 30 }, (_, i) => ({ code: `s${i}`, name: `Set ${i}` }))
const opts: SearchViewOptions = {
  locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards', sets, canPost: true,
}
const render = (p: CardPage, s: CardBrowseState = state, o: Partial<SearchViewOptions> = {}) =>
  ({ components: searchView(p, s, { ...opts, ...o }) })
const selects = (v: { components: unknown[] }) => flatten(v).filter((n) => n.type === ComponentType.StringSelect) as {
  custom_id: string; placeholder?: string; options: { value: string; default?: boolean }[]
}[]

describe('searchView', () => {
  it('stays inside the limits at its fullest', () => {
    const full = render(page(5), { ...state, lesson: 'charms', type: 'spell', set: 's29', query: 'x'.repeat(50) })
    expect(measure(full.components).components).toBeLessThanOrEqual(40)
  })

  it('heads the page with the query and the total', () => {
    expect(textOf(render(page(5)))).toContain('Cards found for "lumos": **23**')
  })

  it('escapes markdown in the echoed query', () => {
    const v = render(page(5), { ...state, query: '[x](https://evil.example)' })
    expect(textOf(v)).toContain('\\[x\\]\\(https://evil.example\\)')
  })

  it('names active filters in the header', () => {
    const v = render(page(5), { ...state, lesson: 'charms', set: 's3' })
    expect(textOf(v)).toContain('Charms')
    expect(textOf(v)).toContain('Set 3')
  })

  it('offers an open menu with one option per card', () => {
    const open = selects(render(page(5))).find((s) => s.custom_id.startsWith('v1:co:'))
    expect(open?.options.map((o) => o.value)).toEqual(['base-1', 'base-2', 'base-3', 'base-4', 'base-5'])
  })

  it('marks the active filter value and offers Any', () => {
    const lesson = selects(render(page(5), { ...state, lesson: 'charms' })).find((s) => s.custom_id.startsWith('v1:sl:'))
    expect(lesson?.options[0]).toMatchObject({ value: '-', default: false })
    expect(lesson?.options.find((o) => o.value === 'charms')?.default).toBe(true)
  })

  it('lists at most 25 sets and keeps the active one even past the cut', () => {
    const set = selects(render(page(5), { ...state, set: 's29' })).find((s) => s.custom_id.startsWith('v1:ss:'))
    expect(set?.options).toHaveLength(25)
    expect(set?.options.some((o) => o.value === 's29' && o.default)).toBe(true)
  })

  it('disables next on a short page', () => {
    const next = buttonsOf(render(page(3))).find((b) => b.label === 'Next')
    expect(next?.disabled).toBe(true)
  })

  // Totals are estimates: a page inside them can be empty.
  it('says an empty page is past the end, with previous still enabled', () => {
    const v = render(page(0))
    expect(textOf(v)).toContain('No more results on this page')
    expect(buttonsOf(v).find((b) => b.label === 'Previous')?.disabled).toBe(false)
    expect(selects(v).some((s) => s.custom_id.startsWith('v1:co:'))).toBe(false)
  })

  it('keeps the filters but drops rows, open and share when nothing matched', () => {
    const v = render(page(0, { total: 0, page: 1, pages: 1 }), { ...state, page: 1 })
    expect(textOf(v)).toContain('Nothing matched that search.')
    expect(selects(v).some((s) => s.custom_id.startsWith('v1:sl:'))).toBe(true)
    expect(buttonsOf(v).some((b) => b.label === 'Share')).toBe(false)
  })

  it('offers Share in a server and not outside one', () => {
    expect(buttonsOf(render(page(5))).some((b) => b.label === 'Share')).toBe(true)
    expect(buttonsOf(render(page(5), state, { canPost: false })).some((b) => b.label === 'Share')).toBe(false)
  })

  it('links the same search on the site', () => {
    const site = buttonsOf(render(page(5), { ...state, lesson: 'charms' })).find((b) => b.url)
    expect(site?.url).toBe('https://revelio.cards/search?q=lumos&lesson=charms')
  })

  it('gives every control a distinct id', () => {
    const ids = flatten(render(page(5))).flatMap((n) => (n.custom_id ? [n.custom_id] : []))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-view.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `search-view.ts`**

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { LESSONS, TYPES, attrLabel } from '@revelio/core'
import { clampLabel, type CardPage } from '../../data/cards'
import type { SetEntry } from '../../data/sets'
import { t } from '../../i18n/t'
import { searchUrl } from '../../links'
import { encodeCustomId, type CardBrowseState } from '../components/custom-id'
import { pagerRow } from './pager'
import { BRAND_GOLD, container, linkButton, plain, text } from './parts'
import { addCardRow } from './rows'

export type SearchViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // The set select's options, in release order.
  sets: SetEntry[]
  // False outside a guild, where there is no channel to share into.
  canPost: boolean
}

type FilterOption = { value: string; label: string }

// The select value meaning "no filter". Not a code any lesson, type or set uses.
export const ANY = '-'

// A select holds 25 options; one of them is "Any".
const MAX_FILTER_OPTIONS = 24

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

function filterSelect(
  kind: 'sl' | 'st' | 'ss',
  state: CardBrowseState,
  placeholder: string,
  options: FilterOption[],
  current: string | null,
  locale: string,
): Row {
  // The active value stays selectable even when it falls past the cut.
  const active = options.find((o) => o.value === current)
  const listed = options.slice(0, MAX_FILTER_OPTIONS)
  const shown = active && !listed.includes(active) ? [active, ...listed.slice(0, -1)] : listed
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind, state }))
      .setPlaceholder(placeholder)
      .addOptions(
        { label: t(locale, 'browse.any'), value: ANY, default: current == null },
        ...shown.map((o) => ({ label: clampLabel(o.label), value: o.value, default: o.value === current })),
      ),
  )
}

function header(page: CardPage, state: CardBrowseState, opts: SearchViewOptions): string {
  const { locale } = opts
  if (page.total === 0) return t(locale, 'search.noResults')
  if (page.hits.length === 0) return t(locale, 'search.pageEmpty')
  const head = state.query
    ? t(locale, 'search.header.query', { query: plain(state.query), total: page.total })
    : t(locale, 'search.header', { total: page.total })
  const filters = [
    state.lesson ? attrLabel('lessons', state.lesson, locale) : '',
    state.type ? attrLabel('types', state.type, locale) : '',
    state.set ? opts.sets.find((s) => s.code === state.set)?.name ?? state.set : '',
  ].filter(Boolean)
  return filters.length ? `${head} · ${filters.join(' · ')}` : head
}

// The private browser: header, up to five rows, an open menu, three filter
// menus and the pager. 33 components at its fullest (spec section 5).
export function searchView(page: CardPage, state: CardBrowseState, opts: SearchViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container(BRAND_GOLD).addTextDisplayComponents(text(header(page, state, opts)))

  if (page.hits.length) {
    view.addSeparatorComponents(new SeparatorBuilder())
    for (const hit of page.hits) addCardRow(view, hit, opts)
    view.addSeparatorComponents(new SeparatorBuilder())
    view.addActionRowComponents(row(
      new StringSelectMenuBuilder()
        .setCustomId(encodeCustomId({ kind: 'co', state }))
        .setPlaceholder(t(locale, 'search.open.placeholder'))
        .addOptions(page.hits.map((hit) => ({
          label: clampLabel(hit.name),
          description: `${hit.setCode} #${hit.number}`,
          value: hit.id,
        }))),
    ))
  }

  view.addActionRowComponents(
    filterSelect('sl', state, t(locale, 'search.filter.lesson'),
      LESSONS.map((l) => ({ value: l.code, label: attrLabel('lessons', l.code, locale) })), state.lesson, locale),
    filterSelect('st', state, t(locale, 'search.filter.type'),
      TYPES.map((ty) => ({ value: ty.code, label: attrLabel('types', ty.code, locale) })), state.type, locale),
    filterSelect('ss', state, t(locale, 'search.filter.set'),
      opts.sets.map((s) => ({ value: s.code, label: s.name })), state.set, locale),
  )

  const trailing: ButtonBuilder[] = []
  if (page.hits.length && opts.canPost) {
    trailing.push(new ButtonBuilder()
      .setCustomId(encodeCustomId({ kind: 'sh', state }))
      .setLabel(t(locale, 'search.share'))
      .setStyle(ButtonStyle.Primary))
  }
  trailing.push(linkButton(
    searchUrl(opts.siteBase, state.query, locale, { lesson: state.lesson, type: state.type, set: state.set }),
    t(locale, 'browse.site'),
  ))
  const hasNext = page.page < page.pages && page.hits.length === page.pageSize
  view.addActionRowComponents(pagerRow({
    locale,
    page: page.page,
    pages: Math.max(page.pages, page.page),
    hasNext,
    prevId: encodeCustomId({ kind: 's', state: { ...state, page: Math.max(1, page.page - 1) } }),
    nextId: encodeCustomId({ kind: 's', state: { ...state, page: page.page + 1 } }),
    indicatorId: encodeCustomId({ kind: 'pg', of: 'cards' }),
    trailing,
  }))
  return [view]
}
```

- [ ] **Step 4: Run the test**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-view.test.ts test/catalog-parity.test.ts`
Expected: PASS. If `gives every control a distinct id` fails on page 1 (prev and next both
`page: 1`/`page: 2`), it does not: prev is `max(1, 0) = 1`, next `2`.

- [ ] **Step 5: Commit**

```bash
git add app/bot/src/discord/v2/search-view.ts app/bot/src/i18n app/bot/test/search-view.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): draw the private search browser as a v2 container"
```

---

### Task 4: `/search` opens the browser; paging and filters

**Files:**
- Create: `app/bot/src/discord/components/search-browser.ts`
- Create: `app/bot/test/helpers/discord.ts`
- Modify: `app/bot/src/discord/components/index.ts`, `app/bot/src/discord/commands/search.ts`
- Modify: `app/core/src/bot-commands.ts`, `app/web/src/components/docs/command-table.tsx`, `app/web/messages/{en,de}.json`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Delete: `app/bot/src/discord/embeds/search-embed.ts`, `app/bot/test/search-embed.test.ts`
- Test: `app/bot/test/search-browser.test.ts`, `app/bot/test/commands.test.ts` (`/search` blocks),
  `app/bot/test/command-manifest.test.ts`, `app/bot/test/handle-interaction.test.ts`,
  `app/web/src/components/docs/__tests__/command-table.test.tsx`

**Interfaces:**
- Consumes: `searchView`, `ANY` (Task 3), `findCards` (Task 1), `COMPONENTS`, `ComponentHandler` (phase 1).
- Produces: `renderSearchBrowser(deps: Deps, state: CardBrowseState, locale: string, canPost: boolean): Promise<V2Edit>`,
  `SEARCH_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[]` (Tasks 5 and 6 append),
  `isCardState(id: CustomId): id is { kind: CardKind; state: CardBrowseState }`,
  `fakeClick(customId, opts)` and `fakeDeps(hits, total)` test helpers,
  `CommandOptionSpec.maxLength?: number`.

- [ ] **Step 1: Add the shared test fakes**

`app/bot/test/helpers/discord.ts`:

```ts
import { vi } from 'vitest'
import { MessageFlags } from 'discord.js'
import { stubMeili } from './meili'

export type ClickOptions = {
  values?: string[]
  ephemeral?: boolean
  inGuild?: boolean
  allowed?: boolean
  locale?: string
}

// A button or select click as discord.js hands it over. deferUpdate/deferReply
// flip `deferred` the way discord.js does, so the router's error path sees the
// same state it would in production.
export function fakeClick(customId: string, opts: ClickOptions = {}) {
  const click = {
    id: 'click-1',
    customId,
    values: opts.values ?? [],
    locale: opts.locale ?? 'en',
    user: { id: '111' },
    deferred: false,
    replied: false,
    inGuild: () => opts.inGuild ?? true,
    isStringSelectMenu: () => opts.values !== undefined,
    message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral && (opts.ephemeral ?? true) } },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      send: vi.fn().mockResolvedValue(undefined),
      sendTyping: vi.fn().mockResolvedValue(undefined),
    },
    appPermissions: { has: vi.fn(() => opts.allowed ?? true) },
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn(async () => { click.deferred = true }),
    deferReply: vi.fn(async () => { click.deferred = true }),
  }
  return click
}

export function fakeDeps(hits: unknown[], total: number) {
  const meili = stubMeili(hits, total)
  return {
    meili: meili.client,
    search: meili.search,
    db: {},
    sets: {
      name: vi.fn().mockResolvedValue('Base Set'),
      all: vi.fn().mockResolvedValue([{ code: 'base', name: 'Base Set' }, { code: 'coc', name: 'Chamber of Secrets' }]),
    },
    env: {
      IMAGE_BASE_URL: 'https://img.test',
      SITE_BASE_URL: 'https://revelio.cards',
      SHEET_SERVICE_URL: 'http://sheet:8080',
      SHEET_TOKEN: 'a-token-at-least-16-chars',
    },
  }
}
```

- [ ] **Step 2: Add the catalog key and remove the dead ones**

Add `search.setUnknown`: en `No set matched that.`, de `Dazu passt kein Set.`
Remove `search.title`, `search.footer`, `search.pageOutOfRange`, `command.search.option.page`
from both catalogs (`search.line` and `search.noResults` stay).

- [ ] **Step 3: Write the failing tests**

`app/bot/test/search-browser.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'
import { handleInteraction } from '../src/discord/handle-interaction'
import { encodeCustomId, type CardBrowseState } from '../src/discord/components/custom-id'
import { fakeClick, fakeDeps, type ClickOptions } from './helpers/discord'
import { buttonsOf, textOf } from './helpers/v2'

beforeEach(() => {
  vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null)
  vi.spyOn(dbModule, 'getSubTypeLabels').mockResolvedValue({})
})
afterEach(() => { vi.restoreAllMocks() })

const card = (n: number) => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), numberSort: `0:${n}`,
  text: 'Rules.', flavorText: null, types: ['spell'], subTypes: [], lesson: 'charms', rarity: null,
  finishes: [], legality: null, cost: 2, damage: null, isOfficial: true, imageLang: 'en',
  imageVersion: 1, artCropVersion: null, defaultLanguage: 'en', orientation: null,
})
const hits = [1, 2, 3, 4, 5].map(card)
const state: CardBrowseState = { page: 1, lesson: null, type: null, set: null, query: 'lumos' }

function fakeCommand(options: Record<string, string | null>, locale = 'en') {
  return {
    locale,
    user: { id: '111' },
    inGuild: () => true,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: (n: string) => options[n] ?? null },
  }
}

const click = (id: string, deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) => {
  const c = fakeClick(id, opts)
  return { c, done: handleInteraction(c as never, deps as never) }
}

describe('/search', () => {
  it('defers ephemerally before anything else', async () => {
    const interaction = fakeCommand({ query: 'lumos' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps(hits, 23) as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('answers with the first page of the browser', async () => {
    const interaction = fakeCommand({ query: 'lumos' })
    const deps = fakeDeps(hits, 23)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    const payload = interaction.editReply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(payload)).toContain('Cards found for "lumos": **23**')
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ limit: 5, offset: 0 }))
  })

  it('browses by filters alone', async () => {
    const interaction = fakeCommand({ lesson: 'charms' })
    const deps = fakeDeps(hits, 23)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    expect(textOf(interaction.editReply.mock.calls[0][0])).toContain('Cards found: **23**')
  })

  it('resolves a set typed by name or in the wrong case', async () => {
    const interaction = fakeCommand({ query: 'x', set: 'chamber of secrets' })
    const deps = fakeDeps(hits, 1)
    await COMMANDS.get('search')!.execute(interaction as never, deps as never)
    expect(deps.search.mock.calls[0][1].filter).toContain('(setCode = "coc")')
  })

  it('says so when a typed set matches nothing, instead of failing', async () => {
    const interaction = fakeCommand({ query: 'x', set: 'no such set!' })
    await COMMANDS.get('search')!.execute(interaction as never, fakeDeps(hits, 1) as never)
    expect(textOf(interaction.editReply.mock.calls[0][0])).toBe('No set matched that.')
  })
})

describe('browsing', () => {
  it('turns the page in place', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state: { ...state, page: 2 } }), deps)
    await done
    expect(c.deferUpdate).toHaveBeenCalled()
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ offset: 5 }))
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('**Card 1**')
  })

  it('applies a lesson and starts again at page 1', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sl', state: { ...state, page: 3 } }), deps, { values: ['charms'] })
    await done
    expect(deps.search.mock.calls[0][1]).toMatchObject({ offset: 0 })
    expect(deps.search.mock.calls[0][1].filter).toContain('(lesson = "charms")')
    expect(c.editReply).toHaveBeenCalled()
  })

  it('clears a filter on Any and ignores a value that is not a lesson', async () => {
    const deps = fakeDeps(hits, 23)
    await click(encodeCustomId({ kind: 'sl', state: { ...state, lesson: 'charms' } }), deps, { values: ['-'] }).done
    await click(encodeCustomId({ kind: 'sl', state }), deps, { values: ['divination'] }).done
    for (const call of deps.search.mock.calls) expect(call[1].filter ?? []).not.toContain('(lesson = "charms")')
  })

  it('applies a set from the set menu', async () => {
    const deps = fakeDeps(hits, 23)
    await click(encodeCustomId({ kind: 'ss', state }), deps, { values: ['coc'] }).done
    expect(deps.search.mock.calls[0][1].filter).toContain('(setCode = "coc")')
  })

  it('never answers a browser click in public', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state }), deps)
    await done
    expect(c.reply).not.toHaveBeenCalled()
    expect(c.followUp).not.toHaveBeenCalled()
    expect(c.channel.send).not.toHaveBeenCalled()
  })

  it('leaves Share off outside a server', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 's', state }), deps, { inGuild: false })
    await done
    expect(buttonsOf(c.editReply.mock.calls[0][0]).some((b) => b.label === 'Share')).toBe(false)
  })
})
```

In `commands.test.ts`, delete the `describe('/search')` block (its cases now live above) and in
`describe('/search set filter')` change `fakeInteraction({ query: 'broom', set: 'base' })` to pass
`sets: { name: vi.fn(), all: vi.fn().mockResolvedValue([{ code: 'base', name: 'Base Set' }]) }` in
its deps and add `inGuild: () => true` to that file's `fakeInteraction` return value.

In `handle-interaction.test.ts`: replace `COMPONENTS.clear()` in `afterEach` with a restore of
the real registry:

```ts
const REGISTERED = new Map(COMPONENTS)
afterEach(() => {
  vi.restoreAllMocks()
  COMPONENTS.clear()
  for (const [kind, handler] of REGISTERED) COMPONENTS.set(kind, handler)
})
```

and in `treats a valid id with no handler yet as out of date` use `'v1:pg:c'` (the page indicator
never has a handler) instead of `'v1:pk'`.

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-browser.test.ts`
Expected: FAIL (`/search` still answers with an embed; no handler for `s`).

- [ ] **Step 4: Implement `search-browser.ts` (navigation and filters)**

```ts
import { LESSONS, TYPES } from '@revelio/core'
import type { MessageComponentInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { findCards } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { searchView, ANY } from '../v2/search-view'
import { v2Edit, type V2Edit } from '../v2/send'
import type { CardBrowseState, CardKind, CustomId } from './custom-id'
import type { ComponentHandler } from './types'

type CardStateId = { kind: CardKind; state: CardBrowseState }

const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((ty) => ty.code)

export function isCardState(id: CustomId): id is CardStateId {
  return 'state' in id && !('scope' in id.state)
}

// The one select value a click carries, or null for "Any" and anything that is
// not a select click.
function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

export async function renderSearchBrowser(
  deps: Deps,
  state: CardBrowseState,
  locale: string,
  canPost: boolean,
): Promise<V2Edit> {
  const [page, sets] = await Promise.all([
    findCards(deps.meili, {
      query: state.query,
      locale,
      page: state.page,
      filters: {
        ...(state.lesson ? { lesson: [state.lesson] } : {}),
        ...(state.type ? { types: [state.type] } : {}),
        ...(state.set ? { setCode: [state.set] } : {}),
      },
    }),
    deps.sets.all(locale),
  ])
  return v2Edit(searchView(page, state, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    sets,
    canPost,
  }))
}

// Every browser click is on the caller's own private message: acknowledge
// without a visible change, then replace the message.
async function show(interaction: MessageComponentInteraction, deps: Deps, state: CardBrowseState): Promise<void> {
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderSearchBrowser(deps, state, locale, interaction.inGuild()))
}

// A filter value is client data: anything that is not a real lesson, type or
// set clears the filter rather than reaching the Meilisearch query.
const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

const filterLesson: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const lesson = value && LESSON_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, lesson, page: 1 })
}

const filterType: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const type = value && TYPE_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, type, page: 1 })
}

const filterSet: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const sets = await deps.sets.all(toRevelioLocale(interaction.locale))
  const set = value && sets.some((s) => s.code === value) ? value : null
  await show(interaction, deps, { ...id.state, set, page: 1 })
}

export const SEARCH_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['s', navigate],
  ['sl', filterLesson],
  ['st', filterType],
  ['ss', filterSet],
]
```

In `components/index.ts`:

```ts
import { SEARCH_HANDLERS } from './search-browser'

export const COMPONENTS: Map<CustomId['kind'], ComponentHandler> = new Map([...SEARCH_HANDLERS])
```

- [ ] **Step 5: Rewrite `commands/search.ts`**

Builder: `query` loses `.setRequired(true)` and gains `.setMaxLength(MAX_QUERY)`; the `page`
option is removed. `execute` becomes:

```ts
export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  // Private before anything else: a result list is the caller's to browse.
  // Only what they choose to share reaches the channel.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  // The set option autocompletes to a code but can be typed by hand, so it is
  // resolved against the real list - by code or name, any case - before it can
  // reach a custom id.
  const typedSet = interaction.options.getString('set')?.trim().toLowerCase() ?? ''
  let set: string | null = null
  if (typedSet) {
    const sets = await deps.sets.all(locale)
    const match = sets.find((s) => s.code.toLowerCase() === typedSet || s.name.toLowerCase() === typedSet)
    if (!match) {
      await interaction.editReply(textEdit(t(locale, 'search.setUnknown')))
      return
    }
    set = match.code
  }

  const state: CardBrowseState = {
    page: 1,
    lesson: interaction.options.getString('lesson'),
    type: interaction.options.getString('type'),
    set,
    query: clampQuery(interaction.options.getString('query') ?? ''),
  }
  await interaction.editReply(await renderSearchBrowser(deps, state, locale, interaction.inGuild()))
}
```

Imports: `MessageFlags` from discord.js; `clampQuery`, `MAX_QUERY`, `type CardBrowseState` from
`../components/custom-id`; `renderSearchBrowser` from `../components/search-browser`; `textEdit`
from `../v2/send`; drop `findCards`, `searchEmbed`, `CardFilters`. The `autocomplete` export stays.

- [ ] **Step 6: Delete the embed**

```bash
git rm app/bot/src/discord/embeds/search-embed.ts app/bot/test/search-embed.test.ts
```

- [ ] **Step 7: Update the manifest, its test and the web docs table**

`app/core/src/bot-commands.ts`: add to `CommandOptionSpec`

```ts
  /** Discord's max_length; only applies to a string option. */
  maxLength?: number
```

and make the `search` entry

```ts
  {
    name: 'search',
    ephemeral: true,
    linkRequired: false,
    options: [
      { name: 'query', type: 'string', required: false, autocomplete: false, maxLength: 50 },
      { name: 'lesson', type: 'string', required: false, autocomplete: false, choices: 'lessons' },
      { name: 'type', type: 'string', required: false, autocomplete: false, choices: 'types' },
      { name: 'set', type: 'string', required: false, autocomplete: true },
    ],
  },
```

`bot/test/command-manifest.test.ts`: in `optionsOf`, add `max_length?: number` to the option
shape and `maxLength: option.max_length ?? null` to the mapped object; in the declares-the-options
test add `maxLength: option.maxLength ?? null`; delete the `keeps the page floor on /search` test.
Add `inGuild: () => true` to `deferOf`'s interaction.

`web/src/components/docs/command-table.tsx`: after the `option.min` line add

```tsx
                      {option.maxLength !== undefined &&
                        ` ${t('commandTable.maxLength', { max: option.maxLength })}`}
```

`web/messages/en.json` `docs`: add `"maxLength": "At most {max} characters."` to `commandTable`;
in `commands.search.options` delete `page` and set `query` to
`"Search terms. Optional: the filters alone browse a lesson, type or set. A match on a card's name always ranks above a match in its text or flavour."`
`web/messages/de.json`: `"maxLength": "Höchstens {max} Zeichen."`; delete `page`; `query`:
`"Suchbegriffe. Optional: Die Filter allein durchsuchen eine Lektion, einen Kartentyp oder ein Set. Ein Treffer im Kartennamen steht immer vor einem Treffer im Text oder Flavourtext."`

`web/src/components/docs/__tests__/command-table.test.tsx`, `marks required and optional options
differently`: `query` is optional now, so take the required row from `/card`:

```ts
  it('marks required and optional options differently', () => {
    renderTable('card')
    const row = screen.getByText('name').closest('tr')!
    expect(within(row).getByText('Required')).toBeInTheDocument()
  })

  it('marks an optional option as optional', () => {
    renderTable('search')
    const optional = screen.getByText('set').closest('tr')!
    expect(within(optional).getByText('Optional')).toBeInTheDocument()
  })
```

- [ ] **Step 8: Run everything this touches**

```bash
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm test -w web -- src/components/docs src/lib/docs src/components/discord
/usr/local/bin/npm run typecheck
```

Expected: PASS. The discord page's `command-grid` still lists `page` from its own hard-coded list
(phase 4 derives it from the manifest).

- [ ] **Step 9: Commit**

```bash
git add app/bot app/core/src/bot-commands.ts app/web/src/components/docs app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): open /search as a private browser with paging and filters"
```

---

### Task 5: Open a card, go back, post it

**Files:**
- Modify: `app/bot/src/discord/components/search-browser.ts`, `app/bot/src/discord/components/custom-id.ts`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/search-browser.test.ts`

**Interfaces:**
- Consumes: `loadCardDetail`, `cardView` (phase 1, `lead` from Task 2), `postTarget`, `refusal`
  (phase 1), `findCardById` (`data/cards.ts`).
- Produces: `isEntityId(value: string): boolean` (custom-id.ts); handlers `co`, `cb`, `cp`;
  `postRefusalKey(kind: 'unreachable' | 'forbidden'): string` (search-browser.ts, reused by Task 6).

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `search.back` | `Back to results` | `Zurück zu den Ergebnissen` |
| `search.post` | `Post to channel` | `Im Kanal posten` |
| `card.gone` | `That card is no longer in the database.` | `Diese Karte gibt es nicht mehr in der Datenbank.` |
| `post.sharedCard` | `{user} shared a card.` | `{user} hat eine Karte geteilt.` |
| `post.done` | `Posted to the channel.` | `Im Kanal gepostet.` |
| `post.cannotPostCards` | `I can't post in this channel. Revelio needs permission to view it, send messages and embed links here.` | `Ich kann in diesem Kanal nicht posten. Revelio braucht hier die Berechtigung, den Kanal zu sehen, Nachrichten zu senden und Links einzubetten.` |
| `post.cannotPostHere` | `I can't post here, for example in a server where only you added Revelio.` | `Hier kann ich nicht posten, zum Beispiel in einem Server, in dem nur du Revelio hinzugefügt hast.` |

If the phase 1 probe found that a V2 thumbnail needs no Embed Links (finding 5), drop "and embed
links" / "und Links einzubetten" from `post.cannotPostCards` and pass a matching option to
`postTarget` in Step 4; otherwise keep both as written.

- [ ] **Step 2: Write the failing tests**

Append to `search-browser.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js'

describe('a card from the results', () => {
  const open = (deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) =>
    click(encodeCustomId({ kind: 'co', state }), deps, { values: ['base-1'], ...opts })

  it('opens in place with Back and Post', async () => {
    const deps = fakeDeps([card(1)], 1)
    const { c, done } = open(deps)
    await done
    const payload = c.editReply.mock.calls[0][0]
    expect(textOf(payload)).toMatch(/## Card 1/)
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Back to results', 'Post to channel', 'Open on revelio.cards'])
  })

  it('has no Post outside a server', async () => {
    const { c, done } = open(fakeDeps([card(1)], 1), { inGuild: false })
    await done
    expect(buttonsOf(c.editReply.mock.calls[0][0]).some((b) => b.label === 'Post to channel')).toBe(false)
  })

  it('goes back to the page it came from', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'cb', state: { ...state, page: 3 } }), deps)
    await done
    expect(deps.search).toHaveBeenCalledWith('lumos', expect.objectContaining({ offset: 10 }))
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('Cards found')
  })

  it('shows the results again for a card id that is not an id', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'co', state }), deps, { values: ['x" OR 1'] })
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toContain('Cards found')
  })
})

describe('posting one card', () => {
  const post = (deps: ReturnType<typeof fakeDeps>, opts: ClickOptions = {}) =>
    click(encodeCustomId({ kind: 'cp', cardId: 'base-1' }), deps, opts)

  it('posts it as a plain channel message naming who shared it', async () => {
    const { c, done } = post(fakeDeps([card(1)], 1))
    await done
    const sent = c.channel.send.mock.calls[0][0]
    expect(sent.flags).toBe(MessageFlags.IsComponentsV2)
    expect(textOf(sent)).toMatch(/^<@111> shared a card\.\n## Card 1/)
    expect(buttonsOf(sent).map((b) => b.label)).toEqual(['Open on revelio.cards'])
    expect(c.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }))
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('says privately when the bot may not post there, and sends nothing', async () => {
    const { c, done } = post(fakeDeps([card(1)], 1), { allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    const payload = c.reply.mock.calls[0][0]
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
    expect(textOf(payload)).toContain("I can't post in this channel")
  })

  it('reads a refusal from Discord as the same answer', async () => {
    const deps = fakeDeps([card(1)], 1)
    const c = fakeClick(encodeCustomId({ kind: 'cp', cardId: 'base-1' }))
    c.channel.send.mockRejectedValue(new DiscordAPIError(
      { code: RESTJSONErrorCodes.MissingAccess, message: 'Missing Access' },
      RESTJSONErrorCodes.MissingAccess, 403, 'POST', '/x', { body: undefined, files: undefined },
    ))
    await handleInteraction(c as never, deps as never)
    expect(textOf(c.followUp.mock.calls[0][0])).toContain("I can't post here")
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-browser.test.ts`
Expected: the new cases FAIL (no handlers for `co`, `cb`, `cp`).

- [ ] **Step 3: Export `isEntityId`**

In `custom-id.ts`, after `clampQuery`:

```ts
// A card or deck id as it may appear in an id or a select value. Select values
// come back from the client, so this runs before one reaches a query.
export function isEntityId(value: string): boolean {
  return ENTITY_ID.test(value)
}
```

- [ ] **Step 4: Add the handlers**

In `search-browser.ts`, add imports (`ButtonBuilder`, `ButtonStyle`, `DiscordAPIError` from
discord.js; `findCardById` from `../../data/cards`; `loadCardDetail` from `../../data/card-detail`;
`t` from `../../i18n/t`; `postTarget`, `refusal` from `../channel-post`; `cardView` from
`../v2/card-view`; `EPHEMERAL_V2`, `textMessage`, `v2Message` from `../v2/send`; `encodeCustomId`,
`isEntityId` from `./custom-id`) and:

```ts
const REFUSAL_KEYS = { unreachable: 'post.cannotPostHere', forbidden: 'post.cannotPostCards' } as const

export function postRefusalKey(kind: 'unreachable' | 'forbidden'): string {
  return REFUSAL_KEYS[kind]
}

function backButton(state: CardBrowseState, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cb', state }))
    .setLabel(t(locale, 'search.back')).setStyle(ButtonStyle.Secondary)
}

function postButton(cardId: string, locale: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(encodeCustomId({ kind: 'cp', cardId }))
    .setLabel(t(locale, 'search.post')).setStyle(ButtonStyle.Primary)
}

// Sends a finished message into the channel. A refusal Discord answered is
// told to the caller privately; anything else (a timeout, a dropped socket)
// may have posted, so it is not retried but left to the router's error path.
async function sendToChannel(
  interaction: MessageComponentInteraction,
  send: () => Promise<unknown>,
  locale: string,
): Promise<boolean> {
  try {
    await send()
    return true
  } catch (err) {
    const refused = refusal(err)
    if (!refused || !(err instanceof DiscordAPIError)) throw err
    await interaction.followUp({ ...textMessage(t(locale, postRefusalKey(refused))), flags: EPHEMERAL_V2 })
    return false
  }
}

const openCard: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const cardId = picked(interaction)
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const doc = cardId && isEntityId(cardId) ? await findCardById(deps.meili, cardId, locale) : null
  if (!doc) {
    // Gone since the page was drawn, or not an id at all: the results again.
    await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    actions: [
      backButton(id.state, locale),
      ...(interaction.inGuild() ? [postButton(doc.id, locale)] : []),
    ],
  })))
}

const backToResults: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

// The private card view stays where it is; the channel gets its own copy with
// a "shared by" line, and the caller a private "posted".
const postCard: ComponentHandler = async (interaction, id, deps) => {
  if (id.kind !== 'cp') return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, postRefusalKey(target.kind))), flags: EPHEMERAL_V2 })
    return
  }
  await interaction.deferUpdate()
  const doc = await findCardById(deps.meili, id.cardId, locale)
  if (!doc) {
    await interaction.followUp({ ...textMessage(t(locale, 'card.gone')), flags: EPHEMERAL_V2 })
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  const message = v2Message(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    // Never pings: the client's allowedMentions parses none.
    lead: t(locale, 'post.sharedCard', { user: `<@${interaction.user.id}>` }),
  }))
  if (await sendToChannel(interaction, () => target.channel.send(message), locale)) {
    await interaction.followUp({ ...textMessage(t(locale, 'post.done')), flags: EPHEMERAL_V2 })
  }
}
```

and extend `SEARCH_HANDLERS` with `['co', openCard]`, `['cb', backToResults]`, `['cp', postCard]`.

- [ ] **Step 5: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-browser.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/bot/src app/bot/test/search-browser.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): open a card from search results and post it to the channel"
```

---

### Task 6: Share a page of results; "View a card" for everyone

**Files:**
- Create: `app/bot/src/discord/v2/share-view.ts`
- Modify: `app/bot/src/discord/components/search-browser.ts`
- Modify: `app/bot/src/i18n/{en,de}.json`
- Test: `app/bot/test/share-view.test.ts`, `app/bot/test/search-browser.test.ts`

**Interfaces:**
- Consumes: `addCardRow`, `plain` (Task 2), `sendToChannel`, `postRefusalKey`, `renderSearchBrowser` (Tasks 4-5).
- Produces: `sharePicker(hits: CardBrowseHit[], state: CardBrowseState, locale: string): ContainerBuilder[]`,
  `type ShareViewOptions = { locale: string; imageBase: string; siteBase: string; sharerId: string }`,
  `shareView(hits: CardBrowseHit[], state: CardBrowseState, opts: ShareViewOptions): ContainerBuilder[]`;
  handlers `sh`, `sp`, `pk`.

- [ ] **Step 1: Add the catalog keys**

| key | en | de |
|---|---|---|
| `search.share.prompt` | `Which cards should I post to the channel?` | `Welche Karten soll ich im Kanal posten?` |
| `search.share.placeholder` | `Pick cards` | `Karten auswählen` |
| `search.share.cancel` | `Cancel` | `Abbrechen` |
| `post.sharedCards` | `{user} shared {count} cards.` | `{user} hat {count} Karten geteilt.` |
| `post.sharedCards.query` | `{user} shared {count} cards from a search for "{query}".` | `{user} hat {count} Karten aus einer Suche nach „{query}“ geteilt.` |
| `share.view.placeholder` | `View a card...` | `Karte ansehen ...` |
| `share.site` | `Full search on revelio.cards` | `Ganze Suche auf revelio.cards` |

- [ ] **Step 2: Write the failing view test**

`app/bot/test/share-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { sharePicker, shareView } from '../src/discord/v2/share-view'
import type { CardBrowseState } from '../src/discord/components/custom-id'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, textOf } from './helpers/v2'

const hit = (n: number): CardBrowseHit => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), types: ['spell'],
  lesson: 'charms', cost: 2, imageVersion: 1, imageLang: 'en', defaultLanguage: 'en', orientation: null,
})
const hits = [1, 2, 3, 4, 5].map(hit)
const state: CardBrowseState = { page: 2, lesson: 'charms', type: null, set: null, query: 'lumos' }
const opts = { locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards', sharerId: '111' }
type Select = { custom_id: string; min_values?: number; max_values?: number; options: { value: string; default?: boolean }[] }
const selectOf = (v: { components: unknown[] }) =>
  flatten(v).find((n) => n.type === ComponentType.StringSelect) as unknown as Select

describe('sharePicker', () => {
  it('preselects every card on the page and asks for at least one', () => {
    const select = selectOf({ components: sharePicker(hits, state, 'en') })
    expect(select.custom_id.startsWith('v1:sp:')).toBe(true)
    expect(select.options.every((o) => o.default)).toBe(true)
    expect([select.min_values, select.max_values]).toEqual([1, 5])
  })

  it('cancels back to the same page', () => {
    const cancel = buttonsOf({ components: sharePicker(hits, state, 'en') })[0]
    expect(cancel.custom_id?.startsWith('v1:s:2:')).toBe(true)
  })
})

describe('shareView', () => {
  const view = (h = hits, s = state) => ({ components: shareView(h, s, opts) })

  it('names who shared what, from which search', () => {
    expect(textOf(view())).toMatch(/^<@111> shared 5 cards from a search for "lumos"\./)
  })

  it('escapes markdown in the query it echoes to the channel', () => {
    expect(textOf(view(hits, { ...state, query: '[x](https://evil.example)' })))
      .toContain('\\[x\\]\\(https://evil.example\\)')
  })

  it('has no pager and nothing that changes the message', () => {
    const ids = flatten(view()).flatMap((n) => (n.custom_id ? [n.custom_id] : []))
    expect(ids).toEqual(['v1:pk'])
  })

  it('links the full search', () => {
    expect(buttonsOf(view()).find((b) => b.url)?.url).toBe('https://revelio.cards/search?q=lumos&lesson=charms')
  })

  it('stays inside the limits', () => {
    expect(measure(shareView(hits, { ...state, query: 'x'.repeat(50) }, opts)).components).toBeLessThanOrEqual(40)
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/share-view.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `share-view.ts`**

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { clampLabel } from '../../data/cards'
import { t } from '../../i18n/t'
import { searchUrl } from '../../links'
import { encodeCustomId, type CardBrowseState } from '../components/custom-id'
import { BRAND_GOLD, container, linkButton, plain, text } from './parts'
import { addCardRow } from './rows'

export type ShareViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // Discord user id of whoever shared, for the attribution line.
  sharerId: string
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

function cardOptions(hits: CardBrowseHit[], selected: boolean) {
  return hits.map((hit) => ({
    label: clampLabel(hit.name),
    description: `${hit.setCode} #${hit.number}`,
    value: hit.id,
    default: selected,
  }))
}

// The private step between Share and the post: which of this page's cards go.
export function sharePicker(hits: CardBrowseHit[], state: CardBrowseState, locale: string): ContainerBuilder[] {
  return [
    container()
      .addTextDisplayComponents(text(t(locale, 'search.share.prompt')))
      .addActionRowComponents(
        row(new StringSelectMenuBuilder()
          .setCustomId(encodeCustomId({ kind: 'sp', state }))
          .setPlaceholder(t(locale, 'search.share.placeholder'))
          .setMinValues(1)
          .setMaxValues(hits.length)
          .addOptions(cardOptions(hits, true))),
        row(new ButtonBuilder()
          .setCustomId(encodeCustomId({ kind: 's', state }))
          .setLabel(t(locale, 'search.share.cancel'))
          .setStyle(ButtonStyle.Secondary)),
      ),
  ]
}

// The public list. Nothing on it changes the message: "View a card" answers
// whoever picks privately, and the link opens the site.
export function shareView(hits: CardBrowseHit[], state: CardBrowseState, opts: ShareViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const user = `<@${opts.sharerId}>`
  const lead = state.query
    ? t(locale, 'post.sharedCards.query', { user, count: hits.length, query: plain(state.query) })
    : t(locale, 'post.sharedCards', { user, count: hits.length })
  const view = container(BRAND_GOLD).addTextDisplayComponents(text(lead))
  for (const hit of hits) addCardRow(view, hit, opts)
  view.addActionRowComponents(
    row(new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: 'pk' }))
      .setPlaceholder(t(locale, 'share.view.placeholder'))
      .addOptions(cardOptions(hits, false))),
    row(linkButton(
      searchUrl(opts.siteBase, state.query, locale, { lesson: state.lesson, type: state.type, set: state.set }),
      t(locale, 'share.site'),
    )),
  )
  return [view]
}
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/share-view.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing handler tests**

Append to `search-browser.test.ts`:

```ts
describe('sharing results', () => {
  it('asks which cards, privately', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sh', state }), deps)
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toBe('Which cards should I post to the channel?')
    expect(c.channel.send).not.toHaveBeenCalled()
  })

  it('posts the picked cards and returns to the results', async () => {
    const deps = fakeDeps([card(1), card(3)], 2)
    const { c, done } = click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1', 'base-3'] })
    await done
    expect(deps.search.mock.calls[0][1].filter).toContain('id IN ["base-1","base-3"]')
    expect(textOf(c.channel.send.mock.calls[0][0])).toMatch(/^<@111> shared 2 cards/)
    expect(textOf(c.editReply.mock.calls.at(-1)![0])).toContain('Cards found')
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('drops a tampered value before it reaches the search', async () => {
    const deps = fakeDeps([card(1)], 1)
    await click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1', 'x"] OR id EXISTS'] }).done
    expect(deps.search.mock.calls[0][1].filter).toContain('id IN ["base-1"]')
  })

  it('refuses privately when the bot may not post there', async () => {
    const deps = fakeDeps(hits, 23)
    const { c, done } = click(encodeCustomId({ kind: 'sp', state }), deps, { values: ['base-1'], allowed: false })
    await done
    expect(c.channel.send).not.toHaveBeenCalled()
    expect(c.reply.mock.calls[0][0].flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral)
  })
})

describe('View a card, on a shared list', () => {
  it('answers whoever picks, privately and in their language, and leaves the list alone', async () => {
    const deps = fakeDeps([card(1)], 1)
    const { c, done } = click('v1:pk', deps, { values: ['base-1'], ephemeral: false, locale: 'de' })
    await done
    expect(c.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(c.update).not.toHaveBeenCalled()
    expect(c.deferUpdate).not.toHaveBeenCalled()
    const payload = c.editReply.mock.calls[0][0]
    expect(textOf(payload)).toMatch(/## Card 1/)
    expect(buttonsOf(payload).map((b) => b.label)).toEqual(['Auf revelio.cards öffnen'])
  })

  it('says a vanished card is gone', async () => {
    const { c, done } = click('v1:pk', fakeDeps([], 0), { values: ['base-9'], ephemeral: false })
    await done
    expect(textOf(c.editReply.mock.calls[0][0])).toBe('That card is no longer in the database.')
  })
})
```

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-browser.test.ts`
Expected: the new cases FAIL.

- [ ] **Step 5: Add the handlers**

In `search-browser.ts` (imports: `MessageFlags` from discord.js; `sharePicker`, `shareView` from
`../v2/share-view`; `textEdit` from `../v2/send`):

```ts
// Share and the picker share one read of the page, so the picker offers exactly
// the cards the caller was looking at.
async function pageOf(deps: Deps, state: CardBrowseState, locale: string) {
  return findCards(deps.meili, {
    query: state.query,
    locale,
    page: state.page,
    filters: {
      ...(state.lesson ? { lesson: [state.lesson] } : {}),
      ...(state.type ? { types: [state.type] } : {}),
      ...(state.set ? { setCode: [state.set] } : {}),
    },
  })
}

const share: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferUpdate()
  const page = await pageOf(deps, id.state, locale)
  if (!page.hits.length) {
    await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
    return
  }
  await interaction.editReply(v2Edit(sharePicker(page.hits, id.state, locale)))
}

// The picked cards are read again by id: the values are client data, so an
// invalid one is dropped before the query and a card gone since simply drops
// out of the result.
const sharePicked: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const locale = toRevelioLocale(interaction.locale)
  const target = postTarget(interaction, { needsFiles: false })
  if (target.kind !== 'ok') {
    await interaction.reply({ ...textMessage(t(locale, postRefusalKey(target.kind))), flags: EPHEMERAL_V2 })
    return
  }
  const ids = interaction.isStringSelectMenu() ? interaction.values.filter(isEntityId) : []
  await interaction.deferUpdate()
  const chosen = ids.length
    ? await findCards(deps.meili, { query: '', locale, filters: { ids }, pageSize: ids.length })
    : null
  if (chosen?.hits.length) {
    const message = v2Message(shareView(chosen.hits, id.state, {
      locale,
      imageBase: deps.env.IMAGE_BASE_URL,
      siteBase: deps.env.SITE_BASE_URL,
      sharerId: interaction.user.id,
    }))
    if (await sendToChannel(interaction, () => target.channel.send(message), locale)) {
      await interaction.followUp({ ...textMessage(t(locale, 'post.done')), flags: EPHEMERAL_V2 })
    }
  }
  await interaction.editReply(await renderSearchBrowser(deps, id.state, locale, interaction.inGuild()))
}

// On the public list: answered privately, in the clicker's own language, and
// never by touching the list itself (see components/index.ts).
const viewShared: ComponentHandler = async (interaction, _id, deps) => {
  const cardId = picked(interaction)
  const locale = toRevelioLocale(interaction.locale)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const doc = cardId && isEntityId(cardId) ? await findCardById(deps.meili, cardId, locale) : null
  if (!doc) {
    await interaction.editReply(textEdit(t(locale, 'card.gone')))
    return
  }
  const detail = await loadCardDetail(deps, doc, locale)
  await interaction.editReply(v2Edit(cardView(detail, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
  })))
}
```

Make `renderSearchBrowser` call `pageOf` instead of repeating the filter object. Extend
`SEARCH_HANDLERS` with `['sh', share]`, `['sp', sharePicked]`, `['pk', viewShared]`.

- [ ] **Step 6: Run the tests**

Run: `/usr/local/bin/npm test -w @revelio/bot -- test/search-browser.test.ts test/share-view.test.ts test/catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/bot/src app/bot/test
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): share picked search results to the channel"
```

---

### Task 7: Docs, then verify on the dev guild

**Files:**
- Modify: `CLAUDE.md`, the spec (probe finding 6)

- [ ] **Step 1: Update CLAUDE.md**

Under "Discord bot specifics":
- In "Every personal reply is ephemeral", add `/search` to the list of commands that must
  `deferReply({ flags: MessageFlags.Ephemeral })` first, with "(a result list is the caller's to
  browse; only what they share reaches the channel)".
- In the router bullet (phase 1), add: "Handlers on the private browser acknowledge with
  `deferUpdate()` then `editReply()`. User text echoed into a message goes through `plain()`
  (`v2/parts.ts`): text displays render markdown, masked links included."
- Drop the "Meilisearch totals are estimates" sentence's reference to a page option; keep the
  rule ("a page inside the computed page count can still come back empty") and add "the browser
  shows it as an empty page with Previous enabled".

- [ ] **Step 2: Run the whole check suite**

From `app/`:
```bash
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm test -w web -- src/components/docs src/lib/docs src/components/discord
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm run build -w @revelio/bot
```
Expected: all green; note the counts for the PR.

- [ ] **Step 3: Check by hand on the dev guild (English and German)**

- `/search query:lumos` - private, five rows with thumbnails, pager, filters, Share, site link.
- Page forward to the end and one past it via the estimate; the empty page says so.
- Change lesson, type and set from the menus; pick Any to clear.
- Open a card, Back, open again, Post to channel: the channel gets the card with "shared by",
  and nobody is pinged.
- Share, deselect one card, submit: the channel gets the list; pick a card from "View a card"
  from a **second account**: it answers that account privately, in its Discord language.
- `/search` in a DM with the bot: no Share, no Post.
- **Probe assumption 6:** leave a browser open for 16 minutes, then press Next. Record the
  result as row 6 of the spec's "Probe findings".

Screenshots of the browser, the card view and a shared list for the PR.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-13-bot-components-v2-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe the /search browser rules in CLAUDE.md"
```

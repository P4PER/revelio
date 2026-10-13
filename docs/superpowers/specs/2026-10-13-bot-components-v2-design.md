# Discord bot on Components V2, with real browsing - Design

**Date:** 2026-10-13
**Status:** design, awaiting review
**Branch:** `feat/bot-components-v2` (spec, the per-phase plans and the implementation all land here)
**Workspaces:** `bot` (most of it), `core` (command manifest), `search` (one projection),
`db` (one optional argument), `web` (docs content and the `/discord` page)
**Builds on:** [deck search](2026-10-12-deck-search-design.md) (PR #150)

## Problem

Every bot answer is a one-shot embed. `/search` "pages" by re-running the command with
`page:N`, lists ten names as text with no pictures, and offers no way to open a card from the
list: the user re-types it into `/card`. Decks can only be reached by name through `/deck`;
there is no way to look around. `/mydecks` is a block of text with links.

Discord's Components V2 (layout components: containers, sections with thumbnails, media
galleries, text displays, separators) plus buttons and select menus make an in-message
browser possible. discord.js 14.27, already installed, ships every builder and
`MessageFlags.IsComponentsV2`, so no dependency changes.

## Goals

- `/search` opens a **private** browser: card thumbnails, pages, filters you can change on the
  message, and a menu that opens a card in place.
- Results can be **shared**: pick some or all cards of the current page and post them to the
  channel. Anyone in the channel can then open one of them privately.
- A single card found while browsing can be posted to the channel.
- A new `/decks` command browses public decks the same way; `/mydecks` becomes the same
  browser over the caller's own decks. Opening a deck shows the sheet; it can be posted.
- Every bot reply uses the V2 layout, so there is one message format and one set of limits.
- The docs and the `/discord` landing page describe the new behaviour.

## Non-goals

- **No cross-search "basket".** Sharing covers cards from one search page. Collecting across
  searches needs server-side state per user, and overlaps the web deck builder.
- **No persistent state for browsers.** No table, no in-memory session map (section 2).
- **No `/deck` prompt rewrite beyond the layout.** The private-deck prompt and the "Did you
  mean" menu keep their 60 s collectors (they shipped in #150 and work); only their messages
  move to V2.
- **No sort or cost filters in the card browser.** Lesson, type and set only, like `/search`
  today. The web search link carries the rest.
- **No cache for re-posted deck sheets.** Posting a deck renders the sheet again; the sheet
  service has no cache on purpose and its logs decide whether one is worth building.

## Discord constraints (checked against docs.discord.com, 2026-10-13)

| Rule | Value | Source |
|---|---|---|
| `IS_COMPONENTS_V2` disables `content`, `embeds`, `poll`, `stickers` | - | components reference |
| The flag cannot be removed from a message once sent | - | using message components |
| Total components per message | 40 | components reference |
| `custom_id` | 1-100 chars | components reference |
| Section | 1-3 text displays + one accessory (Button or Thumbnail) | components reference |
| Media gallery | 1-10 items | components reference |
| Action row | up to 5 buttons, or one select | components reference |
| String select | max 25 options; label/value/description max 100 | components reference |
| Uploaded files | not shown unless a component references `attachment://<name>` | components reference |
| Interaction token | 15 min; first response within 3 s | receiving and responding |

**Not stated by the docs, assumed conservatively and probed in phase 1:**

1. Nested components count toward the 40. The guard counts every node.
2. Text displays share one total of 4000 characters. The guard enforces it.
3. A deferred reply can be edited into a V2 message (`editReply` with the flag).
4. A V1 message (the `/deck` prompt with `content`) can be edited into V2 by clearing
   `content` and setting the flag. If not, the prompt is sent as V2 from the start (it moves
   to V2 in phase 3 anyway, so this only decides ordering).
5. Which permissions a plain `channel.send` of a V2 message needs. Today's deck post checks
   View Channel, Send Messages (or in Threads), Embed Links and Attach Files; whether
   thumbnails by URL still need Embed Links decides the list.
6. A component click on an ephemeral message older than 15 minutes is still answerable with
   `update()` (each click carries its own token).

The phase 1 plan includes a throwaway probe script against the dev guild; its results are
written into section 2 of this spec and into CLAUDE.md before phase 2 starts.

### Probe findings (2026-10-13, dev guild)

| # | Question | Result |
|---|---|---|
| 1 | Nested components count toward 40 | yes: 40 accepted, 41 rejected with "50035 COMPONENT_MAX_TOTAL_COMPONENTS_EXCEEDED: Total number of components cannot exceed 40" |
| 2 | 4000-character total across text displays | yes: 2000 + 2000 accepted, 2000 + 2001 rejected with "50035 COMPONENT_DISPLAYABLE_TEXT_SIZE_EXCEEDED: Components displayable text size exceeds maximum size of 4000" |
| 3 | Deferred reply editable into V2 | yes: `/collection set:` (ephemeral `deferReply`, then `editReply` with the V2 flag) rendered as a container |
| 4 | V1 message editable into V2 | yes: a `content` message patched to `content: ''` plus the V2 flag and a container was accepted |
| 5 | V2 thumbnail without Embed Links | not tested (no channel with Embed Links denied); with Embed Links allowed it posted and rendered |

The guard's 40 nested components and 4000 characters are exactly what Discord enforces (1, 2).
Finding 4 means the command error path may edit a V1 `/deck` reply into V2 without a 400.
Finding 5 stays open, so `channel-post.ts` keeps requiring Embed Links for every post,
including phase 2's shared card list; dropping it needs a test in a channel that denies it.

## Design

### 1. Message layout (`bot/src/discord/v2/`)

The `embeds/` folder is replaced by `v2/`, one module per view. Shared pieces in
`v2/parts.ts`:

- `container(accent: number | null, children)` - the one top-level component of every
  message. Accent is the lesson colour where the embed used it, `BRAND_GOLD` for search.
- `cardRow(hit, locale, imageBase)` - a Section: text `**Name** · BS #75` and a second line
  `Spell · Charms · 2` (types via `attrLabel`, lesson, cost; absent parts are dropped);
  accessory a Thumbnail of `thumbKey`, or `landscapeThumbKey` for a horizontal card. A hit with
  no image (`imageVersion == null`) becomes a plain TextDisplay, since a Section must have an
  accessory.
- `pager(state, page, pages, codec)` - ◀, a disabled `page / pages` button, ▶. Prev is
  disabled on page 1, next on the last page **and** when the page came back short (totals are
  Meilisearch estimates).
- `linkButton(url, label)`.
- `textPayload(text)` - a container with one TextDisplay, for every status line (not found,
  out of date, posting, errors). Status lines are V2 too, so a message never has to change
  format.

`v2/limits.ts` exports `assertWithinLimits(components)`: counts every node and every text
display's characters, throws on more than 40 components or 4000 characters. Every view
builder calls it before returning, and every view's tests run their worst case through it.
Views clamp text themselves (as the embeds do today, whole lines, with a "... and N more"
remainder); the guard is the backstop that turns a clamp bug into a logged error instead of a
Discord 400.

`v2/send.ts` wraps the flag: `v2Reply(components, files?)` returns
`{ components, files, flags: MessageFlags.IsComponentsV2 }` plus `attachments: []` when no
files are given (an update from the deck view back to a list must drop the sheet).

*Refined in the phase 1 plan:* the helpers are `v2Message` / `v2Edit` (create and edit
payloads, the edit one carrying `attachments: []`) and `textMessage` / `textEdit` for status
lines, in place of the names `v2Reply` / `textPayload` used elsewhere in this spec.

### 2. Component routing and state (`bot/src/discord/components/`)

**Router.** `handle-interaction.ts` gets a third branch, `interaction.isMessageComponent()`,
dispatching on the custom id's prefix through a `COMPONENTS` registry
(`components/index.ts`, the twin of `commands/index.ts`). Each entry is
`{ prefix, handle(interaction, deps) }`.

The `/deck` prompt's own ids (`deck:post`, `deck:self`, `deck:pick`) are collected by
`awaitMessageComponent` and carry no `v1:` prefix; the router ignores any id without it, so
the two never collide. A router entry must never claim a `deck:` id.

**Custom id codec** (`components/custom-id.ts`). Every routed id is
`v1:<kind>:<fields...>`, colon-separated and positional, the free-text query always last so it
may itself contain colons. Kinds:

| Kind | Fields | Carried by |
|---|---|---|
| `s` | page, lesson, type, set, query | card browser controls |
| `sh` | page, lesson, type, set, query | Share button |
| `sp` | page, lesson, type, set, query (values = card ids) | share picker select |
| `co` | (value = card id) + browser state fields | "Open a card" select |
| `cb` | browser state fields | "Back to results" from a card |
| `cp` | card id | "Post to channel" on a card |
| `pk` | (value = card id) | "View a card" select on a shared post |
| `d` | scope (`p` public / `m` mine), page, format, sort, lesson, query | deck browser controls |
| `do` | (value = deck id) + deck browser state | "Open a deck" select |
| `dp` | deck id | "Post to channel" on a deck |
| `sl` / `st` / `ss` | as `s` | lesson / type / set select of the card browser |
| `dl` / `df` / `ds` | as `d` | lesson / format / sort select of the deck browser |
| `pg` | `c` cards / `d` decks | the disabled page indicator |

*Refined in the phase 1 plan:* one kind per filter select (`sl`, `st`, `ss`, `dl`, `df`,
`ds`), because custom ids must be unique within a message, and `pg` for the page indicator,
since a non-link button needs an id even when it does nothing. The set field is validated
syntactically only (`[a-z0-9-]{1,8}`): a well-formed but unknown set simply finds no cards.

- Lesson, type, format and sort are written as an **index** into `LESSONS`, `TYPES`,
  `DeckFormat.options` and a `DECK_SORTS` tuple in `components/custom-id.ts` mirroring
  `PublicDeckSort` (`-` for unset), not as codes: `care_of_magical_creatures`
  alone is 25 characters. A set is its code (at most 5 characters today, 15 sets).
- Selects carry state in the custom id and the chosen card or deck id in the **value** (card
  ids reach 49 characters, deck ids are 36-character UUIDs), which is why opening goes
  through a select rather than a button per row.
- `encode` throws when the result exceeds 100 characters; a test encodes the worst case of
  every kind (largest page, every filter set, longest set code, a 50-character query of
  multi-byte letters). `/search query` and `/decks query` get `setMaxLength(50)`; the exact
  number is whatever that test proves fits.
- `decode` validates with Zod and returns `null` for anything malformed, any other version,
  an index out of range or an unknown set. A `null` answers with `textPayload` of
  `browse.expired` ("These results are out of date. Run the command again.") on an
  ephemeral message, or an ephemeral reply on a public one.

**No stored state.** Each click rebuilds its view from the id alone, so a click works after a
bot restart and nothing expires except Discord's own message. This replaces nothing in
`/deck`: its collectors stay (non-goals).

**Custom ids are untrusted input.** They round-trip through the client. Nothing in an id is
an authorization: every deck read goes through `getDeckAccess` / `getDeckForViewer` with the
viewer resolved from the **clicking** user by `resolveLinkedUser` on that click (which also
enforces a ban), exactly as `deliverChoice` does today. Card data is public and needs no
check. A tampered id can at worst produce a well-formed view the user could have asked for.

**Who can click.** The browsers are ephemeral, so only the caller can see them, and so click
them. The public surfaces (a shared card list, a posted card, a posted deck) carry only the
"View a card" select and link buttons, which answer the clicker privately and never change the
public message.

**Errors.** The component branch mirrors the command branch: log the custom id kind and the
interaction id (never the token or the raw query), then `editReply(textPayload(error.generic))`
when deferred or replied, else an ephemeral `reply`. The command branch's catch switches to
`textPayload` too, since after this change every deferred reply is V2.

### 3. Posting to the channel (`bot/src/discord/channel-post.ts`)

`postTarget`, `refusalKey` and the permission list move out of `commands/deck.ts` into a
shared module, unchanged in behaviour, with one parameter: `needsFiles` (Attach Files is
required only for a deck sheet). Every "post to channel" in this design goes through it:

- a plain `channel.send`, never an interaction reply (which would render as a reply to the
  private message the click came from);
- the first component is a TextDisplay `{user} shared ...` with the non-pinging mention
  (`allowedMentions` stays `{ parse: [] }` on the client);
- permissions checked from `appPermissions` before anything is sent; `unreachable` and
  `forbidden` map to `post.cannotPostHere` / `post.cannotPost`;
- a failed send that was not a `DiscordAPIError` is never retried (it may have posted).

`deck.cannotPost`, `deck.cannotPostHere`, `deck.posting` and `deck.sharedBy` are renamed into
the `post.*` namespace and generalized ("I can't post in this channel..."), with
`post.sharedCards` / `post.sharedCard` / `post.sharedDeck` for the attribution line.

*Refined in the phase 1 plan:* `refusalKey` became `refusal`, which returns
`'unreachable' | 'forbidden' | null` rather than a catalog key, so each caller keeps its own
wording. `/deck` keeps `deck.cannotPostHere` (its "choose Only show me" hint only makes sense
there); only `deck.cannotPost` became `post.cannotPost` in phase 1. Phase 2 adds
`post.cannotPostHere` for the browsers.

Outside a guild (`!interaction.inGuild()`) there is no channel to post to: Share and every
"Post to channel" button are left off the view, not shown disabled.

### 4. `/card` (phase 1)

Same lookup, same public reply, new layout via `v2/card-view.ts`:

```
Container (lesson colour)
  TextDisplay   ## Alohomora
                Spell · Charms · Cost 2 · Uncommon · Legal      (one line, attrLabel)
  MediaGallery  card image (thumbKey / landscapeThumbKey)
  TextDisplay   effect text, then *flavour*
  Separator
  TextDisplay   **Rulings** - one bullet each, clamped
  TextDisplay   -# Chamber of Secrets · #12
  ActionRow     [Open on revelio.cards]
```

The stats line replaces the inline-field grid, so `inline-grid.ts` and its zero-width padding
go away with the embeds. Loading moves into `data/card-detail.ts`
(`loadCardDetail(deps, id, locale)`: doc, set name, rulings, sub-type labels), shared by
`/card`, the browser's "Open a card" and "View a card".

`/collection` moves to `textPayload` containers in the same phase (it is plain text today), so
after phase 1 no command sends `content`.

### 5. `/search` browser (phase 2)

**Command.** `/search [query] [lesson] [type] [set]`, **ephemeral**
(`deferReply({ flags: Ephemeral })` first). `query` becomes optional (filters alone browse,
e.g. every Charms card in a set) with `setMaxLength(50)`; `page` is removed. With neither
query nor filters it still answers: the first page of everything.

**Data.** `@revelio/search` gets `searchCardBrowseRows`, a projection like
`searchCardSummaries` with `BROWSE_FIELDS = [id, name, setCode, number, types, lesson, cost,
imageVersion, imageLang, defaultLanguage, orientation]`. `bot/src/data/cards.ts` `findCards`
switches to it; the page size becomes 5.

**View** (`v2/search-view.ts`), worst case 33 components:

```
Container (brand gold)
  TextDisplay   **312 cards** for "charm" · Charms · Base Set
  Separator
  Section x5    cardRow (thumbnail accessory)
  Separator
  ActionRow     Select "Open a card..."          (co: state, values = the 5 card ids)
  ActionRow     Select lesson  (Any + 5)         (s: state with lesson replaced, page 1)
  ActionRow     Select type    (Any + 9)
  ActionRow     Select set     (Any + sets, max 24 + Any)
  ActionRow     [◀] [2 / 63] [▶] [Share] [revelio.cards ↗]
```

- A filter select re-renders page 1 with that filter replaced; the selected option is shown
  as the default. The set select lists `deps.sets.all(locale)`, cut to 24 plus "Any"; a set
  passed by the slash option that falls outside the cut is still honoured and shown first.
- No results: the header says so, the filter rows stay so the user can widen the search, and
  the rows, open select and Share are left off.
- An empty page inside the estimated range (Meilisearch over-count) renders as "no more
  results" with ◀ enabled, not as an error.
- Every click is `update()` with the new view after one Meilisearch read; no defer needed.

**Opening a card.** The select's `update()` replaces the browser with `card-view` plus an
action row `[◀ Back to results] [Post to channel] [revelio.cards ↗]`. Back (`cb`) rebuilds the
page it came from.

**Posting one card** (`cp`): `deferUpdate`, `channel-post` sends the card view with
`post.sharedCard` above it, then an ephemeral `followUp` `post.done` ("Posted.") so the
private card view stays where it is.

**Sharing results.** Share (`sh`) `update()`s to the picker:

```
Container
  TextDisplay   Share which cards to the channel?
  ActionRow     Multi-select (sp: state), min 1, max n, all n options preselected
  ActionRow     [Cancel]  (s: state)
```

Submitting re-reads the chosen ids (`filters.ids`, so a stale or tampered value simply drops
out), posts the **share view** through `channel-post`, and `update()`s the ephemeral message
back to the browser page.

**Share view** (public, `v2/share-view.ts`):

```
Container (brand gold)
  TextDisplay   @user shared 4 cards from a search for "charm"
  Section xN    cardRow
  ActionRow     Select "View a card..."  (pk, values = the card ids)
  ActionRow     [See the full search on revelio.cards ↗]
```

No pager, nothing that changes the message. "View a card" (`pk`) replies **ephemerally** to
whoever clicks, with the card view in **their** locale and a revelio.cards link; no Post
button there, so a shared list cannot turn into a stream of re-posts. The share view is in
the sharer's locale, as a posted deck is today.

### 6. `/decks` and `/mydecks` browsers (phase 3)

**`/decks [query] [format] [sort]`**, ephemeral, any user, worst case 32 components. Public decks only, through
`listPublicDecks` (so the web `/decks` page and the bot can never disagree on matching,
including `@handle`), which gains an optional `pageSize` (default stays 24 for the web). Page
size 5. `query` max 50 characters.

```
Container
  TextDisplay   **84 decks** · Classic · most liked
  Separator
  Section x5    **Gryffindor Aggro** · @hermione · Classic
                ♥ 12 · 60 cards · Charms, Transfiguration
                accessory: Thumbnail of the starter's art crop (artCropKey), or a plain
                TextDisplay when the deck has no starting character
  Separator
  ActionRow     Select "Open a deck..."   (do, values = deck ids)
  ActionRow     Select format (Any, Classic, Revival)
  ActionRow     Select sort (likes, views, newest, updated)
  ActionRow     Select lesson (Any + 5)
  ActionRow     [◀] [1 / 17] [▶] [revelio.cards/decks ↗]
```

**`/mydecks`** keeps its name, stays ephemeral and link-required, and becomes the same browser
with scope `m` over `listDecksByUser` (all of a user's decks, paged in memory; the list is
small). Rows are text, with `🔒` on private decks; no filters, since a user's own list is
short. The not-linked and no-decks answers stay as they are, as `textPayload`.

**Opening a deck** (`do`): re-resolve the clicker, `getDeckAccess` with that viewer, then
`deferUpdate` (the sheet takes seconds) and `editReply` with `v2/deck-view.ts`:

```
Container (top lesson colour)
  TextDisplay   ## Gryffindor Aggro
                by @hermione · Classic · Legal · Starting character: Hermione
  MediaGallery  attachment://deck.png   (or the main / sideboard text lists on fallback)
  ActionRow     [◀ Back] [Post to channel] [revelio.cards ↗]
```

Same fallback rules as `/deck` today: no cards or no sheet means the text lists; an upload
Discord refuses retries as the list (an edit cannot double-post). The page link follows
`linkPage` (a channel never gets a link to a private deck).

**Posting a deck** (`dp`): re-resolve the clicker and re-read access with that viewer. A
public deck is loaded as nobody, exactly as `/deck` does; the caller's **own private** deck is
loaded as its owner, because pressing "Post to channel" on it is the owner's explicit say-so,
the same consent the `/deck` prompt's **Post publicly** asks for. The button is labelled the
same way on both. Then `channel-post` with `needsFiles`, a fresh sheet render, and an
ephemeral `followUp` `post.done`.

**`/deck`** keeps its flow from #150. Its deck message and both prompts move to V2
(`deck-view` without the browser buttons, prompts as a TextDisplay plus the existing action
row). `deck-prompts.ts` keeps its collectors and its un-prefixed ids.

### 7. Command manifest (`core/src/bot-commands.ts`)

`bot/test/command-manifest.test.ts` is the contract, so each phase edits `BOT_COMMANDS`
together with the builder it mirrors:

- `CommandOptionSpec` gains `maxLength?: number`; the test checks it against `max_length`.
- `BotCommandName` gains `'decks'`.
- `search`: `ephemeral: true`, `query` not required, `maxLength: 50`, `page` removed.
- `decks`: new, `ephemeral: true`, `linkRequired: false`, options `query`, `format`
  (`values: ['classic', 'revival']`), `sort` (`values: ['likes', 'views', 'newest',
  'updated']`).
- `mydecks`: unchanged structurally.

### 8. i18n

New bot keys (both catalogs; the parity test covers them): `browse.expired`,
`browse.any`, `browse.page`, `browse.prev`, `browse.next`, `browse.site`,
`search.header` / `search.header.empty`, `search.open.placeholder`,
`search.filter.lesson|type|set`, `search.share`, `search.share.prompt`,
`search.share.cancel`, `search.back`, `search.post`, `share.view.placeholder`,
`share.site`, `decks.header` / `decks.header.empty`, `decks.open.placeholder`,
`decks.filter.format|sort|lesson`, `decks.sort.likes|views|newest|updated`, `deck.back`,
`deck.post`, `post.*` (renamed from `deck.*`, section 3), `post.done`. Removed:
`search.title`, `search.footer`, `search.line`, `search.pageOutOfRange`, the embed field
names no view uses any more. Command and option descriptions for `/decks`.

### 9. Docs and the `/discord` page (phase 4)

Prose lands last so it describes the finished behaviour; the manifest-driven tables are
correct in every phase by construction.

**Docs content** (`web/content/docs/*.{en,de}.mdx`):

- `discord-commands`: Search rewritten (private browser, filters on the message, open a
  card, post one, share several, "View a card" for everyone); a new **Browse decks**
  section for `/decks`; `/mydecks` under "Your own data" as a browser; Deck lookup unchanged
  except the layout. The intro's "Five slash commands" becomes six.
- `discord-privacy`: "`/card`, `/search` and `/deck` answer in the channel" becomes: `/card`
  and `/deck` answer in the channel; `/search` and `/decks` are private until you share or
  post; a shared list shows who shared it. The private-deck rule now names both ways to post
  one (the `/deck` prompt and the browser's button).
- `discord-troubleshooting`: the "page out of range" entry is replaced by "the buttons say
  the results are out of date" (a bot update changed the format; run the command again).
  The "can't post here" entry covers sharing search results as well as decks.
- `discord.mdx`: the intro's command list.
- `web/messages/{en,de}.json` `docs.commands.*`: option prose for `/decks` and the changed
  `/search` options. `discord-i18n.test.ts` and the docs content tests cover the catalogs.

**The `/discord` landing page:**

- `command-grid.tsx` stops restating command structure: `COMMANDS` there is derived from
  `BOT_COMMANDS` (name, options, `ephemeral` drives the "only you see it" tag), keeping only
  the display order locally. Today it still lists `page` on `/search` and lacks `/decks`,
  which is exactly the drift the manifest exists to prevent. Grid copy gains
  `discord.commands.decks.description`; `search` and `mydecks` descriptions are rewritten.
- `command-channel.tsx` is a hand-built mock of the card and search embeds whose header
  comment says to change it when the builders change. It is redrawn as the V2 views: the
  card as a container (accent bar, title, stats line, image, footer line, link button) and
  the search as the share view (attribution line, three thumbnail rows, "View a card"
  select, link button), which is the public thing a channel actually sees. The comment's
  checklist is rewritten against `v2/card-view.ts` and `v2/share-view.ts`.
- The page's tests (`command-grid.test.tsx`, `command-channel.test.tsx`) follow.

**Terms of service:** `web/content/legal/terms.{en,de}.mdx` section 9 (2) says replies to
`/search` are visible to everyone in the channel, which stops being true. The new wording (private
until you post or share; what you share names you) is a legal text change, so it lands only with
the user's explicit go-ahead, and may need a new effective date.

**Repo docs:**

- CLAUDE.md "Discord bot specifics":
  - the embed-limits bullet becomes the V2 limits (40 components, 4000 text characters,
    `assertWithinLimits` is the guard, plus whatever the phase 1 probe settled);
  - a new bullet for the router: `v1:` ids, stateless, ids are untrusted, re-resolve the
    clicker on every deck read;
  - the private-deck bullet drops "There is no global component router" and names
    `channel-post.ts` as the one posting path;
  - "Every command defers first" adds that a component click answers with `update()` or
    `deferUpdate()`;
  - "Card images in embeds use `thumbKey`" becomes "in thumbnails and galleries".
  - The architecture paragraph lists `/decks`.
- `README.md:37` lists all six commands.

## Phases

One plan per phase under `docs/superpowers/plans/`, all on this branch.

1. **Foundation.** Probe script and its findings; `v2/parts`, `limits`, `send`; custom id
   codec; component router in `handle-interaction.ts`; `channel-post.ts` extracted from
   `deck.ts` (behaviour unchanged, `/deck` tests stay green); `/card` and `/collection` on V2;
   error paths on `textPayload`.
2. **Card browsing.** `searchCardBrowseRows`; `/search` browser, filters, open, post, share,
   view-a-card; manifest for `/search`.
3. **Deck browsing.** `listPublicDecks` `pageSize`; `/decks`, `/mydecks` browser, deck view,
   post; `/deck` messages and prompts on V2; `embeds/` and `inline-grid.ts` deleted; manifest
   for `/decks`.
4. **Docs and the `/discord` page.** Section 9.

## Testing

- **`custom-id.test.ts`**: round trip for every kind; worst case of every kind under 100;
  `decode` rejects other versions, malformed fields, out-of-range indexes, unknown sets;
  a query containing `:` survives.
- **`limits.test.ts`**: counts nested nodes; rejects 41 components and 4001 characters.
- **View tests** (`card-view`, `search-view`, `share-view`, `deck-browser-view`,
  `deck-view`): each worst case passes `assertWithinLimits`; a hit without an image becomes a
  TextDisplay; pager disables at both ends and on a short page; Share and Post are absent
  outside a guild; a private deck posted to a channel has no page link.
- **`handle-interaction.test.ts`**: a `v1:` id reaches its handler; an id without the prefix
  (`deck:post`) is ignored by the router; an undecodable id answers `browse.expired`; a
  handler that throws gets `error.generic` through `update` or `editReply` as appropriate.
- **`commands.test.ts`**: `/search` and `/decks` defer **ephemerally** as their first
  statement (the same weight as the `/collection` and `/mydecks` assertions); share posts
  through `channel.send`, never an interaction reply; a tampered `sh` value drops out of the
  re-read; posting another user's private deck id via `dp` answers not found; "View a card"
  replies ephemerally in the clicker's locale; posting refuses on missing permissions without
  sending.
- **`channel-post.test.ts`**: the moved tests from `commands.test.ts` for `postTarget` /
  `refusalKey`, plus `needsFiles: false` not requiring Attach Files.
- **`command-manifest.test.ts`**: `maxLength` compared; `/decks` registered.
- **`ingest/test/deck-browse.test.ts`**: `listPublicDecks` honours `pageSize` and keeps 24 by
  default.
- **`search`**: `searchCardBrowseRows` returns exactly `BROWSE_FIELDS`.
- **web**: `command-grid.test.tsx` asserts the grid's commands and options equal
  `BOT_COMMANDS`; `command-channel.test.tsx` updated for the redrawn mock; docs content
  tests pick up the new sections.
- **By hand** on the dev guild after each phase: the flows above, in English and German, on
  desktop and mobile clients, with screenshots for the PR.

## Deployment

- No env vars, no migration, no ingest run (`CARD_INDEX_SETTINGS` is untouched; the new
  projection is query-time).
- Commands re-register on boot: `/search` loses `page`, `/decks` appears. Global registration
  can take up to an hour to propagate.
- Old `/search` embeds in channels stay as they are; they have no buttons.
- Depending on the probe (assumption 5), posting a shared card list may need fewer
  permissions than a deck post. The docs' permission list follows the probe.

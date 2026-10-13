# Deck search in Discord - Design

**Date:** 2026-10-12
**Status:** approved design, not yet planned
**Workspaces:** `db` (two new queries), `bot` (`/deck` command, data layer, i18n)

## Problem

`/deck` takes a deck link or id and nothing else. Nobody remembers a deck id, and pasting a
link is barely better: Discord already unfurls a pasted `revelio.cards/decks/<id>` link on its
own, through the deck page's `opengraph-image.tsx`, with no bot involved. So the command adds
little over a pasted link. What is missing is finding a deck **by name**, the way `/card` finds
a card.

A second gap: `/deck` always reads with a `null` viewer, so a linked user cannot show their own
private deck at all.

## Goals

- Typing in `/deck deck:` suggests decks by name or author: every public deck, plus the
  caller's own private decks when their Discord account is linked.
- A pasted id or link keeps working.
- Free text submitted without picking a suggestion still finds the deck.
- A private deck is never posted to a channel unless its owner explicitly says so.

## Non-goals

- **No `/decks search` browse command** (paged list, format/lesson/author filters, select menu
  to open one). The web `/decks` page already does that, and autocomplete covers "I roughly know
  its name". Revisit if people ask for browsing inside Discord.
- **No Meilisearch index for decks.** The deck table is small, the web browse page already
  searches it with `ilike` in Postgres, and indexing would mean reindexing on every deck save.
- **No link unfurling by the bot.** Reading message content needs a privileged intent; the OG
  image already covers it.

## Design

### 1. Queries (`db/src/queries/deck-browse.ts`)

**`suggestDecks(db, { query, viewerId, limit })`** returns
`DeckSuggestion = { id, name, format, author, visibility, isOwn }[]`.

- Visible set: `visibility = 'public'` OR (`viewerId` set AND `decks.user_id = viewerId`).
- Matching is the web browse page's rule, so the two never disagree: a query starting with `@`
  matches `user.username` only; anything else matches deck name OR username, both `ilike
  %q%`. Extract the condition builder from `listPublicDecks` into a shared helper rather than
  restate it.
- An empty query matches everything visible.
- Order: own decks first (newest updated first), then public decks by `likeCount` desc,
  `createdAt` desc.
- `author` uses the same fallback as `PublicDeckEntry.author`
  (`displayUsername ?? username ?? name`).
- `limit` defaults to 25 (Discord's choice cap).

**`getDeckAccess(db, id, viewerId)`** returns `'public' | 'own-private' | null`: one
primary-key read of `visibility` and `user_id`. `null` covers both "no such deck" and "someone
else's private deck", so the reply can never tell the two apart.

Both are re-exported from `db/src/index.ts`.

### 2. Autocomplete (`bot/src/discord/commands/deck.ts`)

- The `deck` option gets `.setAutocomplete(true)`; its description becomes "Deck name, link
  or id".
- `autocomplete()` resolves the caller with `resolveLinkedUser` (one indexed read, which also
  enforces a ban), then calls `suggestDecks` through `bot/src/data/decks.ts`.
- An unlinked user gets public decks only. Linking is not mentioned here; autocomplete has no
  room for prose.
- Label: `🔒 ` (own private only) + `name · @author · Format`, clamped with `clampLabel`. Value:
  the deck id. A suggestion is visible only to the person typing, so naming their own private
  deck there leaks nothing.
- Any failure responds `[]` and logs, exactly as `/card` does; free text still works.

### 3. Resolving what was submitted

`resolveDeckRef(db, input, viewerId)` in `bot/src/data/decks.ts` returns
`{ kind: 'deck', id, access: 'public' | 'own-private' } | { kind: 'ambiguous', options: DeckSuggestion[] } | { kind: 'none' }`:

1. `parseDeckRef(input)` (unchanged), then `getDeckAccess`. A hit is `deck`. A picked
   suggestion always lands here, since its value is the id.
2. Otherwise `suggestDecks` with the raw input as the query.
   - Exactly one match, or exactly one whose name equals the input case-insensitively, is
     `deck`.
   - More than one is `ambiguous` (at most 25).
   - None is `none`.

A suggestion's `isOwn` and `visibility` give `access` directly, so a name match needs no
second `getDeckAccess` read.

### 4. Execute flow

`/deck` becomes the one documented exception to "every command defers first". It does one or
two cheap reads before deciding whether the first response is public or ephemeral, since
Discord cannot turn a public reply ephemeral afterwards. The expensive part, the sheet render,
still runs after a defer.

1. `viewerId = resolveLinkedUser(...)`, then `resolveDeckRef(...)`.
2. **`none`:** ephemeral `deck.notFound` (reworded: "No deck matched that name, link or id.").
   It is ephemeral now because nothing public came of the command.
3. **`ambiguous`:** an ephemeral reply with a string select menu ("Did you mean...?", up to 25
   options labelled like the autocomplete). The pick continues as step 4 or 5 on that
   component interaction.
4. **`deck`, access `public`:** public `deferReply`, then load and send exactly as today
   (image with list fallback). If it came from the select menu, it is answered like
   **Post publicly** below.
5. **`deck`, access `own-private`:** an ephemeral prompt (`deck.private.prompt`) with two
   buttons, **Post publicly** and **Only show me**.
   - A click first re-checks access with `getDeckAccess` (one primary-key read, inside the
     3 s budget). A miss is `update`d into the prompt as `deck.notFound`; nothing public opens.
   - Only show me `update`s the prompt to `deck.loading` at once, then edits the deck into that
     same ephemeral message. No second message, nothing to delete.
   - Post publicly sends a plain channel message (`channel.send`), not an interaction reply:
     a reply to the click renders as a reply to the private, deleted prompt. The prompt turns
     into `deck.posting` at once, the channel shows the bot typing while the sheet renders,
     the message carries a non-pinging `deck.sharedBy` mention (a plain message has no "used
     /deck" line), and the prompt is deleted once the deck is up. The bot's permissions in the
     channel come with the interaction (`appPermissions`); without View Channel, Send Messages
     (Send Messages in Threads in a thread), Embed Links and Attach Files, the prompt says
     `deck.cannotPost` and nothing is sent.
   - Reached from the select menu, the prompt replaces the menu in the same message.

A deck delivered without the prompt (a public id, or a public pick from the menu) loads with
a `null` viewer, so a deck its owner made private since the access check reads as not
found instead of being posted on the owner's authority. Only a deck confirmed through the
prompt loads as the owner.

Revised 2026-10-13 after the manual run: the first version answered clicks with
`deferUpdate` and posted with a public `followUp`, which showed nothing while the sheet
rendered; the next answered with a public `deferReply`, which Discord renders as a reply to the
deleted prompt.

A picture that fails to go out falls back to the list. For a `channel.send` only on a
`DiscordAPIError`, which proves nothing was posted; any other failure may have reached the
channel, so it is reported to the caller instead of retried, which could post the deck twice.
An `editReply` is always retried, since an edit cannot post twice. Discord refusing the post
itself (Missing Access in a private thread the bot is not in, Missing Permissions) is reported
as `deck.cannotPostHere` / `deck.cannotPost`, like the up-front check. A channel the bot has
no hold on at all (not cached) is `deck.cannotPostHere`, which tells the user to choose Only
show me rather than asking moderators for a permission they cannot grant.

Outside a guild (a DM with the bot, or a user-installed app in a DM) there is no channel to
post to, so an own private deck - typed or picked from the menu - is shown ephemerally
without the visibility prompt.

The deck loader takes the viewer: `getPublicDeck` becomes `getDeckView(db, id, viewerId)`
calling `getDeckForViewer(db, id, viewerId)`, so the owner check stays in the one place that
already enforces it. Never `getDeck` directly.

The `view` option (image/list) carries through every path.

### 5. Component handling

Both prompts use a collector on the prompt message (`awaitMessageComponent`), not a global
component router in the bot's interaction handler (`discord/handle-interaction.ts`):

- Filtered to `i.user.id === interaction.user.id`. The prompt is ephemeral, but the filter is
  the guarantee, not the visibility.
- 60 s timeout. On timeout, the prompt is edited to `deck.prompt.expired` with no components.
  An `editReply` failure there (the user dismissed the message) is swallowed.
- Custom ids are local constants (`deck:post`, `deck:self`, `deck:pick`); nothing is encoded in
  them, since the closure holds the deck id.
- Trade-off accepted: a bot restart inside those 60 s leaves dead buttons. For a yes/no
  prompt, that is cheaper than a stateless router that would have to re-authorize every click.

### 6. Errors

- The sheet render keeps its list fallback on every path.
- A failure before a click is acknowledged `update`s the prompt to `error.generic` with no
  components. It has to: the top-level handler (`discord/handle-interaction.ts`) only knows
  the slash command's interaction, so the click itself would otherwise go unanswered.
- A failure after the click's `deferReply` withdraws a public placeholder and tells the caller
  ephemerally; a private placeholder is edited to the error.
- An unlinked user or a banned user resolves to `viewerId = null` and sees public decks only.
  Nothing tells them why their private deck is missing: `resolveLinkedUser` returning null
  for a ban must not be distinguishable from "not linked".

### 7. i18n (`bot/src/i18n/{en,de}.json`)

New or changed keys: `command.deck.description` ("Find a deck by name, or paste its link"),
`command.deck.option.deck`, `deck.notFound`, `deck.ambiguous`, `deck.private.prompt`,
`deck.private.post`, `deck.private.self`, `deck.pick.placeholder`, `deck.prompt.expired`. Labels for
format reuse `deck.format.*`. The parity test covers both catalogs.

## Testing

- **`ingest/test/deck-browse.test.ts`** (live Postgres via `withMigratedDb`):
  `suggestDecks` returns public decks to a null viewer, adds own private decks for the owner,
  never returns another user's private deck, applies `@handle` matching, orders own decks first,
  and respects the limit. `getDeckAccess` returns all three outcomes, and `null` for another
  user's private deck.
- **`bot/test/decks.test.ts`**: `resolveDeckRef` for an id, a link, a unique name, an exact
  name among several partial matches, several matches, and none.
- **`bot/test/commands.test.ts`**:
  - autocomplete labels (lock marker, clamp, empty on error);
  - the not-found reply is ephemeral;
  - a public deck defers publicly;
  - an own private deck replies ephemerally with both buttons and does **not** defer publicly
    first. This is the leak regression, the same weight as the ephemeral assertions on
    `/collection` and `/mydecks`;
  - "Post publicly" defers a public reply, and "Only show me" an ephemeral one;
  - the collector filter rejects another user;
  - timeout strips the components.
- **`bot/test/catalog-parity.test.ts`** picks up the new keys unchanged.

## CLAUDE.md

Under "Discord bot specifics", amend "Every command defers first" to name `/deck` as the
exception and why: its first response's visibility depends on the deck, so it does at most two
indexed reads before replying, and anything slow still runs after a defer.

## Possible follow-up

`/decks search` with filters and a select menu, if people ask for browsing inside Discord.

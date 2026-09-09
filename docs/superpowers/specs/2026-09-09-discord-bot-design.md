# Discord Bot Design

## Problem

Players discuss the Harry Potter TCG in Discord and currently have to leave the
conversation to look a card up on revelio.cards. We want a bot that answers card
questions in-channel, resolves public decks, and - for players who link their account -
reports their own collection and decks.

## The API question

The opening question was whether to build an HTTP API before the bot. **No.**

The bot is a fourth consumer of the existing workspaces, not a client of the web app.
Almost everything it needs already lives below `web`:

| Need | Existing function |
|---|---|
| Card search + facets | `searchCards`, `buildFilter` - `app/search/src/search.ts` |
| Ids-only windowed search | `searchCardIds` - same file |
| Card detail | `getCardById` - `app/db/src/queries.ts:136` |
| Name to card | `resolveCardsByName` - `queries.ts:644` |
| Deck, visibility-aware | `getDeckForViewer` - `queries.ts:589` |
| A user's decks | `listDecksByUser` - `queries.ts:449` |
| Collection | `getCollectionSummary`, `getCollectionSetProgress`, `getOwnedQuantities`, `getCollectionVisibility` |
| Image URLs | `thumbKey`, `imageUrl`, `effectiveImageLang` - `app/core/src/images.ts` |

`@revelio/ingest` is the precedent: a standalone Node process that imports
`@revelio/core`, `@revelio/db` and `@revelio/search`, talks to Postgres and Meilisearch
directly, and ships as its own GHCR image. The bot has the same shape.

An HTTP API between two processes we own, on one VPS, sharing one data layer, would pay
serialization and invent an auth scheme to recover types the two already share at compile
time. It would also make `web` the bot's uptime dependency.

A public HTTP API is wanted eventually, for third-party consumers. Because every read
already lives in `db`/`search`, that API is later a thin route layer over the same
functions. The only obligation this design takes on now is to keep the bot's data
fetching free of discord.js types, so a future route can call it unchanged.

**The trigger to revisit:** the bot moving off-host (it could no longer reach Postgres and
Meilisearch privately), or a second external consumer appearing.

## Deployment

Same VPS as `web` and `ingest`, as a third long-running container on the private network.

## Architecture

New workspace `app/bot/` (`@revelio/bot`), added to `workspaces` in `app/package.json`.
The dependency direction stays `core <- {search, db} <- {ingest, web, bot}`.

A **gateway** client (discord.js), not an HTTP-interactions endpoint hosted on `web`. A
gateway bot is its own process with no coupling to the web app, matching ingest's shape,
and it needs no public ingress.

```
app/bot/
  src/
    main.ts             entrypoint: build clients, register commands, log in
    env.ts              env parsing and validation
    clients.ts          createClient (pg) + createMeiliClient wiring
    data/               PURE: no discord.js imports. (deps, input) => DTO
      cards.ts          search, card detail, name suggestions
      decks.ts          public deck lookup, a linked user's decks
      collection.ts     a linked user's collection summary and set progress
      link.ts           Discord snowflake -> Revelio userId
    discord/
      commands/         one file per slash command (builder data + execute)
      embeds/           DTO -> EmbedBuilder; all copy via the bot's i18n
      register.ts       REST command registration
    i18n/               en/de catalogs for bot-owned strings
  test/
```

`data/` is discord-free on purpose: those functions are exactly what a future
`web/src/app/api/v1/**` route would call.

### Locale

Discord interactions carry `interaction.locale` (`de`, `en-US`, ...). Map to Revelio's
`en`/`de`, defaulting to `en`, and pass through to `searchCards(client, lang, ...)` and
`getCardById(db, id, locale)`, which are already locale-aware.

### Images

Embeds use `thumbKey(id, imageVersion, imageLang, defaultLanguage)` and
`imageUrl(base, key)` from `@revelio/core`, against the public image base URL. Card
images use `thumbKey` (300px), never the full `imageKey`.

### Shared attribute labels

`attrLabel` (`app/web/src/lib/attribute-labels.ts`) maps lesson/type/rarity/finish/
legality codes to localized labels, but reads `web/messages/{en,de}.json`. The bot cannot
import from `web`.

The `attributes` subtree of both catalogs, plus `attrLabel`, moves down into
`@revelio/core` as `core/messages/{en,de}.json` and `core/src/labels.ts` - next to
`core/src/attributes.ts`, where the codes are already defined. `web/src/lib/
attribute-labels.ts` becomes a re-export so its thirteen call sites are untouched.

No component reads `attributes.*` through next-intl (verified: every consumer goes through
`attrLabel`), so removing the subtree from the web catalogs is safe.

### Account linking

Use **Better Auth's Discord social provider** rather than a custom code-paste flow. The
`account` table (`app/db/src/auth-schema.ts`) already carries `providerId`, `accountId`
and `userId`, so linking needs **no schema change and no migration**.

1. `socialProviders.discord` in `app/web/src/lib/server/auth.ts`, using the same Discord
   application as the bot.
2. A "Link Discord" control in web settings calls Better Auth `linkSocial`. The user is
   already signed in, so it is a plain OAuth round-trip. An unlink control sits beside it.
3. `bot/src/data/link.ts` resolves `interaction.user.id` to a Revelio `userId` via
   `account where providerId = 'discord' and accountId = <snowflake>`.

Unlinked users get an ephemeral reply pointing at the settings page.

### Privacy

Personal commands (`/collection`, `/mydecks`) reply **ephemerally** - visible only to the
invoking user - because a Discord channel is a public surface and a collection is not.
Deck lookups use `getDeckForViewer(db, id, viewerId)`, which already returns `null` for a
non-public deck the viewer does not own.

Linking stores a Discord user id and makes Discord a recipient of card/deck data, so the
privacy policy needs a paragraph. Nothing new is written to the browser, so the cookie and
localStorage enumeration is unaffected.

## Phasing

Each phase is independently shippable, one PR each, with its own plan document.

| Phase | Scope | Plan |
|---|---|---|
| 0 | Shared attribute labels. Pure refactor, no bot code. | `plans/2026-09-09-shared-attribute-labels.md` |
| 1 | Workspace, deploy pipeline, `/card`, `/search`. | `plans/2026-09-09-discord-bot-foundation.md` |
| 2 | Card-name autocomplete and a suggested `set` filter. | `plans/2026-09-09-discord-bot-autocomplete.md` |
| 3 | `/deck <id-or-url>` for public decks. | `plans/2026-09-09-discord-bot-deck-lookup.md` |
| 4 | Discord provider, settings UI, `/collection`, `/mydecks`. | `plans/2026-09-09-discord-bot-account-linking.md` |

Phase 0 is a prerequisite for Phase 1. Phases 1 to 4 are strictly sequential: each builds
on the previous phase's files.

## Out of scope

- A public HTTP API. Revisit when a second consumer exists or the bot moves off-host.
- Deck editing from Discord. The bot is read-only; writes stay on the web app, where the
  existing server actions own validation.
- Image generation (rendered deck PNGs in-channel). `deck-png.ts` lives in `web` and
  depends on the browser-oriented rendering path; not worth moving for v1.
- Message-content parsing (`[[Card Name]]` inline lookups). It needs the privileged
  Message Content intent and Discord verification once the bot passes 100 guilds. Slash
  commands cover the need without that.

## Non-goals accepted as limitations

- The bot reads a Meilisearch index that only an ingest run refreshes. Card data changes
  made in the web editor re-index immediately (the edit actions already do this), so the
  bot sees them; new sets still need an ingest run, as they do for the web app.
- No sharding. Sharding becomes necessary past 2500 guilds, far beyond this project.

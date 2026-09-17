# Bot Deck Image

**Goal:** `/deck` answers with a picture of the deck - a grid of card thumbnails with
copy counts, grouped into starting character, main deck and sideboard - under the
existing deck header embed. A new `view` option switches back to today's text list.

**Default:** `view` is optional and defaults to `image`. The picture is what makes a
deck worth posting in a channel; the list stays one choice away for people who want
text they can read on a slow connection or copy. `view:list` is byte-for-byte today's
reply, so nothing that works now is lost.

## Decisions

- **Rendered in the bot, sent as an attachment.** CLAUDE.md rules out an HTTP API
  between `bot` and `web`, and a per-deck image cannot be baked at ingest the way the
  landscape thumbs are. The bot composes the image with `sharp` and uploads it as
  `AttachmentBuilder`; the embed points at it with `setImage('attachment://deck.webp')`.
  An attachment also sidesteps Discord's URL cache, which would keep showing a deck's
  old picture after an edit.
- **One tile per distinct card, not per copy.** Copies show as a `3x` badge, like the
  web gallery (`web/src/components/deck/deck-gallery.tsx`). Sixty singleton tiles would
  make the picture unreadable in a chat column.
- **Tiles use `thumbKey` as stored.** Horizontal cards sit sideways on their portrait
  canvas, exactly as they do in the web gallery's resting tile. Turning them upright
  would break the uniform grid. Default-language image only, like `imageVersion` on
  `DeckCardView`.
- **Order matches the list view:** character, then main and sideboard by cost then name
  (`byCostThenName` in `bot/src/data/decks.ts`). The web's lesson grouping lives in
  `web/src/lib/deck-groups.ts`, which the bot must not import; porting it is out of
  scope.
- **Layout:** 10 columns, 150x210 tiles (the 300px thumb halved), 8px gap, 24px padding,
  section labels above each group, brand indigo background `#13122A`, gold labels.
  Width is fixed at 1620px; height grows with the entry count.
- **Text via sharp's `text` input with a bundled `Poppins-SemiBold.ttf` `fontfile`.**
  Alpine ships no fonts, so SVG `<text>` would render tofu. The font sits next to the
  module that loads it and is resolved with `new URL('./Poppins-SemiBold.ttf',
  import.meta.url)`; `build.mjs` copies it next to `bot.mjs` so the same URL resolves
  inside the bundle (the trick `web/src/lib/og-image.tsx` uses).
- **Output WebP, quality 90.** Discord renders WebP embeds; the file stays well under
  the 10 MB upload limit even for a 60-entry deck.
- **Failure never loses the answer.** A thumb that fails to fetch (5s timeout, 8 in
  flight) becomes a muted placeholder tile with the card name. If rendering itself
  throws, the command logs it and replies with the list view instead.

## Task 1: Carry image data on the deck view

- `DeckEntryView` in `bot/src/data/decks.ts` gains `cardId` and `imageVersion`.
- `toEntry` copies them from `DeckCardView`.
- Tests (red first): `decks.test.ts` asserts both fields reach `main`, `sideboard`
  and `character`.

## Task 2: Manifest supports fixed choices

`CommandOptionSpec.choices` only names an `ATTRIBUTES` scope, and `view` is not one.

- `core/src/bot-commands.ts`: add `values?: readonly string[]` to `CommandOptionSpec`
  with a doc comment on why it is separate from `choices`; the `deck` entry gains
  `{ name: 'view', type: 'string', required: false, autocomplete: false, values: ['image', 'list'] }`.
- `bot/test/command-manifest.test.ts`: expected choices are
  `SCOPE_VALUES[option.choices]` or `option.values`, else `null`.
- `web/src/components/docs/command-table.tsx`: the type cell reads `typeChoice` for
  `values` too; chips resolve labels from `docs.commands.<name>.choices.<option>.<value>`.
- `web/messages/{en,de}.json`: `docs.commands.deck.options.view` plus
  `docs.commands.deck.choices.view.{image,list}`.
- Tests (red first): `command-table.test.tsx` renders the `view` row with both chips.

## Task 3: Register the `view` option

- `bot/src/discord/commands/deck.ts`: `addStringOption` named `view`, not required,
  choices `image` / `list` with `setNameLocalizations` for `de`.
- `bot/src/i18n/{en,de}.json`: `command.deck.option.view`, `command.deck.view.image`,
  `command.deck.view.list`. Catalog parity test covers the pair.
- The manifest test from Task 2 now passes against the builder.

## Task 4: Split the embed by view

- `DeckEmbedOptions` gains `view: 'image' | 'list'`.
- Header (title, URL, colour, footer, character/format/legality fields) is shared.
  `list` adds the main/sideboard fields as today; `image` omits them and calls
  `setImage('attachment://deck.webp')`. Export the attachment name as a constant from
  `deck-embed.ts` so command and embed cannot disagree.
- Tests (red first) in `deck-embed.test.ts`: `list` output is unchanged (existing
  assertions pass with `view: 'list'`); `image` has no card-list fields and the image
  URL is the attachment.

## Task 5: Render the deck image

- `sharp` joins `bot/package.json` dependencies at web's range (`^0.35.3`).
- Copy `web/src/lib/fonts/Poppins-SemiBold.ttf` to `bot/src/images/`.
- `bot/src/images/deck-layout.ts` - pure, no I/O: `layoutDeck(deck)` returns canvas
  size, section label positions and one `{ entry, x, y }` per tile. Unit-testable
  without sharp.
- `bot/src/images/deck-image.ts` - `renderDeckImage(deck, { imageBase })`: fetches
  thumbs with the concurrency cap and timeout, resizes each to the tile, rounds the
  corners with an SVG mask, draws the quantity badge and section labels via `text`
  inputs, composites onto the background, returns a WebP `Buffer`. No top-level side
  effects (see Image builds in CLAUDE.md).
- Tests (red first):
  - `deck-layout.test.ts`: column wrap at 10, sections stack without overlap, an empty
    sideboard emits no label, height for a 60-entry main deck.
  - `deck-image.test.ts`: stub `fetch` with sharp-generated solid-colour WebPs; output
    decodes as WebP at the layout's size. A rejected fetch still renders (placeholder).

## Task 6: Wire the command

- `deck.ts` reads `view` (`?? 'image'`). For `image`, renders, then
  `editReply({ embeds: [deckEmbed(..., { view: 'image' })], files: [new AttachmentBuilder(buf, { name: DECK_IMAGE_NAME })] })`.
  On a render error: `console.error` and reply with the list view.
- `commands.test.ts`: `vi.mock` the renderer. Cases: default replies with a file and
  the attachment image; `view:list` sends no file and has the card fields; a renderer
  that throws falls back to the list embed. `fakeInteraction`'s `getString` already
  returns `null` for a missing option, which exercises the default.

## Task 7: Ship sharp in the bundled image

The bundle cannot inline a native module.

- `bot/build.mjs`: `external: ['sharp']`, and copy `Poppins-SemiBold.ttf` into `dist/`.
  Comment why sharp is external.
- `bot/Dockerfile`, build stage: after bundling, install sharp alone into `/sharp` at
  the exact version the workspace resolved
  (`npm install --omit=dev --no-package-lock sharp@$(node -p "require('/app/node_modules/sharp/package.json').version")`),
  so the runtime carries sharp and its musl libvips and nothing else.
- Runtime stage: copy `/sharp/node_modules` to `/app/node_modules` and the font next to
  `bot.mjs`. Add a runtime-stage smoke `RUN` that renders a text input with that
  fontfile, so a missing native binary or font fails the image build rather than the
  first `/deck`.
- Update the **Image builds** section of `CLAUDE.md`: the bot bundle now has one
  external native dependency, and why.

## Task 8: Docs

- `web/content/docs/discord-commands.{en,de}.mdx`: the deck section describes the
  picture as the default answer and `view:list` for the text list; add a second
  `CommandExample` with `view:list`.

## Task 9: Verify

- `npm test -w @revelio/bot`, `npm test -w web -- command-table`, `npm run typecheck`,
  `npm run lint`.
- `npm run build -w @revelio/bot`, then `docker build -f bot/Dockerfile .` from `app/`;
  record runtime image size before and after (currently ~165 MB).
- By hand: `npm run dev -w @revelio/bot` against a test guild, `/deck` on a public deck
  with and without `view:list`, and a deck with a missing thumb. Screenshot for the PR.

## Deployment

No env var, migration or ingest run. Commands re-register on boot, so the new `view`
option appears once the new bot image is running (global registration can take up to
an hour to propagate).

# Bot Deck Image

**Goal:** `/deck` answers with a picture of the deck under the existing deck header
embed - the same deck sheet the web builder's "Export PNG" downloads. A `view` option
switches back to today's text list.

**Default:** `view` is optional and defaults to `image`. The picture is what makes a
deck worth posting in a channel; the list stays one choice away for people who want
text they can read on a slow connection or copy. `view:list` is byte-for-byte today's
reply, so nothing that works now is lost.

## Revision

The first version of this plan designed a grid layout of its own in the bot. The web
already has one: `web/src/lib/deck-png.ts` lays out and draws the deck sheet for
"Export PNG" (`deck-export-menu.tsx`). Its layout half (`layoutDeckSheet`,
`computeSheetGeometry`) and the grouping it builds on (`groupMainEntries` in
`web/src/lib/deck-groups.ts`) are pure arithmetic, so a second copy in the bot would
drift from the first the day either changes. This revision moves that half into
`@revelio/core` and gives the bot only a renderer of its own.

Tasks 2-4 of the first version are done and unaffected. Task 1 (`cardId` and
`imageVersion` on `DeckEntryView`) is superseded by Task 5 below, which removes those
fields again.

Superseded on 2026-09-17 by
`docs/superpowers/specs/2026-09-17-deck-image-delivery-design.md`: the "Thumbs, not full
images, at 2x" and "Output WebP, quality 90" decisions below are both reversed there. The
thumb reasoning ("no visible gain in a chat column") did not survive contact with the
264x370 card box, and WebP was a second generation of loss on an already lossy source.

## Decisions

- **One layout, two painters.** Grouping, section titles, card boxes and canvas size
  come from `@revelio/core`. The browser paints them onto a Canvas; the bot paints the
  same geometry with `sharp`. Drawing cannot be shared: the bot has no DOM, and the
  web's CSP rules out pulling a raster library into the browser. Core stays free of I/O.
- **Same look as the export.** Title `Name (Format)`, midnight frame around a card
  panel, section headers with a colour swatch (gold for Character / Main deck /
  Lessons / Sideboard, muted for the other type groups), horizontal cards turned
  upright, gold round quantity badge straddling each card's bottom edge, placeholder
  tile with the card name when an image is missing. The colours move to core with the
  layout so the two painters read one set of values.
- **Main deck grouped by type, as in the builder.** Creatures, Spells, ... with Lessons
  last. Within a group, the bot orders by cost then name (`byCostThenName`), because
  `getDeckForViewer` reads `deck_cards` without an ORDER BY and the picture must not
  reshuffle between two lookups.
- **Rendered in the bot, sent as an attachment.** CLAUDE.md rules out an HTTP API
  between `bot` and `web`. The bot uploads the WebP as an `AttachmentBuilder`; the
  embed points at it with `setImage('attachment://deck.webp')` (Task 4, done). An
  attachment also sidesteps Discord's URL cache, which would keep showing a deck's old
  picture after an edit.
- **Thumbs, not full images, at 2x.** The web export draws the full image onto a 2x
  canvas. The bot renders at the same 2x scale (1960px wide) from `thumbKey`: a 300px
  thumb covers a 264px card box, and the full image would cost 2-3x the bytes per
  card for no visible gain in a chat column. Default-language image only, like the
  export.
- **Text via sharp's `text` input with a bundled `Poppins-SemiBold.ttf`.** Alpine ships
  no fonts. Two findings from the spike on the first version:
  - Without a fontconfig config file, the first text render in a process scans every
    system font directory (16s on a Mac). A `fonts.conf` next to the font lists only
    its own directory; the renderer sets `FONTCONFIG_FILE` to it before the first text
    render (not at import - see Image builds in CLAUDE.md).
  - It is not yet proven that the font actually resolves to Poppins rather than a bold
    fallback. Task 7 settles it with a test that compares a render against a family
    that does not exist. If Poppins cannot be made to load, stop and raise it rather
    than ship a fallback face: SVG `<text>` is no way out, it renders tofu on Alpine.
  The font and `fonts.conf` sit next to the renderer and resolve with
  `new URL('./...', import.meta.url)`; `build.mjs` copies both next to `bot.mjs`.
- **Output WebP, quality 90.** Discord renders WebP embeds; the file stays well under
  the 10 MB upload limit.
- **Failure never loses the answer.** A thumb that fails to fetch (5s timeout, 8 in
  flight) becomes the placeholder tile. If rendering itself throws, the command logs
  it and replies with the list view. A deck with no cards replies with the list view
  too - an empty sheet says nothing the header does not.

## Task 5: Carry the sheet entries on the public deck

- Revert `7444b257` (`cardId` / `imageVersion` on `DeckEntryView`); nothing will read
  them.
- `PublicDeck` gains `entries: DeckCardView[]` - every view, character first, then
  main and sideboard each ordered by `byCostThenName`. That is the input the core
  layout takes.
- Tests (red first) in `decks.test.ts`: `entries` holds every view, in that order,
  whatever order the rows arrived in.

## Task 6: Move the deck sheet layout into core

- New `core/src/deck-groups.ts`: `OTHER_GROUP`, `groupKey`, `groupMainEntries`, moved
  from `web/src/lib/deck-groups.ts` and made generic over
  `Pick<DeckCardView, 'types'>` so the bot's views and the builder's entries both fit.
  `groupColor` (CSS variables) and `groupLabel` (next-intl) stay in web, which
  re-imports the rest from `@revelio/core`.
- New `core/src/deck-sheet.ts`: `layoutDeckSheet`, `computeSheetGeometry`, their types
  (`DeckPngCard` -> `DeckSheetCard`, `DeckPngSection` -> `DeckSheetSection`,
  `DeckPngLayout` -> `DeckSheetLayout`, plus `DeckSheetLabels`, `PositionedCard`,
  `PositionedSection`, `SheetGeometry`), the geometry constants a painter needs
  (width, padding, title height, section header height, swatch size, badge radius,
  frame) and a `DECK_SHEET_COLORS` object. Export both from `core/src/index.ts`.
- `web/src/lib/deck-png.ts` keeps only the Canvas painter (`renderDeckPng` and its draw
  helpers), importing layout, constants and colours from core. No visual change.
- Move `web/src/lib/__tests__/deck-png.test.ts` to `core/test/deck-sheet.test.ts`
  unchanged apart from imports and names; it is the proof the move changed nothing.
  Add `core/test/deck-groups.test.ts` for the grouping order (lessons last, other
  before lessons, unknown types in other).
- Verify: `npm test -w @revelio/core`, `npm test -w web`, `npm run typecheck`,
  `npm run lint`. By hand: "Export PNG" in the builder produces the same sheet as on
  `main` (Playwright screenshot of both).

## Task 7: Render the sheet in the bot

- `sharp` joins `bot/package.json` dependencies at web's range (`^0.35.3`); the lockfile
  diff is one line.
- Copy `web/src/lib/fonts/Poppins-SemiBold.ttf` and add `fonts.conf` in
  `bot/src/images/`.
- Bot i18n gains `deck.sheet.character`, `deck.sheet.main`, `deck.sheet.sideboard` and
  `deck.group.{creature,spell,item,adventure,location,event,match,character,lesson,other}`
  in both catalogs, with the web's wording (`decks.panel.*`, `decks.group.*`) so the
  two sheets read the same.
- `bot/src/images/deck-image.ts` - `renderDeckImage(deck, { imageBase, locale })`:
  builds `DeckSheetLabels` from the bot catalog, calls `layoutDeckSheet` +
  `computeSheetGeometry`, fetches thumbs (cap 8, 5s timeout), and composites at 2x:
  background, frame, title, section swatches and titles, each card resized to its box
  (horizontal cards rotated upright, as `drawRotatedUpright` does), placeholders and
  badges. Returns a WebP `Buffer`. No top-level side effects.
- Tests (red first) in `deck-image.test.ts`, with `fetch` stubbed by sharp-generated
  WebPs:
  - output decodes as WebP at twice the core geometry's size;
  - the default-language thumb URL is requested and a card with no image version is
    never fetched;
  - a rejected fetch and a 404 still render;
  - never more than 8 thumbs in flight;
  - a card name with `&` and `<` renders (Pango markup is escaped);
  - the title renders in Poppins: its raw pixels differ from the same text rendered
    with a family that does not exist.
- By hand: render the local public deck to a file and look at it next to the web
  export of the same deck.

## Task 8: Wire the command

- `deck.ts` reads `view` (`?? 'image'`). For `image` with at least one entry, renders,
  then `editReply({ embeds: [deckEmbed(..., { view: 'image' })], files: [new AttachmentBuilder(buf, { name: DECK_IMAGE_NAME })] })`.
  On a render error: `console.error` and reply with the list view. An empty deck gets
  the list view.
- `commands.test.ts`: `vi.mock` the renderer. Cases: default replies with a file and
  the attachment image; `view:list` sends no file and has the card fields; a renderer
  that throws falls back to the list embed; an empty deck never calls the renderer.

## Task 9: Ship sharp in the bundled image

The bundle cannot inline a native module.

- `bot/build.mjs`: `external: ['sharp']`, and copy `Poppins-SemiBold.ttf` and
  `fonts.conf` into `dist/`. Comment why sharp is external.
- `bot/Dockerfile`, build stage: after bundling, install sharp alone into `/sharp` at
  the exact version the workspace resolved
  (`npm install --omit=dev --no-package-lock sharp@$(node -p "require('/app/node_modules/sharp/package.json').version")`),
  so the runtime carries sharp and its musl libvips and nothing else.
- Runtime stage: copy `/sharp/node_modules` to `/app/node_modules`, and the font and
  `fonts.conf` next to `bot.mjs`. Add a runtime-stage smoke `RUN` that renders a text
  input with that fontfile, so a missing native binary or font fails the image build
  rather than the first `/deck`.
- Update the **Image builds** section of `CLAUDE.md`: the bot bundle now has one
  external native dependency, and why. Add the deck sheet to the `@revelio/core`
  bullet under **Architecture**.

## Task 10: Docs

- `web/content/docs/discord-commands.{en,de}.mdx`: the deck section describes the
  picture as the default answer - the same sheet as "Export PNG" - and `view:list` for
  the text list; add a second `CommandExample` with `view:list`.
- `web/messages/{en,de}.json`: update `docs.discord.commands.deck.description`, which
  still lists only the text contents.

## Task 11: Verify

- `npm test` (all workspaces), `npm run typecheck`, `npm run lint`.
- `npm run build -w @revelio/bot`, then `docker build -f bot/Dockerfile .` from `app/`;
  record runtime image size before and after (currently ~165 MB).
- By hand: `npm run dev -w @revelio/bot` against a test guild, `/deck` on a public deck
  with and without `view:list`, and a deck with a missing thumb. Screenshot for the PR.

## Deployment

No env var, migration or ingest run. Commands re-register on boot, so the new `view`
option appears once the new bot image is running (global registration can take up to
an hour to propagate).

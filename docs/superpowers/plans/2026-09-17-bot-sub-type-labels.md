# Bot Sub-Type Labels

**Goal:** The `/card` embed's Type field prints sub-types the way the card page does
("Character, Wizard, Gryffindor, Unique"), not as raw codes ("Character, wizard, ...").

**Cause:** `bot/src/discord/embeds/card-embed.ts` appends `doc.subTypes` verbatim. The web
card page resolves each code through the editor-curated `sub_type_localizations` table
(`getSubTypeLabels`) and falls back to `humanize` (`web/src/lib/humanize.ts`).

## Task 1: Move `humanize` to `@revelio/core`

- Add `core/src/humanize.ts` (same body), export it from `core/src/index.ts`.
- Delete `web/src/lib/humanize.ts`; `card-detail.tsx` imports `humanize` from `@revelio/core`.

## Task 2: Resolve sub-type labels in the bot

- `CardEmbedOptions` gains `subTypeLabels: Record<string, string>`.
- `cardEmbed` maps each sub-type through `subTypeLabels[code] ?? humanize(code)`.
- `commands/card.ts` loads `getSubTypeLabels(deps.db, locale)` in the existing `Promise.all`.
- Tests (red first): `card-embed.test.ts` asserts a translated label wins and an
  untranslated code is humanized.

## Task 3: Verify

`npm test -w @revelio/bot`, `npm test -w web -- card-detail`, `npm run typecheck`, `npm run lint`.

# Web bounds the deck and card names it writes

**Goal:** no web write path can store a deck name or a localized card name longer than
the shared limit, so the deck sheet's carry bound (`SHEET_FIELD_LIMITS.nameInput`, 200) is
never reached by real data.

**Cause:** two writers skip the bound the sheet contract now has to tolerate.

- `duplicateDeckAction` builds `` `${deck.name} (copy)` `` and calls `createDeck` directly,
  past `writeSchema`'s `.max(120)`. A 120-character name gains 7 per copy; about twelve
  copies of copies pass 200, and that deck's sheet is a 400 forever.
- `updateLocalization` validates `name` as `z.string().trim().min(1)`, no max, into an
  unbounded `text` column. One long paste in the editor does the same to every deck
  holding the card.

Follow-up to the deck sheet truncation work (`core/src/deck-sheet.ts`, `paintedText`),
whose comment names both writers as the reason the contract truncates instead of
rejecting.

## Design

- `DECK_NAME_MAX = 120` in `core/src/deck.ts` and `CARD_NAME_MAX = 120` beside it in
  `core/src/domain.ts` - one number per field, shared by the server schemas and the
  inputs' `maxLength`. 120 for cards matches what the sheet paints; real names top out at 51.
- `copyDeckName(name)` in `core/src/deck.ts`: truncates the base (surrogate-safe, trailing
  space trimmed) so base + `" (copy)"` fits `DECK_NAME_MAX`. It also brings an
  already-over-long legacy name back inside the bound.
- `deck-actions.ts` `writeSchema` / `metaSchema` and `localization-actions.ts` use the
  constants; `lib/schemas/localization.ts` adds `.max(CARD_NAME_MAX, t('tooLong'))` so
  the form says so inline instead of a silent `invalid`.
- `maxLength` on the builder name, the deck-list rename and the localization name inputs.
- The truncation in `paintedText` stays: it still guards rows written before this lands.
  Its comment, and the deck-sheet route's "the builder's name field has no maxLength",
  are updated.

Not in scope: a data migration for rows already over the bound (only reachable through
duplication, and the sheet still truncates them), and the unbounded card `text` /
`flavorText`, which the sheet does not carry.

## Tasks

1. Tests: `copyDeckName` (short name, 120-char name, over-long name, surrogate at the cut);
   `duplicateDeckAction` stores a bounded name; `updateLocalization` rejects a 121-char
   name; the localization form schema reports `tooLong`. Watch them fail.
2. Implement. Watch them pass.
3. `npm test`, `npm run typecheck`, `npm run lint`.

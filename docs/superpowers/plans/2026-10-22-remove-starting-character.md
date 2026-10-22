# Remove the starting character

The deck editor's Starting Character row shows the card and a "Character" badge
and nothing else, so once a character is chosen the only way out of it is to
pick another one. This adds a remove button to that row.

Design: variant C of the mockups - an always-visible ghost X after the badge,
`size-7` like the row's other icon buttons, muted until hover, then
`text-destructive` on a faint destructive tint. Main-deck and sideboard rows do
not get one: their minus button already removes a card at quantity 1, and the
quantity input clears a playset in one go.

## Behaviour

- Editor only. `DeckPanel` renders the button when it is given an
  `onRemoveCharacter` handler and is not `readOnly`.
- The builder owns the removal (`handleRemoveCharacter` in `deck-builder.tsx`):
  it drops the entry with `removeCard`, then confirms with `toastRemoved`,
  whose Undo puts the same card back through `addCard`, which keeps the
  one-character rule.
- No confirm dialog: one card in an unsaved draft, and main rows already drop
  out at quantity 0 without asking.
- `toastRemoved` widens its options to `description` + `action`; its comment
  already names `action` as the one place an Undo goes.

## Strings (`en.json` + `de.json`)

- `decks.panel.removeCharacter` - "Remove {name} as starting character" (aria-label)
- `decks.characterRemoved` / `decks.characterRemovedDetail` - toast title and
  description naming the card
- `decks.undo` - the toast's action label

## Tasks

1. Red: `components/deck/__tests__/deck-panel-character.test.tsx` - the button
   calls `onRemoveCharacter` with the character's id; it is absent in read-only
   mode and when no handler is passed.
2. Green: the button in `characterRow`, the new prop, the strings.
3. Wire `handleRemoveCharacter` in the builder; widen `toastRemoved`.
4. `npm test -w web`, `npm run typecheck`, `npm run lint`; check the row in
   both themes with Playwright.

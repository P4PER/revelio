# Bot Plurals Implementation Plan

**Goal:** The bot renders "1 likes" and "1 cards" in a deck browser row, and "1 copies"
in a `/collection` summary, because its `t()` helper only substitutes `{name}`
placeholders and has no way to pick a singular. Give the bot catalogs plural forms.

## Decisions

- **ICU message syntax, the same as web.** Web's catalogs already write
  `{count, plural, one {# card} other {# cards}}` through next-intl, so the bot adopts
  that syntax rather than a second convention (`key.one` / `key.other` suffixes) that
  translators would have to learn on top. `t()` formats through `intl-messageformat`,
  the library next-intl uses; it pins `^11.2.15`, the copy next-intl already hoists into
  the workspace, so the lockfile gains no second one. The bot ships as one esbuild
  bundle, so the runtime image takes only the code it uses.
- **`t()` keeps its contract.** A missing key still returns the key, and an unsupplied
  placeholder still renders as `{name}` instead of throwing (intl-messageformat throws on
  a missing value). Parsed formats are cached per locale and key.
- **Only the strings that can read wrong change.** `decks.row.stats` (likes and cards) and
  the copies count in `collection.summary`. Counts in parentheses or after a colon
  ("Main deck (1)", "Cards found: **1**") need no noun agreement. `post.sharedCard` /
  `post.sharedCards` already pick their key by count and stay as they are.
- **The parity test also checks the catalogs parse**, so a broken ICU string fails CI
  instead of a command at runtime.

## Tasks

1. Tests first in `bot/test/i18n.test.ts`: singular and plural for both locales, the
   unsupplied-placeholder case on a plural string, and every catalog value parsing.
2. Add `intl-messageformat` to `bot/package.json`; rewrite `bot/src/i18n/t.ts` on it.
3. Pluralise `decks.row.stats` and `collection.summary` in `en.json` and `de.json`.
4. `npm test -w @revelio/bot`, `npm run typecheck`, `npm run lint`,
   `npm run build -w @revelio/bot` and run the bundle once to prove it boots.

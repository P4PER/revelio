# Deck Builder — Design

> **Status: LOCKED (brainstormed 2026-07-07).** Ready for `superpowers:writing-plans`.
> First user-facing *creation* feature (all prior work was browse/admin). Introduces
> the first user-owned domain entity (`decks`) alongside the existing `cards`
> reference data.

## Summary

A **deck builder** for the Harry Potter TCG. It works fully logged-out (build,
validate, export — but not save), and logged-in users can **save named decks**,
manage them from a **My Decks** page, and re-open them to edit. Every deck targets
one of two formats — **Classic** or **Revival** — which scopes the browsable card
pool and drives legality checks. Decks can be **exported and imported** as plain
text, JSON, or PNG (export only for PNG). Decks carry a `private`/`public`
`visibility` attribute now (column + toggle), but public browsing is deferred.

## Context: Classic vs Revival

Two community formats for the game, which map cleanly onto existing card data:

- **Classic** — the original WotC game (2001–2003). Card pool frozen to the **5
  official sets** (Base, Quidditch Cup, Diagon Alley, Adventures at Hogwarts,
  Chamber of Secrets) — exactly `sets.isOfficial = true`.
- **Revival** — the modern fan-run continuation. Keeps all official cards **plus
  the fan-made expansions**, governed by an active banned/restricted list. The
  existing `cards.legality` field (`legal` / `restricted` / `banned` / `unknown`)
  **is** that Revival ban list.

The Meilisearch index already exposes `isOfficial`, `legality`, and `setCode` as
filterable attributes, so the format toggle drives card filtering with existing
search infrastructure — no reindex or new index fields required.

### Deckbuilding rules (both formats)

- Exactly **1 starting Character** — a card of type `character` with a
  **Witch / Wizard** sub-type (both present in the data).
- Main deck **exactly 60** cards.
- Optional **sideboard, ≤ 15** cards.
- **≤ 4 copies** of any single card across main + sideboard, **except Lessons**
  (a card whose type is `lesson`), which are unlimited.
- **Classic**: every card must belong to an official set. **Revival**: no `banned`
  card may appear.

## Scope

**In scope**

- Two new tables: `decks` (user-owned) and `deck_cards` (character/main/sideboard rows).
- A pure **legality engine** in `@revelio/core` returning `legal | incomplete | illegal`
  plus a list of violations.
- Guest builder at `/decks/new` with **localStorage** persistence; on login, offer
  to save the working deck.
- Logged-in **My Decks** list (`/decks`) with rename / duplicate / delete /
  visibility toggle, and a saved-deck editor (`/decks/[id]`).
- Two-pane builder UI: Meilisearch-backed card browser (format-scoped) + deck panel
  (character slot, main grouped by lesson/type, sideboard) with quantity steppers.
- Hard-blocked copy limit at add time; live legality **status badge** with violations.
- **Export**: plain text, JSON, PNG. **Import**: plain text, JSON.
- `visibility` column (`private` default) + a UI toggle.

**Out of scope (deferred)**

- Public deck **browsing / sharing pages** (the `visibility` column is added now, but
  no read surface for other users' public decks yet).
- Deck cover images, descriptions, tags, folders.
- Collaborative editing, deck versioning/history, comments, likes.
- Playtesting / hand-draw simulation.

## Data model (`@revelio/db`)

Two new tables in `schema.ts` (under `--- core tables ---`), migration generated via
`npm run generate`.

```ts
export const decks = pgTable('decks', {
  id: text('id').primaryKey(),                 // cuid/nanoid, generated app-side
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),            // 'classic' | 'revival'
  visibility: text('visibility').notNull().default('private'), // 'private' | 'public'
  ...editable,                                 // createdAt / updatedAt / origin
}, (t) => ({ byUser: index('decks_user_id_idx').on(t.userId) }))

export const deckCards = pgTable('deck_cards', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  zone: text('zone').notNull(),                // 'character' | 'main' | 'sideboard'
  quantity: integer('quantity').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.deckId, t.cardId, t.zone] }) }))
```

Notes:
- `format`/`visibility`/`zone` are `text` (project convention — cf. `roles`, `origin`;
  the codebase uses **no** `pgEnum`). Allowed values are enforced by **Zod enums**, not a
  PG enum — matching the existing `z.enum(['machine', 'official'])` pattern in
  `localization-actions.ts`. The three enums are defined **centrally** in
  `@revelio/core` (`core/src/schemas.ts`) so the DB query layer, server actions, and UI
  share one source of truth:

  ```ts
  // core/src/schemas.ts
  export const DeckFormat     = z.enum(['classic', 'revival'])
  export const DeckVisibility = z.enum(['private', 'public'])
  export const DeckZone       = z.enum(['character', 'main', 'sideboard'])
  export type DeckFormat     = z.infer<typeof DeckFormat>
  export type DeckVisibility = z.infer<typeof DeckVisibility>
  export type DeckZone       = z.infer<typeof DeckZone>
  ```

  `deck-actions.ts` composes these into its `z.object({...})` write schema (as
  `set-actions.ts` etc. already do), and the legality engine's `DeckFormat`/`DeckZone`
  types below are these same exported types.

  Split by nature, matching the existing `schemas.ts` (Zod, runtime) vs `domain.ts`
  (pure DTO types, zod-free) separation: the **`z.enum` validators** live in
  `schemas.ts`; the **deck DTO shapes** live in `domain.ts` alongside `SetDTO`/`CardDTO`
  and import the format/zone types:

  ```ts
  // core/src/domain.ts
  export type DeckCardDTO = { cardId: string; zone: DeckZone; quantity: number }
  export type DeckDTO = {
    id: string
    name: string
    format: DeckFormat
    visibility: DeckVisibility
    cards: DeckCardDTO[]
    createdAt: string
    updatedAt: string
  }
  ```
- The PK `(deckId, cardId, zone)` lets the same card sit in both `main` and `sideboard`
  (their copies sum toward the 4-copy limit); `quantity` holds the per-zone count.
- The starting character is a `deck_cards` row with `zone = 'character'`, `quantity = 1`.
- **Legality is never stored** — always recomputed on display so it stays correct as
  the ban list evolves.

## Legality engine (`@revelio/core`, pure & unit-tested)

A single framework-agnostic module, no I/O — the natural home given `core`'s "no I/O"
rule and existing `attributes.ts`/`schemas.ts`.

```ts
// DeckFormat and DeckZone are the z.infer types exported from schemas.ts (above).
type DeckStatus = 'legal' | 'incomplete' | 'illegal'

// Minimal per-card facts the engine needs (supplied by caller from card data).
type DeckCardMeta = {
  id: string
  isOfficial: boolean
  legality: string | null          // 'legal' | 'restricted' | 'banned' | 'unknown'
  isLesson: boolean                // type includes 'lesson'
  isStartingCharacter: boolean     // type 'character' AND subtype witch/wizard
}

type DeckEntry = { cardId: string; zone: DeckZone; quantity: number }

type Violation =
  | { code: 'no_character' }
  | { code: 'multiple_characters' }
  | { code: 'invalid_character'; cardId: string }
  | { code: 'main_deck_size'; actual: number }        // != 60
  | { code: 'sideboard_too_large'; actual: number }   // > 15
  | { code: 'too_many_copies'; cardId: string; count: number }
  | { code: 'card_not_in_format'; cardId: string }    // Classic: non-official
  | { code: 'banned_card'; cardId: string }           // Revival: banned

function evaluateDeck(
  entries: DeckEntry[],
  format: DeckFormat,
  meta: Record<string, DeckCardMeta>,
): { status: DeckStatus; violations: Violation[] }
```

Status derivation:
- **`illegal`** if any hard-rule violation is present: `banned_card`,
  `card_not_in_format`, `too_many_copies`, `multiple_characters`,
  `invalid_character`, `sideboard_too_large`.
- **`incomplete`** if no hard violation but the deck isn't tournament-ready:
  `no_character` or `main_deck_size` (≠ 60).
- **`legal`** otherwise.

The **4-copy limit is also hard-blocked in the UI at add time** (steppers refuse the
5th copy; Lessons exempt), so `too_many_copies` mainly guards imports and edge cases.

## Web routes (`web`, under `[locale]`)

- **`/decks/new`** — the builder. **Guest-accessible.** Working deck persists in
  `localStorage` (`revelio.deck.draft`). On login while a draft exists, prompt to
  "Save this deck". Save button reads "Log in to save" for guests (links to login,
  preserving the draft).
- **`/decks`** — **My Decks** (auth required; guests see a login CTA). Grid/list of the
  user's decks: name, format, legality badge, card count; actions rename / duplicate /
  delete / visibility toggle / open.
- **`/decks/[id]`** — edit a saved deck. **Owner-only** (404/redirect otherwise);
  hydrates the same builder from the DB.

A nav entry (in the account menu / header) points to the builder and My Decks, following
the existing nav pattern.

## Builder UI (two-pane)

- **Left — card browser.** Reuses the existing Meilisearch search + `filter-drawer`
  filters, **scoped by format**: Classic → `isOfficial = true`; Revival → all sets, with
  `banned` cards visibly flagged (and blocked from being added). Cards are added via
  click or a +/– stepper.
- **Right — the deck.** A Character slot, the Main deck grouped by lesson/type with
  quantity steppers and a running count (`N / 60`), and a Sideboard section (`N / 15`).
- **Header.** Editable deck name; **Classic/Revival** toggle; a **legality badge**
  (`Legal` / `Incomplete` / `Illegal`) whose tooltip lists violations; **Save** (or
  "Log in to save"); **Export** and **Import** menus.
- Switching format re-scopes the browser **and** re-evaluates the current deck, flagging
  any card that is now out-of-format or banned.

Client state is a plain in-memory deck model (character / main / sideboard maps),
serialized to `localStorage` for guests and to the DB (via server actions) for saved decks.

## Export / Import

Pure formatters + parsers live in `@revelio/core` (`deck-io.ts`); anything needing card
lookup (text-name resolution) is done in the web layer against the DB.

**Export**
- **Text** — grouped, human-readable: a Character line, Main deck grouped by lesson/type
  as `4x Accio (DA)`, then a Sideboard section. Copy-to-clipboard + `.txt` download.
- **JSON** — canonical shape `{ name, format, character, main: [{cardId, quantity}],
  sideboard: [...] }`; the same schema import consumes (round-trips).
- **PNG** — rendered deck sheet as an image (client-side canvas/DOM-to-image). Heaviest;
  built **last** as its own phase and export-only.

**Import** (populates the working builder)
- **JSON** — parse the canonical shape, validate each `cardId` exists (+ that it's in the
  chosen/target format), load into the builder.
- **Text** — parse lines like `4x Accio (DA)` / `4 Accio`; resolve by name (+ optional set
  code) against the DB. **Unresolved or ambiguous lines are surfaced to the user**, never
  silently dropped.
- Import is an action in the builder (paste box / file upload). Pure line/JSON parsing in
  `core`; name→card resolution is a DB-backed lookup in web.

## Write path (`web` + `db`)

- **`@revelio/db/queries.ts`**: `listDecksByUser`, `getDeckById` (with `deck_cards`),
  `createDeck`, `updateDeck` (replace name/format/visibility + card rows), `deleteDeck`,
  and a `resolveCardsByName` helper for text import.
- **`src/lib/deck-actions.ts`** (`'use server'`): `createDeckAction`, `updateDeckAction`,
  `deleteDeckAction`, `duplicateDeckAction`, all gated on session **ownership** (the
  acting user must own the deck), with Zod-validated input. No secrets to the client.

## Testing

- **`core`**: `evaluateDeck` unit tests across the status matrix (no character, 59/60/61
  cards, 5 copies vs 5 Lessons, banned card in Revival, fan card in Classic, oversize
  sideboard); `deck-io` round-trip (export→import→export) and text-parse edge cases.
- **`db`**: Testcontainers CRUD for the deck queries incl. cascade delete and card-row
  replacement.
- **`web`**: server-action ownership/authz guards; builder reducer (add/remove, copy-limit
  block, format switch re-eval); guest localStorage persistence.

## Phasing (for the plan)

1. **DB** — `decks` + `deck_cards` tables, migration, queries (+ tests).
2. **Core** — legality engine + `deck-io` export/parse (pure, fully tested).
3. **Builder UI** — two-pane builder, format-scoped browser, guest localStorage.
4. **Save & manage** — deck server actions, `/decks` list, `/decks/[id]` editor.
5. **Export/Import** — text + JSON wired into the builder (uses phase 2).
6. **PNG export** — rendered deck sheet (last, isolated).

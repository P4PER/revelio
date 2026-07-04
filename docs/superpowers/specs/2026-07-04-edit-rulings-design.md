# Edit Rulings (Plan 4b-4) — Design

> Fourth editing slice of **Plan 4b (Authoring + Auth)**. Builds on the editor-gated `/card/[id]/edit` page (4b-2/4b-3): its language switcher, `getCardById`, `requireRole('editor')`, `AutoTextarea`, and toast feedback.

## Goal

Let editors manage a card's list of rulings — add, remove, reorder entries, and edit each entry's `date`, `source`, and localized `text` — as a section on the existing edit page.

## Data facts (verified)

- `card_rulings`: PK `(cardId, seq)`; columns `date` (text, ISO `YYYY-MM-DD`), `source` (text, free e.g. "POJO"/"Revival"), `text` (jsonb = `Record<lang, string>`), plus the shared `...editable` (`origin` default `import`, `createdAt`, `updatedAt`). 325 rulings across 201 cards.
- **`text` is multilingual within one row; `date`/`source` are shared across languages** (plain columns). In the current data only `en` text exists.
- `RulingDTO` already exists: `{ seq, date, source, text: Record<string,string> }`, exposed by `getCardById`.

## Decisions

- **Where:** a **Rulings section on the existing `/card/[id]/edit` page**, below the localization form, sharing that page's `?lang` language switcher.
- **Language:** one language at a time (the shared switcher). Each ruling's text input binds to `text[lang]`; `date`/`source` are shared (edited in any language view).
- **Save model:** **replace-the-set** — one action deletes the card's rulings and re-inserts the submitted list.

## The key mechanism: preserve other languages without DB merge

Because the editor shows only one language but the save replaces the whole set, other languages' text must not be lost. Solution: **each form row carries the full `text` object** (`Record<lang,string>`, seeded from the DTO). The input binds to `text[lang]`; typing updates only that key. On submit each row sends its full `text` object, so `replaceRulings` can store it verbatim — no load-and-merge in the action, and reordering/removing rows can't drop another language's text.

## Architecture

- **`@revelio/db` → `replaceRulings(db, cardId, rulings)`**: in a transaction, `delete from card_rulings where card_id = cardId`, then insert each row with `seq = index`, `origin: 'user'`, `updatedAt = now`. Input rows: `{ date: string | null; source: string | null; text: Record<string,string> }[]`. Fully-empty rows (no date, no source, no text in any language) are dropped before insert.
- **`app/web` server action `replaceRulingsAction(input)`**: `'use server'`, `await requireRole('editor')`, Zod-validate, call `replaceRulings`, `revalidatePath('/card/{id}')` + the edit path. Returns the existing `SaveResult` shape (`{ ok: true } | { ok: false; error }`). No reindex (rulings aren't in the search document).
- **`RulingsEditor` client component** (rendered as a section on the edit page): a list of bordered ruling cards; add / remove / move-up / move-down; its own "Save rulings" button + toast. Seeded from `card.rulings` and the active `lang`.

## UI (bordered cards — chosen)

Heading "Rulings" with an "Add" button. Each ruling is a bordered card: `date` and `source` inputs inline on the top row, the localized `text` (`AutoTextarea`) below, and move-up / move-down / delete controls in the card's top-right. Order in the list is the saved `seq`. A "Save rulings" button below the list; success/failure shown via a sonner toast. Matches the bordered adventure/match section's visual style.

## Error handling / validation

- Zod: `rulings` is an array of `{ date: string, source: string, text: record<string,string> }`; empty strings for date/source normalize to `null`. No required fields — empty rows are dropped on save.
- Authorization: `requireRole('editor')` in the action; the edit page is already editor-gated (non-editors get `notFound()`).
- Reorder via move-up/down buttons (no drag-and-drop dependency).
- Switching language (a `Link` navigation) reloads the page and re-seeds — unsaved ruling edits are lost, consistent with the localization form's existing behavior.

## Testing

- `replaceRulings` (integration, real Postgres): replaces the set; assigns `seq` by order; sets `origin:'user'` + `updatedAt`; drops fully-empty rows; a row carrying a full multilingual `text` round-trips (other languages preserved).
- Action: gated (non-editor rejected); empty rows dropped; returns ok.
- `RulingsEditor`: add appends a row; remove drops it; move-up/down reorders; typing in the text field updates only `text[lang]` (other languages in the row's object untouched); submit sends the full rows.

## Scope

- **IN:** rulings list editor (date/source/text-per-language), add/remove/reorder, replace-the-set save with provenance, on the edit page.
- **OUT (later):** images (4b-5); making rulings searchable; drag-and-drop reordering; per-ruling multi-language side-by-side editing.

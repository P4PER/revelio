# Edit Rulings (Plan 4b-4) — Design

> Fourth editing slice of **Plan 4b (Authoring + Auth)**. Builds on the editor-gated `/card/[id]/edit` page (4b-2/4b-3): its language switcher, `getCardById`, `requireRole('editor')`, `AutoTextarea`, and toast feedback. This slice also **normalizes the rulings schema** first (a data-layer refactor).

## Goal

Let editors manage a card's list of rulings — add, remove, reorder entries, and edit each entry's `date`, `source`, and the localized `text` for the active language — as a section on the existing edit page. Editing one language never affects another.

## Schema change (normalize rulings) — decided

Today `card_rulings` PK `(cardId, seq)` stores `text` as jsonb `Record<lang,string>`, with `date`/`source` as shared columns. That forces a "carry the full text object per row" workaround when editing one language. We normalize into a parent + per-language child, with a **stable surrogate id** so reordering (which changes `seq`) never disturbs the language texts:

- **`card_rulings`** (parent — the language-independent ruling entity):
  - `id` text **PK** (surrogate; ingest assigns deterministically as `` `${cardId}-r${i}` ``)
  - `cardId` text, FK → `cards.id` (ON DELETE CASCADE), indexed
  - `seq` integer (ordering only — no longer identity)
  - `date` text (ISO `YYYY-MM-DD`), `source` text
  - `...editable` (`origin`, `createdAt`, `updatedAt`)
  - (the old composite PK and the `text` jsonb column are removed)
- **`card_ruling_texts`** (child — one row per language):
  - `rulingId` text, FK → `card_rulings.id` (ON DELETE CASCADE)
  - `lang` text
  - `text` text (not null)
  - **PK `(rulingId, lang)`**

`RulingDTO` gains `id`: `{ id: string; seq: number; date: string | null; source: string | null; text: Record<string,string> }`. `getCardById` assembles `text` by joining the child rows. The public detail page is unaffected (it reads `RulingDTO.text[locale]` as before).

This requires: schema edit → **regenerate the consolidated migration** → **fresh DB / re-seed** (the project's existing pattern; data re-seeds from source) → rewrite the rulings ingest. (Superseded by Plan 5a — migrations are now incremental; see docs/MIGRATIONS.md.)

## Why this eliminates the workaround

The editor edits one language. On save, only that language's child row `(rulingId, lang)` is upserted; other languages' child rows are never touched → preserved by construction. No full-text-per-row carry.

## Architecture

- **Ingest** (`app/ingest/src/load-cards.ts`): build parent rows `{ id: `${cardId}-r${i}`, cardId, seq: i, date, source }` and child text rows `{ rulingId: `${cardId}-r${i}`, lang: c.defaultLanguage, text: r.ruling }` (child only when `r.ruling` is non-empty). Insert both (parents first).
- **`@revelio/db` → `getCardById`**: load `card_rulings` (ordered by `seq`) + their `card_ruling_texts`; map to `RulingDTO[]` with `id` and `text` as a `Record<lang,string>`.
- **`@revelio/db` → `saveRulings(db, cardId, lang, rows)`** (transaction). `rows: { id: string | null; date: string | null; source: string | null; text: string }[]` (text = the active language). Logic:
  - Drop fully-empty rows first (no `date`, no `source`, empty `text`).
  - Load existing ruling ids for `cardId`.
  - For each row in order (index → `seq`):
    - **id present** → update the parent (`date`, `source`, `seq`, `origin:'user'`, `updatedAt`); if `text` non-empty upsert `(id, lang)` child, else delete that `(id, lang)` child. Other-language children untouched.
    - **id null** (new) → insert a parent with a fresh id (`` `${cardId}-r${crypto.randomUUID()}` `` or a monotonic suffix), insert the `(newId, lang)` child if `text` non-empty.
  - Delete existing rulings whose id is absent from the submitted set (cascade removes their child texts).
- **`app/web` server action `saveRulingsAction(input)`**: `'use server'`, `await requireRole('editor')`, Zod-validate, call `saveRulings`, `revalidatePath('/card/{id}')` + the edit path. Returns the existing `SaveResult` shape. **No reindex** (rulings aren't in the search document).
- **`RulingsEditor` client component** — a section on the edit page below the localization form: a list of bordered ruling cards seeded from `card.rulings` + the active `lang`; add / remove / move-up / move-down; its own "Save rulings" button + toast.

## UI (bordered cards — chosen)

Heading "Rulings" with an "Add" button. Each ruling is a bordered card: `date` and `source` inputs inline on the top row; the active-language `text` (`AutoTextarea`) below; move-up / move-down / delete controls in the card's top-right. List order is the saved `seq`. A "Save rulings" button below the list; success/failure via a sonner toast. Matches the bordered adventure/match section's style. Reorder via move buttons (no drag-and-drop dependency).

## Error handling / validation

- Zod: `cardId` non-empty; `lang` ∈ routing.locales; `rulings` an array of `{ id: string | null, date: string, source: string, text: string }`; empty date/source → `null`.
- Authorization: `requireRole('editor')` in the action; the edit page is already editor-gated.
- Switching language (a `Link` navigation) reloads the page and re-seeds — unsaved ruling edits are lost, consistent with the localization form.

## Testing

- **DB (integration, real Postgres):** `saveRulings` — inserts new rows (ids assigned, `seq` by order, `origin:'user'`); updates existing by id; **deletes removed** rulings (cascade drops child texts); **preserves other languages** (editing `en` text leaves a seeded `de` child intact); drops fully-empty rows; empty `text` deletes only that language's child. `getCardById` assembles `RulingDTO` (with `id`) from parent+child.
- **Action:** gated (non-editor rejected); returns ok; empty rows dropped.
- **`RulingsEditor`:** add appends a row; remove drops it; move-up/down reorders; typing edits only the active language's field; submit sends rows with their ids.

## Scope

- **IN:** normalize the rulings schema (parent + per-language child, surrogate id) incl. ingest + `getCardById`; the rulings list editor (date/source/text-per-language, add/remove/reorder) on the edit page; diff-based `saveRulings` with provenance.
- **OUT (later):** images (4b-5); making rulings searchable; drag-and-drop reordering; side-by-side multi-language ruling editing.

# Edit Adventure/Match Fields (Plan 4b-3) — Design

> Third editing slice of **Plan 4b (Authoring + Auth)**. Builds directly on 4b-2 (edit translations): the editor-gated `/card/[id]/edit` page, the `updateLocalization` server action, `upsertLocalization`, and the per-language `LocalizationForm`. This slice extends them; it does not add a new editor.

## Goal

Let editors edit the structured `adventure` / `match` text of a card's localization, per language, inside the existing edit form. The fields appear only for the relevant card type.

## Data facts (verified)

- `card_localizations.adventure` (jsonb) is a flat object `{ effect, reward, toSolve }` — 73 cards, both `en` and `de`.
- `card_localizations.match` (jsonb) is a flat object `{ prize, toWin }` — 15 cards, both `en` and `de`.
- Detection is deterministic by **card type**: adventure data ⟺ the card has type `adventure`; match data ⟺ type `match`. (Confirmed 1:1 in the data.)
- Both live on `card_localizations` (per language), same table as name/text/flavor/status — so they extend the existing per-language form + `updateLocalization`, no new action/table.

## Architecture

One save writes name/text/flavor/status **and** adventure/match together via the existing `updateLocalization` action. No new editor, no new reindex path.

## Fields & display

- Conditionally rendered by card type (the edit page already loads `card.types` via `getCardById`):
  - type `adventure` → an "Adventure" section: three textareas **effect · reward · toSolve**
  - type `match` → a "Match" section: two textareas **prize · toWin**
  - other cards → nothing (form unchanged)
- All fields are **optional strings**, per language.

### UI layout (chosen)

The adventure/match fields render as a **bordered section** (a `fieldset`-style box with a rounded border) with a heading ("Adventure" / "Match"), placed in the form **after the Flavor field and before Status** — grouping the structured data and visually setting it apart from the free-text Name/Text/Flavor. Each sub-field is a labeled textarea inside the box (Adventure: Effect / Reward / To solve; Match: Prize / To win). Labels come from the `edit` i18n namespace.

## Data / write-back

- Extend `upsertLocalization` with optional `adventure?: { effect, reward, toSolve } | null` and `match?: { prize, toWin } | null` (jsonb columns). Storage rule: if all sub-fields of a group are empty → store `null` (not an empty object); otherwise store the object. `origin: 'user'` / `updated_at` as before.
- The action writes **only** the field matching the card type (an adventure card writes only `adventure`), so the other jsonb is never accidentally set.

## Search / reindex

- adventure/match are NOT part of the search document (`buildCardDocument` indexes only name/text/flavor) → **no new reindex needed**. The existing non-fatal reindex still runs (name/text remain the source); no new path.

## Validation / errors

- Zod: `adventure` / `match` optional; their sub-fields optional strings, empty→null normalization. The existing "name required" guard stays.

## Testing

- `upsertLocalization` writes and nulls adventure/match correctly (integration, real Postgres).
- Action: an adventure card saves only `adventure`; all-empty sub-fields → `null`.
- Form: the Adventure section renders only for type `adventure`, Match only for `match`; the dirty check includes adventure/match.

## Scope

- **IN:** adventure/match text fields in the editor (per language, type-gated), write-back with provenance.
- **OUT (later slices):** rulings (4b-4), images (4b-5), making adventure/match searchable.

---

## Next slices (captured now, designed later)

Recorded so the research isn't lost; each gets its own spec → plan → implementation.

### 4b-4 — Edit rulings

- **Data:** table `card_rulings`, PK `(cardId, seq)`, columns `date` (text), `source` (text), `text` (jsonb = `Record<lang, string>` — multilingual *within one entry*), plus `...editable`. 325 rulings across 201 cards.
- **Editing model (different from the localization form):** a card has a **list** of ruling entries; editing means add / remove / reorder (seq) entries, and per entry edit `date`, `source`, and the text for each language. Because the text is `Record<lang,string>`, one entry holds all languages — so this is NOT the per-single-language form; it needs a repeatable-rows editor with a language field (or side-by-side language inputs) per entry.
- **Approach:** its own server action (e.g. `replaceRulings(cardId, entries)` — replace-the-set is simplest given the small counts), its own component, editor-gated. Rulings are not in the search document → no reindex. Own slice.

### 4b-5 — Edit / upload card images

- **Data:** `card_localizations.image_file` / `image_url` (per language); the actual image lives in MinIO/S3. Bulk ingest uploads via `S3_ENDPOINT` (see `app/ingest`).
- **Separate subsystem:** upload a new file from the web → write to MinIO/S3 (needs a write-capable S3 client, server-side; multipart handling; type/size validation; a preview) → update `image_file`/`image_url`. `image_file` IS in the search document, so an image change re-indexes the card.
- **Approach:** a server action/route that accepts an upload, stores it under the card's key, updates the localization, and reindexes. Own slice; touches storage config (the current compose doesn't publish MinIO to the host — see [[plan-4b2-edit-translations-done]]).

# Form Validation with Inline Errors — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation plan
**Area:** `app/web` — forms & inputs (incl. new deck-builder features)

## Problem

Across the web app, form validation and error surfacing are inconsistent and
user-hostile:

- No form library and no shadcn `Form` primitive exist. Every form wires field
  state manually with `useState`.
- The **only** inline textual error in the entire app is a single form-level
  `<p className="text-destructive">` in `auth-form.tsx`. Everything else surfaces
  errors as `sonner` toasts (or, in the deck import dialog, ad-hoc inline lists).
- Toasts collapse distinct server error codes (`invalid`, `exists`, `type`,
  `size`, `usernameTaken`, `emptyInput`, `invalidJson`, `noLines`) into generic
  messages, so the user is never told **which field** is wrong or **why**.
- The shadcn primitives (`Input`, `Select`, `Checkbox`, `Button`) already carry
  `aria-invalid:*` destructive styling that is currently dormant because
  `aria-invalid` is never set.

**Goal:** every relevant form validates properly and shows errors **directly
under the offending input** — especially for missing required fields — with
consistent styling, accessibility, and i18n.

## Decisions (locked)

- **Two-tier approach:**
  - **Classic forms** (Auth, Set create/edit, Localization, Rulings) → migrate to
    `react-hook-form` + `@hookform/resolvers` (zod) + a new shadcn `ui/form.tsx`.
  - **Deck / non-classic inputs** (deck import, deck-list rename, filter cost
    range) → keep their existing bespoke state; add targeted inline validation
    via a shared **`FieldError`** component + zod checks. **Not** migrated to RHF
    (import = paste/parse, rename = inline edit, filter = draft state — RHF is a
    poor fit).
- **Timing (RHF forms):** validate on submit, then re-validate live while the
  user corrects (`mode: 'onSubmit'`, `reValidateMode: 'onChange'`).
- **No shadcn primitive rework needed:** the deck features already use shadcn
  (`Sheet`, `Input`, `Select`, `DropdownMenu`, `AutoTextarea`); the format/
  visibility segmented controls and sr-only file inputs are intentional and stay.
  No `ui/dialog.tsx` needed (everything modal-ish uses `Sheet`/`DropdownMenu`).
- **Scope (in):** Auth, Set create/edit, Localization, Rulings, image/symbol
  uploaders, filter cost-range (now in `filter-sheet.tsx`), deck import dialog,
  deck-list rename.
- **Scope (out):** search / URL-state inputs (home/header search, sort, deck-card
  browser search); deck export menu (no inputs); deck-card quantity steppers
  (bounded by `+`/`-`, no free text).
- **Rulings row rule:** a ruling row requires `text` **and** `source` **and**
  `date` — errors under each missing field of the row.
- **Sub-Type translation matrix:** **not** migrated to RHF (hundreds of fields,
  no required fields). Only its save-error handling is made consistent. No new
  per-field required rules.
- **Deck name:** keep the current **auto-name fallback** (empty name → placeholder
  text). No required rule, no inline error on the deck name field.

## Architecture

### 1. Foundation primitives

- **Dependencies:** add `react-hook-form` and `@hookform/resolvers` to
  `app/web/package.json`.
- **`app/web/src/components/ui/form.tsx`** — the canonical shadcn Form set:
  `Form` (re-export of `FormProvider`), `FormField` (wraps `Controller` +
  field-name context), `FormItem`, `FormLabel`, `FormControl`, `FormDescription`,
  `FormMessage`, and the `useFormField` hook.
  - `FormControl` renders via Radix `Slot` and wires `id`, `aria-describedby`,
    and `aria-invalid` automatically — composes with `Input`, `AutoTextarea`,
    `Select`, `Checkbox`, and `DatePicker`.
  - `FormMessage` renders the active field error as
    `<p className="text-destructive text-sm">` **directly under** the control.
- **`app/web/src/components/ui/field-error.tsx`** (`FieldError`) — a tiny
  presentational component with identical styling to `FormMessage`, used by the
  non-RHF cases (uploaders, deck import, deck-list rename, filter cost range) so
  errors look identical everywhere. Renders nothing when its `message` is empty.

### 2. Shared schemas (single source for client + server)

The zod schemas currently live *inside* each server action. Extract the
classic-form ones into shared modules under `app/web/src/lib/schemas/` as
**factory functions** `makeXSchema(t)` that embed translated (next-intl)
messages:

- Both the client (RHF `zodResolver`) and the server action import the same
  factory. The server action stays authoritative (defense in depth) — it keeps
  calling `safeParse`.
- Schemas stay in `web` (not `@revelio/core`) because they depend on
  `routing.locales` from next-intl, which is web-specific.
- Error **codes** returned by actions (`exists`, `usernameTaken`, `type`,
  `size`, …) remain the mapping key from server result → specific field.
- Deck / filter inputs reuse the small zod checks inline (no factory needed);
  `deck-actions.writeSchema` stays as-is.

### 3. Error channels

- **Field/validation errors → under the input** via `FormMessage` (RHF) or
  `FieldError` (uploaders / deck import / rename / filter).
- **Server error codes → specific field** via `form.setError(field, { message })`
  (RHF) or local error state (non-RHF):
  - `exists` → `code` field (set form)
  - `usernameTaken` → username field, `noAccount` → email field (auth)
  - `type` / `size` → dropzone (uploaders)
  - `emptyInput` / `invalidJson` / `noLines` → under the paste textarea (deck import)
- **Toasts (`sonner`) stay**, but only for **success** and genuine non-field
  errors (reindex warning, save/network failure, export copy failure).
  Validation and field errors no longer use toasts.
- **i18n:** add a `validation.*` message group to `en.json` / `de.json`
  (`required`, `email`, `usernameTaken`, `noAccount`, `codeExists`, `fileType`,
  `fileSize`, `costRange`, `sixDigits`, …). Existing deck import message keys
  (`import.emptyInput`, `import.invalidJson`, `import.noLines`) are reused,
  moved from toast to inline.

## Forms in detail

### Classic forms (RHF + shadcn Form)

| Form | File(s) | Inline rules |
|---|---|---|
| **Auth** | `components/auth-form.tsx` | email required + email format; username (register) required + length + `usernameTaken`; OTP required + exactly 6 digits; `noAccount` under email. Replaces the single form-level `<p>` with per-field `FormMessage`; a form-level "root" error remains for generic send failures. |
| **Set create/edit** | `components/set-form.tsx` (+ `lib/set-actions.ts`) | `code` (create only) required + pattern; server `exists` → under `code`. `name` required (min 1). `releaseDate`/localizations optional. Convert the `<div>`+`onClick` to a real `<form onSubmit={handleSubmit}>`. |
| **Localization** | `components/localization-form.tsx` (+ `lib/localization-actions.ts`) | `name` required (min 1) → under the name field instead of the current generic toast. Works standalone and `embedded` (ref `save()` returns validity). |
| **Rulings editor** | `components/rulings-editor.tsx` (+ `lib/rulings-actions.ts`) | RHF `useFieldArray`. Per row: `text` **and** `source` **and** `date` required; error under each missing field. Every present row must be complete. |

### Non-classic inputs (bespoke state + `FieldError`)

| Input | File(s) | Inline rules |
|---|---|---|
| **Image / Symbol uploader** | `components/image-uploader.tsx`, `components/set-symbol-uploader.tsx` | Client-side type + size (>5 MB) check **before** upload; error under the dropzone via `FieldError`; server `type`/`size` errors mapped inline instead of generic toast. |
| **Deck import dialog** | `components/deck-import-dialog.tsx` | Move `emptyInput` / `invalidJson` / `noLines` from toast to `FieldError` under the paste textarea. Keep the existing `unparsed` / `unresolved` inline alert blocks. File input keeps `accept=".txt,.json"`; wrong-type feedback shown inline. |
| **Deck-list rename** | `components/deck-list.tsx` | Empty / unchanged name currently cancels silently — keep that, but surface a `FieldError` when the rename **server** call fails, next to the inline input, instead of only a toast. |
| **Filter cost range** | `components/filter-sheet.tsx` | `FieldError` hint under the cost group when `costMin > costMax`; block "Apply" while inverted. Shared by both the search filter and the deck-card-browser filter. |

### Explicitly unchanged

- **Deck name** field (`components/deck-builder.tsx`) — keeps the auto-name
  fallback; no required rule.
- Search / URL-state inputs (`home-search`, `header-search`, `search-box`,
  `deck-card-browser` search, `sort-select`).
- Deck export menu, quantity steppers, format/visibility segmented controls.
- **Sub-Type matrix** (`components/subtype-translations-form.tsx`) — no new
  required rules; only save-error surfacing kept consistent.

## Integration with Server Actions

RHF forms submit through `handleSubmit(onValid)`, where `onValid` calls the
Server Action. The action still `safeParse`s (authoritative). On a typed error
code the client calls `form.setError` to land the message on the correct field;
unexpected/non-field failures fall back to a form-level root error or a toast.
Success keeps its toast. Non-RHF inputs do the same mapping with local state.

## Testing

Each touched form gets new/updated vitest + testing-library tests:

- Submit empty → assert the error text is rendered under the correct field
  (queryable via label/role association and `aria-invalid`).
- Correct the field → the error clears (live re-validation, RHF forms).
- Server returns a typed error code → assert it lands on the correct field.
- Uploaders: wrong MIME / >5 MB file → inline error under dropzone.
- Deck import: empty input / invalid JSON / no valid lines → inline error under
  the textarea (not a toast); existing `unparsed`/`unresolved` tests preserved.
- Filter: `costMin > costMax` → inline hint, Apply blocked.

Existing tests (`auth-form.test.tsx`, `admin-sets-table.test.tsx`, localization,
rulings, `deck-*` tests) are updated to the new markup/assertions.

## Implementation units (isolated, ordered)

1. **Foundation** — deps, `ui/form.tsx`, `ui/field-error.tsx`,
   `validation.*` i18n keys, extract shared schema factories.
2. **Auth form** migration (RHF).
3. **Set form** migration (RHF, + `exists` → field mapping).
4. **Localization form** migration (RHF).
5. **Rulings editor** migration (RHF `useFieldArray`, per-row required).
6. **Uploaders** inline errors (type/size).
7. **Deck import dialog** — toast → inline errors.
8. **Filter cost-range** (`filter-sheet`) — inline min>max error + Apply guard.
9. **Deck-list rename** — inline server-error surfacing.
10. **Sub-Type** — minimal error-surface consistency only.

Each unit ships with its tests and leaves the app green (`npm test`,
`npm run typecheck`, `npm run lint -w web`).

## Out of scope / YAGNI

- No migration of search / sort / URL-state inputs.
- No promotion of schemas to `@revelio/core`.
- No new required rules on the sub-type matrix or the deck name.
- No `ui/dialog.tsx` / hand-rolled-modal replacement (none exist).
- No RHF migration of deck builder, deck import, or rename.
- No redesign of visual styling beyond activating the existing `aria-invalid`
  destructive treatment.

# Control-Size Standard — Design

**Date:** 2026-07-28
**Status:** Approved, pending implementation
**Scope:** Web workspace (`app/web`) — buttons, inputs, selects, textareas, filter chips, tabs.

## Problem

The shadcn primitives define a clean size scale, but application code overrides
it inconsistently, so **five competing control heights are live at once** with no
rule mapping context to size. Every author picks a height by eye.

Current de-facto heights:

| Height | Token | Where |
|--------|-------|-------|
| 24px | `h-6` (button `xs`) | tiny icon buttons |
| 28px | `h-7` | filter chips (`sm`), deck-panel steppers — *not a primitive token* |
| 32px | `h-8` (button/select `sm`, tabs) | toolbars, header search, admin table inputs |
| 36px | `h-9` (**default** for button/input/select) | most controls, date-picker, page search |
| 40px | `h-10` (button `lg`) | auth form inputs+buttons, contact form inputs+buttons |

Concrete inconsistencies:

1. **Forms disagree on the baseline.** `auth-form.tsx` and `contact-form.tsx`
   force inputs to `h-10` and buttons to `size="lg"` (40px); the card editor,
   admin, and subtype forms use 32–36px. No rule says which applies where.
2. **Search inputs vary:** header search is `h-8`; deck-browse and collection
   search are `h-9`.
3. **`h-7` chips/steppers** are hand-rolled heights with no matching button
   token, so they can't stay in sync.
4. **Admin table inputs** hard-code `h-8`, diverging from the `h-9` input default.

The root cause is not the primitives — it is the missing **context → size** rule.

## The tier system

Three density tiers, mapped onto shadcn's existing `sm` / `default` / `lg` size
vocabulary. The tier becomes a real `size` prop on every form control, never a
hand-typed height class.

| Tier | `size` prop | Height | Text | Use for |
|------|-------------|--------|------|---------|
| **Compact** | `sm` | 32px (`h-8`) | `text-sm` | dense contexts — data tables, inline toolbars (incl. the site header), filter chips, tabs |
| **Default** | `default` | 36px (`h-9`) | `text-sm` | the norm — page controls, page/section search, editor & admin form fields |
| **Comfortable** | `lg` | 40px (`h-10`) | `text-base` | standalone forms that *are* the page's primary task — auth (login/register), contact |

**Governing rule — a control inherits the density of its container.** Everything
in one row / toolbar / form shares a single tier. Pick the tier from the context,
not per-control by eye.

Icon buttons use the parallel scale already present in `button.tsx`:
`icon-sm` / `icon` / `icon-lg` = 32 / 36 / 40, with `icon-xs` = 24 for truly tiny
affordances. The 24px `xs` text button remains available for micro-affordances but
sits **below** the three main tiers and is not part of the standard density map.

## Primitive changes

Make the tiers enforceable in code so a call-site expresses intent (`size="lg"`),
not a magic number (`className="h-10"`).

1. **`Input`** — add a `size` variant `sm | default | lg`:
   - `sm` → `h-8`, `text-sm`, `px-2.5`
   - `default` → `h-9` (current behavior, unchanged), `px-3`
   - `lg` → `h-10`, `text-base` (i.e. `md:text-base` to keep the current
     responsive behavior auth hand-rolls), `px-3`
   - Default variant stays `default`, so existing `<Input>` call-sites are
     unaffected.
2. **`SelectTrigger`** — add `lg` (h-10) alongside the existing `sm | default`.
3. **`AutoTextarea`** — add a `size` prop that drives padding/text only (height
   still auto-grows): `lg` → `text-base`, matching a comfortable form. Default
   unchanged.
4. **`Button` / `Tabs` / `Badge` / `Checkbox`** — no new tokens. Button's
   `sm/default/lg` already *are* the three tiers; this is documented, not changed.

Variant text/padding values follow the existing shadcn button rhythm and the
current input styling; they are intentionally modest so the visual change is
limited to height alignment, not a restyle.

## Call-site refactors

| File | Change |
|------|--------|
| `auth-form.tsx` | inputs `className="h-10 md:text-base"` → `size="lg"` (buttons already `size="lg"`) |
| `contact-form.tsx` | inputs `className="h-10"` → `size="lg"`; `AutoTextarea` → `size="lg"` (button already `lg`) |
| `admin-sets-table.tsx` | filter input `className="h-8 w-full pr-8"` → `size="sm"` + keep `w-full pr-8` |
| `admin-users-table.tsx` | filter input `className="h-8 w-full pr-8"` → `size="sm"` + keep `w-full pr-8` |
| `subtype-translations-form.tsx` | input `className="h-8 w-full pr-8"` → `size="sm"` + keep `w-full pr-8` |
| `deck-browse.tsx` | drop redundant `h-9` on search input and selects (default already h-9) |
| `collection-view.tsx` | `SearchBox` drop `h-9` (default); drop `h-9` TabsList override |
| `lesson-filter-chips.tsx` | `h-7` (28px) → compact `h-8`, removing the orphan 28px height |

`search-box.tsx` needs no change itself — it forwards `className`; call-sites stop
passing heights so it renders at the `Input` default (36px), except where a
compact container overrides via the standard.

## Deliberate exceptions (documented, not "fixed")

- **`header-search.tsx`** stays compact (`h-8`) to match the compact header nav
  row (container-density rule), overriding the "page search = 36px" default.
- **Tabs** standardize at compact 32px; `collection-view.tsx`'s `h-9` TabsList
  override is dropped.
- **`deck-panel.tsx` quantity steppers** (`h-7 w-6`) — bespoke, non-square
  micro-control; left as-is and noted here so it is not mistaken for drift.

## Verification

- `npm run typecheck` green across workspaces.
- `npm test -w web` green — existing auth, contact, and search-box tests must
  pass unchanged (auth/contact tests query by label; search-box test does not
  assert height).
- Manual visual pass: login, register, contact, admin sets/users tables, site
  header, deck-browse, collection view.

## Out of scope

- No restyling beyond height/text alignment (colors, radii, variants untouched).
- No new component library or design-token infrastructure; this reuses the
  existing shadcn `size` prop convention.
- `card-data/`, `ingest`, and non-web workspaces are unaffected.

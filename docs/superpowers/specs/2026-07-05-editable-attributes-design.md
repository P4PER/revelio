# Editable Attributes (DB as source of truth) — Design Proposal

> **Status: PROPOSAL — not yet designed.** This records the decision taken during
> the 2026-07-05 lesson-cost work to eventually make attribute metadata
> DB-driven and editable. It captures the current state and the open questions,
> but the concrete design must be locked via a `superpowers:brainstorming` pass
> before a plan is written.

## Motivation

The lesson-cost feature (lesson symbol + cost pip beside the card name) surfaced
that attribute metadata lives in **three** places with a one-way authority:

- **Code constants** — `app/core/src/attributes.ts` hardcodes `TYPES`,
  `LESSONS` (with `color`), `RARITIES`, `FINISHES`, `LEGALITIES`.
- **Static label JSON** — `app/web/src/i18n/attribute-labels/{en,de}.json`, read
  by `attrLabel()` (the live label path).
- **Derived DB seed** — the reference tables (`types`, `sub_types`, `lessons`,
  `rarities`, `finishes`, `legalities`) are seeded from the constants + label
  files by `ingest/src/load-attributes.ts`, but the web app **never reads
  attribute rows back from the DB**.

For the frozen 2001 HP-TCG vocabulary this is defensible (see the decision below).
It becomes worth inverting **only if** we want attributes (colors, localized
labels, sort order, the lesson icon) to be **live-editable in the admin**, the
same way card localizations, rulings, and images already are.

## Decision context (2026-07-05)

Two follow-ups were agreed after the lesson-cost feature:

- **(a) — done on `feat/lesson-cost-icons`:** remove the now-dead `lessons.color`
  plumbing. Nothing rendered `lessonColor` anymore (the icon carries its colour
  in the SVG), so the column + the `lessonColor` field on the search
  document/`CardIndexData` + `getCardIndexData` were removed, and the dead
  `LessonDTO` type deleted. Lesson colour still lives as a code design token in
  `LESSONS[].color` (used by the filter chips).
- **(c) — this document:** the larger "attributes editable via DB" feature, kept
  as its own track. It will **re-introduce** attribute colour (and possibly the
  lesson icon reference) as a *properly designed, authoritative, rendered* field,
  rather than the dead copy (a) removed.

## Verified facts (current repo state, confirmed this session)

- The web app reads attribute **options** from the core constants
  (`quick-filters.tsx` / `filter-drawer.tsx` use `LESSONS`, incl. `color` for the
  chip styling) and attribute **labels** from the static JSON via `attrLabel()`.
  It issues **no** `select … from(<attribute table>)`.
- The only DB reads of attribute rows are in ingest/denorm helpers, not the UI.
- `sub_types` is intentionally **not** curated in code — it self-extends from card
  data (`load-attributes.ts`). So the one genuinely open axis is already data-driven.
- Reference tables carry `code` (pk), `sortOrder`, `labels` (jsonb), and the
  `editable` mixin (`createdAt`, `updatedAt`, `origin` defaulting to `'import'`).
  `lessons.color` was dropped in (a).
- Seeding uses `onConflictDoNothing`, so a re-ingest does **not** update existing
  attribute rows — a hand-edited row would survive, but a changed constant would
  **not** propagate. This is the crux the feature must address.
- As of (a), lesson icons are static SVGs at `app/web/public/lessons/<code>.svg`,
  keyed by lesson slug (icon identity is code-driven, colour baked into the SVG).

## Proposed direction (to be confirmed in brainstorming)

Invert authority for **editable attribute metadata** to the DB: the admin edits
labels/colour/sort order (and possibly the lesson icon) in Postgres; the web app
reads the vocabulary from the DB; the core constants become a **bootstrap seed
only**. This aligns attributes with the existing edit surfaces
(localizations/rulings/images) and their `origin`/`updatedAt` provenance.

## Open design questions (must resolve before a plan)

1. **Scope of editability.** All reference tables or just `lessons`/`types`?
   Which fields — per-locale label, colour, sort order, lesson icon?
2. **Read path & caching.** Server components fetch vocab from the DB and pass it
   down; what caching (request memo / ISR / tag-based revalidate) given it changes
   rarely? How do client filter components receive it (props vs a small API)?
3. **What stays in code.** Colours are design tokens — keep in code/CSS or move to
   the DB? Lesson icons — stay as static SVG assets keyed by code, or become
   uploadable via S3 like card images?
4. **Authority vs re-ingest.** Constants → bootstrap only; change
   `onConflictDoNothing` to an upsert-on-import that preserves admin edits
   (`origin`), so re-ingest neither clobbers edits nor lets code silently drift.
5. **Type safety.** Data-driven vocab loses the literal-union types the constants
   give. Recover via codegen, or accept `string` + zod runtime validation?
6. **Reindex on edit.** If attribute metadata is denormalised into search docs
   again (e.g. a coloured lesson chip in results), editing one attribute must
   reindex every affected card — needs a batch strategy, unlike the per-card
   reindex used for localization edits.
7. **Permissions.** Admin-only writes via a `*-actions.ts` server action; audit
   through `origin`/`updatedAt`.
8. **Migration.** `labels` already exists; (c) likely re-adds a colour (or a
   generic `metadata` jsonb) — note (a) deliberately dropped `lessons.color`, so
   this is a fresh, correctly-designed reintroduction, not a revert.

## Explicitly out of scope (suggested for a first cut)

Editing the `sub_types` taxonomy; renaming attribute codes (primary-key changes);
i18n translation-workflow tooling.

## Next step

Run `superpowers:brainstorming` on this proposal to lock the decisions above, then
`superpowers:writing-plans` for the implementation plan.

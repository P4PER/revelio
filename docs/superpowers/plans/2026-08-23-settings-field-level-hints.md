# Settings Field-Level Hints Implementation Plan

**Goal:** Move the username guidance in `/settings/profile` from a pane-level lead under the
`<h2>` to a field-level description on the username input, so the pane still reads correctly
once Profile grows a second field.

**Problem:** Every settings pane renders `<h2>` followed by one muted `<p>`. For Appearance,
Data and Danger that paragraph genuinely describes the whole pane. For Profile it describes a
single field ("Your username is your public name..."), so adding a display name, bio or avatar
would leave a section lead that talks about only one of several fields.

**Approach:** Replace the prose hint entirely rather than repositioning it. `settings.profile.hint`
becomes a generic pane `lead` plus a `usernamePreview` rendered as a shadcn `FormDescription`
below the input, echoing the public identity live as the user types - the `@handle` byline that
appears on their decks and the `/collection/{username}` URL. Showing the consequence beats
describing it, and it is shorter than the sentence it replaces.

Placement follows from what the content is: a static rule would sit above the input (read
before typing), but a value derived from the input is output, so it sits below with the other
feedback. The field carries exactly one helper line - text above *and* below the input reads
as clutter.

"Must be unique" is not stated. The submit-time `taken` error already teaches it, and a
debounced live availability check (deferred) would make it self-evident. `FormControl` wires
`aria-describedby` to the preview; the old paragraph under the `<h2>` had no association with
the input at all.

**Out of scope:** The other four panes. Email's `currentLabel` + address block is a readout of
the current value, not a field hint, so it stays under the heading; Appearance, Data and Danger
have genuinely section-level leads and no field to attach to.

## Tasks

- [x] 1. `messages/en.json` + `messages/de.json`: replace `settings.profile.hint` with a
      generic `lead` and a `usernamePreview` carrying `{name}` and `{url}` placeholders. Key
      sets must stay identical between locales.
- [x] 2. `src/components/settings/profile-pane.tsx`: render `t('lead')` under the `<h2>`, and
      a `FormDescription` below the input previewing `@{typed}` and
      `${PUBLIC_HOST}/collection/{typed}`, hidden while the field is empty. `PUBLIC_HOST` is
      `SITE_URL` with the protocol stripped.
- [x] 3. `src/components/settings/__tests__/profile-pane.test.tsx`: assert the preview tracks
      typing, disappears when the field is empty, and is what `aria-describedby` points at.
- [x] 4. `src/components/ui/form.tsx`: size `FormDescription` at `text-xs` rather than
      shadcn's default `text-sm`, so tertiary helper text sits below the label and input in
      the type scale and agrees with the `checking` status line.
- [x] 5. Verify: `npm test -w web`, `npm run typecheck -w web`, `npm run lint -w web`.

## Deferred

- **Live availability while typing.** `mode: 'onSubmit'` means `usernameAvailable` only runs
  on save, so uniqueness is taught by an error rather than prevented. A debounced check would
  fix that and justify never stating the rule in copy.
- **Rename breaks shared links.** `/collection/{username}` resolves by name, with
  `/collection/u/[userId]` as the stable alternative, so renaming silently breaks URLs people
  have shared. Needs verifying before we warn users about it in copy.

## Constraints

- All commands run from `app/`; prefix node/npm with `/usr/local/bin`.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Conventional Commits; no Claude attribution.
- Every user-facing string comes from `messages/en.json` + `de.json` - never hardcoded.
- Code comments ASCII only.
- Web test files are not typechecked; the vitest run is the only signal there.

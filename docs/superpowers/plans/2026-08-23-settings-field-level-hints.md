# Settings Field-Level Hints Implementation Plan

**Goal:** Move the username guidance in `/settings/profile` from a pane-level lead under the
`<h2>` to a field-level description on the username input, so the pane still reads correctly
once Profile grows a second field.

**Problem:** Every settings pane renders `<h2>` followed by one muted `<p>`. For Appearance,
Data and Danger that paragraph genuinely describes the whole pane. For Profile it describes a
single field ("Your username is your public name..."), so adding a display name, bio or avatar
would leave a section lead that talks about only one of several fields.

**Approach:** Split `settings.profile.hint` into two strings - a generic `lead` for the section
and a `usernameHint` rendered as a shadcn `FormDescription` between the `Label` and the
`Input`. Hint text sits above the control so a constraint ("must be unique") is read before
typing, and so the space below the input belongs entirely to feedback - the transient
`checking` status and the `FormMessage` error slot. `FormControl` wires `aria-describedby` to
the description id regardless of DOM order, so the association is correct either way - today
the plain `<p>` under the `<h2>` has no association at all.

This is the first `FormDescription` in the codebase, so this order is the house pattern for
every form field that follows.

**Out of scope:** The other four panes. Email's `currentLabel` + address block is a readout of
the current value, not a field hint, so it stays under the heading; Appearance, Data and Danger
have genuinely section-level leads and no field to attach to.

## Tasks

- [ ] 1. `messages/en.json` + `messages/de.json`: replace `settings.profile.hint` with
      `lead` (generic section copy) and `usernameHint` (field copy, keyed next to
      `usernameLabel`). Key sets must stay identical between locales.
- [ ] 2. `src/components/settings/profile-pane.tsx`: render `t('lead')` under the `<h2>`, and
      add `<FormDescription>{t('usernameHint')}</FormDescription>` between the `Label` and the
      `FormControl`.
- [ ] 3. `src/components/settings/__tests__/profile-pane.test.tsx`: assert the description is
      rendered and that the input is described by it.
- [ ] 4. `src/components/ui/form.tsx`: size `FormDescription` at `text-xs` rather than
      shadcn's default `text-sm`, so tertiary helper text sits below the label and input in
      the type scale and agrees with the `checking` status line.
- [ ] 5. Verify: `npm test -w web`, `npm run typecheck`, `npm run lint -w web`.

## Constraints

- All commands run from `app/`; prefix node/npm with `/usr/local/bin`.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Conventional Commits; no Claude attribution.
- Every user-facing string comes from `messages/en.json` + `de.json` - never hardcoded.
- Code comments ASCII only.
- Web test files are not typechecked; the vitest run is the only signal there.

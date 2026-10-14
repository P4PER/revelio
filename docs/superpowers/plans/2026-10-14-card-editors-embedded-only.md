# Card editors: embedded only

Follow-up from PR #158 (test suite prune), whose notes listed it as open.

## Problem

`LocalizationForm` and `RulingsEditor` each carry a standalone mode behind an
`embedded` prop: their own Save button, their own toast and `router.refresh()`, and
(in `LocalizationForm`) a Cancel link and a dirty check that only gates that button.
Their one caller, `CardEditForm`, always passes `embedded` and saves both through
the ref handles, so the standalone path is dead code that nothing renders and the
tests no longer exercise.

## Change

1. `localization-form.tsx`: drop `embedded`, `onSubmit`, the dirty check, the
   Save/Cancel row, and the `useRouter`, `Link`, `toast` and `Button` imports. The
   `<form>` element becomes a `<div>`: with no submit handler left, Enter in the name
   field has nothing to submit.
2. `rulings-editor.tsx`: drop `embedded`, `onSave`, the Save button, and the
   `useRouter` and `toast` imports.
3. `card-edit-form.tsx`: stop passing `embedded`.
4. `messages/{en,de}.json`: remove `edit.saveRulings` and `edit.rulingsSaved`, which
   only the standalone rulings button used. `edit.saved`, `edit.reindexWarning`,
   `edit.save` and `edit.cancel` stay; `CardEditForm` and `ImageUploader` use them.
5. Tests: drop `embedded` and the now-unneeded navigation/sonner mocks from the two
   editor tests.

## Verification

`npm test -w web`, `npm run typecheck`, `npm run lint` from `app/`.

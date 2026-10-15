# Card edit: validate every section before saving any

Found in the code review of PR #159.

## Problem

`CardEditForm.onSave` saved the localization first and only then let the rulings
editor validate. With an incomplete ruling row, the localization was written and
re-indexed, the rulings were not, the toast read "Could not save the rulings." as if
the server had failed, and the page did not refresh.

## Change

1. `LocalizationForm` and `RulingsEditor` handles gain `validate()`, which runs the
   form's `trigger` and so shows the inline errors. `save()` keeps its own check.
2. `onSave` runs both `validate()` calls first, so both sections show their errors at
   once, and writes nothing unless both pass. On a failure it toasts `edit.invalid`.
3. `edit.invalid` read "Please fill in the name.". It now covers both sections:
   "Please fill in the highlighted fields." / "Bitte die markierten Felder ausfüllen."

## Test (RED first)

`card-edit-form.test`: rename the card, add an empty ruling row, then Save. Neither
action is called, and the toast shows `edit.invalid`.

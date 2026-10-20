# Card edit: one atomic save

Two open defects in the card edit page (`web/src/components/card/card-edit-form.tsx`):

1. **Split save.** Save calls `updateLocalization` and then `saveRulingsAction`, two server
   actions with two transactions. If the rulings fail on the server, the card text is
   already committed and the card is left half-saved.
2. **No catch in `onSave`.** A server action that throws (database down, network loss,
   `requireRole` rejecting an expired session) rejects the promise. The `finally` clears
   `busy`, but the user sees no toast.

## Design

- **db**: `saveCardEdit(db, { localization, rulings })` in `queries/card-edit.ts` opens one
  transaction and runs `upsertLocalization` and `saveRulings` on it. Both helpers take a
  `DbExecutor` (`DB | Tx`, from `client.ts`). `saveRulings` keeps its own
  `transaction()`, which becomes a savepoint when it is handed a transaction.
- **web**: `saveCardEditAction` in `lib/actions/card-edit-actions.ts` validates both
  sections in one schema, calls `saveCardEdit`, then reindexes (failure stays a warning, as
  before) and revalidates. `updateLocalization` and `saveRulingsAction` had no other caller,
  so they and their modules go.
- `LocalizationForm` and `RulingsEditor` keep `validate()` and swap `save()` for
  `values()`. `CardEditForm` sends both in one call.
- `onSave` catches a thrown action and shows `edit.saveFailed`. That message replaces
  `localizationFailed` / `rulingsFailed`, which no longer map to anything a user can act on.

## Tests

- `ingest/test/card-edit.test.ts` (live Postgres): a rulings write that fails (a NUL byte,
  which Postgres rejects in `text`) leaves the localization unchanged; a good save writes both.
- `card-edit-actions.test.ts`: auth, invalid input, normalisation, reindex warning.
- `card-edit-form.test.tsx`: one action call per save; `ok: false` and a thrown action both
  toast `saveFailed`.

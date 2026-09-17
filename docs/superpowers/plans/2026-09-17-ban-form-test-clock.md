# Ban form tests on a pinned clock

**Goal:** Make `user-ban-form.test.tsx` independent of the hour it runs at. Two tests read the real clock and fail in a daily or yearly window; the component is correct.

**Follows:** PR #127 (`fix(admin): take the earliest ban expiry from the UTC date`), which introduced `tomorrow()` from the UTC calendar.

## Diagnosis

`tomorrow()` in `user-ban-form.tsx` is the day after today **by the UTC calendar**, because `banUser` reads the picked day as UTC midnight and accepts any expiry after now (`user-admin-actions.ts:57`).

1. **`offers no expiry day before tomorrow`** asserts that the calendar's local "today" button is disabled. East of UTC between local midnight and UTC midnight (00:00-02:00 in Berlin in summer), the UTC date is still yesterday, so the UTC tomorrow *is* the local today and is correctly enabled. Reproduced with `TZ=Europe/Berlin` and the clock at `2026-09-16T23:16:00Z`: "Received element is not disabled". It failed for real at 01:16 CEST on 2026-09-17.
2. **`offers expiry years from now up to ten years ahead`** computes the expected first year as local `now + 24h`. In Berlin on 31 December between 00:00 and 01:00, the UTC tomorrow is still 31 December (this year) while `now + 24h` is next year.

No product change: a pick of the UTC tomorrow in that window is a valid, short ban, and the server agrees.

## Global constraints

- Test-only change; `user-ban-form.tsx` is not touched.
- Vitest: `beforeEach`/`afterEach` bodies in braces (an arrow returning a value is taken as teardown).
- Commit: `test(admin): pin the clock in the ban form expiry tests`, signed with `git -c gpg.program=/opt/homebrew/bin/gpg`. No attribution.

### Task 1: Pin the clock

**Files:** Modify `app/web/src/components/admin/__tests__/user-ban-form.test.tsx`

- [ ] **Step 1:** Add a `setClock(iso, timeZone)` helper (fakes `Date` only, sets `process.env.TZ`) and an `afterEach` that restores real timers and the original `TZ`. Move the existing `takes tomorrow from the UTC date, not the local one` test onto it (drop its try/finally).
- [ ] **Step 2:** `offers no expiry day before tomorrow`: pin to midday (`2026-09-16T12:00:00Z`, Europe/Berlin); September 16th disabled, September 17th enabled.
- [ ] **Step 3:** New test `offers the UTC tomorrow east of UTC just after local midnight`: `2026-09-16T23:16:00Z`, Europe/Berlin; September 16th disabled, September 17th enabled. This pins down the case the old test got wrong: the local today is legitimately offered here, and the test says why.
- [ ] **Step 4:** Years test: pin to `2026-12-30T23:30:00Z` in Europe/Berlin (00:30 on 31 December locally) and expect 2026 through 2036. Before the change, confirm the old expectation (`now + 24h` year) fails at that clock.
- [ ] **Step 5:** Verify each pinned test at several clocks by running the file with the real clock too; `npm test -w web`, `npm run typecheck`, `npm run lint -w web`.
- [ ] **Step 6:** Commit, push, open PR `test(admin): pin the clock in the ban form expiry tests`.

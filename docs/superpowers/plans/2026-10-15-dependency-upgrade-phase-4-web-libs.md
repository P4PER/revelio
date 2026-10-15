# Dependency Upgrade Phase 4: Web Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade web's TanStack Table (8 to 9), react-day-picker (9 to 10) and nodemailer (9 to 10), and replace the deprecated `@react-email/components` with `react-email`.

**Architecture:** The two admin tables move to TanStack 9's explicit feature registry, which both import from one module in `lib/`. The other three are import or manifest changes, each verified by its existing tests plus a manual check where tests mock the library.

**Tech Stack:** @tanstack/react-table 9.3.1, react-day-picker 10.0.2, nodemailer 10.1.1, react-email 6.11.2.

**Spec:** `docs/superpowers/specs/2026-10-15-dependency-upgrade-design.md`
**Prerequisite:** [Phase 1](2026-10-15-dependency-upgrade-phase-1-toolchain.md) merged. Branch `chore/upgrade-web-libs` from `main`.

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- Admin table behaviour is unchanged: same columns, same default sort (users `createdAt` desc, sets `releaseDate` asc), page size 20, the same search semantics, the same pagination labels.
- No new user-facing strings. If one turns out to be needed, it goes into `messages/en.json` and `de.json`.
- Code comments are ASCII-only.
- Commits: Conventional Commits, no attribution, `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- **Sort order of mixed strings.** v8's `'auto'` sort picked `alphanumeric` / `text` / `datetime` from the built-ins. v9 resolves `'auto'` only against registered functions. Without registering them, "Set 10" sorts before "Set 2", and `createdAt` (a `Date`) loses date ordering.
- **Global search eligibility.** v9, like v8, only global-filters columns whose first-row value is a string or number. A users list whose first row has `username: null` must still match by email.
- **Search resets paging.** Typing on page 3 must not leave an empty page 3. v8's `autoResetPageIndex` did this. The test "shows a record range and pages through" plus a search assertion pins it.
- **Emails still render.** `react-email`'s `Html`/`Body`/... must produce the same markup. The template snapshot or text tests in `lib/email/__tests__` must pass unchanged.
- **nodemailer is mocked in tests.** A real send through local Mailpit (`localhost:1025`) is the only proof the transport still works.

---

### Task 1: Shared TanStack 9 feature set

**Files:**
- Create: `app/web/src/lib/admin-table.ts`
- Modify: `app/web/package.json`, `app/package-lock.json`

**Interfaces:**
- Produces: `export const adminTableFeatures` (the `tableFeatures({...})` result) and `export type AdminTableFeatures = typeof adminTableFeatures`.

- [ ] **Step 1: Bump and see the break.**

```bash
npm install @tanstack/react-table@^9.3.1 -w web
npm run typecheck -w web 2>&1 | grep -c "error TS"
```

Expected: about 41 errors, all in `admin-users-table.tsx` / `admin-sets-table.tsx`.

- [ ] **Step 2: Create the feature set.** `app/web/src/lib/admin-table.ts`:

```ts
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * The TanStack Table features both admin tables use: global search, sorting
 * and pagination. v9 exposes only what is registered here.
 * columnFilteringFeature is listed because globalFilteringFeature requires it.
 * The three sort functions are what v8's 'auto' sort picked from (mixed
 * strings, plain strings, Dates); v9 resolves 'auto' only against this
 * registry, so leaving them out silently changes the order.
 */
export const adminTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
})

export type AdminTableFeatures = typeof adminTableFeatures
```

### Task 2: Migrate `AdminUsersTable`

**Files:**
- Modify: `app/web/src/components/admin/admin-users-table.tsx`
- Test: `app/web/src/components/admin/__tests__/admin-users-table.test.tsx`

**Interfaces:**
- Consumes: `adminTableFeatures`, `AdminTableFeatures` from `@/lib/admin-table`.

- [ ] **Step 1: Run the tests to see them fail.** `npm test -w web -- admin-users-table`. Expected: 5 failures.

- [ ] **Step 2: Add the sort-order tests** (Review Focus 1 and 2). Append inside `describe('AdminUsersTable', ...)`. It uses the file's `users` fixture, `renderTable` and `rowNames`:

```tsx
  it('sorts usernames naturally when the column is clicked, user2 before user10', () => {
    renderTable([
      { ...users[0], id: 'a', username: 'user10', displayUsername: 'user10' },
      { ...users[1], id: 'b', username: 'user2', displayUsername: 'user2' },
    ])
    fireEvent.click(screen.getByRole('button', { name: en.admin.users.username }))
    expect(rowNames()).toEqual(['user2', 'user10'])
  })

  it('finds a user by email when the first row has no username', () => {
    renderTable([
      { ...users[0], id: 'a', username: null, displayUsername: null },
      users[1],
    ])
    fireEvent.change(screen.getByPlaceholderText(en.admin.users.searchPlaceholder), { target: { value: 'ed@x' } })
    expect(rowNames()).toHaveLength(1)
  })
```

Run `npm test -w web -- admin-users-table`. Both fail with the rest, because the component does not compile against v9 yet. Run the same two tests on `main` first (`git stash`, test, `git stash pop`) to confirm they pass under v8. They pin existing behaviour and are not new requirements. If `username` is not nullable in `UserAdminRow`, drop the second test's null fields and use `username: ''`.

- [ ] **Step 3: Migrate the component.** Imports:

```ts
import {
  type ColumnDef, type FilterFn, type SortingState,
  flexRender, useTable,
} from '@tanstack/react-table'
import { adminTableFeatures, type AdminTableFeatures } from '@/lib/admin-table'
```

Filter and column types:

```ts
const usernameOrEmail: FilterFn<AdminTableFeatures, UserAdminRow> = (row, _id, value) => {
```

```ts
  const columns = useMemo<ColumnDef<AdminTableFeatures, UserAdminRow>[]>(() => [
```

The table:

```ts
  const table = useTable({
    features: adminTableFeatures,
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: usernameOrEmail,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })
```

The pagination reads:

```tsx
        page={table.state.pagination.pageIndex + 1}
        pageSize={table.state.pagination.pageSize}
```

Keep the `react-hooks/incompatible-library` disable and its comment only if `npm run lint -w web` still reports that rule for `useTable`. Otherwise delete both lines.

- [ ] **Step 4: Run tests and typecheck.** `npm test -w web -- admin-users-table && npm run typecheck -w web`. Expected: all users-table tests pass, including the new one. Typecheck errors now remain only in `admin-sets-table.tsx`.

### Task 3: Migrate `AdminSetsTable`

**Files:**
- Modify: `app/web/src/components/admin/admin-sets-table.tsx`
- Test: `app/web/src/components/admin/__tests__/admin-sets-table.test.tsx`

- [ ] **Step 1: Add the natural-sort test for set names.** Append inside the sets `describe`:

```tsx
  it('sorts set names naturally when the column is clicked, Set 2 before Set 10', () => {
    renderTable([
      { ...sets[0], code: 'S10', name: 'Set 10' },
      { ...sets[1], code: 'S2', name: 'Set 2' },
    ])
    fireEvent.click(screen.getByRole('button', { name: en.admin.sets.name }))
    expect(rowNames()).toEqual(['Set 2', 'Set 10'])
  })
```

If `rowNames()` returns the code or symbol link text as well (the symbol cell may be a link too), filter to the expected names with `.filter((n) => n.startsWith('Set '))`. Check the file's existing sort test for the shape it asserts.

- [ ] **Step 2: Apply the same changes as Task 2 Step 3,** with `SetDTO` for `UserAdminRow` and `nameOrCode` for `usernameOrEmail`:

```ts
const nameOrCode: FilterFn<AdminTableFeatures, SetDTO> = (row, _id, value) => {
```

```ts
  const columns = useMemo<ColumnDef<AdminTableFeatures, SetDTO>[]>(
```

```ts
  const table = useTable({
    features: adminTableFeatures,
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: nameOrCode,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  })
```

`table.getState().pagination` becomes `table.state.pagination` (two reads).

- [ ] **Step 3: Verify.** `npm test -w web -- admin- && npm run typecheck && npm run lint`. Expected: all admin table tests pass (the existing sets and users tests plus the 3 new ones), typecheck and lint exit 0.

- [ ] **Step 4: Paging reset check** (Review Focus 3). In `admin-sets-table.test.tsx`'s existing "paginates" test, after moving to page 2, type a query matching one set and assert that row is visible. If it fails, add `autoResetPageIndex: true` to both `useTable` calls, since v9 may have changed the default, and re-run.

- [ ] **Step 5: Commit.**

```bash
git add web/package.json package-lock.json web/src/lib/admin-table.ts web/src/components/admin
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(admin): upgrade tanstack table to 9" -m "v9 replaces useReactTable with useTable over an explicit feature
registry. The sort functions v8's auto sort chose from are registered
by hand: v9 resolves auto only against the registry."
```

### Task 4: react-day-picker 10

**Files:**
- Modify: `app/web/package.json`, `app/package-lock.json`
- Verify: `app/web/src/components/ui/calendar.tsx`, `app/web/src/components/date-picker.tsx`

- [ ] **Step 1:** `npm install react-day-picker@^10.0.2 -w web && npm run typecheck -w web && npm test -w web -- date-picker calendar`. Expected: pass (the probe showed no break).
- [ ] **Step 2: Visual check.** The `UI` class keys are unchanged apart from the removed deprecated ones, but defaults may have moved. Take a Playwright screenshot of a page with the date picker open, before and after, at DPR 1, in light and dark. Use the repo's chromium imported by absolute path, per the `visual-checks-use-playwright` note. `date-picker.tsx` is used by `admin/user-ban-form.tsx`, `set/set-form.tsx` and `card/rulings-editor.tsx`. Screenshot the ban form's picker open. Expected: the same layout.
- [ ] **Step 3: Commit** `build(web): upgrade react-day-picker to 10`.

### Task 5: nodemailer 10

**Files:**
- Modify: `app/web/package.json`, `app/package-lock.json`

- [ ] **Step 1:** `npm install nodemailer@^10.1.1 -w web && npm uninstall @types/nodemailer -w web && npm run typecheck -w web`. If `lib/email/mailer.ts` fails to resolve `Transporter`, reinstall `@types/nodemailer@^8.0.2` and note why in the commit body.
- [ ] **Step 2:** `npm test -w web -- email`. Expected: pass.
- [ ] **Step 3: Real send.** With compose's Mailpit up and `SMTP_HOST=localhost SMTP_PORT=1025 MAIL_FROM=test@revelio.local` in `web/.env.local`, request a sign-in code on `/en/login` and confirm it arrives at `http://localhost:8025`.
- [ ] **Step 4: Commit** `build(web): upgrade nodemailer to 10`.

### Task 6: react-email replaces @react-email/components

**Files:**
- Modify: `app/web/src/lib/email/layout.tsx`, `otp-template.tsx`, `ban-template.tsx`, `contact-template.tsx`
- Modify: `app/web/package.json`, `app/package-lock.json`

- [ ] **Step 1: Swap the package.**

```bash
npm install react-email@^6.11.2 -w web && npm uninstall @react-email/components -w web
sed -i '' "s#from '@react-email/components'#from 'react-email'#" web/src/lib/email/*.tsx
grep -rn "@react-email/components" web/src
```

Expected: the grep prints nothing. `@react-email/render` stays.

- [ ] **Step 2:** `npm run typecheck -w web && npm test -w web -- email`. Expected: pass, with snapshot/text assertions unchanged.
- [ ] **Step 3: Bundle check.** `npm run build -w web`, then `du -sh web/.next/standalone` compared with phase 1's build. `react-email` carries CLI dependencies (esbuild, socket.io). Next's tracing should leave them out. If standalone grew by more than 10 MB, revert this task and record why in the PR. The deprecation is a warning, not a break.
- [ ] **Step 4:** Send the OTP mail again through Mailpit and compare it with Task 5's.
- [ ] **Step 5: Commit** `build(web): move email components to react-email`.

### Task 7: PR

- [ ] `docker build -f web/Dockerfile -t revelio-web:libs-check .`, then `E2E_REQUIRE_SEED=1 npm run e2e -w web`. Push, then `gh pr create --title "build(web): upgrade tanstack table, day picker, nodemailer and react-email"`, with `## Verification` listing every command, the screenshots and the Mailpit sends.

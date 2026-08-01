# User Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in users a `/settings` page to change their username, change their sign-in email (verified by a code sent to the new address), export all their data as JSON, and delete their account (confirmed by an emailed code).

**Architecture:** New authenticated App Router route `[locale]/settings` rendering a client shell that reuses the collection `ResponsiveSidebar` for a Profile · Email · Your data · Danger zone nav, switching panes client-side. All writes are `'use server'` actions in `settings-actions.ts` returning the shared `{ ok: true } | { ok: false; error }` result, surfaced via sonner toasts. The two sensitive flows (email change, delete) use one-time 6-digit codes stored in the existing Better Auth `verification` table (a generic expiring key-value — **no migration**) and delivered through the existing `renderOtpEmail` + `sendMail` pipeline. Username/email writes are direct Drizzle updates guarded by the existing `unique` constraints, matching `auth-actions.ts`.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, Better Auth (email-OTP + username plugins), Drizzle/Postgres, shadcn (`input`, `input-otp`, `alert-dialog`, `button`, `form`), react-hook-form + zod, sonner, vitest + @testing-library, Playwright.

## Global Constraints

- All app commands run from `app/`. Tests: `npm test -w web -- <file>`. Typecheck: `npm run typecheck`. Lint: `npm run lint -w web`.
- Server actions are `'use server'`, gated on the session first, validated with a module-scope zod `.safeParse`, and return `SettingsResult = { ok: true } | { ok: false; error: string }` (export returns data — see its signature). Clients call inside try/catch and report via `toast.success` / `toast.error`.
- Every user-facing string comes from `messages/en.json` + `de.json` — never hardcoded. The OTP **email** template is deliberately English-only (`otpTranslator()` pins `locale: 'en'`); email copy is added to `en.json` only, matching that precedent.
- Two Meilisearch keys / secrets never reach the client. No secret is logged (the mailer forbids logging subjects — they contain codes).
- `verification` table is reused as-is; **no schema change, no migration**. If a task appears to need a schema change, stop and reconsider — it shouldn't.
- Conventional Commits. Work stays on branch `feat/user-settings-page`. Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Locale-aware links use `@/../i18n/navigation` (`Link`, `useRouter`, `redirect`), never bare `next/link`.

---

### Task 1: DB export aggregator `getUserExport`

**Files:**
- Modify: `app/db/src/queries.ts` (add function + `UserExport` type near the other per-user queries)
- Modify: `app/db/src/index.ts` (export `getUserExport`, `type UserExport`)

**Interfaces:**
- Produces: `getUserExport(db: DB, userId: string): Promise<UserExport>` and
  ```ts
  export type UserExport = {
    profile: { username: string | null; displayUsername: string | null; email: string; role: string | null; createdAt: string }
    decks: Array<{ id: string; name: string; format: string; visibility: string; lessons: string[]; cards: Array<{ cardId: string; zone: string; quantity: number }> }>
    collection: { visibility: string; ownedCards: Array<{ cardId: string; finish: string; quantity: number }> }
    likes: Array<{ deckId: string; createdAt: string }>
  }
  ```
- Consumes: existing `user`, `decks`, `deckCards`, `deckLikes`, `collections`, `userCards` tables (already imported in `queries.ts`).

- [ ] **Step 1: Implement the aggregator**

In `app/db/src/queries.ts`, add near `getCollectionSummary`:

```ts
export type UserExport = {
  profile: { username: string | null; displayUsername: string | null; email: string; role: string | null; createdAt: string }
  decks: Array<{ id: string; name: string; format: string; visibility: string; lessons: string[]; cards: Array<{ cardId: string; zone: string; quantity: number }> }>
  collection: { visibility: string; ownedCards: Array<{ cardId: string; finish: string; quantity: number }> }
  likes: Array<{ deckId: string; createdAt: string }>
}

export async function getUserExport(db: DB, userId: string): Promise<UserExport> {
  const [u] = await db
    .select({
      username: user.username, displayUsername: user.displayUsername,
      email: user.email, role: user.role, createdAt: user.createdAt,
    })
    .from(user).where(eq(user.id, userId)).limit(1)
  if (!u) throw new Error('user not found')

  const deckRows = await db
    .select({ id: decks.id, name: decks.name, format: decks.format, visibility: decks.visibility, lessons: decks.lessons })
    .from(decks).where(eq(decks.userId, userId)).orderBy(decks.name)
  const deckIds = deckRows.map((d) => d.id)
  const cardRows = deckIds.length
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId, zone: deckCards.zone, quantity: deckCards.quantity })
        .from(deckCards).where(inArray(deckCards.deckId, deckIds))
    : []
  const cardsByDeck = new Map<string, Array<{ cardId: string; zone: string; quantity: number }>>()
  for (const c of cardRows) {
    const list = cardsByDeck.get(c.deckId) ?? []
    list.push({ cardId: c.cardId, zone: c.zone, quantity: c.quantity })
    cardsByDeck.set(c.deckId, list)
  }

  const [coll] = await db.select({ visibility: collections.visibility }).from(collections).where(eq(collections.userId, userId)).limit(1)
  const owned = await db.select({ cardId: userCards.cardId, finish: userCards.finish, quantity: userCards.quantity })
    .from(userCards).where(eq(userCards.userId, userId)).orderBy(userCards.cardId)
  const likeRows = await db.select({ deckId: deckLikes.deckId, createdAt: deckLikes.createdAt })
    .from(deckLikes).where(eq(deckLikes.userId, userId))

  return {
    profile: {
      username: u.username, displayUsername: u.displayUsername, email: u.email,
      role: u.role, createdAt: u.createdAt.toISOString(),
    },
    decks: deckRows.map((d) => ({ ...d, cards: cardsByDeck.get(d.id) ?? [] })),
    collection: { visibility: coll?.visibility ?? 'private', ownedCards: owned },
    likes: likeRows.map((l) => ({ deckId: l.deckId, createdAt: l.createdAt.toISOString() })),
  }
}
```

Ensure `inArray` is in the `drizzle-orm` import at the top of `queries.ts` (add it if missing).

- [ ] **Step 2: Export it**

In `app/db/src/index.ts`, add `getUserExport` to the `queries` export list and `UserExport` to the `export type { ... } from './queries'` list.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors). This function is covered behaviorally through Task 5's `exportMyData` test (repo convention: raw queries are mocked, not Testcontainer-tested).

- [ ] **Step 4: Commit**

```bash
git add app/db/src/queries.ts app/db/src/index.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): add getUserExport aggregator for data export"
```

---

### Task 2: One-time code store `account-codes.ts`

**Files:**
- Create: `app/web/src/lib/account-codes.ts`
- Test: `app/web/src/lib/__tests__/account-codes.test.ts`

**Interfaces:**
- Produces (pure, unit-tested): `generateCode(): string` (6 digits), `matchStoredCode(code: string, storedValue: string): Record<string, string> | null` (returns the stored extra fields sans `codeHash` on match, else null).
- Produces (db wrappers): `storeCode(identifier: string, code: string, extra?: Record<string, string>): Promise<void>`, `consumeCode(identifier: string, code: string): Promise<Record<string, string> | null>`, `emailChangeId(userId: string): string`, `deleteId(userId: string): string`.
- Consumes: `getDb` from `@/lib/db`, `verification` from `@revelio/db`.

- [ ] **Step 1: Write the failing test**

```ts
// app/web/src/lib/__tests__/account-codes.test.ts
import { it, expect } from 'vitest'
import { generateCode, matchStoredCode } from '../account-codes'
import { createHash } from 'node:crypto'

const stored = (code: string, extra: Record<string, string> = {}) =>
  JSON.stringify({ codeHash: createHash('sha256').update(code).digest('hex'), ...extra })

it('generates a 6-digit numeric code', () => {
  for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[0-9]{6}$/)
})

it('matches a correct code and returns extra fields', () => {
  expect(matchStoredCode('123456', stored('123456', { newEmail: 'a@b.c' }))).toEqual({ newEmail: 'a@b.c' })
})

it('rejects a wrong code', () => {
  expect(matchStoredCode('000000', stored('123456'))).toBeNull()
})

it('rejects malformed stored value', () => {
  expect(matchStoredCode('123456', 'not json')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/account-codes.test.ts`
Expected: FAIL ("Cannot find module '../account-codes'").

- [ ] **Step 3: Implement**

```ts
// app/web/src/lib/account-codes.ts
import 'server-only'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { verification } from '@revelio/db'

const TTL_MS = 10 * 60 * 1000 // 10 minutes, matches the OTP email copy

const hash = (code: string) => createHash('sha256').update(code).digest('hex')

export const emailChangeId = (userId: string) => `settings-email-change:${userId}`
export const deleteId = (userId: string) => `settings-delete:${userId}`

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function matchStoredCode(code: string, storedValue: string): Record<string, string> | null {
  let parsed: { codeHash?: string } & Record<string, string>
  try { parsed = JSON.parse(storedValue) } catch { return null }
  if (!parsed.codeHash || parsed.codeHash !== hash(code)) return null
  const { codeHash: _drop, ...extra } = parsed
  return extra
}

export async function storeCode(identifier: string, code: string, extra: Record<string, string> = {}): Promise<void> {
  const db = getDb()
  const value = JSON.stringify({ codeHash: hash(code), ...extra })
  const expiresAt = new Date(Date.now() + TTL_MS)
  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({ id: randomUUID(), identifier, value, expiresAt })
}

export async function consumeCode(identifier: string, code: string): Promise<Record<string, string> | null> {
  const db = getDb()
  const [row] = await db.select().from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date()))).limit(1)
  if (!row) return null
  const extra = matchStoredCode(code, row.value)
  if (!extra) return null
  await db.delete(verification).where(eq(verification.identifier, identifier))
  return extra
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/account-codes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/account-codes.ts app/web/src/lib/__tests__/account-codes.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add one-time code store over the verification table"
```

---

### Task 3: i18n + delete-account email copy

**Files:**
- Modify: `app/web/messages/en.json` (new `settings` namespace; `nav.settings`; `email.otp.*['delete-account']`)
- Modify: `app/web/messages/de.json` (new `settings` namespace; `nav.settings`)
- Modify: `app/web/src/lib/email/otp-template.tsx` (add `'delete-account'` to `OtpEmailType`)

**Interfaces:**
- Produces: `OtpEmailType = 'sign-in' | 'email-verification' | 'change-email' | 'delete-account'`; message keys under `settings.*`, `nav.settings`, `email.otp.subject/heading/intro['delete-account']`.

- [ ] **Step 1: Add the `settings` namespace to `en.json`**

Add a top-level `"settings"` object and a `"settings"` key under the existing `"nav"` object:

```jsonc
// under "nav":
"settings": "Settings",

// new top-level namespace:
"settings": {
  "title": "Settings",
  "lead": "Manage your Revelio account",
  "menuTitle": "Settings",
  "nav": { "profile": "Profile", "email": "Email", "data": "Your data", "danger": "Danger zone" },
  "profile": {
    "title": "Profile",
    "hint": "Your username is your public name, shown on the decks you publish. It must be unique.",
    "usernameLabel": "Username",
    "checking": "Checking availability…",
    "available": "Available",
    "taken": "That username is taken. Please choose another.",
    "unchanged": "This is already your username.",
    "save": "Save",
    "saved": "Username updated.",
    "saveError": "Couldn't update your username. Please try again.",
    "emailLabel": "Email",
    "roleLabel": "Role",
    "joinedLabel": "Joined"
  },
  "email": {
    "title": "Email",
    "hint": "The address you use to sign in. Changing it sends a 6-digit code to the new address to confirm.",
    "currentLabel": "Current email",
    "newLabel": "New email",
    "sendCode": "Send code",
    "codeSent": "We emailed a 6-digit code to {email}. Enter it to confirm the change.",
    "codeLabel": "Confirmation code",
    "confirm": "Confirm change",
    "cancel": "Cancel",
    "resend": "Resend code",
    "updated": "Email updated to {email}.",
    "sameEmail": "That's already your email.",
    "emailTaken": "An account already uses that email.",
    "requestError": "Couldn't send the code. Please try again.",
    "invalidCode": "That code isn't right, or it expired. Try again."
  },
  "data": {
    "title": "Your data",
    "hint": "Download everything Revelio holds about you as a single JSON file — your profile, decks, collection and likes.",
    "export": "Export as JSON",
    "exporting": "Preparing…",
    "exportError": "Couldn't prepare your export. Please try again."
  },
  "danger": {
    "title": "Danger zone",
    "hint": "Deleting your account is permanent. It also removes:",
    "item1": "All your decks and their cards",
    "item2": "Your collection and owned-card records",
    "item3": "Your likes and views",
    "deleteAction": "Delete account…",
    "dialogTitle": "Confirm account deletion",
    "dialogBody": "We emailed a 6-digit code to {email}. Enter it to permanently delete your account.",
    "codeLabel": "Confirmation code",
    "sendError": "Couldn't send the code. Please try again.",
    "confirmDelete": "Delete forever",
    "cancel": "Cancel",
    "deleted": "Your account has been deleted.",
    "invalidCode": "That code isn't right, or it expired. Try again."
  }
}
```

- [ ] **Step 2: Add the German translations to `de.json`**

Mirror every key above under `"settings"` and `nav.settings`:

```jsonc
// under "nav":
"settings": "Einstellungen",

"settings": {
  "title": "Einstellungen",
  "lead": "Verwalte dein Revelio-Konto",
  "menuTitle": "Einstellungen",
  "nav": { "profile": "Profil", "email": "E-Mail", "data": "Deine Daten", "danger": "Gefahrenzone" },
  "profile": {
    "title": "Profil",
    "hint": "Dein Benutzername ist dein öffentlicher Name und erscheint auf den Decks, die du veröffentlichst. Er muss eindeutig sein.",
    "usernameLabel": "Benutzername",
    "checking": "Verfügbarkeit wird geprüft…",
    "available": "Verfügbar",
    "taken": "Dieser Benutzername ist vergeben. Bitte wähle einen anderen.",
    "unchanged": "Das ist bereits dein Benutzername.",
    "save": "Speichern",
    "saved": "Benutzername aktualisiert.",
    "saveError": "Benutzername konnte nicht aktualisiert werden. Bitte versuche es erneut.",
    "emailLabel": "E-Mail",
    "roleLabel": "Rolle",
    "joinedLabel": "Beigetreten"
  },
  "email": {
    "title": "E-Mail",
    "hint": "Die Adresse, mit der du dich anmeldest. Bei einer Änderung senden wir einen 6-stelligen Code an die neue Adresse.",
    "currentLabel": "Aktuelle E-Mail",
    "newLabel": "Neue E-Mail",
    "sendCode": "Code senden",
    "codeSent": "Wir haben einen 6-stelligen Code an {email} gesendet. Gib ihn ein, um die Änderung zu bestätigen.",
    "codeLabel": "Bestätigungscode",
    "confirm": "Änderung bestätigen",
    "cancel": "Abbrechen",
    "resend": "Code erneut senden",
    "updated": "E-Mail geändert zu {email}.",
    "sameEmail": "Das ist bereits deine E-Mail-Adresse.",
    "emailTaken": "Ein Konto verwendet diese E-Mail-Adresse bereits.",
    "requestError": "Code konnte nicht gesendet werden. Bitte versuche es erneut.",
    "invalidCode": "Dieser Code ist falsch oder abgelaufen. Bitte versuche es erneut."
  },
  "data": {
    "title": "Deine Daten",
    "hint": "Lade alles, was Revelio über dich speichert, als einzelne JSON-Datei herunter — dein Profil, Decks, Sammlung und Likes.",
    "export": "Als JSON exportieren",
    "exporting": "Wird vorbereitet…",
    "exportError": "Export konnte nicht vorbereitet werden. Bitte versuche es erneut."
  },
  "danger": {
    "title": "Gefahrenzone",
    "hint": "Das Löschen deines Kontos ist endgültig. Ebenfalls entfernt werden:",
    "item1": "Alle deine Decks und ihre Karten",
    "item2": "Deine Sammlung und deine Karteneinträge",
    "item3": "Deine Likes und Aufrufe",
    "deleteAction": "Konto löschen…",
    "dialogTitle": "Kontolöschung bestätigen",
    "dialogBody": "Wir haben einen 6-stelligen Code an {email} gesendet. Gib ihn ein, um dein Konto endgültig zu löschen.",
    "codeLabel": "Bestätigungscode",
    "sendError": "Code konnte nicht gesendet werden. Bitte versuche es erneut.",
    "confirmDelete": "Endgültig löschen",
    "cancel": "Abbrechen",
    "deleted": "Dein Konto wurde gelöscht.",
    "invalidCode": "Dieser Code ist falsch oder abgelaufen. Bitte versuche es erneut."
  }
}
```

- [ ] **Step 3: Add delete-account email copy to `en.json`**

Under the existing `email.otp` object, add the `delete-account` variant to each keyed map (alongside the existing `sign-in` / `email-verification` / `change-email` entries):

```jsonc
// email.otp.subject:
"delete-account": "Your Revelio account-deletion code: {code}",
// email.otp.heading:
"delete-account": "Confirm account deletion",
// email.otp.intro:
"delete-account": "Use this code to permanently delete your Revelio account. If you didn't request this, ignore this email and your account stays safe."
```

- [ ] **Step 4: Widen the email type**

In `app/web/src/lib/email/otp-template.tsx`, change:

```ts
export type OtpEmailType = 'sign-in' | 'email-verification' | 'change-email' | 'delete-account'
```

- [ ] **Step 5: Verify JSON + typecheck**

Run: `npm run typecheck`
Expected: PASS. If a JSON test enforces en/de key parity (there is a messages structure test in the repo), run `npm test -w web` and fix any missing-key mismatch.

- [ ] **Step 6: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/lib/email/otp-template.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "i18n(web): add settings namespace and delete-account email copy"
```

---

### Task 4: Settings zod schemas

**Files:**
- Create: `app/web/src/lib/schemas/settings.ts`
- Test: `app/web/src/lib/__tests__/settings-schema.test.ts`

**Interfaces:**
- Produces: `makeUsernameSchema(t: (k: string) => string)` → `{ username: string }`; `makeNewEmailSchema(t)` → `{ email: string }`. Reuses `makeCodeSchema` from `schemas/auth.ts` for the OTP step.

- [ ] **Step 1: Write the failing test**

```ts
// app/web/src/lib/__tests__/settings-schema.test.ts
import { it, expect } from 'vitest'
import { makeUsernameSchema, makeNewEmailSchema } from '../schemas/settings'

const t = (k: string) => k

it('accepts a valid username and trims it', () => {
  expect(makeUsernameSchema(t).safeParse({ username: '  alice ' }).success).toBe(true)
})
it('rejects an empty username', () => {
  const r = makeUsernameSchema(t).safeParse({ username: '   ' })
  expect(r.success).toBe(false)
})
it('rejects an invalid email', () => {
  expect(makeNewEmailSchema(t).safeParse({ email: 'nope' }).success).toBe(false)
})
it('accepts a valid email', () => {
  expect(makeNewEmailSchema(t).safeParse({ email: 'a@b.co' }).success).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/settings-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// app/web/src/lib/schemas/settings.ts
import { z } from 'zod'

type T = (key: string) => string

export function makeUsernameSchema(t: T) {
  return z.object({ username: z.string().trim().min(1, t('required')) })
}

export function makeNewEmailSchema(t: T) {
  return z.object({ email: z.string().trim().min(1, t('required')).email(t('email')) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/settings-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/schemas/settings.ts app/web/src/lib/__tests__/settings-schema.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add settings zod schemas"
```

---

### Task 5: Settings server actions

**Files:**
- Create: `app/web/src/lib/settings-actions.ts`
- Test: `app/web/src/lib/__tests__/settings-actions.test.ts`

**Interfaces:**
- Consumes: `getSession` (`@/lib/session`); `getDb` (`@/lib/db`); `user`, `deleteUserById`, `getUserExport` (`@revelio/db`); `usernameAvailable`, `emailHasAccount` (`@/lib/auth-actions`); `generateCode`, `storeCode`, `consumeCode`, `emailChangeId`, `deleteId` (`@/lib/account-codes`); `renderOtpEmail` (`@/lib/email/otp-template`); `sendMail` (`@/lib/email/mailer`); `getCachedSiteSettings` (`@/lib/site-settings`); `makeUsernameSchema`, `makeNewEmailSchema`, `makeCodeSchema`.
- Produces (all `'use server'`):
  - `type SettingsResult = { ok: true } | { ok: false; error: string }`
  - `updateUsername(username: string): Promise<SettingsResult>`
  - `requestEmailChange(newEmail: string): Promise<SettingsResult>`
  - `confirmEmailChange(code: string): Promise<SettingsResult>`
  - `requestAccountDeletion(): Promise<SettingsResult>`
  - `confirmAccountDeletion(code: string): Promise<SettingsResult>`
  - `exportMyData(): Promise<{ ok: true; data: UserExport } | { ok: false; error: string }>`

Error string vocabulary (mapped to i18n by the client): `'unauthorized'`, `'invalid'`, `'unchanged'`, `'taken'`, `'same-email'`, `'email-taken'`, `'code'`, `'failed'`.

- [ ] **Step 1: Write the failing tests** (mock pattern mirrors `deck-actions.test.ts`)

```ts
// app/web/src/lib/__tests__/settings-actions.test.ts
import { it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1', username: 'alice', email: 'alice@owl.post' } })),
  usernameAvailable: vi.fn(async () => true),
  emailHasAccount: vi.fn(async () => false),
  generateCode: vi.fn(() => '123456'),
  storeCode: vi.fn(async () => {}),
  consumeCode: vi.fn(async () => ({ newEmail: 'new@owl.post' })),
  renderOtpEmail: vi.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
  sendMail: vi.fn(async () => {}),
  getCachedSiteSettings: vi.fn(async () => ({ contactEmail: 'c@x' })),
  deleteUserById: vi.fn(async () => {}),
  getUserExport: vi.fn(async () => ({ profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] })),
  update: vi.fn(() => ({ set: () => ({ where: async () => {} }) })),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ update: m.update }) }))
vi.mock('@revelio/db', () => ({ user: {}, deleteUserById: m.deleteUserById, getUserExport: m.getUserExport }))
vi.mock('@/lib/auth-actions', () => ({ usernameAvailable: m.usernameAvailable, emailHasAccount: m.emailHasAccount }))
vi.mock('@/lib/account-codes', () => ({
  generateCode: m.generateCode, storeCode: m.storeCode, consumeCode: m.consumeCode,
  emailChangeId: (id: string) => `ec:${id}`, deleteId: (id: string) => `del:${id}`,
}))
vi.mock('@/lib/email/otp-template', () => ({ renderOtpEmail: m.renderOtpEmail }))
vi.mock('@/lib/email/mailer', () => ({ sendMail: m.sendMail }))
vi.mock('@/lib/site-settings', () => ({ getCachedSiteSettings: m.getCachedSiteSettings }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { updateUsername, requestEmailChange, confirmEmailChange, requestAccountDeletion, confirmAccountDeletion, exportMyData } from '../settings-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1', username: 'alice', email: 'alice@owl.post' } })
  m.usernameAvailable.mockResolvedValue(true)
  m.emailHasAccount.mockResolvedValue(false)
  m.consumeCode.mockResolvedValue({ newEmail: 'new@owl.post' })
  m.getUserExport.mockResolvedValue({ profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] })
  m.update.mockReturnValue({ set: () => ({ where: async () => {} }) })
})

it('rejects when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await updateUsername('bob')).toEqual({ ok: false, error: 'unauthorized' })
})
it('no-ops when the username is unchanged', async () => {
  expect(await updateUsername('alice')).toEqual({ ok: false, error: 'unchanged' })
})
it('rejects a taken username', async () => {
  m.usernameAvailable.mockResolvedValueOnce(false)
  expect(await updateUsername('bob')).toEqual({ ok: false, error: 'taken' })
})
it('updates a free username', async () => {
  expect(await updateUsername('bob')).toEqual({ ok: true })
  expect(m.update).toHaveBeenCalled()
})
it('rejects email change to the same address', async () => {
  expect(await requestEmailChange('alice@owl.post')).toEqual({ ok: false, error: 'same-email' })
})
it('rejects email change to a taken address', async () => {
  m.emailHasAccount.mockResolvedValueOnce(true)
  expect(await requestEmailChange('new@owl.post')).toEqual({ ok: false, error: 'email-taken' })
})
it('stores a code and mails the new address on email change request', async () => {
  expect(await requestEmailChange('new@owl.post')).toEqual({ ok: true })
  expect(m.storeCode).toHaveBeenCalledWith('ec:u1', '123456', { newEmail: 'new@owl.post' })
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@owl.post' }))
})
it('rejects a bad email-change code', async () => {
  m.consumeCode.mockResolvedValueOnce(null)
  expect(await confirmEmailChange('000000')).toEqual({ ok: false, error: 'code' })
})
it('applies the email change on a good code', async () => {
  expect(await confirmEmailChange('123456')).toEqual({ ok: true })
  expect(m.update).toHaveBeenCalled()
})
it('mails the current address on deletion request', async () => {
  expect(await requestAccountDeletion()).toEqual({ ok: true })
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@owl.post' }))
})
it('rejects a bad deletion code', async () => {
  m.consumeCode.mockResolvedValueOnce(null)
  expect(await confirmAccountDeletion('000000')).toEqual({ ok: false, error: 'code' })
})
it('deletes on a good code', async () => {
  expect(await confirmAccountDeletion('123456')).toEqual({ ok: true })
  expect(m.deleteUserById).toHaveBeenCalledWith(expect.anything(), 'u1')
})
it('returns export data', async () => {
  const r = await exportMyData()
  expect(r.ok).toBe(true)
  expect(m.getUserExport).toHaveBeenCalledWith(expect.anything(), 'u1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- src/lib/__tests__/settings-actions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// app/web/src/lib/settings-actions.ts
'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { user, deleteUserById, getUserExport, type UserExport } from '@revelio/db'
import { usernameAvailable, emailHasAccount } from '@/lib/auth-actions'
import { generateCode, storeCode, consumeCode, emailChangeId, deleteId } from '@/lib/account-codes'
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
import { getCachedSiteSettings } from '@/lib/site-settings'

export type SettingsResult = { ok: true } | { ok: false; error: string }

const norm = (s: string) => s.trim().toLowerCase()

export async function updateUsername(username: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const value = username.trim()
  if (!value) return { ok: false, error: 'invalid' }
  if (norm(value) === norm(session.user.username ?? '')) return { ok: false, error: 'unchanged' }
  if (!(await usernameAvailable(value))) return { ok: false, error: 'taken' }
  try {
    const db = getDb()
    await db.update(user).set({ username: value, displayUsername: value }).where(eq(user.id, session.user.id))
    revalidatePath('/settings')
    return { ok: true }
  } catch {
    return { ok: false, error: 'taken' } // unique-violation race
  }
}

async function sendCodeMail(to: string, otp: string, type: 'change-email' | 'delete-account') {
  const settings = await getCachedSiteSettings()
  const { subject, html, text } = await renderOtpEmail({ otp, type, contactEmail: settings?.contactEmail ?? '' })
  await sendMail({ to, subject, html, text })
}

export async function requestEmailChange(newEmail: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const value = newEmail.trim()
  if (!value) return { ok: false, error: 'invalid' }
  if (norm(value) === norm(session.user.email)) return { ok: false, error: 'same-email' }
  if (await emailHasAccount(value)) return { ok: false, error: 'email-taken' }
  try {
    const code = generateCode()
    await storeCode(emailChangeId(session.user.id), code, { newEmail: value })
    await sendCodeMail(value, code, 'change-email')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function confirmEmailChange(code: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const extra = await consumeCode(emailChangeId(session.user.id), code.trim())
  if (!extra?.newEmail) return { ok: false, error: 'code' }
  try {
    const db = getDb()
    await db.update(user).set({ email: extra.newEmail, emailVerified: true }).where(eq(user.id, session.user.id))
    revalidatePath('/settings')
    return { ok: true }
  } catch {
    return { ok: false, error: 'email-taken' } // unique-violation race
  }
}

export async function requestAccountDeletion(): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  try {
    const code = generateCode()
    await storeCode(deleteId(session.user.id), code)
    await sendCodeMail(session.user.email, code, 'delete-account')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function confirmAccountDeletion(code: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const extra = await consumeCode(deleteId(session.user.id), code.trim())
  if (!extra) return { ok: false, error: 'code' }
  await deleteUserById(getDb(), session.user.id) // DB cascades remove decks/collection/likes/views/sessions
  return { ok: true }
}

export async function exportMyData(): Promise<{ ok: true; data: UserExport } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  try {
    return { ok: true, data: await getUserExport(getDb(), session.user.id) }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- src/lib/__tests__/settings-actions.test.ts`
Expected: PASS (all cases). Also run `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/settings-actions.ts app/web/src/lib/__tests__/settings-actions.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add settings server actions (username, email OTP, delete OTP, export)"
```

---

### Task 6: Settings route, shell, nav, and account-menu link

**Files:**
- Create: `app/web/src/app/[locale]/settings/page.tsx`
- Create: `app/web/src/components/settings/types.ts`
- Create: `app/web/src/components/settings/settings-shell.tsx`
- Create: `app/web/src/components/settings/settings-nav.tsx`
- Modify: `app/web/src/components/account-menu.tsx` (add Settings link)
- Test: `app/web/src/components/settings/__tests__/settings-shell.test.tsx`

**Interfaces:**
- Produces:
  - `type SettingsSection = 'profile' | 'email' | 'data' | 'danger'`
  - `type SettingsUser = { id: string; username: string | null; displayUsername: string | null; email: string; role: string | null; createdAt: string }`
  - `SettingsShell({ user }: { user: SettingsUser })` (client) — owns active-section state, renders nav + the four panes.
  - `SettingsNav({ active, onSelect }: { active: SettingsSection; onSelect: (s: SettingsSection) => void })` (client) — collection-style `ResponsiveSidebar`.
- Consumes (Tasks 7–10 fill panes): `ProfilePane`, `EmailPane`, `DataPane`, `DangerPane`. In THIS task the four panes are minimal placeholders (`<section>{t('<section>.title')}</section>`), replaced in later tasks.

- [ ] **Step 1: Create the shared types**

```ts
// app/web/src/components/settings/types.ts
export type SettingsSection = 'profile' | 'email' | 'data' | 'danger'

export type SettingsUser = {
  id: string
  username: string | null
  displayUsername: string | null
  email: string
  role: string | null
  createdAt: string
}
```

- [ ] **Step 2: Write the failing shell test**

```tsx
// app/web/src/components/settings/__tests__/settings-shell.test.tsx
import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SettingsShell } from '../settings-shell'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SettingsShell user={user} />
    </NextIntlClientProvider>,
  )
}

it('shows the Profile pane by default', () => {
  renderShell()
  expect(screen.getByRole('heading', { name: en.settings.profile.title })).toBeInTheDocument()
})

it('switches to the Danger zone pane when its nav item is clicked', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: en.settings.nav.danger }))
  expect(screen.getByRole('heading', { name: en.settings.danger.title })).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- src/components/settings/__tests__/settings-shell.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the nav** (reuses the collection rail styling)

```tsx
// app/web/src/components/settings/settings-nav.tsx
'use client'
import { useTranslations } from 'next-intl'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { cn } from '@/lib/utils'
import type { SettingsSection } from './types'

const SECTIONS: SettingsSection[] = ['profile', 'email', 'data', 'danger']

function NavList({ active, onSelect }: { active: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const t = useTranslations('settings.nav')
  return (
    <nav className="flex flex-col gap-1">
      {SECTIONS.map((s) => {
        const on = s === active
        const danger = s === 'danger'
        return (
          <button key={s} type="button" onClick={() => onSelect(s)} data-active={on}
            className={cn(
              'rounded-lg px-3 py-2 text-left text-sm transition-colors',
              on
                ? cn('font-semibold text-foreground',
                    danger
                      ? 'bg-gradient-to-r from-destructive/20 to-destructive/5 shadow-[inset_3px_0_0_var(--color-destructive)]'
                      : 'bg-gradient-to-r from-accent/25 to-accent/10 shadow-[inset_3px_0_0_var(--color-primary)]')
                : cn('font-medium hover:bg-accent/50', danger && 'text-destructive'),
            )}>
            {t(s)}
          </button>
        )
      })}
    </nav>
  )
}

export function SettingsNav({ active, onSelect }: { active: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const t = useTranslations('settings')
  return (
    <ResponsiveSidebar
      title={t('menuTitle')}
      railClassName="w-64"
      drawerClassName="w-72"
      rail={<NavList active={active} onSelect={onSelect} />}
      drawer={(close) => <NavList active={active} onSelect={(s) => { onSelect(s); close() }} />}
    />
  )
}
```

- [ ] **Step 5: Implement the shell with placeholder panes**

```tsx
// app/web/src/components/settings/settings-shell.tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SettingsNav } from './settings-nav'
import type { SettingsSection, SettingsUser } from './types'

export function SettingsShell({ user }: { user: SettingsUser }) {
  const [active, setActive] = useState<SettingsSection>('profile')
  const t = useTranslations('settings')
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <div className="mt-6 flex flex-col gap-6 min-[1024px]:flex-row min-[1024px]:gap-8">
        <SettingsNav active={active} onSelect={setActive} />
        <div className="min-w-0 flex-1">
          {active === 'profile' && <section aria-labelledby="s-profile"><h2 id="s-profile">{t('profile.title')}</h2></section>}
          {active === 'email' && <section aria-labelledby="s-email"><h2 id="s-email">{t('email.title')}</h2></section>}
          {active === 'data' && <section aria-labelledby="s-data"><h2 id="s-data">{t('data.title')}</h2></section>}
          {active === 'danger' && <section aria-labelledby="s-danger"><h2 id="s-danger">{t('danger.title')}</h2></section>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement the gated route**

```tsx
// app/web/src/app/[locale]/settings/page.tsx
import type { Metadata } from 'next'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { getLocale } from 'next-intl/server'
import { SettingsShell } from '@/components/settings/settings-shell'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function SettingsPage() {
  const session = await getSession()
  const locale = await getLocale()
  if (!session?.user) redirect({ href: '/login', locale })
  const u = session!.user
  return (
    <SettingsShell
      user={{
        id: u.id, username: u.username ?? null, displayUsername: u.displayUsername ?? null,
        email: u.email, role: u.role ?? null,
        createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      }}
    />
  )
}
```

Note: confirm the exact `redirect` signature against `app/web/i18n/navigation.ts`; if the local helper is `redirect(path)` rather than `redirect({href, locale})`, use that form. (`getDeckForViewer`-style pages in the repo already use the locale navigation helpers — follow the existing call shape.)

- [ ] **Step 7: Add the account-menu link**

In `app/web/src/components/account-menu.tsx`, add an item above the sign-out item (and import a settings icon, e.g. `Settings` from `lucide-react`):

```tsx
<DropdownMenuItem asChild>
  <Link href="/settings"><Settings />{tNav('settings')}</Link>
</DropdownMenuItem>
<DropdownMenuSeparator />
```

Place it after the `{isEditor && ...}` block and before the sign-out item so every signed-in user sees it.

- [ ] **Step 8: Run tests + build check**

Run: `npm test -w web -- src/components/settings/__tests__/settings-shell.test.tsx`
Expected: PASS (2 tests).
Run: `npm run typecheck` and `npm run lint -w web`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/web/src/app/\[locale\]/settings app/web/src/components/settings app/web/src/components/account-menu.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add gated settings route, shell, nav, and account-menu link"
```

---

### Task 7: Profile pane (username)

**Files:**
- Create: `app/web/src/components/settings/profile-pane.tsx`
- Modify: `app/web/src/components/settings/settings-shell.tsx` (render `<ProfilePane user={user} />` for the profile section)
- Test: `app/web/src/components/settings/__tests__/profile-pane.test.tsx`

**Interfaces:**
- Consumes: `updateUsername` (`@/lib/settings-actions`), `usernameAvailable` (`@/lib/auth-actions`), `makeUsernameSchema`, `SettingsUser`.
- Produces: `ProfilePane({ user }: { user: SettingsUser })`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/settings/__tests__/profile-pane.test.tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  updateUsername: vi.fn(async () => ({ ok: true })),
  usernameAvailable: vi.fn(async () => true),
  toastSuccess: vi.fn(), toastError: vi.fn(),
}))
vi.mock('@/lib/settings-actions', () => ({ updateUsername: m.updateUsername }))
vi.mock('@/lib/auth-actions', () => ({ usernameAvailable: m.usernameAvailable }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { ProfilePane } from '../profile-pane'
const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><ProfilePane user={user} /></NextIntlClientProvider>,
)
beforeEach(() => { m.updateUsername.mockReset().mockResolvedValue({ ok: true }); m.toastSuccess.mockReset() })

it('saves a changed username and toasts success', async () => {
  renderPane()
  const input = screen.getByLabelText(en.settings.profile.usernameLabel)
  await userEvent.clear(input); await userEvent.type(input, 'bob')
  await userEvent.click(screen.getByRole('button', { name: en.settings.profile.save }))
  expect(m.updateUsername).toHaveBeenCalledWith('bob')
  expect(m.toastSuccess).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/settings/__tests__/profile-pane.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pane**

```tsx
// app/web/src/components/settings/profile-pane.tsx
'use client'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateUsername } from '@/lib/settings-actions'
import { usernameAvailable } from '@/lib/auth-actions'
import { makeUsernameSchema } from '@/lib/schemas/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import type { SettingsUser } from './types'

export function ProfilePane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.profile')
  const tv = useTranslations('validation')
  const [pending, start] = useTransition()
  const [checking, setChecking] = useState(false)
  const form = useForm({
    resolver: zodResolver(makeUsernameSchema((k) => tv(k))),
    defaultValues: { username: user.displayUsername ?? user.username ?? '' },
    mode: 'onSubmit', reValidateMode: 'onChange',
  })

  const current = (user.username ?? '').trim().toLowerCase()

  function onSubmit(values: { username: string }) {
    start(async () => {
      const next = values.username.trim()
      if (next.toLowerCase() === current) { form.setError('username', { message: t('unchanged') }); return }
      setChecking(true)
      const free = await usernameAvailable(next).finally(() => setChecking(false))
      if (!free) { form.setError('username', { message: t('taken') }); return }
      try {
        const res = await updateUsername(next)
        if (res.ok) toast.success(t('saved'))
        else toast.error(res.error === 'taken' ? t('taken') : res.error === 'unchanged' ? t('unchanged') : t('saveError'))
      } catch { toast.error(t('saveError')) }
    })
  }

  return (
    <section aria-labelledby="s-profile" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-profile" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-sm space-y-4">
          <FormField control={form.control} name="username" render={({ field }) => (
            <FormItem>
              <Label htmlFor="username">{t('usernameLabel')}</Label>
              <FormControl><Input id="username" autoComplete="off" {...field} /></FormControl>
              {checking && <p className="text-xs text-muted-foreground">{t('checking')}</p>}
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" disabled={pending || checking}>{t('save')}</Button>
        </form>
      </Form>

      <dl className="mt-6 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
        <div className="flex gap-2"><dt className="font-medium">{t('emailLabel')}:</dt><dd>{user.email}</dd></div>
        <div className="flex gap-2"><dt className="font-medium">{t('roleLabel')}:</dt><dd>{user.role ?? 'user'}</dd></div>
        <div className="flex gap-2"><dt className="font-medium">{t('joinedLabel')}:</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
      </dl>
    </section>
  )
}
```

- [ ] **Step 4: Wire it into the shell**

In `settings-shell.tsx`, replace the profile placeholder with `import { ProfilePane } from './profile-pane'` and `{active === 'profile' && <ProfilePane user={user} />}`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w web -- src/components/settings/__tests__/profile-pane.test.tsx`
Expected: PASS. Also re-run the shell test — its "Profile pane by default" assertion still finds the `settings.profile.title` heading.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/settings/profile-pane.tsx app/web/src/components/settings/settings-shell.tsx app/web/src/components/settings/__tests__/profile-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): settings profile pane with username change"
```

---

### Task 8: Email pane (OTP change flow)

**Files:**
- Create: `app/web/src/components/settings/email-pane.tsx`
- Modify: `app/web/src/components/settings/settings-shell.tsx`
- Test: `app/web/src/components/settings/__tests__/email-pane.test.tsx`

**Interfaces:**
- Consumes: `requestEmailChange`, `confirmEmailChange` (`@/lib/settings-actions`), `makeNewEmailSchema`, `SettingsUser`, `InputOTP*`.
- Produces: `EmailPane({ user }: { user: SettingsUser })`. Two-step local state: `'idle'` (new-email form) → `'code'` (OTP entry).

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/settings/__tests__/email-pane.test.tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  requestEmailChange: vi.fn(async () => ({ ok: true })),
  confirmEmailChange: vi.fn(async () => ({ ok: true })),
  toastSuccess: vi.fn(), toastError: vi.fn(),
}))
vi.mock('@/lib/settings-actions', () => ({ requestEmailChange: m.requestEmailChange, confirmEmailChange: m.confirmEmailChange }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { EmailPane } from '../email-pane'
const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><EmailPane user={user} /></NextIntlClientProvider>,
)
beforeEach(() => { m.requestEmailChange.mockReset().mockResolvedValue({ ok: true }) })

it('requests a code, then reveals the OTP step', async () => {
  renderPane()
  await userEvent.type(screen.getByLabelText(en.settings.email.newLabel), 'new@owl.post')
  await userEvent.click(screen.getByRole('button', { name: en.settings.email.sendCode }))
  expect(m.requestEmailChange).toHaveBeenCalledWith('new@owl.post')
  expect(await screen.findByLabelText(en.settings.email.codeLabel)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/settings/__tests__/email-pane.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// app/web/src/components/settings/email-pane.tsx
'use client'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { requestEmailChange, confirmEmailChange } from '@/lib/settings-actions'
import { makeNewEmailSchema } from '@/lib/schemas/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import type { SettingsUser } from './types'

const errKey = (e: string) =>
  e === 'same-email' ? 'sameEmail' : e === 'email-taken' ? 'emailTaken' : 'requestError'

export function EmailPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.email')
  const tv = useTranslations('validation')
  const [step, setStep] = useState<'idle' | 'code'>('idle')
  const [target, setTarget] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const form = useForm({
    resolver: zodResolver(makeNewEmailSchema((k) => tv(k))),
    defaultValues: { email: '' }, mode: 'onSubmit', reValidateMode: 'onChange',
  })

  function onRequest(values: { email: string }) {
    start(async () => {
      try {
        const res = await requestEmailChange(values.email.trim())
        if (res.ok) { setTarget(values.email.trim()); setStep('code'); setCode(''); setCodeError(null) }
        else form.setError('email', { message: t(errKey(res.error)) })
      } catch { form.setError('email', { message: t('requestError') }) }
    })
  }

  function onConfirm() {
    start(async () => {
      setCodeError(null)
      try {
        const res = await confirmEmailChange(code)
        if (res.ok) { toast.success(t('updated', { email: target })); setStep('idle'); form.reset() }
        else setCodeError(t('invalidCode'))
      } catch { setCodeError(t('invalidCode')) }
    })
  }

  return (
    <section aria-labelledby="s-email" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-email" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>

      <p className="mb-4 text-sm"><span className="text-muted-foreground">{t('currentLabel')}: </span>{user.email}</p>

      {step === 'idle' ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onRequest)} className="max-w-sm space-y-4">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <Label htmlFor="new-email">{t('newLabel')}</Label>
                <FormControl><Input id="new-email" type="email" autoComplete="off" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" disabled={pending}>{t('sendCode')}</Button>
          </form>
        </Form>
      ) : (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-muted-foreground">{t('codeSent', { email: target })}</p>
          <div className="space-y-2">
            <Label htmlFor="email-code">{t('codeLabel')}</Label>
            <InputOTP id="email-code" maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup data-invalid={!!codeError}>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={onConfirm} disabled={pending || code.length !== 6}>{t('confirm')}</Button>
            <Button type="button" variant="outline" onClick={() => setStep('idle')}>{t('cancel')}</Button>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Wire it into the shell** — import `EmailPane`, render `{active === 'email' && <EmailPane user={user} />}`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w web -- src/components/settings/__tests__/email-pane.test.tsx`
Expected: PASS. Confirm `InputOTP` accepts an `id` prop; if not, wrap the label association via `htmlFor` on the group container or `aria-label={t('codeLabel')}` on `InputOTP` and assert with `getByLabelText` accordingly.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/settings/email-pane.tsx app/web/src/components/settings/settings-shell.tsx app/web/src/components/settings/__tests__/email-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): settings email pane with OTP change flow"
```

---

### Task 9: Data pane (export)

**Files:**
- Create: `app/web/src/components/settings/data-pane.tsx`
- Modify: `app/web/src/components/settings/settings-shell.tsx`
- Test: `app/web/src/components/settings/__tests__/data-pane.test.tsx`

**Interfaces:**
- Consumes: `exportMyData` (`@/lib/settings-actions`), `SettingsUser`.
- Produces: `DataPane({ user }: { user: SettingsUser })`. On success builds a `Blob` and triggers a download named `revelio-export-<username>.json`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/settings/__tests__/data-pane.test.tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  exportMyData: vi.fn(async () => ({ ok: true, data: { profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] } })),
  toastError: vi.fn(),
}))
vi.mock('@/lib/settings-actions', () => ({ exportMyData: m.exportMyData }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: m.toastError } }))

import { DataPane } from '../data-pane'
const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><DataPane user={user} /></NextIntlClientProvider>,
)
beforeEach(() => {
  m.exportMyData.mockReset().mockResolvedValue({ ok: true, data: { profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] } })
  m.toastError.mockReset()
  // jsdom lacks these; stub so the download path doesn't throw
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
})

it('calls exportMyData when the button is clicked', async () => {
  renderPane()
  await userEvent.click(screen.getByRole('button', { name: en.settings.data.export }))
  expect(m.exportMyData).toHaveBeenCalled()
})

it('toasts an error when export fails', async () => {
  m.exportMyData.mockResolvedValueOnce({ ok: false, error: 'failed' })
  renderPane()
  await userEvent.click(screen.getByRole('button', { name: en.settings.data.export }))
  expect(m.toastError).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/settings/__tests__/data-pane.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// app/web/src/components/settings/data-pane.tsx
'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { exportMyData } from '@/lib/settings-actions'
import { Button } from '@/components/ui/button'
import type { SettingsUser } from './types'

export function DataPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.data')
  const [pending, start] = useTransition()

  function onExport() {
    start(async () => {
      try {
        const res = await exportMyData()
        if (!res.ok) { toast.error(t('exportError')); return }
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `revelio-export-${user.username ?? user.id}.json`
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      } catch { toast.error(t('exportError')) }
    })
  }

  return (
    <section aria-labelledby="s-data" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-data" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>
      <Button type="button" onClick={onExport} disabled={pending}>{pending ? t('exporting') : t('export')}</Button>
    </section>
  )
}
```

- [ ] **Step 4: Wire it into the shell** — `{active === 'data' && <DataPane user={user} />}`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w web -- src/components/settings/__tests__/data-pane.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/settings/data-pane.tsx app/web/src/components/settings/settings-shell.tsx app/web/src/components/settings/__tests__/data-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): settings data pane with JSON export download"
```

---

### Task 10: Danger pane (delete with OTP)

**Files:**
- Create: `app/web/src/components/settings/danger-pane.tsx`
- Modify: `app/web/src/components/settings/settings-shell.tsx`
- Test: `app/web/src/components/settings/__tests__/danger-pane.test.tsx`

**Interfaces:**
- Consumes: `requestAccountDeletion`, `confirmAccountDeletion` (`@/lib/settings-actions`), `signOut` (`@/lib/auth-client`), `useRouter` (`@/../i18n/navigation`), `AlertDialog*`, `InputOTP*`, `SettingsUser`.
- Produces: `DangerPane({ user }: { user: SettingsUser })`. Opening the dialog fires `requestAccountDeletion`; confirming with a valid code deletes, signs out, and redirects home.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/settings/__tests__/danger-pane.test.tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  requestAccountDeletion: vi.fn(async () => ({ ok: true })),
  confirmAccountDeletion: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => {}), push: vi.fn(),
  toastSuccess: vi.fn(), toastError: vi.fn(),
}))
vi.mock('@/lib/settings-actions', () => ({ requestAccountDeletion: m.requestAccountDeletion, confirmAccountDeletion: m.confirmAccountDeletion }))
vi.mock('@/lib/auth-client', () => ({ signOut: m.signOut }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: m.push }) }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { DangerPane } from '../danger-pane'
const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><DangerPane user={user} /></NextIntlClientProvider>,
)
beforeEach(() => { m.requestAccountDeletion.mockReset().mockResolvedValue({ ok: true }) })

it('requests a deletion code when the dialog opens', async () => {
  renderPane()
  await userEvent.click(screen.getByRole('button', { name: en.settings.danger.deleteAction }))
  expect(m.requestAccountDeletion).toHaveBeenCalled()
  expect(await screen.findByText(en.settings.danger.dialogTitle)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/settings/__tests__/danger-pane.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// app/web/src/components/settings/danger-pane.tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { requestAccountDeletion, confirmAccountDeletion } from '@/lib/settings-actions'
import { signOut } from '@/lib/auth-client'
import { useRouter } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { SettingsUser } from './types'

export function DangerPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.danger')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function openDialog() {
    setCode(''); setCodeError(null); setOpen(true)
    start(async () => {
      try {
        const res = await requestAccountDeletion()
        if (!res.ok) { toast.error(t('sendError')); setOpen(false) }
      } catch { toast.error(t('sendError')); setOpen(false) }
    })
  }

  function onConfirm() {
    start(async () => {
      setCodeError(null)
      try {
        const res = await confirmAccountDeletion(code)
        if (!res.ok) { setCodeError(t('invalidCode')); return }
        toast.success(t('deleted'))
        await signOut().catch(() => {})
        router.push('/')
      } catch { setCodeError(t('invalidCode')) }
    })
  }

  return (
    <section aria-labelledby="s-danger" className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <h2 id="s-danger" className="text-lg font-semibold text-destructive">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p>
      <ul className="my-4 list-disc pl-5 text-sm text-muted-foreground">
        <li>{t('item1')}</li><li>{t('item2')}</li><li>{t('item3')}</li>
      </ul>
      <Button type="button" variant="destructive" onClick={openDialog}>{t('deleteAction')}</Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dialogBody', { email: user.email })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-code">{t('codeLabel')}</Label>
            <InputOTP id="delete-code" maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup data-invalid={!!codeError}>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t('cancel')}</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending || code.length !== 6}>{t('confirmDelete')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
```

- [ ] **Step 4: Wire it into the shell** — `{active === 'danger' && <DangerPane user={user} />}`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w web -- src/components/settings/__tests__/danger-pane.test.tsx`
Expected: PASS. Confirm `signOut` is exported from `@/lib/auth-client` (it is — `account-menu`'s `use-sign-out` uses it); if the export name differs, match it.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/settings/danger-pane.tsx app/web/src/components/settings/settings-shell.tsx app/web/src/components/settings/__tests__/danger-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): settings danger pane with OTP-confirmed account deletion"
```

---

### Task 11: e2e smoke + full verification

**Files:**
- Create: `app/web/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: the running prod server (via the existing Playwright config) and whatever auth/seed helpers the other e2e specs use.

- [ ] **Step 1: Inspect an existing spec for the auth/seed helper**

Read `app/web/e2e/` for how a signed-in user is established (helper or storageState). Reuse that exact mechanism — do not invent a new login path.

- [ ] **Step 2: Write the spec**

```ts
// app/web/e2e/settings.spec.ts
import { test, expect } from '@playwright/test'
// import { signIn } from './helpers'  // use the project's existing helper

test('signed-in user can open settings and see all sections', async ({ page }) => {
  // await signIn(page)  // establish the authenticated session per the existing helper
  await page.goto('/en/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Danger zone' }).click()
  await expect(page.getByText('Deleting your account is permanent.', { exact: false })).toBeVisible()
})

test('settings redirects a logged-out visitor to login', async ({ page }) => {
  await page.goto('/en/settings')
  await expect(page).toHaveURL(/\/login/)
})
```

If the project has no reusable sign-in helper, keep only the redirect test (which needs no auth) and note the manual check for the signed-in path.

- [ ] **Step 3: Run e2e**

Run: `npm run e2e -w web`
Expected: PASS (or the redirect test passes and the authed test is documented as manual if no helper exists).

- [ ] **Step 4: Full verification gate**

Run each and confirm output:
- `npm run typecheck` → 0 errors
- `npm test -w web` → all pass
- `npm run lint -w web` → 0 errors
- `npm run check -w @revelio/db` and `npm run verify -w @revelio/db` → pass (no schema drift; we added no migration)

- [ ] **Step 5: Commit**

```bash
git add app/web/e2e/settings.spec.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "test(web): e2e smoke for settings page"
```

---

## Manual verification checklist (post-implementation)

- Sign in, open the account menu → **Settings** link present → lands on `/settings`, Profile pane by default.
- Change username to a free name → success toast; to a taken name → inline "taken"; to the current name → "unchanged".
- Email tab: enter a new address → code arrives at the **new** inbox → correct code applies the change, a wrong/expired code shows the inline error.
- Your data: **Export as JSON** downloads `revelio-export-<username>.json` with profile/decks/collection/likes.
- Danger zone: opening the dialog emails a code to the **current** address; a valid code deletes the account (decks/collection/likes gone), signs out, redirects home.
- Logged-out visit to `/settings` redirects to `/login`.
- Every string renders in German under `/de/settings`.

## Notes / decisions carried from the spec

- **No migration.** Codes live in the existing `verification` table under namespaced identifiers; `npm run verify -w @revelio/db` must stay green.
- **Session invalidation on email change:** out of scope (other sessions keep working). Deleting the account cascades its `session` rows, so those sessions die immediately.
- **Email is English-only** (the OTP template pins `locale: 'en'` by existing design); the settings UI is fully localized (en + de).
- **Username write is a direct Drizzle update** guarded by `usernameAvailable()` + the `user.username` unique constraint, mirroring `auth-actions.ts`, rather than Better Auth's client `updateUser` — keeps the uniform server-action `{ ok }` contract.

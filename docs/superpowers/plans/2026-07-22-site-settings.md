# Site Settings Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DB-backed, admin-editable site-settings singleton (operator/legal fields + GitHub link), read through a tag-cached accessor, and migrate the overlapping `CONTACT_EMAIL`/`GITHUB_URL` env vars into it.

**Architecture:** A typed singleton `site_settings` table in `@revelio/db` with `getSiteSettings`/`upsertSiteSettings` queries. Web wraps the read in `unstable_cache` (tag `site-settings`); the admin save action invalidates the tag with `revalidateTag`. The OTP email path and footer stop reading env and consume the store instead. Admin edits happen at `/admin/settings` (admin-only), mirroring the existing `set-actions` + `set-form` conventions.

**Tech Stack:** Drizzle ORM / Postgres, Next.js 16 App Router (React 19) server components + server actions, next-intl, react-hook-form + zod, vitest (+ Testcontainers Postgres via `ingest/test/helpers.ts`).

## Global Constraints

- All app commands run from `app/` (npm workspaces root). There is no root `package.json`.
- Migrations are **append-only**: edit `db/src/schema.ts` → `npm run generate` from `app/db` → review generated `db/drizzle/NNNN_*.sql` → commit schema + migration together. Never touch `0000`. `npm run verify` (from `app/db`) is CI-enforced and must pass. The next migration number is `0012`.
- Dependency direction: `core ← {search, db} ← {ingest, web}`. `@revelio/db` must not import from web.
- Server actions are `'use server'`, authorize with `requireRole('admin')`, and never leak secrets to the client.
- Web forms use react-hook-form + `zodResolver` + translated `validation` messages; server-side the same schema is instantiated with the identity translator `(k) => k` (validation copy comes from the client).
- Commit with Conventional Commits. Do **not** add any Claude/Claude Code attribution to commits.
- All prose/docs in English; user-facing strings live in `web/messages/{en,de}.json` (German authored natively).

---

### Task 1: `site_settings` schema + migration (`@revelio/db`)

**Files:**
- Modify: `app/db/src/schema.ts` (add table near the end, after existing core tables)
- Modify: `app/db/src/index.ts:2-7` (add `siteSettings` to the re-export list)
- Create: `app/db/drizzle/0012_*.sql` (generated)

**Interfaces:**
- Produces: `siteSettings` pgTable export with columns `id, operatorName, operatorAddress, contactEmail, hostingProvider, responsiblePerson, githubUrl, updatedAt`.

- [ ] **Step 1: Add the table to `schema.ts`**

Append to `app/db/src/schema.ts` (uses `pgTable, text, timestamp` already imported at the top):

```ts
// --- site settings (admin-editable singleton) ---
// One row (id = 'singleton') holding operator/legal values shown on the Imprint
// and Privacy pages plus the footer GitHub link. All content columns are nullable:
// the row may be partially filled and consumers treat null as "not set".
export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey().default('singleton'),
  operatorName: text('operator_name'),
  operatorAddress: text('operator_address'),
  contactEmail: text('contact_email'),
  hostingProvider: text('hosting_provider'),
  responsiblePerson: text('responsible_person'),
  githubUrl: text('github_url'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

- [ ] **Step 2: Export it from `index.ts`**

In `app/db/src/index.ts`, add `siteSettings` to the existing `export { … } from './schema'` block (the list that currently ends `…setLocalizations, decks, deckCards, deckLikes, deckViews,`):

```ts
  subTypeLocalizations, setLocalizations, decks, deckCards, deckLikes, deckViews,
  siteSettings,
```

- [ ] **Step 3: Generate the migration**

Run: `cd app/db && npm run generate`
Expected: a new file `app/db/drizzle/0012_*.sql` containing `CREATE TABLE "site_settings"` with the seven columns and a primary key on `id`. Open it and confirm it is a plain `CREATE TABLE` (no DROP of any existing table).

- [ ] **Step 4: Verify schema ↔ migration consistency**

Run: `cd app/db && npm run verify && npm run check`
Expected: both PASS (no drift; journal/snapshot consistent).

- [ ] **Step 5: Commit**

```bash
cd app
git add db/src/schema.ts db/src/index.ts db/drizzle
git commit -m "feat(db): add site_settings singleton table"
```

---

### Task 2: `getSiteSettings` / `upsertSiteSettings` queries (`@revelio/db`)

**Files:**
- Modify: `app/db/src/queries.ts` (import `siteSettings`; add two functions + types at the end)
- Modify: `app/db/src/index.ts` (export the functions + `SiteSettings` type)
- Test: `app/ingest/test/site-settings.test.ts` (new; Testcontainers via `withMigratedDb`)

**Interfaces:**
- Consumes: `siteSettings` (Task 1), `DB` type, `eq` from drizzle-orm (already imported in `queries.ts:1`).
- Produces:
  - `type SiteSettings = typeof siteSettings.$inferSelect`
  - `type SiteSettingsInput` — all six content fields as `string | null`
  - `getSiteSettings(db: DB): Promise<SiteSettings | null>`
  - `upsertSiteSettings(db: DB, values: SiteSettingsInput): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/site-settings.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getSiteSettings, upsertSiteSettings } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => { ctx = await withMigratedDb() }, 60_000)
afterAll(async () => { await ctx.stop() })

const FULL = {
  operatorName: 'Jane Doe',
  operatorAddress: 'Main St 1\n12345 Town',
  contactEmail: 'hi@revelio.cards',
  hostingProvider: 'Acme VPS (EU)',
  responsiblePerson: null,
  githubUrl: 'https://github.com/P4PER/revelio',
}

describe('site settings queries', () => {
  it('returns null when unset', async () => {
    expect(await getSiteSettings(ctx.db)).toBeNull()
  })

  it('upserts then reads the singleton back', async () => {
    await upsertSiteSettings(ctx.db, FULL)
    const row = await getSiteSettings(ctx.db)
    expect(row).not.toBeNull()
    expect(row!.id).toBe('singleton')
    expect(row!.operatorName).toBe('Jane Doe')
    expect(row!.responsiblePerson).toBeNull()
    expect(row!.githubUrl).toBe('https://github.com/P4PER/revelio')
  })

  it('a second upsert overwrites the same single row and bumps updatedAt', async () => {
    const before = (await getSiteSettings(ctx.db))!.updatedAt.getTime()
    await new Promise((r) => setTimeout(r, 5))
    await upsertSiteSettings(ctx.db, { ...FULL, operatorName: 'John Roe' })
    const rows = await ctx.db.select().from((await import('@revelio/db')).schema.siteSettings)
    expect(rows).toHaveLength(1)
    expect(rows[0].operatorName).toBe('John Roe')
    expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w @revelio/ingest -- site-settings`
Expected: FAIL — `getSiteSettings`/`upsertSiteSettings` are not exported yet.

- [ ] **Step 3: Add the queries**

In `app/db/src/queries.ts`, add `siteSettings` to the schema import on line 4 (append to the existing destructured list), then append at the end of the file:

```ts
const SITE_SETTINGS_ID = 'singleton'

export type SiteSettings = typeof siteSettings.$inferSelect
export type SiteSettingsInput = {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
  responsiblePerson: string | null
  githubUrl: string | null
}

export async function getSiteSettings(db: DB): Promise<SiteSettings | null> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertSiteSettings(db: DB, values: SiteSettingsInput): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ id: SITE_SETTINGS_ID, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { ...values, updatedAt: new Date() },
    })
}
```

- [ ] **Step 4: Export from `index.ts`**

In `app/db/src/index.ts`, add to the `export { … } from './queries'` list: `getSiteSettings, upsertSiteSettings`. Add to the `export type { … } from './queries'` list: `SiteSettings, SiteSettingsInput`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm test -w @revelio/ingest -- site-settings`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd app
git add db/src/queries.ts db/src/index.ts ingest/test/site-settings.test.ts
git commit -m "feat(db): add getSiteSettings/upsertSiteSettings queries"
```

---

### Task 3: Tag-cached settings accessor (`@revelio/web`)

**Files:**
- Create: `app/web/src/lib/site-settings.ts`
- Test: `app/web/src/lib/__tests__/site-settings.test.ts`

**Interfaces:**
- Consumes: `getSiteSettings`, `SiteSettings` (Task 2); `getDb` (`@/lib/db`).
- Produces:
  - `const SITE_SETTINGS_TAG = 'site-settings'`
  - `loadSiteSettings(): Promise<SiteSettings | null>` (uncached, testable inner fn)
  - `getCachedSiteSettings: () => Promise<SiteSettings | null>` (`unstable_cache` wrapper, tag `SITE_SETTINGS_TAG`)

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/site-settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSiteSettings = vi.fn()
vi.mock('@revelio/db', () => ({ getSiteSettings: (...a: unknown[]) => getSiteSettings(...a) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ __db: true }) }))

import { loadSiteSettings, SITE_SETTINGS_TAG } from '../site-settings'

beforeEach(() => getSiteSettings.mockReset())

describe('loadSiteSettings', () => {
  it('reads settings from the db client', async () => {
    getSiteSettings.mockResolvedValue({ id: 'singleton', operatorName: 'Jane' })
    const result = await loadSiteSettings()
    expect(getSiteSettings).toHaveBeenCalledWith({ __db: true })
    expect(result).toEqual({ id: 'singleton', operatorName: 'Jane' })
  })

  it('exposes the cache tag', () => {
    expect(SITE_SETTINGS_TAG).toBe('site-settings')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/lib/__tests__/site-settings.test.ts`
Expected: FAIL — module `../site-settings` does not exist.

- [ ] **Step 3: Create the accessor**

Create `app/web/src/lib/site-settings.ts`:

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { getSiteSettings, type SiteSettings } from '@revelio/db'
import { getDb } from '@/lib/db'

export const SITE_SETTINGS_TAG = 'site-settings'

/** Uncached read — use directly where freshness matters (the admin edit form). */
export async function loadSiteSettings(): Promise<SiteSettings | null> {
  return getSiteSettings(getDb())
}

/**
 * Cached read for render paths (footer, legal pages, OTP email). Hits the DB only
 * on a cache miss; the admin save action busts it via `revalidateTag(SITE_SETTINGS_TAG)`.
 */
export const getCachedSiteSettings = unstable_cache(loadSiteSettings, ['site-settings'], {
  tags: [SITE_SETTINGS_TAG],
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/lib/__tests__/site-settings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd app
git add web/src/lib/site-settings.ts web/src/lib/__tests__/site-settings.test.ts
git commit -m "feat(web): add tag-cached site-settings accessor"
```

---

### Task 4: Migrate `CONTACT_EMAIL` into settings (OTP email path)

**Files:**
- Modify: `app/web/src/lib/email/otp-template.tsx:22-25` (add `contactEmail` to `OtpEmailInput`), `:44-52` (read from prop, not env), `:115` (`renderOtpEmail` signature)
- Modify: `app/web/src/lib/auth.ts` (fetch settings, pass `contactEmail` into `renderOtpEmail`)
- Modify: `app/web/src/lib/email/__tests__/otp-template.test.ts:39-49` (pass param instead of env)
- Modify: `app/.env.example` (remove `CONTACT_EMAIL`)

**Interfaces:**
- Consumes: `getCachedSiteSettings` (Task 3).
- Produces: `renderOtpEmail({ otp, type, contactEmail }): Promise<RenderedEmail>` — `contactEmail: string` (empty string ⇒ contact line omitted).

- [ ] **Step 1: Update the failing tests first**

In `app/web/src/lib/email/__tests__/otp-template.test.ts`, replace the two env-based cases (currently using `vi.stubEnv('CONTACT_EMAIL', …)`) with param-based ones:

```ts
  it('shows the contact mailto link in the footer when a contactEmail is passed', async () => {
    const { html } = await renderOtpEmail({ otp: '123456', type: 'sign-in', contactEmail: 'help@revelio.cards' })
    expect(html).toContain('mailto:help@revelio.cards')
  })

  it('omits the contact line entirely when contactEmail is empty', async () => {
    const { html } = await renderOtpEmail({ otp: '123456', type: 'sign-in', contactEmail: '' })
    expect(html).not.toContain('mailto:')
  })
```

Also update any other `renderOtpEmail({ otp, type })` calls in this file to include `contactEmail: ''`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -w web -- otp-template`
Expected: FAIL — `renderOtpEmail` does not accept `contactEmail`; the argument is unused so the mailto assertion fails.

- [ ] **Step 3: Thread `contactEmail` through the template**

In `app/web/src/lib/email/otp-template.tsx`:

Add to `OtpEmailInput` (currently lines 22-25):

```ts
interface OtpEmailInput {
  otp: string
  type: OtpEmailType
  contactEmail: string
}
```

In `OtpEmail`, destructure the prop and delete the env read (currently line 51 `const contactEmail = process.env.CONTACT_EMAIL ?? ''`):

```ts
function OtpEmail({ otp, type, contactEmail, t }: OtpEmailInput & { t: Translate }) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
```

Update `renderOtpEmail` (line 115) to accept and forward it:

```ts
export async function renderOtpEmail({ otp, type, contactEmail }: OtpEmailInput): Promise<RenderedEmail> {
  const t = otpTranslator()
  const subject = t(`subject.${type}`, { code: otp })
  const element = <OtpEmail otp={otp} type={type} contactEmail={contactEmail} t={t} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}
```

- [ ] **Step 4: Feed it from `auth.ts`**

In `app/web/src/lib/auth.ts`, add the import near the other `@/lib/email` imports:

```ts
import { getCachedSiteSettings } from '@/lib/site-settings'
```

Update the `sendVerificationOTP` body so it passes the settings contact email:

```ts
      async sendVerificationOTP({ email, otp, type }) {
        const kind = type === 'forget-password' ? 'sign-in' : type
        const settings = await getCachedSiteSettings()
        const { subject, html, text } = await renderOtpEmail({
          otp,
          type: kind,
          contactEmail: settings?.contactEmail ?? '',
        })
        await sendMail({ to: email, subject, html, text })
      },
```

- [ ] **Step 5: Remove the env var**

In `app/.env.example`, delete the line `CONTACT_EMAIL=support@revelio.cards`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app && npm test -w web -- otp-template`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd app
git add web/src/lib/email/otp-template.tsx web/src/lib/email/__tests__/otp-template.test.ts web/src/lib/auth.ts .env.example
git commit -m "feat(web): source OTP contact email from site settings"
```

---

### Task 5: Migrate `GITHUB_URL` into settings (footer)

**Files:**
- Modify: `app/web/src/components/site-footer.tsx:49-62` (wrapper fetches settings; view takes `githubUrl` prop)
- Modify: `app/web/src/components/__tests__/site-footer.test.tsx:71-79` (pass prop instead of env)
- Modify: `app/.env.example` (remove `GITHUB_URL`)

**Interfaces:**
- Consumes: `getCachedSiteSettings` (Task 3).
- Produces: `SiteFooterView({ isLoggedIn, githubUrl }: { isLoggedIn: boolean; githubUrl: string | null })`.

- [ ] **Step 1: Update the failing tests first**

In `app/web/src/components/__tests__/site-footer.test.tsx`, replace the two GitHub cases (currently `vi.stubEnv('GITHUB_URL', …)` then rendering `SiteFooterView`) so they pass the prop instead:

```ts
  it('hides the GitHub link when githubUrl is unset', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SiteFooterView isLoggedIn={false} githubUrl={null} />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByText('GitHub')).toBeNull()
  })

  it('renders an external GitHub link when githubUrl is set', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SiteFooterView isLoggedIn={false} githubUrl="https://github.com/P4PER/revelio" />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('GitHub').closest('a')).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
  })
```

(Match the exact `render(...)` wrapper the existing tests use — reuse the file's existing helper/imports if it has one; keep other `SiteFooterView` renders in the file compiling by adding `githubUrl={null}`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -w web -- site-footer`
Expected: FAIL — `SiteFooterView` does not accept `githubUrl` and still reads env.

- [ ] **Step 3: Move `githubUrl` from env to a prop**

In `app/web/src/components/site-footer.tsx`:

Add the import at the top (with the other `@/lib` imports):

```ts
import { getCachedSiteSettings } from '@/lib/site-settings'
```

Update the async wrapper to fetch settings and pass the prop:

```ts
export async function SiteFooter() {
  const session = await getSession()
  const settings = await getCachedSiteSettings()
  return <SiteFooterView isLoggedIn={!!session?.user} githubUrl={settings?.githubUrl ?? null} />
}
```

Update the view signature and delete the env read (currently line 62 `const githubUrl = process.env.GITHUB_URL`):

```ts
export function SiteFooterView({
  isLoggedIn,
  githubUrl,
}: {
  isLoggedIn: boolean
  githubUrl: string | null
}) {
  const t = useTranslations('footer')
  const year = new Date().getFullYear()
```

The existing `{githubUrl && ( … )}` block already gates rendering on truthiness — no change needed there.

- [ ] **Step 4: Remove the env var**

In `app/.env.example`, delete the line `GITHUB_URL=https://github.com/P4PER/revelio`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npm test -w web -- site-footer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd app
git add web/src/components/site-footer.tsx web/src/components/__tests__/site-footer.test.tsx .env.example
git commit -m "feat(web): source footer GitHub link from site settings"
```

---

### Task 6: Validation schema + save action (`@revelio/web`)

**Files:**
- Create: `app/web/src/lib/schemas/site-settings.ts`
- Create: `app/web/src/lib/site-settings-actions.ts`
- Test: `app/web/src/lib/__tests__/site-settings-actions.test.ts`

**Interfaces:**
- Consumes: `upsertSiteSettings` (Task 2), `requireRole` (`@/lib/session`), `getDb` (`@/lib/db`), `SITE_SETTINGS_TAG` (Task 3), `revalidateTag` (`next/cache`).
- Produces:
  - `makeSiteSettingsSchema(t: (k: string) => string)` → zod object; `type SiteSettingsFormValues = z.infer<…>`
  - `updateSiteSettings(input: unknown): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/site-settings-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireRole = vi.fn()
const upsertSiteSettings = vi.fn()
const revalidateTag = vi.fn()
vi.mock('@/lib/session', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ __db: true }) }))
vi.mock('@revelio/db', () => ({ upsertSiteSettings: (...a: unknown[]) => upsertSiteSettings(...a) }))
vi.mock('@/lib/site-settings', () => ({ SITE_SETTINGS_TAG: 'site-settings' }))
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

import { updateSiteSettings } from '../site-settings-actions'

const VALID = {
  operatorName: 'Jane Doe',
  operatorAddress: 'Main St 1\n12345 Town',
  contactEmail: 'hi@revelio.cards',
  hostingProvider: 'Acme VPS',
  responsiblePerson: '',
  githubUrl: 'https://github.com/P4PER/revelio',
}

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(undefined)
  upsertSiteSettings.mockReset().mockResolvedValue(undefined)
  revalidateTag.mockReset()
})

describe('updateSiteSettings', () => {
  it('rejects a non-admin (requireRole throws)', async () => {
    requireRole.mockRejectedValue(new Error('Forbidden'))
    await expect(updateSiteSettings(VALID)).rejects.toThrow('Forbidden')
    expect(upsertSiteSettings).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const result = await updateSiteSettings({ ...VALID, contactEmail: 'not-an-email' })
    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(upsertSiteSettings).not.toHaveBeenCalled()
  })

  it('rejects an invalid github url', async () => {
    const result = await updateSiteSettings({ ...VALID, githubUrl: 'not a url' })
    expect(result).toEqual({ ok: false, error: 'invalid' })
  })

  it('upserts (blank → null), busts the cache tag, and returns ok', async () => {
    const result = await updateSiteSettings(VALID)
    expect(result).toEqual({ ok: true })
    expect(upsertSiteSettings).toHaveBeenCalledWith(
      { __db: true },
      {
        operatorName: 'Jane Doe',
        operatorAddress: 'Main St 1\n12345 Town',
        contactEmail: 'hi@revelio.cards',
        hostingProvider: 'Acme VPS',
        responsiblePerson: null,
        githubUrl: 'https://github.com/P4PER/revelio',
      },
    )
    expect(revalidateTag).toHaveBeenCalledWith('site-settings')
  })

  it('allows empty contactEmail and githubUrl', async () => {
    const result = await updateSiteSettings({ ...VALID, contactEmail: '', githubUrl: '' })
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- site-settings-actions`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create the schema**

Create `app/web/src/lib/schemas/site-settings.ts`:

```ts
import { z } from 'zod'

type T = (key: string) => string

const isEmail = (v: string) => v === '' || z.string().email().safeParse(v).success
const isUrl = (v: string) => v === '' || z.string().url().safeParse(v).success

export function makeSiteSettingsSchema(t: T) {
  return z.object({
    operatorName: z.string().trim().max(200),
    operatorAddress: z.string().trim().max(1000),
    contactEmail: z.string().trim().refine(isEmail, t('email')),
    hostingProvider: z.string().trim().max(200),
    responsiblePerson: z.string().trim().max(200),
    githubUrl: z.string().trim().refine(isUrl, t('url')),
  })
}

export type SiteSettingsFormValues = z.infer<ReturnType<typeof makeSiteSettingsSchema>>
```

- [ ] **Step 4: Create the action**

Create `app/web/src/lib/site-settings-actions.ts`:

```ts
'use server'
import { revalidateTag } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertSiteSettings } from '@revelio/db'
import { makeSiteSettingsSchema } from '@/lib/schemas/site-settings'
import { SITE_SETTINGS_TAG } from '@/lib/site-settings'

export type SiteSettingsActionResult = { ok: true } | { ok: false; error: string }

// Server-side validation only needs pass/fail; the client form supplies the copy.
const schema = makeSiteSettingsSchema((k) => k)

const nullify = (v: string): string | null => (v.trim() === '' ? null : v.trim())

export async function updateSiteSettings(input: unknown): Promise<SiteSettingsActionResult> {
  await requireRole('admin')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const d = parsed.data
  await upsertSiteSettings(getDb(), {
    operatorName: nullify(d.operatorName),
    operatorAddress: nullify(d.operatorAddress),
    contactEmail: nullify(d.contactEmail),
    hostingProvider: nullify(d.hostingProvider),
    responsiblePerson: nullify(d.responsiblePerson),
    githubUrl: nullify(d.githubUrl),
  })
  revalidateTag(SITE_SETTINGS_TAG)
  return { ok: true }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm test -w web -- site-settings-actions`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
cd app
git add web/src/lib/schemas/site-settings.ts web/src/lib/site-settings-actions.ts web/src/lib/__tests__/site-settings-actions.test.ts
git commit -m "feat(web): add site-settings validation schema and save action"
```

---

### Task 7: Admin form component + i18n (`@revelio/web`)

**Files:**
- Create: `app/web/src/components/site-settings-form.tsx`
- Modify: `app/web/messages/en.json` (add `adminSettings` namespace; add `validation.url`)
- Modify: `app/web/messages/de.json` (same, German)
- Test: `app/web/src/components/__tests__/site-settings-form.test.tsx`

**Interfaces:**
- Consumes: `updateSiteSettings` (Task 6), `makeSiteSettingsSchema` (Task 6), `SiteSettings` (Task 2), the shadcn `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` set (`@/components/ui/form`), `Input`, `AutoTextarea` (`@/components/ui/auto-textarea`), `Button`.
- Produces: `SiteSettingsForm({ initial }: { initial: SiteSettings | null })` (client component). Follows the project's reactive-error pattern (per the inline-errors spec + `set-form.tsx`): RHF `mode: 'onSubmit'` + `reValidateMode: 'onChange'`; per-field validation errors render reactively via shadcn `FormMessage` under each control; the save result uses `sonner` toasts (`toast.success` / `toast.error`) — toasts are reserved for success and non-field save failures. The settings action has no field-specific server error codes, so no `form.setError(field, …)` mapping is needed (unlike set-form's `exists` → `code`).

- [ ] **Step 1: Add the i18n keys**

In `app/web/messages/en.json`, add a top-level `"adminSettings"` block and a `"url"` key inside `"validation"`, and a `"settings"` entry inside `"admin"`:

```jsonc
// inside "validation":
"url": "Enter a valid URL",
// inside "admin":
"settings": { "title": "Settings", "desc": "Operator, legal, and footer details." },
// new top-level namespace:
"adminSettings": {
  "title": "Site settings",
  "intro": "Operator and legal details shown on the Imprint and Privacy pages, plus the footer GitHub link.",
  "operatorName": "Operator name",
  "operatorAddress": "Postal address",
  "contactEmail": "Contact email",
  "hostingProvider": "Hosting provider",
  "responsiblePerson": "Responsible person (optional)",
  "githubUrl": "GitHub URL",
  "save": "Save settings",
  "saved": "Settings saved.",
  "saveError": "Could not save settings."
}
```

In `app/web/messages/de.json`, add the German equivalents:

```jsonc
// inside "validation":
"url": "Bitte eine gültige URL eingeben",
// inside "admin":
"settings": { "title": "Einstellungen", "desc": "Betreiber-, Rechts- und Footer-Angaben." },
// new top-level namespace:
"adminSettings": {
  "title": "Website-Einstellungen",
  "intro": "Betreiber- und Rechtsangaben für Impressum und Datenschutz sowie der GitHub-Link im Footer.",
  "operatorName": "Name des Betreibers",
  "operatorAddress": "Postanschrift",
  "contactEmail": "Kontakt-E-Mail",
  "hostingProvider": "Hosting-Anbieter",
  "responsiblePerson": "Verantwortliche Person (optional)",
  "githubUrl": "GitHub-URL",
  "save": "Einstellungen speichern",
  "saved": "Einstellungen gespeichert.",
  "saveError": "Einstellungen konnten nicht gespeichert werden."
}
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/__tests__/site-settings-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SiteSettingsForm } from '../site-settings-form'

const update = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/site-settings-actions', () => ({
  updateSiteSettings: (...a: unknown[]) => update(...a),
}))
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
vi.mock('sonner', () => ({ toast }))

function renderForm(initial: Parameters<typeof SiteSettingsForm>[0]['initial'] = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteSettingsForm initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  update.mockClear().mockResolvedValue({ ok: true })
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('SiteSettingsForm', () => {
  it('prefills fields from initial settings', () => {
    renderForm({
      id: 'singleton', operatorName: 'Jane Doe', operatorAddress: 'Main St 1',
      contactEmail: 'hi@revelio.cards', hostingProvider: 'Acme', responsiblePerson: null,
      githubUrl: 'https://github.com/x/y', updatedAt: new Date(),
    })
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('hi@revelio.cards')).toBeInTheDocument()
  })

  it('shows a reactive validation error for a bad email and does not submit', async () => {
    renderForm()
    fireEvent.input(screen.getByLabelText(en.adminSettings.contactEmail), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: en.adminSettings.save }))
    await waitFor(() => expect(screen.getByText(en.validation.email)).toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
    // reValidateMode: 'onChange' — correcting the field clears the error live.
    fireEvent.input(screen.getByLabelText(en.adminSettings.contactEmail), { target: { value: 'ok@x.com' } })
    await waitFor(() => expect(screen.queryByText(en.validation.email)).toBeNull())
  })

  it('submits valid values through the action and toasts success', async () => {
    renderForm()
    fireEvent.input(screen.getByLabelText(en.adminSettings.operatorName), { target: { value: 'Jane' } })
    fireEvent.click(screen.getByRole('button', { name: en.adminSettings.save }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][0]).toMatchObject({ operatorName: 'Jane' })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(en.adminSettings.saved))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm test -w web -- site-settings-form`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Create the form component**

Create `app/web/src/components/site-settings-form.tsx`:

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { SiteSettings } from '@revelio/db'
import { updateSiteSettings } from '@/lib/site-settings-actions'
import { makeSiteSettingsSchema, type SiteSettingsFormValues } from '@/lib/schemas/site-settings'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Button } from '@/components/ui/button'

type TextField = 'operatorName' | 'contactEmail' | 'hostingProvider' | 'responsiblePerson' | 'githubUrl'

function toValues(initial: SiteSettings | null): SiteSettingsFormValues {
  return {
    operatorName: initial?.operatorName ?? '',
    operatorAddress: initial?.operatorAddress ?? '',
    contactEmail: initial?.contactEmail ?? '',
    hostingProvider: initial?.hostingProvider ?? '',
    responsiblePerson: initial?.responsiblePerson ?? '',
    githubUrl: initial?.githubUrl ?? '',
  }
}

export function SiteSettingsForm({ initial }: { initial: SiteSettings | null }) {
  const t = useTranslations('adminSettings')
  const tv = useTranslations('validation')

  const form = useForm<SiteSettingsFormValues>({
    resolver: zodResolver(makeSiteSettingsSchema((k) => tv(k))),
    defaultValues: toValues(initial),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  // Field/validation errors surface reactively via <FormMessage>. The save result
  // uses sonner toasts (success / non-field failure), matching set-form.tsx. The
  // action returns no field-specific error codes, so there is no setError mapping.
  async function submit(values: SiteSettingsFormValues) {
    const res = await updateSiteSettings(values)
    if (res.ok) toast.success(t('saved'))
    else toast.error(t('saveError'))
  }

  // FormField wraps RHF's Controller; FormLabel/FormControl auto-associate the
  // label with the control, and FormMessage renders that field's zod error.
  const textField = (name: TextField) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(name)}</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="max-w-xl space-y-4" noValidate>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
        {textField('operatorName')}
        {/* AutoTextarea is controlled (value/onChange), so bind field explicitly. */}
        <FormField
          control={form.control}
          name="operatorAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('operatorAddress')}</FormLabel>
              <FormControl>
                <AutoTextarea
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {textField('contactEmail')}
        {textField('hostingProvider')}
        {textField('responsiblePerson')}
        {textField('githubUrl')}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('save')}
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm test -w web -- site-settings-form`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd app
git add web/src/components/site-settings-form.tsx web/src/components/__tests__/site-settings-form.test.tsx web/messages/en.json web/messages/de.json
git commit -m "feat(web): add site settings admin form"
```

---

### Task 8: Admin page + index card (`@revelio/web`)

**Files:**
- Create: `app/web/src/app/[locale]/admin/settings/page.tsx`
- Modify: `app/web/src/app/[locale]/admin/page.tsx` (add a "Settings" card, gated `isAdmin`)

**Interfaces:**
- Consumes: `loadSiteSettings` (Task 3), `getSession`/`hasRequiredRole`, `SiteSettingsForm` (Task 7), `adminSettings` + `admin.settings` messages (Task 7).
- Produces: the `/admin/settings` route.

- [ ] **Step 1: Create the admin settings page**

Create `app/web/src/app/[locale]/admin/settings/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { loadSiteSettings } from '@/lib/site-settings'
import { SiteSettingsForm } from '@/components/site-settings-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('adminSettings')
  return { title: t('title') }
}

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const t = await getTranslations('adminSettings')
  const settings = await loadSiteSettings()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <SiteSettingsForm initial={settings} />
    </div>
  )
}
```

Note: confirm the admin gating convention against `app/web/src/app/[locale]/admin/users/page.tsx` (whether it uses `notFound()` or a redirect for non-admins) and match it exactly here.

- [ ] **Step 2: Add the Settings card to the admin index**

In `app/web/src/app/[locale]/admin/page.tsx`, add — alongside the existing `isAdmin`-gated Users card — a Settings link:

```tsx
        {isAdmin && (
          <Link
            href="/admin/settings"
            className="block rounded-lg border border-input p-4 transition-colors hover:bg-muted/50"
          >
            <div className="font-medium">{t('settings.title')}</div>
            <div className="text-sm text-muted-foreground">{t('settings.desc')}</div>
          </Link>
        )}
```

- [ ] **Step 3: Verify build, types, and lint**

Run: `cd app && npm run typecheck && npm run lint -w web && npm run build -w web`
Expected: all PASS. (`next build` needs the standard env vars — set the same ones CI uses, e.g. `NEXT_PUBLIC_IMAGE_BASE_URL`, `NEXT_PUBLIC_BASE_URL`, `DATABASE_URL`.)

- [ ] **Step 4: Manual smoke check (optional but recommended)**

With local infra up (`docker compose up`, migrations applied) and signed in as an admin, visit `/admin/settings`, save values, confirm they persist on reload, and confirm the footer GitHub link + OTP email contact line reflect the saved `githubUrl`/`contactEmail`.

- [ ] **Step 5: Commit**

```bash
cd app
git add web/src/app/[locale]/admin/settings/page.tsx web/src/app/[locale]/admin/page.tsx
git commit -m "feat(web): add /admin/settings page and index card"
```

---

### Final verification

- [ ] **Full workspace test + checks**

Run: `cd app && npm test && npm run typecheck && npm run lint -w web`
Then: `cd app/db && npm run verify && npm run check`
Expected: all green. (Postgres-backed tests need Docker for Testcontainers, or `TEST_DATABASE_URL` set.)

## Self-review notes

- **Spec coverage:** schema+migration (T1) ✓, queries (T2) ✓, cached accessor + tag (T3) ✓, `CONTACT_EMAIL` migration + OTP path (T4) ✓, `GITHUB_URL` migration + footer (T5) ✓, admin action with `requireRole('admin')` + `revalidateTag` (T6) ✓, admin form + i18n (T7) ✓, admin page + index card (T8) ✓, tests for DB/action/env-migration/form (T2/T4/T5/T6/T7) ✓, `.env.example` cleanup (T4/T5) ✓.
- **Type consistency:** `SiteSettings`/`SiteSettingsInput` (T2) are the shapes consumed by T3/T6/T7; `SITE_SETTINGS_TAG` (T3) is used by T6; `updateSiteSettings` signature (T6) matches the form's call (T7); `renderOtpEmail({ otp, type, contactEmail })` (T4) matches the auth.ts caller.
- **Deferred to Spec 2/3:** the public `/about`, `/privacy`, `/imprint`, `/contact` pages consume `getCachedSiteSettings()` but are out of scope here.

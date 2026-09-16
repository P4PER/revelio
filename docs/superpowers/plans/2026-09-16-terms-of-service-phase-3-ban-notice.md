# Terms of Service, Phase 3: Statement of Reasons for Bans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin bans an account, email the user the measure, its duration, the reason, the terms relied on and how to object, as Art. 17 DSA requires, and make a reason mandatory.

**Architecture:** A bilingual (English, then German) react-email template renders the notice from copy in a new `email.ban` namespace in both catalogs. `banUser` validates a non-empty reason, looks up the target's email, stores the ban exactly as today, then sends the notice. A mail failure never undoes the ban; the action returns an `ok` result with a warning that the admin form surfaces.

**Tech Stack:** Next.js 16 server actions, react-email (`@react-email/components`, `@react-email/render`), nodemailer via `lib/email/mailer.ts`, next-intl `createTranslator`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (Phase 3)

## Global Constraints

- Depends on Phase 1 being merged: the notice links `/terms` and cites sections 5 and 8.
- All app commands run from `app/`. Node and npm are at `/usr/local/bin`.
- User-facing strings come from `web/messages/en.json` and `de.json`. The email and admin UI in German use "Sie"; the privacy policy uses "Sie".
- The ban reason is untrusted admin input: render it only as escaped React children, never with `dangerouslySetInnerHTML`.
- Code comments are ASCII-only.
- `type` aliases only; type-only imports say `type`. Declaration order: types, constants, helpers, exported functions.
- Commits: Conventional Commits, no tool attribution, signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Branch: `feat/ban-statement-of-reasons` off `main`.

---

### Task 1: Ban notice email template

**Files:**
- Create: `app/web/src/lib/email/ban-template.tsx`
- Create: `app/web/src/lib/email/__tests__/ban-template.test.tsx`
- Modify: `app/web/messages/en.json` and `de.json` (`email.ban`)

**Interfaces:**
- Consumes: `RenderedEmail` from `./types`.
- Produces: `renderBanEmail(input: BanEmailInput): Promise<RenderedEmail>` with `type BanEmailInput = { reason: string; expiresAt: Date | null }`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git fetch origin && git switch -c feat/ban-statement-of-reasons origin/main
```

- [ ] **Step 2: Add the copy**

`en.json`, inside `email`, after the `contact` object (add a comma after its closing brace):

```json
    "ban": {
      "subject": "Your Revelio account has been suspended",
      "heading": "Your account has been suspended",
      "measureTemporary": "We have suspended your Revelio account until {date, date, long}. While it is suspended you cannot sign in, and the Revelio Discord bot cannot show your collection or decks.",
      "measurePermanent": "We have suspended your Revelio account permanently. You cannot sign in, and the Revelio Discord bot cannot show your collection or decks.",
      "reasonLabel": "Reason",
      "grounds": "This decision relies on our Terms of Service, in particular section 5 (acceptable use) and section 8 (reporting and moderation): {termsUrl}. It was taken by a person after reviewing your account; no automated means were used.",
      "objection": "If you think this decision is wrong, you can object through our contact form: {contactUrl}. We will then review the decision again. Your right to take legal action remains unaffected."
    }
```

`de.json` has no `email` namespace (the OTP and contact emails are English-only), so add a new top-level key directly before `"privacy"`, holding only `ban`. Do not copy the English `otp` or `contact` copy across:

```json
  "email": {
    "ban": {
      "subject": "Ihr Revelio-Konto wurde gesperrt",
      "heading": "Ihr Konto wurde gesperrt",
      "measureTemporary": "Wir haben Ihr Revelio-Konto bis zum {date, date, long} gesperrt. Während der Sperre können Sie sich nicht anmelden, und der Revelio-Discord-Bot kann Ihre Sammlung und Decks nicht anzeigen.",
      "measurePermanent": "Wir haben Ihr Revelio-Konto dauerhaft gesperrt. Sie können sich nicht anmelden, und der Revelio-Discord-Bot kann Ihre Sammlung und Decks nicht anzeigen.",
      "reasonLabel": "Grund",
      "grounds": "Diese Entscheidung stützt sich auf unsere Nutzungsbedingungen, insbesondere Abschnitt 5 (Zulässige Nutzung) und Abschnitt 8 (Meldungen und Moderation): {termsUrl}. Sie wurde von einer Person nach Prüfung Ihres Kontos getroffen; automatisierte Mittel wurden nicht eingesetzt.",
      "objection": "Wenn Sie diese Entscheidung für falsch halten, können Sie über unser Kontaktformular widersprechen: {contactUrl}. Wir prüfen die Entscheidung dann erneut. Ihr Recht, den Rechtsweg zu beschreiten, bleibt unberührt."
    }
  },
```

Check both files parse: `node -e 'require("./web/messages/en.json"); require("./web/messages/de.json"); console.log("ok")'` from `app/`.

- [ ] **Step 3: Write the failing template test**

`app/web/src/lib/email/__tests__/ban-template.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderBanEmail } from '../ban-template'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://revelio.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderBanEmail', () => {
  it('uses a bilingual subject', async () => {
    const { subject } = await renderBanEmail({ reason: 'Spam decks', expiresAt: null })
    expect(subject).toBe('Your Revelio account has been suspended / Ihr Revelio-Konto wurde gesperrt')
  })

  // Art. 17(3) DSA: the measure and its duration, the facts relied on, the
  // ground, that no automated means were used, and the redress available.
  it('states every element Art. 17(3) DSA requires, in both languages', async () => {
    const { html, text } = await renderBanEmail({
      reason: 'Offensive username after a warning',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    for (const body of [html, text]) {
      expect(body).toContain('January 1, 2030')
      expect(body).toContain('1. Januar 2030')
      expect(body).toContain('Offensive username after a warning')
      expect(body).toContain('https://revelio.test/terms')
      expect(body).toContain('https://revelio.test/de/terms')
      expect(body).toContain('https://revelio.test/contact')
      expect(body).toContain('https://revelio.test/de/contact')
      expect(body).toContain('no automated means')
      expect(body).toContain('automatisierte Mittel wurden nicht eingesetzt')
      expect(body).toContain('legal action')
    }
  })

  it('says a ban without an expiry is permanent', async () => {
    const { text } = await renderBanEmail({ reason: 'Spam', expiresAt: null })
    expect(text).toContain('permanently')
    expect(text).toContain('dauerhaft')
    expect(text).not.toContain('until')
  })

  it('escapes the reason instead of rendering it as markup', async () => {
    const { html } = await renderBanEmail({ reason: '<b>bold</b>', expiresAt: null })
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -w web -- src/lib/email/__tests__/ban-template.test.tsx`
Expected: FAIL, cannot resolve `../ban-template`.

- [ ] **Step 5: Write the template**

`app/web/src/lib/email/ban-template.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Body, Container, Heading, Hr, Html, Section, Text } from '@react-email/components'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import type { RenderedEmail } from './types'

export type BanEmailInput = {
  reason: string
  expiresAt: Date | null
}

type NoticeLocale = 'en' | 'de'

// English-prefixed routes carry no locale segment (localePrefix: 'as-needed').
const PATH_PREFIX: Record<NoticeLocale, string> = { en: '', de: '/de' }

// Ban expiry dates are picked as calendar days in the admin form and stored at
// UTC midnight, so they are shown in the operator's zone, where that is still
// the same day.
const TIME_ZONE = 'Europe/Berlin'

const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '24px 0' }
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto', padding: '0 30px' }
const heading: CSSProperties = {
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '20px',
  fontWeight: 600,
  color: '#3B3194',
}
const row: CSSProperties = {
  margin: '8px 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
  color: '#443f66',
}
const divider: CSSProperties = { borderColor: '#d9b46a', margin: '24px 0' }

// The user table stores no locale, so the notice goes out in both languages.
// createTranslator, not getTranslations: server actions have no request locale
// here, same as renderOtpEmail and renderContactEmail.
function banTranslator(locale: NoticeLocale) {
  return createTranslator({
    locale,
    // de.json holds the same email.ban keys; the cast only unifies the two
    // inferred catalog types.
    messages: (locale === 'de' ? de : en) as typeof en,
    namespace: 'email.ban',
    timeZone: TIME_ZONE,
  })
}

function BanNotice({ locale, reason, expiresAt, baseUrl }: BanEmailInput & { locale: NoticeLocale; baseUrl: string }) {
  const t = banTranslator(locale)
  const prefix = PATH_PREFIX[locale]
  return (
    <Section lang={locale}>
      <Heading as="h1" style={heading}>
        {t('heading')}
      </Heading>
      <Text style={row}>
        {expiresAt ? t('measureTemporary', { date: expiresAt }) : t('measurePermanent')}
      </Text>
      {/* Untrusted admin input: rendered only as escaped React children. */}
      <Text style={row}>
        <strong>{t('reasonLabel')}:</strong> {reason}
      </Text>
      <Text style={row}>{t('grounds', { termsUrl: `${baseUrl}${prefix}/terms` })}</Text>
      <Text style={row}>{t('objection', { contactUrl: `${baseUrl}${prefix}/contact` })}</Text>
    </Section>
  )
}

function BanEmail(input: BanEmailInput) {
  // Read at render time so tests and runtime pick up the current env.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
  return (
    <Html lang="en">
      <Body style={main}>
        <Container style={container}>
          <BanNotice locale="en" baseUrl={baseUrl} {...input} />
          <Hr style={divider} />
          <BanNotice locale="de" baseUrl={baseUrl} {...input} />
        </Container>
      </Body>
    </Html>
  )
}

/**
 * Statement of reasons for an account suspension (Art. 17 DSA): the measure and
 * its duration, the facts, the terms relied on, that a person decided, and how
 * to object.
 */
export async function renderBanEmail(input: BanEmailInput): Promise<RenderedEmail> {
  const subject = `${banTranslator('en')('subject')} / ${banTranslator('de')('subject')}`
  const element = <BanEmail {...input} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -w web -- src/lib/email/__tests__/ban-template.test.tsx`
Expected: PASS (4 tests).

If the date assertions fail, print the rendered `text` and compare: the fix belongs in the test's expected format only if the output is a correct long date in the right language.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/lib/email/ban-template.tsx app/web/src/lib/email/__tests__/ban-template.test.tsx \
  app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add the account suspension notice email"
```

---

### Task 2: `banUser` requires a reason and sends the notice

**Files:**
- Modify: `app/web/src/lib/actions/user-admin-actions.ts`
- Modify: `app/web/src/lib/actions/__tests__/user-admin-actions.test.ts`

**Interfaces:**
- Consumes: `renderBanEmail` (Task 1), `sendMail` from `@/lib/email/mailer`, `getUserForAdmin` (returns `email`).
- Produces: `banUser(userId: string, reason: string, expiresAt: string | null): Promise<BanUserResult>` with `type BanUserResult = UserActionResult | { ok: true; warning: 'notify-failed' }`. New error codes: `'reason-required'`, `'not-found'`. Task 3 handles both and the warning.

- [ ] **Step 1: Write the failing tests**

In `user-admin-actions.test.ts`, add to the hoisted `m` object:

```ts
  renderBanEmail: vi.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
  sendMail: vi.fn(async () => {}),
```

add the mocks below the existing ones:

```ts
vi.mock('@/lib/email/ban-template', () => ({ renderBanEmail: m.renderBanEmail }))
vi.mock('@/lib/email/mailer', () => ({ sendMail: m.sendMail }))
```

and in `beforeEach`, replace the `getUserForAdmin` default and restore the mail mocks:

```ts
  m.getUserForAdmin.mockResolvedValue({ id: 'u2', role: 'user', email: 'u2@x.test' })
  m.renderBanEmail.mockResolvedValue({ subject: 's', html: 'h', text: 't' })
  m.sendMail.mockResolvedValue(undefined)
```

Then add inside `describe('banUser / unbanUser', ...)`:

```ts
  // Art. 17(3) DSA wants the facts and grounds; an empty reason cannot state
  // either.
  it('rejects a blank reason before writing', async () => {
    expect(await banUser('u2', '   ', null)).toEqual({ ok: false, error: 'reason-required' })
    expect(m.setUserBan).not.toHaveBeenCalled()
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('stores the trimmed reason', async () => {
    await banUser('u2', '  spam  ', null)
    expect(m.setUserBan.mock.calls[0][2]).toBe('spam')
  })

  it('rejects an unknown user before writing', async () => {
    m.getUserForAdmin.mockResolvedValueOnce(null)
    expect(await banUser('ghost', 'spam', null)).toEqual({ ok: false, error: 'not-found' })
    expect(m.setUserBan).not.toHaveBeenCalled()
  })

  it('emails the banned user the reason and expiry after storing the ban', async () => {
    expect(await banUser('u2', 'spam', '2030-01-01')).toEqual({ ok: true })
    expect(m.renderBanEmail).toHaveBeenCalledWith({ reason: 'spam', expiresAt: new Date('2030-01-01') })
    expect(m.sendMail).toHaveBeenCalledWith({ to: 'u2@x.test', subject: 's', html: 'h', text: 't' })
    expect(m.setUserBan.mock.invocationCallOrder[0]).toBeLessThan(m.sendMail.mock.invocationCallOrder[0])
  })

  // The ban is the safety-relevant half. Mail being down must not let the
  // account back in; the admin is told so they can send the reasons by hand.
  it('keeps the ban and warns when the notice cannot be sent', async () => {
    m.sendMail.mockRejectedValueOnce(new Error('SMTP down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await banUser('u2', 'spam', null)).toEqual({ ok: true, warning: 'notify-failed' })
    expect(m.setUserBan).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not email on unban', async () => {
    await unbanUser('u2')
    expect(m.sendMail).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web -- src/lib/actions/__tests__/user-admin-actions.test.ts`
Expected: FAIL: blank reason is accepted, no mail is sent, no `not-found` result.

- [ ] **Step 3: Implement**

In `user-admin-actions.ts`, add the imports:

```ts
import { renderBanEmail } from '@/lib/email/ban-template'
import { sendMail } from '@/lib/email/mailer'
```

add the result type directly below `export type UserActionResult = ...`:

```ts
// A ban whose notice could not be emailed still succeeded: the ban stands and
// the admin form tells the admin to send the reasons by hand.
export type BanUserResult = UserActionResult | { ok: true; warning: 'notify-failed' }
```

and replace `banUser` with:

```ts
export async function banUser(
  userId: string, reason: string, expiresAt: string | null,
): Promise<BanUserResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  // Art. 17(3) DSA: the statement of reasons must give the facts and grounds.
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'reason-required' }
  const expires = expiresAt ? new Date(expiresAt) : null
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: 'invalid' }
  const db = getDb()
  const target = await getUserForAdmin(db, userId)
  if (!target) return { ok: false, error: 'not-found' }
  await setUserBan(db, userId, trimmed, expires)
  revalidateUser(userId)
  try {
    const mail = await renderBanEmail({ reason: trimmed, expiresAt: expires })
    await sendMail({ to: target.email, ...mail })
  } catch {
    // Never log the reason or the address: both are personal data.
    console.error('could not send the ban notice')
    return { ok: true, warning: 'notify-failed' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w web -- src/lib/actions/__tests__/user-admin-actions.test.ts`
Expected: PASS, including the pre-existing `bans with a parsed expiry` (still `{ ok: true }`) and `blocks banning yourself`.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/actions/user-admin-actions.ts app/web/src/lib/actions/__tests__/user-admin-actions.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(admin): email banned users a statement of reasons" \
  -m "Art. 17 DSA requires telling a user why their account was suspended,
with no micro-enterprise exemption. banUser stored a reason the user
never saw and accepted an empty one. A mail failure keeps the ban and
reports a warning rather than letting the account back in."
```

---

### Task 3: Admin ban form requires a reason and surfaces the warning

**Files:**
- Modify: `app/web/src/components/admin/user-ban-form.tsx`
- Modify: `app/web/src/components/admin/__tests__/user-ban-form.test.tsx`
- Modify: `app/web/messages/en.json` and `de.json` (`admin.users`)

**Interfaces:**
- Consumes: `banUser` returning `BanUserResult` and the error codes `self`, `reason-required`, `not-found` (Task 2).

- [ ] **Step 1: Add the copy**

In `en.json` under `admin.users`, replace `banConfirmBody` and add three keys after `banReason`:

```json
    "banReason": "Reason",
    "banReasonHint": "Sent to the user by email, together with the terms it relies on. Describe what happened, not just a label.",
    "reasonRequiredError": "Enter a reason before banning.",
    "banNotifyFailed": "User banned, but the notice email could not be sent. Send them the reason yourself.",
```

```json
    "banConfirmBody": "They will be unable to sign in until unbanned, and we will email them the reason.",
```

In `de.json` under `admin.users`:

```json
    "banReason": "Grund",
    "banReasonHint": "Wird dem Benutzer zusammen mit den zugrunde liegenden Nutzungsbedingungen per E-Mail geschickt. Beschreiben Sie, was vorgefallen ist, nicht nur ein Stichwort.",
    "reasonRequiredError": "Geben Sie vor dem Sperren einen Grund an.",
    "banNotifyFailed": "Benutzer gesperrt, aber die Benachrichtigung konnte nicht gesendet werden. Teilen Sie den Grund bitte selbst mit.",
```

```json
    "banConfirmBody": "Er kann sich nicht anmelden, bis die Sperre aufgehoben wird, und erhält den Grund per E-Mail.",
```

- [ ] **Step 2: Write the failing tests**

In `user-ban-form.test.tsx`, add `warning: vi.fn()` to the hoisted `h` object, change the sonner mock to `vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error, warning: h.warning } }))`, and add the imports `import userEvent from '@testing-library/user-event'`, `waitFor` from `@testing-library/react` and `beforeEach` from `vitest`. Add:

```tsx
beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
  h.banUser.mockResolvedValue({ ok: true })
})
```

Add inside `describe('UserBanForm', ...)`, replacing the first test:

```tsx
  it('leaves every field usable on another user', async () => {
    renderForm(false)
    expect(screen.getByLabelText(t.banReason)).toBeEnabled()
    expect(expiryTrigger()).toBeEnabled()
    await userEvent.type(screen.getByLabelText(t.banReason), 'spam')
    expect(screen.getByRole('button', { name: t.banAction })).toBeEnabled()
    expect(screen.queryByText(t.cannotSelf)).not.toBeInTheDocument()
  })

  // The reason is emailed to the user as the statement of reasons, so there is
  // nothing to send without one.
  it('keeps Ban disabled until a reason is entered', async () => {
    renderForm(false)
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(t.banReason), '   ')
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
  })

  it('tells the admin the reason goes to the user', () => {
    renderForm(false)
    expect(screen.getByLabelText(t.banReason)).toHaveAccessibleDescription(t.banReasonHint)
  })

  async function confirmBan() {
    await userEvent.type(screen.getByLabelText(t.banReason), 'spam')
    await userEvent.click(screen.getByRole('button', { name: t.banAction }))
    await userEvent.click(await screen.findByRole('button', { name: t.banAction }))
  }

  it('warns when the ban stood but the notice was not sent', async () => {
    h.banUser.mockResolvedValue({ ok: true, warning: 'notify-failed' })
    renderForm(false)
    await confirmBan()
    await waitFor(() => expect(h.warning).toHaveBeenCalledWith(t.banNotifyFailed))
    expect(h.success).not.toHaveBeenCalled()
  })

  it('shows the reason-required error from the server', async () => {
    h.banUser.mockResolvedValue({ ok: false, error: 'reason-required' })
    renderForm(false)
    await confirmBan()
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(t.reasonRequiredError))
  })
```

In `confirmBan`, the second `findByRole` resolves the `AlertDialogAction` inside the open dialog, which carries the same label as the trigger. If both are found at once, scope it: `within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.banAction })`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w web -- src/components/admin/__tests__/user-ban-form.test.tsx`
Expected: FAIL: Ban is enabled with no reason, no accessible description, no warning toast.

- [ ] **Step 4: Implement**

In `user-ban-form.tsx`, change the actions import to:

```tsx
import { banUser, unbanUser, type BanUserResult, type UserActionResult } from '@/lib/actions/user-admin-actions'
```

add below the `Props` type:

```tsx
const ERROR_KEYS: Record<string, 'selfError' | 'reasonRequiredError'> = {
  self: 'selfError',
  'reason-required': 'reasonRequiredError',
}
```

replace `handle` with:

```tsx
  function handle(action: Promise<BanUserResult | UserActionResult>) {
    start(async () => {
      const r = await action
      if (r.ok && 'warning' in r) toast.warning(t('banNotifyFailed'))
      else if (r.ok) toast.success(t('saved'))
      else toast.error(t(ERROR_KEYS[r.error] ?? 'saveError'))
    })
  }
```

replace the reason field block with:

```tsx
      <div className="space-y-1.5">
        <Label htmlFor="ban-reason">{t('banReason')}</Label>
        <Input
          id="ban-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          aria-describedby="ban-reason-hint"
        />
        <p id="ban-reason-hint" className="text-xs text-muted-foreground">
          {t('banReasonHint')}
        </p>
      </div>
```

and the trigger button's `disabled` with:

```tsx
            <Button type="button" variant="destructive" disabled={disabled || pending || !reason.trim()}>
```

`ERROR_KEYS` is a module constant, so it goes above the component per the declaration-order rule.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w web -- src/components/admin/__tests__/user-ban-form.test.tsx`
Expected: PASS, including `disables the expiry field too on your own account`.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/admin/user-ban-form.tsx app/web/src/components/admin/__tests__/user-ban-form.test.tsx \
  app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(admin): require a ban reason and flag an unsent notice"
```

---

### Task 4: Privacy policy covers moderation data

**Files:**
- Modify: `app/web/messages/en.json` and `de.json` (`privacy.moderationTitle`, `privacy.moderationBody`)
- Modify: `app/web/src/app/[locale]/privacy/page.tsx` (new `h3` + `LAST_UPDATED`)
- Modify: `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`

- [ ] **Step 1: Write the failing test**

Add inside `describe('PrivacyContent', ...)`:

```tsx
  it('documents moderation data in both locales', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 17 of the Digital Services Act/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de', de, FULL)
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 6 Abs\. 1 lit\. c DSGVO/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx'`
Expected: FAIL, no heading named "Moderation".

- [ ] **Step 3: Add the copy**

`en.json`, in `privacy`, directly after `contactBody`:

```json
    "moderationTitle": "Moderation",
    "moderationBody": "If we suspend an account for a breach of our terms of service, we store the reason and the end of the suspension with the account and send both to the affected user by email, as Art. 17 of the Digital Services Act requires. This data is deleted when the suspension is lifted or the account is deleted. Legal basis: compliance with a legal obligation (Art. 6(1)(c) GDPR in conjunction with Art. 17 DSA).",
```

`de.json`, same place:

```json
    "moderationTitle": "Moderation",
    "moderationBody": "Sperren wir ein Konto wegen eines Verstoßes gegen unsere Nutzungsbedingungen, speichern wir den Grund und das Ende der Sperre beim Konto und senden beides per E-Mail an die betroffene Person, wie es Art. 17 des Digital Services Act verlangt. Diese Daten werden gelöscht, wenn die Sperre aufgehoben oder das Konto gelöscht wird. Rechtsgrundlage: Erfüllung einer rechtlichen Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO i. V. m. Art. 17 DSA).",
```

"Deleted when the suspension is lifted" is true only because `clearUserBan` in `db/src/queries/users.ts` sets `banReason` and `banExpires` to null. Confirm that before committing.

- [ ] **Step 4: Render the section**

In `privacy/page.tsx`, directly after `<p>{t('contactBody')}</p>`:

```tsx
      <h3>{t('moderationTitle')}</h3>
      <p>{t('moderationBody')}</p>
```

and set `LAST_UPDATED` to the date you make this change (`date -u +%Y-%m-%d`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json 'app/web/src/app/[locale]/privacy'
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): disclose moderation data in the privacy policy"
```

---

### Task 5: Verify and open the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (status line only)

- [ ] **Step 1: Run the full checks**

From `app/`:

```bash
npm test -w web
npm run typecheck
npm run lint
```

Expected: all pass. Record the web test count.

- [ ] **Step 2: Send a real notice locally**

With SMTP configured in `web/.env.local` (or a local catcher such as Mailpit on `SMTP_HOST=localhost`), ban a throwaway local account from `/admin/users/<id>/edit` with a reason and an expiry, then check the received mail. Expected: bilingual subject; English then German; the long date in both; the reason; working `/terms` and `/de/terms`, `/contact` and `/de/contact` links. Then stop the mail server, ban another throwaway account, and check that the admin sees the "notice email could not be sent" warning and the account is still banned.

- [ ] **Step 3: Mark the spec**

```markdown
Status: implemented
```

```bash
git add docs/superpowers/specs/2026-09-16-terms-of-service-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(plans): mark terms of service phase 3 as implemented"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/ban-statement-of-reasons
/opt/homebrew/bin/gh pr create --base main \
  --title "feat(admin): send banned users a statement of reasons" \
  --body-file <scratchpad>/pr-body.md
```

Body: opening prose (Art. 17 DSA applies to every hosting service; bans were silent and accepted an empty reason), `## What changed`, `## Verification` with real results only (including the manual send and the mail-down check), links to the spec, this plan and the Phase 1 and 2 PRs. `## Deployment`: none beyond the existing SMTP configuration on `web`; no migration, env var or ingest run.

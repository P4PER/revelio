# Contact Form (`/contact`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the footer-linked `/contact` page — a validated, bot-resistant contact form that emails the operator (via the Spec 1 `contactEmail`) with the sender set as `reply-to`, storing nothing in the DB.

**Architecture:** A server component page (`/[locale]/contact`) renders a client `ContactForm` (react-hook-form + zod, mirroring `auth-form.tsx`). Submits call a `'use server'` `sendContactMessage` action that runs layered anti-spam (honeypot → submit-timing → per-IP rate limit), resolves the recipient from `getCachedSiteSettings().contactEmail`, renders a react-email template, and delivers through the existing `sendMail` (extended with `replyTo`). Delivery is email-only; no persistence.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, react-hook-form + `@hookform/resolvers/zod`, zod, nodemailer + `@react-email/*`, `rate-limiter-flexible` (in-memory), vitest + Testing Library.

## Global Constraints

- **Run all commands from `app/`** — it is the npm workspaces root; CI uses `working-directory: app`. There is no root `package.json`.
- **Web workspace only.** All files live under `app/web`; only `@revelio/web` has a lint step. Use `-w web` for web-scoped npm scripts.
- **next-intl navigation helpers** (`@/../i18n/navigation`), never bare `next/link`.
- **Server Actions never leak secrets to the client**; they are `'use server'`. Map thrown mailer errors to opaque result codes — never surface internals.
- **Recipient is not hardcoded** — always resolve `contactEmail` from `getCachedSiteSettings()` (single source of truth shared with the Impressum).
- **Anti-spam is layered & zero-subprocessor**: honeypot + submit-timing + per-IP rate limit. `rate-limiter-flexible` runs purely in-process (`RateLimiterMemory`) — no third-party subprocessor, no extra GDPR disclosure. In-memory state resets on restart / is per-instance; acceptable for the single-node VPS.
- **Fields:** name, email, subject, message (full set, confirmed).
- **German copy uses the formal "Sie" address** (matches the existing legal-page convention).
- **i18n key parity** for user-facing namespaces: any key added to `en.json` must exist in `de.json`. The `contact` namespace is added to the parity guard test.
- **Conventional Commits.** **Never** add Claude/Claude Code attribution to commits.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

## File Structure

**Create**
- `app/web/src/lib/rate-limit.ts` — in-memory per-IP limiter helper (`consumeContactRateLimit`).
- `app/web/src/lib/schemas/contact.ts` — `makeContactSchema` + exported limit constants.
- `app/web/src/lib/email/contact-template.tsx` — `renderContactEmail({ name, email, subject, message })`.
- `app/web/src/lib/contact-actions.ts` — `'use server'` `sendContactMessage`.
- `app/web/src/components/contact-form.tsx` — client `ContactForm`.
- `app/web/src/app/[locale]/contact/page.tsx` — server page + `generateMetadata`.
- Tests: `src/lib/__tests__/rate-limit.test.ts`, `src/lib/__tests__/contact-schema.test.ts`, `src/lib/email/__tests__/contact-template.test.tsx`, `src/lib/__tests__/contact-actions.test.ts`, `src/components/__tests__/contact-form.test.tsx`, `src/app/[locale]/__tests__/contact-page.test.tsx`.

**Modify**
- `app/web/src/lib/email/mailer.ts` — add optional `replyTo` to `sendMail`.
- `app/web/src/lib/email/__tests__/mailer.test.ts` — cover `replyTo` passthrough.
- `app/web/messages/en.json` + `app/web/messages/de.json` — add `contact` namespace, two `validation` keys; add `email.contact` (en) for the template.
- `app/web/src/app/[locale]/__tests__/legal-i18n-parity.test.ts` — add `contact` to the guarded namespaces.
- `app/web/src/app/globals.css` — add the `reveal-spark` keyframe (success reveal).
- `app/web/package.json` — add `rate-limiter-flexible` dependency.

**Dependency direction across tasks:** mailer + rate-limit + schema + i18n are leaves → email template (needs i18n) → server action (needs schema, mailer, rate-limit, i18n, settings) → form component (needs schema, action, i18n) → page (wires form). Build in that order.

---

## Task 1: Extend `sendMail` with `replyTo`

**Files:**
- Modify: `app/web/src/lib/email/mailer.ts`
- Test: `app/web/src/lib/email/__tests__/mailer.test.ts`

**Interfaces:**
- Consumes: existing `sendMail({ to, subject, html, text })`.
- Produces: `sendMail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<void>` — passes `replyTo` to nodemailer only when set.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('sendMail', ...)` block in `app/web/src/lib/email/__tests__/mailer.test.ts`:

```ts
  it('forwards replyTo to the transport when provided', async () => {
    vi.stubEnv('SMTP_HOST', 'mailpit')
    vi.stubEnv('SMTP_PORT', '1025')
    vi.stubEnv('MAIL_FROM', 'Revelio <no-reply@revelio.cards>')

    await sendMail({
      to: 'ops@revelio.cards',
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
      replyTo: 'sender@example.com',
    })

    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@revelio.cards', replyTo: 'sender@example.com' }),
    )
  })

  it('omits replyTo when not provided', async () => {
    vi.stubEnv('SMTP_HOST', 'mailpit')
    vi.stubEnv('MAIL_FROM', 'Revelio <no-reply@revelio.cards>')

    await sendMail({ to: 'ops@revelio.cards', subject: 'S', html: 'h', text: 't' })

    expect(m.send.mock.calls[0][0]).not.toHaveProperty('replyTo')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/email/__tests__/mailer.test.ts`
Expected: FAIL — `replyTo` is not on the transport call.

- [ ] **Step 3: Extend the signature and passthrough**

In `app/web/src/lib/email/mailer.ts`, update the `sendMail` signature and the transport call:

```ts
export async function sendMail(msg: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<void> {
  const transport = getTransport()
  const from = process.env.MAIL_FROM

  if (!transport || !from) {
    // Fail loudly rather than silently dropping the user's sign-in code — a
    // misconfigured mailer must surface, not pretend the OTP was sent. (Never
    // log msg.subject here: the subject contains the OTP code.)
    throw new Error('[mail] SMTP not configured (set SMTP_HOST and MAIL_FROM)')
  }

  await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    // Only set replyTo when given so OTP mail (no replyTo) is unaffected and
    // nodemailer doesn't receive an undefined header.
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/email/__tests__/mailer.test.ts`
Expected: PASS (all tests including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/email/mailer.ts app/web/src/lib/email/__tests__/mailer.test.ts
git commit -m "feat(web): add optional replyTo to sendMail"
```

---

## Task 2: Per-IP rate-limit helper

**Files:**
- Modify: `app/web/package.json` (add dependency)
- Create: `app/web/src/lib/rate-limit.ts`
- Test: `app/web/src/lib/__tests__/rate-limit.test.ts`

**Interfaces:**
- Produces: `consumeContactRateLimit(ip: string): Promise<boolean>` — returns `true` if the request is within budget, `false` when the per-IP window is exhausted. Backed by `RateLimiterMemory` (5 points / 3600s).
- Produces: exported `CONTACT_RATE = { points: 5, duration: 3600 }` so tests/docs share the numbers.

- [ ] **Step 1: Install the dependency**

Run (from `app/`):

```bash
npm install rate-limiter-flexible -w web
```

Expected: `rate-limiter-flexible` appears in `app/web/package.json` `dependencies`; `app/package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Create `app/web/src/lib/__tests__/rate-limit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { consumeContactRateLimit, CONTACT_RATE } from '../rate-limit'

describe('consumeContactRateLimit', () => {
  it('allows requests up to the configured point budget, then blocks', async () => {
    // Unique IP per run so the shared in-memory limiter state can't bleed in.
    const ip = `test-${CONTACT_RATE.points}-a`
    for (let i = 0; i < CONTACT_RATE.points; i++) {
      expect(await consumeContactRateLimit(ip)).toBe(true)
    }
    expect(await consumeContactRateLimit(ip)).toBe(false)
  })

  it('tracks budgets independently per IP', async () => {
    const a = 'test-independent-a'
    const b = 'test-independent-b'
    for (let i = 0; i < CONTACT_RATE.points; i++) await consumeContactRateLimit(a)
    // `a` is now exhausted; `b` is untouched and must still be allowed.
    expect(await consumeContactRateLimit(a)).toBe(false)
    expect(await consumeContactRateLimit(b)).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/rate-limit.test.ts`
Expected: FAIL — module `../rate-limit` does not exist.

- [ ] **Step 4: Implement the limiter**

Create `app/web/src/lib/rate-limit.ts`:

```ts
import 'server-only'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Layered anti-spam, tier 3: a per-IP sliding budget. In-memory only — suits the
// single-node VPS deploy. Documented limitation: state resets on restart and is
// not shared across instances (acceptable now; revisit if scaled out). Chosen over
// an external captcha to avoid adding a third-party subprocessor / privacy entry.
export const CONTACT_RATE = { points: 5, duration: 3600 } as const

const limiter = new RateLimiterMemory({
  points: CONTACT_RATE.points,
  duration: CONTACT_RATE.duration,
})

/** True if the request is within budget; false once the per-IP window is spent. */
export async function consumeContactRateLimit(ip: string): Promise<boolean> {
  try {
    await limiter.consume(ip)
    return true
  } catch {
    // rate-limiter-flexible rejects with a RateLimiterRes when the budget is spent.
    return false
  }
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -w web -- src/lib/__tests__/rate-limit.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/web/package.json app/package-lock.json app/web/src/lib/rate-limit.ts app/web/src/lib/__tests__/rate-limit.test.ts
git commit -m "feat(web): add in-memory per-IP rate-limit helper for contact form"
```

---

## Task 3: Contact zod schema

**Files:**
- Create: `app/web/src/lib/schemas/contact.ts`
- Test: `app/web/src/lib/__tests__/contact-schema.test.ts`

**Interfaces:**
- Consumes: `type T = (key: string) => string` (translated-message resolver, same convention as `schemas/auth.ts`).
- Produces:
  - `makeContactSchema(t: T)` → zod object with fields `name`, `email`, `subject`, `message` (validated) plus optional `website` (honeypot) and `renderedAt` (timing token) that pass through un-validated.
  - `CONTACT_LIMITS = { NAME_MAX: 100, SUBJECT_MAX: 150, MESSAGE_MIN: 10, MESSAGE_MAX: 5000 }`.
- Validation message keys used: `required`, `email`, `tooLong`, `messageTooShort` (all in the `validation` namespace — `required`/`email` exist; the other two are added in Task 4).

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/contact-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeContactSchema, CONTACT_LIMITS } from '../schemas/contact'

// Identity resolver: assert on the raw message keys the schema requests.
const schema = makeContactSchema((k) => k)

const valid = {
  name: 'Hermione',
  email: 'hermione@example.com',
  subject: 'Card data typo',
  message: 'The Lumos card has the wrong lesson cost listed.',
}

describe('makeContactSchema', () => {
  it('accepts a well-formed submission', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('passes honeypot + timing fields through without failing validation', () => {
    const res = schema.safeParse({ ...valid, website: 'http://spam', renderedAt: '123' })
    expect(res.success).toBe(true)
  })

  it('rejects an empty name with `required`', () => {
    const res = schema.safeParse({ ...valid, name: '   ' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('required')
  })

  it('rejects an invalid email with `email`', () => {
    const res = schema.safeParse({ ...valid, email: 'not-an-email' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('email')
  })

  it('rejects a too-short message with `messageTooShort`', () => {
    const res = schema.safeParse({ ...valid, message: 'too short' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('messageTooShort')
  })

  it('rejects an over-long subject with `tooLong`', () => {
    const res = schema.safeParse({ ...valid, subject: 'x'.repeat(CONTACT_LIMITS.SUBJECT_MAX + 1) })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('tooLong')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/contact-schema.test.ts`
Expected: FAIL — module `../schemas/contact` does not exist.

- [ ] **Step 3: Implement the schema**

Create `app/web/src/lib/schemas/contact.ts`:

```ts
import { z } from 'zod'

type T = (key: string) => string

// Length bounds shared with the server action and any UI hint. `message` has a
// floor so a one-word "hi" doesn't reach the operator inbox.
export const CONTACT_LIMITS = {
  NAME_MAX: 100,
  SUBJECT_MAX: 150,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 5000,
} as const

// Visible fields are validated with translated messages. `website` (honeypot) and
// `renderedAt` (submit-timing token) are optional pass-throughs — the anti-spam
// checks read them from the raw payload, so they must survive parsing but never
// cause a validation failure.
export function makeContactSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')).max(CONTACT_LIMITS.NAME_MAX, t('tooLong')),
    email: z.string().trim().min(1, t('required')).email(t('email')),
    subject: z.string().trim().min(1, t('required')).max(CONTACT_LIMITS.SUBJECT_MAX, t('tooLong')),
    message: z
      .string()
      .trim()
      .min(CONTACT_LIMITS.MESSAGE_MIN, t('messageTooShort'))
      .max(CONTACT_LIMITS.MESSAGE_MAX, t('tooLong')),
    website: z.string().optional(),
    renderedAt: z.string().optional(),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/contact-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/schemas/contact.ts app/web/src/lib/__tests__/contact-schema.test.ts
git commit -m "feat(web): add contact-form zod schema"
```

---

## Task 4: i18n copy + parity guard

**Files:**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Modify: `app/web/src/app/[locale]/__tests__/legal-i18n-parity.test.ts`

**Interfaces:**
- Produces `contact` namespace (en + de) with keys: `metaTitle`, `eyebrow`, `titlePrefix`, `titleAccent`, `intro`, `name`, `email`, `subject`, `message`, `send`, `sending`, `successTitle`, `successBody`, `errorRate`, `errorUnconfigured`, `errorSend`, `errorGeneric`. (The hero renders `titlePrefix` + a gold `<span>titleAccent</span>`, mirroring the `/about` hero; the success state uses `successTitle` + `successBody`.)
- Produces `validation.tooLong` and `validation.messageTooShort` (en + de).
- Produces `email.contact` (en only, mirroring the English-only `email.otp`) with keys: `subject`, `heading`, `fromLabel`, `emailLabel`, `messageLabel`.

- [ ] **Step 1: Extend the parity guard (failing test first)**

In `app/web/src/app/[locale]/__tests__/legal-i18n-parity.test.ts`, add `contact` to the namespace loop:

```ts
  for (const ns of ['about', 'privacy', 'imprint', 'contact'] as const) {
```

- [ ] **Step 2: Run the parity test to verify it fails**

Run: `npm test -w web -- src/app/[locale]/__tests__/legal-i18n-parity.test.ts`
Expected: FAIL — `contact` namespace missing in both locales (`Cannot convert undefined ... Object.keys`).

- [ ] **Step 3: Add the `contact` namespace to `en.json`**

In `app/web/messages/en.json`, add a top-level `"contact"` object (place it after `"imprint"` to keep legal-family namespaces together):

```json
  "contact": {
    "metaTitle": "Contact — Revelio",
    "eyebrow": "Contact",
    "titlePrefix": "Contact the",
    "titleAccent": "archive",
    "intro": "Questions, corrections, or feedback about the card data? Send a message — we'll reply by email.",
    "name": "Your name",
    "email": "Your email",
    "subject": "Subject",
    "message": "Message",
    "send": "Send message",
    "sending": "Sending…",
    "successTitle": "Your message is on its way",
    "successBody": "Thanks — we'll reply by email.",
    "errorRate": "You've sent a few messages already. Please try again later.",
    "errorUnconfigured": "The contact address isn't set up yet. Please try again later.",
    "errorSend": "Something went wrong sending your message. Please try again.",
    "errorGeneric": "Something went wrong. Please try again."
  }
```

- [ ] **Step 4: Add the `contact` namespace to `de.json` (formal "Sie")**

In `app/web/messages/de.json`, add the matching object:

```json
  "contact": {
    "metaTitle": "Kontakt — Revelio",
    "eyebrow": "Kontakt",
    "titlePrefix": "Kontakt zum",
    "titleAccent": "Archiv",
    "intro": "Fragen, Korrekturen oder Feedback zu den Kartendaten? Schreiben Sie uns eine Nachricht — wir antworten per E-Mail.",
    "name": "Ihr Name",
    "email": "Ihre E-Mail-Adresse",
    "subject": "Betreff",
    "message": "Nachricht",
    "send": "Nachricht senden",
    "sending": "Wird gesendet…",
    "successTitle": "Ihre Nachricht ist unterwegs",
    "successBody": "Danke — wir antworten per E-Mail.",
    "errorRate": "Sie haben bereits einige Nachrichten gesendet. Bitte versuchen Sie es später erneut.",
    "errorUnconfigured": "Die Kontaktadresse ist noch nicht eingerichtet. Bitte versuchen Sie es später erneut.",
    "errorSend": "Beim Senden Ihrer Nachricht ist etwas schiefgelaufen. Bitte versuchen Sie es erneut.",
    "errorGeneric": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."
  }
```

- [ ] **Step 5: Add the two `validation` keys to both locales**

In `en.json` `"validation"`, add:

```json
    "tooLong": "This entry is too long.",
    "messageTooShort": "Please write a little more."
```

In `de.json` `"validation"`, add:

```json
    "tooLong": "Dieser Eintrag ist zu lang.",
    "messageTooShort": "Bitte schreiben Sie etwas mehr."
```

- [ ] **Step 6: Add `email.contact` to `en.json` only**

Inside the existing top-level `"email"` object in `en.json` (alongside `"otp"`), add:

```json
    "contact": {
      "subject": "Contact form: {subject}",
      "heading": "New contact message",
      "fromLabel": "From",
      "emailLabel": "Email",
      "messageLabel": "Message"
    }
```

(The contact email — like the OTP email — is rendered English-only via a direct `en` import, so `de.json` needs no `email.contact` entry, and the parity guard covers only page namespaces.)

- [ ] **Step 7: Verify parity + JSON validity**

Run: `npm test -w web -- src/app/[locale]/__tests__/legal-i18n-parity.test.ts`
Expected: PASS (all four namespaces, including `contact`).
Run: `node -e "require('./app/web/messages/en.json');require('./app/web/messages/de.json');console.log('json ok')"`
Expected: prints `json ok` (no parse error).

- [ ] **Step 8: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/app/[locale]/__tests__/legal-i18n-parity.test.ts
git commit -m "i18n(web): add contact namespace + validation keys, guard parity"
```

---

## Task 5: Contact email template

**Files:**
- Create: `app/web/src/lib/email/contact-template.tsx`
- Test: `app/web/src/lib/email/__tests__/contact-template.test.tsx`

**Interfaces:**
- Consumes: `email.contact` i18n keys (Task 4); `@react-email/render` + `@react-email/components` (already deps); `createTranslator` from `next-intl`.
- Produces: `renderContactEmail(input: { name: string; email: string; subject: string; message: string }): Promise<{ subject: string; html: string; text: string }>`. Subject is `email.contact.subject` with the sender subject interpolated; body contains the sender's name, email, and message. English-only, mirroring `renderOtpEmail`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/email/__tests__/contact-template.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderContactEmail } from '../contact-template'

describe('renderContactEmail', () => {
  it('builds a subject, html, and text carrying the sender details', async () => {
    const out = await renderContactEmail({
      name: 'Hermione',
      email: 'hermione@example.com',
      subject: 'Card data typo',
      message: 'The Lumos card has the wrong lesson cost.',
    })

    expect(out.subject).toBe('Contact form: Card data typo')
    // Sender identity + message survive into both renderings so the operator can reply.
    expect(out.html).toContain('Hermione')
    expect(out.html).toContain('hermione@example.com')
    expect(out.html).toContain('The Lumos card has the wrong lesson cost.')
    expect(out.text).toContain('hermione@example.com')
    expect(out.text).toContain('The Lumos card has the wrong lesson cost.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/email/__tests__/contact-template.test.tsx`
Expected: FAIL — module `../contact-template` does not exist.

- [ ] **Step 3: Implement the template**

Create `app/web/src/lib/email/contact-template.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Body, Container, Heading, Hr, Html, Section, Text } from '@react-email/components'
import en from '@/../messages/en.json'

interface ContactEmailInput {
  name: string
  email: string
  subject: string
  message: string
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Operator-facing notification — English-only, mirroring renderOtpEmail. Copy lives
// in messages/en.json → `email.contact`, read via createTranslator so it works
// outside a request/locale context (server actions have none here).
function contactTranslator() {
  return createTranslator({ locale: 'en', messages: en, namespace: 'email.contact' })
}

type Translate = ReturnType<typeof contactTranslator>

function ContactEmail({ name, email, subject, message, t }: ContactEmailInput & { t: Translate }) {
  return (
    <Html lang="en">
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {t('heading')}
          </Heading>
          <Text style={row}>
            <strong>{t('fromLabel')}:</strong> {name}
          </Text>
          <Text style={row}>
            <strong>{t('emailLabel')}:</strong> {email}
          </Text>
          <Text style={row}>
            <strong>{t('messageLabel')}:</strong>
          </Text>
          {/* Preserve the sender's line breaks; the message is untrusted text and is
              only ever rendered as escaped React children (no dangerouslySetInnerHTML). */}
          <Section style={messageBox}>
            <Text style={messageText}>{message}</Text>
          </Section>
          <Hr style={hr} />
          <Text style={fine}>{subject}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderContactEmail(input: ContactEmailInput): Promise<RenderedEmail> {
  const t = contactTranslator()
  const subject = t('subject', { subject: input.subject })
  const element = <ContactEmail {...input} t={t} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '24px 0' }
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto', padding: '0 30px' }
const heading: CSSProperties = {
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '20px',
  fontWeight: 600,
  color: '#3B3194',
}
const row: CSSProperties = {
  margin: '4px 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  color: '#443f66',
}
const messageBox: CSSProperties = {
  margin: '10px 0',
  backgroundColor: '#ffffff',
  border: '1px solid #d9b46a',
  borderRadius: '10px',
}
const messageText: CSSProperties = {
  margin: 0,
  padding: '16px',
  whiteSpace: 'pre-line',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#1C1838',
}
const hr: CSSProperties = { borderColor: '#d9d5e8', margin: '16px 0' }
const fine: CSSProperties = {
  margin: 0,
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '11px',
  color: '#6a6480',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/email/__tests__/contact-template.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/email/contact-template.tsx app/web/src/lib/email/__tests__/contact-template.test.tsx
git commit -m "feat(web): add contact email template"
```

---

## Task 6: `sendContactMessage` server action

**Files:**
- Create: `app/web/src/lib/contact-actions.ts`
- Test: `app/web/src/lib/__tests__/contact-actions.test.ts`

**Interfaces:**
- Consumes: `makeContactSchema` (Task 3), `consumeContactRateLimit` (Task 2), `renderContactEmail` (Task 5), `sendMail` (Task 1), `getCachedSiteSettings` (`@/lib/site-settings`), `headers` (`next/headers`).
- Produces: `sendContactMessage(input: unknown): Promise<ContactResult>` where `type ContactResult = { ok: true } | { ok: false; error: 'invalid' | 'rate' | 'unconfigured' | 'send' }`.
- Behavior order: honeypot (silent `ok:true`) → submit-timing (silent `ok:true`) → validate (`invalid`) → per-IP rate limit (`rate`) → resolve `contactEmail` (`unconfigured`) → render + `sendMail` with `replyTo` (`send` on throw) → `ok:true`.

Spam-check constant: `MIN_SUBMIT_MS = 3000`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/contact-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  sendMail: vi.fn(async () => {}),
  renderContactEmail: vi.fn(async () => ({ subject: 'Contact form: S', html: '<p>h</p>', text: 't' })),
  getCachedSiteSettings: vi.fn(async () => ({ contactEmail: 'ops@revelio.cards' })),
  consumeContactRateLimit: vi.fn(async () => true),
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.7']])),
}))

vi.mock('@/lib/email/mailer', () => ({ sendMail: m.sendMail }))
vi.mock('@/lib/email/contact-template', () => ({ renderContactEmail: m.renderContactEmail }))
vi.mock('@/lib/site-settings', () => ({ getCachedSiteSettings: m.getCachedSiteSettings }))
vi.mock('@/lib/rate-limit', () => ({ consumeContactRateLimit: m.consumeContactRateLimit }))
vi.mock('next/headers', () => ({ headers: m.headers }))

import { sendContactMessage } from '../contact-actions'

// A submission old enough to clear the 3s timing gate.
const base = () => ({
  name: 'Hermione',
  email: 'hermione@example.com',
  subject: 'Card data typo',
  message: 'The Lumos card has the wrong lesson cost listed.',
  website: '',
  renderedAt: String(Date.now() - 10_000),
})

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.sendMail.mockResolvedValue(undefined)
  m.renderContactEmail.mockResolvedValue({ subject: 'Contact form: S', html: '<p>h</p>', text: 't' })
  m.getCachedSiteSettings.mockResolvedValue({ contactEmail: 'ops@revelio.cards' })
  m.consumeContactRateLimit.mockResolvedValue(true)
  m.headers.mockResolvedValue(new Map([['x-forwarded-for', '203.0.113.7']]))
})

describe('sendContactMessage', () => {
  it('delivers a valid message to contactEmail with the sender as replyTo', async () => {
    const res = await sendContactMessage(base())
    expect(res).toEqual({ ok: true })
    expect(m.sendMail).toHaveBeenCalledTimes(1)
    expect(m.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@revelio.cards', replyTo: 'hermione@example.com' }),
    )
  })

  it('silently drops a filled honeypot without sending', async () => {
    const res = await sendContactMessage({ ...base(), website: 'http://spam.example' })
    expect(res).toEqual({ ok: true })
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('silently drops an implausibly fast submit without sending', async () => {
    const res = await sendContactMessage({ ...base(), renderedAt: String(Date.now()) })
    expect(res).toEqual({ ok: true })
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('rejects an invalid payload with `invalid` and does not send', async () => {
    const res = await sendContactMessage({ ...base(), email: 'nope' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('returns `rate` when the per-IP budget is spent', async () => {
    m.consumeContactRateLimit.mockResolvedValueOnce(false)
    const res = await sendContactMessage(base())
    expect(res).toEqual({ ok: false, error: 'rate' })
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('returns `unconfigured` when no contactEmail is set', async () => {
    m.getCachedSiteSettings.mockResolvedValueOnce({ contactEmail: null })
    const res = await sendContactMessage(base())
    expect(res).toEqual({ ok: false, error: 'unconfigured' })
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('maps a thrown mailer error to `send` without leaking internals', async () => {
    m.sendMail.mockRejectedValueOnce(new Error('SMTP boom'))
    const res = await sendContactMessage(base())
    expect(res).toEqual({ ok: false, error: 'send' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/contact-actions.test.ts`
Expected: FAIL — module `../contact-actions` does not exist.

- [ ] **Step 3: Implement the action**

Create `app/web/src/lib/contact-actions.ts`:

```ts
'use server'
import { headers } from 'next/headers'
import { makeContactSchema } from '@/lib/schemas/contact'
import { consumeContactRateLimit } from '@/lib/rate-limit'
import { renderContactEmail } from '@/lib/email/contact-template'
import { sendMail } from '@/lib/email/mailer'
import { getCachedSiteSettings } from '@/lib/site-settings'

export type ContactResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'rate' | 'unconfigured' | 'send' }

// A genuine human takes at least a few seconds to fill the form; a sub-3s submit is
// a bot autofilling the rendered timestamp.
const MIN_SUBMIT_MS = 3000

// The server discards validation messages (the client already showed them), so the
// identity resolver is fine here.
const schema = makeContactSchema((k) => k)

function clientIp(h: Headers): string {
  // Trust the reverse proxy's forwarded chain; first entry is the client. Fall back
  // to x-real-ip, then a constant so the limiter still buckets unknown-IP traffic.
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export async function sendContactMessage(input: unknown): Promise<ContactResult> {
  const raw = (input ?? {}) as Record<string, unknown>

  // Tier 1 — honeypot. A visually-hidden field only bots fill. Return ok:true so
  // they get no signal that the submission was dropped.
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return { ok: true }

  // Tier 2 — submit timing. Drop silently (ok:true) when the form was submitted
  // faster than a human could, or the timestamp is missing/garbage.
  const renderedAt = Number(raw.renderedAt)
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_SUBMIT_MS) {
    return { ok: true }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { name, email, subject, message } = parsed.data

  // Tier 3 — per-IP rate limit.
  const ip = clientIp(await headers())
  if (!(await consumeContactRateLimit(ip))) return { ok: false, error: 'rate' }

  const settings = await getCachedSiteSettings()
  const to = settings?.contactEmail
  if (!to) return { ok: false, error: 'unconfigured' }

  try {
    const mail = await renderContactEmail({ name, email, subject, message })
    // Sender's address as replyTo so the operator replies directly; envelope from
    // stays MAIL_FROM.
    await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: email })
    return { ok: true }
  } catch {
    // Never surface SMTP internals to the client.
    return { ok: false, error: 'send' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/contact-actions.test.ts`
Expected: PASS (all seven cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/contact-actions.ts app/web/src/lib/__tests__/contact-actions.test.ts
git commit -m "feat(web): add sendContactMessage server action with layered anti-spam"
```

---

## Task 7: `ContactForm` client component

**Files:**
- Create: `app/web/src/components/contact-form.tsx`
- Modify: `app/web/src/app/globals.css` (add the `reveal-spark` keyframe)
- Test: `app/web/src/components/__tests__/contact-form.test.tsx`

**Design (from the approved design plan):**
- The form sits in a midnight **card panel** (`bg-card`, `rounded-xl`, `border-border`) with a **gold reveal-glow top edge** — a 1px gradient hairline (`#C8881E → #E8B23A → #F6D58B → #E8B23A`) echoing the OTP email band.
- `name` + `email` share a row at `sm+` (`grid sm:grid-cols-2`); `subject` + `message` full width.
- **Signature — the reveal:** on `{ ok: true }` the panel body cross-fades to a centered gold **spark** (the logo's star path, reused from `StarField`) that fades + scales in with a soft glow via the `reveal-spark` keyframe, above `successTitle` / `successBody`. `motion-reduce:animate-none` so reduced-motion users get a static spark.

**Interfaces:**
- Consumes: `makeContactSchema` (Task 3), `sendContactMessage` (Task 6), `contact` + `validation` i18n namespaces (Task 4), UI primitives `Input`, `Button`, `AutoTextarea`, `FieldError`.
- Produces: `export function ContactForm({ renderedAt }: { renderedAt: number })`. Renders the panelled name/email/subject/message fields + hidden honeypot (`website`) + hidden `renderedAt`; on `{ ok: true }` replaces the body with the spark success reveal; on `{ ok: false }` shows an inline error mapped from the result code.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/contact-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendContactMessage = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/contact-actions', () => ({
  sendContactMessage: (...a: unknown[]) => sendContactMessage(...a),
}))

import { ContactForm } from '../contact-form'
import en from '@/../messages/en.json'

function renderForm() {
  // renderedAt well in the past so the (client-collected) value is plausible.
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ContactForm renderedAt={Date.now() - 10_000} />
    </NextIntlClientProvider>,
  )
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(en.contact.name), 'Hermione')
  await user.type(screen.getByPlaceholderText(en.contact.email), 'hermione@example.com')
  await user.type(screen.getByPlaceholderText(en.contact.subject), 'Card data typo')
  await user.type(
    screen.getByPlaceholderText(en.contact.message),
    'The Lumos card has the wrong lesson cost listed.',
  )
}

beforeEach(() => {
  sendContactMessage.mockReset()
  sendContactMessage.mockResolvedValue({ ok: true })
})

describe('ContactForm', () => {
  it('submits valid input and shows the success message', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(sendContactMessage).toHaveBeenCalledTimes(1)
    expect(sendContactMessage.mock.calls[0][0]).toMatchObject({
      name: 'Hermione',
      email: 'hermione@example.com',
      subject: 'Card data typo',
    })
    expect(await screen.findByText(en.contact.successTitle)).toBeInTheDocument()
  })

  it('shows a validation error and does not submit when the message is too short', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByPlaceholderText(en.contact.name), 'Hermione')
    await user.type(screen.getByPlaceholderText(en.contact.email), 'hermione@example.com')
    await user.type(screen.getByPlaceholderText(en.contact.subject), 'Hi')
    await user.type(screen.getByPlaceholderText(en.contact.message), 'short')
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(await screen.findByText(en.validation.messageTooShort)).toBeInTheDocument()
    expect(sendContactMessage).not.toHaveBeenCalled()
  })

  it('shows the rate-limit error when the action returns error:rate', async () => {
    sendContactMessage.mockResolvedValueOnce({ ok: false, error: 'rate' })
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(await screen.findByText(en.contact.errorRate)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/contact-form.test.tsx`
Expected: FAIL — module `../contact-form` does not exist.

- [ ] **Step 3: Add the `reveal-spark` keyframe to globals.css**

In `app/web/src/app/globals.css`, add this keyframe next to the existing `@keyframes twinkle` block (the spark's fade + scale-in for the success reveal):

```css
@keyframes reveal-spark {
  0% { opacity: 0; transform: scale(0.4) rotate(-12deg); }
  60% { opacity: 1; transform: scale(1.12) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
```

- [ ] **Step 4: Implement the component**

Create `app/web/src/components/contact-form.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { makeContactSchema } from '@/lib/schemas/contact'
import { sendContactMessage, type ContactResult } from '@/lib/contact-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { FieldError } from '@/components/ui/field-error'

type Values = {
  name: string
  email: string
  subject: string
  message: string
  website: string
  renderedAt: string
}

// Maps a failed action result code to a `contact` error message key.
const ERROR_KEY: Record<Exclude<ContactResult, { ok: true }>['error'], string> = {
  invalid: 'errorGeneric',
  rate: 'errorRate',
  unconfigured: 'errorUnconfigured',
  send: 'errorSend',
}

// Gold "reveal" hairline across the panel's top edge — the Reveal-Glow motif,
// echoing the gold band on the OTP email (gold-dark → gold → gold-light → gold).
const REVEAL_EDGE = 'linear-gradient(90deg,#C8881E 0%,#E8B23A 38%,#F6D58B 62%,#E8B23A 100%)'

// The wand-spark star path (shared with StarField / the logo mark).
const SPARK_PATH = 'M12 1.6l2.7 7.3 7.7.2-6.1 4.7 2.2 7.4L12 17l-6.4 4.4 2.2-7.4-6.1-4.7 7.7-.2z'

export function ContactForm({ renderedAt }: { renderedAt: number }) {
  const t = useTranslations('contact')
  const tv = useTranslations('validation')
  const [sent, setSent] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(makeContactSchema((k) => tv(k))),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
      website: '',
      renderedAt: String(renderedAt),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function onSubmit(values: Values) {
    const res = await sendContactMessage(values)
    if (res.ok) {
      setSent(true)
      return
    }
    form.setError('root', { message: t(ERROR_KEY[res.error]) })
  }

  // Success — the reveal. The panel body swaps to a centered gold spark that
  // fades + scales in with a soft glow; reduced-motion users get a static spark.
  if (sent) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div aria-hidden className="h-px w-full" style={{ backgroundImage: REVEAL_EDGE }} />
        <div role="status" className="flex flex-col items-center px-6 py-14 text-center">
          <svg
            viewBox="0 0 24 24"
            width={40}
            height={40}
            aria-hidden
            className="text-primary drop-shadow-[0_0_16px_rgba(232,178,58,0.55)] motion-safe:animate-[reveal-spark_600ms_ease-out]"
          >
            <path fill="currentColor" d={SPARK_PATH} />
          </svg>
          <h2 className="mt-5 text-lg font-semibold text-foreground">{t('successTitle')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('successBody')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {/* Gold reveal-glow top edge. */}
      <div aria-hidden className="h-px w-full" style={{ backgroundImage: REVEAL_EDGE }} />
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>
        {/* Honeypot — visually hidden, off the tab order and a11y tree, no autofill.
            Any value ⇒ the server silently drops the submission. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...form.register('website')}
          />
        </div>
        <input type="hidden" {...form.register('renderedAt')} />

        {/* name + email share a row from sm up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Input
              type="text"
              placeholder={t('name')}
              aria-invalid={!!form.formState.errors.name}
              {...form.register('name')}
            />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Input
              type="email"
              placeholder={t('email')}
              aria-invalid={!!form.formState.errors.email}
              {...form.register('email')}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </div>
        </div>

        <div className="space-y-1.5">
          <Input
            type="text"
            placeholder={t('subject')}
            aria-invalid={!!form.formState.errors.subject}
            {...form.register('subject')}
          />
          <FieldError>{form.formState.errors.subject?.message}</FieldError>
        </div>
        <div className="space-y-1.5">
          <AutoTextarea
            placeholder={t('message')}
            aria-invalid={!!form.formState.errors.message}
            {...form.register('message')}
          />
          <FieldError>{form.formState.errors.message?.message}</FieldError>
        </div>

        <FieldError>{form.formState.errors.root?.message}</FieldError>
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/contact-form.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/contact-form.tsx app/web/src/app/globals.css app/web/src/components/__tests__/contact-form.test.tsx
git commit -m "feat(web): add ContactForm client component with reveal-glow panel"
```

---

## Task 8: `/[locale]/contact` page + wiring

**Files:**
- Create: `app/web/src/app/[locale]/contact/page.tsx`
- Test: `app/web/src/app/[locale]/__tests__/contact-page.test.tsx`

**Design (from the approved design plan):** centered hero — uppercase tracked `eyebrow`, a Poppins-SemiBold H1 of `titlePrefix` + a gold `<span>titleAccent</span>` (mirrors the `/about` hero), the `intro`, then a short **lesson-rule hairline** divider (the shared family device) — over a soft gold radial glow. Narrow `max-w-xl` column (form width). **No `StarField`** here — the success spark is the page's one star moment.

**Interfaces:**
- Consumes: `ContactForm` (Task 7); `contact` i18n namespace (Task 4); `setRequestLocale` + `getTranslations` from `next-intl/server`.
- Produces: default async page component + `generateMetadata` (title from `contact.metaTitle`). Renders the hero + `<ContactForm renderedAt={Date.now()} />` inside a centered `main`. `export const dynamic = 'force-dynamic'` so the timing token is fresh per request (never statically cached).

- [ ] **Step 1: Write the failing test**

Create `app/web/src/app/[locale]/__tests__/contact-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// The page is a server component using next-intl/server helpers. Mock them to an
// identity translator so we assert on the translation KEYS the page wires up
// (the client form is stubbed, so no NextIntlClientProvider is needed).
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) => k,
}))
vi.mock('@/components/contact-form', () => ({
  ContactForm: ({ renderedAt }: { renderedAt: number }) => (
    <div data-testid="contact-form">{renderedAt}</div>
  ),
}))

import ContactPage from '../contact/page'

describe('ContactPage', () => {
  it('renders the eyebrow, accent title, intro, and the form', async () => {
    const ui = await ContactPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByText('eyebrow')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('titlePrefix')
    expect(heading).toHaveTextContent('titleAccent')
    expect(screen.getByText('intro')).toBeInTheDocument()
    expect(screen.getByTestId('contact-form')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/app/[locale]/__tests__/contact-page.test.tsx`
Expected: FAIL — module `../contact/page` does not exist.

- [ ] **Step 3: Implement the page**

Create `app/web/src/app/[locale]/contact/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ContactForm } from '@/components/contact-form'

// Rendered per request so the submit-timing token is fresh and never statically cached.
export const dynamic = 'force-dynamic'

// The four HP TCG Lessons with a canonical colour — reused from the /about hero as
// the shared "family" divider for these secondary pages.
const LESSON_RULE =
  'linear-gradient(90deg, transparent, #0069A9 20%, #00A661 40%, #E2AE37 60%, #BC3E4D 80%, transparent)'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('contact')
  return { title: t('metaTitle') }
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('contact')
  return (
    <main className="relative mx-auto max-w-xl px-6 pt-16 pb-20">
      {/* Soft gold reveal-glow behind the title. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-6 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/15 blur-[90px]"
      />

      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t('titlePrefix')} <span className="text-primary">{t('titleAccent')}</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
        <div
          aria-hidden
          className="mt-8 h-px w-56 max-w-[75%]"
          style={{ backgroundImage: LESSON_RULE }}
        />
      </div>

      <div className="mt-10">
        <ContactForm renderedAt={Date.now()} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/app/[locale]/__tests__/contact-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification — tests, typecheck, lint, build**

Run: `npm test -w web`
Expected: all web tests pass (existing suite + the new files).
Run: `npm run typecheck`
Expected: no errors.
Run: `npm run lint -w web`
Expected: no new errors.
Run: `npm run build -w web`
Expected: build succeeds and the `/[locale]/contact` route is emitted. (Requires the same env vars any `next build` needs — set them as CI/local does.)

- [ ] **Step 6: Manual smoke check (optional but recommended)**

Bring up local infra and dev server (from `app/`), set `contactEmail` in `/admin/settings`, open `/contact`, submit a real message, and confirm delivery in Mailpit/SMTP. Confirm the footer "Contact" link now resolves (was 404 before this task).

- [ ] **Step 7: Commit**

```bash
git add app/web/src/app/[locale]/contact/page.tsx app/web/src/app/[locale]/__tests__/contact-page.test.tsx
git commit -m "feat(web): add /contact page wiring the contact form"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
| --- | --- |
| `/[locale]/contact` page + `generateMetadata` | Task 8 |
| `ContactForm` client component, four fields | Task 7 |
| Zod schema with translated messages | Task 3 |
| `sendContactMessage` action: validate → spam → send → result | Task 6 |
| Contact email template mirroring OTP | Task 5 |
| Honeypot | Tasks 6 (server) + 7 (hidden field) |
| Submit-timing | Tasks 8 (token minted) + 7 (carried) + 6 (checked) |
| Per-IP rate limit | Task 2 (helper) + Task 6 (applied) |
| `contact` i18n namespace (en + de) | Task 4 |
| Design: reveal-glow panel, gold-accent hero, spark success reveal | Tasks 7 (panel + spark + keyframe) + 8 (hero) |
| Recipient from `getCachedSiteSettings().contactEmail` | Task 6 |
| `replyTo = sender` | Tasks 1 (mailer) + 6 (passed) |
| `sendMail` gains `replyTo` (spec's flagged plan item) | Task 1 |
| Result codes `rate`/`unconfigured`/`send`, no internal leakage | Task 6 |
| Out of scope: DB storage, external captcha, attachments, auto-reply | none — intentionally excluded |

All spec "Testing" bullets are covered: validation (T3, T7), honeypot (T6), timing (T6), rate limit (T2, T6), unconfigured (T6), happy path with `to`/`replyTo` (T6), form UX success/error (T7).

**Open decisions (all resolved before this plan):** (1) layered zero-subprocessor anti-spam — chosen, via `rate-limiter-flexible` in-memory; (2) fields — full name/email/subject/message; (3) rate-limit storage — in-memory library, restart/per-instance caveat documented in Task 2. Update the spec header to **LOCKED** when execution begins.

**2. Placeholder scan:** none — every code step contains complete, runnable code; no "TBD"/"add validation"/"similar to Task N".

**3. Type consistency:** `ContactResult` (T6) is imported by T7; `makeContactSchema`/`CONTACT_LIMITS` (T3) used by T6 & T7 with matching field names; `renderContactEmail` input shape (T5) matches the T6 call; `sendMail` `replyTo` (T1) matches the T6 call; `consumeContactRateLimit(ip): Promise<boolean>` (T2) matches the T6 usage; `contact`/`validation`/`email.contact` keys (T4) match every `t(...)` call in T5–T8.

# OTP Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Better Auth's sign-in OTP as an on-brand email through a self-hosted SMTP server, with Mailpit catching mail in local dev.

**Architecture:** A pure `renderOtpEmail()` builds the `{ subject, html, text }` (light "Parchment" design, table-based inline HTML). A server-only `sendMail()` sends it through a Nodemailer SMTP transport built from env. The `sendVerificationOTP` hook in `auth.ts` wires the two together, replacing today's `console.log`/`throw`.

**Tech Stack:** Next.js 16 / React 19, Better Auth email-OTP plugin, Nodemailer, Mailpit (dev), Vitest.

## Global Constraints

- All commands run from `app/` (npm workspaces root). Web workspace is `-w web`.
- Conventional Commits for every commit message.
- OTP is **6 digits**, expires in **10 minutes** (`otpLength: 6`, `expiresIn: 600` in `auth.ts` — the email copy must say "10 minutes" to match).
- Env var names are exact: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- `MAIL_FROM` default when unset: `Revelio <no-reply@revelio.cards>`.
- Vitest already stubs `server-only` (→ `test/empty.ts`); no extra config needed. Test glob is `src/**/*.test.{ts,tsx}`.
- Email is **English only** for v1; **code-only** (no magic-link button); always include a plain-text alternative.
- `renderOtpEmail` must be pure (no I/O) so it is unit-testable without infrastructure.
- Design B palette (from `logos/BRAND-GUIDE.md`): parchment `#FBF3DC`, gold `#E8B23A` / gold-dark `#C8881E`, indigo `#3B3194`, ink `#1C1838`.

---

### Task 1: Dependencies & local mail infra

Add the Nodemailer dependency, a Mailpit service for local dev, and the SMTP env block. No unit test — verified by install success and a valid compose config.

**Files:**
- Modify: `app/web/package.json` (dependencies)
- Modify: `app/docker-compose.yml` (add `mailpit` service)
- Modify: `app/.env.example` (add SMTP block)

**Interfaces:**
- Consumes: nothing.
- Produces: `nodemailer` importable in the web workspace; `mailpit` reachable at `mailpit:1025` (SMTP) / `localhost:8025` (UI); documented `SMTP_*` + `MAIL_FROM` env vars.

- [ ] **Step 1: Install nodemailer + types**

Run from `app/`:

```bash
npm install nodemailer -w web
npm install -D @types/nodemailer -w web
```

- [ ] **Step 2: Verify the install resolved**

Run: `npm ls nodemailer -w web`
Expected: prints `nodemailer@<version>` under `@revelio/web` with no "missing" errors.

- [ ] **Step 3: Add the Mailpit service to docker-compose**

In `app/docker-compose.yml`, add this service alongside the other default services (same indentation level as `postgres:`, and NOT under the `tools` profile so `docker compose up` starts it):

```yaml
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # web UI  → http://localhost:8025
```

- [ ] **Step 4: Add the SMTP block to .env.example**

Append to `app/.env.example`:

```bash
# ---- Transactional email (OTP sign-in codes) ----
# Compose points at the mailpit service; view caught mail at http://localhost:8025
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false          # true only for implicit TLS (port 465)
SMTP_USER=                 # blank for mailpit; set for a real server
SMTP_PASS=
MAIL_FROM=Revelio <no-reply@revelio.cards>
# Production deliverability is a mailserver concern, not app config:
# the sending domain needs SPF + DKIM + DMARC and a clean PTR/reverse-DNS,
# or codes will land in spam regardless of how the email looks.
```

- [ ] **Step 5: Verify the compose file is still valid**

Run from `app/`: `docker compose config >/dev/null && echo OK`
Expected: prints `OK` (no YAML/schema error). If Docker is unavailable, instead run `npx --yes js-yaml docker-compose.yml >/dev/null && echo OK` to at least confirm valid YAML.

- [ ] **Step 6: Commit**

```bash
git add app/web/package.json app/web/package-lock.json app/package-lock.json app/docker-compose.yml app/.env.example
git commit -m "chore(web): add nodemailer + mailpit for OTP email"
```

---

### Task 2: OTP email template (pure renderer)

**Files:**
- Create: `app/web/src/lib/email/otp-template.ts`
- Test: `app/web/src/lib/email/__tests__/otp-template.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password'
  function renderOtpEmail(input: { otp: string; type: OtpEmailType }):
    { subject: string; html: string; text: string }
  ```

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/email/__tests__/otp-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderOtpEmail } from '../otp-template'

describe('renderOtpEmail', () => {
  it('puts the code in subject, html, and text', () => {
    const { subject, html, text } = renderOtpEmail({ otp: '482913', type: 'sign-in' })
    expect(subject).toContain('482913')
    expect(html).toContain('482913')
    expect(text).toContain('482913')
  })

  it('states the 10-minute expiry and a reassurance line', () => {
    const { html, text } = renderOtpEmail({ otp: '000000', type: 'sign-in' })
    expect(html).toContain('10 minutes')
    expect(html.toLowerCase()).toContain('ignore')
    expect(text).toContain('10 minutes')
  })

  it('includes the unofficial fan-project disclaimer', () => {
    const { html } = renderOtpEmail({ otp: '000000', type: 'sign-in' })
    expect(html).toContain('unofficial')
  })

  it('varies the heading by type', () => {
    const signIn = renderOtpEmail({ otp: '1', type: 'sign-in' }).html
    const verify = renderOtpEmail({ otp: '1', type: 'email-verification' }).html
    expect(signIn).not.toEqual(verify)
    expect(verify.toLowerCase()).toContain('verify')
  })

  it('provides a non-empty, tag-free plain-text alternative', () => {
    const { text } = renderOtpEmail({ otp: '482913', type: 'sign-in' })
    expect(text.length).toBeGreaterThan(20)
    expect(text).not.toContain('<')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- src/lib/email/__tests__/otp-template.test.ts`
Expected: FAIL — cannot resolve `../otp-template` (module not found).

- [ ] **Step 3: Write the implementation**

Create `app/web/src/lib/email/otp-template.ts`:

```ts
export type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password'

interface OtpEmailInput {
  otp: string
  type: OtpEmailType
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const HEADING: Record<OtpEmailType, string> = {
  'sign-in': 'Confirm it’s you',
  'email-verification': 'Verify your email',
  'forget-password': 'Reset your password',
}

const INTRO: Record<OtpEmailType, string> = {
  'sign-in': 'Enter this code to finish signing in to Revelio. It works once and only for you.',
  'email-verification': 'Enter this code to verify your email address. It works once and only for you.',
  'forget-password': 'Enter this code to reset your Revelio password. It works once and only for you.',
}

const SUBJECT: Record<OtpEmailType, string> = {
  'sign-in': 'sign-in code',
  'email-verification': 'verification code',
  'forget-password': 'password reset code',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function renderOtpEmail({ otp, type }: OtpEmailInput): RenderedEmail {
  const code = escapeHtml(otp)
  const heading = HEADING[type]
  const intro = INTRO[type]
  const subject = `${otp} is your Revelio ${SUBJECT[type]}`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#FBF3DC;">
<span style="display:none!important;opacity:0;color:#FBF3DC;height:0;width:0;overflow:hidden;">Your Revelio code is ${code}. It expires in 10 minutes.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3DC;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF3DC;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#E8B23A;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 30px 6px;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:22px;font-weight:600;color:#3B3194;letter-spacing:-0.4px;">revelio</td></tr>
<tr><td style="padding:6px 30px 0;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:21px;font-weight:600;color:#3B3194;">${heading}</td></tr>
<tr><td style="padding:8px 30px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#443f66;">${intro}</td></tr>
<tr><td style="padding:22px 30px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #d9b46a;border-radius:12px;">
<tr><td align="center" style="padding:22px;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:38px;font-weight:600;letter-spacing:10px;color:#1C1838;">${code}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:2px 30px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#C8881E;">Expires in 10 minutes</td></tr>
<tr><td style="padding:22px 30px 0;"><div style="height:1px;background:#d9d5e8;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:16px 30px 30px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a749b;">
Didn’t try to sign in? You can safely ignore this email — no one can get in without the code.<br><br>
Revelio is an unofficial fan project for the Harry Potter Trading Card Game (2001, WotC).<br>
<a href="https://revelio.cards" style="color:#3B3194;">revelio.cards</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = `${heading}

${intro}

${otp}

This code expires in 10 minutes and can be used once.

Didn't try to sign in? You can safely ignore this email — no one can get in without the code.

Revelio is an unofficial fan project for the Harry Potter Trading Card Game (2001, WotC).
https://revelio.cards`

  return { subject, html, text }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web -- src/lib/email/__tests__/otp-template.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/email/otp-template.ts app/web/src/lib/email/__tests__/otp-template.test.ts
git commit -m "feat(web): render OTP sign-in email (parchment template)"
```

---

### Task 3: SMTP mailer (server-only transport)

**Files:**
- Create: `app/web/src/lib/email/mailer.ts`
- Test: `app/web/src/lib/email/__tests__/mailer.test.ts`

**Interfaces:**
- Consumes: `nodemailer` (Task 1); env `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`.
- Produces:
  ```ts
  function sendMail(msg: { to: string; subject: string; html: string; text: string }): Promise<void>
  ```
  Sends via SMTP when `SMTP_HOST` is set; otherwise logs a warning and resolves (never throws).

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/email/__tests__/mailer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  send: vi.fn(async () => ({ messageId: 'x' })),
  createTransport: vi.fn(),
}))
m.createTransport.mockReturnValue({ sendMail: m.send })

vi.mock('nodemailer', () => ({
  default: { createTransport: m.createTransport },
  createTransport: m.createTransport,
}))

import { sendMail } from '../mailer'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('sendMail', () => {
  it('sends via the SMTP transport when SMTP_HOST is set', async () => {
    vi.stubEnv('SMTP_HOST', 'mailpit')
    vi.stubEnv('SMTP_PORT', '1025')
    vi.stubEnv('MAIL_FROM', 'Revelio <no-reply@revelio.cards>')

    await sendMail({ to: 'wizard@example.com', subject: 'S', html: '<p>h</p>', text: 't' })

    expect(m.send).toHaveBeenCalledTimes(1)
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Revelio <no-reply@revelio.cards>',
        to: 'wizard@example.com',
        subject: 'S',
        html: '<p>h</p>',
        text: 't',
      }),
    )
  })

  it('does not throw or send when SMTP_HOST is unset', async () => {
    await expect(
      sendMail({ to: 'wizard@example.com', subject: 'S', html: 'h', text: 't' }),
    ).resolves.toBeUndefined()
    expect(m.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- src/lib/email/__tests__/mailer.test.ts`
Expected: FAIL — cannot resolve `../mailer` (module not found).

- [ ] **Step 3: Write the implementation**

Create `app/web/src/lib/email/mailer.ts`:

```ts
import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

let cached: Transporter | null = null

function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST
  if (!host) return null
  if (cached) return cached

  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  cached = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass } : undefined,
  })
  return cached
}

export async function sendMail(msg: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<void> {
  const transport = getTransport()
  const from = process.env.MAIL_FROM ?? 'Revelio <no-reply@revelio.cards>'

  if (!transport) {
    // No SMTP configured — don't crash sign-in; make the miss visible instead.
    // eslint-disable-next-line no-console
    console.warn(`[mail] SMTP_HOST unset; not sending "${msg.subject}" to ${msg.to}`)
    return
  }

  await transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web -- src/lib/email/__tests__/mailer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/email/mailer.ts app/web/src/lib/email/__tests__/mailer.test.ts
git commit -m "feat(web): add server-only SMTP mailer"
```

---

### Task 4: Wire the auth hook & verify end-to-end

**Files:**
- Modify: `app/web/src/lib/auth.ts:22-32` (the `emailOTP` `sendVerificationOTP` hook)

**Interfaces:**
- Consumes: `renderOtpEmail` (Task 2), `sendMail` (Task 3).
- Produces: a working OTP email on sign-in; no more production `throw`.

- [ ] **Step 1: Add the imports**

At the top of `app/web/src/lib/auth.ts`, after the existing imports, add:

```ts
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
```

- [ ] **Step 2: Replace the hook body**

In `app/web/src/lib/auth.ts`, replace the current `sendVerificationOTP` implementation:

```ts
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Email provider not configured (deferred to Plan 5)')
        }
        // eslint-disable-next-line no-console
        console.log(`[auth] OTP for ${email} (${type}): ${otp}`)
      },
```

with:

```ts
      async sendVerificationOTP({ email, otp, type }) {
        const { subject, html, text } = renderOtpEmail({ otp, type })
        await sendMail({ to: email, subject, html, text })
      },
```

- [ ] **Step 3: Typecheck and run the full suite**

Run from `app/`:

```bash
npm run typecheck
npm test -w web -- src/lib/email
```

Expected: typecheck passes; the 3 email test files pass (7 tests total). If `type` produces a TS error, confirm Better Auth's hook `type` union matches `OtpEmailType` (`'sign-in' | 'email-verification' | 'forget-password'`) — it does; no cast needed.

- [ ] **Step 4: Verify end-to-end against Mailpit**

Run from `app/`:

```bash
docker compose up -d mailpit postgres meilisearch minio
npm run dev -w web
```

Then in a browser: open the app, start a sign-in with any email, submit to trigger an OTP. Open **http://localhost:8025** (Mailpit) and confirm:
- an email arrived from `Revelio <no-reply@revelio.cards>`,
- the subject reads `<code> is your Revelio sign-in code`,
- the HTML renders the parchment template with the gold band and the 6-digit code,
- the code shown in Mailpit lets you complete sign-in.

Expected: email present and renders correctly; sign-in completes using the code.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/auth.ts
git commit -m "feat(web): send OTP sign-in codes by email"
```

---

## Verification (whole feature)

Run from `app/`:

```bash
npm run typecheck          # clean
npm run lint -w web        # no new errors (baseline: 14 warnings, 0 errors)
npm test -w web            # all web tests pass, including the 3 new email files
```

Manual: the Task 4 Step 4 Mailpit check confirms the real send path.

## Notes for the implementer

- **Don't** set `SMTP_HOST` in CI/test env — the mailer's unset-host branch keeps tests and the build from needing a live SMTP server.
- The `@import` Poppins line only enhances Apple Mail; every other client falls back to Arial/Helvetica by design. Do not treat a missing Poppins render as a bug.
- Keep the copy's "10 minutes" in sync with `expiresIn: 600` in `auth.ts` if that value ever changes.

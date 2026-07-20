# OTP Email Delivery — Design Spec

**Date:** 2026-07-20
**Status:** Approved for planning
**Area:** Auth / transactional email

## Problem

Sign-in uses Better Auth's email-OTP plugin. Today the `sendVerificationOTP`
hook in `app/web/src/lib/auth.ts` only `console.log`s the 6-digit code in
development and **throws** in production:

```ts
if (process.env.NODE_ENV === 'production') {
  throw new Error('Email provider not configured (deferred to Plan 5)')
}
console.log(`[auth] OTP for ${email} (${type}): ${otp}`)
```

This is the deferred "Plan 5" email work. We need to (1) render a real,
on-brand OTP email and (2) actually deliver it via our **own SMTP mailserver**
(no paid provider).

## Decisions

| Question | Decision |
|---|---|
| Visual design | **Parchment Scroll** — light background, best-practice for auth mail, renders consistently across clients and inverts gracefully in dark mode |
| Transport | **Nodemailer → self-hosted SMTP** (no vendor, no per-email cost) |
| Local dev | **Mailpit** container in `docker-compose` catches all outgoing mail; app always sends via SMTP (pointed at Mailpit locally) |
| Email body | Code-only (no magic-link button), live selectable text, plain-text alternative always included |
| Localization | English only for v1 — the Better Auth hook carries no request locale (deferred) |
| Deliverability (SPF/DKIM/DMARC/PTR) | Mailserver ops, out of scope for app code; documented as an operator requirement |

### Why code-only, no magic-link button

Link-scanners and "safe link" proxies (Outlook ATP, corporate gateways)
prefetch URLs and can silently consume a one-time link before the user clicks.
A code the user types is immune. Best practice for auth mail.

### Why a light template

Dark-background emails are re-tinted unpredictably by client dark-mode
auto-inversion (Outlook.com, Gmail app). A light template renders identically
everywhere and inverts gracefully. The brand identity is preserved through the
gold top band, wordmark, and indigo headings rather than a dark ground.

## Architecture

New folder `app/web/src/lib/email/` with two focused, independently testable
units, plus edits to the auth hook, compose, env, and package manifest.

```
sendVerificationOTP(hook)
      │  renderOtpEmail({ otp, type })  ── pure, no I/O
      ▼
  { subject, html, text }
      │  sendMail({ to, subject, html, text })
      ▼
  Nodemailer transport ──SMTP──▶  Mailpit (dev)  /  own mailserver (prod)
```

### 1. `email/otp-template.ts` — pure renderer

```ts
export type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password'

export function renderOtpEmail(input: {
  otp: string
  type: OtpEmailType
}): { subject: string; html: string; text: string }
```

- **No I/O** — a pure function of its inputs, so it is fully unit-testable.
- Returns **table-based, inline-styled HTML** (bulletproof across email clients)
  and a **plain-text** alternative.
- Design B (Parchment): parchment `#FBF3DC` ground, gold top band
  (`#C8881E → #E8B23A → #F6D58B`), indigo `#3B3194` heading, ink `#1C1838`
  body, the code in large letter-spaced live text inside a white chip with a
  gold hairline.
- Fonts: Arial/Helvetica web-safe stack with Poppins as progressive
  enhancement (`@import` / `font-family` fallback — only Apple Mail loads it).
- Content: heading, one-line instruction, the code, **"Expires in 10 minutes"**,
  a **"didn't request this? ignore it"** reassurance line, and the unofficial
  fan-project disclaimer + `revelio.cards`.
- **Subject** includes the code so it is grabbable from the notification, e.g.
  `482913 is your Revelio sign-in code`. A hidden **preheader** repeats it.
- The heading adapts lightly to `type` (sign-in / verify email / reset), but a
  single visual design is used for all.
- All interpolated values (only `otp`, which is digits) are treated as
  untrusted and HTML-escaped defensively.

### 2. `email/mailer.ts` — SMTP transport

```ts
import 'server-only'
export async function sendMail(msg: {
  to: string; subject: string; html: string; text: string
}): Promise<void>
```

- `import 'server-only'` guarantees it can never be bundled to the client.
- Lazily builds a **singleton** Nodemailer transport from env:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
  Auth is optional (Mailpit needs none).
- `from` comes from `MAIL_FROM` (e.g. `Revelio <no-reply@revelio.cards>`).
- If `SMTP_HOST` is **unset**, `sendMail` does not throw — it logs a warning and
  (in non-production) prints the code, so CI/tests and un-configured
  environments degrade gracefully instead of crashing sign-in.

### 3. `auth.ts` — wire the hook

Replace the hook body:

```ts
async sendVerificationOTP({ email, otp, type }) {
  const { subject, html, text } = renderOtpEmail({ otp, type })
  await sendMail({ to: email, subject, html, text })
}
```

The production `throw` is removed. Failure handling lives in `sendMail`.

### 4. `docker-compose.yml` — Mailpit

Add to the default (non-profile) services so `docker compose up` starts it:

```yaml
mailpit:
  image: axllent/mailpit:latest
  ports:
    - "1025:1025"   # SMTP
    - "8025:8025"   # web UI  → http://localhost:8025
```

### 5. `.env.example` — SMTP block

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

### 6. `web/package.json`

Add `nodemailer` (dependency) and `@types/nodemailer` (devDependency).

## Testing (TDD)

- **`otp-template.test.ts`** (primary, pure — no infra): the returned `html`
  and `text` contain the OTP; the subject contains the OTP; the body contains
  the expiry ("10 minutes"), the reassurance line, and the fan-project
  disclaimer; heading varies by `type`; a plain-text alternative is present and
  non-empty.
- **`mailer.test.ts`**: with a mocked Nodemailer transport, `sendMail` invokes
  `transport.sendMail` once with the right `from`/`to`/`subject`/`html`/`text`;
  with `SMTP_HOST` unset it does **not** throw.
- No new live-service test is required (Mailpit is a dev convenience, not a CI
  dependency); existing CI jobs are unaffected.

## Files touched

| File | Change |
|---|---|
| `app/web/src/lib/email/otp-template.ts` | **new** — pure HTML/text renderer |
| `app/web/src/lib/email/mailer.ts` | **new** — server-only Nodemailer transport |
| `app/web/src/lib/email/__tests__/otp-template.test.ts` | **new** |
| `app/web/src/lib/email/__tests__/mailer.test.ts` | **new** |
| `app/web/src/lib/auth.ts` | edit hook to render + send |
| `app/docker-compose.yml` | add `mailpit` service |
| `app/.env.example` | add `SMTP_*` + `MAIL_FROM` block |
| `app/web/package.json` | add `nodemailer` + `@types/nodemailer` |

## Out of scope / deferred

- Localized (i18n) email bodies — the hook has no request locale.
- Other transactional emails (welcome, notifications) — only OTP for now.
- DKIM/SPF/DMARC/PTR setup on the mailserver — operator responsibility.
- React-email / templating library — a single hand-written template is simpler.

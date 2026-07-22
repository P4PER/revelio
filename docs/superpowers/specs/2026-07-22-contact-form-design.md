# Contact Form (`/contact`) — Design

> **Status: DRAFT (drafted 2026-07-22).** Brainstormed at the track level; the
> spam-protection approach carries an **Open decision** (flagged) to confirm before
> locking. **Spec 3 of 3** in the "footer legal & about pages" track.
> **Depends on Spec 1** (`getCachedSiteSettings()` → `contactEmail`) and the existing
> `sendMail` mailer. The Privacy Policy (Spec 2) already describes this processing.

## Summary

Build the footer-linked `/contact` page: a real contact form that validates input,
resists bots, and emails the operator. Submissions are delivered by email (no DB
storage) to the `contactEmail` from the Spec 1 settings store, with the sender's
address as `reply-to` so the operator can reply directly. Spam is handled without a
third-party captcha — keeping the stack dependency-free and avoiding an extra GDPR
processor disclosure.

## Context & principle

The app already has a working, SMTP-backed `sendMail` (used for auth OTPs) and the
form/validation conventions from `auth-form.tsx` + `set-actions.ts`. This spec reuses
both. Recipient is not hardcoded — it comes from `getCachedSiteSettings().contactEmail`
(Spec 1), so the contact address has one source of truth shared with the Impressum.

Spam protection is scaled to a **small, non-commercial fan project**: a layered,
zero-dependency approach (honeypot + submit-timing + per-IP rate limit) rather than an
external captcha (Turnstile/hCaptcha) that would add a third-party subprocessor and
another privacy disclosure. This is the **Open decision** below.

## Scope

**In scope**

- `/[locale]/contact` page (server component + `generateMetadata`) rendering a
  `ContactForm` client component.
- Fields: name, email, subject, message — zod-validated with translated messages.
- `sendContactMessage` server action: validate → spam checks → send email via
  `sendMail` → return `{ ok } | { ok:false, error }`.
- A contact email template (`subject`/`text`/`html`) mirroring `otp-template.tsx`.
- Spam protection: **honeypot** hidden field + **submit-timing** check + **per-IP
  rate limit**.
- `contact` i18n namespace (en + de): title, labels, placeholders, success, error.

**Out of scope**

- Storing messages in the DB / a ticketing inbox (email delivery only; YAGNI).
- External captcha services (unless the Open decision flips to it).
- File attachments.
- Notifying the sender by auto-reply (only operator delivery).

## Verified current-state facts

- `sendMail({ to, subject, html, text })` exists (`src/lib/email/mailer.ts`,
  `server-only`, nodemailer); throws loudly if SMTP/`MAIL_FROM` unset. `MAIL_FROM`
  is the envelope `from`; the sender's own address will be set as **`replyTo`**.
- `renderOtpEmail` (`otp-template.tsx`) is the template pattern to mirror.
- Form conventions: react-hook-form + `zodResolver` + translated `validation`
  messages; `Input`, `auto-textarea` (for the message body), `FieldError`, `Button`.
- Actions mirror `set-actions.ts` (`'use server'`, validate, act, return a result).
- `contactEmail` comes from Spec 1's `getCachedSiteSettings()`.

## Design

### 1. Page + form

- `/[locale]/contact/page.tsx` — server component, `generateMetadata` +
  `setRequestLocale`, renders `<ContactForm />` inside the standard `main` shell.
- `ContactForm` (client): react-hook-form + `zodResolver`. Visible fields —
  `name` (`Input`), `email` (`Input type=email`), `subject` (`Input`),
  `message` (`auto-textarea`). `FieldError` per field. Submit `Button` disabled while
  submitting; on success the form is replaced by a success message, on failure an
  inline error is shown.
- Zod schema in `src/lib/schemas/contact.ts` (translated messages): name required
  (bounded length), email valid, subject required (bounded), message required
  (min/max length).

### 2. Anti-spam (layered, zero-dependency) — **Open decision**

1. **Honeypot** — a visually-hidden, `aria-hidden`, `tabindex=-1`,
   `autocomplete=off` field (e.g. "website"); any non-empty value ⇒ silently drop
   (return `{ ok:true }` so bots get no signal).
2. **Submit timing** — a rendered-at timestamp (signed or opaque) submitted with the
   form; a submission faster than a small threshold (e.g. < 2–3s) ⇒ silently drop.
3. **Per-IP rate limit** — an in-memory sliding window / token bucket keyed by IP
   (from request headers), e.g. N messages per window. **Documented limitation:**
   in-memory state suits the single-node VPS deploy; it resets on restart and would
   not share across multiple instances (acceptable now; revisit if scaled out).

**Open decision:** confirm this layered approach vs. adding Cloudflare Turnstile /
hCaptcha (stronger, but a third-party subprocessor + an extra Privacy Policy entry +
a client widget). Recommendation: **layered/zero-dependency** for a fan project.

### 3. Delivery (`sendContactMessage`)

- `'use server'`; validate with the zod schema (reject invalid); run the anti-spam
  checks (silent-drop on honeypot/timing; rate-limit ⇒ `{ ok:false, error:'rate' }`).
- Resolve `contactEmail` via `getCachedSiteSettings()`; if unset ⇒
  `{ ok:false, error:'unconfigured' }` (operator must set it in `/admin/settings`).
- Render the contact template and `sendMail({ to: contactEmail, subject, html, text,
  replyTo: <sender email> })`. **Open item for the plan:** `sendMail` currently has
  no `replyTo` param — extend its signature to pass `replyTo` through to nodemailer.
- Return `{ ok:true }` on success; map thrown mailer errors to
  `{ ok:false, error:'send' }` (never leak internals to the client).

### 4. Email template

`src/lib/email/contact-template.tsx` — `renderContactEmail({ name, email, subject,
message })` returning `{ subject, html, text }` (subject prefixed, body includes the
sender's name/email and message). Mirrors `otp-template.tsx`; no secrets logged.

### 5. i18n

New `contact` namespace (en + de): page title/intro, field labels + placeholders,
submit label, success message, and error messages (`rate`, `unconfigured`, `send`,
generic). Validation strings under the existing `validation` namespace.

## Testing

- **Validation:** missing/invalid fields rejected with the right messages; valid
  payload passes.
- **Honeypot:** a filled honeypot returns `{ ok:true }` **without** calling
  `sendMail`.
- **Timing:** an implausibly fast submit is dropped without sending.
- **Rate limit:** exceeding the window returns `{ ok:false, error:'rate' }`.
- **Unconfigured:** with `contactEmail` unset, returns `{ ok:false,
  error:'unconfigured' }` and does not send.
- **Happy path:** `sendMail` is called once with `to = contactEmail`,
  `replyTo = sender email`, and the templated subject/body.
- **Form UX:** submits, shows success; shows inline error on failure.

## Open decisions (confirm before locking)

1. **Spam protection** — layered zero-dependency (recommended) vs. external captcha.
2. **Fields** — is `subject` wanted, or just name/email/message?
3. **Rate-limit** — in-memory acceptable, or require DB-backed (survives restart /
   multi-instance)?

## Next step

Resolve the open decisions, mark LOCKED, then `superpowers:writing-plans`. Ships last
(needs Spec 1's `contactEmail`; Spec 2's Privacy Policy already documents it).

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

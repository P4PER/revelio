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
  // The leftmost x-forwarded-for entry is CLIENT-CONTROLLED (a bot can send its own
  // header and rotate it to dodge the per-IP limit), so we never trust it. Behind our
  // single reverse proxy the trustworthy value is x-real-ip (the proxy overwrites any
  // client-supplied one); failing that, the LAST x-forwarded-for entry is the hop our
  // proxy appended. Fall back to a constant so unknown-IP traffic still shares a bucket.
  const realIp = h.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const fwd = h.get('x-forwarded-for')
  if (fwd) {
    const parts = fwd.split(',')
    return parts[parts.length - 1].trim()
  }
  return 'unknown'
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

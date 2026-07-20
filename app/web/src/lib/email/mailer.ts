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

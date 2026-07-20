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
    // Only pass credentials when BOTH are present; `{ user, pass: undefined }`
    // makes nodemailer attempt AUTH with an undefined password.
    auth: user && pass ? { user, pass } : undefined,
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
  const from = process.env.MAIL_FROM

  if (!transport || !from) {
    // Fail loudly rather than silently dropping the user's sign-in code — a
    // misconfigured mailer must surface, not pretend the OTP was sent. (Never
    // log msg.subject here: the subject contains the OTP code.)
    throw new Error('[mail] SMTP not configured (set SMTP_HOST and MAIL_FROM)')
  }

  await transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text })
}

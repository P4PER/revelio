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

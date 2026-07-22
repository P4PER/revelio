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

  it('throws (rather than silently dropping) when SMTP is not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('MAIL_FROM', '')
    let error: unknown
    await sendMail({ to: 'wizard@example.com', subject: 'S', html: 'h', text: 't' }).catch(
      (e: unknown) => {
        error = e
      },
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/SMTP not configured/)
    expect(m.send).not.toHaveBeenCalled()
  })

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
})

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

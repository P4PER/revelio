import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderOtpEmail } from '../otp-template'

describe('renderOtpEmail', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('puts the code in subject, html, and text', async () => {
    const { subject, html, text } = await renderOtpEmail({ otp: '482913', type: 'sign-in' })
    expect(subject).toContain('482913')
    expect(html).toContain('482913')
    expect(text).toContain('482913')
  })

  it('states the 10-minute expiry and a reassurance line', async () => {
    const { html, text } = await renderOtpEmail({ otp: '000000', type: 'sign-in' })
    expect(html).toContain('10 minutes')
    expect(html.toLowerCase()).toContain('ignore')
    expect(text).toContain('10 minutes')
  })

  it('includes the unofficial fan-project disclaimer', async () => {
    const { html } = await renderOtpEmail({ otp: '000000', type: 'sign-in' })
    expect(html).toContain('unofficial')
  })

  it('varies the heading by type', async () => {
    const signIn = (await renderOtpEmail({ otp: '1', type: 'sign-in' })).html
    const verify = (await renderOtpEmail({ otp: '1', type: 'email-verification' })).html
    expect(signIn).not.toEqual(verify)
    expect(verify.toLowerCase()).toContain('verify')
  })

  it('pulls copy from the en i18n catalog (change-email variant)', async () => {
    const { subject, html } = await renderOtpEmail({ otp: '482913', type: 'change-email' })
    expect(subject).toBe('482913 is your Revelio email change code')
    expect(html).toContain('Confirm your new email')
  })

  it('shows the CONTACT_EMAIL mailto link in the footer when configured', async () => {
    vi.stubEnv('CONTACT_EMAIL', 'help@revelio.cards')
    const { html } = await renderOtpEmail({ otp: '482913', type: 'sign-in' })
    expect(html).toContain('mailto:help@revelio.cards')
    expect(html).toContain('help@revelio.cards')
  })

  it('omits the contact line entirely when CONTACT_EMAIL is unset', async () => {
    vi.stubEnv('CONTACT_EMAIL', '')
    const { html } = await renderOtpEmail({ otp: '482913', type: 'sign-in' })
    // No dangling "Questions?" label and no empty mailto link.
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('Questions?')
  })

  it('provides a non-empty, tag-free plain-text alternative', async () => {
    const { text } = await renderOtpEmail({ otp: '482913', type: 'sign-in' })
    expect(text.length).toBeGreaterThan(20)
    expect(text).not.toContain('<')
  })
})

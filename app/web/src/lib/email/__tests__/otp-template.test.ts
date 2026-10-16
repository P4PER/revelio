import { describe, it, expect } from 'vitest'
import { renderOtpEmail } from '../otp-template'

// The colour a mail client paints the <hr>'s top border in: declarations
// apply in order, so a later `border-top` shorthand overrides an earlier
// `border-color`.
function hrTopBorderColor(html: string): string | undefined {
  const style = /<hr[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
  let color: string | undefined
  for (const decl of style.split(';')) {
    const [prop, value = ''] = decl.split(':').map((x) => x.trim())
    if (prop === 'border-color' || prop === 'border-top-color') color = value.split(/\s+/)[0]
    if (prop === 'border-top' || prop === 'border') color = /#[0-9a-f]{3,8}\b/i.exec(value)?.[0] ?? color
  }
  return color
}

describe('renderOtpEmail', () => {
  it('puts the code in subject, html, and text', async () => {
    const { subject, html, text } = await renderOtpEmail({ otp: '482913', type: 'sign-in', contactEmail: '' })
    expect(subject).toContain('482913')
    expect(html).toContain('482913')
    expect(text).toContain('482913')
  })

  it('states the 10-minute expiry and a reassurance line', async () => {
    const { html, text } = await renderOtpEmail({ otp: '000000', type: 'sign-in', contactEmail: '' })
    expect(html).toContain('10 minutes')
    expect(html.toLowerCase()).toContain('ignore')
    expect(text).toContain('10 minutes')
  })

  it('includes the unofficial fan-project disclaimer', async () => {
    const { html } = await renderOtpEmail({ otp: '000000', type: 'sign-in', contactEmail: '' })
    expect(html).toContain('unofficial')
  })

  it('varies the heading by type', async () => {
    const signIn = (await renderOtpEmail({ otp: '1', type: 'sign-in', contactEmail: '' })).html
    const verify = (await renderOtpEmail({ otp: '1', type: 'email-verification', contactEmail: '' })).html
    expect(signIn).not.toEqual(verify)
    expect(verify.toLowerCase()).toContain('verify')
  })

  it('pulls copy from the en i18n catalog (change-email variant)', async () => {
    const { subject, html } = await renderOtpEmail({ otp: '482913', type: 'change-email', contactEmail: '' })
    expect(subject).toBe('482913 is your Revelio email change code')
    expect(html).toContain('Confirm your new email')
  })

  it('shows the contact mailto link in the footer when a contactEmail is passed', async () => {
    const { html } = await renderOtpEmail({ otp: '123456', type: 'sign-in', contactEmail: 'help@revelio.cards' })
    expect(html).toContain('mailto:help@revelio.cards')
  })

  it('omits the contact line entirely when contactEmail is empty', async () => {
    const { html } = await renderOtpEmail({ otp: '123456', type: 'sign-in', contactEmail: '' })
    expect(html).not.toContain('mailto:')
  })

  it('draws the divider in the brand rule colour', async () => {
    const { html } = await renderOtpEmail({ otp: '000000', type: 'sign-in', contactEmail: '' })
    expect(hrTopBorderColor(html)).toBe('#d9d5e8')
  })

  it('provides a non-empty, tag-free plain-text alternative', async () => {
    const { text } = await renderOtpEmail({ otp: '482913', type: 'sign-in', contactEmail: '' })
    expect(text.length).toBeGreaterThan(20)
    expect(text).not.toContain('<')
  })
})

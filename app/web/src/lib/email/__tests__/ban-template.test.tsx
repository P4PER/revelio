import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderBanEmail } from '../ban-template'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://revelio.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderBanEmail', () => {
  // The user table stores no language yet, so the notice goes out in English
  // unless the caller names a locale.
  it('renders in English when no locale is given', async () => {
    const { subject, text } = await renderBanEmail({ reason: 'Spam decks', expiresAt: null })
    expect(subject).toBe('Your Revelio account has been suspended')
    expect(text).not.toContain('Ihr Konto')
  })

  // Art. 17(3) DSA: the measure and its duration, the facts relied on, the
  // ground, that no automated means were used, and the redress available.
  it('states every element Art. 17(3) DSA requires', async () => {
    const { html, text } = await renderBanEmail({
      reason: 'Offensive username after a warning',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    })
    for (const body of [html, text]) {
      expect(body).toContain('January 1, 2030')
      expect(body).toContain('Offensive username after a warning')
      expect(body).toContain('https://revelio.test/terms')
      expect(body).toContain('https://revelio.test/contact')
      expect(body).toContain('no automated means')
      expect(body).toContain('legal action')
    }
  })

  it('renders in the requested locale with its own links', async () => {
    const { subject, text } = await renderBanEmail({
      reason: 'Spam',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      locale: 'de',
    })
    expect(subject).toBe('Ihr Revelio-Konto wurde gesperrt')
    expect(text).toContain('1. Januar 2030')
    expect(text).toContain('https://revelio.test/de/terms')
    expect(text).toContain('https://revelio.test/de/contact')
    expect(text).toContain('automatisierte Mittel wurden nicht eingesetzt')
    expect(text).not.toContain('Your account')
  })

  it('links the terms and the contact form', async () => {
    const { html } = await renderBanEmail({ reason: 'Spam', expiresAt: null })
    expect(html).toMatch(/<a[^>]*href="https:\/\/revelio\.test\/terms"[^>]*>Terms of Service<\/a>/)
    expect(html).toMatch(/<a[^>]*href="https:\/\/revelio\.test\/contact"[^>]*>contact form<\/a>/)
  })

  it('says a ban without an expiry is permanent', async () => {
    const { text } = await renderBanEmail({ reason: 'Spam', expiresAt: null })
    expect(text).toContain('permanently')
    expect(text).not.toContain('until')
  })

  it('escapes the reason instead of rendering it as markup', async () => {
    const { html } = await renderBanEmail({ reason: '<b>bold</b>', expiresAt: null })
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})

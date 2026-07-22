import { describe, it, expect } from 'vitest'
import { renderContactEmail } from '../contact-template'

describe('renderContactEmail', () => {
  it('builds a subject, html, and text carrying the sender details', async () => {
    const out = await renderContactEmail({
      name: 'Hermione',
      email: 'hermione@example.com',
      subject: 'Card data typo',
      message: 'The Lumos card has the wrong lesson cost.',
    })

    expect(out.subject).toBe('Contact form: Card data typo')
    // Sender identity + message survive into both renderings so the operator can reply.
    expect(out.html).toContain('Hermione')
    expect(out.html).toContain('hermione@example.com')
    expect(out.html).toContain('The Lumos card has the wrong lesson cost.')
    expect(out.text).toContain('hermione@example.com')
    expect(out.text).toContain('The Lumos card has the wrong lesson cost.')
  })
})

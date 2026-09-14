import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import { DiscordCta } from '@/components/discord/discord-cta'

const INVITE = 'https://discord.com/oauth2/authorize?client_id=1'

function renderCta(inviteUrl: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DiscordCta inviteUrl={inviteUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DiscordCta', () => {
  it('links to the invite url when one is set', () => {
    renderCta(INVITE)
    expect(screen.getByRole('link', { name: /Add to Discord/i })).toHaveAttribute('href', INVITE)
  })

  it('opens the invite in a new tab without leaking the opener', () => {
    renderCta(INVITE)
    const link = screen.getByRole('link', { name: /Add to Discord/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  // An admin-editable setting is legitimately unset on a fresh database, and a
  // button that cannot install anything is worse than no button at all.
  it('renders nothing when the invite url is null', () => {
    const { container } = renderCta(null)
    expect(container).toBeEmptyDOMElement()
  })
})

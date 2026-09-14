import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { TrustRow } from '@/components/discord/trust-row'

function renderRow(locale: 'en' | 'de', messages: typeof en | typeof de) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TrustRow />
    </NextIntlClientProvider>,
  )
}

describe('TrustRow', () => {
  it('states all three reassurances', () => {
    renderRow('en', en)
    expect(screen.getByText('Works in any server')).toBeInTheDocument()
    expect(screen.getByText('Cannot read your messages')).toBeInTheDocument()
    expect(screen.getByText('Personal answers stay private')).toBeInTheDocument()
  })

  it('states them in German too', () => {
    renderRow('de', de)
    expect(screen.getByText('Auf jedem Server nutzbar')).toBeInTheDocument()
    expect(screen.getByText('Liest deine Nachrichten nicht')).toBeInTheDocument()
  })

  // The "cannot read your messages" claim is only true while the bot asks for
  // GatewayIntentBits.Guilds alone (bot/src/main.ts). This fails loudly if the
  // claim is ever dropped, which is the cue to check the intents still match.
  it('keeps the no-message-access claim in both catalogs', () => {
    for (const messages of [en, de]) {
      expect(messages.discord.trust.noMessages).toBeTruthy()
    }
  })
})

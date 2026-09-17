import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { CommandChannel } from '@/components/discord/command-channel'

function renderChannel(locale: 'en' | 'de', messages: typeof en | typeof de) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CommandChannel />
    </NextIntlClientProvider>,
  )
}

describe('CommandChannel', () => {
  it('shows the sample card embed as card-embed.ts builds it', () => {
    renderChannel('en', en)
    expect(screen.getByText('Alohomora')).toBeInTheDocument()
    expect(screen.getByText(/Search your deck/)).toBeInTheDocument()
    expect(screen.getByText('Adventures at Hogwarts - #32')).toBeInTheDocument()
  })

  // card-embed.ts uses setImage, which Discord draws full width under the
  // fields and above the footer, not as a thumbnail beside the text.
  it('places the card art under the fields and above the footer', () => {
    renderChannel('en', en)
    const art = screen.getByAltText('Alohomora card')
    const field = screen.getByText(en.discord.sample.fieldCost)
    const footer = screen.getByText('Adventures at Hogwarts - #32')
    expect(field.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(art.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the sample search embed with its card lines', () => {
    renderChannel('en', en)
    expect(screen.getByText('42 cards')).toBeInTheDocument()
    expect(screen.getByText(/Obliviate/)).toBeInTheDocument()
  })

  // Card names are data, not copy: they are identical in both catalogs, so only
  // the chrome around them changes language.
  it('translates the chrome but keeps the card names', () => {
    renderChannel('de', de)
    expect(screen.getByText('42 Karten')).toBeInTheDocument()
    expect(screen.getByText(/Obliviate/)).toBeInTheDocument()
    expect(screen.queryByText('42 cards')).not.toBeInTheDocument()
  })

  it('gives the card art a localized alt text', () => {
    renderChannel('en', en)
    expect(screen.getByAltText('Alohomora card')).toBeInTheDocument()
  })

  it('localizes the card art alt text in German', () => {
    renderChannel('de', de)
    expect(screen.getByAltText('Karte Alohomora')).toBeInTheDocument()
  })
})

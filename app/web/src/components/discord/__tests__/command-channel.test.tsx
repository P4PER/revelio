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

// The card header's labels are bold runs inside one line, so a line is matched
// by its whole text rather than by a single text node.
function line(text: string) {
  return screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)
}

describe('CommandChannel', () => {
  it('draws the bot avatar with the dark-background icon on its midnight circle', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommandChannel />
      </NextIntlClientProvider>,
    )
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.includes('revelio-icon-on-dark.svg'))).toBe(true)
    expect(srcs.some((s) => s.includes('revelio-icon-on-light.svg'))).toBe(false)
  })

  it('shows the /card reply as card-view.ts builds it', () => {
    renderChannel('en', en)
    expect(screen.getByRole('heading', { name: 'Alohomora' })).toBeInTheDocument()
    expect(line('Type Spell · Lesson Charms')).toBeInTheDocument()
    expect(line('Cost 4 · Rarity Uncommon · Legality Legal')).toBeInTheDocument()
    expect(screen.getByText('Adventures at Hogwarts · #32')).toBeInTheDocument()
  })

  // Both real messages end in a link button; the page leaves them off, since
  // the visitor is already on revelio.cards.
  it('leaves the site link buttons off', () => {
    renderChannel('en', en)
    expect(screen.queryByText('Open on revelio.cards')).not.toBeInTheDocument()
    expect(screen.queryByText('Full search on revelio.cards')).not.toBeInTheDocument()
  })

  // card-view.ts: heading and the labelled lines, then the image, then the
  // rules text, then the footer line and the link button.
  it('orders the card as the bot does: image under the stats, above the text', () => {
    renderChannel('en', en)
    const stats = line('Cost 4 · Rarity Uncommon · Legality Legal')
    const art = screen.getByAltText('Alohomora card')
    const body = screen.getByText(/Search your deck/)
    const footer = screen.getByText('Adventures at Hogwarts · #32')
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(stats, art)).toBe(true)
    expect(follows(art, body)).toBe(true)
    expect(follows(body, footer)).toBe(true)
  })

  // card-view.ts follows the rules text with the flavour text in italics.
  it('shows the flavour text in italics between the rules text and the footer', () => {
    renderChannel('en', en)
    const flavor = screen.getByText(/whispered, 'Alohomora!'/)
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(flavor.tagName).toBe('EM')
    expect(follows(screen.getByText(/Search your deck/), flavor)).toBe(true)
    expect(follows(flavor, screen.getByText('Adventures at Hogwarts · #32'))).toBe(true)
  })

  // A shared list is a plain channel message: no "used /search" line above it.
  it('shows a shared result list with thumbnails and no command line', () => {
    renderChannel('en', en)
    expect(screen.getByText(/shared 3 cards from a search for "charm"/)).toBeInTheDocument()
    expect(screen.getByAltText('Obliviate card')).toBeInTheDocument()
    expect(screen.getByText('View a card...')).toBeInTheDocument()
    expect(screen.queryByText('/search')).not.toBeInTheDocument()
  })

  it('translates the chrome but keeps the card names', () => {
    renderChannel('de', de)
    expect(screen.getByText(/hat 3 Karten aus einer Suche nach „charm“ geteilt/)).toBeInTheDocument()
    expect(line('Kosten 4 · Seltenheit Ungewöhnlich · Legalität Legal')).toBeInTheDocument()
    expect(screen.getByText('Obliviate')).toBeInTheDocument()
    expect(screen.queryByText('View a card...')).not.toBeInTheDocument()
  })

  it('localizes the card art alt text in German', () => {
    renderChannel('de', de)
    expect(screen.getByAltText('Karte Alohomora')).toBeInTheDocument()
  })
})

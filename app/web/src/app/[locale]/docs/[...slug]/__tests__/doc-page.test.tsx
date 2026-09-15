import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { DocArticle } from '../page'

function Body() {
  return <h2 id="what-you-need">What you need</h2>
}

function renderArticle(
  locale: 'en' | 'de' = 'en',
  messages: typeof en | typeof de = en,
  editUrl: string | null = null,
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocArticle
        slug="discord/commands"
        Body={Body}
        toc={[{ depth: 2, id: 'what-you-need', text: 'What you need' }]}
        editUrl={editUrl}
      />
    </NextIntlClientProvider>,
  )
}

describe('a docs content page', () => {
  // Titles come from the catalog, not the content file: the left rail needs
  // every title to draw itself, and loading five MDX modules to read them
  // would be absurd.
  it('titles the page from the message catalog', () => {
    renderArticle()
    expect(screen.getByRole('heading', { level: 1, name: 'Commands' })).toBeInTheDocument()
  })

  it('names the section above the title', () => {
    renderArticle()
    expect(screen.getByText('Discord bot')).toBeInTheDocument()
  })

  it('renders the MDX body below the title', () => {
    renderArticle()
    expect(screen.getByRole('heading', { level: 2, name: 'What you need' })).toBeInTheDocument()
  })

  it('lists the page headings in the contents rail', () => {
    renderArticle()
    const rail = screen.getByRole('navigation', { name: 'On this page' })
    expect(rail).toBeInTheDocument()
  })

  it('renders the German title and section name', () => {
    renderArticle('de', de)
    expect(screen.getByRole('heading', { level: 1, name: 'Befehle' })).toBeInTheDocument()
    expect(screen.getByText('Discord-Bot')).toBeInTheDocument()
  })
})

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => '/docs/discord/commands',
}))

import { DocArticle, editUrlFor } from '../page'

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

  // Below 860px the rail is behind the drawer, so the bar's trigger is the only
  // thing left saying which page this is.
  it('names the page on the mobile bar', () => {
    renderArticle()
    expect(screen.getByRole('button', { name: en.docs.openNav })).toHaveTextContent('Commands')
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

  // The [locale] layout wraps children in a plain div, so a page without its
  // own main leaves a screen reader no landmark to jump the rails with.
  it('wraps the reading column in a main landmark', () => {
    renderArticle()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

describe('the edit link', () => {
  // githubUrl is the repository root, so "Edit this page" has to name the file
  // or it drops the reader on the README.
  it('points at the source file for the page and locale', () => {
    expect(editUrlFor('https://github.com/P4PER/revelio', 'discord/commands', 'de')).toBe(
      'https://github.com/P4PER/revelio/edit/main/app/web/content/docs/discord-commands.de.mdx',
    )
  })

  it('tolerates a trailing slash on the configured repository', () => {
    expect(editUrlFor('https://github.com/P4PER/revelio/', 'discord', 'en')).toBe(
      'https://github.com/P4PER/revelio/edit/main/app/web/content/docs/discord.en.mdx',
    )
  })

  it('offers no link when no repository is configured', () => {
    expect(editUrlFor(null, 'discord', 'en')).toBeNull()
  })
})

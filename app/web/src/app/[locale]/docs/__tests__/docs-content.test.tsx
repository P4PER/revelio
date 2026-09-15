import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import Overview, { toc } from '@/../content/docs/discord.en.mdx'
import OverviewDe from '@/../content/docs/discord.de.mdx'
import { useMDXComponents } from '@/mdx-components'

// Not a hook despite the name - it is the export name Next's MDX convention
// requires, and it is a plain factory that reads no React state.
// eslint-disable-next-line react-hooks/rules-of-hooks -- factory, not a hook
const mdxComponents = useMDXComponents({})

describe('the Discord overview content file', () => {
  it('exports a table of contents built from its own headings', () => {
    expect(toc).toEqual([
      { depth: 2, id: 'what-you-need', text: 'What you need' },
      { depth: 2, id: 'adding-it-to-a-server', text: 'Adding it to a server' },
      { depth: 2, id: 'where-to-go-next', text: 'Where to go next' },
    ])
  })

  it('renders its headings with the ids the contents list points at', () => {
    const { container } = render(<Overview />)
    for (const entry of toc) {
      expect(container.querySelector(`#${entry.id}`)).not.toBeNull()
    }
  })

  // Discord sends the same option keys in every language, so a German reader
  // must be shown the same thing to type.
  it('keeps command names untranslated in the German file', () => {
    render(<OverviewDe />)
    expect(screen.getByText('/collection')).toBeInTheDocument()
    expect(screen.getByText('/mydecks')).toBeInTheDocument()
  })
})

// The component map and the content files are each covered alone. This renders
// one through the other, which is the only place their contract is real: MDX
// resolves its elements through the map that Next supplies at build time.
describe('a content file rendered through the component map', () => {
  function renderThroughMap(locale: string) {
    const Content = locale === 'de' ? OverviewDe : Overview
    return render(
      <NextIntlClientProvider locale={locale} messages={{}}>
        <Content components={mdxComponents} />
      </NextIntlClientProvider>,
    )
  }

  // Routing is localePrefix 'as-needed', so an unlocalized href would drop a
  // German reader onto the English page and reset their locale cookie.
  it('localizes an internal link written as a plain markdown link', () => {
    const { container } = renderThroughMap('de')
    const discord = [...container.querySelectorAll('a')].find(
      (a) => a.getAttribute('href')?.endsWith('/discord'),
    )
    expect(discord?.getAttribute('href')).toBe('/de/discord')
  })

  it('leaves the English reader an unprefixed link', () => {
    const { container } = renderThroughMap('en')
    const discord = [...container.querySelectorAll('a')].find(
      (a) => a.getAttribute('href')?.endsWith('/discord'),
    )
    expect(discord?.getAttribute('href')).toBe('/discord')
  })

  it('styles body copy through the map rather than emitting a bare paragraph', () => {
    const { container } = renderThroughMap('en')
    expect(container.querySelector('p')?.className).toContain('text-muted-foreground')
  })
})

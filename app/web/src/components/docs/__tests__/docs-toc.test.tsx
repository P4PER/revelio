import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import { DocsToc } from '@/components/docs/docs-toc'
import type { TocEntry } from '@/lib/docs/types'

const TOC: TocEntry[] = [
  { depth: 2, id: 'card-lookup', text: 'Card lookup' },
  { depth: 3, id: 'options', text: 'Options' },
  { depth: 2, id: 'search', text: 'Search' },
]

function renderToc(toc: TocEntry[] = TOC, editUrl: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DocsToc toc={toc} editUrl={editUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DocsToc', () => {
  it('links every heading by its anchor', () => {
    renderToc()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getByRole('link', { name: 'Card lookup' })).toHaveAttribute('href', '#card-lookup')
    expect(within(nav).getByRole('link', { name: 'Options' })).toHaveAttribute('href', '#options')
    expect(within(nav).getByRole('link', { name: 'Search' })).toHaveAttribute('href', '#search')
  })

  it('indents a subheading under its parent', () => {
    renderToc()
    expect(screen.getByRole('link', { name: 'Options' }).className).toContain('pl-')
  })

  // A page with no h2 would otherwise render an empty labelled rail, which a
  // screen reader announces as a navigation landmark containing nothing.
  it('renders nothing at all for a page with no headings', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DocsToc toc={[]} editUrl={null} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the edit link only when a repository is configured', () => {
    renderToc(TOC, 'https://github.com/P4PER/revelio')
    expect(screen.getByRole('link', { name: /Edit this page/ })).toHaveAttribute(
      'href',
      'https://github.com/P4PER/revelio',
    )
  })

  it('omits the edit link when no repository is configured', () => {
    renderToc()
    expect(screen.queryByRole('link', { name: /Edit this page/ })).toBeNull()
  })
})

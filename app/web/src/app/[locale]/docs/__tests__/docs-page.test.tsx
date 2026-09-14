import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Overview, { toc } from '@/../content/docs/discord.en.mdx'
import OverviewDe from '@/../content/docs/discord.de.mdx'

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

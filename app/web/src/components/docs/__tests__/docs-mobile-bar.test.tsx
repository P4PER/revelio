import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import type { TocEntry } from '@/lib/docs/types'

// preventDefault, or jsdom logs "Not implemented: navigation" the moment a
// drawer link is clicked - the click still bubbles, which is what closes it.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} onClick={(event) => event.preventDefault()} {...rest}>{children}</a>
  ),
  usePathname: () => '/docs/discord/commands',
}))

import { DocsMobileBar } from '@/components/docs/docs-mobile-bar'

const TOC: TocEntry[] = [
  { depth: 2, id: 'card-lookup', text: 'Card lookup' },
  { depth: 2, id: 'search', text: 'Search' },
]

function renderBar(toc: readonly TocEntry[] = TOC, editUrl: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DocsMobileBar title="Commands" toc={toc} editUrl={editUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DocsMobileBar', () => {
  // The bar doubles as a breadcrumb: below 860px the rail is behind the drawer,
  // so the trigger is the only thing telling a reader where they are.
  it('names the page being read on the menu trigger', () => {
    renderBar()
    expect(screen.getByRole('button', { name: en.docs.openNav })).toHaveTextContent('Commands')
  })

  it('lists every page in the drawer', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: en.docs.openNav }))
    const drawer = within(screen.getByRole('dialog'))
    for (const name of ['Overview', 'Commands', 'Account linking', 'Troubleshooting']) {
      expect(drawer.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('closes the drawer when a page is picked', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: en.docs.openNav }))
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Overview' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the page headings behind the contents trigger', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: en.docs.onThisPage }))
    expect(screen.getByRole('link', { name: 'Card lookup' })).toHaveAttribute('href', '#card-lookup')
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '#search')
  })

  it('closes the contents list when a heading is picked', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: en.docs.onThisPage }))
    await user.click(screen.getByRole('link', { name: 'Card lookup' }))
    expect(screen.queryByRole('link', { name: 'Card lookup' })).toBeNull()
  })

  // The hub has no headings of its own; a control that opens an empty list is
  // worse than no control.
  it('offers no contents trigger for a page with no headings', () => {
    renderBar([])
    expect(screen.queryByRole('button', { name: en.docs.onThisPage })).toBeNull()
  })

  it('carries the edit link into the contents list', async () => {
    const user = userEvent.setup()
    renderBar(TOC, 'https://github.com/P4PER/revelio')
    await user.click(screen.getByRole('button', { name: en.docs.onThisPage }))
    expect(screen.getByRole('link', { name: /Edit this page/ })).toHaveAttribute(
      'href',
      'https://github.com/P4PER/revelio',
    )
  })
})

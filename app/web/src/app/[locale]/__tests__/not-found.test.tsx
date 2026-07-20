import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
}))

type Dict = { [key: string]: string | Dict }

vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => {
    const en = (await import('@/../messages/en.json')).default as unknown as Dict
    const dict = ns.split('.').reduce<Dict>((o, k) => o[k] as Dict, en)
    return (key: string) =>
      key.split('.').reduce<string | Dict>((o, k) => (o as Dict)[k], dict) as string
  },
}))

import { NotFound } from '../not-found'

describe('not-found page', () => {
  it('renders the 404 heading and both CTAs with correct hrefs', async () => {
    render(await NotFound())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "This card isn't in the archive",
    )
    expect(screen.getByRole('link', { name: /search cards/i })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })
})

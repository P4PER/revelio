import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
}))

import { RuntimeError } from '../error'
import en from '@/../messages/en.json'

function renderError(reset = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RuntimeError error={Object.assign(new Error('boom'), { digest: '8f3a1c' })} reset={reset} />
    </NextIntlClientProvider>,
  )
  return reset
}

describe('runtime error page', () => {
  it('renders the runtime heading and the digest', () => {
    renderError()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The spell fizzled')
    expect(screen.getByText('reference: 8f3a1c')).toBeInTheDocument()
  })

  it('calls reset when "Try again" is clicked', async () => {
    const reset = renderError()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledOnce()
  })
})

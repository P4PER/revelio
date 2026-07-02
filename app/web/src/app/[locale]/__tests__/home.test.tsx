import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

// HomeSearch (mounted by Home) calls useRouter — stub it out so the test
// doesn't need a full Next.js app-router environment.
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { Home } from '../page'
import de from '@/../messages/de.json'

describe('home page', () => {
  it('renders the German tagline under the de locale', () => {
    render(
      <NextIntlClientProvider locale="de" messages={de}>
        <Home />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Enthülle jede Harry-Potter-TCG-Karte.')).toBeInTheDocument()
  })
})

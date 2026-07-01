import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import Home from '../page'
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

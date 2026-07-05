import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import { SiteFooter } from '../site-footer'
import en from '@/../messages/en.json'

describe('SiteFooter', () => {
  it('shows the unofficial fan project disclaimer', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SiteFooter />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(/non-commercial fan project/i)).toBeInTheDocument()
    expect(screen.getByText(/Warner Bros\./)).toBeInTheDocument()
  })
})

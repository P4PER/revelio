import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { LegalitySeal } from '../legality-seal'

function renderSeal(props: React.ComponentProps<typeof LegalitySeal>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LegalitySeal {...props} />
    </NextIntlClientProvider>,
  )
}

describe('LegalitySeal', () => {
  it('renders the main count and status text when legal', () => {
    renderSeal({ status: 'legal', mainCount: 60, violations: [] })
    expect(screen.getByText('60 / 60')).toBeInTheDocument()
    expect(screen.getByText('Tournament legal')).toBeInTheDocument()
  })

  it('renders the main count and status text when incomplete', () => {
    renderSeal({ status: 'incomplete', mainCount: 47, violations: [{ code: 'main_deck_size', actual: 47 }] })
    expect(screen.getByText('47 / 60')).toBeInTheDocument()
    expect(screen.getByText('Incomplete · needs 13 more cards')).toBeInTheDocument()
  })

  it('renders the main count and status text when illegal', () => {
    renderSeal({
      status: 'illegal',
      mainCount: 62,
      violations: [{ code: 'main_deck_size', actual: 62 }, { code: 'too_many_copies', cardId: 'accio', count: 5 }],
    })
    expect(screen.getByText('62 / 60')).toBeInTheDocument()
    expect(screen.getByText('Illegal')).toBeInTheDocument()
  })
})

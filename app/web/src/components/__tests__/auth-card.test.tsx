import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'

// Stub AuthForm so the card renders in isolation (no auth-client mocking needed).
vi.mock('@/components/auth-form', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div data-testid="auth-form">{mode}</div>,
}))

import { AuthCard } from '../auth-card'

function renderCard(mode: 'login' | 'register') {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AuthCard mode={mode} />
    </NextIntlClientProvider>,
  )
}

describe('AuthCard', () => {
  it('renders the brand tagline and the form for the given mode', () => {
    renderCard('login')
    expect(screen.getByText(en.auth.panelTagline)).toBeInTheDocument()
    expect(screen.getByTestId('auth-form')).toHaveTextContent('login')
  })
})

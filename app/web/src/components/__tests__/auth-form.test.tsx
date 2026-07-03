import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
    updateUser: vi.fn(),
  },
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { AuthForm } from '../auth-form'
import en from '@/../messages/en.json'

function renderForm(mode: 'login' | 'register') {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AuthForm mode={mode} />
    </NextIntlClientProvider>,
  )
}

describe('AuthForm', () => {
  it('register mode shows a username field and links to sign in', () => {
    renderForm('register')
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
  it('login mode has no username field and links to register', () => {
    renderForm('login')
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendVerificationOtp = vi.fn(async () => ({ error: null }))
const signInEmailOtp = vi.fn(async () => ({ error: null }))
const updateUser = vi.fn(async () => ({ error: null }))
const emailHasAccount = vi.fn(async () => true)
const usernameAvailable = vi.fn(async () => true)

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (...a: unknown[]) => sendVerificationOtp(...a) },
    signIn: { emailOtp: (...a: unknown[]) => signInEmailOtp(...a) },
    updateUser: (...a: unknown[]) => updateUser(...a),
  },
}))
vi.mock('@/lib/auth-actions', () => ({
  emailHasAccount: (...a: unknown[]) => emailHasAccount(...a),
  usernameAvailable: (...a: unknown[]) => usernameAvailable(...a),
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

beforeEach(() => {
  sendVerificationOtp.mockClear()
  signInEmailOtp.mockClear()
  updateUser.mockClear()
  emailHasAccount.mockClear()
  usernameAvailable.mockClear()
})

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

  it('shows a required error under email when submitting empty (login)', async () => {
    renderForm('login')
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('login rejects an unknown email without sending an OTP', async () => {
    emailHasAccount.mockResolvedValueOnce(false)
    renderForm('login')
    await userEvent.type(screen.getByPlaceholderText('Email'), 'ghost@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText(en.validation.noAccount)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('register rejects a taken username without sending an OTP', async () => {
    usernameAvailable.mockResolvedValueOnce(false)
    renderForm('register')
    await userEvent.type(screen.getByPlaceholderText('Email'), 'new@example.com')
    await userEvent.type(screen.getByPlaceholderText('Username'), 'hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText(en.validation.usernameTaken)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('register sets the username AND displayUsername (original casing) after verifying', async () => {
    renderForm('register')
    await userEvent.type(screen.getByPlaceholderText('Email'), 'new@example.com')
    await userEvent.type(screen.getByPlaceholderText('Username'), 'Hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await userEvent.type(await screen.findByPlaceholderText('000000'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(updateUser).toHaveBeenCalledWith({ username: 'Hermione', displayUsername: 'Hermione' })
  })
})

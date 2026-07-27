import { render, screen, fireEvent } from '@testing-library/react'
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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('login mode has no username field and links to register', () => {
    renderForm('login')
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument()
  })

  it('shows a required error under email when submitting empty (login)', async () => {
    renderForm('login')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('login rejects an unknown email without sending an OTP', async () => {
    emailHasAccount.mockResolvedValueOnce(false)
    renderForm('login')
    await userEvent.type(screen.getByLabelText('Email'), 'ghost@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText(en.validation.noAccount)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('register rejects a taken username without sending an OTP', async () => {
    usernameAvailable.mockResolvedValueOnce(false)
    renderForm('register')
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText(en.validation.usernameTaken)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('register sets the username AND displayUsername (original casing) after verifying', async () => {
    renderForm('register')
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'Hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    // input-otp fires onChange from the underlying input's change event; in jsdom
    // userEvent.type does not reliably propagate, so set the value directly.
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(updateUser).toHaveBeenCalledWith({ username: 'Hermione', displayUsername: 'Hermione' })
  })

  it('login submit button reads "Login"; register reads "Register"', () => {
    const { unmount } = renderForm('login')
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    unmount()
    renderForm('register')
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  })

  it('renders six OTP slots on the code step', async () => {
    const { container } = renderForm('login')
    await userEvent.type(screen.getByLabelText('Email'), 'known@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    await screen.findByLabelText('Verification code')
    expect(container.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
  })
})

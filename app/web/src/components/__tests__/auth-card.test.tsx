import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Stub AuthForm so the card renders in isolation (no auth-client mocking needed).
vi.mock('@/components/auth-form', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div data-testid="auth-form">{mode}</div>,
}))

import { AuthCard } from '../auth-card'

function renderCard(mode: 'login' | 'register') {
  return render(<AuthCard mode={mode} />)
}

describe('AuthCard', () => {
  it('renders the form for the given mode', () => {
    renderCard('login')
    expect(screen.getByTestId('auth-form')).toHaveTextContent('login')
  })
})

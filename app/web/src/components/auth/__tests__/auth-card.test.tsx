import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Stub AuthForm so the card renders in isolation (no auth-client mocking needed).
vi.mock('@/components/auth/auth-form', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div data-testid="auth-form">{mode}</div>,
}))

import { AuthCard } from '@/components/auth/auth-card'

vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) => <img alt={p.alt as string} src={p.src as string} />,
}))

describe('AuthCard', () => {
  it('renders the form for the given mode', () => {
    render(<AuthCard mode="login" />)
    expect(screen.getByTestId('auth-form')).toHaveTextContent('login')
  })

  it('draws the fan above the form', () => {
    const { container } = render(<AuthCard mode="register" />)
    const fan = container.querySelector('[data-slot="auth-card-fan"]')
    expect(fan).not.toBeNull()
    expect(fan!.compareDocumentPosition(screen.getByTestId('auth-form')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

'use client'
import { AuthForm } from './auth-form'

// Centered single-column auth layout for /login and /register. No card chrome,
// brand panel, or logo — just the form, framed by the global SiteHeader/
// SiteFooter.
export function AuthCard({ mode }: { mode: 'login' | 'register' }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-6 py-12 md:py-20">
      <AuthForm mode={mode} />
    </main>
  )
}

'use client'
import Image from 'next/image'
import { AuthForm } from './auth-form'

// Centered single-column auth layout for /login and /register. No card chrome
// and no brand panel — just the mark above the form, framed by the global
// SiteHeader/SiteFooter.
export function AuthCard({ mode }: { mode: 'login' | 'register' }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-6 py-12 md:py-20">
      <Image
        src="/revelio-icon.svg"
        alt=""
        width={96}
        height={96}
        priority
        className="mx-auto mb-6 h-16 w-auto"
      />
      <AuthForm mode={mode} />
    </main>
  )
}

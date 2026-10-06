'use client'
import { AuthCardFan } from '@/components/auth/auth-card-fan'
import { AuthForm } from '@/components/auth/auth-form'

// Centred single-column auth layout for /login and /register, framed by the
// global SiteHeader/SiteFooter: a decorative fan of cards, then the form. From
// `sm` up the form sits in a card that overlaps the fan's lower half; below it
// the form is boxless and the fan is drawn whole (AuthForm owns that chrome).
export function AuthCard({
  mode,
  redirectTo,
  fanImages = [],
}: {
  mode: 'login' | 'register'
  redirectTo?: string | null
  fanImages?: string[]
}) {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col px-4 py-6 sm:px-0 md:py-12">
      <AuthCardFan images={fanImages} />
      <AuthForm mode={mode} redirectTo={redirectTo} />
    </main>
  )
}

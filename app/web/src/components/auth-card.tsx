'use client'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AuthForm } from './auth-form'

// Bounded split card for /login and /register. Sits inside the normal page
// (the global SiteHeader/SiteFooter stay). Left: a branded Reveal-Glow panel
// (hidden below md). Right: the form. login/register pages render this.
export function AuthCard({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth')
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 md:py-20">
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <aside
          className="relative hidden flex-col items-center justify-center gap-5 p-8 text-center md:flex"
          style={{
            background:
              'radial-gradient(360px 360px at 50% 45%, rgba(232,178,58,0.20), transparent 62%),' +
              'linear-gradient(150deg, #2A2570, #161436 70%)',
          }}
        >
          <Image
            src="/revelio-icon.svg"
            alt=""
            width={120}
            height={120}
            priority
            className="h-24 w-auto drop-shadow-[0_0_30px_rgba(232,178,58,0.5)]"
          />
          <p className="text-lg leading-snug font-semibold tracking-tight text-balance text-foreground">
            {t('panelTagline')}
          </p>
        </aside>
        <div className="p-8 sm:p-10">
          <AuthForm mode={mode} />
        </div>
      </div>
    </main>
  )
}

'use client'
import { useState } from 'react'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// Shared passwordless (email OTP) form. `register` collects a username and sets
// it after verification; `login` is email-only. Both cross-link to the other.
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const register = mode === 'register'
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    setBusy(false)
    if (error) return setError(t('sendFailed'))
    setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await authClient.signIn.emailOtp({ email, otp: code })
    if (error) {
      setBusy(false)
      return setError(t('badCode'))
    }
    if (register && name) await authClient.updateUser({ username: name }).catch(() => {})
    router.push('/')
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold text-primary">
        {register ? t('registerTitle') : t('title')}
      </h1>
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-3">
          <Input
            type="email"
            required
            placeholder={t('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {register && (
            <Input
              type="text"
              required
              placeholder={t('username')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {t('sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
          <Input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" disabled={busy} className="w-full">
            {t('verify')}
          </Button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {register ? (
          <>
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-foreground underline">
              {t('signIn')}
            </Link>
          </>
        ) : (
          <>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-foreground underline">
              {t('register')}
            </Link>
          </>
        )}
      </p>
    </main>
  )
}

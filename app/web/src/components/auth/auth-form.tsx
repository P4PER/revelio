'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { emailHasAccount, usernameAvailable } from '@/lib/actions/auth-actions'
import { acceptTermsAction } from '@/lib/actions/terms-actions'
import { BRAND_NAME } from '@/lib/brand'
import { loginHref, registerHref } from '@/lib/redirect-path'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { FieldError } from '@/components/ui/field-error'
import { makeEmailStepSchema, makeCodeSchema } from '@/lib/schemas/auth'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

// The card chrome only applies from `sm` up. On a phone a box costs width - a
// second gutter inside the page's - and frames a form that already fills the
// screen, so below `sm` the form sits directly on the page. z-10 keeps it above
// the fan cards that run behind its top edge.
const FORM_CARD =
  'relative z-10 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-[0_-10px_28px_rgb(19_18_42/0.22)]'

// Shared passwordless (email OTP) form. `register` collects a username and sets
// it after verification; `login` is email-only. Both cross-link to the other.
//
// The email step uses react-hook-form with uncontrolled register() (NOT
// <Controller>): the form swaps between the email and code step, and
// Controller-bound inputs stop updating after that unmount/mount under React 19.
// The code step is a controlled segmented OTP (InputOTP), so it is kept OUT of
// react-hook-form entirely — the value lives in local useState and is validated
// with makeCodeSchema on submit.
export function AuthForm({
  mode,
  redirectTo,
}: {
  mode: 'login' | 'register'
  redirectTo?: string | null
}) {
  const t = useTranslations('auth')
  const tv = useTranslations('validation')
  const router = useRouter()
  const register = mode === 'register'
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')

  const emailForm = useForm<{ email: string; name?: string }>({
    resolver: zodResolver(makeEmailStepSchema((k) => tv(k), register)),
    defaultValues: { email: '', name: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function requestCode(values: { email: string; name?: string }) {
    // /login is for existing users only — account creation happens via /register.
    if (!register && !(await emailHasAccount(values.email))) {
      emailForm.setError('email', { message: tv('noAccount') })
      return
    }
    // /register: reject a taken username up front (DB unique is the final guard).
    if (register && !(await usernameAvailable(values.name ?? ''))) {
      emailForm.setError('name', { message: tv('usernameTaken') })
      return
    }
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: values.email, type: 'sign-in' })
    if (error) {
      emailForm.setError('root', { message: t('sendFailed') })
      return
    }
    setEmail(values.email)
    setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setCodeError(null)
    const parsed = makeCodeSchema((k) => tv(k)).safeParse({ code })
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? tv('sixDigits'))
      return
    }
    setVerifying(true)
    const { error } = await authClient.signIn.emailOtp({ email, otp: code })
    if (error) {
      setVerifying(false)
      setCodeError(t('badCode'))
      return
    }
    if (register) {
      const name = emailForm.getValues('name') ?? ''
      const { error: updateError } = await authClient.updateUser({ username: name, displayUsername: name })
      if (updateError) {
        // signIn.emailOtp already created a session; without a username the
        // account is half-provisioned, so roll the session back rather than
        // leave the user authenticated with no username. Re-registering with
        // the same email and an available username recovers the account.
        await authClient.signOut().catch(() => {})
        setVerifying(false)
        setCodeError(t('usernameTaken'))
        return
      }
      // The visitor pressed Register under the terms notice, and the account is
      // now complete. Best-effort: if this write fails the acceptance banner asks
      // again, which beats failing a registration that has already succeeded.
      try {
        await acceptTermsAction()
      } catch {
        // Covered by the banner on the next render.
      }
    }
    // Refresh so server components (e.g. the header) re-render with the new
    // session cookie — without this the header keeps its logged-out state.
    // Back to wherever the visitor was headed before the sign-in wall.
    router.push(redirectTo ?? '/')
    router.refresh()
  }

  return (
    <>
      <div data-slot="auth-form-card" className={FORM_CARD}>
        <div className="mb-6 text-center">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary-ink">
            {t('tagline')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {register ? t('registerTitle') : t('title')}
          </h1>
          {step === 'email' && (
            <p className="mt-2 text-base text-muted-foreground">
              {register
                ? t('registerSubtitle', { brand: BRAND_NAME })
                : t('subtitle', { brand: BRAND_NAME })}
            </p>
          )}
        </div>
        {step === 'email' ? (
          <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                autoFocus
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                size="lg"
                aria-invalid={!!emailForm.formState.errors.email}
                {...emailForm.register('email')}
              />
              <FieldError>{emailForm.formState.errors.email?.message}</FieldError>
            </div>
            {register && (
              <div className="space-y-1.5">
                <Label htmlFor="username">{t('username')}</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder={t('usernamePlaceholder')}
                  size="lg"
                  aria-invalid={!!emailForm.formState.errors.name}
                  {...emailForm.register('name')}
                />
                <FieldError>{emailForm.formState.errors.name?.message}</FieldError>
              </div>
            )}
            <FieldError>{emailForm.formState.errors.root?.message}</FieldError>
            {register && (
              // Incorporates the terms (§ 305(2) BGB): shown before the click that
              // concludes the contract. Links open in a new tab so reading the terms
              // does not throw away what the visitor has typed.
              <p className="text-sm text-muted-foreground">
                {t.rich('termsNotice', {
                  button: t('register'),
                  terms: (chunks) => (
                    <Link href="/terms" target="_blank" className="text-foreground underline">
                      {chunks}
                    </Link>
                  ),
                  rules: (chunks) => (
                    <Link href="/terms#acceptable-use" target="_blank" className="text-foreground underline">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/privacy" target="_blank" className="text-foreground underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
            <Button type="submit" size="lg" disabled={emailForm.formState.isSubmitting} className="w-full font-semibold">
              {register ? t('register') : t('login')}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4" noValidate>
            <p className="text-center text-base text-muted-foreground">{t('codeSent', { email })}</p>
            <div className="space-y-1.5">
              <Label htmlFor="code">{t('code')}</Label>
              <InputOTP
                id="code"
                maxLength={6}
                value={code}
                onChange={(value) => {
                  setCode(value)
                  setCodeError(null)
                }}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoFocus
                autoComplete="one-time-code"
                containerClassName="justify-center"
                aria-invalid={!!codeError}
              >
                <InputOTPGroup data-invalid={!!codeError}>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <FieldError>{codeError}</FieldError>
            </div>
            <Button type="submit" size="lg" disabled={verifying} className="w-full font-semibold">
              {t('verify')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setCodeError(null)
              }}
              className="mx-auto flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {t('differentEmail')}
            </button>
          </form>
        )}
      </div>
        <p className="mt-6 border-t border-border pt-4 text-center text-base text-muted-foreground sm:border-0 sm:pt-0">
          {register ? (
            <>
              {t('haveAccount')}{' '}
              <Link href={loginHref(redirectTo)} className="text-foreground underline">{t('signIn')}</Link>
            </>
          ) : (
            <>
              {t('noAccount')}{' '}
              <Link href={registerHref(redirectTo)} className="text-foreground underline">{t('register')}</Link>
            </>
          )}
        </p>
    </>
  )
}

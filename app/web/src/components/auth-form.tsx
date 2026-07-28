'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { emailHasAccount, usernameAvailable } from '@/lib/auth-actions'
import { BRAND_NAME } from '@/lib/brand'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { FieldError } from '@/components/ui/field-error'
import { makeEmailStepSchema, makeCodeSchema } from '@/lib/schemas/auth'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

// Shared passwordless (email OTP) form. `register` collects a username and sets
// it after verification; `login` is email-only. Both cross-link to the other.
//
// The email step uses react-hook-form with uncontrolled register() (NOT
// <Controller>): the form swaps between the email and code step, and
// Controller-bound inputs stop updating after that unmount/mount under React 19.
// The code step is a controlled segmented OTP (InputOTP), so it is kept OUT of
// react-hook-form entirely — the value lives in local useState and is validated
// with makeCodeSchema on submit.
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
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
        setVerifying(false)
        setCodeError(t('usernameTaken'))
        return
      }
    }
    // Refresh so server components (e.g. the header) re-render with the new
    // session cookie — without this the header keeps its logged-out state.
    router.push('/')
    router.refresh()
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
        {register ? t('registerTitle') : t('title')}
      </h1>
      {step === 'email' && (
        <p className="mb-6 text-sm text-muted-foreground">
          {register
            ? t('registerSubtitle', { brand: BRAND_NAME })
            : t('subtitle', { brand: BRAND_NAME })}
        </p>
      )}
      {step === 'email' ? (
        <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
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
                placeholder="e.g. hermione_g"
                aria-invalid={!!emailForm.formState.errors.name}
                {...emailForm.register('name')}
              />
              <FieldError>{emailForm.formState.errors.name?.message}</FieldError>
            </div>
          )}
          <FieldError>{emailForm.formState.errors.root?.message}</FieldError>
          <Button type="submit" disabled={emailForm.formState.isSubmitting} className="w-full">
            {register ? t('register') : t('login')}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
          <div className="space-y-1.5">
            <Label htmlFor="code">{t('code')}</Label>
            <InputOTP
              id="code"
              maxLength={6}
              value={code}
              onChange={setCode}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              containerClassName="justify-center"
              aria-invalid={!!codeError}
            >
              <InputOTPGroup>
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
          <Button type="submit" disabled={verifying} className="w-full">
            {t('verify')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setCodeError(null)
            }}
            className="mx-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {t('differentEmail')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {register ? (
          <>
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-foreground underline">{t('signIn')}</Link>
          </>
        ) : (
          <>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-foreground underline">{t('register')}</Link>
          </>
        )}
      </p>
    </div>
  )
}

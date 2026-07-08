'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { emailHasAccount, usernameAvailable } from '@/lib/auth-actions'
import { BRAND_NAME } from '@/lib/brand'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { makeEmailStepSchema, makeCodeSchema } from '@/lib/schemas/auth'

// Shared passwordless (email OTP) form. `register` collects a username and sets
// it after verification; `login` is email-only. Both cross-link to the other.
//
// Fields use RHF's uncontrolled register() rather than <Controller>: this form
// swaps between two separate useForm instances across the email/code step, and
// Controller-bound inputs stop updating after that unmount/mount under React 19.
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
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(makeCodeSchema((k) => tv(k))),
    defaultValues: { code: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

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

  async function verify(values: { code: string }) {
    const { error } = await authClient.signIn.emailOtp({ email, otp: values.code })
    if (error) {
      codeForm.setError('code', { message: t('badCode') })
      return
    }
    if (register) {
      const name = emailForm.getValues('name') ?? ''
      const { error: updateError } = await authClient.updateUser({ username: name, displayUsername: name })
      if (updateError) {
        codeForm.setError('root', { message: t('usernameTaken') })
        return
      }
    }
    router.push('/')
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold text-primary">
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
        <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Input
              type="email"
              placeholder={t('email')}
              aria-invalid={!!emailForm.formState.errors.email}
              {...emailForm.register('email')}
            />
            <FieldError>{emailForm.formState.errors.email?.message}</FieldError>
          </div>
          {register && (
            <div className="space-y-1.5">
              <Input
                type="text"
                placeholder={t('username')}
                aria-invalid={!!emailForm.formState.errors.name}
                {...emailForm.register('name')}
              />
              <FieldError>{emailForm.formState.errors.name?.message}</FieldError>
            </div>
          )}
          <FieldError>{emailForm.formState.errors.root?.message}</FieldError>
          <Button type="submit" disabled={emailForm.formState.isSubmitting} className="w-full">
            {t('sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={codeForm.handleSubmit(verify)} className="space-y-3" noValidate>
          <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
          <div className="space-y-1.5">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              aria-invalid={!!codeForm.formState.errors.code}
              {...codeForm.register('code')}
            />
            <FieldError>{codeForm.formState.errors.code?.message}</FieldError>
          </div>
          <FieldError>{codeForm.formState.errors.root?.message}</FieldError>
          <Button type="submit" disabled={codeForm.formState.isSubmitting} className="w-full">
            {t('verify')}
          </Button>
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
    </main>
  )
}

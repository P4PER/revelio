'use client'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { requestEmailChange, confirmEmailChange } from '@/lib/settings-actions'
import { makeNewEmailSchema } from '@/lib/schemas/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import type { SettingsUser } from './types'

const errKey = (e: string) =>
  e === 'same-email' ? 'sameEmail' : e === 'email-taken' ? 'emailTaken' : 'requestError'

export function EmailPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.email')
  const tv = useTranslations('validation')
  const [step, setStep] = useState<'collapsed' | 'idle' | 'code'>('collapsed')
  const [target, setTarget] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const form = useForm({
    resolver: zodResolver(makeNewEmailSchema((k) => tv(k))),
    defaultValues: { email: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  function onRequest(values: { email: string }) {
    start(async () => {
      try {
        const res = await requestEmailChange(values.email.trim())
        if (res.ok) {
          setTarget(values.email.trim())
          setStep('code')
          setCode('')
          setCodeError(null)
        } else {
          form.setError('email', { message: t(errKey(res.error)) })
        }
      } catch {
        form.setError('email', { message: t('requestError') })
      }
    })
  }

  function onConfirm() {
    start(async () => {
      setCodeError(null)
      try {
        const res = await confirmEmailChange(code)
        if (res.ok) {
          toast.success(t('updated', { email: target }))
          setStep('collapsed')
          form.reset()
        } else {
          setCodeError(t('invalidCode'))
        }
      } catch {
        setCodeError(t('invalidCode'))
      }
    })
  }

  return (
    <section aria-labelledby="s-email" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-email" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>

      <p className="mb-4 text-sm"><span className="text-muted-foreground">{t('currentLabel')}: </span>{user.email}</p>

      {step === 'collapsed' && (
        <Button type="button" onClick={() => setStep('idle')}>{t('updateEmail')}</Button>
      )}

      {step === 'idle' && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onRequest)} className="max-w-sm space-y-4">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <Label htmlFor="new-email">{t('newLabel')}</Label>
                <FormControl><Input id="new-email" type="email" autoComplete="off" autoFocus {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{t('sendCode')}</Button>
              <Button type="button" variant="outline" onClick={() => { setStep('collapsed'); form.reset() }}>{t('cancel')}</Button>
            </div>
          </form>
        </Form>
      )}

      {step === 'code' && (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-muted-foreground">{t('codeSent', { email: target })}</p>
          <div className="space-y-2">
            <Label htmlFor="email-code">{t('codeLabel')}</Label>
            <InputOTP
              id="email-code"
              maxLength={6}
              value={code}
              onChange={(v) => { setCode(v); setCodeError(null) }}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
            >
              <InputOTPGroup data-invalid={!!codeError}>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={onConfirm} disabled={pending || code.length !== 6}>{t('confirm')}</Button>
            <Button type="button" variant="outline" onClick={() => setStep('idle')}>{t('cancel')}</Button>
          </div>
        </div>
      )}
    </section>
  )
}

'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { makeContactSchema } from '@/lib/schemas/contact'
import { sendContactMessage, type ContactResult } from '@/lib/contact-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { FieldError } from '@/components/ui/field-error'

// `website` (honeypot) and `renderedAt` (timing token) are `.optional()` in the
// schema, so they must be optional here for the zodResolver output type to match.
type Values = {
  name: string
  email: string
  subject: string
  message: string
  website?: string
  renderedAt?: string
}

// Maps a failed action result code to a `contact` error message key.
const ERROR_KEY: Record<Exclude<ContactResult, { ok: true }>['error'], string> = {
  invalid: 'errorGeneric',
  rate: 'errorRate',
  unconfigured: 'errorUnconfigured',
  send: 'errorSend',
}

export function ContactForm({ renderedAt }: { renderedAt: number }) {
  const t = useTranslations('contact')
  const tv = useTranslations('validation')
  const [sent, setSent] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(makeContactSchema((k) => tv(k))),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
      website: '',
      renderedAt: String(renderedAt),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function onSubmit(values: Values) {
    const res = await sendContactMessage(values)
    if (res.ok) {
      setSent(true)
      return
    }
    form.setError('root', { message: t(ERROR_KEY[res.error]) })
  }

  // Success — the reveal. The panel body swaps to a centered gold spark that
  // fades + scales in with a soft glow; reduced-motion users get a static spark.
  if (sent) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div role="status" className="flex flex-col items-center px-6 py-14 text-center">
          {/* The ✦ spark, matching the stars on the not-found page (gold glyph +
              gold glow), fades + scales in via the reveal-spark keyframe. */}
          <span
            aria-hidden
            className="inline-block text-5xl leading-none text-primary [filter:drop-shadow(0_0_18px_rgba(232,178,58,0.5))] motion-safe:animate-[reveal-spark_600ms_ease-out]"
          >
            ✦
          </span>
          <h2 className="mt-5 text-lg font-semibold text-foreground">{t('successTitle')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('successBody')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>
        {/* Honeypot — visually hidden, off the tab order and a11y tree, no autofill.
            Any value ⇒ the server silently drops the submission. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...form.register('website')}
          />
        </div>
        <input type="hidden" {...form.register('renderedAt')} />

        {/* name + email share a row from sm up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Input
              type="text"
              placeholder={t('name')}
              aria-invalid={!!form.formState.errors.name}
              {...form.register('name')}
            />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Input
              type="email"
              placeholder={t('email')}
              aria-invalid={!!form.formState.errors.email}
              {...form.register('email')}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </div>
        </div>

        <div className="space-y-1.5">
          <Input
            type="text"
            placeholder={t('subject')}
            aria-invalid={!!form.formState.errors.subject}
            {...form.register('subject')}
          />
          <FieldError>{form.formState.errors.subject?.message}</FieldError>
        </div>
        <div className="space-y-1.5">
          <AutoTextarea
            placeholder={t('message')}
            aria-invalid={!!form.formState.errors.message}
            {...form.register('message')}
          />
          <FieldError>{form.formState.errors.message?.message}</FieldError>
        </div>

        <FieldError>{form.formState.errors.root?.message}</FieldError>
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  )
}

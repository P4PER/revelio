'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { makeContactSchema, type ContactFormValues } from '@/lib/schemas/contact'
import { sendContactMessage, type ContactResult } from '@/lib/contact-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { FieldError } from '@/components/ui/field-error'

type Values = ContactFormValues

// Maps a failed action result code to a `contact` error message key.
const ERROR_KEY: Record<Exclude<ContactResult, { ok: true }>['error'], string> = {
  invalid: 'errorGeneric',
  rate: 'errorRate',
  unconfigured: 'errorUnconfigured',
  send: 'errorSend',
}

export function ContactForm({
  renderedAt,
  defaultName = '',
  defaultEmail = '',
}: {
  renderedAt: number
  // Prefilled from the session for signed-in users; empty for guests.
  defaultName?: string
  defaultEmail?: string
}) {
  const t = useTranslations('contact')
  const tv = useTranslations('validation')
  const [sent, setSent] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(makeContactSchema((k) => tv(k))),
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      subject: '',
      message: '',
      website: '',
      renderedAt: String(renderedAt),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function onSubmit(values: Values) {
    try {
      const res = await sendContactMessage(values)
      if (res.ok) {
        setSent(true)
        return
      }
      form.setError('root', { message: t(ERROR_KEY[res.error]) })
    } catch {
      // The action can still reject (DB down before it returns a code, an RSC
      // transport error, …). Surface a generic error rather than failing silently.
      form.setError('root', { message: t('errorGeneric') })
    }
  }

  // Success — "owl post". The panel body swaps to a winged-envelope emblem that
  // lifts in along a drawn gold flight trail (reduced-motion users get it static).
  if (sent) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div role="status" className="relative flex flex-col items-center px-6 py-14 text-center">
          {/* Soft gold glow behind the emblem. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-9 h-36 w-48 -translate-x-1/2 rounded-full bg-primary/8 blur-2xl"
          />
          <svg
            viewBox="0 0 140 100"
            aria-hidden
            fill="none"
            className="relative h-28 w-auto text-primary motion-safe:animate-[owl-lift_620ms_ease-out] [filter:drop-shadow(0_0_9px_rgba(232,178,58,0.28))]"
          >
            {/* Flight trail — draws itself from the launch point up to the envelope. */}
            <path
              d="M18 88 C 34 82, 46 74, 56 62"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeOpacity="0.5"
              strokeDasharray="130"
              className="motion-safe:animate-[trail-draw_720ms_200ms_ease-out_both]"
            />
            <circle cx="18" cy="88" r="2.4" fill="currentColor" fillOpacity="0.6" />

            {/* Winged envelope. */}
            <path d="M58 42 C 44 34, 32 38, 22 34 C 32 42, 44 46, 57 47 Z" fill="currentColor" fillOpacity="0.85" />
            <path d="M82 42 C 96 34, 108 38, 118 34 C 108 42, 96 46, 83 47 Z" fill="currentColor" fillOpacity="0.85" />
            <rect x="58" y="38" width="24" height="17" rx="3" fill="currentColor" />
            <path
              d="M58.5 40.5 L70 49 L81.5 40.5"
              stroke="#1b1836"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Destination spark — the four-point sparkle from the logo mark
                (logos/revelio-icon.svg), scaled down and placed at the trail's head. */}
            <g
              transform="translate(112 17) scale(0.46) translate(-70 -34)"
              className="motion-safe:animate-[spark-pulse_2.4s_ease-in-out_infinite]"
            >
              <path
                d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z"
                fill="currentColor"
              />
            </g>
          </svg>
          <h2 className="mt-6 text-lg font-semibold text-foreground">{t('successTitle')}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('successBody')}</p>
          <Button
            type="button"
            variant="ghost"
            className="mt-6"
            onClick={() => {
              // Reset to the original defaults (keeps the signed-in prefill and reuses
              // the still-valid renderedAt token) so a second message can be sent.
              form.reset()
              setSent(false)
            }}
          >
            {t('sendAnother')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-8 sm:p-10" noValidate>
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

        <div className="space-y-2">
          <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
            {t('name')}
          </label>
          <Input
            id="contact-name"
            type="text"
            className="h-10"
            aria-invalid={!!form.formState.errors.name}
            {...form.register('name')}
          />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </div>
        <div className="space-y-2">
          <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
            {t('email')}
          </label>
          <Input
            id="contact-email"
            type="email"
            className="h-10"
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
          <FieldError>{form.formState.errors.email?.message}</FieldError>
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-subject" className="text-sm font-medium text-foreground">
            {t('subject')}
          </label>
          <Input
            id="contact-subject"
            type="text"
            className="h-10"
            aria-invalid={!!form.formState.errors.subject}
            {...form.register('subject')}
          />
          <FieldError>{form.formState.errors.subject?.message}</FieldError>
        </div>
        <div className="space-y-2">
          <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
            {t('message')}
          </label>
          <AutoTextarea
            id="contact-message"
            className="min-h-32"
            aria-invalid={!!form.formState.errors.message}
            {...form.register('message')}
          />
          <FieldError>{form.formState.errors.message?.message}</FieldError>
        </div>

        <FieldError>{form.formState.errors.root?.message}</FieldError>
        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting}
          className="h-10 w-full font-semibold"
        >
          {form.formState.isSubmitting ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  )
}

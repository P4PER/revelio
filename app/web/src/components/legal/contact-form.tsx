'use client'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { makeContactSchema, type ContactFormValues } from '@/lib/schemas/contact'
import { sendContactMessage, type ContactResult } from '@/lib/actions/contact-actions'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { FieldError } from '@/components/ui/field-error'
import { FORM_CARD } from '@/components/auth/auth-form'
import { OwlPostEmblem } from '@/components/legal/owl-post-emblem'

type Values = ContactFormValues

type ContactFormProps = {
  renderedAt: number
  // Prefilled from the session for signed-in users; empty for guests.
  defaultName?: string
  defaultEmail?: string
  // The page's heading block (server-rendered). Left column from `lg` up.
  intro: ReactNode
  // Optional line under the form on a phone, under the intro from `lg` up.
  footer?: ReactNode
}

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
  intro,
  footer,
}: ContactFormProps) {
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

  // The page hands in its intro and footer so this component can own the grid:
  // sending moves the emblem from above the intro (phone) to above the success
  // card, which a server-rendered sibling could not follow. From `lg` up the
  // intro and footer stack in the left column between two flexible spacer rows,
  // and the card spans all four rows on the right, so both columns share one
  // centre line whichever is taller. Below `lg` everything is one column in DOM
  // order.
  return (
    <div
      data-slot="contact-layout"
      className="grid gap-6 lg:grid-cols-[5fr_6fr] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-16 lg:gap-y-0"
    >
      <div data-slot="contact-intro" className="lg:col-start-1 lg:row-start-2">
        {!sent && <OwlPostEmblem className="mb-4 lg:hidden" />}
        {intro}
      </div>

      <div className="lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-center">
        {sent ? (
          <>
            <OwlPostEmblem flying className="-mb-11" />
            <div data-slot="contact-card" className={FORM_CARD}>
              <div role="status" className="flex flex-col items-center py-6 text-center">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t('successTitle')}</h2>
                <p className="mt-2 max-w-sm text-base text-muted-foreground">{t('successBody')}</p>
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
          </>
        ) : (
          <div data-slot="contact-card" className={FORM_CARD}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

                <div className="grid gap-4 lg:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('name')}</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            size="lg"
                            autoComplete="name"
                            placeholder={t('namePlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('email')}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            size="lg"
                            autoComplete="email"
                            placeholder={t('emailPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('subject')}</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          size="lg"
                          placeholder={t('subjectPlaceholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('message')}</FormLabel>
                      <FormControl>
                        <AutoTextarea
                          name={field.name}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          size="lg"
                          placeholder={t('messagePlaceholder')}
                          className="min-h-32 mb-0"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FieldError>{form.formState.errors.root?.message}</FieldError>
                <Button
                  type="submit"
                  size="lg"
                  disabled={form.formState.isSubmitting}
                  className="w-full font-semibold"
                >
                  {form.formState.isSubmitting ? t('sending') : t('send')}
                </Button>
              </form>
            </Form>
          </div>
        )}
      </div>

      {footer && (
        <div data-slot="contact-footer" className="lg:col-start-1 lg:row-start-3 lg:mt-8">
          {footer}
        </div>
      )}
    </div>
  )
}

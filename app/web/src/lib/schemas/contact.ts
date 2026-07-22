import { z } from 'zod'

type T = (key: string) => string

// Length bounds shared with the server action and any UI hint. `message` has a
// floor so a one-word "hi" doesn't reach the operator inbox.
export const CONTACT_LIMITS = {
  NAME_MAX: 100,
  SUBJECT_MAX: 150,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 5000,
} as const

// Visible fields are validated with translated messages. `website` (honeypot) and
// `renderedAt` (submit-timing token) are optional pass-throughs — the anti-spam
// checks read them from the raw payload, so they must survive parsing but never
// cause a validation failure.
export function makeContactSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')).max(CONTACT_LIMITS.NAME_MAX, t('tooLong')),
    email: z.string().trim().min(1, t('required')).email(t('email')),
    subject: z.string().trim().min(1, t('required')).max(CONTACT_LIMITS.SUBJECT_MAX, t('tooLong')),
    message: z
      .string()
      .trim()
      .min(CONTACT_LIMITS.MESSAGE_MIN, t('messageTooShort'))
      .max(CONTACT_LIMITS.MESSAGE_MAX, t('tooLong')),
    website: z.string().optional(),
    renderedAt: z.string().optional(),
  })
}

// Derived from the schema so the form's field types can never drift from validation.
// `website`/`renderedAt` are optional here (they're `.optional()` above).
export type ContactFormValues = z.infer<ReturnType<typeof makeContactSchema>>

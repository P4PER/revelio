import { z } from 'zod'

type T = (key: string) => string

/** What the email step submits. `name` is present only in register mode. */
export type EmailStepValues = { email: string; name?: string }

// Email-step schema. In register mode `name` (username) is required; login mode
// omits it. Availability/existence are checked server-side and mapped to fields.
// The return type is explicit because the two branches are different object
// schemas: inferred, their union gives zod 4 a required `name: string |
// undefined` key, which react-hook-form's resolver then demands.
export function makeEmailStepSchema(t: T, register: boolean): z.ZodType<EmailStepValues, EmailStepValues> {
  return z.object({
    email: z.string().trim().min(1, t('required')).email(t('email')),
    name: register ? z.string().trim().min(1, t('required')) : z.string().optional(),
  })
}

export function makeCodeSchema(t: T) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, t('required'))
      .regex(/^[0-9]{6}$/, t('sixDigits')),
  })
}

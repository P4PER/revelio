import { z } from 'zod'

type T = (key: string) => string

// Email-step schema. In register mode `name` (username) is required; login mode
// omits it. Availability/existence are checked server-side and mapped to fields.
export function makeEmailStepSchema(t: T, register: boolean) {
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

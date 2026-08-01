import { z } from 'zod'

type T = (key: string) => string

export function makeUsernameSchema(t: T) {
  return z.object({ username: z.string().trim().min(1, t('required')) })
}

export function makeNewEmailSchema(t: T) {
  return z.object({ email: z.string().trim().min(1, t('required')).email(t('email')) })
}

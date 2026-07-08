import { z } from 'zod'

type T = (key: string) => string

export function makeSetWriteSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')),
    releaseDate: z.string(),
    isOfficial: z.boolean(),
    localizations: z.record(z.string(), z.string()),
  })
}

export function makeSetCreateSchema(t: T) {
  return makeSetWriteSchema(t).extend({
    code: z.string().trim().min(1, t('required')),
  })
}

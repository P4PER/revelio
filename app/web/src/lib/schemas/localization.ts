import { z } from 'zod'
import { CARD_NAME_MAX } from '@revelio/core'

type T = (key: string) => string

// Only `name` is user-required in the localization form; the rest are optional
// free text kept in local state. The server action keeps its own full schema.
export function makeLocalizationSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')).max(CARD_NAME_MAX, t('tooLong')),
  })
}

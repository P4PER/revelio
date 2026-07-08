import { z } from 'zod'

type T = (key: string) => string

// Client-only gate: every present ruling row must have date, source, and text.
// The server action stays lenient (shape-only) and filters blanks — this is the
// UX guard that surfaces per-field errors before saving.
export function makeRulingsSchema(t: T) {
  return z.object({
    rows: z.array(
      z.object({
        id: z.string().nullable(),
        date: z.string().trim().min(1, t('required')),
        source: z.string().trim().min(1, t('required')),
        text: z.string().trim().min(1, t('required')),
      }),
    ),
  })
}

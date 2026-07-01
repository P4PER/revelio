import { z } from 'zod'

export const vocabEntrySchema = z.object({
  code: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
})

export const lessonEntrySchema = vocabEntrySchema.extend({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a #RRGGBB hex color'),
})

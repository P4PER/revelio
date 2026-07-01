import { z } from 'zod'

export const vocabMetaSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
  sortOrder: z.number().int().nonnegative(),
})

export const lessonMetaSchema = vocabMetaSchema.extend({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a #RRGGBB hex color'),
})

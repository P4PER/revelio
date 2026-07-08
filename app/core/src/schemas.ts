import { z } from 'zod'
export { DeckFormat, DeckVisibility, DeckZone } from './deck'

export const attributeMetaSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/),
})

export const lessonMetaSchema = attributeMetaSchema.extend({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'expected a #RRGGBB hex color'),
})

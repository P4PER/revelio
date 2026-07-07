import { z } from 'zod'
import { DeckFormat } from './deck'
import type { DeckDTO, DeckCardView } from './domain'

const qtySchema = z.object({ cardId: z.string(), quantity: z.number().int().positive() })
const deckJsonSchema = z.object({
  name: z.string(),
  format: DeckFormat,
  character: z.string().nullable(),
  main: z.array(qtySchema),
  sideboard: z.array(qtySchema),
})
export type DeckJson = z.infer<typeof deckJsonSchema>

export function toJson(deck: DeckDTO): DeckJson {
  const pick = (zone: 'main' | 'sideboard') =>
    deck.cards.filter((c) => c.zone === zone).map((c) => ({ cardId: c.cardId, quantity: c.quantity }))
  return {
    name: deck.name,
    format: deck.format,
    character: deck.cards.find((c) => c.zone === 'character')?.cardId ?? null,
    main: pick('main'),
    sideboard: pick('sideboard'),
  }
}

export function parseJson(raw: unknown): DeckJson {
  return deckJsonSchema.parse(raw)
}

const FORMAT_LABEL: Record<DeckJson['format'], string> = { classic: 'Classic', revival: 'Revival' }

export function toText(deck: { name: string; format: DeckJson['format'] }, views: DeckCardView[]): string {
  const line = (v: DeckCardView) => `${v.quantity}x ${v.name} (${v.setCode})`
  const out: string[] = [`# ${deck.name} (${FORMAT_LABEL[deck.format]})`, '']
  const char = views.find((v) => v.zone === 'character')
  if (char) out.push(`Character: ${line(char)}`, '')
  const main = views.filter((v) => v.zone === 'main')
  if (main.length) { out.push(`Main deck (${main.reduce((n, v) => n + v.quantity, 0)})`); main.forEach((v) => out.push(line(v))); out.push('') }
  const side = views.filter((v) => v.zone === 'sideboard')
  if (side.length) { out.push(`Sideboard (${side.reduce((n, v) => n + v.quantity, 0)})`); side.forEach((v) => out.push(line(v))) }
  return out.join('\n').trimEnd() + '\n'
}

export type ParsedTextLine = { quantity: number; name: string; setCode: string | null }

// Matches "4x Name (SET)", "4 Name", "4x Name". Ignores blank lines, comments, and section headers.
const LINE_RE = /^\s*(\d+)\s*x?\s+(.+?)\s*(?:\(([A-Za-z0-9]+)\)\s*)?$/

export function parseText(text: string): { lines: ParsedTextLine[]; unparsed: string[] } {
  const lines: ParsedTextLine[] = []
  const unparsed: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    if (/^(character|main deck|sideboard)\b/i.test(t) && !/\d/.test(t.split(/\s+/)[0])) continue
    const stripped = t.replace(/^character:\s*/i, '')
    const m = LINE_RE.exec(stripped)
    if (!m) { unparsed.push(raw); continue }
    lines.push({ quantity: Number(m[1]), name: m[2].trim(), setCode: m[3] ? m[3].toUpperCase() : null })
  }
  return { lines, unparsed }
}

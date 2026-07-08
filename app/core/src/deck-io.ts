import { z } from 'zod'
import { DeckFormat } from './deck'
import type { DeckZone } from './deck'
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
  // The set code AND collector number are both emitted: a name can have several
  // printings in one set (e.g. holo/foil character variants), so only
  // (set, number) resolves back to exactly one card on re-import.
  const ref = (v: DeckCardView) => `(${v.setCode} ${v.number})`
  const line = (v: DeckCardView) => `${v.quantity}x ${v.name} ${ref(v)}`
  const out: string[] = [`// ${deck.name} (${FORMAT_LABEL[deck.format]})`, '']
  const char = views.find((v) => v.zone === 'character')
  if (char) out.push('// Character', `${char.name} ${ref(char)}`, '')
  const main = views.filter((v) => v.zone === 'main')
  if (main.length) { out.push(`// Main deck (${main.reduce((n, v) => n + v.quantity, 0)})`); main.forEach((v) => out.push(line(v))); out.push('') }
  const side = views.filter((v) => v.zone === 'sideboard')
  if (side.length) { out.push(`// Sideboard (${side.reduce((n, v) => n + v.quantity, 0)})`); side.forEach((v) => out.push(line(v))) }
  return out.join('\n').trimEnd() + '\n'
}

export type ParsedTextLine = { quantity: number; name: string; setCode: string | null; number: string | null; zone: DeckZone }

// A "// Character" / "// Main deck" / "// Sideboard" heading (leading "//"
// optional, trailing "(N)" count optional). Switches the section that
// following card lines are assigned to.
const HEADER_RE = /^(?:\/\/\s*)?(character|main deck|main|sideboard)\b\s*(?:\(\d+\))?$/i
// The "(SET NUMBER)" reference tail, number optional: "(BS 9)", "(DA)".
const REF = String.raw`(?:\(([A-Za-z0-9]+)(?:\s+([A-Za-z0-9]+))?\)\s*)?`
// Matches "4x Name (SET NUMBER)", "4 Name", "4x Name" — a quantity-prefixed line.
const LINE_RE = new RegExp(String.raw`^\s*(\d+)\s*x?\s+(.+?)\s*${REF}$`)
// Matches a bare "Name" or "Name (SET NUMBER)" with no leading quantity — used
// for the starting character.
const NAME_RE = new RegExp(String.raw`^(.+?)\s*${REF}$`)

export function parseText(text: string): { lines: ParsedTextLine[]; unparsed: string[] } {
  const lines: ParsedTextLine[] = []
  const unparsed: string[] = []
  // Card lines before any heading default to the main deck (bare list imports).
  let zone: DeckZone = 'main'
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t) continue
    const header = HEADER_RE.exec(t)
    if (header) {
      const h = header[1].toLowerCase()
      zone = h.startsWith('character') ? 'character' : h.startsWith('side') ? 'sideboard' : 'main'
      continue
    }
    // Any other comment line (title, "# ...", "// ...") is ignored.
    if (t.startsWith('//') || t.startsWith('#')) continue
    if (zone === 'character') {
      // The character line carries no quantity, but tolerate a "1x …" form too.
      // Either way it's a single copy in the character zone.
      const withQty = LINE_RE.exec(t)
      const m = withQty ?? NAME_RE.exec(t)!
      const name = (withQty ? m[2] : m[1]).trim()
      const set = withQty ? m[3] : m[2]
      const num = withQty ? m[4] : m[3]
      lines.push({ quantity: 1, name, setCode: set ? set.toUpperCase() : null, number: num ?? null, zone: 'character' })
      continue
    }
    const m = LINE_RE.exec(t)
    if (!m) { unparsed.push(raw); continue }
    lines.push({ quantity: Number(m[1]), name: m[2].trim(), setCode: m[3] ? m[3].toUpperCase() : null, number: m[4] ?? null, zone })
  }
  return { lines, unparsed }
}

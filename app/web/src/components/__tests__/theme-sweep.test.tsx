import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const read = (p: string) => readFile(resolve(process.cwd(), 'src/components', p), 'utf8')

describe('light-mode sweep', () => {
  // bg-white/5 is a dark-only wash: on parchment it is invisible.
  it.each(['quick-filters.tsx', 'lesson-filter.tsx'])('%s uses the hover token', async (file) => {
    const src = await read(file)
    expect(src).not.toMatch(/hover:bg-white\//)
    expect(src).toMatch(/hover:bg-\(--hover-bg\)/)
  })

  // accent is a pale wash in light mode, so text-accent is unreadable there.
  it('error-card-state does not colour text with accent', async () => {
    expect(await read('error-card-state.tsx')).not.toMatch(/text-accent\b/)
  })

  // text-white is only safe over card art, a black scrim or a destructive
  // fill. Here it sat on bg-card, so the count was white on near-white and
  // only showed up when a text selection highlighted it.
  it('add-to-collection does not paint the count white', async () => {
    expect(await read('add-to-collection.tsx')).not.toMatch(/text-white/)
  })

  // A colour literal only hurts theming when it carries a hue: a neutral
  // black/white alpha (a shadow, a mask stop) reads the same on parchment and
  // on midnight, but a gold rgba() baked into a glow does not. The old guard
  // only matched #rrggbb, so the error-card's rgba() halos slipped past it.
  const CHROMATIC = /(?:rgba?|hsla?)\(([^)]*)\)|#([0-9a-fA-F]{3,8})\b/g

  function chromaticLiterals(src: string): string[] {
    const found: string[] = []
    for (const [literal, fn, hex] of src.matchAll(CHROMATIC)) {
      let rgb: number[]
      if (fn != null) {
        const parts = fn.split(/[,/\s]+/).filter(Boolean).map(Number)
        // Bail on hsl() and anything non-numeric: a non-zero saturation is a
        // hue by definition, so treat it as chromatic.
        if (literal.startsWith('hsl')) {
          if (parts[1] !== 0) found.push(literal)
          continue
        }
        rgb = parts.slice(0, 3)
      } else {
        const h = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c) : hex.match(/../g)!.slice(0, 3)
        rgb = h.map((c) => parseInt(c, 16))
      }
      if (rgb.some(Number.isNaN) || new Set(rgb).size > 1) found.push(literal)
    }
    return found
  }

  it.each(['contact-form.tsx', 'error-card-state.tsx'])(
    '%s has no hardcoded chromatic colours',
    async (file) => {
      expect(chromaticLiterals(await read(file))).toEqual([])
    },
  )

  // Guard the guard: the exact halo that shipped must be caught, while the
  // neutral dark-mode shadow and the mask stop next to it must not be.
  it('flags chromatic rgba but allows neutral shadows', () => {
    expect(chromaticLiterals('drop-shadow(0 0 8px rgba(246,213,139,0.85))')).toHaveLength(1)
    expect(chromaticLiterals('shadow-[0_18px_42px_rgba(0,0,0,0.55)]')).toEqual([])
    expect(chromaticLiterals('linear-gradient(115deg,#000_55%,transparent_92%)')).toEqual([])
    expect(chromaticLiterals('#E2AE37')).toHaveLength(1)
  })
})

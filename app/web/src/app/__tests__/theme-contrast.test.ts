import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { LESSONS } from '@revelio/core'

let css = ''
beforeAll(async () => {
  css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
})

function hex(token: string): string {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})`, 'i'))
  expect(m, `no hex for ${token}`).not.toBeNull()
  return m![1]
}

function luminance(h: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * CIELAB coordinates. Contrast ratio is the wrong tool for comparing two pale
 * surfaces - it only sees lightness, so it calls a lilac and a parchment of
 * equal lightness identical. Perceptual distance is what "can you see the
 * hover?" actually depends on.
 */
function lab(h: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** `bg-x/20` composites x at 20% over whatever is behind it. */
function over(fg: string, bg: string, alpha: number): string {
  const f = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16))
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
  const mix = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)))
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

describe('light theme contrast', () => {
  // AA for normal text. Light mode is held to this in full; dark mode is
  // carried over as-is and has four known pre-existing gaps documented in
  // docs/superpowers/specs/2026-08-17-light-mode-design.md.
  const AA = 4.5
  const pairs: [string, string, string][] = [
    ['body text', '--light-foreground', '--light-background'],
    ['muted text', '--light-muted-foreground', '--light-background'],
    ['muted text on card', '--light-muted-foreground', '--light-card'],
    ['primary button label', '--light-primary-foreground', '--light-primary'],
    // --primary is a FILL (dark ink sits on it). Gold used as text needs its
    // own darker value: #F0C458 on parchment is 1.51:1, effectively invisible.
    ['hover border on card', '--light-secondary-ink', '--light-card'],
    ['heading on page', '--light-heading', '--light-background'],
    ['heading on card', '--light-heading', '--light-card'],
    ['gold ink on page', '--light-primary-ink', '--light-background'],
    ['gold ink on card', '--light-primary-ink', '--light-card'],
    ['gold ink on muted', '--light-primary-ink', '--light-muted'],
    ['secondary button label', '--light-secondary-foreground', '--light-secondary'],
    ['accent hover label', '--light-accent-foreground', '--light-accent'],
    ['destructive text', '--light-destructive', '--light-background'],
  ]

  for (const [label, fg, bg] of pairs) {
    it(`${label} clears AA`, () => {
      expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(AA)
    })
  }

  // Not a WCAG rule - a hierarchy one. --secondary is a quiet surface: on
  // midnight it sits 1.79:1 off the page while the gold primary shouts at
  // 9.46:1. Reusing the dark indigo on parchment inverted that, making every
  // secondary badge ~6x louder than the primary button.
  it('the secondary fill stays quieter than the primary fill', () => {
    const secondary = contrast(hex('--light-secondary'), hex('--light-background'))
    const primary = contrast(hex('--light-primary'), hex('--light-background'))
    expect(secondary).toBeLessThan(primary)
    expect(secondary).toBeLessThan(2)
  })

  // The hover fill has to clear two different neighbours: the page it lifts
  // off, and `muted`, the app's ordinary raised surface. Too close to the page
  // and the hover is invisible; too close to muted and a hovered row reads like
  // a resting panel. The upper bound is what the original lilac broke - it sat
  // 17.3 from the page, roughly 3x any other surface step, and in a different
  // hue family.
  it('the hover fill reads as a step, not as a different colour', () => {
    const vsPage = deltaE(hex('--light-accent'), hex('--light-background'))
    const vsMuted = deltaE(hex('--light-accent'), hex('--light-muted'))
    expect(vsPage).toBeGreaterThan(5)
    expect(vsPage).toBeLessThan(15)
    expect(vsMuted).toBeGreaterThan(5)
  })

  // The progress bar draws its own track as the fill at 20%, so the pair that
  // matters is fill-vs-track, not fill-vs-page. Gold was 1.48:1 here on the
  // sidebar card and 1.24:1 once the row was hovered - a bar you could not read.
  it('the progress fill separates from its own track, on card and on a hovered row', () => {
    const fill = hex('--light-progress')
    for (const ground of [hex('--light-card'), hex('--light-accent')]) {
      expect(contrast(fill, over(fill, ground, 0.2))).toBeGreaterThanOrEqual(3)
    }
  })

  // Graphical fills only need 3:1 (WCAG 1.4.11).
  it('chart fills clear 3:1 against the page', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(contrast(hex(`--light-chart-${n}`), hex('--light-background'))).toBeGreaterThanOrEqual(3)
    }
  })
})

// The light theme is the one being introduced, so most guards above point at
// it. These cover the dark side of the ink tokens: an ink value chosen to be
// readable on parchment is, by construction, at risk of vanishing on midnight.
describe('dark theme ink', () => {
  const GRAPHIC = 3 // WCAG 1.4.11
  it('the error-card glyph stays visible on the card motif', () => {
    // Rendered on the muted/card stripes of error-card-state.tsx.
    expect(contrast(hex('--dark-secondary-ink'), hex('--dark-card'))).toBeGreaterThanOrEqual(GRAPHIC)
    expect(contrast(hex('--dark-secondary-ink'), hex('--dark-muted'))).toBeGreaterThanOrEqual(GRAPHIC)
  })

  it('gold ink clears AA on the page and on cards', () => {
    expect(contrast(hex('--dark-primary-ink'), hex('--dark-background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('--dark-primary-ink'), hex('--dark-card'))).toBeGreaterThanOrEqual(4.5)
  })

  // Headings deliberately differ per theme: each takes whichever brand colour
  // works on its own ground. Indigo is 1.79:1 on midnight and gold is 1.51:1
  // on parchment, so neither one can serve both.
  it('headings clear AA on the page and on cards', () => {
    expect(contrast(hex('--dark-heading'), hex('--dark-background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex('--dark-heading'), hex('--dark-card'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the progress fill separates from its own track', () => {
    const fill = hex('--dark-progress')
    expect(contrast(fill, over(fill, hex('--dark-card'), 0.2))).toBeGreaterThanOrEqual(3)
  })

  // The card-tile hover border. It must be read at full strength: composited at
  // /60 the dark value falls to 2.11:1 and at /40 to 1.61:1, which is how the
  // old primary/40/accent/60 borders ended up nearly invisible.
  it('the hover border clears 3:1 on a card', () => {
    expect(contrast(hex('--dark-secondary-ink'), hex('--dark-card'))).toBeGreaterThanOrEqual(3)
  })
})

// The lesson tints are the one palette that carries a hue per value AND gets
// used two ways: as chip label text on the page, and as a chip fill with
// --lesson-on written over it. Both roles are real text, so both need AA.
//
// These guard the values the app actually renders. The previous version of this
// suite asserted --light-lesson-* while every component painted the fixed
// LESSONS[].color from @revelio/core, so the tints on screen (quidditch at
// 1.86:1 on parchment) were never covered by the tests that passed.
describe('lesson tints', () => {
  const AA = 4.5

  // The helper builds `var(--lesson-<code>)` straight from the domain code, so
  // a lesson without a matching custom property would silently paint nothing.
  it.each(LESSONS.map((l) => l.code))('%s has a token in both themes', (code) => {
    expect(hex(`--light-lesson-${code}`)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(hex(`--dark-lesson-${code}`)).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it.each(LESSONS.map((l) => l.code))(
    'light: %s reads as a chip label and carries --lesson-on as a fill',
    (code) => {
      const tint = hex(`--light-lesson-${code}`)
      expect(contrast(tint, hex('--light-background'))).toBeGreaterThanOrEqual(AA)
      expect(contrast(hex('--light-lesson-on'), tint)).toBeGreaterThanOrEqual(AA)
    },
  )

  // Dark keeps the WotC card-frame hexes. The design spec records that as a
  // brand decision rather than a mechanical fix, so these pairs are BELOW AA on
  // purpose. Pinning the exact set is what stops it drifting: a new lesson, or
  // a tint nudged either way, changes this list and fails here rather than
  // quietly widening a documented exception into an undocumented one.
  const KNOWN_DARK_EXCEPTIONS = {
    label: ['charms', 'care_of_magical_creatures', 'transfiguration'],
    fill: ['potions', 'quidditch'],
  }

  it('the dark lesson exceptions are exactly the ones the spec records', () => {
    const label = LESSONS.map((l) => l.code).filter(
      (code) => contrast(hex(`--dark-lesson-${code}`), hex('--dark-background')) < AA,
    )
    const fill = LESSONS.map((l) => l.code).filter(
      (code) => contrast(hex('--dark-lesson-on'), hex(`--dark-lesson-${code}`)) < AA,
    )
    expect(label.sort()).toEqual([...KNOWN_DARK_EXCEPTIONS.label].sort())
    expect(fill.sort()).toEqual([...KNOWN_DARK_EXCEPTIONS.fill].sort())
  })

  // Whatever is not a recorded exception still has to clear AA.
  it.each(LESSONS.map((l) => l.code))('dark: %s meets AA unless listed', (code) => {
    const tint = hex(`--dark-lesson-${code}`)
    if (!KNOWN_DARK_EXCEPTIONS.label.includes(code)) {
      expect(contrast(tint, hex('--dark-background'))).toBeGreaterThanOrEqual(AA)
    }
    if (!KNOWN_DARK_EXCEPTIONS.fill.includes(code)) {
      expect(contrast(hex('--dark-lesson-on'), tint)).toBeGreaterThanOrEqual(AA)
    }
  })

})

// globals.css used to declare `@custom-variant dark (&:is(.dark *))` while
// nothing ever set a `.dark` class, so every dark: utility in the tree was a
// no-op. Fixing the variant made them all fire at once - including this one,
// which turns out to be load-bearing: shadcn's destructive button paints
// text-white, and the solid dark destructive is far too light to carry it.
describe('revived dark: utilities', () => {
  it('the destructive button needs its dark fill to clear AA under white', () => {
    const solid = hex('--dark-destructive')
    expect(contrast('#ffffff', solid)).toBeLessThan(4.5)
    const damped = over(solid, hex('--dark-background'), 0.6)
    expect(contrast('#ffffff', damped)).toBeGreaterThanOrEqual(4.5)
  })
})

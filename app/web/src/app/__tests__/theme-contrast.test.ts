import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

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
    ['secondary button label', '--light-secondary-foreground', '--light-secondary'],
    ['accent hover label', '--light-accent-foreground', '--light-accent'],
    ['destructive text', '--light-destructive', '--light-background'],
    ['lesson cmc', '--light-lesson-cmc', '--light-background'],
    ['lesson charms', '--light-lesson-charms', '--light-background'],
    ['lesson potions', '--light-lesson-potions', '--light-background'],
    ['lesson transfiguration', '--light-lesson-transfiguration', '--light-background'],
    ['lesson quidditch', '--light-lesson-quidditch', '--light-background'],
  ]

  for (const [label, fg, bg] of pairs) {
    it(`${label} clears AA`, () => {
      expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(AA)
    })
  }

  // Graphical fills only need 3:1 (WCAG 1.4.11).
  it('chart fills clear 3:1 against the page', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(contrast(hex(`--light-chart-${n}`), hex('--light-background'))).toBeGreaterThanOrEqual(3)
    }
  })
})

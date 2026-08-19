import { LESSONS } from '@revelio/core'

// globals.css defines one --lesson-<code> custom property per lesson, in both
// themes: the dark set is the WotC card-frame palette (brightened where the
// printed hex was too dark to read as text on midnight), the light set darkened
// so it clears AA on parchment. Handing back the var() rather than
// LESSONS[].color is what lets a lesson tint follow the theme.
//
// LESSONS[].color stays a plain hex on purpose: deck-png.ts paints it onto a
// canvas for the deck-image export, where there is no CSS to resolve a var().
const CODES = new Set(LESSONS.map((l) => l.code))

// Theme-aware lesson tint, or undefined for a non-lesson / unknown code.
export function lessonVar(code: string | null | undefined): string | undefined {
  return code && CODES.has(code) ? `var(--lesson-${code})` : undefined
}

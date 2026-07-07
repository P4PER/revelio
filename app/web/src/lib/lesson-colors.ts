import { LESSONS } from '@revelio/core'

// The `bg-lesson-*` Tailwind utilities (from the --color-lesson-* tokens in
// globals.css) don't reliably generate in this Tailwind v4 setup, so lesson
// tints are applied as inline `background-color` from the LESSONS palette —
// the same source of truth used by the advanced-search quick filters. This
// keeps every lesson swatch in sync with the lesson icons (which fill from the
// identical hex values).
const LESSON_COLOR = new Map(LESSONS.map((l) => [l.code, l.color]))

// Hex tint for a lesson code, or undefined for a non-lesson / unknown code.
export function lessonColor(code: string | null | undefined): string | undefined {
  return code ? LESSON_COLOR.get(code) : undefined
}

// Literal Tailwind class names for the lesson-tinted tokens defined in globals.css
// (--color-lesson-*). Tailwind's content scanner needs the full class string to
// appear verbatim somewhere in source, so these must stay as literal object
// values rather than being built with a template string like `bg-lesson-${code}`.
export const LESSON_BG_CLASS: Record<string, string> = {
  care_of_magical_creatures: 'bg-lesson-care_of_magical_creatures',
  charms: 'bg-lesson-charms',
  potions: 'bg-lesson-potions',
  transfiguration: 'bg-lesson-transfiguration',
  quidditch: 'bg-lesson-quidditch',
}

export function lessonBgClass(code: string | null | undefined): string {
  if (!code) return 'bg-muted-foreground'
  return LESSON_BG_CLASS[code] ?? 'bg-muted-foreground'
}

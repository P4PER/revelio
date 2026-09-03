'use client'
import { useLocale } from 'next-intl'
import { LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { lessonVar } from '@/lib/lesson-colors'
import { Chip } from '@/components/ui/chip'

// The five lesson toggles (icon + label), filled with the lesson colour when
// active; labels collapse to icon-only on narrow (touch) widths.
//
// Chips, not a row: this returns the bare siblings and the caller supplies the
// container they sit in, which is why the name says chips. /search scrolls
// them sideways in a FilterRail while the deck toolbars wrap them, so there is
// no one row that suits all three call sites.
export function LessonFilterChips({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (code: string) => void
}) {
  const locale = useLocale()
  return (
    <>
      {LESSONS.map((l) => {
        const active = selected.includes(l.code)
        const label = attrLabel('lessons', l.code, locale)
        return (
          <Chip
            key={l.code}
            active={active}
            aria-label={label}
            title={label}
            onClick={() => onToggle(l.code)}
            // Lesson tints are per-lesson custom properties, so the active fill
            // and the rest tint are inline. Inline background also wins over the
            // hover class, so an active chip stays put on hover while inactive
            // ones tint. --lesson-on is the ink that stays legible on the fill:
            // white on the darkened light palette, midnight on the bright dark
            // one (a fill readable as text on midnight cannot also carry white).
            style={
              active
                ? {
                    backgroundColor: lessonVar(l.code),
                    borderColor: lessonVar(l.code),
                    color: 'var(--lesson-on)',
                  }
                : { color: lessonVar(l.code) }
            }
            className="hover:bg-(--hover-bg)"
          >
            {/* Icon is a flat SVG in the lesson's printed colour; on the active
                (colour-filled) chip force it to --lesson-on so it matches the
                label rather than fighting the fill.
                A static 16px public SVG, and the optimizer is off project-wide
                (images.unoptimized), so <Image> would add no value. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/lessons/${l.code}.svg`}
              alt=""
              width={16}
              height={16}
              style={{ width: 16, height: 16, filter: active ? 'var(--lesson-icon-filter)' : undefined }}
            />
            <span className="hidden sm:inline">{label}</span>
          </Chip>
        )
      })}
    </>
  )
}

'use client'
import { useLocale } from 'next-intl'
import { LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'

// Lesson filter as a segmented control: five joined segments (lesson icon +
// label) that fill with the lesson colour when active. Labels collapse to
// icon-only on narrow (touch) widths. Returns the bar so callers drop it into
// their toolbar row. 32px / compact.
export function LessonFilter({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (code: string) => void
}) {
  const locale = useLocale()
  return (
    <Segmented>
      {LESSONS.map((l) => {
        const active = selected.includes(l.code)
        const label = attrLabel('lessons', l.code, locale)
        return (
          <SegmentedItem
            key={l.code}
            active={active}
            aria-label={label}
            title={label}
            onClick={() => onToggle(l.code)}
            // Lesson colours are dynamic hex, so the active fill / rest tint are
            // inline. Inline background also wins over the hover class, so an
            // active segment stays put on hover while inactive ones tint.
            style={active ? { backgroundColor: l.color, color: '#fff' } : { color: l.color }}
            className="hover:bg-white/5"
          >
            {/* Icon is filled with the lesson colour; force white on the active
                (colour-filled) segment so it stays legible. */}
            <img
              src={`/lessons/${l.code}.svg`}
              alt=""
              width={16}
              height={16}
              style={{ width: 16, height: 16, filter: active ? 'brightness(0) invert(1)' : undefined }}
            />
            <span className="hidden sm:inline">{label}</span>
          </SegmentedItem>
        )
      })}
    </Segmented>
  )
}

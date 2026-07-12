'use client'
import { useState } from 'react'
import { useLocale } from 'next-intl'
import { LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Shared lesson filter: a row of rounded, lesson-colour-tinted pills (icon +
// translated label) that fill with the lesson colour when active. Used wherever
// lessons are filtered inline — the search page and the deck builder. Returns a
// fragment so it composes into the caller's own flex container (which may also
// hold type filters, a drawer trigger, etc.).
//
// `size` covers the two call sites: 'md' (search) and 'sm' (deck builder, the
// tighter text-xs chip).
export function LessonFilterChips({
  selected,
  onToggle,
  size = 'md',
}: {
  selected: string[]
  onToggle: (code: string) => void
  size?: 'sm' | 'md'
}) {
  const locale = useLocale()
  const [hovered, setHovered] = useState<string | null>(null)
  const iconSize = size === 'sm' ? 14 : 16
  return (
    <>
      {LESSONS.map((l) => {
        const active = selected.includes(l.code)
        const isHover = hovered === l.code
        // Inline bg overrides any CSS :hover, so drive the hover tint here:
        // inactive chips get a light lesson-colour wash, active chips lighten
        // slightly. Hex alpha suffix (lesson colours are 6-digit hex).
        const backgroundColor = active
          ? (isHover ? `${l.color}e6` : l.color)
          : (isHover ? `${l.color}22` : 'transparent')
        return (
          <Button
            key={l.code}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={active}
            onClick={() => onToggle(l.code)}
            onMouseEnter={() => setHovered(l.code)}
            onMouseLeave={() => setHovered(null)}
            style={{ borderColor: l.color, color: active ? '#fff' : l.color, backgroundColor }}
            className={cn('gap-1.5 rounded-full transition-colors', size === 'sm' && 'h-7 px-2.5 text-xs')}
          >
            {/* SVGs are filled with the lesson colour; on the active
                (colour-filled) state, force the icon white so it stays legible. */}
            <img
              src={`/lessons/${l.code}.svg`}
              alt=""
              width={iconSize}
              height={iconSize}
              style={{ width: iconSize, height: iconSize, filter: active ? 'brightness(0) invert(1)' : undefined }}
            />
            {attrLabel('lessons', l.code, locale)}
          </Button>
        )
      })}
    </>
  )
}

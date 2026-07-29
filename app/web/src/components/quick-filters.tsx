'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { LessonFilter } from '@/components/lesson-filter'

export function QuickFilters({ locale }: { locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const state = parseSearchParams(new URLSearchParams(params.toString()))

  function apply(patch: Record<string, string | string[] | null>) {
    const next = withParams(new URLSearchParams(params.toString()), patch)
    router.replace(`${pathname}?${next.toString()}`)
  }

  function toggle(key: 'type' | 'lesson', current: string[], code: string) {
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    apply({ [key]: next })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Segmented>
        {TYPES.map((t) => {
          const active = state.types.includes(t.code)
          return (
            <SegmentedItem
              key={t.code}
              active={active}
              onClick={() => toggle('type', state.types, t.code)}
              className={
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-white/5'
              }
            >
              {attrLabel('types', t.code, locale)}
            </SegmentedItem>
          )
        })}
      </Segmented>
      <LessonFilter
        selected={state.lessons}
        onToggle={(code) => toggle('lesson', state.lessons, code)}
      />
    </div>
  )
}

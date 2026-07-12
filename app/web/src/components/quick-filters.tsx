'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'
import { Button } from '@/components/ui/button'
import { LessonFilterChips } from '@/components/lesson-filter-chips'

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
      {TYPES.map((t) => {
        const active = state.types.includes(t.code)
        return (
          <Button
            key={t.code}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => toggle('type', state.types, t.code)}
            className="rounded-full"
          >
            {attrLabel('types', t.code, locale)}
          </Button>
        )
      })}
      <LessonFilterChips
        selected={state.lessons}
        onToggle={(code) => toggle('lesson', state.lessons, code)}
      />
    </div>
  )
}

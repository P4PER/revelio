'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES, LESSONS } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'
import { Button } from '@/components/ui/button'

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
      {LESSONS.map((l) => {
        const active = state.lessons.includes(l.code)
        return (
          <Button
            key={l.code}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={active}
            onClick={() => toggle('lesson', state.lessons, l.code)}
            style={{
              borderColor: l.color,
              color: active ? '#fff' : l.color,
              backgroundColor: active ? l.color : 'transparent',
            }}
            className="rounded-full"
          >
            {attrLabel('lessons', l.code, locale)}
          </Button>
        )
      })}
      <Button
        type="button"
        size="sm"
        variant={state.official === true ? 'default' : 'outline'}
        aria-pressed={state.official === true}
        onClick={() => apply({ official: state.official === true ? null : 'official' })}
        className="rounded-full"
      >
        Official
      </Button>
      <Button
        type="button"
        size="sm"
        variant={state.official === false ? 'default' : 'outline'}
        aria-pressed={state.official === false}
        onClick={() => apply({ official: state.official === false ? null : 'fan' })}
        className="rounded-full"
      >
        Fan / Revival
      </Button>
    </div>
  )
}

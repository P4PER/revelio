'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES, LESSONS } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'

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
          <button
            key={t.code}
            type="button"
            aria-pressed={active}
            onClick={() => toggle('type', state.types, t.code)}
            className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
          >
            {attrLabel('types', t.code, locale)}
          </button>
        )
      })}
      {LESSONS.map((l) => {
        const active = state.lessons.includes(l.code)
        return (
          <button
            key={l.code}
            type="button"
            aria-pressed={active}
            onClick={() => toggle('lesson', state.lessons, l.code)}
            style={{
              borderColor: l.color,
              color: active ? '#fff' : l.color,
              backgroundColor: active ? l.color : 'transparent',
            }}
            className="rounded-full border px-3 py-1 text-sm"
          >
            {attrLabel('lessons', l.code, locale)}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={state.official === true}
        onClick={() => apply({ official: state.official === true ? null : 'official' })}
        className={`rounded-full border px-3 py-1 text-sm ${state.official === true ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
      >
        Official
      </button>
      <button
        type="button"
        aria-pressed={state.official === false}
        onClick={() => apply({ official: state.official === false ? null : 'fan' })}
        className={`rounded-full border px-3 py-1 text-sm ${state.official === false ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground'}`}
      >
        Fan / Revival
      </button>
    </div>
  )
}

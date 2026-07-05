'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { withParams } from '@/lib/search-params'
import { Badge } from '@/components/ui/badge'

type Chip = { key: string; label: string; remove: Record<string, string | string[] | null> }

export function ActiveFilters({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const router = useRouter()
  const params = useSearchParams()

  // Advanced-only chips; Type/Lesson/Official are shown by their quick-filter badges.
  const multi: { param: string; scope?: 'rarities' | 'finishes' | 'legalities' }[] = [
    { param: 'rarity', scope: 'rarities' },
    { param: 'finish', scope: 'finishes' },
    { param: 'legality', scope: 'legalities' },
  ]

  const chips: Chip[] = []
  for (const { param, scope } of multi) {
    const values = params.getAll(param)
    for (const v of values) {
      const label = scope ? attrLabel(scope, v, locale) : v
      chips.push({ key: `${param}:${v}`, label, remove: { [param]: values.filter((x) => x !== v) } })
    }
  }
  const setCode = params.get('set')
  if (setCode) {
    chips.push({ key: `set:${setCode}`, label: sets.find((s) => s.code === setCode)?.name ?? setCode, remove: { set: null } })
  }
  const min = params.get('costMin')
  const max = params.get('costMax')
  if (min || max) chips.push({ key: 'cost', label: `${min ?? '0'}–${max ?? '∞'}`, remove: { costMin: null, costMax: null } })

  if (chips.length === 0) return null

  function remove(patch: Record<string, string | string[] | null>) {
    router.push(`/search?${withParams(new URLSearchParams(params.toString()), patch).toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
          {c.label}
          <button
            type="button"
            aria-label={`remove ${c.label}`}
            onClick={() => remove(c.remove)}
            className="ml-1 cursor-pointer rounded-full px-1 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </Badge>
      ))}
    </div>
  )
}

'use client'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { TYPES } from '@revelio/core'
import { withParams, parseSearchParams } from '@/lib/search-params'
import { attrLabel } from '@/lib/attribute-labels'
import { Chip } from '@/components/ui/chip'
import { LessonFilter } from '@/components/search/lesson-filter'

// The one-click facet lanes above the search results: one labelled row per
// facet, so fourteen chips read as two named groups rather than one wrapping
// wall. The label column is sized to its content and the chips take the rest,
// which keeps both lanes' chips on a shared left edge. `trailing` takes the
// advanced-filter trigger; it sits at the top right of the block instead of
// occupying a row of its own.
export function QuickFilters({ locale, trailing }: { locale: string; trailing?: ReactNode }) {
  const t = useTranslations('filters')
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

  // leading-8 matches the 32px chip height, so a label sits on the same
  // baseline as the first line of its lane.
  const laneLabel = 'text-[11px] leading-8 font-medium tracking-wider text-muted-foreground/75 uppercase'

  return (
    <div className="flex items-start gap-4">
      <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2">
        <span className={laneLabel}>{t('type')}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('type')}>
          {TYPES.map((ty) => {
            const active = state.types.includes(ty.code)
            return (
              <Chip
                key={ty.code}
                active={active}
                onClick={() => toggle('type', state.types, ty.code)}
                className={
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-(--hover-bg) hover:text-accent-foreground'
                }
              >
                {attrLabel('types', ty.code, locale)}
              </Chip>
            )
          })}
        </div>
        <span className={laneLabel}>{t('lesson')}</span>
        <div role="group" aria-label={t('lesson')}>
          <LessonFilter
            selected={state.lessons}
            onToggle={(code) => toggle('lesson', state.lessons, code)}
          />
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}

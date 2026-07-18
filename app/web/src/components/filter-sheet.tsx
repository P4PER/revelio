'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SlidersHorizontal } from 'lucide-react'
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, type SetDTO } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { SetSymbol } from './set-symbol'
import { byReleaseDate } from '@/lib/set-sort'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

// Canonical shape of an advanced-filter selection. Cost values are kept as
// strings (form-friendly, possibly empty); adapters convert to/from their own
// representation at the boundary.
export type OwnershipValue = '' | 'owned' | 'missing' | 'dupes'

export type FilterSelection = {
  types: string[]
  lessons: string[]
  rarities: string[]
  finishes: string[]
  legalities: string[]
  set: string
  costMin: string
  costMax: string
  official: string // '' | 'official' | 'fan'
  owned?: OwnershipValue // collection browse only; omitted by other adapters
}

export const EMPTY_SELECTION: FilterSelection = {
  types: [], lessons: [], rarities: [], finishes: [], legalities: [],
  set: '', costMin: '', costMax: '', official: '',
}

type ListKey = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'
type Grp = { key: ListKey; titleKey: string; options: { code: string }[] }

const ALL_GROUPS: Grp[] = [
  { key: 'types', titleKey: 'type', options: TYPES },
  { key: 'lessons', titleKey: 'lesson', options: LESSONS },
  { key: 'rarities', titleKey: 'rarity', options: RARITIES },
  { key: 'finishes', titleKey: 'finish', options: FINISHES },
  { key: 'legalities', titleKey: 'legality', options: LEGALITIES },
]

// Presentational advanced-filter Sheet: a slider-icon trigger with an
// applied-filter count badge, plus a set select, checkbox groups, and a cost
// range. It owns only the open/draft UI state; the applied selection is passed
// in as `value` and committed via `onApply` (Apply, or an empty selection on
// Clear). Adapters bind it to a data source — the search URL (FilterDrawer) or
// local state (DeckFilterDrawer). `show` toggles the sections only some callers
// need (lessons group; official/fan split).
export function FilterSheet({
  sets, value, locale, onApply, show = {}, size = 'sm',
}: {
  sets: SetDTO[]
  value: FilterSelection
  locale: string
  onApply: (next: FilterSelection) => void
  // `ownership` shows the collection-only owned/missing/dupes facet, drafted and
  // committed as `FilterSelection.owned` like every other filter.
  show?: { lessons?: boolean; official?: boolean; ownership?: boolean }
  // Trigger button height tier — matches the toolbar it sits in.
  size?: 'sm' | 'default'
}) {
  const t = useTranslations('filters')
  const tv = useTranslations('validation')
  const tc = useTranslations('collection')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterSelection>(value)

  const groups = ALL_GROUPS.filter((g) => g.key !== 'lessons' || show.lessons)

  // Both cost bounds set and numeric with min > max → invalid range; block Apply.
  const costInvalid =
    draft.costMin !== '' && draft.costMax !== '' &&
    Number.isFinite(Number(draft.costMin)) && Number.isFinite(Number(draft.costMax)) &&
    Number(draft.costMin) > Number(draft.costMax)

  // Re-seed the pending draft from the applied value each time it opens (a soft
  // navigation doesn't remount, so props may have changed since last open).
  function onOpenChange(next: boolean) {
    if (next) setDraft(value)
    setOpen(next)
  }

  function toggle(key: ListKey, code: string, on: boolean) {
    setDraft((d) => ({ ...d, [key]: on ? [...d[key], code] : d[key].filter((c) => c !== code) }))
  }

  function apply() {
    if (costInvalid) return
    onApply(draft)
    setOpen(false)
  }

  function clearAll() {
    setDraft(EMPTY_SELECTION)
    onApply(EMPTY_SELECTION)
    setOpen(false)
  }

  const officialSets = sets.filter((s) => s.isOfficial).sort(byReleaseDate)
  const fanSets = sets.filter((s) => !s.isOfficial).sort(byReleaseDate)
  const setItem = (s: SetDTO) => (
    <SelectItem key={s.code} value={s.code}>
      <span className="flex items-center gap-2">
        {s.symbol && IMAGE_BASE ? (
          <SetSymbol code={s.code} base={IMAGE_BASE} className="h-4 w-4 shrink-0 text-foreground/80" />
        ) : null}
        {s.name}
      </span>
    </SelectItem>
  )

  // Count of filters currently applied (from `value`, not the pending draft) —
  // the visible groups plus set / cost, and official when that section shows.
  const count =
    groups.reduce((n, g) => n + value[g.key].length, 0) +
    (value.set ? 1 : 0) + (value.costMin ? 1 : 0) + (value.costMax ? 1 : 0) +
    (show.official && value.official ? 1 : 0) +
    (show.ownership && value.owned ? 1 : 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size={size} className="gap-1.5">
          <SlidersHorizontal className="size-3.5" />
          {t('button')}
          {count > 0 && (
            <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.62rem] font-bold text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="w-[340px] overflow-y-auto sm:max-w-none">
        <SheetHeader><SheetTitle>{t('title')}</SheetTitle></SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('set')}</Label>
            <Select value={draft.set || 'any'} onValueChange={(v) => setDraft((d) => ({ ...d, set: v === 'any' ? '' : v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t('anySet')}</SelectItem>
                {officialSets.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t('original')}</SelectLabel>
                      {officialSets.map(setItem)}
                    </SelectGroup>
                  </>
                )}
                {fanSets.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t('fanMade')}</SelectLabel>
                      {fanSets.map(setItem)}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {groups.map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2 text-sm font-medium">{t(g.titleKey)}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {g.options.map((o) => {
                  const id = `${g.key}-${o.code}`
                  const checked = draft[g.key].includes(o.code)
                  return (
                    <div key={o.code} className="flex items-center gap-2">
                      <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(g.key, o.code, v === true)} />
                      <Label htmlFor={id} className="text-sm font-normal">{attrLabel(g.key, o.code, locale)}</Label>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}

          {show.ownership && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{tc('ownership')}</legend>
              <div className="flex flex-wrap gap-2">
                {(['owned', 'missing', 'dupes'] as const).map((v) => (
                  <Button key={v} type="button" size="sm"
                    variant={draft.owned === v ? 'default' : 'outline'}
                    onClick={() => setDraft((d) => ({ ...d, owned: d.owned === v ? '' : v }))}>
                    {tc(v === 'owned' ? 'filterOwned' : v === 'missing' ? 'filterMissing' : 'filterDupes')}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <Label className="mb-2 block text-sm font-medium">{t('cost')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="numeric" aria-label={t('costMin')} placeholder={t('costMin')}
                value={draft.costMin} onChange={(e) => setDraft((d) => ({ ...d, costMin: e.target.value }))} className="w-20"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number" inputMode="numeric" aria-label={t('costMax')} placeholder={t('costMax')}
                value={draft.costMax} onChange={(e) => setDraft((d) => ({ ...d, costMax: e.target.value }))} className="w-20"
              />
            </div>
            <FieldError className="mt-1">{costInvalid ? tv('costRange') : ''}</FieldError>
          </div>

          {show.official && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id="f-official" checked={draft.official === 'official'} onCheckedChange={(v) => setDraft((d) => ({ ...d, official: v === true ? 'official' : '' }))} />
                <Label htmlFor="f-official" className="text-sm font-normal">{t('official')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="f-fan" checked={draft.official === 'fan'} onCheckedChange={(v) => setDraft((d) => ({ ...d, official: v === true ? 'fan' : '' }))} />
                <Label htmlFor="f-fan" className="text-sm font-normal">{t('fan')}</Label>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button onClick={apply} className="flex-1">{t('apply')}</Button>
          <Button variant="ghost" onClick={clearAll}>{t('clear')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

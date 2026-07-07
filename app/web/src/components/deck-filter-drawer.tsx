'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { SlidersHorizontal } from 'lucide-react'
import { TYPES, RARITIES, FINISHES, LEGALITIES, type SetDTO } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { SetSymbol } from './set-symbol'
import { byReleaseDate } from '@/lib/set-sort'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export type DeckFilters = {
  set: string
  types: string[]
  rarities: string[]
  finishes: string[]
  legalities: string[]
  costMin: number | null
  costMax: number | null
}

export const EMPTY_DECK_FILTERS: DeckFilters = {
  set: '', types: [], rarities: [], finishes: [], legalities: [], costMin: null, costMax: null,
}

export function activeFilterCount(f: DeckFilters): number {
  return f.types.length + f.rarities.length + f.finishes.length + f.legalities.length +
    (f.set ? 1 : 0) + (f.costMin != null ? 1 : 0) + (f.costMax != null ? 1 : 0)
}

type ListKey = 'types' | 'rarities' | 'finishes' | 'legalities'
type Grp = { key: ListKey; titleKey: string; options: { code: string }[] }

// Local-state advanced-filter Sheet for the deck builder's card browser. Unlike
// the site-wide FilterDrawer (which drives the /search URL), this keeps a
// pending selection in local state and hands the applied DeckFilters back to
// the browser via onApply — the browser owns the search. Lessons and the
// official/fan split are intentionally excluded: lessons are the quick-filter
// buttons and official/fan is decided by the deck format.
export function DeckFilterDrawer({
  sets, value, onApply,
}: {
  sets: SetDTO[]
  value: DeckFilters
  onApply: (next: DeckFilters) => void
}) {
  const t = useTranslations('filters')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DeckFilters>(value)

  const groups: Grp[] = [
    { key: 'types', titleKey: 'type', options: TYPES },
    { key: 'rarities', titleKey: 'rarity', options: RARITIES },
    { key: 'finishes', titleKey: 'finish', options: FINISHES },
    { key: 'legalities', titleKey: 'legality', options: LEGALITIES },
  ]

  // Re-seed the pending draft from the applied filters each time it opens.
  function onOpenChange(next: boolean) {
    if (next) setDraft(value)
    setOpen(next)
  }

  function toggle(key: ListKey, code: string, on: boolean) {
    setDraft((d) => ({ ...d, [key]: on ? [...d[key], code] : d[key].filter((c) => c !== code) }))
  }

  function apply() {
    onApply(draft)
    setOpen(false)
  }

  function clearAll() {
    setDraft(EMPTY_DECK_FILTERS)
    onApply(EMPTY_DECK_FILTERS)
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

  const count = activeFilterCount(value)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
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
                  const id = `deck-${g.key}-${o.code}`
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

          <div>
            <Label className="mb-2 block text-sm font-medium">{t('cost')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="numeric" aria-label={t('costMin')} placeholder={t('costMin')}
                value={draft.costMin ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, costMin: e.target.value === '' ? null : Number(e.target.value) }))}
                className="w-20"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number" inputMode="numeric" aria-label={t('costMax')} placeholder={t('costMax')}
                value={draft.costMax ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, costMax: e.target.value === '' ? null : Number(e.target.value) }))}
                className="w-20"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button onClick={apply} className="flex-1">{t('apply')}</Button>
          <Button variant="ghost" onClick={clearAll}>{t('clear')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

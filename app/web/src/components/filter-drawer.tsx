'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import {
  TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, type SetDTO,
} from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const humanize = (c: string) => c.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

type Grp = { param: string; titleKey: string; options: { code: string }[]; label: (c: string) => string }

export function FilterDrawer({ sets, locale }: { sets: SetDTO[]; locale: string }) {
  const t = useTranslations('filters')
  const router = useRouter()
  const params = useSearchParams()

  const groups: Grp[] = [
    { param: 'type', titleKey: 'type', options: TYPES, label: (c) => attrLabel('types', c, locale) },
    { param: 'lesson', titleKey: 'lesson', options: LESSONS, label: (c) => attrLabel('lessons', c, locale) },
    { param: 'rarity', titleKey: 'rarity', options: RARITIES, label: (c) => attrLabel('rarities', c, locale) },
    { param: 'finish', titleKey: 'finish', options: FINISHES, label: (c) => attrLabel('finishes', c, locale) },
    { param: 'legality', titleKey: 'legality', options: LEGALITIES, label: (c) => humanize(c) },
  ]

  // pending state seeded from the URL
  const [multi, setMulti] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.param, params.getAll(g.param)])),
  )
  const [set, setSet] = useState(params.get('set') ?? '')
  const [costMin, setCostMin] = useState(params.get('costMin') ?? '')
  const [costMax, setCostMax] = useState(params.get('costMax') ?? '')
  const [open, setOpen] = useState(false)

  // Soft navigations (router.push to /search) don't remount this component, so
  // re-seed the pending selection from the current URL each time the drawer opens.
  function onOpenChange(next: boolean) {
    if (next) {
      setMulti(Object.fromEntries(groups.map((g) => [g.param, params.getAll(g.param)])))
      setSet(params.get('set') ?? '')
      setCostMin(params.get('costMin') ?? '')
      setCostMax(params.get('costMax') ?? '')
    }
    setOpen(next)
  }

  function toggle(param: string, code: string, on: boolean) {
    setMulti((m) => ({ ...m, [param]: on ? [...m[param], code] : m[param].filter((c) => c !== code) }))
  }

  function apply() {
    const next = new URLSearchParams()
    if (params.get('q')) next.set('q', params.get('q')!)
    if (params.get('sort')) next.set('sort', params.get('sort')!)
    for (const g of groups) for (const c of multi[g.param]) next.append(g.param, c)
    if (set) next.set('set', set)
    if (costMin) next.set('costMin', costMin)
    if (costMax) next.set('costMax', costMax)
    router.push(`/search?${next.toString()}`)
    setOpen(false)
  }

  function clearAll() {
    setMulti(Object.fromEntries(groups.map((g) => [g.param, []])))
    setSet(''); setCostMin(''); setCostMax('')
    const q = params.get('q')
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">{t('button')}</Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="w-[340px] overflow-y-auto sm:max-w-none">
        <SheetHeader><SheetTitle>{t('title')}</SheetTitle></SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div>
            <Label className="mb-2 block text-sm font-medium">{t('set')}</Label>
            <Select value={set || 'any'} onValueChange={(v) => setSet(v === 'any' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t('anySet')}</SelectItem>
                {sets.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {groups.map((g) => (
            <fieldset key={g.param}>
              <legend className="mb-2 text-sm font-medium">{t(g.titleKey)}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {g.options.map((o) => {
                  const id = `${g.param}-${o.code}`
                  const checked = multi[g.param].includes(o.code)
                  return (
                    <div key={o.code} className="flex items-center gap-2">
                      <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(g.param, o.code, v === true)} />
                      <Label htmlFor={id} className="text-sm font-normal">{g.label(o.code)}</Label>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <div>
            <Label className="mb-2 block text-sm font-medium">{t('cost')}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" aria-label={t('costMin')} placeholder={t('costMin')} value={costMin} onChange={(e) => setCostMin(e.target.value)} className="w-20" />
              <span className="text-muted-foreground">–</span>
              <Input type="number" inputMode="numeric" aria-label={t('costMax')} placeholder={t('costMax')} value={costMax} onChange={(e) => setCostMax(e.target.value)} className="w-20" />
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

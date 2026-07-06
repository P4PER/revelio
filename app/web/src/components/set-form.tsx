'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { createSetAction, updateSetAction } from '@/lib/set-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'

export type SetFormInitial = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

export function SetForm({
  mode,
  locales,
  initial,
}: {
  mode: 'create' | 'edit'
  locales: string[]
  initial: SetFormInitial
}) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [releaseDate, setReleaseDate] = useState(initial.releaseDate)
  const [isOfficial, setIsOfficial] = useState(initial.isOfficial)
  const [locNames, setLocNames] = useState<Record<string, string>>(
    () => Object.fromEntries(locales.map((l) => [l, initial.localizations[l] ?? ''])),
  )
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const payload = { name, releaseDate, isOfficial, localizations: locNames }
    const res =
      mode === 'create'
        ? await createSetAction({ code, ...payload })
        : await updateSetAction(code, payload)
    setBusy(false)
    if (res.ok) {
      toast.success(t(mode === 'create' ? 'created' : 'updated'))
      if (mode === 'create') router.push('/admin/sets')
      else router.refresh()
    } else {
      toast.error(res.error === 'exists' ? t('codeExists') : t('saveError'))
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="set-code">{t('code')}</Label>
        <Input
          id="set-code"
          value={code}
          disabled={mode === 'edit'}
          onChange={(e) => setCode(e.target.value)}
          aria-label={t('code')}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="set-name">{t('name')}</Label>
        <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('name')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="set-date">{t('releaseDate')}</Label>
        <DatePicker
          id="set-date"
          value={releaseDate}
          onChange={setReleaseDate}
          ariaLabel={t('releaseDate')}
          placeholder={t('releaseDate')}
        />
      </div>
      <label className="flex items-center gap-2">
        <Checkbox checked={isOfficial} onCheckedChange={(v) => setIsOfficial(v === true)} />
        <span className="text-sm">{t('official')}</span>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('localizedNames')}</legend>
        {locales.map((l) => (
          <div key={l} className="space-y-1.5">
            <Label htmlFor={`loc-${l}`}>{l.toUpperCase()}</Label>
            <Input
              id={`loc-${l}`}
              value={locNames[l] ?? ''}
              onChange={(e) => setLocNames((v) => ({ ...v, [l]: e.target.value }))}
              aria-label={l.toUpperCase()}
            />
          </div>
        ))}
      </fieldset>

      <Button onClick={submit} disabled={busy}>
        {t(mode === 'create' ? 'create' : 'save')}
      </Button>
    </div>
  )
}

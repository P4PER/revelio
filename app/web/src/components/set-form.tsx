'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { createSetAction, updateSetAction, uploadSetSymbol } from '@/lib/set-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import { ImagePlus, Trash2 } from 'lucide-react'

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
  const [symbolFile, setSymbolFile] = useState<File | null>(null)
  const symbolInputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(() => (symbolFile ? URL.createObjectURL(symbolFile) : null), [symbolFile])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function submit() {
    setBusy(true)
    try {
      const payload = { name, releaseDate, isOfficial, localizations: locNames }
      const res =
        mode === 'create'
          ? await createSetAction({ code, ...payload })
          : await updateSetAction(code, payload)
      if (res.ok && mode === 'create' && symbolFile) {
        try {
          const fd = new FormData()
          fd.append('code', code)
          fd.append('file', symbolFile)
          const up = await uploadSetSymbol(fd)
          if (!up.ok) toast.warning(t('saveError'))
        } catch {
          toast.warning(t('saveError')) // set was created; only the symbol upload failed
        }
      }
      if (res.ok) {
        toast.success(t(mode === 'create' ? 'created' : 'updated'))
        if (mode === 'create') router.push('/admin/sets')
        else router.refresh()
      } else {
        toast.error(res.error === 'exists' ? t('codeExists') : t('saveError'))
      }
    } finally {
      setBusy(false)
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

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label>{t('symbol')}</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => symbolInputRef.current?.click()}
              aria-label={t('uploadSymbol')}
              className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-card"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview
                <img src={previewUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="size-5 text-muted-foreground" />
              )}
            </button>
            <input
              ref={symbolInputRef}
              type="file"
              accept="image/*"
              aria-label={t('uploadSymbol')}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setSymbolFile(f)
                e.target.value = ''
              }}
            />
            {symbolFile && (
              <button
                type="button"
                onClick={() => setSymbolFile(null)}
                className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {t('removeSymbol')}
              </button>
            )}
          </div>
        </div>
      )}

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

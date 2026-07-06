'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { saveSubTypeTranslationsAction } from '@/lib/sub-type-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Row = { code: string; labels: Record<string, string> }

export function SubTypeTranslationsForm({ locales, rows }: { locales: string[]; rows: Row[] }) {
  const t = useTranslations('admin')
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(rows.map((r) => [r.code, { ...r.labels }])),
  )
  const [busy, setBusy] = useState(false)

  function setCell(code: string, lang: string, label: string) {
    setValues((v) => ({ ...v, [code]: { ...v[code], [lang]: label } }))
  }

  async function save() {
    setBusy(true)
    const payload = rows.flatMap((r) =>
      locales.map((lang) => ({ code: r.code, lang, label: values[r.code]?.[lang] ?? '' })),
    )
    const res = await saveSubTypeTranslationsAction({ rows: payload })
    setBusy(false)
    if (res.ok) toast.success(t('saved'))
    else toast.error(t('saveError'))
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">{t('code')}</th>
              {locales.map((l) => <th key={l} className="px-3 py-2 font-medium">{l.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.code}</td>
                {locales.map((lang) => (
                  <td key={lang} className="px-3 py-2">
                    <Input
                      value={values[r.code]?.[lang] ?? ''}
                      onChange={(e) => setCell(r.code, lang, e.target.value)}
                      aria-label={`${r.code} ${lang}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={save} disabled={busy}>{t('save')}</Button>
    </div>
  )
}

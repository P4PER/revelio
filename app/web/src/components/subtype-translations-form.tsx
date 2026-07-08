'use client'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useRouter } from '@/../i18n/navigation'
import { saveSubTypeTranslationsAction } from '@/lib/sub-type-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type Row = { code: string; labels: Record<string, string> }

export function SubTypeTranslationsForm({ locales, rows }: { locales: string[]; rows: Row[] }) {
  const t = useTranslations('admin')
  const router = useRouter()
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(rows.map((r) => [r.code, { ...r.labels }])),
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyUntranslated, setOnlyUntranslated] = useState(false)
  const [untranslatedFirst, setUntranslatedFirst] = useState(false)
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  function setCell(code: string, lang: string, label: string) {
    setValues((v) => ({ ...v, [code]: { ...v[code], [lang]: label } }))
  }

  // Filter and sort from the LOADED labels, not the live inputs, so the row you
  // are editing doesn't vanish or jump while you type. The view re-evaluates
  // after a save (router.refresh reloads `rows`).
  const visible = useMemo(() => {
    const untranslated = (r: Row) =>
      locales.some((lang) => (r.labels[lang] ?? '').trim() === '')
    const q = query.trim().toLowerCase()
    let list = rows
    if (q) {
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          locales.some((lang) => (r.labels[lang] ?? '').toLowerCase().includes(q)),
      )
    }
    if (onlyUntranslated) list = list.filter((r) => untranslated(r))
    return [...list].sort((a, b) => {
      if (untranslatedFirst) {
        const ua = untranslated(a) ? 0 : 1
        const ub = untranslated(b) ? 0 : 1
        if (ua !== ub) return ua - ub
      }
      return dir === 'asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code)
    })
  }, [rows, locales, query, onlyUntranslated, untranslatedFirst, dir])

  async function save() {
    setBusy(true)
    setSaveError('')
    // Send the full matrix (not just the filtered view) so every cell is persisted.
    const payload = rows.flatMap((r) =>
      locales.map((lang) => ({ code: r.code, lang, label: values[r.code]?.[lang] ?? '' })),
    )
    const res = await saveSubTypeTranslationsAction({ rows: payload })
    setBusy(false)
    if (res.ok) {
      toast.success(t('saved'))
      router.refresh() // reload `rows` so the filter/sort reflect the saved state
    } else {
      setSaveError(t('saveError'))
      toast.error(t('saveError'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-8 w-full pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={onlyUntranslated ? 'secondary' : 'outline'}
          aria-pressed={onlyUntranslated}
          onClick={() => setOnlyUntranslated((v) => !v)}
        >
          {t('onlyUntranslated')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={untranslatedFirst ? 'secondary' : 'outline'}
          aria-pressed={untranslatedFirst}
          onClick={() => setUntranslatedFirst((v) => !v)}
        >
          {t('untranslatedFirst')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table containerClassName="max-h-[70vh]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-muted">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  {t('code')}
                  {dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                </button>
              </TableHead>
              {locales.map((l) => (
                <TableHead key={l}>{l.toUpperCase()}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.code}>
                <TableCell className="sticky left-0 z-10 bg-background font-mono text-muted-foreground">
                  {r.code}
                </TableCell>
                {locales.map((lang) => (
                  <TableCell key={lang}>
                    <Input
                      value={values[r.code]?.[lang] ?? ''}
                      onChange={(e) => setCell(r.code, lang, e.target.value)}
                      aria-label={`${r.code} ${lang}`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={locales.length + 1}
                  className="py-6 text-center text-muted-foreground"
                >
                  {t('noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1.5">
        <Button onClick={save} disabled={busy}>{t('save')}</Button>
        <FieldError>{saveError}</FieldError>
      </div>
    </div>
  )
}

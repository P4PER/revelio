'use client'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { saveRulingsAction, type RulingsSaveResult } from '@/lib/rulings-actions'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DatePicker } from '@/components/date-picker'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

type Row = { key: string; id: string | null; date: string; source: string; text: string }
type Initial = { id: string; date: string; source: string; text: string }

export type RulingsEditorHandle = { save: () => Promise<RulingsSaveResult> }

let counter = 0
const nextKey = () => `new-${counter++}`

export function RulingsEditor({
  cardId,
  lang,
  initial,
  sources = [],
  embedded = false,
  ref,
}: {
  cardId: string
  lang: string
  initial: Initial[]
  sources?: string[]
  embedded?: boolean
  ref?: React.Ref<RulingsEditorHandle>
}) {
  const t = useTranslations('edit')
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(
    initial.map((r) => ({ key: r.id, id: r.id, date: r.date, source: r.source, text: r.text })),
  )
  const [busy, setBusy] = useState(false)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingScrollKey = useRef<string | null>(null)

  // After a newly added ruling has rendered, scroll it into view and focus its
  // first field so the editor lands on the new entry.
  useEffect(() => {
    const key = pendingScrollKey.current
    if (!key) return
    const el = rowRefs.current.get(key)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector('input')?.focus()
    pendingScrollKey.current = null
  }, [rows])

  function addRuling() {
    const key = nextKey()
    pendingScrollKey.current = key
    setRows((rs) => [...rs, { key, id: null, date: '', source: '', text: '' }])
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function move(index: number, delta: number) {
    setRows((rs) => {
      const next = [...rs]
      const j = index + delta
      if (j < 0 || j >= next.length) return rs
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  // Persist the rulings; returns the result without side effects so an
  // embedding parent (CardEditForm) can orchestrate one shared Save.
  async function save(): Promise<RulingsSaveResult> {
    return saveRulingsAction({
      cardId,
      lang,
      rulings: rows.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })),
    })
  }

  useImperativeHandle(ref, () => ({ save }))

  async function onSave() {
    setBusy(true)
    try {
      const res = await save()
      if (!res.ok) return toast.error(t('rulingsFailed'))
      toast.success(t('rulingsSaved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('rulings')}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRuling}
        >
          {t('addRuling')}
        </Button>
      </div>

      {rows.map((r, i) => (
        <div
          key={r.key}
          ref={(el) => {
            if (el) rowRefs.current.set(r.key, el)
            else rowRefs.current.delete(r.key)
          }}
          className="space-y-3 rounded-md border p-4"
        >
          <div className="flex items-start justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('moveUp')}
              onClick={() => move(i, -1)}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('moveDown')}
              onClick={() => move(i, 1)}
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('removeRuling')}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingDate')}</span>
              <DatePicker
                value={r.date}
                onChange={(v) => update(r.key, { date: v })}
                ariaLabel={t('rulingDate')}
                placeholder={t('rulingDate')}
              />
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingSource')}</span>
              <Select value={r.source} onValueChange={(v) => update(r.key, { source: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('rulingSource')} />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('rulingText')}</span>
            <AutoTextarea
              aria-label={t('rulingText')}
              value={r.text}
              onChange={(e) => update(r.key, { text: e.target.value })}
            />
          </label>
        </div>
      ))}

      {!embedded && (
        <Button type="button" disabled={busy} onClick={onSave}>
          {t('saveRulings')}
        </Button>
      )}
    </section>
  )
}

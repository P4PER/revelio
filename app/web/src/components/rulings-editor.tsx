'use client'
import { useImperativeHandle, useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { saveRulingsAction, type RulingsSaveResult } from '@/lib/rulings-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'

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
          onClick={() =>
            setRows((rs) => [
              ...rs,
              { key: nextKey(), id: null, date: '', source: '', text: '' },
            ])
          }
        >
          {t('addRuling')}
        </Button>
      </div>

      <datalist id="ruling-sources">
        {sources.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {rows.map((r, i) => (
        <div key={r.key} className="space-y-3 rounded-md border p-4">
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
            <label className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingDate')}</span>
              <Input
                type="date"
                value={r.date}
                onChange={(e) => update(r.key, { date: e.target.value })}
              />
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-sm font-medium">{t('rulingSource')}</span>
              <Input
                list="ruling-sources"
                value={r.source}
                onChange={(e) => update(r.key, { source: e.target.value })}
              />
            </label>
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

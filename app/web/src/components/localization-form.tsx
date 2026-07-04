'use client'
import { useState } from 'react'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2, TriangleAlert, CircleX } from 'lucide-react'
import { updateLocalization } from '@/lib/localization-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

type Feedback = { kind: 'success' | 'warning' | 'error'; text: string }

type Initial = { name: string; text: string; flavorText: string; status: 'machine' | 'official' }

export function LocalizationForm({ cardId, lang, initial }: { cardId: string; lang: string; initial: Initial }) {
  const t = useTranslations('edit')
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [text, setText] = useState(initial.text)
  const [flavorText, setFlavor] = useState(initial.flavorText)
  const [status, setStatus] = useState<'machine' | 'official'>(initial.status)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    if (!name.trim()) return setFeedback({ kind: 'error', text: t('invalid') })
    setBusy(true)
    const res = await updateLocalization({ cardId, lang, name, text, flavorText, status })
    setBusy(false)
    if (!res.ok) return setFeedback({ kind: 'error', text: t('invalid') })
    setFeedback(
      res.warning
        ? { kind: 'warning', text: t('reindexWarning') }
        : { kind: 'success', text: t('saved') },
    )
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('text')}</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('flavor')}</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={flavorText}
          onChange={(e) => setFlavor(e.target.value)}
        />
      </label>
      <div className="space-y-1">
        <span className="text-sm font-medium">{t('status')}</span>
        <Select value={status} onValueChange={(v) => setStatus(v as 'machine' | 'official')}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="machine">{t('statusMachine')}</SelectItem>
            <SelectItem value="official">{t('statusOfficial')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>{t('save')}</Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/card/${cardId}`}>{t('cancel')}</Link>
        </Button>
      </div>
      {feedback && (
        <Alert variant={feedback.kind === 'error' ? 'destructive' : 'default'}>
          {feedback.kind === 'success' && <CheckCircle2 className="text-emerald-600" />}
          {feedback.kind === 'warning' && <TriangleAlert className="text-amber-600" />}
          {feedback.kind === 'error' && <CircleX />}
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

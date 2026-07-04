'use client'
import { useState } from 'react'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateLocalization } from '@/lib/localization-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

type Initial = {
  name: string
  text: string
  flavorText: string
  status: 'machine' | 'official'
  adventure: { effect: string; reward: string; toSolve: string }
  match: { prize: string; toWin: string }
}

export function LocalizationForm({
  cardId, lang, initial, kind,
}: {
  cardId: string
  lang: string
  initial: Initial
  kind: 'adventure' | 'match' | null
}) {
  const t = useTranslations('edit')
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [text, setText] = useState(initial.text)
  const [flavorText, setFlavor] = useState(initial.flavorText)
  const [status, setStatus] = useState<'machine' | 'official'>(initial.status)
  const [adventure, setAdventure] = useState(initial.adventure)
  const [match, setMatch] = useState(initial.match)
  const [busy, setBusy] = useState(false)

  const dirty =
    name !== initial.name ||
    text !== initial.text ||
    flavorText !== initial.flavorText ||
    status !== initial.status ||
    JSON.stringify(adventure) !== JSON.stringify(initial.adventure) ||
    JSON.stringify(match) !== JSON.stringify(initial.match)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error(t('invalid'))
    setBusy(true)
    const res = await updateLocalization({
      cardId, lang, name, text, flavorText, status,
      ...(kind === 'adventure' ? { adventure } : {}),
      ...(kind === 'match' ? { match } : {}),
    })
    setBusy(false)
    if (!res.ok) return toast.error(t('invalid'))
    if (res.warning) toast.warning(t('reindexWarning'))
    else toast.success(t('saved'))
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {kind === null && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('text')}</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('flavor')}</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={flavorText}
          onChange={(e) => setFlavor(e.target.value)}
        />
      </label>
      {kind === 'adventure' && (
        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">{t('adventure')}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('effect')}</span>
            <textarea
              aria-label={t('effect')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.effect}
              onChange={(e) => setAdventure({ ...adventure, effect: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('toSolve')}</span>
            <textarea
              aria-label={t('toSolve')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.toSolve}
              onChange={(e) => setAdventure({ ...adventure, toSolve: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('reward')}</span>
            <textarea
              aria-label={t('reward')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.reward}
              onChange={(e) => setAdventure({ ...adventure, reward: e.target.value })}
            />
          </label>
        </fieldset>
      )}
      {kind === 'match' && (
        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">{t('match')}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('prize')}</span>
            <textarea
              aria-label={t('prize')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={match.prize}
              onChange={(e) => setMatch({ ...match, prize: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('toWin')}</span>
            <textarea
              aria-label={t('toWin')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={match.toWin}
              onChange={(e) => setMatch({ ...match, toWin: e.target.value })}
            />
          </label>
        </fieldset>
      )}
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
        <Button type="submit" disabled={busy || !dirty}>{t('save')}</Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/card/${cardId}`}>{t('cancel')}</Link>
        </Button>
      </div>
    </form>
  )
}

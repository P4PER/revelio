'use client'
import { useRef, useState } from 'react'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { LocalizationForm, type LocalizationFormHandle } from './localization-form'
import { RulingsEditor, type RulingsEditorHandle } from './rulings-editor'
import { Button } from '@/components/ui/button'

type LocInitial = {
  name: string
  text: string
  flavorText: string
  status: 'machine' | 'official'
  adventure: { effect: string; reward: string; toSolve: string }
  match: { prize: string; toWin: string }
}
type RulingInitial = { id: string; date: string; source: string; text: string }

// Orchestrates one shared Save/Cancel for the whole edit page: the localization
// and the rulings are written together on a single click.
export function CardEditForm({
  cardId,
  lang,
  locInitial,
  kind,
  rulingsInitial,
  sources,
}: {
  cardId: string
  lang: string
  locInitial: LocInitial
  kind: 'adventure' | 'match' | null
  rulingsInitial: RulingInitial[]
  sources: string[]
}) {
  const t = useTranslations('edit')
  const router = useRouter()
  const locRef = useRef<LocalizationFormHandle>(null)
  const rulRef = useRef<RulingsEditorHandle>(null)
  const [busy, setBusy] = useState(false)

  async function onSave() {
    setBusy(true)
    try {
      const loc = await locRef.current!.save()
      if (!loc.ok) return toast.error(t('invalid'))
      const rulings = await rulRef.current!.save()
      if (!rulings.ok) return toast.error(t('rulingsFailed'))
      if (loc.warning) toast.warning(t('reindexWarning'))
      else toast.success(t('saved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <LocalizationForm ref={locRef} embedded cardId={cardId} lang={lang} initial={locInitial} kind={kind} />
      <RulingsEditor ref={rulRef} embedded cardId={cardId} lang={lang} initial={rulingsInitial} sources={sources} />
      <div className="flex items-center gap-2 border-t pt-6">
        <Button type="button" disabled={busy} onClick={onSave}>{t('save')}</Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/card/${cardId}`}>{t('cancel')}</Link>
        </Button>
      </div>
    </div>
  )
}

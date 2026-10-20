'use client'
import { useRef, useState } from 'react'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { LocalizationForm, type LocalizationFormHandle } from '@/components/card/localization-form'
import { RulingsEditor, type RulingsEditorHandle } from '@/components/card/rulings-editor'
import { saveCardEditAction } from '@/lib/actions/card-edit-actions'
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
// and the rulings go to one action, which writes both in one transaction.
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
      // Both sections run, so both show their inline errors; focus goes to the
      // first invalid field in page order.
      const locValid = await locRef.current!.validate(true)
      const rulingsValid = await rulRef.current!.validate(locValid)
      if (!locValid || !rulingsValid) return toast.error(t('invalid'))
      const res = await saveCardEditAction({
        cardId,
        lang,
        localization: locRef.current!.values(),
        rulings: rulRef.current!.values(),
      })
      if (!res.ok) return toast.error(t('saveFailed'))
      if (res.warning) toast.warning(t('reindexWarning'))
      else toast.success(t('saved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <LocalizationForm ref={locRef} initial={locInitial} kind={kind} />
      <RulingsEditor ref={rulRef} initial={rulingsInitial} sources={sources} />
      <div className="flex items-center gap-2 border-t pt-6">
        <Button type="button" disabled={busy} onClick={onSave}>{t('save')}</Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/card/${cardId}`}>{t('cancel')}</Link>
        </Button>
      </div>
    </div>
  )
}

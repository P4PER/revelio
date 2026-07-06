'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { useRouter } from '@/../i18n/navigation'
import { deleteSetAction } from '@/lib/set-actions'
import { Button } from '@/components/ui/button'

export function DeleteSetButton({ code, cardCount }: { code: string; cardCount: number }) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const blocked = cardCount > 0

  async function onDelete() {
    setBusy(true)
    const res = await deleteSetAction(code)
    setBusy(false)
    if (res.ok) {
      toast.success(t('deleted'))
      router.push('/admin/sets')
    } else {
      // 'has-cards' is a defensive fallback: the button is disabled whenever
      // cardCount > 0, so this branch only fires if the count went stale
      // (e.g. a card was added to the set between page load and this click).
      toast.error(res.error === 'has-cards' ? t('deleteBlocked') : t('saveError'))
    }
  }

  return (
    <div className="space-y-1.5">
      <Button variant="destructive" onClick={onDelete} disabled={busy || blocked} className="gap-1.5">
        <Trash2 className="size-4" />
        {t('delete')}
      </Button>
      {blocked ? <p className="text-xs text-muted-foreground">{t('deleteBlocked')}</p> : null}
    </div>
  )
}

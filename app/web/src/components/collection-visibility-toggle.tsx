'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { setCollectionVisibilityAction } from '@/lib/collection-actions'

export function CollectionVisibilityToggle({
  initial, shareUrl,
}: {
  initial: 'private' | 'public'
  shareUrl: string
}) {
  const t = useTranslations('collection')
  const [vis, setVis] = useState(initial)
  const [pending, start] = useTransition()

  function toggle() {
    const next = vis === 'public' ? 'private' : 'public'
    setVis(next)
    start(async () => {
      const res = await setCollectionVisibilityAction(next)
      if (!res.ok) setVis(vis)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
        {vis === 'public' ? t('public') : t('private')}
      </Button>
      {vis === 'public' && (
        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(shareUrl)}>
          {t('shareLink')}
        </Button>
      )}
    </div>
  )
}

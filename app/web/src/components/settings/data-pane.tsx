'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { exportMyData } from '@/lib/settings-actions'
import { Button } from '@/components/ui/button'
import type { SettingsUser } from './types'

export function DataPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.data')
  const [pending, start] = useTransition()

  function onExport() {
    start(async () => {
      try {
        const res = await exportMyData()
        if (!res.ok) {
          toast.error(t('exportError'))
          return
        }
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `revelio-export-${user.username ?? user.id}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        toast.error(t('exportError'))
      }
    })
  }

  return (
    <section aria-labelledby="s-data" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-data" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('hint')}</p>
      <Button type="button" size="sm" onClick={onExport} disabled={pending}>{pending ? t('exporting') : t('export')}</Button>
    </section>
  )
}

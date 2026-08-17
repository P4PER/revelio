import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { SettingsNav } from '@/components/settings/settings-nav'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('settings')
  const session = await getSession()
  return (
    <div className="mx-auto max-w-[76rem] px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <div className="mt-6 flex flex-col gap-6 min-[1024px]:flex-row min-[1024px]:gap-8">
        <SettingsNav isLoggedIn={!!session?.user} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

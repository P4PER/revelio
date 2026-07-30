'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SettingsNav } from './settings-nav'
import type { SettingsSection, SettingsUser } from './types'

export function SettingsShell({ user }: { user: SettingsUser }) {
  const [active, setActive] = useState<SettingsSection>('profile')
  const t = useTranslations('settings')
  // Panes are filled in by later tasks; placeholders keep each section reachable.
  void user
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <div className="mt-6 flex flex-col gap-6 min-[1024px]:flex-row min-[1024px]:gap-8">
        <SettingsNav active={active} onSelect={setActive} />
        <div className="min-w-0 flex-1">
          {active === 'profile' && <section aria-labelledby="s-profile"><h2 id="s-profile">{t('profile.title')}</h2></section>}
          {active === 'email' && <section aria-labelledby="s-email"><h2 id="s-email">{t('email.title')}</h2></section>}
          {active === 'data' && <section aria-labelledby="s-data"><h2 id="s-data">{t('data.title')}</h2></section>}
          {active === 'danger' && <section aria-labelledby="s-danger"><h2 id="s-danger">{t('danger.title')}</h2></section>}
        </div>
      </div>
    </div>
  )
}

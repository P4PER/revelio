'use client'
import { useTranslations } from 'next-intl'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { cn } from '@/lib/utils'
import type { SettingsSection } from './types'

const SECTIONS: SettingsSection[] = ['profile', 'email', 'data', 'danger']

function NavList({ active, onSelect }: { active: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const t = useTranslations('settings.nav')
  return (
    <nav className="flex flex-col gap-1">
      {SECTIONS.map((s) => {
        const on = s === active
        const danger = s === 'danger'
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSelect(s)}
            data-active={on}
            className={cn(
              'rounded-lg px-3 py-2 text-left text-sm transition-colors',
              on
                ? cn(
                    'font-semibold text-foreground',
                    danger
                      ? 'bg-gradient-to-r from-destructive/20 to-destructive/5 shadow-[inset_3px_0_0_var(--color-destructive)]'
                      : 'bg-gradient-to-r from-accent/25 to-accent/10 shadow-[inset_3px_0_0_var(--color-primary)]',
                  )
                : cn('font-medium hover:bg-accent/50', danger && 'text-destructive'),
            )}
          >
            {t(s)}
          </button>
        )
      })}
    </nav>
  )
}

export function SettingsNav({ active, onSelect }: { active: SettingsSection; onSelect: (s: SettingsSection) => void }) {
  const t = useTranslations('settings')
  return (
    <ResponsiveSidebar
      title={t('menuTitle')}
      railClassName="w-64"
      drawerClassName="w-72"
      rail={<NavList active={active} onSelect={onSelect} />}
      drawer={(close) => <NavList active={active} onSelect={(s) => { onSelect(s); close() }} />}
    />
  )
}

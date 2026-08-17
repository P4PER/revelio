'use client'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { cn } from '@/lib/utils'
import type { SettingsSection } from './types'

const SECTIONS: SettingsSection[] = ['profile', 'email', 'data', 'danger']

function NavList({ onSelect }: { onSelect?: () => void }) {
  const t = useTranslations('settings.nav')
  const pathname = usePathname() // locale-stripped, e.g. /settings/email
  const active = SECTIONS.find((s) => pathname === `/settings/${s}`) ?? 'profile'
  return (
    <nav className="flex flex-col gap-1">
      {SECTIONS.map((s) => {
        const on = s === active
        const danger = s === 'danger'
        return (
          <Link
            key={s}
            href={`/settings/${s}`}
            onClick={onSelect}
            data-active={on}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm transition-colors',
              on
                ? cn(
                    'font-semibold text-foreground',
                    danger
                      ? 'bg-gradient-to-r from-destructive/20 to-destructive/5 shadow-[inset_3px_0_0_var(--color-destructive)]'
                      : 'bg-gradient-to-r from-(--hover-bg) to-transparent shadow-[inset_3px_0_0_var(--color-primary)]',
                  )
                : cn('font-medium hover:bg-(--hover-bg)', danger && 'text-destructive'),
            )}
          >
            {t(s)}
          </Link>
        )
      })}
    </nav>
  )
}

export function SettingsNav() {
  const t = useTranslations('settings')
  return (
    <ResponsiveSidebar
      title={t('menuTitle')}
      railClassName="w-64"
      drawerClassName="w-72"
      rail={<NavList />}
      drawer={(close) => <NavList onSelect={close} />}
    />
  )
}

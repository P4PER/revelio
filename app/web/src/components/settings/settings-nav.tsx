'use client'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { cn } from '@/lib/utils'
import type { SettingsSection } from './types'

// Appearance is the only section that works signed out; showing the others to
// a guest would offer links that bounce straight to /login.
const GUEST_SECTIONS: SettingsSection[] = ['appearance']
const USER_SECTIONS: SettingsSection[] = ['profile', 'appearance', 'email', 'data', 'danger']

function NavList({ isLoggedIn, onSelect }: { isLoggedIn: boolean; onSelect?: () => void }) {
  const t = useTranslations('settings.nav')
  const pathname = usePathname() // locale-stripped, e.g. /settings/email
  const sections = isLoggedIn ? USER_SECTIONS : GUEST_SECTIONS
  const active = sections.find((s) => pathname === `/settings/${s}`) ?? sections[0]
  return (
    <nav className="flex flex-col gap-1">
      {sections.map((s) => {
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

export function SettingsNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations('settings')
  return (
    <ResponsiveSidebar
      title={t('menuTitle')}
      railClassName="w-64"
      drawerClassName="w-72"
      rail={<NavList isLoggedIn={isLoggedIn} />}
      drawer={(close) => <NavList isLoggedIn={isLoggedIn} onSelect={close} />}
    />
  )
}

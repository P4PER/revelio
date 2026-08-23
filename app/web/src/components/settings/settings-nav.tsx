'use client'
import { useTranslations } from 'next-intl'
import { usePathname } from '@/../i18n/navigation'
import { User, Palette, Mail, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { SidebarNavLink } from '@/components/sidebar-nav-link'
import type { SettingsSection } from './types'

// Every settings route requires a signed-in user
const SECTIONS: SettingsSection[] = ['profile', 'appearance', 'email', 'safety']

const ICONS: Record<SettingsSection, LucideIcon> = {
  profile: User,
  appearance: Palette,
  email: Mail,
  safety: ShieldCheck,
}

function NavList({ onSelect }: { onSelect?: () => void }) {
  const t = useTranslations('settings.nav')
  const pathname = usePathname() // locale-stripped, e.g. /settings/email
  const active = SECTIONS.find((s) => pathname === `/settings/${s}`) ?? SECTIONS[0]
  return (
    <nav className="flex flex-col gap-1">
      {SECTIONS.map((s) => (
        <SidebarNavLink
          key={s}
          href={`/settings/${s}`}
          active={s === active}
          icon={ICONS[s]}
          onSelect={onSelect}
        >
          {t(s)}
        </SidebarNavLink>
      ))}
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

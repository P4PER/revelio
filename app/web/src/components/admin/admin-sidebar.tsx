'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, Link } from '@/../i18n/navigation'
import { Tags, Layers, Users, Settings, type LucideIcon } from 'lucide-react'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { cn } from '@/lib/utils'
import {
  ADMIN_SECTION_COOKIE,
  activeSectionHref,
  visibleSections,
  type AdminSectionId,
} from '@/lib/admin-nav'

const ICONS: Record<AdminSectionId, LucideIcon> = {
  'sub-types': Tags,
  sets: Layers,
  users: Users,
  settings: Settings,
}

function NavList({
  isAdmin,
  activeHref,
  onNavigate,
}: {
  isAdmin: boolean
  activeHref: string | undefined
  onNavigate?: () => void
}) {
  const t = useTranslations('admin.nav')
  return (
    <nav className="flex flex-col gap-1">
      {visibleSections(isAdmin).map((s) => {
        const Icon = ICONS[s.id]
        const active = s.href === activeHref
        return (
          <Link
            key={s.id}
            href={s.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/15 font-medium text-primary-ink'
                : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
            {t(s.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}

export function AdminSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const activeHref = activeSectionHref(pathname)
  const t = useTranslations('admin')

  useEffect(() => {
    if (!activeHref) return
    const oneYear = 60 * 60 * 24 * 365
    document.cookie = `${ADMIN_SECTION_COOKIE}=${activeHref}; path=/; max-age=${oneYear}; SameSite=Lax`
  }, [activeHref])

  return (
    <ResponsiveSidebar
      title={t('title')}
      railClassName="w-48"
      drawerClassName="w-64"
      rail={
        <>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('title')}
          </p>
          <NavList isAdmin={isAdmin} activeHref={activeHref} />
        </>
      }
      drawer={(close) => (
        <NavList isAdmin={isAdmin} activeHref={activeHref} onNavigate={close} />
      )}
    />
  )
}

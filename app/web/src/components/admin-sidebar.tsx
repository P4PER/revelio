'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, Link } from '@/../i18n/navigation'
import { Menu, Tags, Layers, Users, Settings, type LucideIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
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
                ? 'bg-primary/15 font-medium text-primary'
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
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!activeHref) return
    const oneYear = 60 * 60 * 24 * 365
    document.cookie = `${ADMIN_SECTION_COOKIE}=${activeHref}; path=/; max-age=${oneYear}; SameSite=Lax`
  }, [activeHref])

  const label = (
    <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {t('title')}
    </p>
  )

  return (
    <>
      {/* Desktop: static sidebar sitting in the gutter (always mounted). */}
      <aside className="hidden w-48 shrink-0 min-[1180px]:block">
        <div className="sticky top-6">
          {label}
          <NavList isAdmin={isAdmin} activeHref={activeHref} />
        </div>
      </aside>

      {/* Mobile: trigger + drawer. */}
      <div className="min-[1180px]:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              {t('title')}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('title')}
            </SheetTitle>
            <NavList
              isAdmin={isAdmin}
              activeHref={activeHref}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

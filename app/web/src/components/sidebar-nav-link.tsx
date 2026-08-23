'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * One row in a `ResponsiveSidebar` nav. Owns the single active treatment every
 * sidebar shares: a soft indigo wash plus a 3px gold left rail (an inset shadow,
 * so it follows the radius and doesn't shift the row).
 *
 * Pass `icon` for a label-with-icon row (settings, admin) and the link lays
 * itself out as a flex row and carries the font weight. Omit it and `children`
 * render as a block, which is what the collection set rows need for their
 * second line of progress bar.
 */
export function SidebarNavLink({
  href,
  active,
  icon: Icon,
  onSelect,
  testId,
  children,
}: {
  href: string
  active: boolean
  icon?: LucideIcon
  onSelect?: () => void
  testId?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      data-testid={testId}
      data-active={active}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-lg px-3 py-2 text-sm transition-colors',
        Icon && 'flex items-center gap-2.5',
        active
          ? 'bg-gradient-to-r from-(--hover-bg) to-transparent shadow-[inset_3px_0_0_var(--color-primary)]'
          : 'hover:bg-(--hover-bg)',
        Icon && (active ? 'font-semibold text-foreground' : 'font-medium'),
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-80" aria-hidden />}
      {children}
    </Link>
  )
}

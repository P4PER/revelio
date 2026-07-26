'use client'

import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared responsive sidebar shell: a static rail that sits in the left gutter on
 * wide screens (>=1024px) and collapses into a left `Sheet` drawer below that.
 * Used by both the admin nav and the collection set nav — the only differences
 * are the rail/drawer content, their widths, and the trigger/title label.
 *
 * `drawer` is a render prop that receives a `close` callback so drawer content
 * can dismiss the sheet when the user makes a selection.
 */
export function ResponsiveSidebar({
  title,
  rail,
  drawer,
  railClassName,
  drawerClassName,
}: {
  title: string
  rail: ReactNode
  drawer: (close: () => void) => ReactNode
  railClassName?: string
  drawerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Desktop: static rail; hangs in the left gutter on wide screens (the pull
          lives on the parent flex row in the consuming layout). */}
      <aside
        className={cn(
          'hidden shrink-0 self-start min-[1024px]:block min-[1024px]:sticky min-[1024px]:top-6',
          railClassName,
        )}
      >
        {rail}
      </aside>

      {/* Mobile: trigger + drawer. */}
      <div className="min-[1024px]:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              {title}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className={cn('p-4', drawerClassName)}>
            <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </SheetTitle>
            {drawer(() => setOpen(false))}
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

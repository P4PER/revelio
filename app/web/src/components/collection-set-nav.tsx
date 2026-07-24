'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CollectionSidebar } from '@/components/collection-sidebar'
import type { SetDTO, SetProgress } from '@revelio/core'

export function CollectionSetNav({
  sets, progress, selected, hrefFor,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
}) {
  const t = useTranslations('collection')
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Desktop: static rail; hangs in the left gutter on wide screens (the pull
          lives on the parent flex row in CollectionView). */}
      <aside className="hidden w-64 shrink-0 self-start min-[1024px]:block min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:max-h-[calc(100vh-3rem)] min-[1024px]:overflow-y-auto">
        <CollectionSidebar sets={sets} progress={progress} selected={selected} hrefFor={hrefFor} />
      </aside>

      {/* Mobile: trigger + drawer. Selecting a set closes the drawer so the
          full-width card grid below is revealed. */}
      <div className="min-[1024px]:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" aria-hidden />
              {t('setsNav')}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-4">
            <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('setsNav')}
            </SheetTitle>
            <CollectionSidebar
              sets={sets} progress={progress} selected={selected} hrefFor={hrefFor}
              onSelect={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

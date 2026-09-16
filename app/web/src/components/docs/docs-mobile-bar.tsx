'use client'

import { useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, PanelLeft } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { DocsNavTree } from '@/components/docs/docs-sidebar'
import { EditPageLink, TocLinks } from '@/components/docs/docs-toc'
import type { TocEntry } from '@/lib/docs/types'

// Both are ghost buttons, so they keep the app's one hover treatment, and both
// are h-11 rather than the primitive's h-9: below 860px these two are the only
// way through the docs, and a finger needs the 44px.
//
// The weight is deliberately uneven. Two outlined pills of equal weight read as
// a form row and draw a second rule under the header's; the drawer is the
// control a phone reader actually needs, so it carries the fill and the
// contents list stays plain text.
const NAV_TRIGGER = 'h-11 min-w-0 flex-1 justify-start gap-2 rounded-full bg-muted px-3.5'
const TOC_TRIGGER = 'ml-auto h-11 shrink-0 gap-1.5 px-2.5 font-normal text-muted-foreground'

/**
 * Closes an overlay when the click landed on a link, and only then. A blanket
 * onClick would also fire on the drawer's own section toggles, so folding a
 * section would dismiss the drawer the reader is still using.
 */
function closeOnLink(close: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('a')) close()
  }
}

/**
 * The bar that replaces, below 1180px, whichever rail the layout has hidden:
 * the map (left, hidden below 860px) behind the page's own name, and this
 * page's headings (right, hidden below 1180px) behind "On this page".
 *
 * It sits above the article rather than pushing it down, which is what the
 * stacked rail used to do - a reader on a phone scrolled past seven nav rows
 * before reaching the heading they came for.
 */
export function DocsMobileBar({
  title,
  toc,
  editUrl,
}: {
  title: string
  toc: readonly TocEntry[]
  editUrl: string | null
}) {
  const t = useTranslations('docs')
  const [navOpen, setNavOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)

  // With no headings the right half is empty, so above 860px - where the map is
  // back in the gutter - the bar would be an empty band. The hub is that page.
  const hiddenFrom = toc.length > 0 ? 'min-[1180px]:hidden' : 'min-[860px]:hidden'

  return (
    <div
      className={`sticky top-0 z-30 -mx-6 -mt-8 mb-6 flex h-14 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur min-[860px]:mx-0 min-[860px]:px-12 ${hiddenFrom}`}
    >
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            aria-label={t('openNav')}
            className={`${NAV_TRIGGER} min-[860px]:hidden`}
          >
            <PanelLeft className="text-primary-ink" aria-hidden />
            <span className="truncate">{title}</span>
            <ChevronDown className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          onClick={closeOnLink(() => setNavOpen(false))}
          className="w-[19rem] gap-5 overflow-y-auto p-4 sm:max-w-[19rem]"
        >
          <SheetTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('railHeading')}
          </SheetTitle>
          <DocsNavTree />
        </SheetContent>
      </Sheet>

      {toc.length > 0 && (
        <Popover open={tocOpen} onOpenChange={setTocOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className={TOC_TRIGGER}>
              {t('onThisPage')}
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            onClick={closeOnLink(() => setTocOpen(false))}
            className="max-h-[70vh] w-72 overflow-y-auto p-2"
          >
            <TocLinks toc={toc} />
            {editUrl && (
              <EditPageLink href={editUrl} className="mt-2 border-t border-border px-3 pt-3" />
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

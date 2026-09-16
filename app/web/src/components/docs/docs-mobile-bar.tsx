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

// Both are ghost buttons at the primitive's own size, so they keep the app's
// one hover treatment and the one control height every other button uses. An
// h-11 pill under the 53px header spent an eighth of a phone screen on chrome
// before a word of the page; at h-9 each control is still far past the 24px
// WCAG asks of a target, and a wide pill is a generous one to hit.
//
// The weight is deliberately uneven. Two pills of equal weight read as a form
// row and draw a second rule under the header's; the drawer is the control a
// phone reader actually needs, so it carries the fill and the contents list
// stays plain text.
//
// Neither is flex-1: stretched, the nav pill paints a slab of fill around a
// one-word title. Each is as wide as its label, and the row's own overflow
// decides the rest - the nav pill takes `shrink` and truncates, the contents
// trigger keeps the primitive's shrink-0 and never loses its chevron. A fixed
// max-width cannot do that: 58% clipped the chevron at 320px in German and
// wasted space everywhere else. `shrink` is not a default here - the Button
// primitive sets shrink-0 on every variant, so it has to be overridden.
const NAV_TRIGGER = 'min-w-0 shrink justify-start gap-2 rounded-full bg-muted px-3'
const TOC_TRIGGER = 'ml-auto shrink-0 gap-1.5 px-2 font-normal text-muted-foreground'

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
      className={`sticky top-0 z-30 -mx-6 -mt-8 mb-6 flex h-12 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur min-[860px]:mx-0 min-[860px]:px-12 ${hiddenFrom}`}
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

'use client'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A facet lane that scrolls sideways instead of wrapping. The nine type chips
// wrap onto three rows on a phone, which spends about a fifth of the screen on
// the filter block; on one scrolling line they spend one row. From md up there
// is room to wrap, so the rail reverts to the plain wrapping row it replaced
// and the desktop layout is unchanged.
export function FilterRail({ className, children, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null)
  // Whether the lane is scrolled hard against each end. Both start true so a
  // lane that fits (the five lesson chips) never wears a fade, and so the
  // first and last chip are never dimmed at rest on one that does scroll.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  function sync(el: HTMLDivElement) {
    // A pixel of slack: fractional layout widths keep scrollLeft from ever
    // landing exactly on either bound.
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // An active chip arriving by link or reload can sit off the right of the
    // lane. Centre it by hand rather than with scrollIntoView, which would
    // also scroll the page vertically. The browser clamps scrollLeft into
    // range, so the first and last chip need no special case. Mount only: a
    // soft navigation does not remount, so toggling a chip never yanks the
    // lane out from under the finger.
    const active = el.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (active) el.scrollLeft = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2
    sync(el)
    // Whether the lane overflows is not fixed at mount: widen the window past
    // md and it wraps instead of scrolling, and a late web font changes the
    // chip widths under it. Without this the fade painted for a phone survives
    // onto the desktop layout, where nothing scrolls to clear it.
    const observer = new ResizeObserver(() => sync(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The fade is what says "the lane continues this way". Skip it entirely
  // while the lane fits: a mask is clipped to the border box, so even a fully
  // opaque one would cut the focus ring off a chip that is not scrollable.
  const fits = atStart && atEnd

  return (
    <div
      ref={ref}
      // Spread first: the lane's own scroll handler, classes and mask are not
      // things a caller should be able to displace by passing a style prop.
      {...props}
      onScroll={(e) => sync(e.currentTarget)}
      // -mr-6 pr-6 bleeds the lane into the page gutter (px-6) so a chip is
      // visibly cut by the screen edge and the fade lands over the gutter
      // rather than over a chip. The other paired margin/padding pairs are
      // visually neutral: they buy the 3px focus ring room inside the border
      // box, which both the scroll container and the mask would otherwise clip.
      // The scroll-p-* pair mirrors those paddings: a snap position is measured
      // from the scrollport, so without it the lane snaps its first chip 6px
      // past the resting scrollLeft and sits permanently half-faded.
      className={cn(
        'no-scrollbar -my-1.5 -ml-1.5 -mr-6 flex min-w-0 snap-x snap-proximity gap-2 overflow-x-auto py-1.5 pr-6 pl-1.5 scroll-pr-6 scroll-pl-1.5 [&>*]:snap-start',
        'md:mr-0 md:flex-wrap md:overflow-visible md:pr-0',
        className,
      )}
      style={
        fits
          ? undefined
          : {
              maskImage: `linear-gradient(to right, transparent 0, #000 ${
                atStart ? '0px' : '2rem'
              }, #000 ${atEnd ? '100%' : 'calc(100% - 2rem)'}, transparent 100%)`,
            }
      }
    >
      {children}
    </div>
  )
}

'use client'
import { useCallback, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// How much of the sheet stays on screen while it is shut. 4.5rem is the handle
// row; the inset is the iOS home indicator. The builder root declares this so
// the browse pane can reserve the same band and keep its last card row
// reachable - the two are siblings, so the value has to live on their ancestor.
//
// The inset belongs here and in the handle's own padding, never in the sheet's
// `bottom`. A fixed element already sits inside Safari's viewport, which stops
// at the top of its toolbar, so adding the inset to `bottom` counts the home
// indicator twice - that is what made the old pane switch float 39px high.
export const DECK_SHEET_PEEK_CLASS =
  '[--deck-sheet-peek:calc(4.5rem+env(safe-area-inset-bottom,0px))]'

// Matches Tailwind's md breakpoint. Only `inert` reads this: everything about
// the layout is decided by CSS, so there is no JS breakpoint to get wrong.
const PHONE_QUERY = '(max-width: 767px)'

// A flick beats distance: past this speed the direction alone decides, so a
// short sharp swipe opens the sheet without dragging it a quarter of the way.
const FLICK_PX_PER_MS = 0.35
const DRAG_FRACTION = 0.25
// Below this the pointer never really moved and the gesture stays a tap.
const TAP_SLOP_PX = 4

/**
 * Which snap position a finished drag lands on. `dy` is the drag distance in
 * px, negative upward; `dt` its duration in ms; `travel` the distance between
 * the two snap positions. Pure, because the gesture that feeds it cannot be
 * reproduced in jsdom but this decision is the part worth testing.
 */
export function snapExpanded(expanded: boolean, dy: number, dt: number, travel: number): boolean {
  const velocity = dt > 0 ? dy / dt : 0
  if (Math.abs(velocity) > FLICK_PX_PER_MS) return velocity < 0
  if (travel > 0 && Math.abs(dy) > travel * DRAG_FRACTION) return dy < 0
  return expanded
}

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// Server snapshot is `false` on purpose: the SSR HTML then carries no `inert`,
// so a desktop render is right from the first byte and a phone corrects itself
// one tick after hydration. Nothing about the layout depends on this, so there
// is no flash either way - only the focus behaviour is JS-corrected.
function useIsPhone() {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  )
}

/**
 * The deck half of the builder. Below md it is a two-snap bottom sheet: shut it
 * peeks a handle carrying the deck's name and card count, dragged or tapped
 * open it covers most of the screen. From md up it is `display: contents`,
 * which generates no box - its position, height and transform all stop
 * applying and its children become items of the builder's own grid. That is
 * what lets one command bar sit inside the sheet on a phone and span the top of
 * the workbench on a desktop, rather than being rendered twice.
 *
 * Deliberately not a dialog. Deck building is the comparison of two lists, so
 * the sheet never traps focus and never hides the browse pane from assistive
 * tech; it is a disclosure, and the body stays mounted while shut so the deck's
 * scroll position and the stats panel's open state survive a trip to browsing.
 * Both panes also render their own Radix dialogs (card detail, filters), which
 * a permanently-open dialog would have nested inside itself.
 *
 * Controlled: the builder owns `expanded` because it has to open the sheet
 * itself when the save-on-login prompt appears inside it.
 */
export function DeckSheet({
  expanded,
  onExpandedChange,
  onScreen = true,
  toggleLabel,
  title,
  subtitle,
  badge,
  children,
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /**
   * Whether the builder itself is still in view. The sheet is fixed to the
   * viewport, so once the page has scrolled past the builder to the footer it
   * has to get out of the way rather than sit on the footer's own controls.
   * Hidden rather than unmounted, so the deck's scroll position and the stats
   * panel's open state survive; only below md, where it is a sheet at all.
   */
  onScreen?: boolean
  /** Accessible name for the handle, which carries the live card count. */
  toggleLabel: string
  title: string
  subtitle: string
  badge?: ReactNode
  children: ReactNode
}) {
  const bodyId = useId()
  const isPhone = useIsPhone()
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ id: number; y: number; at: number; travel: number; moved: boolean } | null>(null)
  // Set by a finished drag so the click that follows it does not toggle again.
  const dragged = useRef(false)
  // Live drag position in px from the expanded rest position. null when at rest.
  const [offset, setOffset] = useState<number | null>(null)

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const sheet = sheetRef.current
    const handle = handleRef.current
    if (!sheet || !handle) return
    // The handle's own height IS the peek, so the gap between the two snap
    // positions needs no parsing of the calc() behind --deck-sheet-peek.
    drag.current = {
      id: event.pointerId,
      y: event.clientY,
      at: performance.now(),
      travel: sheet.offsetHeight - handle.offsetHeight,
      moved: false,
    }
    handle.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      const dy = event.clientY - current.y
      if (!current.moved && Math.abs(dy) < TAP_SLOP_PX) return
      current.moved = true
      const base = expanded ? 0 : current.travel
      setOffset(Math.min(current.travel, Math.max(0, base + dy)))
    },
    [expanded],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      drag.current = null
      setOffset(null)
      if (!current.moved) return
      dragged.current = true
      onExpandedChange(
        snapExpanded(
          expanded,
          event.clientY - current.y,
          performance.now() - current.at,
          current.travel,
        ),
      )
    },
    [expanded, onExpandedChange],
  )

  function handleClick() {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onExpandedChange(!expanded)
  }

  return (
    <>
      {expanded && onScreen && (
        // Tap-anywhere-to-go-back, which is how the state becomes obvious. Not
        // keyboard reachable on purpose: the handle already collapses the sheet
        // and a full-screen tab stop would be worse than none.
        <div
          data-deck-sheet-scrim
          aria-hidden
          onClick={() => onExpandedChange(false)}
          className="fixed inset-0 z-20 bg-background/60 md:hidden"
        />
      )}
      <div
        ref={sheetRef}
        data-deck-sheet
        style={offset === null ? undefined : { transform: `translateY(${offset}px)`, transition: 'none' }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border/60 bg-card',
          'shadow-[0_-14px_40px_rgba(0,0,0,0.35)] transition-transform duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)]',
          'motion-reduce:transition-none md:contents',
          expanded ? 'translate-y-0' : 'translate-y-[calc(100%-var(--deck-sheet-peek))]',
          // max-md only: from md up the sheet has to stay display:contents
          // whatever the page has scrolled past.
          !onScreen && 'max-md:hidden',
        )}
      >
        <button
          ref={handleRef}
          type="button"
          aria-label={toggleLabel}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          // touch-none, or the browser scrolls the page instead of letting the
          // drag through. Only the handle drags, so the deck list below keeps
          // its own scrolling.
          className="relative flex h-[var(--deck-sheet-peek)] w-full shrink-0 cursor-pointer touch-none items-center gap-3 px-4 pb-[env(safe-area-inset-bottom,0px)] text-left md:hidden"
        >
          <span
            aria-hidden
            className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/25"
          />
          <span className="min-w-0 flex-1 pt-1.5">
            <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>
          {badge}
          <ChevronUp
            aria-hidden
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        <div
          id={bodyId}
          // Mounted but off-screen while shut, so it has to leave the tab order
          // and the accessibility tree explicitly. Gated on the viewport because
          // `inert` cannot be breakpoint-scoped and from md up the sheet's
          // `expanded` has no meaning at all.
          inert={isPhone && !expanded}
          className="flex min-h-0 flex-1 flex-col overflow-hidden md:contents"
        >
          {children}
        </div>
      </div>
    </>
  )
}

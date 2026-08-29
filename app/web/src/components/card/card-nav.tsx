'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Hand } from 'lucide-react'
import { Link, useRouter } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import type { Neighbor } from '@/lib/card-neighbors'

const HINT_FLAG = 'revelio.cardNav.hintSeen'
// The @keyframes names behind --animate-chevron-hint / --animate-swipe-hint; the
// hint clears itself when one of these finishes (see onAnimationEnd below), so
// the animation length lives only in CSS - no duplicated duration constant here.
const HINT_ANIMATIONS = new Set(['chevron-hint', 'swipe-hint'])
const SWIPE_THRESHOLD = 50 // px
// Things that own the arrow keys themselves. The keydown listener is on window
// (arrows should work without focusing the card), and Radix menus/dialogs render
// into a portal outside this component, so the guard has to look at the event
// target: without it, arrowing through the open locale switcher would move its
// selection and navigate away from the card at the same time.
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const ARROW_KEY_WIDGETS = [
  'menu', 'menubar', 'listbox', 'combobox', 'dialog', 'alertdialog', 'grid',
  'tablist', 'tree', 'radiogroup', 'slider', 'spinbutton',
].map((r) => `[role="${r}"]`).join(',')

// localStorage throws in some privacy modes; treat any failure as "not seen yet".
function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_FLAG) != null
  } catch {
    return false
  }
}
function markHintSeen() {
  try {
    localStorage.setItem(HINT_FLAG, '1')
  } catch {
    /* storage unavailable - the hint just shows again next time */
  }
}

export function CardNav({
  prev, next, labels, children,
}: {
  prev: Neighbor | null
  next: Neighbor | null
  labels: { prev: string; next: string; hint: string; swipe: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  // Which first-visit hint to play: 'keys' on pointer/hover devices, 'swipe' on
  // touch, null when it should not play (already seen, or reduced-motion).
  const [hintMode, setHintMode] = useState<'keys' | 'swipe' | null>(null)
  const [hintFading, setHintFading] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // One-time first-visit hint, skipped under reduced-motion. The decision reads
  // client-only APIs (matchMedia, localStorage) that don't exist during SSR, so
  // it can only run post-hydration - a legitimate one-shot setState in an effect.
  // Hover is read live here rather than from an SSR-safe snapshot (which would
  // assume desktop): a stale value would mis-pick 'keys' on touch and, because
  // we mark the hint seen, never correct. It clears itself on animationend below.
  useEffect(() => {
    // No neighbors -> this instance can't navigate (e.g. the deck-builder card
    // sheet), so don't show the hint or burn the once-per-browser flag.
    if (!prev && !next) return
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (readHintSeen()) return
    markHintSeen()
    const isTouch = window.matchMedia('(hover: none)').matches
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only reveal
    setHintMode(isTouch ? 'swipe' : 'keys')
  }, [prev, next])

  // When the finite hint animation finishes, start fading the caption out (rather
  // than popping it); it unmounts on transitionend. No timers - durations live in CSS.
  function onAnimationEnd(e: React.AnimationEvent) {
    if (HINT_ANIMATIONS.has(e.animationName)) setHintFading(true)
  }
  function onHintFadeEnd(e: React.TransitionEvent) {
    if (e.propertyName !== 'opacity') return
    setHintMode(null)
    setHintFading(false)
  }

  // Prefetch neighbors so key/swipe navigation is instant.
  useEffect(() => {
    if (prev) router.prefetch(prev.href)
    if (next) router.prefetch(next.href)
  }, [prev, next, router])

  // Arrow-key navigation (ignored while typing, inside a widget that handles
  // arrows itself, once something else has handled the key, or with a modifier).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = e.target instanceof HTMLElement ? e.target : null
      if (el && (TEXT_ENTRY_TAGS.has(el.tagName) || el.isContentEditable)) return
      if (el?.closest(ARROW_KEY_WIDGETS)) return
      if (e.key === 'ArrowLeft' && prev) router.push(prev.href)
      else if (e.key === 'ArrowRight' && next) router.push(next.href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, router])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0 && next) router.push(next.href)
    else if (dx > 0 && prev) router.push(prev.href)
  }

  if (!prev && !next) return <>{children}</>

  // Chevrons stay hidden for mouse users (navigation is via arrow keys / swipe) and
  // reveal only on keyboard focus - an opacity-0 element is still in the a11y tree,
  // so screen readers reach it regardless. No hover reveal over the card art.
  // Asymmetric timing: the resting state carries the slow duration (a smooth
  // 700ms fade-out, matching the caption), while focus-in stays snappy at 150ms.
  // pointer-events-none at rest so the invisible chevron can't be mouse-clicked
  // (which would navigate + flash the focus ring); re-enabled only when it's
  // actually visible (keyboard focus, or during the hint). Keyboard/AT activation
  // goes through the anchor href, unaffected by pointer-events.
  const chevron =
    'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-background/70 text-foreground opacity-0 backdrop-blur ' +
    'transition-opacity duration-700 ease-out hover:bg-background/90 focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:duration-150'
  const scrim = 'pointer-events-none absolute inset-y-0 w-24 opacity-0 transition-opacity group-focus-within:opacity-100'

  return (
    <div
      data-testid="card-nav-frame"
      className="group relative"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
      {prev && (
        <>
          <div className={cn(scrim, 'left-0 rounded-l-xl bg-gradient-to-r from-black/55 to-transparent')} />
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={labels.prev}
            className={cn(chevron, 'left-2', hintMode === 'keys' && !hintFading && 'opacity-100 animate-chevron-hint pointer-events-auto')}
          >
            <Link href={prev.href}><ChevronLeft className="size-5" /></Link>
          </Button>
        </>
      )}
      {next && (
        <>
          <div className={cn(scrim, 'right-0 rounded-r-xl bg-gradient-to-l from-black/55 to-transparent')} />
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={labels.next}
            className={cn(chevron, 'right-2', hintMode === 'keys' && !hintFading && 'opacity-100 animate-chevron-hint pointer-events-auto')}
          >
            <Link href={next.href}><ChevronRight className="size-5" /></Link>
          </Button>
        </>
      )}
      {hintMode === 'swipe' && (
        <Hand
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-9 text-white drop-shadow-lg animate-swipe-hint"
        />
      )}
      {/* First-visit hint caption, overlaid on the bottom of the card over a
          gradient so nothing shifts the layout underneath. */}
      {hintMode && (
        <div
          data-testid="card-nav-hint"
          onTransitionEnd={onHintFadeEnd}
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 rounded-b-xl bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-4 pt-9 text-sm font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] transition-opacity duration-700 ease-out',
            hintFading ? 'opacity-0' : 'opacity-100 animate-hint-in',
          )}
        >
          {hintMode === 'keys' ? (
            <>
              <Kbd className="border border-black/10 bg-white/90 text-neutral-900 shadow-sm"><ArrowLeft className="size-3" /></Kbd>
              <Kbd className="border border-black/10 bg-white/90 text-neutral-900 shadow-sm"><ArrowRight className="size-3" /></Kbd>
              <span>{labels.hint}</span>
            </>
          ) : (
            <span>{labels.swipe}</span>
          )}
        </div>
      )}
    </div>
  )
}

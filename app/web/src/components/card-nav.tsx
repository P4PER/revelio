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
// the animation length lives only in CSS — no duplicated duration constant here.
const HINT_ANIMATIONS = new Set(['chevron-hint', 'swipe-hint'])
const SWIPE_THRESHOLD = 50 // px

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
    /* storage unavailable — the hint just shows again next time */
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
  // it can only run post-hydration — a legitimate one-shot setState in an effect.
  // Hover is read live here (not via useHasHover, whose SSR snapshot assumes
  // desktop — that stale value would mis-pick 'keys' on touch and, because we
  // mark the hint seen, never correct). It clears itself on animationend below.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (readHintSeen()) return
    markHintSeen()
    const isTouch = window.matchMedia('(hover: none)').matches
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only reveal
    setHintMode(isTouch ? 'swipe' : 'keys')
  }, [])

  // When the finite hint animation finishes, start fading the caption out (rather
  // than popping it); it unmounts on transitionend. No timers — durations live in CSS.
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

  // Arrow-key navigation (ignored while typing or with a modifier held).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
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

  const chevron =
    'absolute top-1/2 -translate-y-1/2 rounded-full bg-background/70 text-foreground opacity-0 backdrop-blur ' +
    'transition-opacity hover:bg-background/90 focus-visible:opacity-100 group-hover:opacity-100'
  const scrim = 'pointer-events-none absolute inset-y-0 w-24 opacity-0 transition-opacity group-hover:opacity-100'

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
            className={cn(chevron, 'left-2', hintMode === 'keys' && 'opacity-100 animate-chevron-hint')}
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
            className={cn(chevron, 'right-2', hintMode === 'keys' && 'opacity-100 animate-chevron-hint')}
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
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 rounded-b-xl bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-8 text-xs text-white/90 transition-opacity duration-700 ease-out',
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

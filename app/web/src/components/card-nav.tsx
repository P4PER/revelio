'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useRouter } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import type { Neighbor } from '@/lib/card-neighbors'

const HINT_FLAG = 'revelio.cardNav.hintSeen'
const SWIPE_THRESHOLD = 50 // px

export function CardNav({
  prev, next, labels, children,
}: {
  prev: Neighbor | null
  next: Neighbor | null
  labels: { prev: string; next: string; hint: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  const [hint, setHint] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // One-time first-visit hint, skipped under reduced-motion. The decision reads
  // client-only APIs (matchMedia, localStorage) that don't exist during SSR, so
  // it can only run post-hydration — a legitimate one-shot setState in an effect.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (localStorage.getItem(HINT_FLAG)) return
    localStorage.setItem(HINT_FLAG, '1')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only reveal
    setHint(true)
  }, [])

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
    <div>
      <div
        data-testid="card-nav-frame"
        className="group relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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
              className={cn(chevron, 'left-2', hint && 'opacity-100 motion-safe:animate-pulse')}
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
              className={cn(chevron, 'right-2', hint && 'opacity-100 motion-safe:animate-pulse')}
            >
              <Link href={next.href}><ChevronRight className="size-5" /></Link>
            </Button>
          </>
        )}
      </div>
      {hint && (
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>{labels.hint}</span>
        </p>
      )}
    </div>
  )
}

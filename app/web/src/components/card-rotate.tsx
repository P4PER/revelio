'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { RotateCw } from 'lucide-react'
import { isHorizontal } from '@/components/card-image'
import { cn } from '@/lib/utils'

// Renders a card's single tile image and, for horizontal cards, a hover rotate
// button. Clicking rotates THIS image in place (no duplicate): while rotated the
// image element switches to `position: fixed` at the tile's current rect and spins
// 90° — so it stands upright at its real size, floats over neighbouring cards
// (escaping the tile's overflow-hidden), and the grid never reflows.
export function CardRotate({
  src, alt, orientation, sizes, className, onError,
}: {
  src: string
  alt: string
  orientation?: string | null
  sizes?: string
  className?: string
  onError?: () => void
}) {
  const t = useTranslations('card')
  const wrapRef = useRef<HTMLDivElement>(null)
  // `rect` marks the image as elevated (fixed + z, escaping the tile clip); it
  // stays set through the whole rotate. `rotated` drives the 90° transform.
  // On close we drop `rotated` (animating back) but keep `rect` until the
  // transition ends, then clear it — so the z-index is removed at the END of
  // the rotate, not the start (which would clip the closing animation).
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [rotated, setRotated] = useState(false)
  const elevated = rect !== null
  const rotatable = isHorizontal(orientation)

  useEffect(() => {
    if (!rotated) return
    const close = () => setRotated(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [rotated])

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (rotated) return setRotated(false)
    const el = wrapRef.current
    setRect(el ? el.getBoundingClientRect() : new DOMRect())
    setRotated(true)
  }

  return (
    <>
      {/* Catches clicks outside the rotated card; sits below the lifted image. */}
      {rotated && (
        <div
          data-testid="card-rotate-backdrop"
          className="fixed inset-0 z-40 cursor-default"
          aria-hidden
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRotated(false) }}
        />
      )}

      <div
        ref={wrapRef}
        onClick={rotated ? (e) => { e.preventDefault(); e.stopPropagation(); setRotated(false) } : undefined}
        onTransitionEnd={() => { if (!rotated) setRect(null) }}
        className={cn('transition-transform duration-300', elevated ? 'z-50' : 'absolute inset-0', rotated && 'rotate-90')}
        style={elevated && rect ? { position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined}
      >
        <Image src={src} alt={alt} fill sizes={sizes} onError={onError} className={cn('object-cover', className)} />
      </div>

      {rotatable && (
        <button
          type="button"
          aria-label={rotated ? t('rotateBack') : t('rotate')}
          aria-pressed={rotated}
          onClick={toggle}
          className="absolute top-2 left-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <RotateCw className="size-5" />
        </button>
      )}
    </>
  )
}

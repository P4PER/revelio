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
  const [rect, setRect] = useState<DOMRect | null>(null)
  const open = rect !== null
  const rotatable = isHorizontal(orientation)

  useEffect(() => {
    if (!open) return
    const close = () => setRect(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (open) return setRect(null)
    const el = wrapRef.current
    setRect(el ? el.getBoundingClientRect() : new DOMRect())
  }

  return (
    <>
      {/* Catches clicks outside the rotated card; sits below the lifted image. */}
      {open && (
        <div
          data-testid="card-rotate-backdrop"
          className="fixed inset-0 z-40"
          aria-hidden
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRect(null) }}
        />
      )}

      <div
        ref={wrapRef}
        onClick={open ? (e) => { e.preventDefault(); e.stopPropagation(); setRect(null) } : undefined}
        className={cn('transition-transform duration-300', open ? 'z-50 rotate-90' : 'absolute inset-0')}
        style={open && rect ? { position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined}
      >
        <Image src={src} alt={alt} fill sizes={sizes} onError={onError} className={cn('object-cover', className)} />
      </div>

      {rotatable && (
        <button
          type="button"
          aria-label={open ? t('rotateBack') : t('rotate')}
          aria-pressed={open}
          onClick={toggle}
          className="absolute top-2 left-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <RotateCw className="size-5" />
        </button>
      )}
    </>
  )
}

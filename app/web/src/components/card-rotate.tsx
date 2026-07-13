'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { RotateCw } from 'lucide-react'
import { isHorizontal } from '@/components/card-image'

// For horizontal cards, adds a hover rotate button to the enclosing
// `[data-card-frame]` tile. Clicking floats an upright (landscape) copy of the
// card over the grid via a portal, so it escapes the tile's `overflow-hidden`
// and paints above neighbouring cards without reflowing the grid.
export function CardRotate({
  src, alt, orientation, sizes,
}: {
  src: string
  alt: string
  orientation?: string | null
  sizes?: string
}) {
  const t = useTranslations('card')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const open = rect !== null

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

  if (!isHorizontal(orientation)) return null

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (open) return setRect(null)
    const frame = (e.currentTarget as HTMLElement).closest('[data-card-frame]')
    setRect(frame ? frame.getBoundingClientRect() : new DOMRect(0, 0, 0, 0))
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? t('rotateBack') : t('rotate')}
        aria-pressed={open}
        onClick={toggle}
        data-open={open}
        className="absolute top-2 left-2 z-20 cursor-pointer rounded-full border border-border bg-background/80 p-2.5 text-foreground opacity-0 shadow transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100"
      >
        <RotateCw className="size-5" />
      </button>

      {open && rect && createPortal(
        <>
          <div
            data-testid="card-rotate-backdrop"
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRect(null) }}
          />
          <div
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            className="fixed z-50 aspect-[7/5] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{
              left: rect.left + rect.width / 2,
              top: rect.top + rect.height / 2,
              // Upright landscape card ≈ twice the tile width, centred on the tile.
              width: Math.max(rect.width * 2, 320),
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute top-1/2 left-1/2 h-[140%] w-[71.4286%] -translate-x-1/2 -translate-y-1/2 rotate-90 transition-transform duration-200">
              <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

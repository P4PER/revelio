'use client'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { imageUrl, thumbKey } from '@revelio/core'
import type { ShowcaseCandidate } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { CardImage } from '@/components/card-image'
import type { ScatterSlot } from '@/lib/card-scatter'

const SESSION_KEY = 'revelio.constellation.cast'

// Daily card showcase pinned to the foot of the home hero. Cards are
// server-rendered at rest (positioned + tilted); on first mount per session we
// layer on a one-time "cast" from a spark at the band's base. Drift + hover are
// CSS. Everything degrades to static links with no JS / reduced motion.
export function CardConstellation({
  cards,
  positions,
  imageBase,
}: {
  cards: ShowcaseCandidate[]
  positions: ScatterSlot[]
  imageBase: string
}) {
  const t = useTranslations('home')
  const bandRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const band = bandRef.current
    if (!band) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, '1')

    const rect = band.getBoundingClientRect()
    const sparkX = rect.left + rect.width / 2
    const sparkY = rect.bottom
    band.querySelectorAll<HTMLElement>('[data-card]').forEach((el, i) => {
      if (typeof el.animate !== 'function') return
      const r = el.getBoundingClientRect()
      const dx = sparkX - (r.left + r.width / 2)
      const dy = sparkY - (r.top + r.height / 2)
      const rot = el.dataset.rot ?? '0'
      el.animate(
        [
          {
            transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.35) rotate(0deg)`,
            opacity: 0,
          },
          { transform: `translate(-50%,-50%) rotate(${rot}deg)`, opacity: 1 },
        ],
        { duration: 620, delay: 80 + i * 70, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' },
      )
    })
  }, [])

  if (cards.length === 0) return null

  return (
    <section
      aria-label={t('showcaseLabel')}
      className="pointer-events-none fixed inset-x-0 bottom-0 -z-[5] h-44 overflow-hidden sm:h-48"
    >
      <div ref={bandRef} className="relative mx-auto h-full max-w-5xl">
        {cards.map((card, i) => {
          const pos = positions[i]
          if (!pos) return null
          return (
            <Link
              key={card.id}
              href={`/card/${card.id}`}
              data-card
              data-rot={String(pos.rot)}
              aria-label={card.name}
              className="group pointer-events-auto absolute block w-[76px] sm:w-[84px]"
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: `translate(-50%,-50%) rotate(${pos.rot}deg)`,
              }}
            >
              <span
                className="card-bob block"
                style={
                  { '--bob-dur': `${6 + i * 0.5}s`, '--bob-delay': `${i * 0.4}s` } as React.CSSProperties
                }
              >
                <span className="block overflow-hidden rounded-lg border border-primary/40 shadow-lg shadow-black/40 transition duration-200 group-hover:scale-105 group-hover:border-primary group-focus-visible:scale-105">
                  <CardImage
                    src={imageUrl(imageBase, thumbKey(card.id, card.imageVersion))}
                    alt={card.name}
                    sizes="84px"
                    frameClassName="rounded-lg"
                  />
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

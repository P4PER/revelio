'use client'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { imageUrl, thumbKey } from '@revelio/core'
import type { ShowcaseCandidate } from '@revelio/db'
import { Link } from '@/../i18n/navigation'
import { CardImage } from '@/components/card-image'
import { dayNumber } from '@/lib/random'
import type { ScatterSlot } from '@/lib/card-scatter'

const SEEN_KEY = 'revelio.constellation.day'

// Daily card showcase at the foot of the home hero. Cards are server-rendered
// hidden (opacity 0) so the settled layout never flashes before hydration; on
// mount they fade in, and on the first visit per session a one-time "cast" flies
// them up from a spark at the band's base. Drift + hover are CSS. A <noscript>
// fallback reveals the cards (static links) when JavaScript is disabled.
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
    const items = Array.from(band.querySelectorAll<HTMLElement>('[data-card]'))
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Cast once per daily set: the first time this browser sees today's cards
    // (persists across tabs/reloads via localStorage), then again after they
    // rotate at 00:00 UTC. Day number matches the server's UTC-day card pick.
    const today = String(dayNumber(new Date()))
    const cast =
      !reduce && localStorage.getItem(SEEN_KEY) !== today && typeof items[0]?.animate === 'function'
    if (cast) localStorage.setItem(SEEN_KEY, today)

    const rect = band.getBoundingClientRect()
    const sparkX = rect.left + rect.width / 2
    const sparkY = rect.bottom
    items.forEach((el, i) => {
      el.style.opacity = '1' // reveal (cards are hidden in SSR to avoid a settled-state flash)
      if (!cast) return
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
      className="pointer-events-none relative w-full h-60 overflow-hidden sm:h-72"
    >
      <noscript>
        <style>{`[data-card]{opacity:1!important}`}</style>
      </noscript>
      <div ref={bandRef} className="relative mx-auto h-full w-full max-w-7xl">
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
              className="group pointer-events-auto absolute block w-[120px] opacity-0 transition-opacity duration-500 sm:w-[140px]"
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: `translate(-50%,-50%) rotate(${pos.rot}deg)`,
              }}
            >
              <span
                className="block motion-safe:animate-[card-bob_7s_ease-in-out_infinite]"
                style={{ animationDelay: `${(-i * 0.9).toFixed(2)}s` }}
              >
                <span className="block overflow-hidden rounded-lg border border-primary/40 shadow-lg shadow-black/40 transition duration-200 group-hover:scale-105 group-hover:border-primary group-focus-visible:scale-105">
                  <CardImage
                    src={imageUrl(imageBase, thumbKey(card.id, card.imageVersion))}
                    alt={card.name}
                    sizes="140px"
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

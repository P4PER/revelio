'use client'
import { useState } from 'react'
import { imageKey, imageUrl, artCropKey, LESSONS } from '@revelio/core'
import { cn } from '@/lib/utils'

const LESSON_COLOR = new Map(LESSONS.map((l) => [l.code, l.color]))

function lessonGradient(lessons: string[]): string | undefined {
  const colors = lessons.map((c) => LESSON_COLOR.get(c)).filter(Boolean) as string[]
  if (colors.length === 0) return undefined // container's bg-muted shows through
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]}99)`
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

// Crops the deck's starting-character card image to its illustration band via CSS.
// Falls back to a lesson-colour gradient when there's no starter card or the
// image fails to load. The container controls size/aspect.
export function DeckArt({
  cardId, lessons, imageBase, alt, className, crop = false,
}: {
  cardId: string | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
  crop?: boolean
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(cardId && imageBase) && !errored
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)} style={{ containerType: 'size' }}>
      {showImage ? (
        crop ? (
          // Pre-cropped, upright character art baked at ingest time (Wizard/Witch
          // characters). The asset is already 16:10, so just cover the container.
          <img
            src={imageUrl(imageBase, artCropKey(cardId as string))}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center' }}
            onError={() => setErrored(true)}
          />
        ) : (
          // Character (starter) cards are landscape cards stored sideways in a
          // portrait canvas. We rotate 90° clockwise to stand them upright and
          // zoom onto the character's face (upper-right of the corrected card).
          // The img is sized/translated in container-query-width units so the
          // rotated crop is anchored on the face for a 16:10 container.
          <img
            src={imageUrl(imageBase, imageKey(cardId as string))}
            alt={alt}
            className="absolute left-0 top-0 max-w-none object-cover"
            style={{
              width: '143.3cqw',
              height: '200.0cqw',
              transformOrigin: '0 0',
              transform: 'translate(110.0cqw, -37.5cqw) rotate(90deg)',
            }}
            onError={() => setErrored(true)}
          />
        )
      ) : (
        <div data-slot="deck-art-fallback" className="absolute inset-0" style={{ background: lessonGradient(lessons) }} />
      )}
    </div>
  )
}

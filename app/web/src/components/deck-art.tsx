'use client'
import { useState } from 'react'
import { imageUrl, artCropKey, LESSONS } from '@revelio/core'
import { cn } from '@/lib/utils'

const LESSON_COLOR = new Map(LESSONS.map((l) => [l.code, l.color]))

function lessonGradient(lessons: string[]): string | undefined {
  const colors = lessons.map((c) => LESSON_COLOR.get(c)).filter(Boolean) as string[]
  if (colors.length === 0) return undefined // container's bg-muted shows through
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]}99)`
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

// Shows the deck's starting-character art: a pre-cropped, upright image baked at
// ingest time (Wizard/Witch characters) and served as a 16:10 asset, so we just
// cover the container. Falls back to a lesson-colour gradient when there's no
// starter card, no baked crop for it, or the image fails to load.
export function DeckArt({
  cardId, lessons, imageBase, alt, className,
}: {
  cardId: string | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(cardId && imageBase) && !errored
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {showImage ? (
        <img
          src={imageUrl(imageBase, artCropKey(cardId as string))}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <div data-slot="deck-art-fallback" className="absolute inset-0" style={{ background: lessonGradient(lessons) }} />
      )}
    </div>
  )
}

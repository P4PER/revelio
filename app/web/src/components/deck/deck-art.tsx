'use client'
import { useState } from 'react'
import { imageUrl, artCropKey } from '@revelio/core'
import { cn } from '@/lib/utils'
import { lessonVar } from '@/lib/lesson-colors'

function lessonGradient(lessons: string[]): string | undefined {
  const tints = lessons.map(lessonVar).filter(Boolean) as string[]
  if (tints.length === 0) return undefined // container's bg-muted shows through
  // One lesson still has to read as a gradient, so it fades into a 60% version
  // of itself. That needs color-mix rather than the old `${hex}99`: an alpha
  // cannot be concatenated onto a var(), and the theme tint is a var().
  if (tints.length === 1) {
    return `linear-gradient(135deg, ${tints[0]}, color-mix(in srgb, ${tints[0]} 60%, transparent))`
  }
  return `linear-gradient(135deg, ${tints.join(', ')})`
}

// Shows the deck's starting-character art: a pre-cropped, upright image baked at
// ingest time (Wizard/Witch characters) and served as a 16:10 asset, so we just
// cover the container. Falls back to a lesson-colour gradient when there's no
// starter card, no baked crop for it, or the image fails to load.
export function DeckArt({
  cardId, version, lessons, imageBase, alt, className,
}: {
  cardId: string | null
  version: number | null
  lessons: string[]
  imageBase: string
  alt: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(cardId && imageBase && version != null) && !errored
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {showImage ? (
        // Art crops are pre-sized WebP from the image host and next.config sets
        // images.unoptimized, so <Image> would add markup for zero optimization
        // while complicating the onError fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(imageBase, artCropKey(cardId as string, version as number))}
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

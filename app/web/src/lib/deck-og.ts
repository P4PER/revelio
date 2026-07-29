import sharp from 'sharp'
import { artCropKey, imageUrl, LESSONS, type DeckCardView } from '@revelio/core'

// Fetch budget for the art crop on the crawler hot path — a slow/hanging image
// host aborts and falls back to the default image rather than stalling the render.
const ART_FETCH_TIMEOUT_MS = 5000

// Canonical lesson order (matches the attribute list / lesson-tinted UI), so the
// OG icons are deterministic instead of card-insertion order.
const LESSON_ORDER = new Map(LESSONS.map((l, i) => [l.code, i]))

/**
 * URL of the starting character's art crop, or null when there is no starter,
 * the starter has no art crop, or no image base is configured.
 */
export function pickStarterArt(
  views: Pick<DeckCardView, 'isStartingCharacter' | 'cardId' | 'artCropVersion'>[],
  imageBase: string,
): string | null {
  if (!imageBase) return null
  const starter = views.find((v) => v.isStartingCharacter)
  if (!starter || starter.artCropVersion == null) return null
  return imageUrl(imageBase, artCropKey(starter.cardId, starter.artCropVersion))
}

/**
 * Distinct, non-null lesson codes across a deck's card views, in canonical lesson
 * order (unknown codes sort last) so the rendered icons are deterministic.
 */
export function deckLessonCodes(views: Pick<DeckCardView, 'lesson'>[]): string[] {
  const distinct = [...new Set(views.map((v) => v.lesson).filter((l): l is string => !!l))]
  return distinct.sort(
    (a, b) => (LESSON_ORDER.get(a) ?? Infinity) - (LESSON_ORDER.get(b) ?? Infinity),
  )
}

/**
 * Fetch the art crop and return it as a base64 PNG data URI, or null on any
 * failure. Art crops are stored as WebP, which satori (next/og) cannot decode,
 * so transcode to PNG here. Fetching + transcoding in the route (rather than
 * letting satori fetch inside the render) lets the caller fall back cleanly
 * instead of the image stream throwing.
 */
export async function fetchArtCropPng(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ART_FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    const png = await sharp(input).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

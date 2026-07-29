import { artCropKey, imageUrl, type DeckCardView } from '@revelio/core'

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

/** Distinct, non-null lesson codes across a deck's card views, in first-seen order. */
export function deckLessonCodes(views: Pick<DeckCardView, 'lesson'>[]): string[] {
  return [...new Set(views.map((v) => v.lesson).filter((l): l is string => !!l))]
}

/**
 * Fetch a remote image and return it as a base64 data URI, or null on any
 * failure. Fetching here (rather than letting satori fetch inside the render)
 * lets the caller fall back cleanly instead of the image stream throwing.
 */
export async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

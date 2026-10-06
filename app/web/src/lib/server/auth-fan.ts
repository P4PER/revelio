import 'server-only'
import { unstable_cache } from 'next/cache'
import { imageUrl, thumbKey } from '@revelio/core'
import { getCardViews } from '@revelio/db'
import { getDb } from '@/lib/server/db'

// The two real cards fanned behind the sign-in and register forms, in slot order
// (left, middle). Both are upright Charms spells: most other cards are stored
// sideways (every character, and e.g. Norbert and Golden Snitch), which reads as
// a mistake in a fan. Lumos is a light charm, which suits the "reveal" brand.
export const AUTH_FAN_CARD_IDS: readonly string[] = ['bs-111-wingardium-leviosa', 'poa-71-lumos']

async function loadAuthFanImages(): Promise<string[]> {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  if (!base) return []
  const views = await getCardViews(getDb(), [...AUTH_FAN_CARD_IDS])
  return AUTH_FAN_CARD_IDS.flatMap((id) => {
    const version = views[id]?.imageVersion
    return version == null ? [] : [imageUrl(base, thumbKey(id, version))]
  })
}

// The images only change with an ingest run, so a day is plenty.
const getCachedAuthFanImages = unstable_cache(loadAuthFanImages, ['auth-fan-images'], {
  revalidate: 86_400,
})

/**
 * Thumbnail urls for the auth fan, 0 to 2 of them. The fan is decoration, so a
 * failed read must never fail the sign-in page: any error yields an empty list
 * and the fan draws only the Revelio card.
 */
export async function getAuthFanImages(): Promise<string[]> {
  try {
    return await getCachedAuthFanImages()
  } catch {
    return []
  }
}

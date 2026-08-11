import 'server-only'
import { unstable_cache } from 'next/cache'
import { getDailyShowcaseCandidates, type ShowcaseCandidate } from '@revelio/db'
import { getDb } from '@/lib/db'
import { pickDailyCards } from '@/lib/daily-cards'
import { scatterPositions, type ScatterSlot } from '@/lib/card-scatter'

const SHOWCASE_COUNT = 6 // desktop
const MOBILE_COUNT = 4 // narrow screens — fewer cards so they don't overlap

export type HomeShowcase = {
  cards: ShowcaseCandidate[]
  positions: ScatterSlot[]
  positionsMobile: ScatterSlot[]
}

function loadCandidates(locale: string): Promise<ShowcaseCandidate[]> {
  return getDailyShowcaseCandidates(getDb(), locale)
}

// The candidate pool only changes when cards/images are added (an ingest run),
// so cache it for a day even though the home page is force-dynamic. The daily
// pick + scatter are cheap and computed per request.
const getCachedCandidates = unstable_cache(loadCandidates, ['showcase-candidates'], {
  revalidate: 86_400,
})

export async function getHomeShowcase(locale: string, date: Date): Promise<HomeShowcase> {
  const cards = pickDailyCards(await getCachedCandidates(locale), date, SHOWCASE_COUNT)
  return {
    cards,
    positions: scatterPositions(date, cards.length),
    positionsMobile: scatterPositions(date, Math.min(MOBILE_COUNT, cards.length)),
  }
}

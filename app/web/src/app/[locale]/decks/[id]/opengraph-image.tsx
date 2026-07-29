import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { getDeckForViewer } from '@revelio/db'
import { getDb } from '@/lib/db'
import { ogImageMetadata, ogImageAlt } from '@/lib/seo'
import { pickStarterArt, deckLessonCodes, fetchArtCropPng } from '@/lib/deck-og'
import { renderDeckOgImage, renderDefaultOgImage } from '@/lib/og-image'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

// Rendered per request: reads the deck from the DB and resolves translations, so
// it must not be prerendered at build (no DB / request scope there).
export const dynamic = 'force-dynamic'

// viewerId = null: only public decks resolve, so a private/hidden deck never
// leaks its name or art into an OG image. cache() dedupes generateImageMetadata +
// the render within the image request.
const loadDeck = cache((id: string) => getDeckForViewer(getDb(), id, null))

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  // Next runs this at build time to collect page data, where there is no DB.
  // Guard so a build-time failure degrades to the generic alt; force-dynamic
  // re-runs it per request, where the DB yields the deck name.
  let name: string | null = null
  try {
    name = (await loadDeck(id))?.deck.name?.trim() || null
  } catch {
    name = null
  }
  return ogImageMetadata(name ?? ogImageAlt(locale))
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  // Guarded like generateImageMetadata: a transient DB error falls back to the
  // default branded card rather than throwing a broken image.
  const res = await loadDeck(id).catch(() => null)
  const artUrl = res ? pickStarterArt(res.views, IMAGE_BASE) : null
  // Any missing piece (private/not-found deck, no name, no starter art) falls
  // back to the default branded card — never a broken or leaking image.
  if (!res || !res.deck.name.trim() || !artUrl) return renderDefaultOgImage(locale)
  const artDataUri = await fetchArtCropPng(artUrl)
  if (!artDataUri) return renderDefaultOgImage(locale)
  const t = await getTranslations({ locale, namespace: 'decks' })
  return renderDeckOgImage({
    name: res.deck.name,
    formatLabel: t(`explore.format.${res.deck.format}`),
    lessonCodes: deckLessonCodes(res.views),
    artDataUri,
  })
}

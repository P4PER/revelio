import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { setOgSubtitle, ogImageMetadata, ogImageAlt } from '@/lib/seo'
import { renderBrandOgImage, renderDefaultOgImage } from '@/lib/og-image'

// Rendered per request: this route reads the set from the DB and resolves
// translations, so it must not be prerendered at build (no DB / request scope there).
// The `[code]` segment has no generateStaticParams, so generateImageMetadata below
// runs per request, where the DB read for the alt is available.
export const dynamic = 'force-dynamic'

// Deduped per request: generateImageMetadata + the image render share one DB read.
const loadSet = cache((code: string, locale: string) => getSetByCode(getDb(), code, locale))

// generateImageMetadata (not static exports) so `alt` follows the request locale —
// the localized set name, or the default site alt when the set is missing.
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  // Next still runs this at build time to collect page data, where there is no
  // DB. Guard the read so a build-time failure degrades to the generic localized
  // alt; force-dynamic re-runs it per request, where the DB yields the set name.
  let setName: string | null = null
  try {
    setName = (await loadSet(code, locale))?.name ?? null
  } catch {
    setName = null
  }
  return ogImageMetadata(setName ?? ogImageAlt(locale))
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  const set = await loadSet(code, locale)
  if (!set) return renderDefaultOgImage(locale)
  const t = await getTranslations({ locale, namespace: 'search' })
  return renderBrandOgImage({
    title: set.name,
    subtitle: setOgSubtitle(set.code, t('results', { count: set.cardCount })),
  })
}

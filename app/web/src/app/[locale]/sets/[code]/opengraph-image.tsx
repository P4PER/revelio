import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { setOgSubtitle } from '@/lib/seo'
import { ogImageMetadata, renderBrandOgImage, renderDefaultOgImage } from '@/lib/og-image'

// Rendered per request: the image render reads the set from the DB and resolves
// translations, so it must not be prerendered at build (no DB / request scope there).
export const dynamic = 'force-dynamic'

// Deduped per request: guards against a duplicate DB read if the render needs it.
const loadSet = cache((code: string, locale: string) => getSetByCode(getDb(), code, locale))

// generateImageMetadata (not static exports) so `alt` follows the request locale.
// It runs at build time, so it stays free of request-scoped APIs and DB reads —
// ogImageMetadata resolves `alt` from imported messages by locale.
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale } = await params
  return ogImageMetadata(locale)
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

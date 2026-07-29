import { ogImageMetadata, ogImageAlt } from '@/lib/seo'
import { renderDefaultOgImage } from '@/lib/og-image'

// Rendered per request: the image render resolves translations from the request
// locale, so it must not be prerendered at build (no request scope / no DB there).
export const dynamic = 'force-dynamic'

// generateImageMetadata (not the static `alt`/`size`/`contentType` exports) so the
// image `alt` can follow the request locale. It runs at build time, so it resolves
// `alt` from imported messages via ogImageAlt — no request-scoped APIs here.
export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return ogImageMetadata(ogImageAlt(locale))
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return renderDefaultOgImage(locale)
}

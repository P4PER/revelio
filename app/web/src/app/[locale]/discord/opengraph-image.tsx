import { ogImageMetadata, discordOgImageAlt } from '@/lib/seo'
import { renderDiscordOgImage } from '@/lib/og-image'

// Rendered per request, like the default image: the render resolves translations
// from the request locale, so it must not be prerendered at build.
export const dynamic = 'force-dynamic'

// generateImageMetadata so the alt follows the locale; it runs at build time, so
// the alt comes from imported messages via discordOgImageAlt.
export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return ogImageMetadata(discordOgImageAlt(locale))
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return renderDiscordOgImage(locale)
}

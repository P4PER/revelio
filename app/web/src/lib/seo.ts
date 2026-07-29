import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'
import { BRAND_NAME } from '@/lib/brand'

/** Absolute origin used to resolve relative OG/icon URLs in metadata. */
export const METADATA_BASE = new URL(SITE_URL)

/** Brand midnight — used for the PWA theme color and manifest background. */
export const THEME_COLOR = '#13122A'

/** Standard Open Graph / Twitter large-image card dimensions. */
export const OG_SIZE = { width: 1200, height: 630 } as const

/** Content type emitted by the generated OG image routes. */
export const OG_CONTENT_TYPE = 'image/png'

/**
 * Site-wide default metadata. Per-page `generateMetadata` still overrides
 * title/description/openGraph.images as needed; this only supplies the shared
 * base (metadataBase, title template, OG website + twitter card defaults).
 */
export function buildSiteMetadata(opts: { locale: string; description: string }): Metadata {
  const { locale, description } = opts
  return {
    metadataBase: METADATA_BASE,
    title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
    description,
    openGraph: {
      type: 'website',
      siteName: BRAND_NAME,
      locale,
      title: BRAND_NAME,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: BRAND_NAME,
      description,
    },
  }
}

/**
 * Subtitle line for a set's generated OG image, e.g. "BASE · 116 cards".
 * `cardsLabel` is the already-localized count (e.g. "116 cards" / "116 Karten"),
 * so the subtitle follows the request locale.
 */
export function setOgSubtitle(code: string, cardsLabel: string): string {
  return `${code} · ${cardsLabel}`
}

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'
import { BRAND_NAME } from '@/lib/brand'
import { routing } from '@/../i18n/routing'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

/** Absolute origin used to resolve relative OG/icon URLs in metadata. */
export const METADATA_BASE = new URL(SITE_URL)

/** Brand midnight — used for the PWA theme color and manifest background. */
export const THEME_COLOR = '#13122A'

/** Parchment - the light theme's page background, for the PWA theme color. */
export const THEME_COLOR_LIGHT = '#FBF6EA'

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

// Per-locale OG image alt strings. Read from directly-imported messages rather
// than getTranslations: generateImageMetadata runs at build time (to enumerate
// image ids) with no request scope, so it must not call headers()-backed APIs.
// The parity test (hasOgAltForAllLocales) fails CI if a configured locale has no
// entry here; at runtime ogImageAlt falls back to the default locale, so a missing
// entry degrades to the wrong-language alt rather than throwing.
const OG_IMAGE_ALT: Record<string, string> = {
  en: en.meta.ogImageAlt,
  de: de.meta.ogImageAlt,
}

/** The localized alt text for the default (brand) OG image. */
export function ogImageAlt(locale: string): string {
  return OG_IMAGE_ALT[locale] ?? OG_IMAGE_ALT[routing.defaultLocale]
}

/** True if every configured locale has an OG alt string (guards the map). */
export function hasOgAltForAllLocales(): boolean {
  return routing.locales.every((l) => typeof OG_IMAGE_ALT[l] === 'string')
}

/**
 * The `generateImageMetadata` return shape shared by every OG image route: a
 * single image carrying the standard size/type and the given `alt`.
 */
export function ogImageMetadata(alt: string) {
  return [{ id: 'og', alt, size: OG_SIZE, contentType: OG_CONTENT_TYPE }]
}

/** Clamp an OG image title so a long name can't overflow the 1200x630 canvas. */
export function clampOgTitle(title: string, max = 42): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title
}

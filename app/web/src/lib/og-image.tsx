import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// The image `alt` is resolved here from directly-imported messages rather than
// getTranslations: generateImageMetadata runs at build time (to enumerate image
// ids) with no request scope, so it must not call headers()-backed APIs.
const OG_IMAGE_ALT: Record<string, string> = {
  en: en.meta.ogImageAlt,
  de: de.meta.ogImageAlt,
}

// The wand-and-star mark, inlined from logos/revelio-icon.svg and embedded as a
// data URI so the renderer makes no external image request.
const MARK_SVG = `<svg width="80" height="80" viewBox="16 15 68 68" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-7,2.5)"><polygon points="26.51,72.70 33.49,79.30 65.16,41.10 62.84,38.90" fill="#3B3194"/><line x1="40.12" y1="73.30" x2="32.12" y2="65.74" stroke="#C8881E" stroke-width="2.6" stroke-linecap="round"/><path d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z" fill="#E8B23A"/><path d="M70,26 Q71.6,32.4 78,34 Q71.6,35.6 70,42 Q68.4,35.6 62,34 Q68.4,32.4 70,26 Z" fill="#F6D58B"/><path d="M52,14 Q53.2,18.8 58,20 Q53.2,21.2 52,26 Q50.8,21.2 46,20 Q50.8,18.8 52,14 Z" fill="#E8B23A"/><path d="M78,53.5 Q78.9,57.1 82.5,58 Q78.9,58.9 78,62.5 Q77.1,58.9 73.5,58 Q77.1,57.1 78,53.5 Z" fill="#E8B23A"/></g></svg>`
const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`

let fontPromise: Promise<ArrayBuffer> | null = null
function loadFont(): Promise<ArrayBuffer> {
  if (!fontPromise) {
    fontPromise = fetch(new URL('./fonts/Poppins-SemiBold.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    )
  }
  return fontPromise
}

/**
 * Renders a 1200x630 branded social card: the revelio lockup top-left, a large
 * `title`, and a smaller `subtitle`, on the gold-on-indigo scheme. Shared by the
 * default site OG image and per-set OG images.
 */
export async function renderBrandOgImage(opts: {
  title: string
  subtitle: string
}): Promise<ImageResponse> {
  const font = await loadFont()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #13122A 0%, #181634 60%, #3B3194 160%)',
          fontFamily: 'Poppins',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_DATA_URI} width={64} height={64} alt="" />
          <span style={{ fontSize: 40, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: 76, color: '#FBF3DC', lineHeight: 1.05 }}>{opts.title}</span>
          <span style={{ fontSize: 36, color: '#E8B23A' }}>{opts.subtitle}</span>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
    },
  )
}

/**
 * The `generateImageMetadata` return shape shared by every OG image route: a
 * single image carrying the standard size/type and a locale-resolved `alt`.
 * Build-safe — resolves `alt` from imported messages, not request-scoped APIs.
 */
export function ogImageMetadata(locale: string) {
  const alt = OG_IMAGE_ALT[locale] ?? OG_IMAGE_ALT.en
  return [{ id: 'og', alt, size: OG_SIZE, contentType: OG_CONTENT_TYPE }]
}

/** The default site share card (localized tagline + domain), reused as the
 * fallback wherever a page-specific image has no data to render. */
export async function renderDefaultOgImage(locale: string): Promise<ImageResponse> {
  const t = await getTranslations({ locale, namespace: 'home' })
  return renderBrandOgImage({ title: t('tagline'), subtitle: 'revelio.cards' })
}

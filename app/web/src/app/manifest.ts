import type { MetadataRoute } from 'next'
import { BRAND_NAME } from '@/lib/brand'
import { THEME_COLOR } from '@/lib/seo'
import en from '@/../messages/en.json'

// Not localized: the manifest lives outside the [locale] segment, so it has no
// request locale. The description reuses the English `meta.description` string so
// it stays in sync with the site's default metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: en.meta.description,
    start_url: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: '/revelio-icon-badge-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/revelio-icon-badge-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}

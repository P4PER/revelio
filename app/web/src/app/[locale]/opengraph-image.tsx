import { getTranslations } from 'next-intl/server'
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo'
import { renderBrandOgImage } from '@/lib/og-image'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Revelio — Harry Potter TCG card database'

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'home' })
  return renderBrandOgImage({ title: t('tagline'), subtitle: 'revelio.cards' })
}

import { getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { OG_SIZE, OG_CONTENT_TYPE, setOgSubtitle } from '@/lib/seo'
import { renderBrandOgImage } from '@/lib/og-image'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Revelio card set'

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  const set = await getSetByCode(getDb(), code, locale)
  if (!set) {
    const t = await getTranslations({ locale, namespace: 'home' })
    return renderBrandOgImage({ title: t('tagline'), subtitle: 'revelio.cards' })
  }
  const t = await getTranslations({ locale, namespace: 'search' })
  return renderBrandOgImage({
    title: set.name,
    subtitle: setOgSubtitle(set.code, t('results', { count: set.cardCount })),
  })
}

import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { effectiveImageLang, imageKey, imageUrl } from '@revelio/core'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { getCardById } from '@revelio/db'
import { pickLocalization } from '@/lib/card-view'
import { CardDetail } from '@/components/card-detail'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getSubTypeLabelMap } from '@/lib/subtype-labels'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

// Deduped per request: generateMetadata + the page share one DB round-trip.
const loadCard = cache((id: string, locale: string) => getCardById(getDb(), id, locale))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  const card = await loadCard(id, locale)
  if (!card) return {}
  const { loc } = pickLocalization(card, locale)
  const ogLang = effectiveImageLang((l) => !!card.localizations[l]?.imageFile, locale, card.defaultLanguage)
  if (!loc) return {}
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: `/card/${id}`, locale: l })}`]),
  )
  return {
    title: loc.name,
    description: loc.text ?? undefined,
    alternates: { canonical: `${BASE_URL}${getPathname({ href: `/card/${id}`, locale })}`, languages },
    openGraph: {
      images:
        IMAGE_BASE && ogLang ? [imageUrl(IMAGE_BASE, imageKey(id, ogLang, card.defaultLanguage))] : [],
    },
  }
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const card = await loadCard(id, locale)
  if (!card) notFound()
  const { loc } = pickLocalization(card, locale)
  if (!loc) notFound()
  const session = await getSession()
  const canEdit = hasRequiredRole(session?.user?.role, 'editor')
  const subTypeLabels = await getSubTypeLabelMap(locale)
  return (
    <CardDetail
      card={card}
      locale={locale}
      imageBase={IMAGE_BASE}
      canEdit={canEdit}
      subTypeLabels={subTypeLabels}
    />
  )
}

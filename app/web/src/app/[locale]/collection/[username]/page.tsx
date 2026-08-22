import type { Metadata } from 'next'
import { PublicCollection } from '@/components/collection/public-collection'

// A named user's collection is personal data, not catalog content — keep it out
// of search indexes (robots.txt intentionally does not enumerate this route).
export const metadata: Metadata = { robots: { index: false } }

export default async function PublicCollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, username } = await params
  return <PublicCollection locale={locale} identifier={username} searchParams={await searchParams} />
}

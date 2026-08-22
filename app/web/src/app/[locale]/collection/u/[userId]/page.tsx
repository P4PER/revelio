import type { Metadata } from 'next'
import { PublicCollection } from '@/components/collection/public-collection'

// A user's collection is personal data, not catalog content — keep it out of
// search indexes (robots.txt intentionally does not enumerate this route).
export const metadata: Metadata = { robots: { index: false } }

// Fallback share route for users without a username (usernames are nullable).
export default async function PublicCollectionByIdPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; userId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, userId } = await params
  return <PublicCollection locale={locale} identifier={userId} searchParams={await searchParams} />
}

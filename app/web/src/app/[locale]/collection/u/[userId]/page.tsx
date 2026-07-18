import { PublicCollection } from '@/components/public-collection'

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

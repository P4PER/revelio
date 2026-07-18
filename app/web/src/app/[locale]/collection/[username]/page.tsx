import { PublicCollection } from '@/components/public-collection'

export default async function PublicCollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, username } = await params
  return <PublicCollection locale={locale} identifier={username} searchParams={await searchParams} />
}

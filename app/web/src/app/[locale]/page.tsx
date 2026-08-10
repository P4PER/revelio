import type { Metadata } from 'next'
import { useLocale, useTranslations } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { SetDTO } from '@revelio/core'
import { routing } from '@/../i18n/routing'
import { getPathname, Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { byReleaseDate } from '@/lib/set-sort'
import { BRAND_NAME } from '@/lib/brand'
import { SITE_URL as BASE_URL } from '@/lib/site'
import { pickDailyExamples } from '@/lib/daily-examples'
import { getHomeShowcase, type HomeShowcase } from '@/lib/showcase'
import { HomeSearch } from '@/components/home-search'
import { CardConstellation } from '@/components/card-constellation'
import { StarField } from '@/components/star-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: '/', locale: l })}`]),
  )
  languages['x-default'] = `${BASE_URL}${getPathname({ href: '/', locale: routing.defaultLocale })}`

  return {
    title: { absolute: `${BRAND_NAME}: ${t('titleSuffix')}` },
    description: t('tagline'),
    alternates: { canonical: `${BASE_URL}${getPathname({ href: '/', locale })}`, languages },
  }
}

export function Home({
  recentSets = [],
  showcase,
  imageBase,
}: {
  recentSets?: SetDTO[]
  showcase?: HomeShowcase
  imageBase?: string
}) {
  const t = useTranslations('home')
  const locale = useLocale()
  const examples = pickDailyExamples(locale, new Date())
  return (
    <>
      <main className="relative mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <StarField />
      <h1 className="text-3xl leading-tight text-muted-foreground sm:text-4xl">
        {t.rich('heading', {
          b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
        })}
      </h1>
      <HomeSearch placeholder={t('searchPlaceholder')} />

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {examples.map((ex) => (
          <Badge key={ex} asChild variant="outline" className="cursor-pointer font-normal">
            <Link href={`/search?q=${encodeURIComponent(ex)}`}>{ex}</Link>
          </Badge>
        ))}
        <Button variant="outline" size="sm" asChild>
          <Link href="/random">{t('randomCard')}</Link>
        </Button>
      </div>

      {recentSets.length > 0 && (
        <ul className="mt-10 space-y-1.5 text-sm">
          {recentSets.map((set, i) => (
            <li key={set.code} className="flex items-center justify-center gap-2">
              {i < 2 && (
                <Badge className="bg-primary px-1.5 py-0 text-[10px] font-semibold uppercase text-primary-foreground">
                  {t('new')}
                </Badge>
              )}
              <Link
                href={`/sets/${set.code}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {set.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      </main>
      {showcase && imageBase && showcase.cards.length > 0 && (
        <CardConstellation
          cards={showcase.cards}
          positions={showcase.positions}
          imageBase={imageBase}
        />
      )}
    </>
  )
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [sets, showcase] = await Promise.all([
    listSets(getDb(), locale),
    getHomeShowcase(locale, new Date()),
  ])
  const recentSets = [...sets].sort((a, b) => byReleaseDate(b, a)).slice(0, 5)
  const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  return <Home recentSets={recentSets} showcase={showcase} imageBase={imageBase} />
}

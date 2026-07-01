import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [
      l,
      `${BASE_URL}${getPathname({ href: '/', locale: l })}`,
    ]),
  )
  // x-default points at the default-locale page (Google hreflang guidance).
  languages['x-default'] = `${BASE_URL}${getPathname({ href: '/', locale: routing.defaultLocale })}`

  const canonical = `${BASE_URL}${getPathname({ href: '/', locale })}`

  return {
    alternates: {
      canonical,
      languages,
    },
  }
}

export default function Home() {
  const t = useTranslations('home')
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="font-sans text-5xl font-semibold text-primary">{t('title')}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t('tagline')}</p>
    </main>
  )
}

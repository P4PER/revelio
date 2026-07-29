import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { buildSiteMetadata, THEME_COLOR } from '@/lib/seo'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Toaster } from '@/components/ui/sonner'
import { SearchHotkey } from '@/components/search-hotkey'
import '../globals.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('meta')
  return buildSiteMetadata({ locale, description: t('description') })
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const messages = await getMessages()
  return (
    <html lang={locale} className={`${poppins.variable} dark`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Header + content fill at least the viewport, so the footer sits
              just below the fold and only appears once you scroll down. */}
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
          </div>
          <SiteFooter />
          <Toaster />
          <SearchHotkey />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

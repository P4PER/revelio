import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { buildSiteMetadata, THEME_COLOR, THEME_COLOR_LIGHT } from '@/lib/seo'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { Toaster } from '@/components/ui/sonner'
import { SearchHotkey } from '@/components/search/search-hotkey'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
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

// Browser chrome follows the OS setting. An explicit cookie choice is not
// reflected here: themeColor is static metadata, and the media-query pair is
// right for the overwhelmingly common case.
export function generateViewport(): Viewport {
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR },
    ],
  }
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
  // The layout is already dynamic (getSession), so reading a cookie is free.
  // No attribute means "follow the OS" - globals.css handles that in CSS, so
  // the first painted frame is correct without a blocking inline script.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html
      lang={locale}
      className={poppins.variable}
      data-theme={theme === 'system' ? undefined : theme}
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Header + content fill at least the viewport, so the footer sits
              just below the fold and only appears once you scroll down. */}
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
          </div>
          <SiteFooter />
          <Toaster theme={theme} />
          <SearchHotkey />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

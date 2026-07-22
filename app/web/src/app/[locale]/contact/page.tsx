import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ContactForm } from '@/components/contact-form'
import { getSession } from '@/lib/session'

// Rendered per request so the submit-timing token is fresh and never statically cached.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('contact')
  return { title: t('metaTitle') }
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('contact')

  // Prefill for signed-in users so they don't retype what we already know. Mirrors
  // the app's display-name convention (displayUsername ?? username).
  const user = (await getSession())?.user
  const defaultName = user?.displayUsername ?? user?.username ?? ''
  const defaultEmail = user?.email ?? ''

  return (
    <main className="relative mx-auto max-w-2xl px-6 pt-16 pb-20">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t('titlePrefix')} <span className="text-primary">{t('titleAccent')}</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
      </div>

      <div className="mt-10">
        {/* A fresh per-request submit-timing token. This page is force-dynamic, so it
            renders once per request — Date.now() is intentional here (no re-render
            instability in a server component), which the purity rule can't infer. */}
        {/* eslint-disable-next-line react-hooks/purity */}
        <ContactForm renderedAt={Date.now()} defaultName={defaultName} defaultEmail={defaultEmail} />
      </div>
    </main>
  )
}

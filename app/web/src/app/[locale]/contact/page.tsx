import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ContactForm } from '@/components/contact-form'

// Rendered per request so the submit-timing token is fresh and never statically cached.
export const dynamic = 'force-dynamic'

// The four HP TCG Lessons with a canonical colour — reused from the /about hero as
// the shared "family" divider for these secondary pages.
const LESSON_RULE =
  'linear-gradient(90deg, transparent, #0069A9 20%, #00A661 40%, #E2AE37 60%, #BC3E4D 80%, transparent)'

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
  return (
    <main className="relative mx-auto max-w-xl px-6 pt-16 pb-20">
      {/* Soft gold reveal-glow behind the title. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-6 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/15 blur-[90px]"
      />

      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t('titlePrefix')} <span className="text-primary">{t('titleAccent')}</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
        <div
          aria-hidden
          className="mt-8 h-px w-56 max-w-[75%]"
          style={{ backgroundImage: LESSON_RULE }}
        />
      </div>

      <div className="mt-10">
        {/* A fresh per-request submit-timing token. This page is force-dynamic, so it
            renders once per request — Date.now() is intentional here (no re-render
            instability in a server component), which the purity rule can't infer. */}
        {/* eslint-disable-next-line react-hooks/purity */}
        <ContactForm renderedAt={Date.now()} />
      </div>
    </main>
  )
}

import type { Metadata } from 'next'
import type { MDXContent } from 'mdx/types'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { ProseShell } from '@/components/legal/prose-shell'
import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'
import { getCachedSiteSettings } from '@/lib/server/site-settings'
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms'

type TermsContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
}

type TermsPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The operator values reach the MDX as props, where <OperatorDetails> reads
 * them from `props`.
 */
export function TermsContent({ Document, operatorName, operatorAddress, contactEmail }: TermsContentProps) {
  const t = useTranslations('terms')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
      />
      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('effective', { date: TERMS_EFFECTIVE_DATE })}
      </p>
    </ProseShell>
  )
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    LEGAL_DOCUMENTS.terms[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <TermsContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
    />
  )
}

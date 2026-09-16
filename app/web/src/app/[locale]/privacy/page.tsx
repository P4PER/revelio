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

type PrivacyContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
}

type PrivacyPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

const LAST_UPDATED = new Date('2026-09-16T00:00:00Z')

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The site settings reach the MDX as props, where the legal components read
 * them from `props`.
 */
export function PrivacyContent({
  Document,
  operatorName,
  operatorAddress,
  contactEmail,
  hostingProvider,
}: PrivacyContentProps) {
  const t = useTranslations('privacy')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
        hostingProvider={hostingProvider}
      />
      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('lastUpdated', { date: LAST_UPDATED })}
      </p>
    </ProseShell>
  )
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    LEGAL_DOCUMENTS.privacy[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <PrivacyContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      hostingProvider={settings?.hostingProvider ?? null}
    />
  )
}

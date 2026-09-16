import type { Metadata } from 'next'
import type { MDXContent } from 'mdx/types'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { ProseShell } from '@/components/legal/prose-shell'
import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { BRAND_NAME } from '@/lib/brand'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

type ImprintContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  responsiblePerson: string | null
}

type ImprintPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('imprint')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The site settings reach the MDX as props, where the legal components read
 * them from `props`.
 */
export function ImprintContent({
  Document,
  operatorName,
  operatorAddress,
  contactEmail,
  responsiblePerson,
}: ImprintContentProps) {
  const t = useTranslations('imprint')
  const tf = useTranslations('footer')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
        responsiblePerson={responsiblePerson}
      />
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/70">
        {tf('disclaimer', { brand: BRAND_NAME })}
      </p>
    </ProseShell>
  )
}

export default async function ImprintPage({ params }: ImprintPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    LEGAL_DOCUMENTS.imprint[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <ImprintContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      responsiblePerson={settings?.responsiblePerson ?? null}
    />
  )
}

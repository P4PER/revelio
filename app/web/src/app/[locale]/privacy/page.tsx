import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { ProseShell } from '@/components/legal/prose-shell'
import { ContactEmail } from '@/components/legal/contact-email'
import { getCachedSiteSettings } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

const LAST_UPDATED = new Date('2026-07-22T00:00:00Z')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('privacy')
  return { title: t('metaTitle') }
}

export function PrivacyContent({
  operatorName,
  operatorAddress,
  contactEmail,
  hostingProvider,
}: {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
}) {
  const t = useTranslations('privacy')
  const nc = t('notConfigured')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      <h2>{t('controllerTitle')}</h2>
      <p>{t('controllerIntro')}</p>
      <p className="whitespace-pre-line">{`${operatorName ?? nc}\n${operatorAddress ?? nc}`}</p>
      <p>
        {t('controllerContactLabel')} <ContactEmail email={contactEmail} fallback={nc} />
      </p>
      <p>{t('dpoBody')}</p>

      <h2>{t('basesTitle')}</h2>
      <p>{t('basesBody')}</p>
      <p>{t('sslBody')}</p>

      <h2>{t('processingTitle')}</h2>
      <h3>{t('accountTitle')}</h3>
      <p>{t('accountBody')}</p>
      <h3>{t('sessionTitle')}</h3>
      <p>{t('sessionBody')}</p>
      <h3>{t('logsTitle')}</h3>
      <p>{t('logsBody')}</p>
      <h3>{t('contentTitle')}</h3>
      <p>{t('contentBody')}</p>
      <h3>{t('emailTitle')}</h3>
      <p>{t('emailBody')}</p>
      <h3>{t('contactTitle')}</h3>
      <p>{t('contactBody')}</p>

      <h2>{t('cookiesTitle')}</h2>
      <p>{t('cookiesBody')}</p>

      <h2>{t('recipientsTitle')}</h2>
      <p>{t('recipientsBody')}</p>
      <p>
        {t('recipientsHostLabel')} {hostingProvider ?? nc}
      </p>

      <h2>{t('transfersTitle')}</h2>
      <p>{t('transfersBody')}</p>

      <h2>{t('retentionTitle')}</h2>
      <p>{t('retentionBody')}</p>

      <h2>{t('rightsTitle')}</h2>
      <p>{t('rightsIntro')}</p>
      <ul>
        <li>{t('rightsAccess')}</li>
        <li>{t('rightsRectify')}</li>
        <li>{t('rightsErase')}</li>
        <li>{t('rightsRestrict')}</li>
        <li>{t('rightsPort')}</li>
      </ul>
      <p>{t('rightsContact')}</p>

      <h2>{t('objectionTitle')}</h2>
      <p>{t('objectionBody')}</p>

      <h2>{t('withdrawTitle')}</h2>
      <p>{t('withdrawBody')}</p>

      <h2>{t('complaintTitle')}</h2>
      <p>{t('complaintBody')}</p>

      <h2>{t('automatedTitle')}</h2>
      <p>{t('automatedBody')}</p>

      <h2>{t('provisionTitle')}</h2>
      <p>{t('provisionBody')}</p>

      <h2>{t('changesTitle')}</h2>
      <p>{t('changesBody')}</p>

      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('lastUpdated', { date: LAST_UPDATED })}
      </p>
    </ProseShell>
  )
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return (
    <PrivacyContent
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      hostingProvider={settings?.hostingProvider ?? null}
    />
  )
}

import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { ProseShell } from '@/components/legal/prose-shell'
import { ContactEmail } from '@/components/legal/contact-email'
import { getCachedSiteSettings } from '@/lib/site-settings'
import { BRAND_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('imprint')
  return { title: t('metaTitle') }
}

export function ImprintContent({
  operatorName,
  operatorAddress,
  contactEmail,
  responsiblePerson,
}: {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  responsiblePerson: string | null
}) {
  const t = useTranslations('imprint')
  const tf = useTranslations('footer')
  const nc = t('notConfigured')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>

      <h2>{t('providerTitle')}</h2>
      <p className="whitespace-pre-line">{`${operatorName ?? nc}\n${operatorAddress ?? nc}`}</p>

      <h2>{t('contactTitle')}</h2>
      <p>
        {t('contactLabel')} <ContactEmail email={contactEmail} fallback={nc} />
      </p>

      {responsiblePerson && (
        <>
          <h2>{t('responsibleTitle')}</h2>
          <p className="whitespace-pre-line">{responsiblePerson}</p>
        </>
      )}

      <h2>{t('disputeTitle')}</h2>
      <p>{t('disputeBody')}</p>

      <h2>{t('liabilityContentTitle')}</h2>
      <p>{t('liabilityContentBody')}</p>
      <h2>{t('liabilityLinksTitle')}</h2>
      <p>{t('liabilityLinksBody')}</p>
      <h2>{t('copyrightTitle')}</h2>
      <p>{t('copyrightBody')}</p>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/70">
        {tf('disclaimer', { brand: BRAND_NAME })}
      </p>
    </ProseShell>
  )
}

export default async function ImprintPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return (
    <ImprintContent
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      responsiblePerson={settings?.responsiblePerson ?? null}
    />
  )
}

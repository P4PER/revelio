import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ProseShell } from '@/components/legal/prose-shell'
import { getCachedSiteSettings } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('about')
  return { title: t('metaTitle') }
}

export function AboutContent({ githubUrl }: { githubUrl: string | null }) {
  const t = useTranslations('about')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <p>{t('fanProject')}</p>
      {githubUrl && (
        <p>
          {t.rich('openSource', {
            link: (chunks) => (
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                {chunks}
              </a>
            ),
          })}
        </p>
      )}
      <h2>{t('creditsTitle')}</h2>
      <p>{t('credits')}</p>
      <h2>{t('exploreTitle')}</h2>
      <p>
        {t.rich('explore', {
          sets: (chunks) => <Link href="/sets">{chunks}</Link>,
          random: (chunks) => <Link href="/random">{chunks}</Link>,
        })}
      </p>
    </ProseShell>
  )
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return <AboutContent githubUrl={settings?.githubUrl ?? null} />
}

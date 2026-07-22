import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { loadSiteSettings } from '@/lib/site-settings'
import { SiteSettingsForm } from '@/components/site-settings-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('adminSettings')
  return { title: t('title') }
}

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const t = await getTranslations('adminSettings')
  const settings = await loadSiteSettings()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <SiteSettingsForm initial={settings} />
    </div>
  )
}

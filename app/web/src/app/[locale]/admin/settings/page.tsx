import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/server/session'
import { hasRequiredRole } from '@/lib/roles'
import { loadSiteSettings } from '@/lib/server/site-settings'
import { SiteSettingsForm } from '@/components/admin/site-settings-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('adminSettings')
  return { title: t('title') }
}

export default async function AdminSettingsPage() {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const t = await getTranslations('adminSettings')
  const settings = await loadSiteSettings()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-heading">{t('title')}</h1>
      <SiteSettingsForm initial={settings} />
    </div>
  )
}

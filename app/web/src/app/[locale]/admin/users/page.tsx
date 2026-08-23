import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'
import { hasRequiredRole } from '@/lib/roles'
import { listUsersForAdmin } from '@revelio/db'
import { AdminUsersTable } from '@/components/admin/admin-users-table'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const t = await getTranslations('admin.users')
  const users = await listUsersForAdmin(getDb())

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-heading">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </div>
      <AdminUsersTable users={users} />
    </div>
  )
}

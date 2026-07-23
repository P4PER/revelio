import { cookies } from 'next/headers'
import { setRequestLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { ADMIN_SECTION_COOKIE, resolveAdminSection } from '@/lib/admin-nav'

export const dynamic = 'force-dynamic'

export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  const isAdmin = hasRequiredRole(session?.user?.role, 'admin')
  const target = resolveAdminSection(cookieStore.get(ADMIN_SECTION_COOKIE)?.value, isAdmin)
  redirect({ href: target, locale })
}

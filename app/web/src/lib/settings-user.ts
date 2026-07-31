import 'server-only'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import type { SettingsUser } from '@/components/settings/types'

/**
 * The current user shaped for the settings panes. Redirects to /login when
 * signed out — call it at the top of every settings page (Next.js auth guidance
 * is to check auth in the page/data layer, not only in a layout).
 */
export async function requireSettingsUser(): Promise<SettingsUser> {
  const session = await getSession()
  if (!session?.user) redirect({ href: '/login', locale: await getLocale() })
  const u = session!.user
  return {
    id: u.id,
    username: u.username ?? null,
    displayUsername: u.displayUsername ?? null,
    email: u.email,
    role: u.role ?? null,
    createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
  }
}

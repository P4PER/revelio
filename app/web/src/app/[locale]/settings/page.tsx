import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/session'
import { SettingsShell } from '@/components/settings/settings-shell'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

export default async function SettingsPage() {
  const session = await getSession()
  const locale = await getLocale()
  if (!session?.user) redirect({ href: '/login', locale })
  const u = session!.user
  return (
    <SettingsShell
      user={{
        id: u.id,
        username: u.username ?? null,
        displayUsername: u.displayUsername ?? null,
        email: u.email,
        role: u.role ?? null,
        createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
      }}
    />
  )
}

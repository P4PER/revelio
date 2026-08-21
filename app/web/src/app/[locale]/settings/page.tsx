import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { requireSettingsUser } from '@/lib/server/settings-user'

export default async function SettingsIndexPage() {
  await requireSettingsUser('/settings/profile') // signed-out → straight to /login (no double bounce)
  const locale = await getLocale()
  redirect({ href: '/settings/profile', locale })
}

import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { requireSettingsUser } from '@/lib/settings-user'

export default async function SettingsIndexPage() {
  await requireSettingsUser() // signed-out → straight to /login (no double bounce)
  const locale = await getLocale()
  redirect({ href: '/settings/profile', locale })
}

import { cookies } from 'next/headers'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
import { AppearanceForm } from '@/components/settings/appearance-form'
import { requireSettingsUser } from '@/lib/settings-user'

export const dynamic = 'force-dynamic'

export default async function AppearanceSettingsPage() {
  await requireSettingsUser('/settings/appearance')
  const current = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return <AppearanceForm current={current} />
}

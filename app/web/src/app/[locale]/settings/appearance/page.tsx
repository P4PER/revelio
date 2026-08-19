import { cookies } from 'next/headers'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
import { AppearanceForm } from '@/components/settings/appearance-form'

export const dynamic = 'force-dynamic'

// Deliberately does NOT call requireSettingsUser: theme is a device preference,
// and gating it would leave signed-out visitors unable to override their OS.
export default async function AppearanceSettingsPage() {
  const current = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return <AppearanceForm current={current} />
}

import { requireSettingsUser } from '@/lib/server/settings-user'
import { EmailPane } from '@/components/settings/email-pane'

export default async function EmailSettingsPage() {
  return <EmailPane user={await requireSettingsUser('/settings/email')} />
}

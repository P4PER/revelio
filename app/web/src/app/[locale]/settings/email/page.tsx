import { requireSettingsUser } from '@/lib/settings-user'
import { EmailPane } from '@/components/settings/email-pane'

export default async function EmailSettingsPage() {
  return <EmailPane user={await requireSettingsUser()} />
}

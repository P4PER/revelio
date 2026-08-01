import { requireSettingsUser } from '@/lib/settings-user'
import { DangerPane } from '@/components/settings/danger-pane'

export default async function DangerSettingsPage() {
  return <DangerPane user={await requireSettingsUser()} />
}

import { requireSettingsUser } from '@/lib/server/settings-user'
import { DangerPane } from '@/components/settings/danger-pane'

export default async function DangerSettingsPage() {
  return <DangerPane user={await requireSettingsUser('/settings/danger')} />
}

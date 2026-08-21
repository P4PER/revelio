import { requireSettingsUser } from '@/lib/server/settings-user'
import { DataPane } from '@/components/settings/data-pane'

export default async function DataSettingsPage() {
  return <DataPane user={await requireSettingsUser('/settings/data')} />
}

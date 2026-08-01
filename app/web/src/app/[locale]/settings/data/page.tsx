import { requireSettingsUser } from '@/lib/settings-user'
import { DataPane } from '@/components/settings/data-pane'

export default async function DataSettingsPage() {
  return <DataPane user={await requireSettingsUser()} />
}

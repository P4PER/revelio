import { requireSettingsUser } from '@/lib/settings-user'
import { ProfilePane } from '@/components/settings/profile-pane'

export default async function ProfileSettingsPage() {
  return <ProfilePane user={await requireSettingsUser('/settings/profile')} />
}

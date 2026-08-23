import { requireSettingsUser } from '@/lib/server/settings-user'
import { ExportDataSection } from '@/components/settings/export-data-section'
import { DeleteAccountSection } from '@/components/settings/delete-account-section'

export default async function SafetySettingsPage() {
  const user = await requireSettingsUser('/settings/safety')
  return (
    <div className="flex flex-col gap-6">
      <ExportDataSection user={user} />
      <DeleteAccountSection user={user} />
    </div>
  )
}

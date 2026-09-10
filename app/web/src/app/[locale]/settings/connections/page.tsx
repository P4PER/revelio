import { getLinkedProviderIds } from '@revelio/db'
import { requireSettingsUser } from '@/lib/server/settings-user'
import { getDb } from '@/lib/server/db'
import { discordLinkingConfigured } from '@/lib/server/auth'
import { ConnectionsPane } from '@/components/settings/connections-pane'

export default async function ConnectionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireSettingsUser('/settings/connections')
  const [providers, { error }] = await Promise.all([
    getLinkedProviderIds(getDb(), user.id),
    searchParams,
  ])
  return (
    <ConnectionsPane
      linked={providers.includes('discord')}
      configured={discordLinkingConfigured}
      linkError={typeof error === 'string' ? error : undefined}
    />
  )
}

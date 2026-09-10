import { getLinkedProviderIds } from '@revelio/db'
import { requireSettingsUser } from '@/lib/server/settings-user'
import { getDb } from '@/lib/server/db'
import { discordLinkingConfigured } from '@/lib/server/auth'
import { getDiscordAccountName } from '@/lib/server/discord-oauth'
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
  const linked = providers.includes('discord')
  // Sequential on purpose: there is no name to look up until we know a Discord
  // account is attached, and the lookup answers null rather than throwing.
  const accountName = linked ? await getDiscordAccountName(user.id) : null
  return (
    <ConnectionsPane
      linked={linked}
      configured={discordLinkingConfigured}
      accountName={accountName}
      linkError={typeof error === 'string' ? error : undefined}
    />
  )
}
